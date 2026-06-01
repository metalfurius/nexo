import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  ITEM_STATUSES,
  ITEM_TYPES,
  type ExternalRefs,
  type ItemStatus,
  type ItemType,
  type ListItem,
  type PublicCatalogSnapshot,
  type RecommendationPreferences,
  type UserSettings,
  nowIso,
} from '../domain/types'
import { slugify, uniqueValues } from './strings'

export const LIBRARY_EXPORT_SCHEMA_VERSION = 1

export interface LibraryExportPayload {
  schemaVersion: typeof LIBRARY_EXPORT_SCHEMA_VERSION
  exportedAt: string
  items: ListItem[]
  settings: UserSettings
}

export interface ParsedLibraryImport {
  items: ListItem[]
  settings?: UserSettings
}

export function createLibraryExportPayload(
  items: ListItem[],
  settings: UserSettings,
  exportedAt = nowIso(),
): LibraryExportPayload {
  return {
    schemaVersion: LIBRARY_EXPORT_SCHEMA_VERSION,
    exportedAt,
    items,
    settings,
  }
}

export function parseLibraryImportPayload(payload: unknown, importedAt = nowIso()): ParsedLibraryImport {
  const root = asRecord(payload, 'El archivo no es un JSON de Nexo valido')

  if (root.schemaVersion !== LIBRARY_EXPORT_SCHEMA_VERSION) {
    throw new Error(`Version de export no soportada: ${String(root.schemaVersion ?? 'sin version')}`)
  }
  if (!Array.isArray(root.items)) {
    throw new Error('El archivo no tiene una lista de items valida')
  }

  return {
    items: root.items.map((item, index) => normalizeListItem(item, index, importedAt)),
    settings: root.settings ? normalizeSettings(root.settings) : undefined,
  }
}

function normalizeListItem(value: unknown, index: number, importedAt: string): ListItem {
  const item = asRecord(value, `Item ${index + 1} no es valido`)
  const title = requiredString(item.title, `Item ${index + 1} no tiene titulo`)
  const type = readItemType(item.type, `Item ${index + 1} tiene un tipo no soportado`)
  const status = readItemStatus(item.status, `Item ${index + 1} tiene un estado no soportado`)
  const createdAt = optionalString(item.createdAt) ?? importedAt

  return {
    id: optionalString(item.id) ?? `${type}-${slugify(title) || index + 1}`,
    title,
    type,
    status,
    rating: optionalNumber(item.rating),
    durationMinHours: optionalNumber(item.durationMinHours),
    durationMaxHours: optionalNumber(item.durationMaxHours),
    progress: optionalString(item.progress),
    genres: stringList(item.genres),
    tags: stringList(item.tags),
    moodTags: stringList(item.moodTags),
    weights: normalizeWeights(item.weights),
    notes: optionalString(item.notes),
    source: readItemSource(item.source),
    rawText: optionalString(item.rawText),
    importNotes: stringList(item.importNotes),
    externalRefs: normalizeExternalRefs(item.externalRefs),
    posterUrl: optionalString(item.posterUrl),
    publicItemId: optionalString(item.publicItemId),
    publicSnapshot: normalizePublicSnapshot(item.publicSnapshot),
    createdAt,
    updatedAt: importedAt,
    lastRecommendedAt: optionalString(item.lastRecommendedAt),
    recommendationCooldownUntil: optionalString(item.recommendationCooldownUntil),
  }
}

function normalizeSettings(value: unknown): UserSettings {
  const settings = asRecord(value, 'Los ajustes del backup no son validos')
  const recommendationPreferences = normalizeRecommendationPreferences(settings.recommendationPreferences)

  return {
    surprisePercent: optionalNumber(settings.surprisePercent) ?? DEFAULT_SETTINGS.surprisePercent,
    favoriteTags: stringList(settings.favoriteTags),
    favoriteGenres: stringList(settings.favoriteGenres),
    blockedTags: stringList(settings.blockedTags),
    allowPausedByDefault: typeof settings.allowPausedByDefault === 'boolean' ? settings.allowPausedByDefault : DEFAULT_SETTINGS.allowPausedByDefault,
    theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : DEFAULT_SETTINGS.theme,
    recommendationPreferences,
    explorerDefaultType: readExplorerDefaultType(settings.explorerDefaultType),
    libraryViewMode: settings.libraryViewMode === 'list' ? 'list' : DEFAULT_SETTINGS.libraryViewMode,
  }
}

function normalizeRecommendationPreferences(value: unknown): RecommendationPreferences {
  const preferences = asOptionalRecord(value)

  if (!preferences) return DEFAULT_RECOMMENDATION_PREFERENCES

  return {
    medium: readExplorerDefaultType(preferences.medium),
    timeBudgetHours: optionalNumber(preferences.timeBudgetHours),
    energy: preferences.energy === 'low' || preferences.energy === 'medium' || preferences.energy === 'high' ? preferences.energy : DEFAULT_RECOMMENDATION_PREFERENCES.energy,
    intensity:
      preferences.intensity === 'soft' || preferences.intensity === 'balanced' || preferences.intensity === 'intense'
        ? preferences.intensity
        : DEFAULT_RECOMMENDATION_PREFERENCES.intensity,
    novelty:
      preferences.novelty === 'comfort' || preferences.novelty === 'balanced' || preferences.novelty === 'surprise'
        ? preferences.novelty
        : DEFAULT_RECOMMENDATION_PREFERENCES.novelty,
    includePaused: typeof preferences.includePaused === 'boolean' ? preferences.includePaused : DEFAULT_RECOMMENDATION_PREFERENCES.includePaused,
    surprisePercent: optionalNumber(preferences.surprisePercent) ?? DEFAULT_RECOMMENDATION_PREFERENCES.surprisePercent,
    seed: optionalString(preferences.seed) ?? DEFAULT_RECOMMENDATION_PREFERENCES.seed,
  }
}

function normalizeWeights(value: unknown) {
  const weights = asOptionalRecord(value)

  return {
    priority: optionalNumber(weights?.priority) ?? DEFAULT_WEIGHTS.priority,
    surprise: optionalNumber(weights?.surprise) ?? DEFAULT_WEIGHTS.surprise,
    challenge: optionalNumber(weights?.challenge) ?? DEFAULT_WEIGHTS.challenge,
  }
}

function normalizeExternalRefs(value: unknown): ExternalRefs | undefined {
  const refs = asOptionalRecord(value)
  if (!refs) return undefined

  return {
    tmdbId: optionalString(refs.tmdbId),
    rawgId: optionalString(refs.rawgId),
    openLibraryKey: optionalString(refs.openLibraryKey),
    anilistId: optionalString(refs.anilistId),
    wikidataId: optionalString(refs.wikidataId),
    sourceUrl: optionalString(refs.sourceUrl),
  }
}

function normalizePublicSnapshot(value: unknown): PublicCatalogSnapshot | undefined {
  const snapshot = asOptionalRecord(value)
  if (!snapshot) return undefined
  const title = optionalString(snapshot.title)
  const type = typeof snapshot.type === 'string' && ITEM_TYPES.includes(snapshot.type as ItemType) ? (snapshot.type as ItemType) : undefined

  if (!title || !type) return undefined

  return {
    id: optionalString(snapshot.id) ?? `${type}-${slugify(title)}`,
    title,
    type,
    description: optionalString(snapshot.description),
    releaseYear: optionalNumber(snapshot.releaseYear),
    genres: stringList(snapshot.genres),
    tags: stringList(snapshot.tags),
    moodTags: stringList(snapshot.moodTags),
    externalRefs: normalizeExternalRefs(snapshot.externalRefs) ?? {},
    posterUrl: optionalString(snapshot.posterUrl),
    canonicalKey: optionalString(snapshot.canonicalKey) ?? `${type}:${slugify(title)}`,
    updatedAt: optionalString(snapshot.updatedAt) ?? nowIso(),
  }
}

function readItemType(value: unknown, message: string): ItemType {
  if (typeof value === 'string' && ITEM_TYPES.includes(value as ItemType)) return value as ItemType
  throw new Error(message)
}

function readItemStatus(value: unknown, message: string): ItemStatus {
  if (typeof value === 'string' && ITEM_STATUSES.includes(value as ItemStatus)) return value as ItemStatus
  throw new Error(message)
}

function readExplorerDefaultType(value: unknown) {
  if (value === 'any' || value === 'watch') return value
  if (typeof value === 'string' && ITEM_TYPES.includes(value as ItemType)) return value as ItemType
  return DEFAULT_SETTINGS.explorerDefaultType
}

function readItemSource(value: unknown): ListItem['source'] {
  if (value === 'manual' || value === 'markdown' || value === 'external' || value === 'public') return value
  return 'manual'
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  throw new Error(message)
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return undefined
}

function requiredString(value: unknown, message: string) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(message)
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return uniqueValues(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()))
}
