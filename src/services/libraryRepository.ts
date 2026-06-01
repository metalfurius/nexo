import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
  writeBatch,
} from 'firebase/firestore'
import {
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ItemStatus,
  type ListItem,
  type PublicCatalogItem,
  type UserProfile,
  type UserRole,
  type UserSettings,
  nowIso,
} from '../domain/types'
import { buildPublicCatalogItem } from '../lib/catalog'
import { normalizeKey } from '../lib/strings'
import { getFirebaseServices } from './firebase'

export interface LibraryRepository {
  subscribeItems: (onItems: (items: ListItem[]) => void, onError: (error: Error) => void) => () => void
  saveItem: (item: ListItem) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  deleteAllItems: () => Promise<void>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  snoozeRecommendation: (id: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
  searchPublicCatalog: (query: string, type?: string) => Promise<PublicCatalogItem[]>
  subscribeSettings: (onSettings: (settings: Partial<UserSettings>) => void, onError: (error: Error) => void) => () => void
  saveSettings: (settings: Partial<UserSettings>) => Promise<void>
  subscribeDiscoveryCandidates: (
    onCandidates: (candidates: DiscoveryCandidate[]) => void,
    onError: (error: Error) => void,
  ) => () => void
  saveDiscoveryCandidate: (candidate: DiscoveryCandidate) => Promise<void>
  dismissDiscoveryCandidate: (candidateId: string) => Promise<void>
  markDiscoveryCandidateSaved: (candidateId: string, savedItemId: string) => Promise<void>
  ensureUserProfile: (profile: Partial<UserProfile>) => Promise<void>
  subscribeUserProfile: (onProfile: (profile: UserProfile | undefined) => void, onError: (error: Error) => void) => () => void
  upsertPublicItem: (item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) => Promise<PublicCatalogItem>
  archivePublicItem: (id: string) => Promise<void>
}

export function createFirestoreRepository(userId: string): LibraryRepository | undefined {
  const services = getFirebaseServices()
  if (!services) return undefined
  const itemCollection = collection(services.db, 'users', userId, 'items')
  const itemDocument = (id: string) => doc(services.db, 'users', userId, 'items', id)
  const recommendationRunCollection = collection(services.db, 'users', userId, 'recommendationRuns')
  const settingsDocument = doc(services.db, 'users', userId, 'userSettings', 'preferences')
  const discoveryCandidateCollection = collection(services.db, 'users', userId, 'externalCandidates')
  const discoveryCandidateDocument = (id: string) => doc(services.db, 'users', userId, 'externalCandidates', id)
  const userProfileDocument = doc(services.db, 'users', userId)

  return {
    subscribeItems(onItems, onError) {
      const itemsQuery = query(itemCollection, orderBy('updatedAt', 'desc'))
      return onSnapshot(
        itemsQuery,
        (snapshot) => {
          onItems(snapshot.docs.map((itemDoc) => itemDoc.data() as ListItem))
        },
        (error) => onError(error),
      )
    },
    saveItem(item) {
      return setDoc(itemDocument(item.id), {
        ...withoutUndefined(item),
        updatedAt: nowIso(),
      })
    },
    deleteItem(id) {
      return deleteDoc(itemDocument(id))
    },
    async deleteAllItems() {
      const snapshot = await getDocs(itemCollection)
      for (const docsChunk of chunk(snapshot.docs, 450)) {
        const batch = writeBatch(services.db)
        for (const itemDoc of docsChunk) {
          batch.delete(itemDoc.ref)
        }
        await batch.commit()
      }
    },
    setStatus(id, status) {
      return setDoc(
        itemDocument(id),
        {
          status,
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    snoozeRecommendation(id) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      return setDoc(
        itemDocument(id),
        {
          recommendationCooldownUntil: tomorrow.toISOString(),
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    async recordRecommendation(itemId, reasons) {
      await addDoc(recommendationRunCollection, {
        itemId,
        reasons,
        createdAt: nowIso(),
      })
    },
    async searchExternal(searchQuery, type) {
      return searchExternalClientSide(searchQuery, type)
    },
    async searchPublicCatalog(searchQuery, type) {
      const snapshot = await getDocs(collection(services.db, 'publicItems'))
      const queryKey = normalizeKey(searchQuery)
      const queryTokens = queryKey.split(/\s+/).filter(Boolean)
      return snapshot.docs
        .map((itemDoc) => itemDoc.data() as PublicCatalogItem)
        .filter((item) => !item.archivedAt)
        .filter((item) => matchesSearchType(item.type, type))
        .map((item) => ({ item, score: scorePublicCatalogItem(item, queryKey, queryTokens) }))
        .filter((entry) => !queryKey || entry.score > 0)
        .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, 'es'))
        .slice(0, 12)
        .map((entry) => entry.item)
    },
    subscribeSettings(onSettings, onError) {
      return onSnapshot(
        settingsDocument,
        (snapshot) => onSettings(snapshot.exists() ? (snapshot.data() as Partial<UserSettings>) : {}),
        (error) => onError(error),
      )
    },
    saveSettings(settings) {
      return setDoc(
        settingsDocument,
        {
          ...withoutUndefined(settings),
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    subscribeDiscoveryCandidates(onCandidates, onError) {
      const candidatesQuery = query(discoveryCandidateCollection, orderBy('updatedAt', 'desc'))
      return onSnapshot(
        candidatesQuery,
        (snapshot) => onCandidates(snapshot.docs.map((candidateDoc) => candidateDoc.data() as DiscoveryCandidate)),
        (error) => onError(error),
      )
    },
    saveDiscoveryCandidate(candidate) {
      return setDoc(discoveryCandidateDocument(candidate.id), {
        ...withoutUndefined(candidate),
        updatedAt: nowIso(),
      })
    },
    dismissDiscoveryCandidate(candidateId) {
      return setDoc(
        discoveryCandidateDocument(candidateId),
        {
          id: candidateId,
          status: 'dismissed',
          dismissedAt: nowIso(),
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    markDiscoveryCandidateSaved(candidateId, savedItemId) {
      return setDoc(
        discoveryCandidateDocument(candidateId),
        {
          id: candidateId,
          status: 'saved',
          savedItemId,
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    async ensureUserProfile(profile) {
      const snapshot = await getDoc(userProfileDocument)
      const timestamp = nowIso()
      const profilePatch = withoutUndefined({
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        updatedAt: timestamp,
        lastSeenAt: timestamp,
      })

      if (snapshot.exists()) {
        await setDoc(userProfileDocument, profilePatch, { merge: true })
        return
      }

      await setDoc(userProfileDocument, {
        ...profilePatch,
        uid: userId,
        role: 'user',
        createdAt: timestamp,
      } satisfies UserProfile)
    },
    subscribeUserProfile(onProfile, onError) {
      return onSnapshot(
        userProfileDocument,
        (snapshot) => onProfile(snapshot.exists() ? normalizeUserProfile(userId, snapshot.data()) : undefined),
        (error) => onError(error),
      )
    },
    async upsertPublicItem(item) {
      const publicItem = buildPublicCatalogItem(item, userId)
      await setDoc(doc(services.db, 'publicItems', publicItem.id), withoutUndefined(publicItem), { merge: true })
      return publicItem
    },
    async archivePublicItem(id) {
      await setDoc(
        doc(services.db, 'publicItems', id),
        {
          archivedAt: nowIso(),
          updatedAt: nowIso(),
          updatedBy: userId,
        },
        { merge: true },
      )
    },
  }
}

function normalizeUserProfile(userId: string, data: Record<string, unknown>): UserProfile {
  const timestamp = nowIso()
  return {
    uid: typeof data.uid === 'string' ? data.uid : userId,
    role: normalizeUserRole(data.role),
    email: typeof data.email === 'string' ? data.email : undefined,
    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : timestamp,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : timestamp,
    lastSeenAt: typeof data.lastSeenAt === 'string' ? data.lastSeenAt : undefined,
  }
}

function normalizeUserRole(role: unknown): UserRole {
  return role === 'admin' || role === 'moderator' || role === 'user' ? role : 'user'
}

function chunk<Value>(values: Value[], size: number) {
  const chunks: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

export function createItemId(db: Firestore, userId: string, title: string) {
  return doc(collection(db, 'users', userId, 'items')).id || title
}

function matchesSearchType(itemType: string, requestedType?: string) {
  if (!requestedType || requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  return itemType === requestedType
}

function scorePublicCatalogItem(item: PublicCatalogItem, queryKey: string, queryTokens: string[]) {
  if (!queryKey) return 1
  const titleKey = normalizeKey(item.title)
  let score = 0

  if (titleKey === queryKey) score += 100
  if (titleKey.includes(queryKey)) score += 45
  for (const token of queryTokens) {
    if (item.searchTokens.includes(token)) score += 12
    if (titleKey.includes(token)) score += 8
  }
  return score
}

async function searchExternalClientSide(searchQuery: string, type: string): Promise<ExternalCandidate[]> {
  if (type === 'book') return searchOpenLibraryClientSide(searchQuery)
  if (type === 'game') return searchWikidataGamesClientSide(searchQuery)
  if (type === 'anime' || type === 'manga' || type === 'manhwa') {
    return searchAniListClientSide(searchQuery, type)
  }
  if (type === 'any') {
    const groups = await Promise.allSettled([
      searchOpenLibraryClientSide(searchQuery),
      searchAniListClientSide(searchQuery, 'anime'),
      searchWikidataGamesClientSide(searchQuery),
    ])
    return groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))
  }
  return []
}

async function searchOpenLibraryClientSide(searchQuery: string): Promise<ExternalCandidate[]> {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', searchQuery)
  url.searchParams.set('limit', '8')
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject')

  const response = await fetch(url)
  if (!response.ok) return []
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
      createdAt: nowIso(),
    } satisfies ExternalCandidate
  })
}

async function searchWikidataGamesClientSide(searchQuery: string): Promise<ExternalCandidate[]> {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbsearchentities')
  url.searchParams.set('search', searchQuery)
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('limit', '8')

  const response = await fetch(url)
  if (!response.ok) return []
  const payload = (await response.json()) as { search?: Array<Record<string, unknown>> }

  return (payload.search ?? [])
    .filter((entry) => /video game|videogame/i.test(String(entry.description ?? '')))
    .map((entry) => {
      const id = String(entry.id)
      const description = typeof entry.description === 'string' ? entry.description : undefined
      return {
        id: `wikidata-${id}`,
        title: String(entry.label ?? 'Sin titulo'),
        type: 'game',
        source: 'wikidata',
        sourceId: id,
        overview: description,
        releaseYear: parseFirstYear(description),
        genres: ['video game'],
        externalRefs: {
          wikidataId: id,
          sourceUrl: `https://www.wikidata.org/wiki/${id}`,
        },
        createdAt: nowIso(),
      } satisfies ExternalCandidate
    })
}

async function searchAniListClientSide(
  searchQuery: string,
  requestedType: 'anime' | 'manga' | 'manhwa',
): Promise<ExternalCandidate[]> {
  const graphql = {
    query: `
      query SearchMedia($search: String, $type: MediaType) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: $type) {
            id
            title { romaji english native }
            description(asHtml: false)
            format
            genres
            startDate { year }
            coverImage { medium }
          }
        }
      }
    `,
    variables: {
      search: searchQuery,
      type: requestedType === 'anime' ? 'ANIME' : 'MANGA',
    },
  }

  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(graphql),
  })
  if (!response.ok) return []
  const payload = (await response.json()) as { data?: { Page?: { media?: Array<Record<string, unknown>> } } }

  return (payload.data?.Page?.media ?? []).map((entry) => {
    const title = entry.title as Record<string, string | undefined>
    const format = String(entry.format ?? '').toLowerCase()
    const inferredType = requestedType === 'anime' ? 'anime' : format.includes('manhwa') ? 'manhwa' : 'manga'
    const startDate = entry.startDate as { year?: number } | undefined
    const coverImage = entry.coverImage as { medium?: string } | undefined
    return {
      id: `anilist-${entry.id}`,
      title: title.english ?? title.romaji ?? title.native ?? 'Sin titulo',
      type: inferredType,
      source: 'anilist',
      sourceId: String(entry.id),
      overview: typeof entry.description === 'string' ? entry.description : undefined,
      posterUrl: coverImage?.medium,
      releaseYear: startDate?.year,
      genres: Array.isArray(entry.genres) ? entry.genres.map(String) : [],
      externalRefs: {
        anilistId: String(entry.id),
        sourceUrl: `https://anilist.co/${inferredType === 'anime' ? 'anime' : 'manga'}/${entry.id}`,
      },
      createdAt: nowIso(),
    } satisfies ExternalCandidate
  })
}

function parseFirstYear(value?: string) {
  const match = value?.match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : undefined
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutUndefined(entry)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, withoutUndefined(entry)]],
      ),
    ) as T
  }

  return value
}
