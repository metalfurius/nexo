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
  now = Date.now(),
): RecommendationResult | undefined {
  const candidates = scoreCandidates(items, preferences, settings, now)
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
  now = Date.now(),
) {
  const likedSignals = collectLikedSignals(items, settings)

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
    .map((item) => scoreItem(item, preferences, likedSignals, now))
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'es'))
}

function scoreItem(
  item: ListItem,
  preferences: RecommendationPreferences,
  likedSignals: ReturnType<typeof collectLikedSignals>,
  now: number,
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
  score += scoreIntensity(item, preferences, reasons)
  score += scoreNovelty(item, preferences, reasons)
  score += scoreRecentMemory(item, now)
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
  const moodKeys = getMoodKeys(item)
  if (preferences.energy === 'low') {
    if (hasAnySignal(moodKeys, ['ligero', 'rapido'])) {
      reasons.push('energia baja')
      return 16
    }
    return -challenge * 12
  }
  if (preferences.energy === 'high') {
    if (hasAnySignal(moodKeys, ['intenso', 'denso'])) {
      reasons.push('energia alta')
      return 16
    }
    return challenge * 6
  }
  return 4
}

function scoreIntensity(item: ListItem, preferences: RecommendationPreferences, reasons: string[]) {
  const challenge = item.weights.challenge
  const moodKeys = getMoodKeys(item)

  if (preferences.intensity === 'soft') {
    if (hasAnySignal(moodKeys, ['ligero', 'rapido', 'confort', 'calma', 'amable'])) {
      reasons.push('intensidad suave')
      return 16
    }
    if (challenge <= 0.35) {
      reasons.push('reto suave')
      return 12
    }
    return -challenge * 14
  }

  if (preferences.intensity === 'intense') {
    if (hasAnySignal(moodKeys, ['intenso', 'denso', 'maraton', 'oscuro', 'raro'])) {
      reasons.push('intensidad intensa')
      return 16
    }
    if (challenge >= 0.7) {
      reasons.push('reto alto')
      return 12
    }
    return challenge * 4 - 4
  }

  const balanceDistance = Math.abs(challenge - 0.5)
  if (balanceDistance <= 0.18) {
    reasons.push('intensidad equilibrada')
    return 7
  }
  return Math.max(0, 4 - balanceDistance * 8)
}

function scoreNovelty(item: ListItem, preferences: RecommendationPreferences, reasons: string[]) {
  if (preferences.novelty === 'comfort') {
    const comfort = item.rating && item.rating >= 7 ? 8 : 0
    return comfort + (hasAnySignal(getMoodKeys(item), ['ligero']) ? 8 : 0)
  }
  if (preferences.novelty === 'surprise') {
    reasons.push('punto de sorpresa')
    return 10 + item.weights.surprise * 12
  }
  return 4
}

function scoreRecentMemory(item: ListItem, now: number) {
  if (!item.lastRecommendedAt) return 0

  const timestamp = Date.parse(item.lastRecommendedAt)
  if (!Number.isFinite(timestamp)) return 0

  const ageHours = Math.max(0, now - timestamp) / 3_600_000
  if (ageHours < 0.5) return -34
  if (ageHours < 6) return -24
  if (ageHours < 24) return -16
  if (ageHours < 24 * 7) return -8
  return 0
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

function getMoodKeys(item: ListItem) {
  return item.moodTags.map(normalizeKey)
}

function hasAnySignal(values: string[], targets: string[]) {
  return targets.some((target) => values.includes(target))
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
