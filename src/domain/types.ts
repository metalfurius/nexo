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
  source: 'manual' | 'markdown' | 'external'
  rawText?: string
  importNotes?: string[]
  externalRefs?: ExternalRefs
  posterUrl?: string
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

export interface UserSettings {
  surprisePercent: number
  favoriteTags: string[]
  favoriteGenres: string[]
  blockedTags: string[]
  allowPausedByDefault: boolean
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

export const DEFAULT_SETTINGS: UserSettings = {
  surprisePercent: 25,
  favoriteTags: [],
  favoriteGenres: [],
  blockedTags: [],
  allowPausedByDefault: false,
}

export const nowIso = () => new Date().toISOString()

