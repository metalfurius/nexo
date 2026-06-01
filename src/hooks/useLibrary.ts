import { useEffect, useState } from 'react'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
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
import { demoItems } from '../data/demoItems'
import { demoPublicCatalog } from '../data/demoCatalog'
import {
  buildPublicCatalogItem,
  discoveryToListItem,
  externalCandidateToDiscovery,
  publicItemToDiscovery,
} from '../lib/catalog'
import { slugify, uniqueValues } from '../lib/strings'
import { isFirebaseConfigured } from '../services/firebaseConfig'
import type { LibraryRepository } from '../services/libraryRepository'

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

export function useLibrary(user?: SignedInUserProfile | null) {
  const userId = user?.uid
  const [repositoryState, setRepositoryState] = useState<{ repository?: LibraryRepository; userId?: string }>({})
  const repository = repositoryState.userId === userId ? repositoryState.repository : undefined
  const [remoteItems, setRemoteItems] = useState<ListItem[]>([])
  const [remoteUserId, setRemoteUserId] = useState<string | undefined>()
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [discoveryCandidates, setDiscoveryCandidates] = useState<DiscoveryCandidate[]>([])
  const [publicCatalog, setPublicCatalog] = useState<PublicCatalogItem[]>(demoPublicCatalog)
  const [profileRole, setProfileRole] = useState<{ role: UserRole; userId?: string }>({ role: 'user' })
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>(demoUserProfiles)
  const [demoLibrary, setDemoLibrary] = useState<ListItem[]>(demoItems)
  const [error, setError] = useState<string | undefined>()
  const expectsRemote = Boolean(isFirebaseConfigured && userId)
  const repositoryLoading = Boolean(expectsRemote && repositoryState.userId !== userId)
  const remoteReady = Boolean(repository && userId && remoteUserId === userId)
  const loading = Boolean(repositoryLoading || (repository && !remoteReady))
  const items = expectsRemote ? (remoteReady ? remoteItems : []) : demoLibrary
  const activeError = expectsRemote ? error : undefined
  const userRole = expectsRemote ? (profileRole.userId === userId ? profileRole.role : 'user') : 'admin'
  const isModerator = userRole === 'admin' || userRole === 'moderator'

  useEffect(() => {
    if (!userId || !isFirebaseConfigured) {
      return undefined
    }

    let disposed = false

    void import('../services/libraryRepository')
      .then(({ createFirestoreRepository }) => {
        if (disposed) return
        setRemoteItems([])
        setRemoteUserId(undefined)
        setDiscoveryCandidates([])
        setProfileRole({ role: 'user', userId })
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
      (nextItems) => {
        setRemoteItems(nextItems)
        setRemoteUserId(userId)
        setError(undefined)
      },
      (reason) => {
        setRemoteItems([])
        setRemoteUserId(userId)
        setError(reason.message)
      },
    )
  }, [repository, userId])

  useEffect(() => {
    if (!repository || !userId || !user) {
      return undefined
    }

    const unsubscribers = [
      repository.subscribeUserProfile(
        (profile) => setProfileRole({ role: profile?.role ?? 'user', userId }),
        (reason) => setError(reason.message),
      ),
      repository.subscribeSettings(
        (remoteSettings) => setSettings(mergeSettings(remoteSettings)),
        (reason) => setError(reason.message),
      ),
      repository.subscribeDiscoveryCandidates(
        (nextCandidates) => setDiscoveryCandidates((current) => mergeCandidates(nextCandidates, current)),
        (reason) => setError(reason.message),
      ),
    ]

    void repository
      .ensureUserProfile(toUserProfileSeed(user))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el perfil.'))

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [repository, user, userId])

  useEffect(() => {
    if (!repository || !userId || userRole !== 'admin') {
      return undefined
    }

    return repository.subscribeUserProfiles(
      (profiles) => setUserProfiles(profiles),
      (reason) => setError(reason.message),
    )
  }, [repository, userId, userRole])

  async function saveItem(item: ListItem) {
    const normalized = {
      ...item,
      tags: uniqueValues(item.tags),
      genres: uniqueValues(item.genres),
      moodTags: uniqueValues(item.moodTags),
      updatedAt: nowIso(),
    }
    if (repository) {
      await repository.saveItem(normalized)
    } else {
      setDemoLibrary((current) => upsertItem(current, normalized))
    }
  }

  async function deleteItem(id: string) {
    if (repository) {
      await repository.deleteItem(id)
    } else {
      setDemoLibrary((current) => current.filter((item) => item.id !== id))
    }
  }

  async function deleteAllItems() {
    if (repository) {
      await repository.deleteAllItems()
    } else {
      setDemoLibrary([])
    }
  }

  async function setStatus(id: string, status: ItemStatus) {
    if (repository) {
      await repository.setStatus(id, status)
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
      await repository.snoozeRecommendation(id)
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

  async function recordRecommendation(itemId: string, reasons: string[]) {
    if (repository) await repository.recordRecommendation(itemId, reasons)
  }

  async function searchExternal(query: string, type: string): Promise<ExternalCandidate[]> {
    if (repository) return repository.searchExternal(query, type)
    return demoExternalCandidates(query, type)
  }

  async function searchPublicCatalog(query: string, type?: string): Promise<PublicCatalogItem[]> {
    if (repository) return repository.searchPublicCatalog(query, type)

    const normalized = query.trim().toLowerCase()
    return publicCatalog
      .filter((item) => !item.archivedAt)
      .filter((item) => matchesSearchType(item.type, type))
      .filter((item) => {
        const haystack = `${item.title} ${item.genres.join(' ')} ${item.tags.join(' ')}`.toLowerCase()
        return !normalized || haystack.includes(normalized)
      })
  }

  async function saveSettings(nextSettings: Partial<UserSettings>) {
    const merged = mergeSettings({ ...settings, ...nextSettings })
    setSettings(merged)
    if (repository) await repository.saveSettings(nextSettings)
  }

  async function queueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
    const normalized = candidates.map((candidate) => ({
      ...candidate,
      status: candidate.status ?? 'queued',
      updatedAt: nowIso(),
    }))
    setDiscoveryCandidates((current) => mergeCandidates(normalized, current))
    if (repository) {
      try {
        await Promise.all(normalized.map((candidate) => repository.saveDiscoveryCandidate(candidate)))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo persistir la cola de exploracion.')
        throw reason
      }
    }
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
      try {
        await repository.dismissDiscoveryCandidate(candidateId)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo persistir el descarte.')
      }
    }
  }

  async function saveDiscoveryToLibrary(candidate: DiscoveryCandidate) {
    const item = discoveryToListItem(candidate)
    await saveItem(item)
    const savedAt = nowIso()
    setDiscoveryCandidates((current) =>
      current.map((entry) =>
        entry.id === candidate.id ? { ...entry, status: 'saved', savedItemId: item.id, updatedAt: savedAt } : entry,
      ),
    )
    if (repository) {
      try {
        await repository.markDiscoveryCandidateSaved(candidate.id, item.id)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo persistir el estado del candidato.')
      }
    }
    return item
  }

  async function upsertPublicItem(item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) {
    if (repository) return repository.upsertPublicItem(item)

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

  async function updateUserRole(targetUserId: string, role: UserRole) {
    if (repository) {
      await repository.updateUserRole(targetUserId, role)
    } else {
      setUserProfiles((current) =>
        current.map((profile) => (profile.uid === targetUserId ? { ...profile, role, updatedAt: nowIso() } : profile)),
      )
    }
  }

  function candidateToItem(candidate: ExternalCandidate): ListItem {
    return {
      id: `${candidate.type}-${slugify(candidate.title)}-${candidate.sourceId}`.slice(0, 120),
      title: candidate.title,
      type: candidate.type,
      status: 'wishlist',
      genres: candidate.genres,
      tags: uniqueValues([candidate.type, candidate.source, ...candidate.genres]),
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      notes: candidate.overview,
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
    userProfiles: userRole === 'admin' ? userProfiles : [],
    userRole,
    isModerator,
    loading,
    error: activeError,
    saveItem,
    deleteItem,
    deleteAllItems,
    setStatus,
    snoozeRecommendation,
    recordRecommendation,
    searchExternal,
    searchPublicCatalog,
    saveSettings,
    queueDiscoveryCandidates,
    dismissDiscoveryCandidate,
    saveDiscoveryToLibrary,
    upsertPublicItem,
    archivePublicItem,
    updateUserRole,
    candidateToItem,
    publicItemToDiscovery,
    externalCandidateToDiscovery,
  }
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
  const byId = new Map<string, DiscoveryCandidate>()
  for (const candidate of [...nextCandidates, ...currentCandidates]) {
    const current = byId.get(candidate.id)
    if (!current || candidate.updatedAt.localeCompare(current.updatedAt) > 0) {
      byId.set(candidate.id, candidate)
    }
  }
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function mergeSettings(settings: Partial<UserSettings>): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    libraryViewMode: settings.libraryViewMode === 'list' ? 'list' : DEFAULT_SETTINGS.libraryViewMode,
    recommendationPreferences: {
      ...DEFAULT_RECOMMENDATION_PREFERENCES,
      ...settings.recommendationPreferences,
    },
  }
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
