import { describe, expect, it } from 'vitest'
import type { DiscoveryCandidate } from '../domain/types'
import {
  discoveryEmptyCopy,
  getCandidateDecisionBrief,
  getDiscoverySourceFilter,
  getDiscoveryStatusCounts,
  getDominantExplorerSourceLabel,
  getExplorerDecisionState,
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

  it('builds the queued decision state with spotlight, feed and progress', () => {
    const candidates = [
      candidate({ id: 'nexo', title: 'Nexo', source: 'nexo', status: 'queued' }),
      candidate({ id: 'external', title: 'External', source: 'tmdb', status: 'queued' }),
      candidate({ id: 'prompt', title: 'Prompt', source: 'prompt', status: 'queued' }),
      candidate({ id: 'saved', title: 'Saved', source: 'rawg', status: 'saved' }),
      candidate({ id: 'dismissed', title: 'Dismissed', source: 'anilist', status: 'dismissed' }),
    ]
    const state = getExplorerDecisionState(candidates, 'queued', 'all')

    expect(state.discoveryCounts).toEqual({ queued: 3, saved: 1, dismissed: 1 })
    expect(state.sourceCounts).toEqual({ all: 3, nexo: 1, external: 1, prompt: 1 })
    expect(state.queuedSourceCounts).toEqual({ all: 3, nexo: 1, external: 1, prompt: 1 })
    expect(state.spotlightCandidate?.id).toBe('nexo')
    expect(state.feedCandidates.map((entry) => entry.id)).toEqual(['external', 'prompt'])
    expect(state.decisionProgressPercent).toBe(40)
    expect(state.decisionSummaryTitle).toBe('3 por decidir')
    expect(state.decisionSummaryDetail).toBe('Revisa hallazgos uno a uno. Guardar los manda a Biblioteca; descartar limpia ruido.')
    expect(state.activeSourceLabel).toBe('Todo')
    expect(state.canDismissVisibleQueue).toBe(false)
  })

  it('filters the queued state by source and enables scoped dismissal', () => {
    const candidates = [
      candidate({ id: 'nexo', source: 'nexo', status: 'queued' }),
      candidate({ id: 'tmdb', source: 'tmdb', status: 'queued' }),
      candidate({ id: 'rawg', source: 'rawg', status: 'queued' }),
    ]
    const visible = getVisibleExplorerCandidates(candidates, 'external')
    const state = getExplorerDecisionState(candidates, 'queued', 'external')

    expect(visible.map((entry) => entry.id)).toEqual(['tmdb', 'rawg'])
    expect(state.visibleCandidates.map((entry) => entry.id)).toEqual(['tmdb', 'rawg'])
    expect(state.spotlightCandidate?.id).toBe('tmdb')
    expect(state.activeSourceLabel).toBe('APIs')
    expect(state.decisionSummaryTitle).toBe('2 por decidir')
    expect(state.decisionSummaryDetail).toBe('APIs activo: revisa solo este origen sin tocar el resto.')
    expect(state.canDismissVisibleQueue).toBe(true)
  })

  it('reports filtered-empty historical views without a spotlight', () => {
    const state = getExplorerDecisionState(
      [
        candidate({ id: 'saved-nexo', source: 'nexo', status: 'saved' }),
        candidate({ id: 'dismissed-prompt', source: 'prompt', status: 'dismissed' }),
      ],
      'saved',
      'prompt',
    )

    expect(state.candidatesInView.map((entry) => entry.id)).toEqual(['saved-nexo'])
    expect(state.visibleCandidates).toEqual([])
    expect(state.spotlightCandidate).toBeUndefined()
    expect(state.isSourceFilteredEmpty).toBe(true)
    expect(state.decisionSummaryTitle).toBe('0 guardados')
    expect(state.decisionSummaryDetail).toBe('Consulta decisiones pasadas y recupera descartes si cambias de idea.')
  })

  it('selects the dominant visible source label', () => {
    expect(getDominantExplorerSourceLabel({ all: 0, nexo: 0, external: 0, prompt: 0 })).toBe('Sin origen')
    expect(getDominantExplorerSourceLabel({ all: 5, nexo: 1, external: 3, prompt: 1 })).toBe('APIs')
  })

  it('explains the next action for each candidate source', () => {
    expect(getCandidateDecisionBrief(candidate({ source: 'nexo' }), false)).toMatchObject({
      action: 'Guardar copia privada',
      title: 'Ficha curada de Nexo',
    })
    expect(getCandidateDecisionBrief(candidate({ source: 'prompt' }), false)).toMatchObject({
      action: 'Convertir en pendiente',
      title: 'Idea ligera',
    })
    expect(getCandidateDecisionBrief(candidate({ source: 'tmdb' }), false)).toMatchObject({
      action: 'Guardar en privado',
      facts: [
        { label: 'Origen', value: 'TMDB' },
        { label: 'Destino', value: 'Privado' },
      ],
      title: 'Encontrado fuera de Nexo',
    })
    expect(getCandidateDecisionBrief(candidate({ source: 'rawg' }), true)).toMatchObject({
      action: 'Guardar o pasar a catalogo',
      facts: [
        { label: 'Origen', value: 'RAWG' },
        { label: 'Destino', value: 'Biblioteca' },
      ],
    })
  })
})
