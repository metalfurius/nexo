import type { DiscoveryCandidate, ListItem } from '../domain/types'
import { nowIso } from '../domain/types'
import { normalizeKey, uniqueValues } from './strings'

export interface PrivateDataReviewItem {
  detail: string
  label: string
  tone?: 'good'
}

export interface PrivateTasteSuggestion {
  kind: 'genre' | 'tag'
  label: string
  sourceCount: number
}

export interface PrivateTaxonomyRepairTemplate {
  genres: string[]
  moodTags: string[]
  tags: string[]
}

export interface PrivateTaxonomyRepairDraft {
  item: ListItem
  signalCount: number
}

export interface PrivateDataHealth {
  contextualizedCount: number
  cooldownCount: number
  diceReadyCount: number
  missingTaxonomyCount: number
  needsAttention: boolean
  publicCopyCount: number
  reviewItems: PrivateDataReviewItem[]
  summaryCopy: string
  summaryLabel: string
  taxonomyCoveragePercent: number
  taxonomyReadyCount: number
  tasteSuggestions: PrivateTasteSuggestion[]
  totalItems: number
}

export function getPrivateDataHealth(
  items: ListItem[],
  candidates: DiscoveryCandidate[],
  now = Date.now(),
): PrivateDataHealth {
  const totalItems = items.length
  const taxonomyReadyCount = items.filter((item) => item.genres.length + item.tags.length + item.moodTags.length > 0).length
  const missingTaxonomyCount = totalItems - taxonomyReadyCount
  const publicCopyCount = items.filter((item) => Boolean(item.publicItemId)).length
  const contextualizedCount = items.filter((item) => typeof item.rating === 'number' || Boolean(item.notes?.trim())).length
  const cooldownCount = items.filter((item) => isItemInActiveCooldown(item, now)).length
  const diceReadyCount = items.filter((item) => isItemPrivateDiceReady(item, now)).length
  const queuedDiscoveryCount = candidates.filter((candidate) => candidate.status === 'queued').length
  const taxonomyCoveragePercent = totalItems ? Math.round((taxonomyReadyCount / totalItems) * 100) : 0
  const needsAttention = totalItems === 0 || missingTaxonomyCount > 0 || diceReadyCount === 0
  const tasteSuggestions = getPrivateTasteSuggestions(items)
  const summaryLabel =
    totalItems === 0 ? 'Sin biblioteca todavia' : needsAttention ? 'Faltan senales privadas' : 'Biblioteca preparada'
  const summaryCopy =
    totalItems === 0
      ? 'Crea o importa entradas para activar recomendaciones y backup con contenido.'
      : needsAttention
        ? 'Completa taxonomia o entradas vivas para que Dado y Explorador lean mejor tu biblioteca.'
        : 'Taxonomia, privacidad y backup estan listos para seguir creciendo.'
  const reviewItems: PrivateDataReviewItem[] = []

  if (totalItems === 0) {
    reviewItems.push({
      label: 'Primera entrada pendiente',
      detail: 'Importa markdown, busca en Explorador o crea una ficha manual.',
    })
  } else {
    if (missingTaxonomyCount > 0) {
      reviewItems.push({
        label: `${missingTaxonomyCount} sin taxonomia`,
        detail: 'Anade generos, tags o mood tags para que el dado razone mejor.',
      })
    }
    if (contextualizedCount < totalItems) {
      reviewItems.push({
        label: `${totalItems - contextualizedCount} sin rating ni notas`,
        detail: 'No bloquea nada, pero baja la calidad de lectura personal.',
      })
    }
    if (queuedDiscoveryCount > 0) {
      reviewItems.push({
        label: `${queuedDiscoveryCount} hallazgos pendientes`,
        detail: 'Guarda o descarta la cola para mantener limpio el Explorador.',
      })
    }
    if (cooldownCount > 0) {
      reviewItems.push({
        label: `${cooldownCount} en cooldown`,
        detail: 'No entran hoy en el dado para evitar repeticion.',
      })
    }
  }

  if (reviewItems.length === 0) {
    reviewItems.push({
      label: 'Sin pendientes criticos',
      detail: 'Tu biblioteca privada esta lista para backup y recomendaciones.',
      tone: 'good',
    })
  }

  return {
    contextualizedCount,
    cooldownCount,
    diceReadyCount,
    missingTaxonomyCount,
    needsAttention,
    publicCopyCount,
    reviewItems: reviewItems.slice(0, 3),
    summaryCopy,
    summaryLabel,
    taxonomyCoveragePercent,
    taxonomyReadyCount,
    tasteSuggestions,
    totalItems,
  }
}

export function getPrivateTasteSuggestions(items: ListItem[], limit = 6): PrivateTasteSuggestion[] {
  const suggestions = new Map<string, PrivateTasteSuggestion>()

  for (const item of items) {
    if (!isPositiveTasteSignal(item)) continue

    const seenForItem = new Set<string>()
    collectSuggestionValues(suggestions, seenForItem, 'genre', item.genres)
    collectSuggestionValues(suggestions, seenForItem, 'tag', item.tags)
  }

  return [...suggestions.values()]
    .sort(
      (left, right) =>
        right.sourceCount - left.sourceCount ||
        suggestionKindRank(left.kind) - suggestionKindRank(right.kind) ||
        left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }),
    )
    .slice(0, limit)
}

export function getPrivateTaxonomyRepairDraft(
  item: ListItem,
  template?: PrivateTaxonomyRepairTemplate,
  timestamp = nowIso(),
): PrivateTaxonomyRepairDraft | undefined {
  if (item.genres.length + item.tags.length + item.moodTags.length > 0 || !template) return undefined

  const genres = uniqueValues(template.genres)
  const tags = uniqueValues(template.tags)
  const moodTags = uniqueValues(template.moodTags)
  const signalCount = genres.length + tags.length + moodTags.length
  if (signalCount === 0) return undefined

  return {
    item: {
      ...item,
      genres,
      moodTags,
      tags,
      updatedAt: timestamp,
    },
    signalCount,
  }
}

export function getRecentRecommendationItems(items: ListItem[], limit = 4) {
  return items
    .filter((item) => Boolean(item.lastRecommendedAt))
    .sort((left, right) => (right.lastRecommendedAt ?? '').localeCompare(left.lastRecommendedAt ?? ''))
    .slice(0, limit)
}

export function formatRecentRecommendationTime(value?: string, now = Date.now()) {
  if (!value) return 'Sin fecha'

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Fecha desconocida'

  const elapsedMs = now - timestamp
  if (elapsedMs < 60_000) return 'Ahora mismo'
  if (elapsedMs < 3_600_000) return `Hace ${Math.max(1, Math.floor(elapsedMs / 60_000))} min`
  if (elapsedMs < 86_400_000) return `Hace ${Math.max(1, Math.floor(elapsedMs / 3_600_000))} h`

  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(timestamp))
}

function isItemInActiveCooldown(item: ListItem, now: number) {
  if (!item.recommendationCooldownUntil) return false
  const timestamp = Date.parse(item.recommendationCooldownUntil)
  return Number.isFinite(timestamp) && timestamp > now
}

function isItemPrivateDiceReady(item: ListItem, now: number) {
  if (item.status === 'completed' || item.status === 'dropped') return false
  if (!item.recommendationCooldownUntil) return true
  const timestamp = Date.parse(item.recommendationCooldownUntil)
  return !Number.isFinite(timestamp) || timestamp <= now
}

function collectSuggestionValues(
  suggestions: Map<string, PrivateTasteSuggestion>,
  seenForItem: Set<string>,
  kind: PrivateTasteSuggestion['kind'],
  values: string[],
) {
  for (const value of values) {
    const label = value.trim()
    const key = normalizeKey(label)
    const suggestionKey = `${kind}:${key}`

    if (!key || seenForItem.has(suggestionKey)) continue

    const current = suggestions.get(suggestionKey)
    if (current) {
      current.sourceCount += 1
    } else {
      suggestions.set(suggestionKey, { kind, label, sourceCount: 1 })
    }
    seenForItem.add(suggestionKey)
  }
}

function isPositiveTasteSignal(item: ListItem) {
  return item.status === 'completed' && typeof item.rating === 'number' && item.rating >= 7.5
}

function suggestionKindRank(kind: PrivateTasteSuggestion['kind']) {
  return kind === 'genre' ? 0 : 1
}
