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
export const PROGRESS_UNITS = ['episodes', 'chapters', 'pages', 'hours', 'volumes', 'percent', 'items'] as const

export type ItemType = (typeof ITEM_TYPES)[number]
export type ItemStatus = (typeof ITEM_STATUSES)[number]
export type UserRole = (typeof USER_ROLES)[number]
export type ProgressUnit = (typeof PROGRESS_UNITS)[number]

export type EnergyLevel = 'low' | 'medium' | 'high'
export type IntensityLevel = 'soft' | 'balanced' | 'intense'
export type NoveltyLevel = 'comfort' | 'balanced' | 'surprise'
export type ThemeMode = (typeof THEME_MODES)[number]
export type LibraryViewMode = 'mosaic' | 'cards' | 'list'
export type LibraryCardsPerRow = 4 | 5 | 6
export type ExplorerSearchType = ItemType | 'watch' | 'animeManga' | 'any'
export type DiscoveryOrigin = 'publicCatalog' | 'externalSearch' | 'prompt' | 'roll'
export type DiscoveryStatus = 'queued' | 'saved' | 'dismissed'
export type ActivityTab = 'catalog' | 'library' | 'dice' | 'explorer' | 'import' | 'settings' | 'curation'
export type ActivityTone = 'info' | 'success' | 'danger' | 'loading'
export type ImportSourceId = 'anilist' | 'myanimelist' | 'letterboxd' | 'goodreads'
export type ExternalSource =
  | 'tmdb'
  | 'rawg'
  | 'openLibrary'
  | 'googleBooks'
  | 'anilist'
  | 'mangaDex'
  | 'kitsu'
  | 'jikan'
  | 'wikidata'

export interface ExternalRefs {
  tmdbId?: string
  rawgId?: string
  openLibraryKey?: string
  googleBooksId?: string
  anilistId?: string
  mangaDexId?: string
  kitsuId?: string
  malId?: string
  goodreadsBookId?: string
  isbn?: string
  letterboxdSlug?: string
  wikidataId?: string
  sourceUrl?: string
}

export interface ImportedLibraryItemDraft {
  sourceId: ImportSourceId
  sourceItemId: string
  title: string
  type: ItemType
  status: ItemStatus
  rating?: number
  progress?: string
  progressCurrent?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
  genres: string[]
  tags: string[]
  moodTags: string[]
  notes?: string
  rawText?: string
  importNotes?: string[]
  externalRefs?: ExternalRefs
  posterUrl?: string
  releaseYear?: number
}

export interface ImportWarning {
  code: 'duplicate' | 'invalid-entry' | 'network' | 'parse' | 'partial'
  message: string
  sourceId: ImportSourceId
  entryLabel?: string
}

export interface ImportPreviewItem {
  id: string
  draft: ImportedLibraryItemDraft
  duplicateOfId?: string
  duplicateReason?: 'externalRefs' | 'titleTypeYear'
}

export interface ImportPreview {
  sourceId: ImportSourceId
  sourceLabel: string
  createdAt: string
  totalEntries: number
  newItems: number
  duplicateItems: number
  invalidItems: number
  statusCounts: Partial<Record<ItemStatus, number>>
  typeCounts: Partial<Record<ItemType, number>>
  items: ImportPreviewItem[]
  warnings: ImportWarning[]
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
  progressCurrent?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
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
  source: ExternalSource
  sourceId: string
  overview?: string
  posterUrl?: string
  releaseYear?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
  genres: string[]
  searchAliases?: string[]
  externalRefs: ExternalRefs
  createdAt: string
}

export interface PublicCatalogItem {
  id: string
  title: string
  type: ItemType
  description?: string
  releaseYear?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
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
  autoIngestedAt?: string
  demandCount?: number
  lastDemandAt?: string
}

export type PublicCatalogSnapshot = Pick<
  PublicCatalogItem,
  | 'id'
  | 'title'
  | 'type'
  | 'description'
  | 'releaseYear'
  | 'progressTotal'
  | 'progressUnit'
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
  progressTotal?: number
  progressUnit?: ProgressUnit
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

export interface LibrarySyncState {
  error?: string
  fromCache: boolean
  hasPendingWrites: boolean
  lastSyncedAt?: string
  offlinePersistenceEnabled: boolean
  pendingWriteCount: number
  remote: boolean
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
