import type { ItemStatus, ItemType, ListItem } from '../domain/types'
import { uniqueValues } from './strings'

export interface ItemPulseMetric {
  label: string
  value: number
}

export interface ItemPulseSummary {
  label: string
  value: string
}

export interface ItemPulse extends ItemPulseSummary {
  metrics: ItemPulseMetric[]
}

export interface PersonalEditorReadiness {
  checks: Array<{ done: boolean; label: string }>
  detail: string
  percent: number
  score: number
  title: string
}

export const itemTypeLabels: Record<ItemType | 'any' | 'watch', string> = {
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

export const itemStatusLabels: Record<ItemStatus | 'all', string> = {
  all: 'Todo',
  wishlist: 'Pendiente',
  in_progress: 'En progreso',
  paused: 'Pausado',
  completed: 'Completado',
  dropped: 'Droppeado',
}

export const itemSourceLabels: Record<ListItem['source'], string> = {
  manual: 'Manual',
  markdown: 'Importacion',
  external: 'API externa',
  public: 'Catalogo Nexo',
}

export function getItemSubtitle(item: ListItem) {
  const parts = [itemTypeLabels[item.type]]
  if (item.progress) parts.push(item.progress)
  if (item.durationMinHours || item.durationMaxHours) parts.push(formatDuration(item))
  if (item.publicItemId) parts.push('Nexo')
  return parts.join(' / ')
}

export function getVisibleItemChips(item: ListItem) {
  return uniqueValues([
    ...(item.rating !== undefined ? [`${item.rating}/10`] : []),
    ...item.genres,
    ...item.tags,
    ...item.moodTags,
  ]).slice(0, 4)
}

export function getItemPulse(item: ListItem, now = Date.now()): ItemPulse {
  return {
    ...getItemPulseSummary(item, now),
    metrics: [
      { label: 'Foco', value: getWeightMeterValue(item.weights.priority) },
      { label: 'Sorpresa', value: getWeightMeterValue(item.weights.surprise) },
      { label: 'Reto', value: getWeightMeterValue(item.weights.challenge) },
    ],
  }
}

export function getItemPulseSummary(item: ListItem, now = Date.now()): ItemPulseSummary {
  if (item.status === 'completed') {
    return {
      label: 'Cerrada',
      value: item.rating !== undefined ? `${item.rating}/10` : 'Completada',
    }
  }
  if (item.status === 'dropped') {
    return {
      label: 'Fuera',
      value: item.rating !== undefined ? `${item.rating}/10` : 'Droppeada',
    }
  }
  if (isItemInCooldown(item, now)) {
    return {
      label: 'Dado',
      value: 'Cooldown',
    }
  }
  if (item.status === 'in_progress') {
    return {
      label: 'Continuar',
      value: item.progress?.trim() || 'En curso',
    }
  }
  if (item.status === 'paused') {
    return {
      label: 'Retomar',
      value: 'Pausada',
    }
  }

  return {
    label: 'Dado',
    value: item.weights.priority >= 1.15 ? 'Alta prioridad' : 'Disponible',
  }
}

export function getWeightMeterValue(value: number) {
  return Math.round(Math.min(100, Math.max(8, value * 100)))
}

export function getPersonalEditorReadiness(
  item: Pick<
    ListItem,
    'durationMaxHours' | 'genres' | 'moodTags' | 'notes' | 'posterUrl' | 'progress' | 'rating' | 'tags' | 'title' | 'weights'
  >,
): PersonalEditorReadiness {
  const taxonomyCount = item.genres.length + item.tags.length + item.moodTags.length
  const checks = [
    { done: Boolean(item.title.trim()), label: 'Identidad' },
    { done: taxonomyCount > 0, label: 'Taxonomia' },
    { done: item.weights.priority > 0 || item.weights.surprise > 0 || item.weights.challenge > 0, label: 'Dado' },
    {
      done:
        Boolean(item.notes?.trim()) ||
        Boolean(item.progress?.trim()) ||
        typeof item.rating === 'number' ||
        Boolean(item.durationMaxHours) ||
        Boolean(item.posterUrl?.trim()),
      label: 'Contexto',
    },
  ]
  const score = checks.filter((check) => check.done).length
  const missing = checks.find((check) => !check.done)

  return {
    checks,
    detail: missing
      ? `Completa ${missing.label.toLowerCase()} para que la ficha sea mas facil de buscar y recomendar.`
      : 'Tiene senales suficientes para busqueda, backup y dado ponderado.',
    percent: Math.round((score / checks.length) * 100),
    score,
    title: missing ? 'Ficha por afinar' : 'Ficha lista',
  }
}

export function isItemInCooldown(item: ListItem, now = Date.now()) {
  if (!item.recommendationCooldownUntil) return false
  const timestamp = Date.parse(item.recommendationCooldownUntil)
  return Number.isFinite(timestamp) && timestamp > now
}

export function getItemSignals(item: ListItem, now = Date.now()): Array<{ label: string; tone?: 'strong' }> {
  const sourceSignal: { label: string; tone?: 'strong' } = {
    label: item.publicItemId ? 'Catalogo Nexo' : itemSourceLabels[item.source],
    tone: item.publicItemId ? 'strong' : undefined,
  }

  return [
    sourceSignal,
    { label: getItemEffortSignal(item) },
    {
      label: item.lastRecommendedAt
        ? `Dado ${formatRelativeShortTime(item.lastRecommendedAt, now)}`
        : `Editado ${formatRelativeShortTime(item.updatedAt, now)}`,
    },
  ].filter((signal) => Boolean(signal.label))
}

export function getItemEffortSignal(item: ListItem) {
  if (item.progress?.trim()) return item.progress
  if (item.durationMinHours || item.durationMaxHours) return formatDuration(item)
  if (item.weights.priority >= 1.15) return 'Alta prioridad'
  if (item.weights.surprise >= 0.75) return 'Sorpresa alta'
  if (item.weights.challenge >= 0.75) return 'Reto alto'
  return itemStatusLabels[item.status]
}

export function formatDuration(item: Pick<ListItem, 'durationMaxHours' | 'durationMinHours'>) {
  if (item.durationMinHours && item.durationMaxHours && item.durationMinHours !== item.durationMaxHours) {
    return `${item.durationMinHours}-${item.durationMaxHours}h`
  }
  return `${item.durationMaxHours ?? item.durationMinHours}h`
}

export function formatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function formatRelativeShortTime(value: string, now = Date.now()) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return formatDateLabel(value)

  const elapsedMs = now - timestamp
  if (elapsedMs < 60_000) return 'Ahora'
  if (elapsedMs < 3_600_000) return `${Math.max(1, Math.floor(elapsedMs / 60_000))}min`
  if (elapsedMs < 86_400_000) return `${Math.max(1, Math.floor(elapsedMs / 3_600_000))}h`
  if (elapsedMs < 604_800_000) return `${Math.max(1, Math.floor(elapsedMs / 86_400_000))}d`
  return formatDateLabel(value)
}
