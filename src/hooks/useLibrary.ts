import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type ActivityEntry,
  DEFAULT_SETTINGS,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ItemStatus,
  type LibraryBulkDeleteResult,
  type LibrarySyncState,
  type ListItem,
  type PublicCatalogItem,
  type RoadmapItemMutation,
  type RoadmapMutation,
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
  publicItemToDiscovery,
  prepareDiscoveryCandidateForQueue,
} from '../lib/catalog'
import {
  dedupeCatalogSearchCandidates,
  rankCatalogSearchCandidates,
  scoreCatalogSearchCandidate,
} from '../lib/catalogSearch'
import {
  applyRoadmapMutationToLibrary,
  cleanupRoadmapPreferences,
  getRoadmapForItemMutation,
  normalizeRoadmapPreferences,
  prepareRoadmapBatchMutation,
} from '../lib/roadmap'
import { uniqueValues } from '../lib/strings'
import { isFirebaseConfigured } from '../services/firebaseConfig'
import { isFirestoreOfflinePersistenceEnabled } from '../services/devicePreferences'
import { fetchPublicCatalog } from '../services/publicCatalog'
import {
  searchCatalogSources,
  type CatalogSearchRequest,
  type CatalogSearchResult,
} from '../services/catalogSearchClient'
import type { LibraryRepository, RepositorySnapshotState } from '../services/libraryRepository'
import { demoExternalCandidates, getSyncErrorMessage, isPermissionDeniedError, limitActivityEntries, matchesSearchType, mergeActivityEntries, mergeCandidates, mergeSettings, preserveLockedCatalogFields, requireRemotePublicCatalog, toUserProfileSeed, upsertCatalogItem, upsertItem, type SignedInUserProfile } from './libraryState'

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
const anonymousPublicCatalogLimit = 48
const emptyLibraryItems: ListItem[] = []
type SyncSliceId = 'items' | 'settings' | 'discovery' | 'activity' | 'profile' | 'profiles'
interface SaveDiscoveryOptions {
  persistDiscoveryCandidate?: boolean
  registerPublicCatalog?: boolean
}

export function useLibrary(user?: SignedInUserProfile | null) {
  const userId = user?.uid
  const [repositoryState, setRepositoryState] = useState<{ repository?: LibraryRepository; userId?: string }>({})
  const repository = repositoryState.userId === userId ? repositoryState.repository : undefined
  const [remoteItems, setRemoteItems] = useState<ListItem[]>([])
  const [remoteUserId, setRemoteUserId] = useState<string | undefined>()
  const [settings, setSettings] = useState<UserSettings>(() => mergeSettings({}))
  const [discoveryCandidates, setDiscoveryCandidates] = useState<DiscoveryCandidate[]>([])
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([])
  const [publicCatalog, setPublicCatalog] = useState<PublicCatalogItem[]>(demoPublicCatalog)
  const [profileRole, setProfileRole] = useState<{ role: UserRole; userId?: string }>({ role: 'user' })
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>(() => isFirebaseConfigured ? [] : demoUserProfiles)
  const [demoLibrary, setDemoLibrary] = useState<ListItem[]>(demoItems)
  const [syncSlices, setSyncSlices] = useState<Partial<Record<SyncSliceId, RepositorySnapshotState>>>({})
  const [localPendingWriteCount, setLocalPendingWriteCount] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const usesDemoMode = !isFirebaseConfigured
  const expectsRemote = Boolean(isFirebaseConfigured && userId)
  const repositoryLoading = Boolean(expectsRemote && repositoryState.userId !== userId)
  const remoteReady = Boolean(repository && userId && remoteUserId === userId)
  const loading = Boolean(repositoryLoading || (repository && !remoteReady))
  const items = expectsRemote ? (remoteReady ? remoteItems : emptyLibraryItems) : usesDemoMode ? demoLibrary : emptyLibraryItems
  const privateSliceOwnerMatches = Boolean(expectsRemote && repositoryState.userId === userId)
  const visibleSettings = expectsRemote
    ? privateSliceOwnerMatches ? settings : DEFAULT_SETTINGS
    : usesDemoMode ? settings : DEFAULT_SETTINGS
  const visibleDiscoveryCandidates = expectsRemote
    ? privateSliceOwnerMatches ? discoveryCandidates : []
    : usesDemoMode ? discoveryCandidates : []
  const visibleActivityEntries = expectsRemote
    ? privateSliceOwnerMatches ? activityEntries : []
    : usesDemoMode ? activityEntries : []
  const activeError = expectsRemote ? error : undefined
  const userRole = expectsRemote
    ? (profileRole.userId === userId ? profileRole.role : 'user')
    : usesDemoMode
      ? 'admin'
      : 'user'
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
  const itemsRef = useRef(items)
  const settingsRef = useRef(settings)
  const discoveryCandidatesRef = useRef(visibleDiscoveryCandidates)
  const roadmapMutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const roadmapMutationSessionRef = useRef(userId)
  const activePrivateSessionRef = useRef(userId)

  if (activePrivateSessionRef.current !== userId) {
    activePrivateSessionRef.current = userId
    itemsRef.current = emptyLibraryItems
    settingsRef.current = mergeSettings({})
    discoveryCandidatesRef.current = []
    roadmapMutationSessionRef.current = userId
    roadmapMutationQueueRef.current = Promise.resolve()
  }

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    discoveryCandidatesRef.current = expectsRemote
      ? privateSliceOwnerMatches ? discoveryCandidates : []
      : usesDemoMode ? discoveryCandidates : []
  }, [discoveryCandidates, expectsRemote, privateSliceOwnerMatches, usesDemoMode])

  useEffect(() => {
    if (roadmapMutationSessionRef.current === userId) return
    roadmapMutationSessionRef.current = userId
    roadmapMutationQueueRef.current = Promise.resolve()
  }, [userId])

  const updateSyncSlice = useCallback((sliceId: SyncSliceId, snapshotState?: RepositorySnapshotState) => {
    if (!snapshotState) return
    setSyncSlices((current) => ({ ...current, [sliceId]: snapshotState }))
  }, [])

  const trackRepositoryWrite = useCallback(async (promise: Promise<void>, fallback: string) => {
    const requestedSession = activePrivateSessionRef.current
    setLocalPendingWriteCount((current) => current + 1)
    try {
      await promise
    } catch (reason) {
      if (activePrivateSessionRef.current === requestedSession) {
        setError(reason instanceof Error ? reason.message : fallback)
      }
      throw reason
    } finally {
      if (activePrivateSessionRef.current === requestedSession) {
        setLocalPendingWriteCount((current) => Math.max(0, current - 1))
      }
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
        if (isFirebaseConfigured) {
          setRepositoryState({})
          setRemoteItems([])
          setRemoteUserId(undefined)
          setSettings(mergeSettings({}))
          setDiscoveryCandidates([])
          setActivityEntries([])
          setProfileRole({ role: 'user' })
          setUserProfiles([])
          setError(undefined)
        }
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    let disposed = false

    void import('../services/libraryRepository')
      .then(({ createFirestoreRepository }) => {
        if (disposed) return
        const emptySettings = mergeSettings({})
        itemsRef.current = emptyLibraryItems
        settingsRef.current = emptySettings
        setRemoteItems([])
        setRemoteUserId(undefined)
        setSettings(emptySettings)
        setDiscoveryCandidates([])
        setActivityEntries([])
        setProfileRole({ role: 'user', userId })
        setUserProfiles([])
        setSyncSlices({})
        setLocalPendingWriteCount(0)
        setLastSyncedAt(undefined)
        setError(undefined)
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

    let active = true

    const unsubscribe = repository.subscribeItems(
      (nextItems, snapshotState) => {
        if (!active || activePrivateSessionRef.current !== userId) return
        itemsRef.current = nextItems
        setRemoteItems(nextItems)
        setRemoteUserId(userId)
        updateSyncSlice('items', snapshotState)
        setError(undefined)
      },
      (reason) => {
        if (!active || activePrivateSessionRef.current !== userId) return
        itemsRef.current = emptyLibraryItems
        setRemoteItems([])
        setRemoteUserId(userId)
        setError(getSyncErrorMessage(reason, 'No se pudo cargar la biblioteca.'))
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [repository, updateSyncSlice, userId])

  useEffect(() => {
    if (!repository || !userId || !user) {
      return undefined
    }

    let active = true

    const unsubscribers = [
      repository.subscribeUserProfile(
        (profile, snapshotState) => {
          if (!active || activePrivateSessionRef.current !== userId) return
          setProfileRole({ role: profile?.role ?? 'user', userId })
          updateSyncSlice('profile', snapshotState)
        },
        (reason) => {
          if (active && activePrivateSessionRef.current === userId) {
            setError(getSyncErrorMessage(reason, 'No se pudo cargar el perfil.'))
          }
        },
      ),
      repository.subscribeSettings(
        (remoteSettings, snapshotState) => {
          if (!active || activePrivateSessionRef.current !== userId) return
          const nextSettings = mergeSettings(remoteSettings)
          settingsRef.current = nextSettings
          setSettings(nextSettings)
          updateSyncSlice('settings', snapshotState)
        },
        (reason) => {
          if (active && activePrivateSessionRef.current === userId) {
            setError(getSyncErrorMessage(reason, 'No se pudieron cargar los ajustes.'))
          }
        },
      ),
      repository.subscribeDiscoveryCandidates(
        (nextCandidates, snapshotState) => {
          if (!active || activePrivateSessionRef.current !== userId) return
          setDiscoveryCandidates((current) => mergeCandidates(nextCandidates, current))
          updateSyncSlice('discovery', snapshotState)
        },
        (reason) => {
          if (active && activePrivateSessionRef.current === userId) {
            setError(getSyncErrorMessage(reason, 'No se pudo cargar la cola de exploracion.'))
          }
        },
      ),
      repository.subscribeActivityEntries(
        (nextEntries, snapshotState) => {
          if (!active || activePrivateSessionRef.current !== userId) return
          setActivityEntries(nextEntries)
          updateSyncSlice('activity', snapshotState)
        },
        (reason) => {
          if (!active || activePrivateSessionRef.current !== userId) return
          setActivityEntries([])
          if (!isPermissionDeniedError(reason)) {
            setError(getSyncErrorMessage(reason, 'No se pudo cargar la actividad reciente.'))
          }
        },
      ),
    ]

    void repository
      .ensureUserProfile(toUserProfileSeed(user))
      .catch((reason) => {
        if (active && activePrivateSessionRef.current === userId) {
          setError(getSyncErrorMessage(reason, 'No se pudo actualizar el perfil.'))
        }
      })

    return () => {
      active = false
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [repository, updateSyncSlice, user, userId])

  useEffect(() => {
    if (!repository || !userId || userRole !== 'admin') {
      return undefined
    }

    let active = true

    const unsubscribe = repository.subscribeUserProfiles(
      (profiles, snapshotState) => {
        if (!active || activePrivateSessionRef.current !== userId) return
        setUserProfiles(profiles)
        updateSyncSlice('profiles', snapshotState)
      },
      (reason) => {
        if (active && activePrivateSessionRef.current === userId) {
          setError(getSyncErrorMessage(reason, 'No se pudieron cargar los perfiles.'))
        }
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [repository, updateSyncSlice, userId, userRole])

  function requirePrivateSession() {
    if (activePrivateSessionRef.current !== userId) {
      throw new Error('La sesion cambio antes de completar la operacion privada.')
    }
    if (isFirebaseConfigured && !userId) {
      throw new Error('Inicia sesion para guardar cambios privados.')
    }
    if (isFirebaseConfigured && !repository) {
      throw new Error('Tu biblioteca todavia se esta cargando.')
    }
  }

  function enqueueRoadmapMutation(task: () => Promise<void>) {
    const requestedSession = userId
    const run = roadmapMutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (roadmapMutationSessionRef.current !== requestedSession) {
          throw new Error('La sesion cambio antes de guardar la mutacion de Tu ruta.')
        }
        await task()
      })
    roadmapMutationQueueRef.current = run.catch(() => undefined)
    return run
  }

  function applyOptimisticRoadmapState(nextState: ReturnType<typeof applyRoadmapMutationToLibrary>) {
    itemsRef.current = nextState.items
    settingsRef.current = nextState.settings
    setSettings(nextState.settings)
    if (repository) {
      setRemoteItems(nextState.items)
      if (userId) setRemoteUserId(userId)
    } else {
      setDemoLibrary(nextState.items)
    }
  }

  function applyRoadmapItemMutation(itemMutation: RoadmapItemMutation) {
    requirePrivateSession()
    return enqueueRoadmapMutation(async () => {
      const updatedAt = nowIso()
      const currentState = { items: itemsRef.current, settings: settingsRef.current }
      const mutation: RoadmapMutation = {
        item: itemMutation,
        roadmap: getRoadmapForItemMutation(currentState, itemMutation),
      }
      const nextState = applyRoadmapMutationToLibrary(
        currentState.items,
        currentState.settings,
        mutation,
        updatedAt,
      )
      applyOptimisticRoadmapState(nextState)
      if (repository) {
        await trackRepositoryWrite(
          repository.applyRoadmapMutation({ ...mutation, roadmap: nextState.settings.roadmap }),
          'No se pudo actualizar Tu ruta.',
        )
      }
    })
  }

  async function saveItem(item: ListItem) {
    requirePrivateSession()
    const existingItem = items.find((currentItem) => currentItem.id === item.id)
    const protectedItem = preserveLockedCatalogFields(item, existingItem)
    const normalized = {
      ...protectedItem,
      tags: uniqueValues(protectedItem.tags),
      genres: uniqueValues(protectedItem.genres),
      moodTags: uniqueValues(protectedItem.moodTags),
      updatedAt: nowIso(),
    }
    if (existingItem && existingItem.status !== normalized.status) {
      return applyRoadmapItemMutation({ item: normalized, kind: 'upsert' })
    }
    if (repository) {
      itemsRef.current = upsertItem(itemsRef.current, normalized)
      setRemoteItems((current) => upsertItem(current, normalized))
      if (userId) setRemoteUserId(userId)
      return trackRepositoryWrite(repository.saveItem(normalized), 'No se pudo guardar la ficha.')
    } else {
      setDemoLibrary((current) => upsertItem(current, normalized))
    }
  }

  async function deleteItem(id: string) {
    return applyRoadmapItemMutation({ kind: 'delete', itemId: id })
  }

  async function deleteAllItems(): Promise<LibraryBulkDeleteResult> {
    requirePrivateSession()
    const requestedSession = activePrivateSessionRef.current
    if (repository) {
      setLocalPendingWriteCount((current) => current + 1)
      try {
        const result = await repository.deleteAllItems(settingsRef.current.roadmap)
        if (activePrivateSessionRef.current !== requestedSession) return result

        const deletedIds = new Set(result.deletedItemIds)
        const nextItems = itemsRef.current.filter((item) => !deletedIds.has(item.id))
        const nextSettings = { ...settingsRef.current, roadmap: result.roadmap }
        itemsRef.current = nextItems
        settingsRef.current = nextSettings
        setRemoteItems(nextItems)
        if (userId) setRemoteUserId(userId)
        setSettings(nextSettings)
        setError(result.complete ? undefined : result.error ?? 'El borrado masivo quedo incompleto.')
        return result
      } catch (reason) {
        if (activePrivateSessionRef.current === requestedSession) {
          setError(reason instanceof Error ? reason.message : 'No se pudieron borrar las entradas privadas.')
        }
        throw reason
      } finally {
        if (activePrivateSessionRef.current === requestedSession) {
          setLocalPendingWriteCount((current) => Math.max(0, current - 1))
        }
      }
    }

    const deletedItemIds = demoLibrary.map((item) => item.id)
    const roadmap = normalizeRoadmapPreferences(undefined)
    const nextSettings = { ...settingsRef.current, roadmap }
    itemsRef.current = emptyLibraryItems
    settingsRef.current = nextSettings
    setDemoLibrary([])
    setSettings(nextSettings)
    return { complete: true, deletedItemIds, roadmap, total: deletedItemIds.length }
  }

  async function setStatus(id: string, status: ItemStatus) {
    return applyRoadmapItemMutation({ kind: 'status', itemId: id, status })
  }

  async function applyRoadmapMutation(mutation: RoadmapMutation) {
    requirePrivateSession()
    return enqueueRoadmapMutation(async () => {
      const updatedAt = nowIso()
      const nextState = applyRoadmapMutationToLibrary(
        itemsRef.current,
        settingsRef.current,
        mutation,
        updatedAt,
      )
      applyOptimisticRoadmapState(nextState)
      if (repository) {
        await trackRepositoryWrite(
          repository.applyRoadmapMutation({ ...mutation, roadmap: nextState.settings.roadmap }),
          'No se pudo actualizar Tu ruta.',
        )
      }
    })
  }

  async function applyRoadmapBatchMutation(itemMutations: RoadmapItemMutation[]) {
    requirePrivateSession()
    if (!itemMutations.length) return
    return enqueueRoadmapMutation(async () => {
      const prepared = prepareRoadmapBatchMutation(
        itemsRef.current,
        settingsRef.current,
        itemMutations,
        nowIso(),
      )
      applyOptimisticRoadmapState(prepared.state)
      if (repository) {
        await trackRepositoryWrite(
          repository.applyRoadmapBatchMutation(prepared.mutation),
          'No se pudo actualizar la seleccion de Tu ruta.',
        )
      }
    })
  }

  async function snoozeRecommendation(id: string) {
    requirePrivateSession()
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
    requirePrivateSession()
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
    requirePrivateSession()
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
    requirePrivateSession()
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
      return requireRemotePublicCatalog(() => fetchPublicCatalog(query, type ?? 'any', anonymousPublicCatalogLimit))
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
      dedupeCatalogSearchCandidates([
        ...publicItems.map(publicItemToDiscovery),
        ...externalCandidates.map(externalCandidateToDiscovery),
      ]),
      cleanedQuery,
      type,
    ).slice(0, 24)
  }

  async function searchCatalogRequest(request: CatalogSearchRequest): Promise<CatalogSearchResult> {
    if (isFirebaseConfigured || hasConfiguredCatalogSearchEndpoints()) return searchCatalogSources(request)

    const candidates = (await searchPublicCatalog(request.query, request.type)).map(publicItemToDiscovery)
    return {
      candidates,
      partial: false,
      sources: ['publicCatalog'],
    }
  }

  async function listPublicCatalog(): Promise<PublicCatalogItem[]> {
    if (repository) return repository.listPublicCatalog()
    if (isFirebaseConfigured) {
      return requireRemotePublicCatalog(() => fetchPublicCatalog('', 'any', anonymousPublicCatalogLimit))
    }

    return publicCatalog
      .filter((item) => !item.archivedAt)
      .sort((left, right) => left.title.localeCompare(right.title, 'es'))
  }

  async function saveSettings(nextSettings: Partial<UserSettings>) {
    requirePrivateSession()
    const requestedSession = activePrivateSessionRef.current
    const currentSettings = settingsRef.current
    const includesRoadmap = Object.prototype.hasOwnProperty.call(nextSettings, 'roadmap')
    const merged = mergeSettings({
      ...currentSettings,
      ...nextSettings,
      recommendationPreferences: {
        ...currentSettings.recommendationPreferences,
        ...nextSettings.recommendationPreferences,
      },
      roadmap: includesRoadmap
        ? cleanupRoadmapPreferences(nextSettings.roadmap ?? currentSettings.roadmap, itemsRef.current)
        : currentSettings.roadmap,
    })
    settingsRef.current = merged
    setSettings(merged)
    if (repository) {
      const settingsPatch: Partial<UserSettings> = { ...nextSettings }
      if (includesRoadmap) settingsPatch.roadmap = merged.roadmap
      try {
        await trackRepositoryWrite(repository.saveSettings(settingsPatch), 'No se pudieron guardar los ajustes.')
      } catch (reason) {
        if (activePrivateSessionRef.current === requestedSession && settingsRef.current === merged) {
          settingsRef.current = currentSettings
          setSettings(currentSettings)
        }
        throw reason
      }
    }
  }

  async function queueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
    requirePrivateSession()
    const timestamp = nowIso()
    const candidatesById = new Map(discoveryCandidatesRef.current.map((candidate) => [candidate.id, candidate]))
    const candidatesToPersist = new Map<string, DiscoveryCandidate>()
    for (const incoming of candidates) {
      const prepared = prepareDiscoveryCandidateForQueue(candidatesById.get(incoming.id), incoming, timestamp)
      candidatesById.set(incoming.id, prepared.candidate)
      if (prepared.persist) candidatesToPersist.set(prepared.candidate.id, prepared.candidate)
    }
    if (!candidatesToPersist.size) return 0

    const nextCandidates = [...candidatesById.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    discoveryCandidatesRef.current = nextCandidates
    setDiscoveryCandidates(nextCandidates)
    if (repository) {
      const persistCandidates = async () => {
        for (const candidate of candidatesToPersist.values()) {
          await repository.saveDiscoveryCandidate(candidate)
        }
      }
      await trackRepositoryWrite(
        persistCandidates(),
        'No se pudo persistir la cola de exploracion.',
      )
    }
    return candidatesToPersist.size
  }

  async function dismissDiscoveryCandidate(candidateId: string) {
    requirePrivateSession()
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
    requirePrivateSession()
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
    requirePrivateSession()
    const { persistDiscoveryCandidate = true, registerPublicCatalog = true } = options
    const item = discoveryToListItem(candidate)
    await saveItem(item)
    if (repository && registerPublicCatalog) {
      await trackRepositoryWrite(
        repository.recordDiscoverySaveToPublicCatalog(candidate),
        'No se pudo registrar la ficha en el catalogo compartido.',
      )
    }
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

  async function recordImportedItemToPublicCatalog(item: ListItem) {
    return recordImportedItemsToPublicCatalog([item])
  }

  async function recordImportedItemsToPublicCatalog(itemsToRecord: ListItem[]) {
    requirePrivateSession()
    if (!repository || !itemsToRecord.length) return

    setLocalPendingWriteCount((current) => current + 1)
    try {
      await repository.recordImportedItemsToPublicCatalog(itemsToRecord)
    } finally {
      setLocalPendingWriteCount((current) => Math.max(0, current - 1))
    }
  }

  async function upsertPublicItem(item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) {
    requirePrivateSession()
    if (repository) return repository.upsertPublicItem(item)

    const nextItem = buildPublicCatalogItem(item, 'demo-moderator')
    setPublicCatalog((current) => upsertCatalogItem(current, nextItem))
    return nextItem
  }

  async function replacePublicItem(item: PublicCatalogItem) {
    requirePrivateSession()
    if (repository) return repository.replacePublicItem(item)

    const nextItem = buildPublicCatalogItem(item, 'demo-moderator')
    setPublicCatalog((current) => upsertCatalogItem(current, nextItem))
    return nextItem
  }

  async function archivePublicItem(id: string) {
    requirePrivateSession()
    if (repository) {
      await repository.archivePublicItem(id)
    } else {
      setPublicCatalog((current) =>
        current.map((item) => (item.id === id ? { ...item, archivedAt: nowIso(), updatedAt: nowIso() } : item)),
      )
    }
  }

  async function restorePublicItem(id: string) {
    requirePrivateSession()
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
    requirePrivateSession()
    if (repository) {
      await repository.updateUserRole(targetUserId, role)
    } else {
      setUserProfiles((current) =>
        current.map((profile) => (profile.uid === targetUserId ? { ...profile, role, updatedAt: nowIso() } : profile)),
      )
    }
  }

  async function recordActivity(entry: ActivityDraft) {
    if (isFirebaseConfigured && !userId) return
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
    requirePrivateSession()
    setActivityEntries([])
    if (repository) {
      return trackRepositoryWrite(repository.clearActivityEntries(), 'No se pudo limpiar la actividad reciente.')
    }
  }

  async function restoreActivityEntries(entries: ActivityEntry[]) {
    requirePrivateSession()
    setActivityEntries((current) => mergeActivityEntries(entries, current))
    if (repository) {
      return trackRepositoryWrite(
        Promise.all(entries.map((entry) => repository.saveActivityEntry(entry))).then(() => undefined),
        'No se pudo restaurar la actividad reciente.',
      )
    }
  }

  function candidateToItem(candidate: ExternalCandidate): ListItem {
    return discoveryToListItem(externalCandidateToDiscovery(candidate))
  }

  return {
    items,
    settings: visibleSettings,
    discoveryCandidates: visibleDiscoveryCandidates,
    activityEntries: visibleActivityEntries,
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
    applyRoadmapMutation,
    applyRoadmapBatchMutation,
    snoozeRecommendation,
    reactivateRecommendation,
    setRecommendationCooldown,
    recordRecommendation,
    searchExternal,
    searchCatalog,
    searchCatalogRequest,
    listPublicCatalog,
    searchPublicCatalog,
    saveSettings,
    queueDiscoveryCandidates,
    dismissDiscoveryCandidate,
    restoreDiscoveryCandidate,
    saveDiscoveryToLibrary,
    recordImportedItemToPublicCatalog,
    recordImportedItemsToPublicCatalog,
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

function hasConfiguredCatalogSearchEndpoints() {
  return Boolean(
    String(import.meta.env.VITE_PUBLIC_CATALOG_URL ?? '').trim() ||
    String(import.meta.env.VITE_CATALOG_API_URL ?? '').trim(),
  )
}
