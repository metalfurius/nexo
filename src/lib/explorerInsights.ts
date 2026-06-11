import type { DiscoveryCandidate, DiscoveryStatus } from '../domain/types'

export type ExplorerSourceFilter = 'all' | 'nexo' | 'external' | 'prompt'

export interface CandidateDecisionBrief {
  action: string
  detail: string
  facts: Array<{ label: string; value: string }>
  title: string
}

export interface ExplorerDecisionState {
  activeSourceLabel: string
  canDismissVisibleQueue: boolean
  candidatesInView: DiscoveryCandidate[]
  decisionProgressPercent: number
  decisionSummaryDetail: string
  decisionSummaryTitle: string
  discoveryCounts: Record<DiscoveryStatus, number>
  dominantSourceLabel: string
  feedCandidates: DiscoveryCandidate[]
  isSourceFilteredEmpty: boolean
  queuedSourceCounts: Record<ExplorerSourceFilter, number>
  sourceCounts: Record<ExplorerSourceFilter, number>
  spotlightCandidate?: DiscoveryCandidate
  totalDiscoveryCount: number
  visibleCandidates: DiscoveryCandidate[]
  visibleQueuedCount: number
}

export const discoverySourceLabels: Record<DiscoveryCandidate['source'], string> = {
  nexo: 'Nexo',
  tmdb: 'TMDB',
  rawg: 'RAWG',
  openLibrary: 'Open Library',
  anilist: 'AniList',
  wikidata: 'Wikidata',
  prompt: 'Explorador',
}

export const discoveryStatusLabels: Record<DiscoveryStatus, string> = {
  queued: 'En cola',
  saved: 'Guardados',
  dismissed: 'Descartados',
}

export const discoveryEmptyCopy: Record<DiscoveryStatus, { title: string; detail: string }> = {
  queued: {
    title: 'Busca una obra para guardar',
    detail: 'Escribe un titulo o deja que Nexo proponga una pista visual.',
  },
  saved: {
    title: 'Aun no has guardado hallazgos',
    detail: 'Cuando algo pase a Biblioteca quedara registrado aqui para recordar de donde vino.',
  },
  dismissed: {
    title: 'No hay descartes',
    detail: 'Lo que apartes de la cola aparece aqui sin ensuciar tus pendientes.',
  },
}

export const explorerSourceFilters: Array<{ id: ExplorerSourceFilter; label: string; detail: string }> = [
  { id: 'all', label: 'Todo', detail: 'Toda la vista' },
  { id: 'nexo', label: 'Nexo', detail: 'Catalogo local' },
  { id: 'external', label: 'APIs', detail: 'Fuentes externas' },
  { id: 'prompt', label: 'Ideas', detail: 'Cartas manuales' },
]

export function getExplorerDecisionState(
  candidates: DiscoveryCandidate[],
  view: DiscoveryStatus,
  sourceFilter: ExplorerSourceFilter,
): ExplorerDecisionState {
  const discoveryCounts = getDiscoveryStatusCounts(candidates)
  const candidatesInView = candidates.filter((candidate) => candidate.status === view)
  const sourceCounts = getExplorerSourceCounts(candidatesInView)
  const visibleCandidates = getVisibleExplorerCandidates(candidatesInView, sourceFilter)
  const spotlightCandidate = view === 'queued' ? visibleCandidates[0] : undefined
  const feedCandidates = spotlightCandidate ? visibleCandidates.slice(1) : visibleCandidates
  const queuedSourceCounts = getExplorerSourceCounts(candidates.filter((candidate) => candidate.status === 'queued'))
  const activeSourceLabel = getExplorerSourceFilterLabel(sourceFilter)
  const isSourceFilteredEmpty = sourceFilter !== 'all' && candidatesInView.length > 0 && visibleCandidates.length === 0
  const totalDiscoveryCount = candidates.length
  const decisionProgressPercent = getExplorerDecisionProgress(discoveryCounts, totalDiscoveryCount)
  const visibleQueuedCount = view === 'queued' ? visibleCandidates.length : 0
  const canDismissVisibleQueue = view === 'queued' && sourceFilter !== 'all' && visibleQueuedCount > 0
  const dominantSourceLabel = getDominantExplorerSourceLabel(sourceCounts)
  const { detail: decisionSummaryDetail, title: decisionSummaryTitle } = getExplorerDecisionSummary({
    activeSourceLabel,
    sourceFilter,
    view,
    visibleCandidatesCount: visibleCandidates.length,
    visibleQueuedCount,
  })

  return {
    activeSourceLabel,
    canDismissVisibleQueue,
    candidatesInView,
    decisionProgressPercent,
    decisionSummaryDetail,
    decisionSummaryTitle,
    discoveryCounts,
    dominantSourceLabel,
    feedCandidates,
    isSourceFilteredEmpty,
    queuedSourceCounts,
    sourceCounts,
    spotlightCandidate,
    totalDiscoveryCount,
    visibleCandidates,
    visibleQueuedCount,
  }
}

export function getDiscoveryStatusCounts(candidates: DiscoveryCandidate[]): Record<DiscoveryStatus, number> {
  const counts: Record<DiscoveryStatus, number> = { queued: 0, saved: 0, dismissed: 0 }
  for (const candidate of candidates) {
    counts[candidate.status] += 1
  }
  return counts
}

export function getDiscoverySourceFilter(candidate: DiscoveryCandidate): ExplorerSourceFilter {
  if (candidate.source === 'nexo') return 'nexo'
  if (candidate.source === 'prompt') return 'prompt'
  return 'external'
}

export function getExplorerSourceCounts(candidates: DiscoveryCandidate[]): Record<ExplorerSourceFilter, number> {
  const counts: Record<ExplorerSourceFilter, number> = { all: candidates.length, nexo: 0, external: 0, prompt: 0 }
  for (const candidate of candidates) {
    counts[getDiscoverySourceFilter(candidate)] += 1
  }
  return counts
}

export function getVisibleExplorerCandidates(candidates: DiscoveryCandidate[], sourceFilter: ExplorerSourceFilter) {
  return sourceFilter === 'all'
    ? candidates
    : candidates.filter((candidate) => getDiscoverySourceFilter(candidate) === sourceFilter)
}

export function getExplorerDecisionProgress(counts: Record<DiscoveryStatus, number>, totalDiscoveryCount: number) {
  return totalDiscoveryCount ? Math.round(((counts.saved + counts.dismissed) / totalDiscoveryCount) * 100) : 0
}

export function getExplorerSourceFilterLabel(sourceFilter: ExplorerSourceFilter) {
  return explorerSourceFilters.find((filter) => filter.id === sourceFilter)?.label ?? 'Todo'
}

export function getDominantExplorerSourceLabel(counts: Record<ExplorerSourceFilter, number>) {
  const dominant = (['nexo', 'external', 'prompt'] as const)
    .map((source) => ({ count: counts[source], source }))
    .sort((left, right) => right.count - left.count)[0]

  if (!dominant || dominant.count === 0) return 'Sin origen'
  return getExplorerSourceFilterLabel(dominant.source)
}

export function getExplorerDecisionSummary({
  activeSourceLabel,
  sourceFilter,
  view,
  visibleCandidatesCount,
  visibleQueuedCount,
}: {
  activeSourceLabel: string
  sourceFilter: ExplorerSourceFilter
  view: DiscoveryStatus
  visibleCandidatesCount: number
  visibleQueuedCount: number
}) {
  const title =
    view === 'queued'
      ? visibleQueuedCount
        ? `${visibleQueuedCount} por decidir`
        : 'Sin decisiones visibles'
      : `${visibleCandidatesCount} ${discoveryStatusLabels[view].toLowerCase()}`
  const detail =
    view === 'queued'
      ? sourceFilter === 'all'
        ? 'Revisa hallazgos uno a uno. Guardar los manda a Biblioteca; descartar limpia ruido.'
        : `${activeSourceLabel} activo: revisa solo este origen sin tocar el resto.`
      : 'Consulta decisiones pasadas y recupera descartes si cambias de idea.'

  return { detail, title }
}

export function getCandidateDecisionBrief(candidate: DiscoveryCandidate, canCurate: boolean): CandidateDecisionBrief {
  if (candidate.source === 'nexo') {
    return {
      action: 'Guardar copia privada',
      detail: 'Guarda una copia en tu biblioteca. Tus notas, rating y dado no cambian el catalogo publico.',
      facts: [
        { label: 'Origen', value: discoverySourceLabels[candidate.source] },
        { label: 'Destino', value: 'Biblioteca' },
      ],
      title: 'Ficha curada de Nexo',
    }
  }

  if (candidate.source === 'prompt') {
    return {
      action: 'Convertir en pendiente',
      detail: 'Es una carta de exploracion. Guardarla crea una entrada privada para pensarla luego.',
      facts: [
        { label: 'Origen', value: discoverySourceLabels[candidate.source] },
        { label: 'Destino', value: 'Biblioteca' },
      ],
      title: 'Idea ligera',
    }
  }

  return {
    action: canCurate ? 'Guardar o pasar a catalogo' : 'Guardar en privado',
    detail: canCurate
      ? 'Guardalo para ti ahora. Si merece vivir en Nexo, puedes curarlo despues.'
      : 'Crea una entrada privada sin publicar nada en el catalogo compartido.',
    facts: [
      { label: 'Origen', value: discoverySourceLabels[candidate.source] },
      { label: 'Destino', value: canCurate ? 'Biblioteca' : 'Privado' },
    ],
    title: 'Encontrado fuera de Nexo',
  }
}
