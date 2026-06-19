import { useCallback, useEffect, useState } from 'react'
import {
  type ExternalRefs,
  type ActivityEntry,
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  THEME_MODES,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ItemStatus,
  type LibrarySyncState,
  type LibraryCardsPerRow,
  type LibraryViewMode,
  type ListItem,
  type PublicCatalogItem,
  type UserProfile,
  type UserRole,
  type UserSettings,
  nowIso,
} from '../domain/types'
import { demoItems } from '../data/demoItems'
import { demoPublicCatalog } from '../data/demoCatalog'
import {
  buildPublicCatalogItem,
  discoveryToListItem,
  externalCandidateToDiscovery,
  mergeDiscoveryCandidate,
  publicItemToDiscovery,
  shouldPreserveDiscoveryDecision,
} from '../lib/catalog'
import { rankCatalogSearchCandidates, scoreCatalogSearchCandidate } from '../lib/catalogSearch'
import { slugify, uniqueValues } from '../lib/strings'
import { isFirebaseConfigured } from '../services/firebaseConfig'
import { isFirestoreOfflinePersistenceEnabled } from '../services/devicePreferences'
import { fetchPublicCatalog } from '../services/publicCatalog'
import type { LibraryRepository, RepositorySnapshotState } from '../services/libraryRepository'

interface SignedInUserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL?: string | null
}

const demoUserProfiles: UserProfile[] = [
  {
    uid: 'demo-admin',
    role: 'admin',
    email: 'admin@nexo.local',
    displayName: 'Admin demo',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    uid: 'demo-moderator',
    role: 'moderator',
    email: 'moderator@nexo.local',
    displayName: 'Moderador demo',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    uid: 'demo-user',
    role: 'user',
    email: 'usuario@nexo.local',
    displayName: 'Usuario demo',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
]

type ActivityDraft = Omit<ActivityEntry, 'createdAt' | 'id'>
const activityEntryLimit = 25
type SyncSliceId = 'items' | 'settings' | 'discovery' | 'activity' | 'profile' | 'profiles'
interface SaveDiscoveryOptions {
  persistDiscoveryCandidate?: boolean
}

export function useLibrary(user?: SignedInUserProfile | null) {
  const userId = user?.uid
  const [repositoryState, setRepositoryState] = useState<{ repository?: LibraryRepository; userId?: string }>({})
  const repository = repositoryState.userId === userId ? repositoryState.repository : undefined
  const [remoteItems, setRemoteItems] = useState<ListItem[]>([])
  const [remoteUserId, setRemoteUserId] = useState<string | undefined>()
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [discoveryCandidates, setDiscoveryCandidates] = useState<DiscoveryCandidate[]>([])
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([])
  const [publicCatalog, setPublicCatalog] = useState<PublicCatalogItem[]>(demoPublicCatalog)
  const [profileRole, setProfileRole] = useState<{ role: UserRole; userId?: string }>({ role: 'user' })
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>(demoUserProfiles)
  const [demoLibrary, setDemoLibrary] = useState<ListItem[]>(demoItems)
  const [syncSlices, setSyncSlices] = useState<Partial<Record<SyncSliceId, RepositorySnapshotState>>>({})
  const [localPendingWriteCount, setLocalPendingWriteCount] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const expectsRemote = Boolean(isFirebaseConfigured && userId)
  const repositoryLoading = Boolean(expectsRemote && repositoryState.userId !== userId)
  const remoteReady = Boolean(repository && userId && remoteUserId === userId)
  const loading = Boolean(repositoryLoading || (repository && !remoteReady))
  const items = expectsRemote ? (remoteReady ? remoteItems : []) : demoLibrary
  const activeError = expectsRemote ? error : undefined
  const userRole = expectsRemote ? (profileRole.userId === userId ? profileRole.role : 'user') : 'admin'
  const isModerator = userRole === 'admin' || userRole === 'moderator'
  const remoteSyncStates = Object.values(syncSlices)
  const remotePendingWriteCount = remoteSyncStates.reduce((total, state) => total + state.pendingWriteCount, 0)
  const pendingWriteCount = Math.max(remotePendingWriteCount, localPendingWriteCount)
  const syncFromCache = remoteSyncStates.some((state) => state.fromCache)
  const syncState: LibrarySyncState = {
    error: activeError,
    fromCache: Boolean(expectsRemote && syncFromCache),
    hasPendingWrites: Boolean(expectsRemote && pendingWriteCount > 0),
    lastSyncedAt,
    offlinePersistenceEnabled: isFirestoreOfflinePersistenceEnabled(),
    pendingWriteCount: expectsRemote ? pendingWriteCount : 0,
    remote: expectsRemote,
  }

  const updateSyncSlice = useCallback((sliceId: SyncSliceId, snapshotState?: RepositorySnapshotState) => {
    if (!snapshotState) return
    setSyncSlices((current) => ({ ...current, [sliceId]: snapshotState }))
  }, [])

  const trackRepositoryWrite = useCallback(async (promise: Promise<void>, fallback: string) => {
    setLocalPendingWriteCount((current) => current + 1)
    try {
      await promise
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback)
      throw reason
    } finally {
      setLocalPendingWriteCount((current) => Math.max(0, current - 1))
    }
  }, [])

  useEffect(() => {
    if (expectsRemote && remoteSyncStates.length > 0 && !syncFromCache && pendingWriteCount === 0 && !activeError) {
      const timeoutId = window.setTimeout(() => setLastSyncedAt(nowIso()), 0)
      return () => window.clearTimeout(timeoutId)
    }

    return undefined
  }, [activeError, expectsRemote, pendingWriteCount, remoteSyncStates.length, syncFromCache])

  useEffect(() => {
    if (!userId || !isFirebaseConfigured) {
      const timeoutId = window.setTimeout(() => {
        setSyncSlices({})
        setLocalPendingWriteCount(0)
        setLastSyncedAt(undefined)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    let disposed = false

    void import('../services/libraryRepository')
      .then(({ createFirestoreRepository }) => {
        if (disposed) return
        setRemoteItems([])
        setRemoteUserId(undefined)
        setDiscoveryCandidates([])
        setActivityEntries([])
        setProfileRole({ role: 'user', userId })
        setSyncSlices({})
        setLocalPendingWriteCount(0)
        setLastSyncedAt(undefined)
        setRepositoryState({ repository: createFirestoreRepository(userId), userId })
      })
      .catch((reason) => {
        if (disposed) return
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar Firestore.')
        setRepositoryState({ userId })
      })

    return () => {
      disposed = true
    }
  }, [userId])

  useEffect(() => {
    if (!repository || !userId) return undefined

    return repository.subscribeItems(
      (nextItems, snapshotState) => {
        setRemoteItems(nextItems)
        setRemoteUserId(userId)
        updateSyncSlice('items', snapshotState)
        setError(undefined)
      },
      (reason) => {
        setRemoteItems([])
        setRemoteUserId(userId)
        setError(getSyncErrorMessage(reason, 'No se pudo cargar la biblioteca.'))
      },
    )
  }, [repository, updateSyncSlice, userId])

  useEffect(() => {
    if (!repository || !userId || !user) {
      return undefined
    }

    const unsubscribers = [
      repository.subscribeUserProfile(
        (profile, snapshotState) => {
          setProfileRole({ role: profile?.role ?? 'user', userId })
          updateSyncSlice('profile', snapshotState)
        },
        (reason) => setError(getSyncErrorMessage(reason, 'No se pudo cargar el perfil.')),
      ),
      repository.subscribeSettings(
        (remoteSettings, snapshotState) => {
          setSettings(mergeSettings(remoteSettings))
          updateSyncSlice('settings', snapshotState)
        },
        (reason) => setError(getSyncErrorMessage(reason, 'No se pudieron cargar los ajustes.')),
      ),
      repository.subscribeDiscoveryCandidates(
        (nextCandidates, snapshotState) => {
          setDiscoveryCandidates((current) => mergeCandidates(nextCandidates, current))
          updateSyncSlice('discovery', snapshotState)
        },
        (reason) => setError(getSyncErrorMessage(reason, 'No se pudo cargar la cola de exploracion.')),
      ),
      repository.subscribeActivityEntries(
        (nextEntries, snapshotState) => {
          setActivityEntries(nextEntries)
          updateSyncSlice('activity', snapshotState)
        },
        (reason) => {
          setActivityEntries([])
          if (!isPermissionDeniedError(reason)) {
            setError(getSyncErrorMessage(reason, 'No se pudo cargar la actividad reciente.'))
          }
        },
      ),
    ]

    void repository
      .ensureUserProfile(toUserProfileSeed(user))
      .catch((reason) => setError(getSyncErrorMessage(reason, 'No se pudo actualizar el perfil.')))

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [repository, updateSyncSlice, user, userId])

  useEffect(() => {
    if (!repository || !userId || userRole !== 'admin') {
      return undefined
    }

    return repository.subscribeUserProfiles(
      (profiles, snapshotState) => {
        setUserProfiles(profiles)
        updateSyncSlice('profiles', snapshotState)
      },
      (reason) => setError(getSyncErrorMessage(reason, 'No se pudieron cargar los perfiles.')),
    )
  }, [repository, updateSyncSlice, userId, userRole])

  async function saveItem(item: ListItem) {
    const existingItem = items.find((currentItem) => currentItem.id === item.id)
    const protectedItem = preserveLockedCatalogFields(item, existingItem)
    const normalized = {
      ...protectedItem,
      tags: uniqueValues(protectedItem.tags),
      genres: uniqueValues(protectedItem.genres),
      moodTags: uniqueValues(protectedItem.moodTags),
      updatedAt: nowIso(),
    }
    if (repository) {
      setRemoteItems((current) => upsertItem(current, normalized))
      if (userId) setRemoteUserId(userId)
      return trackRepositoryWrite(repository.saveItem(normalized), 'No se pudo guardar la ficha.')
    } else {
      setDemoLibrary((current) => upsertItem(current, normalized))
    }
  }

  async function deleteItem(id: string) {
    if (repository) {
      setRemoteItems((current) => current.filter((item) => item.id !== id))
      return trackRepositoryWrite(repository.deleteItem(id), 'No se pudo eliminar la ficha.')
    } else {
      setDemoLibrary((current) => current.filter((item) => item.id !== id))
    }
  }

  async function deleteAllItems() {
    if (repository) {
      setRemoteItems([])
      return trackRepositoryWrite(repository.deleteAllItems(), 'No se pudieron borrar las entradas privadas.')
    } else {
      setDemoLibrary([])
    }
  }

  async function setStatus(id: string, status: ItemStatus) {
    if (repository) {
      setRemoteItems((current) =>
        current.map((item) => (item.id === id ? { ...item, status, updatedAt: nowIso() } : item)),
      )
      return trackRepositoryWrite(repository.setStatus(id, status), 'No se pudo actualizar el estado.')
    } else {
      setDemoLibrary((current) =>
        current.map((item) => (item.id === id ? { ...item, status, updatedAt: nowIso() } : item)),
      )
    }
  }

  async function snoozeRecommendation(id: string) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (repository) {
      setRemoteItems((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, recommendationCooldownUntil: tomorrow.toISOString(), updatedAt: nowIso() }
            : item,
        ),
      )
      return trackRepositoryWrite(repository.snoozeRecommendation(id), 'No se pudo pausar la recomendacion.')
    } else {
      setDemoLibrary((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, recommendationCooldownUntil: tomorrow.toISOString(), updatedAt: nowIso() }
            : item,
        ),
      )
    }
  }

  async function reactivateRecommendation(id: string) {
    if (repository) {
      setRemoteItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, recommendationCooldownUntil: undefined, updatedAt: nowIso() } : item,
        ),
      )
      return trackRepositoryWrite(repository.reactivateRecommendation(id), 'No se pudo reactivar la recomendacion.')
    } else {
      setDemoLibrary((current) =>
        current.map((item) =>
          item.id === id ? { ...item, recommendationCooldownUntil: undefined, updatedAt: nowIso() } : item,
        ),
      )
    }
  }

  async function setRecommendationCooldown(id: string, cooldownUntil?: string) {
    if (repository) {
      setRemoteItems((current) =>
        current.map((item) => {
          if (item.id !== id) return item
          const nextItem = { ...item, updatedAt: nowIso() }
          if (cooldownUntil) {
            nextItem.recommendationCooldownUntil = cooldownUntil
          } else {
            delete nextItem.recommendationCooldownUntil
          }
          return nextItem
        }),
      )
      return trackRepositoryWrite(repository.setRecommendationCooldown(id, cooldownUntil), 'No se pudo actualizar el cooldown.')
    } else {
      setDemoLibrary((current) =>
        current.map((item) => {
          if (item.id !== id) return item
          const nextItem = { ...item, updatedAt: nowIso() }
          if (cooldownUntil) {
            nextItem.recommendationCooldownUntil = cooldownUntil
          } else {
            delete nextItem.recommendationCooldownUntil
          }
          return nextItem
        }),
      )
    }
  }

  async function recordRecommendation(itemId: string, reasons: string[]) {
    const recommendedAt = nowIso()
    if (repository) {
      setRemoteItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, lastRecommendedAt: recommendedAt, updatedAt: recommendedAt } : item,
        ),
      )
      return trackRepositoryWrite(repository.recordRecommendation(itemId, reasons), 'No se pudo guardar la recomendacion.')
    } else {
      setDemoLibrary((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, lastRecommendedAt: recommendedAt, updatedAt: recommendedAt } : item,
        ),
      )
    }
  }

  async function searchExternal(query: string, type: string): Promise<ExternalCandidate[]> {
    if (repository) return repository.searchExternal(query, type)
    const { searchExternalSources } = await import('../services/externalSearch')
    const candidates = await searchExternalSources(query, type)
    return candidates.length ? candidates : demoExternalCandidates(query, type)
  }

  async function searchPublicCatalog(query: string, type?: string): Promise<PublicCatalogItem[]> {
    if (repository) return repository.searchPublicCatalog(query, type)
    if (isFirebaseConfigured) {
      const remoteCatalog = await fetchPublicCatalog(query, type ?? 'any', 24).catch(() => undefined)
      if (remoteCatalog) return remoteCatalog
    }

    const normalized = query.trim().toLowerCase()
    const matchingItems = publicCatalog
      .filter((item) => !item.archivedAt)
      .filter((item) => matchesSearchType(item.type, type))
      .filter((item) => {
        const haystack = `${item.title} ${(item.searchAliases ?? []).join(' ')} ${item.genres.join(' ')} ${item.tags.join(' ')}`.toLowerCase()
        return !normalized || haystack.includes(normalized) || scoreCatalogSearchCandidate(query, item, type) > 0
      })

    return rankCatalogSearchCandidates(matchingItems, query, type)
  }

  async function searchCatalog(query: string, type?: string): Promise<DiscoveryCandidate[]> {
    if (repository) return repository.searchCatalog(query, type)

    const cleanedQuery = query.trim()
    const [publicItems, externalCandidates] = await Promise.all([
      searchPublicCatalog(cleanedQuery, type),
      cleanedQuery.length >= 2 ? searchExternal(cleanedQuery, type ?? 'any') : Promise.resolve([]),
    ])

    return rankCatalogSearchCandidates(
      uniqueDiscoveryCandidates([
        ...publicItems.map(publicItemToDiscovery),
        ...externalCandidates.map(externalCandidateToDiscovery),
      ]),
      cleanedQuery,
      type,
    ).slice(0, 24)
  }

  async function listPublicCatalog(): Promise<PublicCatalogItem[]> {
    if (repository) return repository.listPublicCatalog()
    if (isFirebaseConfigured) {
      const remoteCatalog = await fetchPublicCatalog('', 'any', 24).catch(() => undefined)
      if (remoteCatalog) return remoteCatalog
    }

    return publicCatalog
      .filter((item) => !item.archivedAt)
      .sort((left, right) => left.title.localeCompare(right.title, 'es'))
  }

  async function saveSettings(nextSettings: Partial<UserSettings>) {
    const merged = mergeSettings({ ...settings, ...nextSettings })
    setSettings(merged)
    if (repository) return trackRepositoryWrite(repository.saveSettings(nextSettings), 'No se pudieron guardar los ajustes.')
  }

  async function queueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
    const normalized = candidates.map((candidate) => ({
      ...candidate,
      status: candidate.status ?? 'queued',
      updatedAt: nowIso(),
    }))
    const currentCandidatesById = new Map(discoveryCandidates.map((candidate) => [candidate.id, candidate]))
    const candidatesToPersist = normalized.filter(
      (candidate) => !shouldPreserveDiscoveryDecision(currentCandidatesById.get(candidate.id), candidate),
    )
    setDiscoveryCandidates((current) => mergeCandidates(normalized, current))
    if (repository) {
      await trackRepositoryWrite(
        Promise.all(candidatesToPersist.map((candidate) => repository.saveDiscoveryCandidate(candidate))).then(() => undefined),
        'No se pudo persistir la cola de exploracion.',
      )
    }
    return candidatesToPersist.length
  }

  async function dismissDiscoveryCandidate(candidateId: string) {
    const dismissedAt = nowIso()
    setDiscoveryCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, status: 'dismissed', dismissedAt, updatedAt: dismissedAt }
          : candidate,
      ),
    )
    if (repository) {
      return trackRepositoryWrite(repository.dismissDiscoveryCandidate(candidateId), 'No se pudo persistir el descarte.')
    }
  }

  async function restoreDiscoveryCandidate(candidateId: string) {
    const restoredAt = nowIso()
    setDiscoveryCandidates((current) =>
      current.map((candidate) => {
        if (candidate.id !== candidateId) return candidate
        const restored = { ...candidate, status: 'queued' as const, updatedAt: restoredAt }
        delete restored.dismissedAt
        delete restored.savedItemId
        return restored
      }),
    )
    if (repository) {
      return trackRepositoryWrite(repository.restoreDiscoveryCandidate(candidateId), 'No se pudo restaurar el hallazgo.')
    }
  }

  async function saveDiscoveryToLibrary(candidate: DiscoveryCandidate, options: SaveDiscoveryOptions = {}) {
    const { persistDiscoveryCandidate = true } = options
    const item = discoveryToListItem(candidate)
    await saveItem(item)
    const savedAt = nowIso()
    setDiscoveryCandidates((current) =>
      current.map((entry) =>
        entry.id === candidate.id ? { ...entry, status: 'saved', savedItemId: item.id, updatedAt: savedAt } : entry,
      ),
    )
    if (repository && persistDiscoveryCandidate) {
      await trackRepositoryWrite(
        repository.markDiscoveryCandidateSaved(candidate.id, item.id),
        'No se pudo persistir el estado del candidato.',
      )
    }
    return item
  }

  async function upsertPublicItem(item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) {
    if (repository) return repository.upsertPublicItem(item)

    const nextItem = buildPublicCatalogItem(item, 'demo-moderator')
    setPublicCatalog((current) => upsertCatalogItem(current, nextItem))
    return nextItem
  }

  async function replacePublicItem(item: PublicCatalogItem) {
    if (repository) return repository.replacePublicItem(item)

    const nextItem = buildPublicCatalogItem(item, 'demo-moderator')
    setPublicCatalog((current) => upsertCatalogItem(current, nextItem))
    return nextItem
  }

  async function archivePublicItem(id: string) {
    if (repository) {
      await repository.archivePublicItem(id)
    } else {
      setPublicCatalog((current) =>
        current.map((item) => (item.id === id ? { ...item, archivedAt: nowIso(), updatedAt: nowIso() } : item)),
      )
    }
  }

  async function restorePublicItem(id: string) {
    if (repository) {
      await repository.restorePublicItem(id)
    } else {
      setPublicCatalog((current) =>
        current.map((item) => {
          if (item.id !== id) return item
          const restoredItem = { ...item, updatedAt: nowIso() }
          delete restoredItem.archivedAt
          return restoredItem
        }),
      )
    }
  }

  async function updateUserRole(targetUserId: string, role: UserRole) {
    if (repository) {
      await repository.updateUserRole(targetUserId, role)
    } else {
      setUserProfiles((current) =>
        current.map((profile) => (profile.uid === targetUserId ? { ...profile, role, updatedAt: nowIso() } : profile)),
      )
    }
  }

  async function recordActivity(entry: ActivityDraft) {
    const createdAt = nowIso()
    const activityEntry: ActivityEntry = {
      ...entry,
      createdAt,
      id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
    }
    setActivityEntries((current) => limitActivityEntries([activityEntry, ...current]))

    if (repository) {
      setLocalPendingWriteCount((current) => current + 1)
      void repository
        .saveActivityEntry(activityEntry)
        .catch((reason) => {
          if (!isPermissionDeniedError(reason)) {
            setError(reason instanceof Error ? reason.message : 'No se pudo guardar la actividad reciente.')
          }
        })
        .finally(() => setLocalPendingWriteCount((current) => Math.max(0, current - 1)))
    }
  }

  async function clearActivityEntries() {
    setActivityEntries([])
    if (repository) {
      return trackRepositoryWrite(repository.clearActivityEntries(), 'No se pudo limpiar la actividad reciente.')
    }
  }

  async function restoreActivityEntries(entries: ActivityEntry[]) {
    setActivityEntries((current) => mergeActivityEntries(entries, current))
    if (repository) {
      return trackRepositoryWrite(
        Promise.all(entries.map((entry) => repository.saveActivityEntry(entry))).then(() => undefined),
        'No se pudo restaurar la actividad reciente.',
      )
    }
  }

  function candidateToItem(candidate: ExternalCandidate): ListItem {
    return {
      id: `${candidate.type}-${slugify(candidate.title)}-${candidate.sourceId}`.slice(0, 120),
      title: candidate.title,
      type: candidate.type,
      status: 'wishlist',
      progressCurrent: candidate.progressTotal ? 0 : undefined,
      progressTotal: candidate.progressTotal,
      progressUnit: candidate.progressUnit,
      genres: candidate.genres,
      tags: uniqueValues([candidate.type, candidate.source, ...candidate.genres]),
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'external',
      externalRefs: candidate.externalRefs,
      posterUrl: candidate.posterUrl,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
  }

  return {
    items,
    settings,
    discoveryCandidates,
    activityEntries,
    userProfiles: userRole === 'admin' ? userProfiles : [],
    userRole,
    isModerator,
    loading,
    error: activeError,
    syncState,
    saveItem,
    deleteItem,
    deleteAllItems,
    setStatus,
    snoozeRecommendation,
    reactivateRecommendation,
    setRecommendationCooldown,
    recordRecommendation,
    searchExternal,
    searchCatalog,
    listPublicCatalog,
    searchPublicCatalog,
    saveSettings,
    queueDiscoveryCandidates,
    dismissDiscoveryCandidate,
    restoreDiscoveryCandidate,
    saveDiscoveryToLibrary,
    upsertPublicItem,
    replacePublicItem,
    archivePublicItem,
    restorePublicItem,
    updateUserRole,
    recordActivity,
    clearActivityEntries,
    restoreActivityEntries,
    candidateToItem,
    publicItemToDiscovery,
    externalCandidateToDiscovery,
  }
}

function preserveLockedCatalogFields(incoming: ListItem, existing?: ListItem): ListItem {
  if (!existing || (existing.source !== 'external' && existing.source !== 'public')) return incoming

  return {
    ...incoming,
    createdAt: existing.createdAt,
    externalRefs: cloneExternalRefs(existing.externalRefs),
    genres: existing.genres,
    id: existing.id,
    importNotes: existing.importNotes,
    posterUrl: existing.posterUrl,
    progressTotal: existing.progressTotal,
    progressUnit: existing.progressUnit,
    publicItemId: existing.publicItemId,
    publicSnapshot: existing.publicSnapshot,
    rawText: existing.rawText,
    source: existing.source,
    tags: existing.tags,
    title: existing.title,
    type: existing.type,
    weights: {
      ...existing.weights,
      priority: incoming.weights.priority,
    },
  }
}

function cloneExternalRefs(refs?: ExternalRefs): ExternalRefs | undefined {
  return refs ? { ...refs } : refs
}

function limitActivityEntries(entries: ActivityEntry[]) {
  return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, activityEntryLimit)
}

function mergeActivityEntries(restoredEntries: ActivityEntry[], currentEntries: ActivityEntry[]) {
  const byId = new Map(currentEntries.map((entry) => [entry.id, entry]))
  for (const entry of restoredEntries) {
    byId.set(entry.id, entry)
  }
  return limitActivityEntries([...byId.values()])
}

function toUserProfileSeed(user: SignedInUserProfile): Partial<UserProfile> {
  return {
    uid: user.uid,
    email: user.email ?? undefined,
    displayName: user.displayName ?? undefined,
    photoURL: user.photoURL ?? undefined,
  }
}

function matchesSearchType(itemType: string, requestedType?: string) {
  if (!requestedType || requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
}

function upsertItem(items: ListItem[], nextItem: ListItem) {
  const exists = items.some((item) => item.id === nextItem.id)
  if (!exists) return [nextItem, ...items]
  return items.map((item) => (item.id === nextItem.id ? nextItem : item))
}

function upsertCatalogItem(items: PublicCatalogItem[], nextItem: PublicCatalogItem) {
  const exists = items.some((item) => item.id === nextItem.id)
  if (!exists) return [nextItem, ...items]
  return items.map((item) => (item.id === nextItem.id ? nextItem : item))
}

function mergeCandidates(nextCandidates: DiscoveryCandidate[], currentCandidates: DiscoveryCandidate[]) {
  const byId = new Map(currentCandidates.map((candidate) => [candidate.id, candidate]))
  for (const candidate of nextCandidates) {
    byId.set(candidate.id, mergeDiscoveryCandidate(byId.get(candidate.id), candidate))
  }
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function uniqueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  const byId = new Map<string, DiscoveryCandidate>()
  for (const candidate of candidates) {
    byId.set(`${candidate.source}:${candidate.sourceId}`, candidate)
  }
  return [...byId.values()]
}

function mergeSettings(settings: Partial<UserSettings>): UserSettings {
  const libraryViewMode = readLibraryViewMode(settings.libraryViewMode)
  const libraryCardsPerRow = readLibraryCardsPerRow(settings.libraryCardsPerRow)

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    theme:
      settings.theme && THEME_MODES.includes(settings.theme as (typeof THEME_MODES)[number])
        ? settings.theme
        : DEFAULT_SETTINGS.theme,
    libraryViewMode,
    libraryCardsPerRow,
    recommendationPreferences: {
      ...DEFAULT_RECOMMENDATION_PREFERENCES,
      ...settings.recommendationPreferences,
    },
  }
}

function readLibraryViewMode(value: unknown): LibraryViewMode {
  return value === 'mosaic' || value === 'cards' || value === 'list' ? value : DEFAULT_SETTINGS.libraryViewMode
}

function readLibraryCardsPerRow(value: unknown): LibraryCardsPerRow {
  return value === 4 || value === 5 || value === 6 ? value : DEFAULT_SETTINGS.libraryCardsPerRow
}

function getSyncErrorMessage(reason: unknown, fallback: string) {
  if (isPermissionDeniedError(reason)) {
    return 'No se pudo sincronizar Firebase. Revisa que las reglas de Firestore esten desplegadas.'
  }

  return reason instanceof Error && reason.message ? reason.message : fallback
}

function isPermissionDeniedError(reason: unknown) {
  const code = typeof (reason as { code?: unknown })?.code === 'string' ? (reason as { code: string }).code : undefined
  const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''

  return code === 'permission-denied' || message.includes('Missing or insufficient permissions')
}

function demoExternalCandidates(query: string, type: string): ExternalCandidate[] {
  const base = nowIso()
  const cleanedQuery = query.trim() || 'Nueva recomendacion'
  return [
    {
      id: `demo-${slugify(cleanedQuery)}`,
      title: cleanedQuery,
      type: type === 'watch' || type === 'any' ? 'movie' : (type as ExternalCandidate['type']),
      source: 'tmdb',
      sourceId: `demo-${slugify(cleanedQuery)}`,
      overview: 'Candidato de demostracion hasta configurar Firebase Functions.',
      genres: type === 'book' ? ['clasico'] : [],
      externalRefs: {},
      createdAt: base,
    },
  ]
}
