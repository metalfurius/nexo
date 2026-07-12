import { describe, expect, it } from 'vitest'
import type { DiscoveryCandidate, ListItem } from '../domain/types'
import {
  getLibraryFocusItems,
  getLibraryFocusReason,
  getLibraryLaunchGuide,
  getLibraryNextPlanFacts,
  getLibraryNextPlanSignals,
  getLibraryNextPlanTitle,
  getLibraryReviewQueues,
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

type ItemOverrides = Omit<Partial<ListItem>, 'weights'> & { weights?: Partial<ListItem['weights']> }

function item(overrides: ItemOverrides): ListItem {
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
    expect(matchesLibrarySmartView(items[5], 'cooldown', now)).toBe(true)

    const counts = Object.fromEntries(getLibrarySmartViewOptions(items, now).map((option) => [option.id, option.count]))

    expect(counts).toEqual({
      all: 6,
      cooldown: 1,
      'dice-ready': 4,
      'needs-context': 3,
      'needs-taxonomy': 1,
      nexo: 1,
    })
  })

  it('builds actionable review queues from private library gaps', () => {
    const queues = getLibraryReviewQueues(
      [
        item({ id: 'taxonomy', title: 'Needs taxonomy', status: 'wishlist', notes: 'Tiene nota' }),
        item({ id: 'context', title: 'Needs context', genres: ['Drama'], status: 'in_progress' }),
        item({
          id: 'cooldown',
          title: 'Cooldown',
          genres: ['rpg'],
          recommendationCooldownUntil: '2026-06-04T12:00:00.000Z',
        }),
        item({ id: 'nexo', title: 'Nexo copy', genres: ['Clasico'], publicItemId: 'public-1' }),
      ],
      now,
    )

    expect(queues.map((queue) => [queue.id, queue.count, queue.item?.id])).toEqual([
      ['needs-taxonomy', 1, 'taxonomy'],
      ['needs-context', 3, 'context'],
      ['dice-ready', 3, 'context'],
      ['cooldown', 1, 'cooldown'],
    ])
    expect(queues.find((queue) => queue.id === 'needs-context')?.items.map((entry) => entry.id)).toEqual([
      'context',
      'cooldown',
      'nexo',
    ])
    expect(queues[0]).toMatchObject({ action: 'open-item', label: 'Afinar taxonomia', primary: true })
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
    expect(guide.steps.find((step) => step.id === 'dice')?.label).toBe('Dado elige guardadas')
    expect(guide.steps.find((step) => step.id === 'explorer')?.label).toBe('Explorar encuentra nuevas')
    expect(guide.steps.find((step) => step.id === 'taxonomy')?.item?.id).toBe('two')
  })

  it('prioritizes library focus by status, weighted urgency and recency', () => {
    const focus = getLibraryFocusItems([
      item({ id: 'done', title: 'Done', status: 'completed', updatedAt: '2026-06-03T00:00:00.000Z' }),
      item({ id: 'paused', title: 'Paused', status: 'paused', updatedAt: '2026-06-03T00:00:00.000Z' }),
      item({ id: 'wish-low', title: 'Wish low', status: 'wishlist', weights: { priority: 0.5 } }),
      item({ id: 'wish-high', title: 'Wish high', status: 'wishlist', weights: { priority: 1.3 } }),
      item({ id: 'progress', title: 'Progress', status: 'in_progress', updatedAt: '2026-06-01T00:00:00.000Z' }),
      item({ id: 'dropped', title: 'Dropped', status: 'dropped' }),
    ])

    expect(focus.map((entry) => entry.id)).toEqual(['progress', 'wish-high', 'wish-low'])
  })

  it('explains focus reasons and quick plan facts', () => {
    const publicItem = item({
      id: 'public',
      title: 'Public',
      durationMinHours: 2,
      durationMaxHours: 5,
      genres: ['Drama'],
      moodTags: ['Calma'],
      publicItemId: 'public-1',
      status: 'wishlist',
      tags: ['lento', 'Drama'],
    })

    expect(getLibraryFocusReason(item({ status: 'in_progress', progress: 'Acto 2' }))).toBe('Acto 2')
    expect(getLibraryFocusReason(item({ status: 'paused' }))).toBe('Pausada, lista para retomar')
    expect(getLibraryFocusReason(item({ weights: { priority: 1.2 } }))).toBe('Alta prioridad')
    expect(getLibraryFocusReason(item({ type: 'movie' }))).toBe('Cine pendiente')
    expect(getLibraryNextPlanTitle(publicItem)).toBe('Listo para empezar')
    expect(getLibraryNextPlanSignals(publicItem)).toEqual(['Drama', 'Calma', 'lento'])
    expect(getLibraryNextPlanFacts(publicItem, 3)).toEqual([
      { label: 'Tiempo', value: '2-5h' },
      { label: 'Origen', value: 'Nexo' },
      { label: 'Senales', value: '3' },
    ])
  })
})
