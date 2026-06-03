import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem, type RecommendationPreferences } from '../domain/types'
import { recommendItem, scoreCandidates } from './recommendations'

const baseItem = (item: Partial<ListItem> & Pick<ListItem, 'id' | 'title'>): ListItem => ({
  type: 'game',
  status: 'wishlist',
  genres: [],
  tags: [],
  moodTags: [],
  weights: DEFAULT_WEIGHTS,
  source: 'manual',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...item,
})

const prefs: RecommendationPreferences = {
  medium: 'any',
  timeBudgetHours: 12,
  energy: 'medium',
  intensity: 'balanced',
  novelty: 'balanced',
  includePaused: false,
  surprisePercent: 0,
  seed: 'test',
}

describe('recommendations', () => {
  it('excludes completed and dropped entries', () => {
    const candidates = scoreCandidates(
      [
        baseItem({ id: 'done', title: 'Done', status: 'completed' }),
        baseItem({ id: 'drop', title: 'Drop', status: 'dropped' }),
        baseItem({ id: 'next', title: 'Next' }),
      ],
      prefs,
      DEFAULT_SETTINGS,
    )

    expect(candidates.map((candidate) => candidate.item.id)).toEqual(['next'])
  })

  it('keeps deterministic output for the same seed', () => {
    const items = [
      baseItem({ id: 'short', title: 'Short', durationMaxHours: 4 }),
      baseItem({ id: 'long', title: 'Long', durationMinHours: 30, durationMaxHours: 50 }),
    ]

    const first = recommendItem(items, prefs, DEFAULT_SETTINGS)
    const second = recommendItem(items, prefs, DEFAULT_SETTINGS)

    expect(first?.item.id).toBe(second?.item.id)
    expect(first?.item.id).toBe('short')
  })

  it('lets surprise widen the candidate pool without recommending blocked statuses', () => {
    const items = [
      baseItem({ id: 'obvious', title: 'Obvious', durationMaxHours: 3 }),
      baseItem({ id: 'strange', title: 'Strange', weights: { ...DEFAULT_WEIGHTS, surprise: 1 } }),
      baseItem({ id: 'done', title: 'Done', status: 'completed', weights: { ...DEFAULT_WEIGHTS, priority: 99 } }),
    ]

    const result = recommendItem(items, { ...prefs, surprisePercent: 100, seed: 'chaos' }, DEFAULT_SETTINGS)

    expect(result?.poolSize).toBeGreaterThan(1)
    expect(result?.item.status).not.toBe('completed')
  })

  it('uses soft intensity to favor light low-challenge entries', () => {
    const candidates = scoreCandidates(
      [
        baseItem({
          id: 'dense',
          title: 'Dense',
          moodTags: ['denso'],
          weights: { ...DEFAULT_WEIGHTS, challenge: 0.95 },
        }),
        baseItem({
          id: 'light',
          title: 'Light',
          moodTags: ['ligero'],
          weights: { ...DEFAULT_WEIGHTS, challenge: 0.15 },
        }),
      ],
      { ...prefs, intensity: 'soft' },
      DEFAULT_SETTINGS,
    )

    expect(candidates.map((candidate) => candidate.item.id)).toEqual(['light', 'dense'])
    expect(candidates[0].reasons).toContain('intensidad suave')
  })

  it('uses intense intensity to favor dense high-challenge entries', () => {
    const candidates = scoreCandidates(
      [
        baseItem({
          id: 'light',
          title: 'Light',
          moodTags: ['ligero'],
          weights: { ...DEFAULT_WEIGHTS, challenge: 0.15 },
        }),
        baseItem({
          id: 'dense',
          title: 'Dense',
          moodTags: ['denso'],
          weights: { ...DEFAULT_WEIGHTS, challenge: 0.95 },
        }),
      ],
      { ...prefs, intensity: 'intense' },
      DEFAULT_SETTINGS,
    )

    expect(candidates.map((candidate) => candidate.item.id)).toEqual(['dense', 'light'])
    expect(candidates[0].reasons).toContain('intensidad intensa')
  })

  it('uses balanced intensity to favor medium-challenge entries', () => {
    const candidates = scoreCandidates(
      [
        baseItem({
          id: 'too-soft',
          title: 'Too soft',
          weights: { ...DEFAULT_WEIGHTS, challenge: 0.05 },
        }),
        baseItem({
          id: 'middle',
          title: 'Middle',
          weights: { ...DEFAULT_WEIGHTS, challenge: 0.52 },
        }),
        baseItem({
          id: 'too-hard',
          title: 'Too hard',
          weights: { ...DEFAULT_WEIGHTS, challenge: 0.95 },
        }),
      ],
      { ...prefs, intensity: 'balanced' },
      DEFAULT_SETTINGS,
    )

    expect(candidates[0].item.id).toBe('middle')
    expect(candidates[0].reasons).toContain('intensidad equilibrada')
  })
})
