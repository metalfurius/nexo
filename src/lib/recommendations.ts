import {
  type ItemType,
  type ListItem,
  type RecommendationPreferences,
  type RecommendationResult,
  type UserSettings,
} from '../domain/types'
import { clamp, normalizeKey, uniqueValues } from './strings'

const WATCH_TYPES: ItemType[] = ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic']

export function recommendItem(
  items: ListItem[],
  preferences: RecommendationPreferences,
  settings: UserSettings,
): RecommendationResult | undefined {
  const candidates = scoreCandidates(items, preferences, settings)
  if (!candidates.length) return undefined

  const surprise = clamp(preferences.surprisePercent, 0, 100)
  const poolSize = Math.min(candidates.length, Math.max(3, Math.ceil(3 + surprise / 8)))
  const pool = candidates.slice(0, poolSize)
  const rng = seededRandom(preferences.seed)
  const surpriseRoll = rng()

  if (surpriseRoll > surprise / 100) {
    const top = pool[0]
    return { ...top, roll: surpriseRoll, poolSize }
  }

  const totalWeight = pool.reduce((sum, candidate) => sum + Math.max(candidate.score, 1), 0)
  let target = rng() * totalWeight
  for (const candidate of pool) {
    target -= Math.max(candidate.score, 1)
    if (target <= 0) {
      return { ...candidate, roll: surpriseRoll, poolSize }
    }
  }

  const fallback = pool[pool.length - 1]
  return { ...fallback, roll: surpriseRoll, poolSize }
}

export function scoreCandidates(
  items: ListItem[],
  preferences: RecommendationPreferences,
  settings: UserSettings,
) {
  const likedSignals = collectLikedSignals(items, settings)
  const now = Date.now()

  return items
    .filter((item) => {
      if (item.status === 'completed' || item.status === 'dropped') return false
      if (item.status === 'paused' && !preferences.includePaused) return false
      if (item.recommendationCooldownUntil && Date.parse(item.recommendationCooldownUntil) > now) {
        return false
      }
      if (preferences.medium === 'watch') return WATCH_TYPES.includes(item.type)
      if (preferences.medium !== 'any' && item.type !== preferences.medium) return false
      return !settings.blockedTags.some((tag) => item.tags.map(normalizeKey).includes(normalizeKey(tag)))
    })
    .map((item) => scoreItem(item, preferences, likedSignals))
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'es'))
}

function scoreItem(
  item: ListItem,
  preferences: RecommendationPreferences,
  likedSignals: ReturnType<typeof collectLikedSignals>,
): RecommendationResult {
  let score = 50 * item.weights.priority
  const reasons: string[] = []

  if (item.status === 'in_progress') {
    score += 18
    reasons.push('ya esta empezado')
  }
  if (item.status === 'paused' && preferences.includePaused) {
    score += 12
    reasons.push('puede retomarse')
  }

  const durationFit = scoreDuration(item, preferences.timeBudgetHours)
  score += durationFit.score
  if (durationFit.reason) reasons.push(durationFit.reason)

  const tasteHits = uniqueValues([
    ...item.tags.filter((tag) => likedSignals.tags.has(normalizeKey(tag))),
    ...item.genres.filter((genre) => likedSignals.genres.has(normalizeKey(genre))),
  ])
  if (tasteHits.length) {
    score += Math.min(24, tasteHits.length * 6)
    reasons.push(`conecta con ${tasteHits.slice(0, 3).join(', ')}`)
  }

  score += scoreEnergy(item, preferences, reasons)
  score += scoreNovelty(item, preferences, reasons)
  score += item.weights.surprise * (preferences.surprisePercent / 5)

  if (!reasons.length) reasons.push('encaja como opcion equilibrada')

  return {
    item,
    score: Math.round(score),
    roll: 0,
    poolSize: 0,
    reasons: reasons.slice(0, 4),
  }
}

function scoreDuration(item: ListItem, budget?: number) {
  if (!budget || (!item.durationMinHours && !item.durationMaxHours)) {
    return { score: 0, reason: undefined }
  }
  const max = item.durationMaxHours ?? item.durationMinHours ?? 0
  const min = item.durationMinHours ?? max

  if (max <= budget) return { score: 22, reason: `cabe en ${budget}h` }
  if (min <= budget) return { score: 10, reason: 'puede empezarse hoy' }
  return { score: -Math.min(32, (min - budget) * 3), reason: 'es mas largo que el hueco ideal' }
}

function scoreEnergy(item: ListItem, preferences: RecommendationPreferences, reasons: string[]) {
  const challenge = item.weights.challenge
  if (preferences.energy === 'low') {
    if (item.moodTags.includes('ligero') || item.moodTags.includes('rapido')) {
      reasons.push('energia baja')
      return 16
    }
    return -challenge * 12
  }
  if (preferences.energy === 'high') {
    if (item.moodTags.includes('intenso') || item.moodTags.includes('denso')) {
      reasons.push('energia alta')
      return 16
    }
    return challenge * 6
  }
  return 4
}

function scoreNovelty(item: ListItem, preferences: RecommendationPreferences, reasons: string[]) {
  if (preferences.novelty === 'comfort') {
    const comfort = item.rating && item.rating >= 7 ? 8 : 0
    return comfort + (item.moodTags.includes('ligero') ? 8 : 0)
  }
  if (preferences.novelty === 'surprise') {
    reasons.push('punto de sorpresa')
    return 10 + item.weights.surprise * 12
  }
  return 4
}

function collectLikedSignals(items: ListItem[], settings: UserSettings) {
  const tags = new Set(settings.favoriteTags.map(normalizeKey))
  const genres = new Set(settings.favoriteGenres.map(normalizeKey))

  for (const item of items) {
    if (item.status !== 'completed' || !item.rating || item.rating < 7.5) continue
    item.tags.forEach((tag) => tags.add(normalizeKey(tag)))
    item.genres.forEach((genre) => genres.add(normalizeKey(genre)))
  }

  return { tags, genres }
}

function seededRandom(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return () => {
    hash += 0x6d2b79f5
    let value = hash
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
