import type { DiscoveryCandidate, ListItem } from '../domain/types'
import { formatDuration, itemSourceLabels, itemTypeLabels } from './libraryItemInsights'
import { uniqueValues } from './strings'

export type LibraryLaunchAction = 'add' | 'edit-taxonomy' | 'open-dice' | 'open-explorer'
export type LibrarySmartView = 'all' | 'dice-ready' | 'needs-context' | 'needs-taxonomy' | 'nexo'

export interface LibraryLaunchStep {
  action?: LibraryLaunchAction
  actionLabel?: string
  detail: string
  done: boolean
  id: string
  item?: ListItem
  label: string
}

export interface LibraryLaunchGuide {
  completed: number
  detail: string
  percent: number
  steps: LibraryLaunchStep[]
  title: string
  total: number
}

export interface LibrarySmartViewOption {
  count: number
  detail: string
  id: LibrarySmartView
  label: string
}

export interface LibraryNextPlanFact {
  label: string
  value: string
}

export function isItemReadyForDicePulse(item: ListItem, now: number) {
  if (item.status === 'completed' || item.status === 'dropped') return false
  if (!item.recommendationCooldownUntil) return true

  const timestamp = Date.parse(item.recommendationCooldownUntil)
  return !Number.isFinite(timestamp) || timestamp <= now
}

export function hasItemTaxonomy(item: ListItem) {
  return item.genres.length + item.tags.length + item.moodTags.length > 0
}

export function getLibraryLaunchGuide(
  items: ListItem[],
  candidates: DiscoveryCandidate[],
  now = Date.now(),
): LibraryLaunchGuide {
  const targetItemCount = 3
  const taxonomyReadyItems = items.filter(hasItemTaxonomy)
  const firstMissingTaxonomyItem = items.find((item) => !hasItemTaxonomy(item))
  const diceReadyCount = items.filter((item) => isItemReadyForDicePulse(item, now)).length
  const queuedDiscoveryCount = candidates.filter((candidate) => candidate.status === 'queued').length

  const steps: LibraryLaunchStep[] = [
    {
      action: 'add',
      actionLabel: 'Anadir',
      detail: `${Math.min(items.length, targetItemCount)}/${targetItemCount} entradas privadas`,
      done: items.length >= targetItemCount,
      id: 'base',
      label: 'Base privada',
    },
    {
      action: firstMissingTaxonomyItem ? 'edit-taxonomy' : 'add',
      actionLabel: firstMissingTaxonomyItem ? 'Afinar' : 'Anadir',
      detail: items.length ? `${taxonomyReadyItems.length}/${items.length} con generos o tags` : 'Sin entradas que leer',
      done: items.length > 0 && taxonomyReadyItems.length === items.length,
      id: 'taxonomy',
      item: firstMissingTaxonomyItem,
      label: 'Senales para Dado',
    },
    {
      action: items.length ? 'open-dice' : 'add',
      actionLabel: items.length ? 'Abrir Dado' : 'Anadir',
      detail: diceReadyCount ? `${diceReadyCount} candidatas vivas` : 'Sin candidatas disponibles',
      done: diceReadyCount > 0,
      id: 'dice',
      label: 'Dado vivo',
    },
    {
      action: 'open-explorer',
      actionLabel: 'Decidir',
      detail: queuedDiscoveryCount ? `${queuedDiscoveryCount} hallazgos por decidir` : 'Cola limpia',
      done: queuedDiscoveryCount === 0,
      id: 'explorer',
      label: 'Explorador limpio',
    },
  ]
  const completed = steps.filter((step) => step.done).length
  const percent = Math.round((completed / steps.length) * 100)
  const title = completed === steps.length ? 'Nexo preparado' : completed >= 2 ? 'Buen arranque' : 'Arranque pendiente'
  const detail =
    completed === steps.length
      ? 'Biblioteca, dado y cola estan en buen estado.'
      : 'Sigue estos pasos para que la app recomiende mejor.'

  return {
    completed,
    detail,
    percent,
    steps,
    title,
    total: steps.length,
  }
}

export function getLibrarySmartViewOptions(items: ListItem[], now = Date.now()): LibrarySmartViewOption[] {
  const count = (view: LibrarySmartView) => items.filter((item) => matchesLibrarySmartView(item, view, now)).length

  return [
    {
      count: items.length,
      detail: 'Toda la biblioteca',
      id: 'all',
      label: 'Todas',
    },
    {
      count: count('dice-ready'),
      detail: 'Disponibles ahora',
      id: 'dice-ready',
      label: 'Listas para dado',
    },
    {
      count: count('needs-context'),
      detail: 'Sin rating ni notas',
      id: 'needs-context',
      label: 'Sin contexto',
    },
    {
      count: count('needs-taxonomy'),
      detail: 'Sin generos ni tags',
      id: 'needs-taxonomy',
      label: 'Sin taxonomia',
    },
    {
      count: count('nexo'),
      detail: 'Copias del catalogo',
      id: 'nexo',
      label: 'Catalogo Nexo',
    },
  ]
}

export function matchesLibrarySmartView(item: ListItem, view: LibrarySmartView, now = Date.now()) {
  if (view === 'all') return true
  if (view === 'dice-ready') return isItemReadyForDicePulse(item, now)
  if (view === 'needs-context') return typeof item.rating !== 'number' && !item.notes?.trim()
  if (view === 'needs-taxonomy') return !hasItemTaxonomy(item)
  if (view === 'nexo') return Boolean(item.publicItemId)
  return true
}

export function getLibraryFocusItems(items: ListItem[]) {
  const statusRank: Record<ListItem['status'], number> = {
    in_progress: 0,
    wishlist: 1,
    paused: 2,
    completed: 3,
    dropped: 4,
  }

  return items
    .filter((item) => item.status === 'in_progress' || item.status === 'wishlist' || item.status === 'paused')
    .sort((left, right) => {
      const statusDelta = statusRank[left.status] - statusRank[right.status]
      if (statusDelta !== 0) return statusDelta

      const leftWeight = getLibraryFocusWeight(left)
      const rightWeight = getLibraryFocusWeight(right)
      if (leftWeight !== rightWeight) return rightWeight - leftWeight

      return right.updatedAt.localeCompare(left.updatedAt)
    })
    .slice(0, 3)
}

export function getLibraryFocusReason(item: ListItem) {
  if (item.status === 'in_progress') return item.progress || 'Ya empezada, pide cierre'
  if (item.status === 'paused') return 'Pausada, lista para retomar'
  if (item.weights.priority >= 1.15) return 'Alta prioridad'
  if (item.weights.surprise >= 0.75) return 'Buena candidata sorpresa'
  if (item.weights.challenge >= 0.7) return 'Reto interesante'
  return `${itemTypeLabels[item.type]} pendiente`
}

export function getLibraryNextPlanTitle(item: ListItem) {
  if (item.status === 'in_progress') return 'Continuar sin perder contexto'
  if (item.status === 'paused') return 'Retomar con una sesion corta'
  if (item.status === 'wishlist') return 'Listo para empezar'
  if (item.status === 'completed') return 'Reabrir si vuelve a apetecer'
  return 'Revisar antes de descartar'
}

export function getLibraryNextPlanSignals(item: ListItem) {
  return uniqueValues([...item.genres, ...item.moodTags, ...item.tags]).slice(0, 4)
}

export function getLibraryNextPlanFacts(item: ListItem, signalCount: number): LibraryNextPlanFact[] {
  return [
    {
      label: 'Tiempo',
      value: item.durationMinHours || item.durationMaxHours ? formatDuration(item) : 'Sin duracion',
    },
    {
      label: 'Origen',
      value: item.publicItemId ? 'Nexo' : itemSourceLabels[item.source],
    },
    {
      label: 'Senales',
      value: signalCount ? `${signalCount}` : '0',
    },
  ]
}

function getLibraryFocusWeight(item: ListItem) {
  return item.weights.priority + item.weights.challenge * 0.4 + item.weights.surprise * 0.25
}
