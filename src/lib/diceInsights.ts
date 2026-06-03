import type { ExplorerSearchType, ItemType, ListItem, RecommendationPreferences, UserSettings } from '../domain/types'
import { normalizeKey } from './strings'

export interface DiceEligibilityBreakdown {
  available: number
  blockedTags: number
  cooldown: number
  medium: number
  paused: number
  resolved: number
  total: number
}

const diceTypeLabels: Record<ExplorerSearchType, string> = {
  any: 'Todo',
  watch: 'Ver',
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

const diceEnergyLabels = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
} as const

const diceNoveltyLabels = {
  comfort: 'Confort',
  balanced: 'Balance',
  surprise: 'Sorpresa',
} as const

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
  const blockedTagKeys = settings.blockedTags.map(normalizeKey)

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
    if (blockedTagKeys.some((tag) => item.tags.map(normalizeKey).includes(tag))) {
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
  return itemType === medium
}

export function getActiveDiceFilters(preferences: RecommendationPreferences, settings: UserSettings) {
  return [
    `Medio: ${diceTypeLabels[preferences.medium]}`,
    preferences.timeBudgetHours ? `Tiempo: ${preferences.timeBudgetHours}h` : 'Sin limite de tiempo',
    `Energia: ${diceEnergyLabels[preferences.energy]}`,
    `Novedad: ${diceNoveltyLabels[preferences.novelty]}`,
    preferences.includePaused ? 'Incluye pausados' : 'Pausados fuera',
    settings.blockedTags.length ? `${settings.blockedTags.length} tags bloqueados` : 'Sin tags bloqueados',
  ]
}
