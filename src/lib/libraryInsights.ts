import type { DiscoveryCandidate, ListItem } from '../domain/types'
import { formatDuration, formatProgress, itemSourceLabels, itemTypeLabels } from './libraryItemInsights'
import { uniqueValues } from './strings'

export type LibraryLaunchAction = 'add' | 'edit-taxonomy' | 'open-dice' | 'open-explorer'
export type LibrarySmartView = 'all' | 'cooldown' | 'dice-ready' | 'needs-context' | 'needs-taxonomy' | 'nexo'

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

export interface LibraryReviewQueue {
  action: 'open-dice' | 'open-item' | 'open-view'
  count: number
  detail: string
  id: LibrarySmartView
  item?: ListItem
  items: ListItem[]
  label: string
  primary: boolean
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
      label: 'Estanteria base',
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
      detail: diceReadyCount ? `${diceReadyCount} guardadas listas para decidir` : 'Sin guardadas disponibles',
      done: diceReadyCount > 0,
      id: 'dice',
      label: 'Dado elige guardadas',
    },
    {
      action: 'open-explorer',
      actionLabel: 'Buscar',
      detail: queuedDiscoveryCount ? `${queuedDiscoveryCount} hallazgos por revisar` : 'Sin busquedas pendientes',
      done: queuedDiscoveryCount === 0,
      id: 'explorer',
      label: 'Explorar encuentra nuevas',
    },
  ]
  const completed = steps.filter((step) => step.done).length
  const percent = Math.round((completed / steps.length) * 100)
  const title = completed === steps.length ? 'Nexo preparado' : completed >= 2 ? 'Buen arranque' : 'Arranque pendiente'
  const detail =
    completed === steps.length
      ? 'Estanteria, Dado y Explorar tienen cada uno su trabajo claro.'
      : 'Guarda obras, decide con Dado y encuentra nuevas desde Explorar.'

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
    {
      count: count('cooldown'),
      detail: 'Apartadas por el dado',
      id: 'cooldown',
      label: 'En cooldown',
    },
  ]
}

export function getLibraryReviewQueues(items: ListItem[], now = Date.now()): LibraryReviewQueue[] {
  const needsTaxonomyItems = getLibraryReviewItems(items.filter((item) => !hasItemTaxonomy(item)))
  const needsContextItems = getLibraryReviewItems(
    items.filter((item) => typeof item.rating !== 'number' && !item.notes?.trim()),
  )
  const diceReadyItems = getLibraryFocusItems(items.filter((item) => isItemReadyForDicePulse(item, now)))
  const cooldownItems = getLibraryFocusItems(
    items.filter((item) => {
      if (item.status === 'completed' || item.status === 'dropped' || !item.recommendationCooldownUntil) return false
      const timestamp = Date.parse(item.recommendationCooldownUntil)
      return Number.isFinite(timestamp) && timestamp > now
    }),
  )
  const nexoItems = getLibraryFocusItems(items.filter((item) => Boolean(item.publicItemId)))

  const queues: LibraryReviewQueue[] = [
    {
      action: 'open-item',
      count: items.filter((item) => !hasItemTaxonomy(item)).length,
      detail: 'Anade generos, tags o mood tags',
      id: 'needs-taxonomy',
      item: needsTaxonomyItems[0],
      items: needsTaxonomyItems,
      label: 'Afinar taxonomia',
      primary: true,
    },
    {
      action: 'open-item',
      count: items.filter((item) => typeof item.rating !== 'number' && !item.notes?.trim()).length,
      detail: 'Completa rating o notas privadas',
      id: 'needs-context',
      item: needsContextItems[0],
      items: needsContextItems,
      label: 'Dar contexto',
      primary: false,
    },
    {
      action: 'open-dice',
      count: items.filter((item) => isItemReadyForDicePulse(item, now)).length,
      detail: 'Candidatas vivas para tirar',
      id: 'dice-ready',
      item: diceReadyItems[0],
      items: diceReadyItems,
      label: 'Probar dado',
      primary: false,
    },
    {
      action: 'open-view',
      count: items.filter((item) => {
        if (item.status === 'completed' || item.status === 'dropped' || !item.recommendationCooldownUntil) return false
        const timestamp = Date.parse(item.recommendationCooldownUntil)
        return Number.isFinite(timestamp) && timestamp > now
      }).length,
      detail: 'Entradas apartadas temporalmente',
      id: 'cooldown',
      item: cooldownItems[0],
      items: cooldownItems,
      label: 'Revisar cooldowns',
      primary: false,
    },
    {
      action: 'open-view',
      count: items.filter((item) => Boolean(item.publicItemId)).length,
      detail: 'Copias conectadas al catalogo',
      id: 'nexo',
      item: nexoItems[0],
      items: nexoItems,
      label: 'Revisar Nexo',
      primary: false,
    },
  ]

  return queues
    .filter((queue) => queue.count > 0)
    .sort(
      (left, right) =>
        reviewQueueRank(left.id) - reviewQueueRank(right.id) ||
        right.count - left.count ||
        left.label.localeCompare(right.label, 'es'),
    )
    .slice(0, 4)
}

export function matchesLibrarySmartView(item: ListItem, view: LibrarySmartView, now = Date.now()) {
  if (view === 'all') return true
  if (view === 'dice-ready') return isItemReadyForDicePulse(item, now)
  if (view === 'needs-context') return typeof item.rating !== 'number' && !item.notes?.trim()
  if (view === 'needs-taxonomy') return !hasItemTaxonomy(item)
  if (view === 'nexo') return Boolean(item.publicItemId)
  if (view === 'cooldown') {
    if (item.status === 'completed' || item.status === 'dropped' || !item.recommendationCooldownUntil) return false
    const timestamp = Date.parse(item.recommendationCooldownUntil)
    return Number.isFinite(timestamp) && timestamp > now
  }
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
  if (item.status === 'in_progress') return formatProgress(item) || 'Ya empezada, pide cierre'
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

function getLibraryReviewItems(items: ListItem[]) {
  const statusRank: Record<ListItem['status'], number> = {
    in_progress: 0,
    wishlist: 1,
    paused: 2,
    completed: 3,
    dropped: 4,
  }

  return [...items].sort((left, right) => {
    const statusDelta = statusRank[left.status] - statusRank[right.status]
    if (statusDelta !== 0) return statusDelta

    const leftWeight = getLibraryFocusWeight(left)
    const rightWeight = getLibraryFocusWeight(right)
    if (leftWeight !== rightWeight) return rightWeight - leftWeight

    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

function reviewQueueRank(id: LibraryReviewQueue['id']) {
  const ranks: Record<LibraryReviewQueue['id'], number> = {
    all: 99,
    cooldown: 3,
    'dice-ready': 2,
    'needs-context': 1,
    'needs-taxonomy': 0,
    nexo: 4,
  }

  return ranks[id]
}
