import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  type ListItem,
  type RecommendationPreferences,
  type RecommendationResult,
} from '../domain/types'
import {
  diceEnergyLabels,
  diceIntensityLabels,
  diceNoveltyLabels,
  getActiveDiceFilters,
  getDiceEligibilityBreakdown,
  getDiceScoreMeterWidth,
  getRecommendationLearningSignals,
  getRecommendationSessionPlan,
  matchesDiceMedium,
} from './diceInsights'

const now = Date.parse('2026-06-03T12:00:00.000Z')

const baseItem: ListItem = {
  id: 'base',
  title: 'Base',
  type: 'game',
  status: 'wishlist',
  genres: [],
  tags: [],
  moodTags: [],
  weights: DEFAULT_WEIGHTS,
  source: 'manual',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

const preferences: RecommendationPreferences = {
  ...DEFAULT_RECOMMENDATION_PREFERENCES,
  includePaused: false,
  medium: 'game',
  timeBudgetHours: 15,
}

function item(overrides: Partial<ListItem>): ListItem {
  return { ...baseItem, ...overrides, weights: { ...baseItem.weights, ...overrides.weights } }
}

describe('dice insights', () => {
  it('breaks down every exclusion reason in priority order', () => {
    const breakdown = getDiceEligibilityBreakdown(
      [
        item({ id: 'ready', title: 'Ready' }),
        item({ id: 'done', title: 'Done', status: 'completed' }),
        item({ id: 'paused', title: 'Paused', status: 'paused' }),
        item({
          id: 'cooldown',
          title: 'Cooldown',
          recommendationCooldownUntil: '2026-06-04T12:00:00.000Z',
        }),
        item({ id: 'medium', title: 'Medium', type: 'book' }),
        item({ id: 'blocked-tag', title: 'Blocked tag', tags: ['terror'] }),
        item({ id: 'blocked-genre', title: 'Blocked genre', genres: ['Gore'] }),
        item({ id: 'blocked-mood', title: 'Blocked mood', moodTags: ['oscuro'] }),
      ],
      preferences,
      { ...DEFAULT_SETTINGS, blockedTags: ['Terror', 'gore', 'Oscuro'] },
      now,
    )

    expect(breakdown).toEqual({
      available: 1,
      blockedTags: 3,
      cooldown: 1,
      medium: 1,
      paused: 1,
      resolved: 1,
      total: 8,
    })
  })

  it('matches watch as screen and comic reading media without matching games or books', () => {
    expect(matchesDiceMedium('movie', 'watch')).toBe(true)
    expect(matchesDiceMedium('anime', 'watch')).toBe(true)
    expect(matchesDiceMedium('comic', 'watch')).toBe(true)
    expect(matchesDiceMedium('game', 'watch')).toBe(false)
    expect(matchesDiceMedium('book', 'watch')).toBe(false)
    expect(matchesDiceMedium('book', 'book')).toBe(true)
    expect(matchesDiceMedium('book', 'any')).toBe(true)
  })

  it('summarizes active filters for the dice recovery panel and readiness metrics', () => {
    expect(diceEnergyLabels.medium).toBe('Media')
    expect(diceIntensityLabels.intense).toBe('Intensa')
    expect(diceNoveltyLabels.comfort).toBe('Confort')
    expect(
      getActiveDiceFilters(
        {
          ...preferences,
          energy: 'high',
          includePaused: true,
          medium: 'watch',
          novelty: 'surprise',
          timeBudgetHours: undefined,
        },
        { ...DEFAULT_SETTINGS, blockedTags: ['terror', 'gore'] },
      ),
    ).toEqual([
      'Medio: Ver',
      'Sin limite de tiempo',
      'Energia: Alta',
      'Novedad: Sorpresa',
      'Incluye pausados',
      '2 senales bloqueadas',
    ])
  })

  it('clamps candidate score meter widths', () => {
    expect(getDiceScoreMeterWidth(0, 0)).toBe('0%')
    expect(getDiceScoreMeterWidth(1, 100)).toBe('8%')
    expect(getDiceScoreMeterWidth(25, 100)).toBe('25%')
    expect(getDiceScoreMeterWidth(120, 100)).toBe('100%')
  })

  it('builds a recommendation session plan from the selected item and dice preferences', () => {
    const recommendation: RecommendationResult = {
      item: item({
        durationMinHours: 2,
        durationMaxHours: 5,
        genres: ['Drama'],
        moodTags: ['Calma'],
        status: 'in_progress',
        tags: ['lento', 'Drama'],
        type: 'series',
      }),
      poolSize: 7,
      reasons: ['ready'],
      roll: 0.424,
      score: 3.5,
    }

    expect(
      getRecommendationSessionPlan(recommendation, {
        ...preferences,
        energy: 'low',
        intensity: 'intense',
        surprisePercent: 35,
      }),
    ).toEqual({
      detail: 'Series con intensidad intensa y 35% de sorpresa.',
      facts: [
        { detail: 'Baja energia', label: 'Clima', value: 'Intensa' },
        { detail: '15h max.', label: 'Tiempo', value: '2-5h' },
        { detail: 'Series', label: 'Estado', value: 'En progreso' },
        { detail: 'Pool 7', label: 'Azar', value: '42%' },
      ],
      signals: ['Drama', 'Calma', 'lento'],
      title: 'Continuar una obra activa',
    })
  })

  it('finds new learnable taste signals without duplicating current settings', () => {
    expect(
      getRecommendationLearningSignals(
        item({
          genres: ['Sci-Fi', 'Drama', 'sci fi'],
          tags: ['pelicula', 'Terror', 'pelicula', 'raro'],
        }),
        {
          ...DEFAULT_SETTINGS,
          blockedTags: ['terror'],
          favoriteGenres: ['Drama'],
          favoriteTags: ['raro'],
        },
      ),
    ).toEqual({
      genres: ['Sci-Fi'],
      tags: ['pelicula'],
      total: 2,
    })
  })
})
