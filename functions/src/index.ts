import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import {
  CatalogInputError,
  createCatalogQueryPlan,
  createCatalogSearchMetric,
  parseCatalogDemandItems,
  parseCatalogSearchInput,
  type CatalogDemandItem,
  type SearchType,
} from './catalogValidation.js'
import { APP_VERSION, CALLABLE_OPTIONS, FUNCTION_CORS } from './functionConfig.js'
export { configureAniListSync, syncAniList } from './anilistSync.js'

initializeApp()

type ItemType = 'game' | 'book' | 'movie' | 'series' | 'anime' | 'manga' | 'manhwa' | 'comic' | 'other'
type ProgressUnit = 'episodes' | 'chapters' | 'pages' | 'hours' | 'volumes' | 'percent' | 'items'

const CATALOG_ITEM_TYPES: ItemType[] = ['game', 'book', 'movie', 'series', 'anime', 'manga', 'manhwa', 'comic', 'other']
const WATCH_ITEM_TYPES: ItemType[] = ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic']

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
  CALLABLE_OPTIONS,
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    await assertWithinRateLimit(request.auth.uid, 'searchExternal', 30)

    const { query, type } = readCatalogSearchInput(request.data, {
      defaultLimit: 8,
      maxLimit: 8,
      minQueryLength: 2,
    })

    const startedAt = Date.now()
    const candidates = await searchByType(query, type)
    logCatalogOperation('searchExternal', type, candidates.length, startedAt)
    return { candidates: candidates.slice(0, 8), ingestedItems: [] }
  },
)

export const searchPublicCatalog = onCall(
  CALLABLE_OPTIONS,
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    await assertWithinRateLimit(request.auth.uid, 'searchPublicCatalog', 90)

    const { query, type, limit } = readCatalogSearchInput(request.data, { defaultLimit: 12 })
    const startedAt = Date.now()
    const items = await searchPublicCatalogItems(query, type, limit)
    await recordCatalogSearch(type, items.length)
    logCatalogOperation('searchPublicCatalog', type, items.length, startedAt)

    return { items }
  },
)

export const searchCatalog = onCall(
  CALLABLE_OPTIONS,
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    await assertWithinRateLimit(request.auth.uid, 'searchCatalog', 45)

    const { query, type, limit } = readCatalogSearchInput(request.data, { defaultLimit: 24 })
    const startedAt = Date.now()
    if (query.length < 2) {
      const items = await searchPublicCatalogItems(query, type, limit)
      logCatalogOperation('searchCatalog', type, items.length, startedAt)
      return { candidates: [], ingestedItems: [], items }
    }

    const [publicItems, externalCandidates] = await Promise.all([
      searchPublicCatalogItems(query, type, 12),
      searchByType(query, type).catch(() => []),
    ])
    const items = rankPublicItems(uniquePublicItems(publicItems), query, type, limit)
    await recordCatalogSearch(type, items.length)
    logCatalogOperation('searchCatalog', type, items.length, startedAt)

    return {
      candidates: externalCandidates.slice(0, 12),
      ingestedItems: [],
      items,
    }
  },
)

export const publicCatalog = onRequest(
  {
    cors: FUNCTION_CORS,
  },
  async (request, response) => {
    if (request.method !== 'GET') {
      response.status(405).json({ error: 'method_not_allowed' })
      return
    }

    try {
      const { query, type, limit } = readCatalogSearchInput(request.query, { defaultLimit: 24 })
      const startedAt = Date.now()
      const items = await searchPublicCatalogItems(query, type, limit)
      response.set('cache-control', query ? 'public, max-age=300' : 'public, max-age=900')
      logCatalogOperation('publicCatalog', type, items.length, startedAt)
      response.json({ items })
    } catch (error) {
      if (error instanceof HttpsError && error.code === 'invalid-argument') {
        response.status(400).json({ error: 'invalid_argument', message: error.message })
        return
      }
      logger.error('catalog_request_failed', { operation: 'publicCatalog', reason: readErrorName(error) })
      response.status(500).json({ error: 'internal' })
    }
  },
)

export const backendHealth = onRequest(
  {
    cors: FUNCTION_CORS,
  },
  (request, response) => {
    if (request.method !== 'GET') {
      response.status(405).json({ error: 'method_not_allowed' })
      return
    }

    response.set('cache-control', 'no-store')
    response.json({
      version: APP_VERSION,
      revision: process.env.BUILD_SHA ?? 'unknown',
    })
  },
)

export const getModeratorStatus = onCall(
  CALLABLE_OPTIONS,
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    return { isModerator: await isModerator(request.auth.uid) }
  },
)

export const upsertPublicItem = onCall(
  CALLABLE_OPTIONS,
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
  CALLABLE_OPTIONS,
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

export const recordCatalogDemands = onCall(
  CALLABLE_OPTIONS,
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }
    await assertWithinRateLimit(request.auth.uid, 'recordCatalogDemands', 10)

    const items = readCatalogDemandItems(request.data?.items)
    const itemIds = items.map((item) => item.id)
    const db = getFirestore()
    const timestamp = new Date().toISOString()
    const startedAt = Date.now()
    const outcome = await db.runTransaction(async (transaction) => {
      const itemRefs = itemIds.map((id) => db.collection('publicItems').doc(id))
      const receiptRefs = itemRefs.map((itemRef) => itemRef.collection('demands').doc(request.auth!.uid))
      const snapshots = await transaction.getAll(...itemRefs, ...receiptRefs)
      const itemSnapshots = snapshots.slice(0, itemRefs.length)
      const receiptSnapshots = snapshots.slice(itemRefs.length)
      let recorded = 0
      let duplicates = 0
      let created = 0

      for (let index = 0; index < itemRefs.length; index += 1) {
        const itemSnapshot = itemSnapshots[index]
        const receiptSnapshot = receiptSnapshots[index]
        if (!itemSnapshot?.exists) {
          transaction.create(itemRefs[index], stripUndefined(publicCatalogItemFromDemand(items[index], timestamp)))
          created += 1
          if (receiptSnapshot?.exists) {
            duplicates += 1
            continue
          }
          transaction.create(receiptRefs[index], {
            itemId: itemIds[index],
            userId: request.auth!.uid,
            createdAt: timestamp,
          })
          recorded += 1
          continue
        }
        if (receiptSnapshot?.exists) {
          duplicates += 1
          continue
        }

        transaction.create(receiptRefs[index], {
          itemId: itemIds[index],
          userId: request.auth!.uid,
          createdAt: timestamp,
        })
        transaction.set(
          itemRefs[index],
          {
            demandCount: FieldValue.increment(1),
            lastDemandAt: timestamp,
            updatedAt: timestamp,
            updatedBy: 'recordCatalogDemands',
          },
          { merge: true },
        )
        recorded += 1
      }

      return { recorded, duplicates, created }
    })

    logger.info('catalog_demands_recorded', {
      operation: 'recordCatalogDemands',
      requested: itemIds.length,
      recorded: outcome.recorded,
      duplicates: outcome.duplicates,
      created: outcome.created,
      durationMs: Date.now() - startedAt,
    })
    return outcome
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
  const queryKey = normalizeKey(query)
  if (!queryKey) return listPublicCatalogItems(type, resultLimit)

  const tokens = createSearchTokens({ title: query })
  const items = await findPublicCatalogSearchCandidates(queryKey, tokens, type, resultLimit)
  return rankPublicItems(uniquePublicItems(items), query, type, resultLimit)
}

async function listPublicCatalogItems(type: SearchType, resultLimit: number) {
  const publicItems = getFirestore().collection('publicItems')
  const readLimit = Math.min(Math.max(resultLimit * 4, 48), 96)
  const itemTypes = getSearchItemTypes(type)

  const snapshot = type === 'any'
    ? await publicItems.orderBy('title').limit(readLimit).get()
    : await publicItems.where('type', 'in', itemTypes).limit(readLimit).get()
  return rankPublicItems(readPublicCatalogSnapshots([snapshot]), '', type, resultLimit)
}

async function findPublicCatalogSearchCandidates(
  queryKey: string,
  tokens: string[],
  type: SearchType,
  resultLimit: number,
) {
  const publicItems = getFirestore().collection('publicItems')
  const readLimit = Math.min(Math.max(resultLimit * 4, 48), 96)
  const itemTypes = getSearchItemTypes(type)
  const plan = createCatalogQueryPlan(queryKey, tokens, itemTypes)
  const queries = []
  if (plan.tokens.length) {
    queries.push(
      publicItems.where('searchTokens', 'array-contains-any', plan.tokens).limit(readLimit).get(),
    )
  }
  if (plan.canonicalKeys.length) {
    queries.push(
      publicItems.where('canonicalKey', 'in', plan.canonicalKeys).limit(readLimit).get(),
    )
  }
  const snapshots = await Promise.all(queries)

  return readPublicCatalogSnapshots(snapshots)
}

function readPublicCatalogSnapshots(snapshots: Array<{ docs: Array<{ data: () => unknown }> }>) {
  const itemsById = new Map<string, PublicCatalogItem>()
  for (const snapshot of snapshots) {
    for (const docSnapshot of snapshot.docs) {
      const item = docSnapshot.data() as PublicCatalogItem
      if (item?.id) itemsById.set(item.id, item)
    }
  }
  return [...itemsById.values()]
}

async function recordCatalogSearch(type: SearchType, resultCount: number) {
  const metric = createCatalogSearchMetric(type, resultCount)
  await getFirestore().collection('catalogSearchMetrics').doc(metric.id).set(
    {
      count: FieldValue.increment(1),
      resultCount: FieldValue.increment(metric.data.resultCount),
      zeroResultCount: FieldValue.increment(metric.data.zeroResultCount),
      date: metric.data.date,
      type: metric.data.type,
      updatedAt: metric.data.updatedAt,
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

function getSearchItemTypes(type: SearchType) {
  if (type === 'any') return CATALOG_ITEM_TYPES
  if (type === 'watch') return WATCH_ITEM_TYPES
  if (type === 'animeManga') return ['anime', 'manga', 'manhwa'] satisfies ItemType[]
  if (CATALOG_ITEM_TYPES.includes(type as ItemType)) return [type as ItemType]
  return CATALOG_ITEM_TYPES
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
      throw new HttpsError('resource-exhausted', 'Demasiadas operaciones seguidas. Prueba en un minuto.')
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

function readCatalogSearchInput(
  value: unknown,
  defaults: { defaultLimit: number; maxLimit?: number; minQueryLength?: number },
) {
  try {
    const candidate = value && typeof value === 'object'
      ? (value as { query?: unknown; q?: unknown; type?: unknown; limit?: unknown })
      : undefined
    return parseCatalogSearchInput(candidate, defaults)
  } catch (error) {
    if (error instanceof CatalogInputError) {
      throw new HttpsError('invalid-argument', error.message)
    }
    throw error
  }
}

function readCatalogDemandItems(value: unknown) {
  try {
    return parseCatalogDemandItems(value)
  } catch (error) {
    if (error instanceof CatalogInputError) {
      throw new HttpsError('invalid-argument', error.message)
    }
    throw error
  }
}

function publicCatalogItemFromDemand(item: CatalogDemandItem, timestamp: string): PublicCatalogItem {
  const genres = uniqueValues(item.genres)
  const tags = uniqueValues(item.tags)
  const searchAliases = uniqueValues(item.searchAliases)
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    releaseYear: item.releaseYear,
    progressTotal: item.progressTotal,
    progressUnit: item.progressUnit,
    genres,
    tags,
    moodTags: uniqueValues(item.moodTags),
    searchAliases,
    externalRefs: item.externalRefs,
    posterUrl: item.posterUrl,
    searchTokens: createSearchTokens({
      title: item.title,
      type: item.type,
      genres,
      tags,
      searchAliases,
      releaseYear: item.releaseYear,
    }),
    canonicalKey: `${item.type}:${normalizeKey(item.title)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: 'recordCatalogDemands',
    updatedBy: 'recordCatalogDemands',
    autoIngestedAt: timestamp,
    demandCount: 1,
    lastDemandAt: timestamp,
  }
}

function logCatalogOperation(operation: string, type: SearchType, resultCount: number, startedAt: number) {
  logger.info('catalog_operation_completed', {
    operation,
    type,
    resultCount,
    durationMs: Date.now() - startedAt,
  })
}

function readErrorName(error: unknown) {
  return error instanceof Error && error.name ? error.name : 'UnknownError'
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
