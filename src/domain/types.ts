export const ITEM_TYPES = [
  'game',
  'book',
  'movie',
  'series',
  'anime',
  'manga',
  'manhwa',
  'comic',
  'other',
] as const

export const ITEM_STATUSES = [
  'wishlist',
  'in_progress',
  'paused',
  'completed',
  'dropped',
] as const

export type ItemType = (typeof ITEM_TYPES)[number]
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export type EnergyLevel = 'low' | 'medium' | 'high'
export type IntensityLevel = 'soft' | 'balanced' | 'intense'
export type NoveltyLevel = 'comfort' | 'balanced' | 'surprise'
export type ThemeMode = 'dark' | 'light'
export type DiscoveryOrigin = 'publicCatalog' | 'externalSearch' | 'prompt' | 'roll'
export type DiscoveryStatus = 'queued' | 'saved' | 'dismissed'

export interface ExternalRefs {
  tmdbId?: string
  rawgId?: string
  openLibraryKey?: string
  anilistId?: string
  sourceUrl?: string
}

export interface ItemWeights {
  priority: number
  surprise: number
  challenge: number
}

export interface ListItem {
  id: string
  title: string
  type: ItemType
  status: ItemStatus
  rating?: number
  durationMinHours?: number
  durationMaxHours?: number
  progress?: string
  genres: string[]
  tags: string[]
  moodTags: string[]
  weights: ItemWeights
  notes?: string
  source: 'manual' | 'markdown' | 'external' | 'public'
  rawText?: string
  importNotes?: string[]
  externalRefs?: ExternalRefs
  posterUrl?: string
  publicItemId?: string
  publicSnapshot?: PublicCatalogSnapshot
  createdAt: string
  updatedAt: string
  lastRecommendedAt?: string
  recommendationCooldownUntil?: string
}

export interface ExternalCandidate {
  id: string
  title: string
  type: ItemType
  source: 'tmdb' | 'rawg' | 'openLibrary' | 'anilist'
  sourceId: string
  overview?: string
  posterUrl?: string
  releaseYear?: number
  genres: string[]
  externalRefs: ExternalRefs
  createdAt: string
}

export interface PublicCatalogItem {
  id: string
  title: string
  type: ItemType
  description?: string
  releaseYear?: number
  genres: string[]
  tags: string[]
  moodTags: string[]
  externalRefs: ExternalRefs
  posterUrl?: string
  searchTokens: string[]
  canonicalKey: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  archivedAt?: string
}

export type PublicCatalogSnapshot = Pick<
  PublicCatalogItem,
  | 'id'
  | 'title'
  | 'type'
  | 'description'
  | 'releaseYear'
  | 'genres'
  | 'tags'
  | 'moodTags'
  | 'externalRefs'
  | 'posterUrl'
  | 'canonicalKey'
  | 'updatedAt'
>

export interface DiscoveryCandidate {
  id: string
  title: string
  type: ItemType
  status: DiscoveryStatus
  origin: DiscoveryOrigin
  source: 'nexo' | ExternalCandidate['source'] | 'prompt'
  sourceId: string
  overview?: string
  posterUrl?: string
  releaseYear?: number
  genres: string[]
  tags: string[]
  moodTags: string[]
  externalRefs: ExternalRefs
  publicItemId?: string
  publicSnapshot?: PublicCatalogSnapshot
  savedItemId?: string
  dismissedAt?: string
  createdAt: string
  updatedAt: string
}

export interface UserSettings {
  surprisePercent: number
  favoriteTags: string[]
  favoriteGenres: string[]
  blockedTags: string[]
  allowPausedByDefault: boolean
  theme: ThemeMode
  recommendationPreferences: RecommendationPreferences
  explorerDefaultType: ItemType | 'watch' | 'any'
}

export interface RecommendationPreferences {
  medium: ItemType | 'watch' | 'any'
  timeBudgetHours?: number
  energy: EnergyLevel
  intensity: IntensityLevel
  novelty: NoveltyLevel
  includePaused: boolean
  surprisePercent: number
  seed: string
}

export interface RecommendationResult {
  item: ListItem
  score: number
  roll: number
  reasons: string[]
  poolSize: number
}

export const DEFAULT_WEIGHTS: ItemWeights = {
  priority: 1,
  surprise: 0.35,
  challenge: 0.5,
}

export const DEFAULT_RECOMMENDATION_PREFERENCES: RecommendationPreferences = {
  medium: 'any',
  timeBudgetHours: 15,
  energy: 'medium',
  intensity: 'balanced',
  novelty: 'balanced',
  includePaused: false,
  surprisePercent: 30,
  seed: 'nexo',
}

export const DEFAULT_SETTINGS: UserSettings = {
  surprisePercent: 25,
  favoriteTags: [],
  favoriteGenres: [],
  blockedTags: [],
  allowPausedByDefault: false,
  theme: 'dark',
  recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
  explorerDefaultType: 'watch',
}

export const nowIso = () => new Date().toISOString()
