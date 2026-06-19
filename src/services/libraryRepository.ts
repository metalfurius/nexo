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
  type ItemStatus,
  type ListItem,
  type PublicCatalogItem,
  type UserProfile,
  type UserRole,
  type UserSettings,
  nowIso,
} from '../domain/types'
import { buildPublicCatalogItem, externalCandidateToDiscovery, publicItemToDiscovery, shouldPreserveDiscoveryDecision } from '../lib/catalog'
import { rankCatalogSearchCandidates, scoreCatalogSearchCandidate } from '../lib/catalogSearch'
import { normalizeKey } from '../lib/strings'
import { searchExternalSources } from './externalSearch'
import { getFirebaseServices } from './firebaseDb'
import { searchRemoteCatalog } from './remoteCatalog'

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
  deleteAllItems: () => Promise<void>
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
  subscribeDiscoveryCandidates: (
    onCandidates: (candidates: DiscoveryCandidate[], snapshotState: RepositorySnapshotState) => void,
    onError: (error: Error) => void,
  ) => () => void
  saveDiscoveryCandidate: (candidate: DiscoveryCandidate) => Promise<void>
  dismissDiscoveryCandidate: (candidateId: string) => Promise<void>
  restoreDiscoveryCandidate: (candidateId: string) => Promise<void>
  markDiscoveryCandidateSaved: (candidateId: string, savedItemId: string) => Promise<void>
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
      if (cleanedQuery.length >= 2) {
        const remoteCandidates = await searchRemoteCatalog(cleanedQuery, type).catch(() => undefined)
        if (remoteCandidates?.length) return remoteCandidates
      }

      const [publicItems, externalCandidates] = await Promise.all([
        this.searchPublicCatalog(cleanedQuery, type),
        cleanedQuery.length >= 2 ? this.searchExternal(cleanedQuery, type ?? 'any') : Promise.resolve([]),
      ])
      return rankCatalogSearchCandidates(
        uniqueDiscoveryCandidates([
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
        .slice(0, 12)
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
  return searchExternalSources(searchQuery, type)
}

function uniqueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  const byId = new Map<string, DiscoveryCandidate>()
  for (const candidate of candidates) {
    byId.set(`${candidate.source}:${candidate.sourceId}`, candidate)
  }
  return [...byId.values()]
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
