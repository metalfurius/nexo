import { describe, expect, it } from 'vitest'
import type { DiscoveryCandidate, ListItem } from '../domain/types'
import {
  getLibraryLaunchGuide,
  getLibrarySmartViewOptions,
  hasItemTaxonomy,
  isItemReadyForDicePulse,
  matchesLibrarySmartView,
} from './libraryInsights'

const now = Date.parse('2026-06-03T12:00:00.000Z')

const baseItem: ListItem = {
  id: 'base',
  title: 'Base',
  type: 'book',
  status: 'wishlist',
  genres: [],
  tags: [],
  moodTags: [],
  weights: { priority: 1, challenge: 0.5, surprise: 0.3 },
  source: 'manual',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

function item(overrides: Partial<ListItem>): ListItem {
  return { ...baseItem, ...overrides, weights: { ...baseItem.weights, ...overrides.weights } }
}

function candidate(overrides: Partial<DiscoveryCandidate>): DiscoveryCandidate {
  return {
    id: 'candidate',
    title: 'Candidate',
    type: 'book',
    status: 'queued',
    origin: 'prompt',
    source: 'prompt',
    sourceId: 'candidate',
    genres: [],
    tags: [],
    moodTags: [],
    externalRefs: {},
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('library insights', () => {
  it('detects dice-ready entries without admitting resolved or future cooldown items', () => {
    expect(isItemReadyForDicePulse(item({ status: 'wishlist' }), now)).toBe(true)
    expect(isItemReadyForDicePulse(item({ status: 'completed' }), now)).toBe(false)
    expect(isItemReadyForDicePulse(item({ status: 'dropped' }), now)).toBe(false)
    expect(
      isItemReadyForDicePulse(
        item({ recommendationCooldownUntil: '2026-06-04T12:00:00.000Z' }),
        now,
      ),
    ).toBe(false)
    expect(
      isItemReadyForDicePulse(
        item({ recommendationCooldownUntil: '2026-06-02T12:00:00.000Z' }),
        now,
      ),
    ).toBe(true)
  })

  it('counts smart views for dice readiness, context gaps, taxonomy gaps and catalog copies', () => {
    const items = [
      item({ id: 'ready', title: 'Ready', genres: ['sci-fi'], notes: 'Contexto' }),
      item({ id: 'context', title: 'Needs context', genres: ['drama'] }),
      item({ id: 'taxonomy', title: 'Needs taxonomy', notes: 'Tiene nota' }),
      item({ id: 'nexo', title: 'Nexo', publicItemId: 'public-1', genres: ['clasico'] }),
      item({ id: 'done', title: 'Done', status: 'completed', genres: ['sci-fi'], rating: 8 }),
      item({
        id: 'cooldown',
        title: 'Cooldown',
        genres: ['rpg'],
        recommendationCooldownUntil: '2026-06-04T12:00:00.000Z',
      }),
    ]

    expect(hasItemTaxonomy(items[0])).toBe(true)
    expect(matchesLibrarySmartView(items[1], 'needs-context', now)).toBe(true)
    expect(matchesLibrarySmartView(items[2], 'needs-taxonomy', now)).toBe(true)
    expect(matchesLibrarySmartView(items[3], 'nexo', now)).toBe(true)

    const counts = Object.fromEntries(getLibrarySmartViewOptions(items, now).map((option) => [option.id, option.count]))

    expect(counts).toEqual({
      all: 6,
      'dice-ready': 4,
      'needs-context': 3,
      'needs-taxonomy': 1,
      nexo: 1,
    })
  })

  it('builds a launch guide that highlights incomplete taxonomy and queued discovery', () => {
    const items = [
      item({ id: 'one', title: 'One', genres: ['sci-fi'] }),
      item({ id: 'two', title: 'Two' }),
      item({ id: 'done', title: 'Done', status: 'completed', genres: ['drama'] }),
    ]
    const guide = getLibraryLaunchGuide(items, [candidate({ id: 'queued' })], now)

    expect(guide.completed).toBe(2)
    expect(guide.percent).toBe(50)
    expect(guide.title).toBe('Buen arranque')
    expect(guide.steps.map((step) => [step.id, step.done])).toEqual([
      ['base', true],
      ['taxonomy', false],
      ['dice', true],
      ['explorer', false],
    ])
    expect(guide.steps.find((step) => step.id === 'taxonomy')?.item?.id).toBe('two')
  })
})
