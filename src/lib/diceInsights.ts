import type {
  EnergyLevel,
  ExplorerSearchType,
  IntensityLevel,
  ItemType,
  ListItem,
  NoveltyLevel,
  RecommendationPreferences,
  RecommendationResult,
  UserSettings,
} from '../domain/types'
import { formatDuration, itemStatusLabels, itemTypeLabels } from './libraryItemInsights'
import { normalizeKey, uniqueValues } from './strings'

export interface DiceEligibilityBreakdown {
  available: number
  blockedTags: number
  cooldown: number
  medium: number
  paused: number
  resolved: number
  total: number
}

export interface RecommendationSessionPlan {
  detail: string
  facts: Array<{ detail: string; label: string; value: string }>
  signals: string[]
  title: string
}

export interface RecommendationLearningSignals {
  genres: string[]
  tags: string[]
  total: number
}

const diceTypeLabels: Record<ExplorerSearchType, string> = {
  any: 'Todo',
  watch: 'Ver',
  animeManga: 'Anime/Manga',
  game: 'Juegos',
  book: 'Libros',
  movie: 'Cine',
  series: 'Series',
  anime: 'Anime',
  manga: 'Manga',
  manhwa: 'Manhwa',
  comic: 'Comic',
  other: 'Otro',
}

export const diceEnergyLabels: Record<EnergyLevel, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

export const diceIntensityLabels: Record<IntensityLevel, string> = {
  soft: 'Suave',
  balanced: 'Equilibrada',
  intense: 'Intensa',
}

export const diceNoveltyLabels: Record<NoveltyLevel, string> = {
  comfort: 'Confort',
  balanced: 'Balance',
  surprise: 'Sorpresa',
}

const watchTypes: ItemType[] = ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic']

export function getDiceEligibilityBreakdown(
  items: ListItem[],
  preferences: RecommendationPreferences,
  settings: UserSettings,
  now = Date.now(),
): DiceEligibilityBreakdown {
  const breakdown: DiceEligibilityBreakdown = {
    available: 0,
    blockedTags: 0,
    cooldown: 0,
    medium: 0,
    paused: 0,
    resolved: 0,
    total: items.length,
  }
  const blockedTagKeys = new Set(settings.blockedTags.map(normalizeKey))

  for (const item of items) {
    if (item.status === 'completed' || item.status === 'dropped') {
      breakdown.resolved += 1
      continue
    }
    if (item.status === 'paused' && !preferences.includePaused) {
      breakdown.paused += 1
      continue
    }
    if (item.recommendationCooldownUntil && Date.parse(item.recommendationCooldownUntil) > now) {
      breakdown.cooldown += 1
      continue
    }
    if (!matchesDiceMedium(item.type, preferences.medium)) {
      breakdown.medium += 1
      continue
    }
    if ([...item.genres, ...item.tags, ...item.moodTags].some((signal) => blockedTagKeys.has(normalizeKey(signal)))) {
      breakdown.blockedTags += 1
      continue
    }
    breakdown.available += 1
  }

  return breakdown
}

export function matchesDiceMedium(itemType: ItemType, medium: ExplorerSearchType) {
  if (medium === 'any') return true
  if (medium === 'watch') return watchTypes.includes(itemType)
  if (medium === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === medium
}

export function getActiveDiceFilters(preferences: RecommendationPreferences, settings: UserSettings) {
  return [
    `Medio: ${diceTypeLabels[preferences.medium]}`,
    preferences.timeBudgetHours ? `Tiempo: ${preferences.timeBudgetHours}h` : 'Sin limite de tiempo',
    `Energia: ${diceEnergyLabels[preferences.energy]}`,
    `Novedad: ${diceNoveltyLabels[preferences.novelty]}`,
    preferences.includePaused ? 'Incluye pausados' : 'Pausados fuera',
    settings.blockedTags.length ? `${settings.blockedTags.length} senales bloqueadas` : 'Sin senales bloqueadas',
  ]
}

export function getDiceScoreMeterWidth(score: number, maxScore: number) {
  if (maxScore <= 0) return '0%'
  return `${Math.min(100, Math.max(8, (score / maxScore) * 100))}%`
}

export function getRecommendationSessionPlan(
  recommendation: RecommendationResult,
  preferences: RecommendationPreferences,
): RecommendationSessionPlan {
  const item = recommendation.item
  const duration = item.durationMinHours || item.durationMaxHours ? formatDuration(item) : 'Sin duracion'
  const budget = preferences.timeBudgetHours ? `${preferences.timeBudgetHours}h max.` : 'Sin limite'
  const signals = uniqueValues([...item.genres, ...item.moodTags, ...item.tags]).slice(0, 6)
  const title =
    item.status === 'in_progress'
      ? 'Continuar una obra activa'
      : item.status === 'paused'
        ? 'Retomar sin perder contexto'
        : 'Nueva sesion recomendada'
  const detail = `${itemTypeLabels[item.type]} con intensidad ${diceIntensityLabels[preferences.intensity].toLowerCase()} y ${preferences.surprisePercent}% de sorpresa.`

  return {
    detail,
    facts: [
      { detail: `${diceEnergyLabels[preferences.energy]} energia`, label: 'Clima', value: diceIntensityLabels[preferences.intensity] },
      { detail: budget, label: 'Tiempo', value: duration },
      { detail: itemTypeLabels[item.type], label: 'Estado', value: itemStatusLabels[item.status] },
      { detail: `Pool ${recommendation.poolSize}`, label: 'Azar', value: `${Math.round(recommendation.roll * 100)}%` },
    ],
    signals,
    title,
  }
}

export function getRecommendationLearningSignals(
  item: ListItem,
  settings: UserSettings,
  limit = 6,
): RecommendationLearningSignals {
  const favoriteGenreKeys = new Set(settings.favoriteGenres.map(normalizeKey))
  const favoriteTagKeys = new Set(settings.favoriteTags.map(normalizeKey))
  const blockedSignalKeys = new Set(settings.blockedTags.map(normalizeKey))
  const genres = collectNewLearningSignals(item.genres, new Set([...favoriteGenreKeys, ...blockedSignalKeys])).slice(0, limit)
  const tags = collectNewLearningSignals(item.tags, new Set([...favoriteTagKeys, ...blockedSignalKeys])).slice(
    0,
    Math.max(0, limit - genres.length),
  )

  return {
    genres,
    tags,
    total: genres.length + tags.length,
  }
}

function collectNewLearningSignals(values: string[], existingKeys: Set<string>) {
  const seen = new Set<string>()
  const nextValues: string[] = []

  for (const value of values) {
    const label = value.trim()
    const key = normalizeKey(label)
    if (!key || seen.has(key) || existingKeys.has(key)) continue

    seen.add(key)
    nextValues.push(label)
  }

  return nextValues
}
