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

export const USER_ROLES = ['user', 'moderator', 'admin'] as const
export const THEME_MODES = ['dark', 'light', 'rose', 'forest', 'ocean', 'mint', 'aurora'] as const

export type ItemType = (typeof ITEM_TYPES)[number]
export type ItemStatus = (typeof ITEM_STATUSES)[number]
export type UserRole = (typeof USER_ROLES)[number]

export type EnergyLevel = 'low' | 'medium' | 'high'
export type IntensityLevel = 'soft' | 'balanced' | 'intense'
export type NoveltyLevel = 'comfort' | 'balanced' | 'surprise'
export type ThemeMode = (typeof THEME_MODES)[number]
export type LibraryViewMode = 'mosaic' | 'cards' | 'list'
export type LibraryCardsPerRow = 4 | 5 | 6
export type ExplorerSearchType = ItemType | 'watch' | 'any'
export type DiscoveryOrigin = 'publicCatalog' | 'externalSearch' | 'prompt' | 'roll'
export type DiscoveryStatus = 'queued' | 'saved' | 'dismissed'
export type ActivityTab = 'library' | 'dice' | 'explorer' | 'settings' | 'curation'
export type ActivityTone = 'info' | 'success' | 'danger' | 'loading'

export interface ExternalRefs {
  tmdbId?: string
  rawgId?: string
  openLibraryKey?: string
  anilistId?: string
  malId?: string
  wikidataId?: string
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
  source: 'tmdb' | 'rawg' | 'openLibrary' | 'anilist' | 'jikan' | 'wikidata'
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
  searchAliases?: string[]
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
  | 'searchAliases'
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
  explorerDefaultType: ExplorerSearchType
  libraryViewMode: LibraryViewMode
  libraryCardsPerRow: LibraryCardsPerRow
}

export interface UserProfile {
  uid: string
  role: UserRole
  email?: string
  displayName?: string
  photoURL?: string
  createdAt: string
  updatedAt: string
  lastSeenAt?: string
}

export interface ActivityEntry {
  id: string
  label: string
  detail: string
  tab: ActivityTab
  tone: ActivityTone
  createdAt: string
  target?: ActivityTarget
}

export type ActivityTarget = { kind: 'item'; id: string }

export interface RecommendationPreferences {
  medium: ExplorerSearchType
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
  libraryViewMode: 'mosaic',
  libraryCardsPerRow: 4,
}

export const nowIso = () => new Date().toISOString()
