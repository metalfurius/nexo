import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  type ListItem,
  type RecommendationPreferences,
} from '../domain/types'
import { getActiveDiceFilters, getDiceEligibilityBreakdown, matchesDiceMedium } from './diceInsights'

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
        item({ id: 'blocked', title: 'Blocked', tags: ['terror'] }),
      ],
      preferences,
      { ...DEFAULT_SETTINGS, blockedTags: ['Terror'] },
      now,
    )

    expect(breakdown).toEqual({
      available: 1,
      blockedTags: 1,
      cooldown: 1,
      medium: 1,
      paused: 1,
      resolved: 1,
      total: 6,
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
      '2 tags bloqueados',
    ])
  })
})
