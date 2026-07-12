import { describe, expect, it } from 'vitest'
import type { ListItem } from '../domain/types'
import {
  formatDuration,
  formatRelativeShortTime,
  getDiscoveryCandidateEffortSignal,
  getItemEffortSignal,
  getItemPulse,
  getItemPulseSummary,
  getItemSignals,
  getItemSubtitle,
  getPersonalEditorReadiness,
  getProgressEditorMode,
  getVisibleItemChips,
  getWeightMeterValue,
  isItemInCooldown,
  itemSourceLabels,
  itemStatusLabels,
  itemTypeLabels,
} from './libraryItemInsights'

const now = Date.parse('2026-06-03T12:00:00.000Z')

const baseItem: ListItem = {
  id: 'base',
  title: 'Base',
  type: 'book',
  status: 'wishlist',
  genres: ['Drama'],
  tags: ['lento'],
  moodTags: ['intimo'],
  weights: { priority: 1, challenge: 0.5, surprise: 0.3 },
  source: 'manual',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
}

type ItemOverrides = Omit<Partial<ListItem>, 'weights'> & { weights?: Partial<ListItem['weights']> }

function item(overrides: ItemOverrides): ListItem {
  return { ...baseItem, ...overrides, weights: { ...baseItem.weights, ...overrides.weights } }
}

describe('library item insights', () => {
  it('exports the shared labels used by item UI', () => {
    expect(itemTypeLabels.watch).toBe('Ver')
    expect(itemTypeLabels.book).toBe('Libros')
    expect(itemStatusLabels.in_progress).toBe('En progreso')
    expect(itemSourceLabels.public).toBe('Catalogo Nexo')
    expect(getProgressEditorMode('anime')).toBe('structured')
    expect(getProgressEditorMode('game')).toBe('playtime')
    expect(getProgressEditorMode('movie')).toBe('none')
  })

  it('formats subtitles, durations and visible chips', () => {
    expect(formatDuration({ durationMinHours: 2, durationMaxHours: 6 })).toBe('2-6h')
    expect(formatDuration({ durationMinHours: undefined, durationMaxHours: 3 })).toBe('3h')
    expect(
      getItemSubtitle(
        item({
          durationMinHours: 2,
          durationMaxHours: 6,
          progressCurrent: 0,
          progressTotal: 12,
          progressUnit: 'episodes',
          publicItemId: 'public-1',
          type: 'series',
        }),
      ),
    ).toBe('Series / 0/12 episodios / 2-6h / Nexo')
    expect(
      getVisibleItemChips(
        item({
          genres: ['Drama', 'Drama'],
          moodTags: ['melancolico'],
          rating: 8,
          tags: ['lento', 'premiada'],
        }),
      ),
    ).toEqual(['8/10', 'Drama', 'lento', 'premiada'])
  })

  it('summarizes item pulse states and clamps meters', () => {
    expect(getItemPulseSummary(item({ status: 'completed', rating: 9 }), now)).toEqual({ label: 'Cerrada', value: '9/10' })
    expect(getItemPulseSummary(item({ status: 'dropped' }), now)).toEqual({ label: 'Fuera', value: 'Droppeada' })
    expect(
      getItemPulseSummary(
        item({ recommendationCooldownUntil: '2026-06-04T12:00:00.000Z' }),
        now,
      ),
    ).toEqual({ label: 'Dado', value: 'Cooldown' })
    expect(getItemPulseSummary(item({ status: 'in_progress', progressCurrent: 6, progressTotal: 12, progressUnit: 'episodes', type: 'anime' }), now)).toEqual({
      label: 'Continuar',
      value: '6/12 episodios',
    })
    expect(getItemPulseSummary(item({ weights: { priority: 1.2 } }), now)).toEqual({ label: 'Dado', value: 'Alta prioridad' })

    expect(getWeightMeterValue(0)).toBe(8)
    expect(getWeightMeterValue(0.42)).toBe(42)
    expect(getWeightMeterValue(2)).toBe(100)
    expect(getItemPulse(item({ weights: { priority: 0, challenge: 0.42, surprise: 2 } }), now).metrics).toEqual([
      { label: 'Foco', value: 8 },
      { label: 'Sorpresa', value: 100 },
      { label: 'Reto', value: 42 },
    ])
  })

  it('scores personal editor readiness by first missing signal', () => {
    const draft = {
      title: '',
      genres: [],
      tags: [],
      moodTags: [],
      weights: { priority: 0, challenge: 0, surprise: 0 },
      durationMaxHours: undefined,
      notes: undefined,
      posterUrl: undefined,
      progress: undefined,
      progressCurrent: undefined,
      progressTotal: undefined,
      progressUnit: undefined,
      rating: undefined,
      type: 'book' as const,
    }
    expect(getPersonalEditorReadiness(draft)).toMatchObject({
      detail: 'Completa identidad para que la ficha sea mas facil de buscar y recomendar.',
      percent: 0,
      score: 0,
      title: 'Ficha por afinar',
    })

    expect(
      getPersonalEditorReadiness({
        ...draft,
        title: 'Lista',
        genres: ['Drama'],
        progressCurrent: 42,
        progressTotal: 300,
        progressUnit: 'pages',
        weights: { priority: 1, challenge: 0, surprise: 0 },
      }),
    ).toMatchObject({
      detail: 'Tiene senales suficientes para busqueda, backup y dado ponderado.',
      percent: 100,
      score: 4,
      title: 'Ficha lista',
    })
  })

  it('formats effort and timeline signals deterministically', () => {
    expect(isItemInCooldown(item({ recommendationCooldownUntil: '2026-06-04T12:00:00.000Z' }), now)).toBe(true)
    expect(isItemInCooldown(item({ recommendationCooldownUntil: '2026-06-02T12:00:00.000Z' }), now)).toBe(false)
    expect(formatRelativeShortTime('2026-06-03T11:59:30.000Z', now)).toBe('Ahora')
    expect(formatRelativeShortTime('2026-06-03T11:30:00.000Z', now)).toBe('30min')
    expect(formatRelativeShortTime('2026-06-03T09:00:00.000Z', now)).toBe('3h')
    expect(formatRelativeShortTime('2026-06-01T12:00:00.000Z', now)).toBe('2d')
    expect(getItemEffortSignal(item({ progress: 'Mitad' }))).toBe('Mitad')
    expect(getItemEffortSignal(item({ progressCurrent: 2, progressTotal: 10, progressUnit: 'chapters', type: 'manga' }))).toBe('2/10 capitulos')
    expect(getItemEffortSignal(item({ durationMaxHours: 8, progress: undefined }))).toBe('8h')
    expect(getItemEffortSignal(item({ weights: { surprise: 0.8 }, progress: undefined }))).toBe('Sorpresa alta')
    expect(getDiscoveryCandidateEffortSignal({ progressTotal: 2.6, progressUnit: 'hours', type: 'movie' })).toBe('2.6h')
    expect(getDiscoveryCandidateEffortSignal({ progressTotal: 28, progressUnit: 'episodes', type: 'anime' })).toBe('0/28 episodios')

    expect(
      getItemSignals(
        item({
          lastRecommendedAt: '2026-06-03T11:30:00.000Z',
          publicItemId: 'public-1',
          progress: undefined,
        }),
        now,
      ),
    ).toEqual([
      { label: 'Catalogo Nexo', tone: 'strong' },
      { label: 'Pendiente' },
      { label: 'Dado 30min' },
    ])
  })
})
