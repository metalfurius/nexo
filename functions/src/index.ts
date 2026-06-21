import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'

initializeApp()

type SearchType = 'watch' | 'game' | 'book' | 'anime' | 'manga' | 'manhwa' | 'animeManga' | 'any'
type ItemType = 'game' | 'book' | 'movie' | 'series' | 'anime' | 'manga' | 'manhwa' | 'comic' | 'other'
type ProgressUnit = 'episodes' | 'chapters' | 'pages' | 'hours' | 'volumes' | 'percent' | 'items'

interface ExternalCandidate {
  id: string
  title: string
  type: string
  source: 'openLibrary' | 'anilist'
  sourceId: string
  overview?: string
  posterUrl?: string
  releaseYear?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
  genres: string[]
  searchAliases?: string[]
  externalRefs: Record<string, string>
  createdAt: string
}

interface PublicCatalogItem {
  id: string
  title: string
  type: ItemType
  description?: string
  releaseYear?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
  genres: string[]
  tags: string[]
  moodTags: string[]
  searchAliases?: string[]
  externalRefs: Record<string, string>
  posterUrl?: string
  searchTokens: string[]
  canonicalKey: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  archivedAt?: string
  autoIngestedAt?: string
  demandCount?: number
  lastDemandAt?: string
}

export const searchExternal = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    await assertWithinRateLimit(request.auth.uid, 'searchExternal', 30)

    const query = String(request.data?.query ?? '').trim()
    const type = String(request.data?.type ?? 'any') as SearchType
    if (query.length < 2) {
      throw new HttpsError('invalid-argument', 'La busqueda necesita al menos 2 caracteres.')
    }

    const candidates = await searchByType(query, type)
    return { candidates: candidates.slice(0, 8), ingestedItems: [] }
  },
)

export const searchPublicCatalog = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    await assertWithinRateLimit(request.auth.uid, 'searchPublicCatalog', 90)

    const query = String(request.data?.query ?? '').trim()
    const type = String(request.data?.type ?? 'any') as SearchType
    const items = await searchPublicCatalogItems(query, type, 12)
    await recordCatalogSearch(query, type, items.length)

    return { items }
  },
)

export const searchCatalog = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    await assertWithinRateLimit(request.auth.uid, 'searchCatalog', 45)

    const query = String(request.data?.query ?? '').trim()
    const type = String(request.data?.type ?? 'any') as SearchType
    if (query.length < 2) {
      const items = await searchPublicCatalogItems(query, type, 24)
      return { candidates: [], ingestedItems: [], items }
    }

    const [publicItems, externalCandidates] = await Promise.all([
      searchPublicCatalogItems(query, type, 12),
      searchByType(query, type).catch(() => []),
    ])
    const items = rankPublicItems(uniquePublicItems(publicItems), query, type, 24)
    await recordCatalogSearch(query, type, items.length)

    return {
      candidates: externalCandidates.slice(0, 12),
      ingestedItems: [],
      items,
    }
  },
)

export const publicCatalog = onRequest(
  {
    cors: true,
  },
  async (request, response) => {
    if (request.method !== 'GET') {
      response.status(405).json({ error: 'method_not_allowed' })
      return
    }

    const query = String(request.query.q ?? '').trim()
    const type = String(request.query.type ?? 'any') as SearchType
    const limit = Math.min(Math.max(Number(request.query.limit ?? 24) || 24, 1), 48)
    const items = await searchPublicCatalogItems(query, type, limit)
    response.set('cache-control', query ? 'public, max-age=300' : 'public, max-age=900')
    response.json({ items })
  },
)

export const getModeratorStatus = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    return { isModerator: await isModerator(request.auth.uid) }
  },
)

export const upsertPublicItem = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth || !(await isModerator(request.auth.uid))) {
      throw new HttpsError('permission-denied', 'Solo moderadores pueden editar el catalogo.')
    }

    const incoming = request.data?.item as Partial<PublicCatalogItem> | undefined
    if (!incoming?.title || !incoming.type) {
      throw new HttpsError('invalid-argument', 'Titulo y tipo son obligatorios.')
    }

    const item = await buildPublicCatalogItem(incoming, request.auth.uid)
    await getFirestore().collection('publicItems').doc(item.id).set(stripUndefined(item), { merge: true })
    return { item }
  },
)

export const archivePublicItem = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth || !(await isModerator(request.auth.uid))) {
      throw new HttpsError('permission-denied', 'Solo moderadores pueden archivar el catalogo.')
    }

    const id = String(request.data?.id ?? '').trim()
    if (!id) throw new HttpsError('invalid-argument', 'Falta el id de la entrada.')

    await getFirestore().collection('publicItems').doc(id).set(
      {
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: request.auth.uid,
      },
      { merge: true },
    )
    return { ok: true }
  },
)

async function searchByType(query: string, type: SearchType): Promise<ExternalCandidate[]> {
  if (type === 'book') return searchOpenLibrary(query)
  if (type === 'anime' || type === 'manga' || type === 'manhwa') return searchAniList(query, type)
  if (type === 'animeManga') {
    const groups = await Promise.allSettled([searchAniList(query, 'anime'), searchAniList(query, 'manga')])
    return groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))
  }
  if (type === 'game' || type === 'watch') return []

  const groups = await Promise.allSettled([
    searchOpenLibrary(query),
    searchAniList(query, 'anime'),
  ])
  return groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))
}

async function searchOpenLibrary(query: string): Promise<ExternalCandidate[]> {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject')

  const response = await fetch(url)
  if (!response.ok) throw new HttpsError('unavailable', 'Open Library no respondio correctamente.')
  const payload = (await response.json()) as { docs?: Array<Record<string, unknown>> }

  return (payload.docs ?? []).map((entry) => {
    const authors = Array.isArray(entry.author_name) ? entry.author_name.map(String).slice(0, 2) : []
    const title = [String(entry.title ?? 'Sin titulo'), authors.join(', ')].filter(Boolean).join(' - ')
    return {
      id: `open-library-${String(entry.key).replace(/\//g, '-')}`,
      title,
      type: 'book',
      source: 'openLibrary',
      sourceId: String(entry.key),
      posterUrl: entry.cover_i ? `https://covers.openlibrary.org/b/id/${entry.cover_i}-M.jpg` : undefined,
      releaseYear: typeof entry.first_publish_year === 'number' ? entry.first_publish_year : undefined,
      genres: Array.isArray(entry.subject) ? entry.subject.map(String).slice(0, 5) : [],
      externalRefs: {
        openLibraryKey: String(entry.key),
        sourceUrl: `https://openlibrary.org${entry.key}`,
      },
      createdAt: new Date().toISOString(),
    } satisfies ExternalCandidate
  })
}

async function searchAniList(query: string, requestedType: 'anime' | 'manga' | 'manhwa') {
  const graphql = {
    query: `
      query SearchMedia($search: String, $type: MediaType) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: $type) {
            id
            title { romaji english native }
            description(asHtml: false)
            format
            episodes
            chapters
            volumes
            genres
            startDate { year }
            coverImage { medium }
          }
        }
      }
    `,
    variables: {
      search: query,
      type: requestedType === 'anime' ? 'ANIME' : 'MANGA',
    },
  }

  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(graphql),
  })
  if (!response.ok) throw new HttpsError('unavailable', 'AniList no respondio correctamente.')
  const payload = (await response.json()) as { data?: { Page?: { media?: Array<Record<string, unknown>> } } }

  return (payload.data?.Page?.media ?? []).map((entry) => {
    const title = entry.title as Record<string, string | undefined>
    const format = String(entry.format ?? '').toLowerCase()
    const inferredType = requestedType === 'anime' ? 'anime' : format.includes('manhwa') ? 'manhwa' : 'manga'
    const startDate = entry.startDate as { year?: number } | undefined
    const coverImage = entry.coverImage as { medium?: string } | undefined
    const progressMeta = readAniListProgressMeta(inferredType, entry)
    return {
      id: `anilist-${entry.id}`,
      title: title.english ?? title.romaji ?? title.native ?? 'Sin titulo',
      type: inferredType,
      source: 'anilist',
      sourceId: String(entry.id),
      overview: typeof entry.description === 'string' ? entry.description : undefined,
      posterUrl: coverImage?.medium,
      releaseYear: startDate?.year,
      progressTotal: progressMeta?.total,
      progressUnit: progressMeta?.unit,
      genres: Array.isArray(entry.genres) ? entry.genres.map(String) : [],
      externalRefs: {
        anilistId: String(entry.id),
        sourceUrl: `https://anilist.co/${inferredType === 'anime' ? 'anime' : 'manga'}/${entry.id}`,
      },
      createdAt: new Date().toISOString(),
    } satisfies ExternalCandidate
  })
}

function readAniListProgressMeta(type: ItemType, entry: Record<string, unknown>): { total: number; unit: ProgressUnit } | undefined {
  if (type === 'anime') return readProgressMeta(entry.episodes, 'episodes')
  return readProgressMeta(entry.chapters, 'chapters') ?? readProgressMeta(entry.volumes, 'volumes')
}

function readProgressMeta(value: unknown, unit: ProgressUnit) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? { total: value, unit } : undefined
}

async function isModerator(uid: string) {
  const snapshot = await getFirestore().collection('users').doc(uid).get()
  const role = snapshot.data()?.role
  return role === 'admin' || role === 'moderator'
}

async function searchPublicCatalogItems(query: string, type: SearchType, resultLimit: number) {
  const tokens = createSearchTokens({ title: query })
  const snapshot = await getFirestore().collection('publicItems').limit(250).get()
  return snapshot.docs
    .map((docSnapshot) => docSnapshot.data() as PublicCatalogItem)
    .filter((item) => !item.archivedAt)
    .filter((item) => matchesSearchType(item.type, type))
    .map((item) => ({ item, score: scorePublicItem(item, tokens, query) }))
    .filter((entry) => !query || entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, 'es'))
    .slice(0, resultLimit)
    .map((entry) => entry.item)
}

async function recordCatalogSearch(query: string, type: SearchType, resultCount: number) {
  const normalizedQuery = normalizeKey(query).slice(0, 120)
  if (normalizedQuery.length < 2) return

  const timestamp = new Date().toISOString()
  const id = `${type}-${slugify(normalizedQuery)}`.slice(0, 140)
  await getFirestore().collection('catalogSearches').doc(id).set(
    {
      count: FieldValue.increment(1),
      lastResultCount: resultCount,
      normalizedQuery,
      type,
      updatedAt: timestamp,
      createdAt: timestamp,
    },
    { merge: true },
  )
}

function rankPublicItems(items: PublicCatalogItem[], query: string, type: SearchType, resultLimit: number) {
  const tokens = createSearchTokens({ title: query })
  return items
    .filter((item) => !item.archivedAt)
    .filter((item) => matchesSearchType(item.type, type))
    .map((item) => ({ item, score: scorePublicItem(item, tokens, query) }))
    .filter((entry) => !query || entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, 'es'))
    .slice(0, resultLimit)
    .map((entry) => entry.item)
}

function uniquePublicItems(items: PublicCatalogItem[]) {
  const byKey = new Map<string, PublicCatalogItem>()
  for (const item of items) {
    byKey.set(item.canonicalKey || `${item.type}:${normalizeKey(item.title)}`, item)
  }
  return [...byKey.values()]
}

async function assertWithinRateLimit(uid: string, key: string, maxPerMinute: number) {
  const db = getFirestore()
  const ref = db.collection('users').doc(uid).collection('rateLimits').doc(key)
  const now = Date.now()
  const windowMs = 60_000

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? (snapshot.data() as { count?: number; windowStartedAt?: number }) : {}
    const windowStartedAt = current.windowStartedAt ?? now
    const count = now - windowStartedAt > windowMs ? 0 : current.count ?? 0

    if (count >= maxPerMinute) {
      throw new HttpsError('resource-exhausted', 'Demasiadas busquedas seguidas. Prueba en un minuto.')
    }

    transaction.set(
      ref,
      {
        count: count + 1,
        windowStartedAt: count === 0 ? now : windowStartedAt,
        updatedAt: new Date(now).toISOString(),
      },
      { merge: true },
    )
  })
}

async function buildPublicCatalogItem(incoming: Partial<PublicCatalogItem>, uid: string): Promise<PublicCatalogItem> {
  const db = getFirestore()
  const title = String(incoming.title ?? '').trim()
  const type = normalizeCatalogType(String(incoming.type ?? 'other'))
  const id = String(incoming.id ?? `${type}-${slugify(title)}`).slice(0, 120)
  const existing = await db.collection('publicItems').doc(id).get()
  const existingData = existing.exists ? (existing.data() as Partial<PublicCatalogItem>) : {}
  const createdAt = existingData.createdAt ?? incoming.createdAt ?? new Date().toISOString()
  const createdBy = existingData.createdBy ?? incoming.createdBy ?? uid
  const genres = uniqueValues(asStringArray(incoming.genres))
  const tags = uniqueValues(asStringArray(incoming.tags))

  return {
    id,
    title,
    type,
    description: optionalString(incoming.description),
    releaseYear: typeof incoming.releaseYear === 'number' ? incoming.releaseYear : undefined,
    progressTotal: typeof incoming.progressTotal === 'number' ? incoming.progressTotal : undefined,
    progressUnit: normalizeProgressUnit(incoming.progressUnit),
    genres,
    tags,
    moodTags: uniqueValues(asStringArray(incoming.moodTags)),
    searchAliases: uniqueValues(asStringArray(incoming.searchAliases)),
    externalRefs: asExternalRefs(incoming.externalRefs),
    posterUrl: optionalString(incoming.posterUrl),
    searchTokens: createSearchTokens({
      title,
      type,
      genres,
      tags,
      searchAliases: asStringArray(incoming.searchAliases),
      releaseYear: incoming.releaseYear,
    }),
    canonicalKey: `${type}:${normalizeKey(title)}`,
    createdAt,
    updatedAt: new Date().toISOString(),
    createdBy,
    updatedBy: uid,
    archivedAt: optionalString(incoming.archivedAt),
  }
}

function scorePublicItem(item: PublicCatalogItem, queryTokens: string[], rawQuery: string) {
  if (!rawQuery.trim()) return 1
  const titleKey = normalizeKey(item.title)
  const queryKey = normalizeKey(rawQuery)
  let score = 0

  if (titleKey === queryKey) score += 100
  if (titleKey.includes(queryKey)) score += 45
  for (const token of queryTokens) {
    if (item.searchTokens.includes(token)) score += 12
    if (titleKey.includes(token)) score += 8
  }
  return score
}

function createSearchTokens(value: {
  title: string
  type?: string
  genres?: string[]
  tags?: string[]
  searchAliases?: string[]
  releaseYear?: number
}) {
  return uniqueValues(
    [
      value.title,
      value.type,
      value.releaseYear ? String(value.releaseYear) : undefined,
      ...(value.searchAliases ?? []),
      ...(value.genres ?? []),
      ...(value.tags ?? []),
    ]
      .filter(Boolean)
      .flatMap((entry) => normalizeKey(String(entry)).split(/\s+/))
      .filter((entry) => entry.length >= 2),
  ).slice(0, 30)
}

function normalizeCatalogType(type: string): ItemType {
  const allowed = ['game', 'book', 'movie', 'series', 'anime', 'manga', 'manhwa', 'comic', 'other']
  return allowed.includes(type) ? (type as ItemType) : 'other'
}

function matchesSearchType(itemType: string, requestedType: SearchType) {
  if (requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((entry) => entry.trim()).filter(Boolean) : []
}

function asExternalRefs(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, String(entry ?? '').trim()])
      .filter(([, entry]) => entry),
  )
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function normalizeProgressUnit(unit: unknown): ProgressUnit | undefined {
  return unit === 'episodes' ||
    unit === 'chapters' ||
    unit === 'pages' ||
    unit === 'hours' ||
    unit === 'volumes' ||
    unit === 'percent' ||
    unit === 'items'
    ? unit
    : undefined
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value: string) {
  return normalizeKey(value).replace(/\s+/g, '-')
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, stripUndefined(entry)]],
      ),
    ) as T
  }

  return value
}
