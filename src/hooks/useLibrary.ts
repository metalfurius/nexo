import { useEffect, useState } from 'react'
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
import { searchExternalSources } from '../services/externalSearch'
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

type ActivityDraft = Omit<ActivityEntry, 'createdAt' | 'id'>
const activityEntryLimit = 25
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
        setActivityEntries([])
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
      repository.subscribeActivityEntries(
        (nextEntries) => setActivityEntries(nextEntries),
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

  async function reactivateRecommendation(id: string) {
    if (repository) {
      await repository.reactivateRecommendation(id)
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
      await repository.setRecommendationCooldown(id, cooldownUntil)
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
      await repository.recordRecommendation(itemId, reasons)
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
    const candidates = await searchExternalSources(query, type)
    return candidates.length ? candidates : demoExternalCandidates(query, type)
  }

  async function searchPublicCatalog(query: string, type?: string): Promise<PublicCatalogItem[]> {
    if (repository) return repository.searchPublicCatalog(query, type)

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

  async function listPublicCatalog(): Promise<PublicCatalogItem[]> {
    if (repository) return repository.listPublicCatalog()

    return publicCatalog
      .filter((item) => !item.archivedAt)
      .sort((left, right) => left.title.localeCompare(right.title, 'es'))
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
    const currentCandidatesById = new Map(discoveryCandidates.map((candidate) => [candidate.id, candidate]))
    const candidatesToPersist = normalized.filter(
      (candidate) => !shouldPreserveDiscoveryDecision(currentCandidatesById.get(candidate.id), candidate),
    )
    setDiscoveryCandidates((current) => mergeCandidates(normalized, current))
    if (repository) {
      try {
        await Promise.all(candidatesToPersist.map((candidate) => repository.saveDiscoveryCandidate(candidate)))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo persistir la cola de exploracion.')
        throw reason
      }
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
      try {
        await repository.dismissDiscoveryCandidate(candidateId)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo persistir el descarte.')
      }
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
      try {
        await repository.restoreDiscoveryCandidate(candidateId)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo restaurar el hallazgo.')
      }
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
      try {
        await repository.saveActivityEntry(activityEntry)
      } catch (reason) {
        console.warn(reason instanceof Error ? reason.message : 'No se pudo guardar la actividad reciente.')
      }
    }
  }

  async function clearActivityEntries() {
    setActivityEntries([])
    if (repository) {
      try {
        await repository.clearActivityEntries()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo limpiar la actividad reciente.')
      }
    }
  }

  async function restoreActivityEntries(entries: ActivityEntry[]) {
    setActivityEntries((current) => mergeActivityEntries(entries, current))
    if (repository) {
      try {
        for (const entry of entries) {
          await repository.saveActivityEntry(entry)
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo restaurar la actividad reciente.')
      }
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
    activityEntries,
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
    reactivateRecommendation,
    setRecommendationCooldown,
    recordRecommendation,
    searchExternal,
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
