import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  THEME_MODES,
  type ActivityEntry,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ExternalRefs,
  type LibraryCardsPerRow,
  type LibraryViewMode,
  type ListItem,
  type PublicCatalogItem,
  type UserProfile,
  type UserSettings,
  nowIso,
} from '../domain/types'
import { mergeDiscoveryCandidate } from '../lib/catalog'
import { normalizeRoadmapPreferences } from '../lib/roadmap'
import { slugify } from '../lib/strings'

export interface SignedInUserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL?: string | null
}

const activityEntryLimit = 25

export function preserveLockedCatalogFields(incoming: ListItem, existing?: ListItem): ListItem {
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
    weights: { ...existing.weights, priority: incoming.weights.priority },
  }
}

function cloneExternalRefs(refs?: ExternalRefs): ExternalRefs | undefined {
  return refs ? { ...refs } : refs
}

export function limitActivityEntries(entries: ActivityEntry[]) {
  return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, activityEntryLimit)
}

export function mergeActivityEntries(restoredEntries: ActivityEntry[], currentEntries: ActivityEntry[]) {
  const byId = new Map(currentEntries.map((entry) => [entry.id, entry]))
  for (const entry of restoredEntries) byId.set(entry.id, entry)
  return limitActivityEntries([...byId.values()])
}

export function toUserProfileSeed(user: SignedInUserProfile): Partial<UserProfile> {
  return {
    uid: user.uid,
    email: user.email ?? undefined,
    displayName: user.displayName ?? undefined,
    photoURL: user.photoURL ?? undefined,
  }
}

export function matchesSearchType(itemType: string, requestedType?: string) {
  if (!requestedType || requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
}

export function upsertItem(items: ListItem[], nextItem: ListItem) {
  return items.some((item) => item.id === nextItem.id)
    ? items.map((item) => (item.id === nextItem.id ? nextItem : item))
    : [nextItem, ...items]
}

export function upsertCatalogItem(items: PublicCatalogItem[], nextItem: PublicCatalogItem) {
  return items.some((item) => item.id === nextItem.id)
    ? items.map((item) => (item.id === nextItem.id ? nextItem : item))
    : [nextItem, ...items]
}

export function mergeCandidates(nextCandidates: DiscoveryCandidate[], currentCandidates: DiscoveryCandidate[]) {
  const byId = new Map(currentCandidates.map((candidate) => [candidate.id, candidate]))
  for (const candidate of nextCandidates) byId.set(candidate.id, mergeDiscoveryCandidate(byId.get(candidate.id), candidate))
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function requireRemotePublicCatalog(loadCatalog: () => Promise<PublicCatalogItem[] | undefined>) {
  const catalog = await loadCatalog().catch(() => undefined)
  if (catalog) return catalog
  throw new Error('No se pudo cargar el catalogo publico remoto. Revisa VITE_PUBLIC_CATALOG_URL.')
}

export function mergeSettings(settings: Partial<UserSettings>): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    theme: settings.theme && THEME_MODES.includes(settings.theme) ? settings.theme : DEFAULT_SETTINGS.theme,
    libraryViewMode: readLibraryViewMode(settings.libraryViewMode),
    libraryCardsPerRow: readLibraryCardsPerRow(settings.libraryCardsPerRow),
    favoriteTags: [...(settings.favoriteTags ?? DEFAULT_SETTINGS.favoriteTags)],
    favoriteGenres: [...(settings.favoriteGenres ?? DEFAULT_SETTINGS.favoriteGenres)],
    blockedTags: [...(settings.blockedTags ?? DEFAULT_SETTINGS.blockedTags)],
    recommendationPreferences: { ...DEFAULT_RECOMMENDATION_PREFERENCES, ...settings.recommendationPreferences },
    roadmap: normalizeRoadmapPreferences(settings.roadmap),
  }
}

function readLibraryViewMode(value: unknown): LibraryViewMode {
  return value === 'mosaic' || value === 'cards' || value === 'list' ? value : DEFAULT_SETTINGS.libraryViewMode
}

function readLibraryCardsPerRow(value: unknown): LibraryCardsPerRow {
  return value === 4 || value === 5 || value === 6 ? value : DEFAULT_SETTINGS.libraryCardsPerRow
}

export function getSyncErrorMessage(reason: unknown, fallback: string) {
  if (isPermissionDeniedError(reason)) {
    return 'No se pudo sincronizar Firebase. Revisa que las reglas de Firestore esten desplegadas.'
  }
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export function isPermissionDeniedError(reason: unknown) {
  const code = typeof (reason as { code?: unknown })?.code === 'string' ? (reason as { code: string }).code : undefined
  const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
  return code === 'permission-denied' || message.includes('Missing or insufficient permissions')
}

export function demoExternalCandidates(query: string, type: string): ExternalCandidate[] {
  const cleanedQuery = query.trim() || 'Nueva recomendacion'
  return [{
    id: `demo-${slugify(cleanedQuery)}`,
    title: cleanedQuery,
    type: type === 'watch' || type === 'any' ? 'movie' : (type as ExternalCandidate['type']),
    source: 'tmdb',
    sourceId: `demo-${slugify(cleanedQuery)}`,
    overview: 'Candidato de demostracion hasta configurar Firebase Functions.',
    genres: type === 'book' ? ['clasico'] : [],
    externalRefs: {},
    createdAt: nowIso(),
  }]
}
