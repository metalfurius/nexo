import { describe, expect, it } from 'vitest'
import type { DiscoveryCandidate } from '../domain/types'
import {
  discoveryEmptyCopy,
  explorerSourceFilters,
  getDiscoverySourceFilter,
  getDiscoveryStatusCounts,
  getExplorerSourceCounts,
  getVisibleExplorerCandidates,
} from './explorerInsights'

const baseCandidate: DiscoveryCandidate = {
  id: 'base',
  title: 'Base',
  type: 'movie',
  status: 'queued',
  origin: 'externalSearch',
  source: 'tmdb',
  sourceId: 'base',
  overview: 'Overview',
  posterUrl: 'https://example.com/poster.jpg',
  releaseYear: 2026,
  genres: ['Sci-Fi'],
  tags: ['space'],
  moodTags: [],
  externalRefs: {},
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

function candidate(overrides: Partial<DiscoveryCandidate>): DiscoveryCandidate {
  return { ...baseCandidate, ...overrides }
}

describe('explorer insights', () => {
  it('groups discovery sources into user-facing filters', () => {
    expect(getDiscoverySourceFilter(candidate({ source: 'nexo' }))).toBe('nexo')
    expect(getDiscoverySourceFilter(candidate({ source: 'prompt' }))).toBe('prompt')
    expect(getDiscoverySourceFilter(candidate({ source: 'rawg' }))).toBe('external')
    expect(getDiscoverySourceFilter(candidate({ source: 'openLibrary' }))).toBe('external')
  })

  it('counts discovery status and source filters', () => {
    const candidates = [
      candidate({ id: 'nexo', source: 'nexo', status: 'queued' }),
      candidate({ id: 'external', source: 'tmdb', status: 'queued' }),
      candidate({ id: 'prompt', source: 'prompt', status: 'saved' }),
      candidate({ id: 'dismissed', source: 'rawg', status: 'dismissed' }),
    ]

    expect(getDiscoveryStatusCounts(candidates)).toEqual({ queued: 2, saved: 1, dismissed: 1 })
    expect(getExplorerSourceCounts(candidates)).toEqual({ all: 4, nexo: 1, external: 2, prompt: 1 })
  })

  it('keeps empty-state copy aligned with the explorer workflow', () => {
    expect(discoveryEmptyCopy.queued).toEqual({
      title: 'Busca una obra para guardar',
      detail: 'Escribe un titulo o deja que Nexo proponga una pista visual.',
    })
    expect(discoveryEmptyCopy.saved.title).toBe('Aun no has guardado hallazgos')
    expect(discoveryEmptyCopy.dismissed.title).toBe('No hay descartes')
  })

  it('filters the review inbox by source with clear user-facing labels', () => {
    const candidates = [
      candidate({ id: 'nexo', source: 'nexo', status: 'queued' }),
      candidate({ id: 'tmdb', source: 'tmdb', status: 'queued' }),
      candidate({ id: 'rawg', source: 'rawg', status: 'queued' }),
    ]
    const visible = getVisibleExplorerCandidates(candidates, 'external')

    expect(visible.map((entry) => entry.id)).toEqual(['tmdb', 'rawg'])
    expect(explorerSourceFilters.map(({ id, label }) => [id, label])).toEqual([
      ['all', 'Todos los orígenes'],
      ['nexo', 'Catálogo Nexo'],
      ['external', 'Fuentes externas'],
      ['prompt', 'Ideas guardadas'],
    ])
  })

})
