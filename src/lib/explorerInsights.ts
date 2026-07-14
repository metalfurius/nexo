import type { DiscoveryCandidate, DiscoveryStatus } from '../domain/types'

export type ExplorerSourceFilter = 'all' | 'nexo' | 'external' | 'prompt'

export const discoverySourceLabels: Record<DiscoveryCandidate['source'], string> = {
  nexo: 'Nexo',
  tmdb: 'TMDB',
  rawg: 'RAWG',
  openLibrary: 'Open Library',
  googleBooks: 'Google Books',
  anilist: 'AniList',
  mangaDex: 'MangaDex',
  kitsu: 'Kitsu',
  jikan: 'Jikan',
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
  { id: 'all', label: 'Todos los orígenes', detail: 'Todos los hallazgos' },
  { id: 'nexo', label: 'Catálogo Nexo', detail: 'Fichas de Nexo' },
  { id: 'external', label: 'Fuentes externas', detail: 'Catálogos externos' },
  { id: 'prompt', label: 'Ideas guardadas', detail: 'Pistas manuales' },
]

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
