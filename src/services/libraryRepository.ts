import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
  writeBatch,
} from 'firebase/firestore'
import {
  type ActivityEntry,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ExternalRefs,
  type ItemStatus,
  type LibraryBulkDeleteResult,
  type ListItem,
  type PublicCatalogItem,
  type RoadmapBatchMutation,
  type RoadmapMutation,
  type RoadmapPreferences,
  type UserProfile,
  type UserRole,
  type UserSettings,
  nowIso,
} from '../domain/types'
import { buildPublicCatalogItem, externalCandidateToDiscovery, publicItemToDiscovery, shouldPreserveDiscoveryDecision } from '../lib/catalog'
import { dedupeCatalogSearchCandidates, rankCatalogSearchCandidates, scoreCatalogSearchCandidate } from '../lib/catalogSearch'
import { normalizeKey, slugify, uniqueValues } from '../lib/strings'
import { normalizeRoadmapPreferences } from '../lib/roadmap'
import { getFirebaseServices } from './firebaseDb'
import {
  recordCatalogDemands,
  searchRemoteCatalog,
  type CatalogDemandItem,
} from './remoteCatalog'
import { getSnapshotDocumentId, removeRoadmapIds, withoutUndefined } from './libraryRepositoryUtils'

export interface RepositorySnapshotState {
  fromCache: boolean
  hasPendingWrites: boolean
  pendingWriteCount: number
}

export interface LibraryRepository {
  subscribeItems: (
    onItems: (items: ListItem[], snapshotState: RepositorySnapshotState) => void,
    onError: (error: Error) => void,
  ) => () => void
  saveItem: (item: ListItem) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  deleteAllItems: (roadmap: RoadmapPreferences) => Promise<LibraryBulkDeleteResult>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  snoozeRecommendation: (id: string) => Promise<void>
  reactivateRecommendation: (id: string) => Promise<void>
  setRecommendationCooldown: (id: string, cooldownUntil?: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
  searchCatalog: (query: string, type?: string) => Promise<DiscoveryCandidate[]>
  listPublicCatalog: () => Promise<PublicCatalogItem[]>
  searchPublicCatalog: (query: string, type?: string) => Promise<PublicCatalogItem[]>
  subscribeSettings: (
    onSettings: (settings: Partial<UserSettings>, snapshotState: RepositorySnapshotState) => void,
    onError: (error: Error) => void,
  ) => () => void
  saveSettings: (settings: Partial<UserSettings>) => Promise<void>
  applyRoadmapMutation: (mutation: RoadmapMutation) => Promise<void>
  applyRoadmapBatchMutation: (mutation: RoadmapBatchMutation) => Promise<void>
  subscribeDiscoveryCandidates: (
    onCandidates: (candidates: DiscoveryCandidate[], snapshotState: RepositorySnapshotState) => void,
    onError: (error: Error) => void,
  ) => () => void
  saveDiscoveryCandidate: (candidate: DiscoveryCandidate) => Promise<void>
  dismissDiscoveryCandidate: (candidateId: string) => Promise<void>
  restoreDiscoveryCandidate: (candidateId: string) => Promise<void>
  markDiscoveryCandidateSaved: (candidateId: string, savedItemId: string) => Promise<void>
  recordDiscoverySaveToPublicCatalog: (candidate: DiscoveryCandidate) => Promise<void>
  recordImportedItemToPublicCatalog: (item: ListItem) => Promise<void>
  recordImportedItemsToPublicCatalog: (items: ListItem[]) => Promise<void>
  ensureUserProfile: (profile: Partial<UserProfile>) => Promise<void>
  subscribeUserProfile: (
    onProfile: (profile: UserProfile | undefined, snapshotState: RepositorySnapshotState) => void,
    onError: (error: Error) => void,
  ) => () => void
  subscribeUserProfiles: (
    onProfiles: (profiles: UserProfile[], snapshotState: RepositorySnapshotState) => void,
    onError: (error: Error) => void,
  ) => () => void
  updateUserRole: (targetUserId: string, role: UserRole) => Promise<void>
  upsertPublicItem: (item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) => Promise<PublicCatalogItem>
  replacePublicItem: (item: PublicCatalogItem) => Promise<PublicCatalogItem>
  archivePublicItem: (id: string) => Promise<void>
  restorePublicItem: (id: string) => Promise<void>
  subscribeActivityEntries: (
    onEntries: (entries: ActivityEntry[], snapshotState: RepositorySnapshotState) => void,
    onError: (error: Error) => void,
  ) => () => void
  saveActivityEntry: (entry: ActivityEntry) => Promise<void>
  clearActivityEntries: () => Promise<void>
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
  const activityEntryCollection = collection(services.db, 'users', userId, 'activityEntries')
  const activityEntryDocument = (id: string) => doc(services.db, 'users', userId, 'activityEntries', id)
  const userProfileCollection = collection(services.db, 'users')
  const userProfileDocument = doc(services.db, 'users', userId)

  return {
    subscribeItems(onItems, onError) {
      const itemsQuery = query(itemCollection, orderBy('updatedAt', 'desc'))
      return onSnapshot(
        itemsQuery,
        { includeMetadataChanges: true },
        (snapshot) => {
          onItems(snapshot.docs.map((itemDoc) => itemDoc.data() as ListItem), readQuerySnapshotState(snapshot))
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
    async deleteAllItems(roadmap) {
      const snapshot = await getDocs(itemCollection)
      const documentChunks = chunk(snapshot.docs, 449)
      if (documentChunks.length === 0) documentChunks.push([])
      const total = snapshot.docs.length
      const deletedItemIds: string[] = []
      let remainingRoadmap = normalizeRoadmapPreferences(roadmap)

      for (const docsChunk of documentChunks) {
        const chunkItemIds = docsChunk.map(getSnapshotDocumentId)
        const nextRoadmap = removeRoadmapIds(remainingRoadmap, chunkItemIds)
        const batch = writeBatch(services.db)
        for (const itemDoc of docsChunk) {
          batch.delete(itemDoc.ref)
        }
        batch.set(
          settingsDocument,
          {
            roadmap: nextRoadmap,
            updatedAt: nowIso(),
          },
          { merge: true },
        )
        try {
          await batch.commit()
        } catch (reason) {
          const detail = reason instanceof Error && reason.message ? ` ${reason.message}` : ''
          return {
            complete: false,
            deletedItemIds,
            error: `Borrado interrumpido tras eliminar ${deletedItemIds.length} de ${total} entradas.${detail}`,
            roadmap: remainingRoadmap,
            total,
          }
        }
        deletedItemIds.push(...chunkItemIds)
        remainingRoadmap = nextRoadmap
      }

      return { complete: true, deletedItemIds, roadmap: remainingRoadmap, total }
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
    reactivateRecommendation(id) {
      return setDoc(
        itemDocument(id),
        {
          recommendationCooldownUntil: deleteField(),
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    setRecommendationCooldown(id, cooldownUntil) {
      return setDoc(
        itemDocument(id),
        {
          recommendationCooldownUntil: cooldownUntil ?? deleteField(),
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    async recordRecommendation(itemId, reasons) {
      const recommendedAt = nowIso()
      await addDoc(recommendationRunCollection, {
        itemId,
        reasons,
        createdAt: recommendedAt,
      })
      await setDoc(
        itemDocument(itemId),
        {
          lastRecommendedAt: recommendedAt,
          updatedAt: recommendedAt,
        },
        { merge: true },
      )
    },
    async searchExternal(searchQuery, type) {
      return searchExternalClientSide(searchQuery, type)
    },
    async searchCatalog(searchQuery, type) {
      const cleanedQuery = searchQuery.trim()
      let remoteCandidates: DiscoveryCandidate[] | undefined
      if (cleanedQuery.length >= 2) {
        remoteCandidates = await searchRemoteCatalog(cleanedQuery, type).catch(() => undefined)
      }

      const [publicItems, externalCandidates] = await Promise.all([
        this.searchPublicCatalog(cleanedQuery, type),
        cleanedQuery.length >= 2 ? this.searchExternal(cleanedQuery, type ?? 'any') : Promise.resolve([]),
      ])
      return rankCatalogSearchCandidates(
        uniqueDiscoveryCandidates([
          ...(remoteCandidates ?? []),
          ...publicItems.map(publicItemToDiscovery),
          ...externalCandidates.map(externalCandidateToDiscovery),
        ]),
        cleanedQuery,
        type,
      ).slice(0, 24)
    },
    async searchPublicCatalog(searchQuery, type) {
      const snapshot = await getDocs(collection(services.db, 'publicItems'))
      const queryKey = normalizeKey(searchQuery)
      const items = snapshot.docs
        .map((itemDoc) => itemDoc.data() as PublicCatalogItem)
        .filter((item) => !item.archivedAt)
        .filter((item) => matchesSearchType(item.type, type))

      return rankCatalogSearchCandidates(
        items.filter((item) => !queryKey || scoreCatalogSearchCandidate(searchQuery, item, type) > 0),
        searchQuery,
        type,
      )
    },
    async listPublicCatalog() {
      const snapshot = await getDocs(collection(services.db, 'publicItems'))
      return snapshot.docs
        .map((itemDoc) => itemDoc.data() as PublicCatalogItem)
        .filter((item) => !item.archivedAt)
        .sort((left, right) => left.title.localeCompare(right.title, 'es'))
    },
    subscribeSettings(onSettings, onError) {
      return onSnapshot(
        settingsDocument,
        { includeMetadataChanges: true },
        (snapshot) => onSettings(snapshot.exists() ? (snapshot.data() as Partial<UserSettings>) : {}, readDocumentSnapshotState(snapshot)),
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
    async applyRoadmapMutation(mutation) {
      const batch = writeBatch(services.db)
      const updatedAt = nowIso()
      batch.set(
        settingsDocument,
        {
          roadmap: normalizeRoadmapPreferences(mutation.roadmap),
          updatedAt,
        },
        { merge: true },
      )

      if (mutation.item?.kind === 'status') {
        batch.set(
          itemDocument(mutation.item.itemId),
          {
            status: mutation.item.status,
            updatedAt,
          },
          { merge: true },
        )
      } else if (mutation.item?.kind === 'delete') {
        batch.delete(itemDocument(mutation.item.itemId))
      } else if (mutation.item?.kind === 'restore' || mutation.item?.kind === 'upsert') {
        batch.set(
          itemDocument(mutation.item.item.id),
          {
            ...withoutUndefined(mutation.item.item),
            updatedAt,
          },
        )
      }

      await batch.commit()
    },
    async applyRoadmapBatchMutation(mutation) {
      if (mutation.items.length > 400) {
        throw new Error('Una mutacion masiva de Tu ruta admite hasta 400 cambios.')
      }
      if (!mutation.items.length) return

      const batch = writeBatch(services.db)
      const updatedAt = nowIso()
      batch.set(
        settingsDocument,
        {
          roadmap: normalizeRoadmapPreferences(mutation.roadmap),
          updatedAt,
        },
        { merge: true },
      )

      for (const itemMutation of mutation.items) {
        if (itemMutation.kind === 'status') {
          batch.set(
            itemDocument(itemMutation.itemId),
            { status: itemMutation.status, updatedAt },
            { merge: true },
          )
        } else if (itemMutation.kind === 'delete') {
          batch.delete(itemDocument(itemMutation.itemId))
        } else {
          batch.set(
            itemDocument(itemMutation.item.id),
            { ...withoutUndefined(itemMutation.item), updatedAt },
          )
        }
      }

      await batch.commit()
    },
    subscribeDiscoveryCandidates(onCandidates, onError) {
      const candidatesQuery = query(discoveryCandidateCollection, orderBy('updatedAt', 'desc'))
      return onSnapshot(
        candidatesQuery,
        { includeMetadataChanges: true },
        (snapshot) =>
          onCandidates(
            snapshot.docs.map((candidateDoc) => candidateDoc.data() as DiscoveryCandidate),
            readQuerySnapshotState(snapshot),
          ),
        (error) => onError(error),
      )
    },
    async saveDiscoveryCandidate(candidate) {
      const candidateDocument = discoveryCandidateDocument(candidate.id)
      const snapshot = await getDoc(candidateDocument)
      const existing = snapshot.exists() ? (snapshot.data() as DiscoveryCandidate) : undefined
      if (shouldPreserveDiscoveryDecision(existing, candidate)) return

      return setDoc(candidateDocument, {
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
    restoreDiscoveryCandidate(candidateId) {
      return setDoc(
        discoveryCandidateDocument(candidateId),
        {
          id: candidateId,
          status: 'queued',
          dismissedAt: deleteField(),
          savedItemId: deleteField(),
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
    async recordDiscoverySaveToPublicCatalog(candidate) {
      await recordSavedDiscoveryCandidateInPublicCatalog(userId, candidate)
    },
    async recordImportedItemToPublicCatalog(item) {
      await recordImportedLibraryItemsInPublicCatalog(userId, [item])
    },
    async recordImportedItemsToPublicCatalog(items) {
      await recordImportedLibraryItemsInPublicCatalog(userId, items)
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
        { includeMetadataChanges: true },
        (snapshot) =>
          onProfile(
            snapshot.exists() ? normalizeUserProfile(userId, snapshot.data()) : undefined,
            readDocumentSnapshotState(snapshot),
          ),
        (error) => onError(error),
      )
    },
    subscribeUserProfiles(onProfiles, onError) {
      const profilesQuery = query(userProfileCollection, orderBy('updatedAt', 'desc'))
      return onSnapshot(
        profilesQuery,
        { includeMetadataChanges: true },
        (snapshot) =>
          onProfiles(
            snapshot.docs.map((profileDoc) => normalizeUserProfile(profileDoc.id, profileDoc.data())),
            readQuerySnapshotState(snapshot),
          ),
        (error) => onError(error),
      )
    },
    updateUserRole(targetUserId, role) {
      return setDoc(
        doc(services.db, 'users', targetUserId),
        {
          role,
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    async upsertPublicItem(item) {
      const publicItem = buildPublicCatalogItem(item, userId)
      await setDoc(doc(services.db, 'publicItems', publicItem.id), withoutUndefined(publicItem), { merge: true })
      return publicItem
    },
    async replacePublicItem(item) {
      const publicItem = buildPublicCatalogItem(item, userId)
      await setDoc(doc(services.db, 'publicItems', publicItem.id), withoutUndefined(publicItem))
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
    async restorePublicItem(id) {
      await setDoc(
        doc(services.db, 'publicItems', id),
        {
          archivedAt: deleteField(),
          updatedAt: nowIso(),
          updatedBy: userId,
        },
        { merge: true },
      )
    },
    subscribeActivityEntries(onEntries, onError) {
      const activityQuery = query(activityEntryCollection, orderBy('createdAt', 'desc'), firestoreLimit(25))
      return onSnapshot(
        activityQuery,
        { includeMetadataChanges: true },
        (snapshot) =>
          onEntries(
            snapshot.docs.map((entryDoc) => normalizeActivityEntry(entryDoc.id, entryDoc.data())),
            readQuerySnapshotState(snapshot),
          ),
        (error) => onError(error),
      )
    },
    saveActivityEntry(entry) {
      return setDoc(activityEntryDocument(entry.id), withoutUndefined(entry))
    },
    async clearActivityEntries() {
      const snapshot = await getDocs(activityEntryCollection)
      for (const docsChunk of chunk(snapshot.docs, 450)) {
        const batch = writeBatch(services.db)
        for (const entryDoc of docsChunk) {
          batch.delete(entryDoc.ref)
        }
        await batch.commit()
      }
    },
  }
}

function readQuerySnapshotState(snapshot: {
  docs?: Array<{ metadata?: { hasPendingWrites?: boolean } }>
  metadata?: { fromCache?: boolean; hasPendingWrites?: boolean }
}): RepositorySnapshotState {
  const metadata = snapshot.metadata
  const pendingDocs = snapshot.docs?.filter((entry) => Boolean(entry.metadata?.hasPendingWrites)).length ?? 0
  return {
    fromCache: Boolean(metadata?.fromCache),
    hasPendingWrites: Boolean(metadata?.hasPendingWrites || pendingDocs > 0),
    pendingWriteCount: pendingDocs || (metadata?.hasPendingWrites ? 1 : 0),
  }
}

function readDocumentSnapshotState(snapshot: {
  metadata?: { fromCache?: boolean; hasPendingWrites?: boolean }
}): RepositorySnapshotState {
  const metadata = snapshot.metadata
  return {
    fromCache: Boolean(metadata?.fromCache),
    hasPendingWrites: Boolean(metadata?.hasPendingWrites),
    pendingWriteCount: metadata?.hasPendingWrites ? 1 : 0,
  }
}

function normalizeActivityEntry(id: string, data: Record<string, unknown>): ActivityEntry {
  return {
    id: typeof data.id === 'string' ? data.id : id,
    label: typeof data.label === 'string' ? data.label : 'Actividad',
    detail: typeof data.detail === 'string' ? data.detail : '',
    tab: normalizeActivityTab(data.tab),
    tone: normalizeActivityTone(data.tone),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : nowIso(),
    target: normalizeActivityTarget(data.target),
  }
}

function normalizeActivityTab(tab: unknown): ActivityEntry['tab'] {
  return tab === 'library' || tab === 'dice' || tab === 'explorer' || tab === 'import' || tab === 'settings' || tab === 'curation'
    ? tab
    : 'library'
}

function normalizeActivityTone(tone: unknown): ActivityEntry['tone'] {
  return tone === 'info' || tone === 'success' || tone === 'danger' || tone === 'loading' ? tone : 'info'
}

function normalizeActivityTarget(target: unknown): ActivityEntry['target'] {
  if (!target || typeof target !== 'object') return undefined

  const candidate = target as Record<string, unknown>
  if (candidate.kind === 'item' && typeof candidate.id === 'string') {
    return { kind: 'item', id: candidate.id }
  }

  return undefined
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
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
}

async function searchExternalClientSide(searchQuery: string, type: string): Promise<ExternalCandidate[]> {
  const { searchExternalSources } = await import('./externalSearch')
  return searchExternalSources(searchQuery, type)
}

function uniqueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  return dedupeCatalogSearchCandidates(candidates)
}

async function recordSavedDiscoveryCandidateInPublicCatalog(
  actorId: string,
  candidate: DiscoveryCandidate,
) {
  if (candidate.source === 'prompt') return
  const timestamp = nowIso()
  const publicItem = isExternalDiscoveryCandidate(candidate)
    ? buildAutoIngestedPublicItem(candidate, actorId, timestamp)
    : buildPublicCatalogItem(
        {
          ...candidate.publicSnapshot,
          id: candidate.publicItemId || candidate.sourceId || candidate.id,
          title: candidate.title,
          type: candidate.type,
          description: candidate.overview ?? candidate.publicSnapshot?.description,
          releaseYear: candidate.releaseYear ?? candidate.publicSnapshot?.releaseYear,
          progressTotal: candidate.progressTotal ?? candidate.publicSnapshot?.progressTotal,
          progressUnit: candidate.progressUnit ?? candidate.publicSnapshot?.progressUnit,
          genres: candidate.genres,
          tags: candidate.tags,
          moodTags: candidate.moodTags,
          searchAliases: candidate.searchAliases ?? candidate.publicSnapshot?.searchAliases,
          externalRefs: compactExternalRefs(candidate.externalRefs),
          posterUrl: candidate.posterUrl ?? candidate.publicSnapshot?.posterUrl,
        },
        actorId,
      )
  await recordCatalogDemands([toCatalogDemandItem(publicItem)])
}

async function recordImportedLibraryItemsInPublicCatalog(
  actorId: string,
  items: ListItem[],
) {
  const timestamp = nowIso()
  const demands = items.flatMap((item) =>
    item.source === 'external' && item.title.trim()
      ? [toCatalogDemandItem(buildImportedPublicCatalogItem(item, actorId, timestamp))]
      : [],
  )
  await recordCatalogDemands(demands)
}

function toCatalogDemandItem(item: PublicCatalogItem): CatalogDemandItem {
  return withoutUndefined({
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    releaseYear: item.releaseYear,
    progressTotal: item.progressTotal,
    progressUnit: item.progressUnit,
    genres: item.genres,
    tags: item.tags,
    moodTags: item.moodTags,
    searchAliases: item.searchAliases,
    externalRefs: compactExternalRefs(item.externalRefs),
    posterUrl: item.posterUrl,
  }) as CatalogDemandItem
}

function buildAutoIngestedPublicItem(
  candidate: DiscoveryCandidate & { source: ExternalCandidate['source'] },
  actorId: string,
  timestamp: string,
) {
  const sourceRefKey = externalSourceRefKey(candidate.source)
  const sourceLabel = externalSourceLabel(candidate.source)
  const searchAliases = candidate.publicSnapshot?.searchAliases ?? candidate.searchAliases ?? []

  return buildPublicCatalogItem(
    {
      id: createAutoPublicItemId(candidate),
      title: candidate.title,
      type: candidate.type,
      description: candidate.overview,
      releaseYear: candidate.releaseYear,
      progressTotal: candidate.progressTotal,
      progressUnit: candidate.progressUnit,
      genres: candidate.genres,
      tags: uniqueValues([candidate.type, sourceLabel, ...candidate.genres]),
      moodTags: [],
      searchAliases: uniqueValues(searchAliases).slice(0, 16),
      externalRefs: {
        ...candidate.externalRefs,
        ...(sourceRefKey ? { [sourceRefKey]: candidate.sourceId } : {}),
      },
      posterUrl: candidate.posterUrl,
      createdAt: timestamp,
      createdBy: actorId,
      updatedBy: actorId,
      autoIngestedAt: timestamp,
      demandCount: 1,
      lastDemandAt: timestamp,
    },
    actorId,
  )
}

function buildImportedPublicCatalogItem(item: ListItem, actorId: string, timestamp: string) {
  return buildPublicCatalogItem(
    {
      id: createImportedPublicItemId(item),
      title: item.title,
      type: item.type,
      releaseYear: readImportedReleaseYear(item),
      progressTotal: readPublicProgressTotal(item),
      progressUnit: readPublicProgressTotal(item) === undefined ? undefined : item.progressUnit,
      genres: uniqueValues(item.genres),
      tags: importedPublicCatalogTags(item),
      moodTags: [],
      searchAliases: [],
      externalRefs: compactExternalRefs(item.externalRefs),
      posterUrl: item.posterUrl,
      createdAt: timestamp,
      createdBy: actorId,
      updatedBy: actorId,
      autoIngestedAt: timestamp,
      demandCount: 1,
      lastDemandAt: timestamp,
    },
    actorId,
  )
}

function isExternalDiscoveryCandidate(
  candidate: DiscoveryCandidate,
): candidate is DiscoveryCandidate & { source: ExternalCandidate['source'] } {
  return candidate.source !== 'nexo' && candidate.source !== 'prompt'
}

function createAutoPublicItemId(
  candidate: Pick<DiscoveryCandidate, 'source' | 'sourceId' | 'title' | 'type'> & { source: ExternalCandidate['source'] },
) {
  return `${candidate.type}-${candidate.source}-${slugify(candidate.sourceId || candidate.title)}`.slice(0, 120)
}

function createImportedPublicItemId(item: ListItem) {
  const stableRef = importedStablePublicRef(item)
  const idSource = stableRef ? `${stableRef.source}-${stableRef.value}` : item.title
  return `${item.type}-${slugify(idSource)}`.slice(0, 120)
}

function importedStablePublicRef(item: ListItem) {
  const refs = compactExternalRefs(item.externalRefs)
  const stableRefs: Array<{ key: keyof ExternalRefs; source: string }> = [
    { key: 'anilistId', source: 'anilist' },
    { key: 'malId', source: 'jikan' },
    { key: 'letterboxdSlug', source: 'letterboxd' },
    { key: 'goodreadsBookId', source: 'goodreads' },
    { key: 'isbn', source: 'isbn' },
    { key: 'googleBooksId', source: 'googleBooks' },
    { key: 'openLibraryKey', source: 'openLibrary' },
    { key: 'tmdbId', source: 'tmdb' },
    { key: 'rawgId', source: 'rawg' },
    { key: 'kitsuId', source: 'kitsu' },
    { key: 'wikidataId', source: 'wikidata' },
  ]

  for (const { key, source } of stableRefs) {
    const value = refs[key]
    if (value) return { key, source, value }
  }
  return undefined
}

function importedPublicCatalogTags(item: ListItem) {
  const refs = compactExternalRefs(item.externalRefs)
  return uniqueValues([
    item.type,
    refs.anilistId ? 'AniList' : undefined,
    refs.malId ? 'MyAnimeList' : undefined,
    refs.letterboxdSlug ? 'Letterboxd' : undefined,
    refs.goodreadsBookId || refs.isbn ? 'Goodreads' : undefined,
    refs.googleBooksId ? 'Google Books' : undefined,
    refs.openLibraryKey ? 'Open Library' : undefined,
    refs.tmdbId ? 'TMDB' : undefined,
    refs.rawgId ? 'RAWG' : undefined,
    refs.kitsuId ? 'Kitsu' : undefined,
    refs.wikidataId ? 'Wikidata' : undefined,
  ])
}

function readImportedReleaseYear(item: ListItem) {
  const snapshotYear = readSafeYear(item.publicSnapshot?.releaseYear)
  if (snapshotYear !== undefined) return snapshotYear

  for (const note of item.importNotes ?? []) {
    const match = note.match(/^Ano:\s*(\d{4})$/)
    const year = readSafeYear(match ? Number(match[1]) : undefined)
    if (year !== undefined) return year
  }
  return undefined
}

function readSafeYear(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const year = Math.trunc(value)
  return year >= 1800 && year <= 2100 ? year : undefined
}

function readPublicProgressTotal(item: ListItem) {
  if (typeof item.progressTotal !== 'number' || !Number.isFinite(item.progressTotal) || item.progressTotal <= 0) {
    return undefined
  }
  return item.progressTotal
}

function compactExternalRefs(refs: ExternalRefs | undefined): ExternalRefs {
  if (!refs) return {}

  return Object.fromEntries(
    Object.entries(refs).flatMap(([key, value]) =>
      typeof value === 'string' && value.trim() ? [[key, value.trim()]] : [],
    ),
  ) as ExternalRefs
}

function externalSourceRefKey(source: ExternalCandidate['source']) {
  const keys: Partial<Record<ExternalCandidate['source'], keyof NonNullable<ExternalCandidate['externalRefs']>>> = {
    anilist: 'anilistId',
    googleBooks: 'googleBooksId',
    jikan: 'malId',
    kitsu: 'kitsuId',
    mangaDex: 'mangaDexId',
    openLibrary: 'openLibraryKey',
    rawg: 'rawgId',
    tmdb: 'tmdbId',
    wikidata: 'wikidataId',
  }
  return keys[source]
}

function externalSourceLabel(source: ExternalCandidate['source']) {
  const labels: Record<ExternalCandidate['source'], string> = {
    anilist: 'AniList',
    googleBooks: 'Google Books',
    jikan: 'Jikan',
    kitsu: 'Kitsu',
    mangaDex: 'MangaDex',
    openLibrary: 'Open Library',
    rawg: 'RAWG',
    tmdb: 'TMDB',
    wikidata: 'Wikidata',
  }
  return labels[source]
}
