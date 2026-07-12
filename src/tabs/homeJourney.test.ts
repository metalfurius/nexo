import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, type ItemStatus, type ListItem } from '../domain/types'
import type { RoadmapEntry, RoadmapView } from '../lib/roadmap'
import { buildHomeJourneyModel, HOME_JOURNEY_VISIBLE_LIMITS } from './homeJourney'

function item(
  id: string,
  status: ItemStatus = 'wishlist',
  updatedAt = '2026-01-01T00:00:00.000Z',
  title = id,
): ListItem {
  return {
    id,
    title,
    type: 'book',
    status,
    genres: [],
    tags: [],
    moodTags: [],
    weights: { ...DEFAULT_WEIGHTS },
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  }
}

function entry(id: string, lane: RoadmapEntry['lane'], title = id): RoadmapEntry {
  return {
    item: item(id, lane === 'now' ? 'in_progress' : lane === 'later' ? 'paused' : 'wishlist', undefined, title),
    lane,
    placement: 'manual',
  }
}

function roadmap(overrides: Partial<RoadmapView> = {}): RoadmapView {
  return {
    now: [],
    next: [],
    later: [],
    ...overrides,
  }
}

describe('buildHomeJourneyModel', () => {
  it('represents loading without briefly exposing an empty invitation or stale entries', () => {
    const model = buildHomeJourneyModel({
      roadmap: roadmap({ now: [entry('stale-current', 'now')] }),
      items: [item('stale-current', 'in_progress')],
      loading: true,
    })

    expect(model).toMatchObject({
      status: 'loading',
      hero: { kind: 'loading' },
      additionalNow: [],
      recentCompleted: [],
    })
    expect(model.next.entries).toEqual([])
    expect(model.later.entries).toEqual([])
  })

  it('offers an invitation when neither now nor next has a chapter', () => {
    const model = buildHomeJourneyModel({
      roadmap: roadmap({ later: [entry('someday', 'later')] }),
      items: [item('someday', 'paused')],
      loading: false,
    })

    expect(model.status).toBe('ready')
    expect(model.hero).toEqual({ kind: 'invitation' })
    expect(model.later.entries.map(({ item: laneItem }) => laneItem.id)).toEqual(['someday'])
  })

  it('uses the first now entry as protagonist and keeps the remaining now entries as additional work', () => {
    const model = buildHomeJourneyModel({
      roadmap: roadmap({
        now: [entry('current', 'now'), entry('also-now-a', 'now'), entry('also-now-b', 'now')],
        next: [entry('queued', 'next')],
      }),
      items: [],
      loading: false,
    })

    expect(model.hero).toMatchObject({ kind: 'current', entry: { item: { id: 'current' } } })
    expect(model.additionalNow.map(({ item: laneItem }) => laneItem.id)).toEqual(['also-now-a', 'also-now-b'])
    expect(model.next.entries.map(({ item: laneItem }) => laneItem.id)).toEqual(['queued'])
  })

  it('promotes the first next entry without duplicating it in the next lane', () => {
    const sourceRoadmap = roadmap({
      next: [entry('promoted', 'next'), entry('following-a', 'next'), entry('following-b', 'next')],
    })
    const model = buildHomeJourneyModel({ roadmap: sourceRoadmap, items: [], loading: false })

    expect(model.hero).toMatchObject({ kind: 'next-chapter', entry: { item: { id: 'promoted' } } })
    expect(model.next.entries.map(({ item: laneItem }) => laneItem.id)).toEqual(['following-a', 'following-b'])
    expect(model.next.entries.some(({ item: laneItem }) => laneItem.id === 'promoted')).toBe(false)
    expect(sourceRoadmap.next.map(({ item: laneItem }) => laneItem.id)).toEqual(['promoted', 'following-a', 'following-b'])
  })

  it('applies desktop limits and exposes complete lanes only when expanded', () => {
    const sourceRoadmap = roadmap({
      now: [entry('current', 'now')],
      next: Array.from({ length: 6 }, (_, index) => entry(`next-${index + 1}`, 'next')),
      later: Array.from({ length: 7 }, (_, index) => entry(`later-${index + 1}`, 'later')),
    })
    const collapsed = buildHomeJourneyModel({ roadmap: sourceRoadmap, items: [], loading: false })
    const expanded = buildHomeJourneyModel({
      roadmap: sourceRoadmap,
      items: [],
      loading: false,
      expanded: { next: true, later: true },
    })

    expect(collapsed.next).toMatchObject({
      total: 6,
      visibleLimit: HOME_JOURNEY_VISIBLE_LIMITS.desktop.next,
      hiddenCount: 2,
      canExpand: true,
      expanded: false,
    })
    expect(collapsed.next.visibleEntries).toHaveLength(4)
    expect(collapsed.later.visibleEntries).toHaveLength(5)
    expect(collapsed.later.hiddenCount).toBe(2)
    expect(expanded.next.visibleEntries).toHaveLength(6)
    expect(expanded.next.hiddenCount).toBe(0)
    expect(expanded.next.expanded).toBe(true)
    expect(expanded.later.visibleEntries).toHaveLength(7)
  })

  it('uses three visible entries per expandable lane in compact mode', () => {
    const model = buildHomeJourneyModel({
      roadmap: roadmap({
        now: [entry('current', 'now')],
        next: Array.from({ length: 5 }, (_, index) => entry(`next-${index + 1}`, 'next')),
        later: Array.from({ length: 5 }, (_, index) => entry(`later-${index + 1}`, 'later')),
      }),
      items: [],
      loading: false,
      viewport: 'compact',
    })

    expect(model.next.visibleLimit).toBe(HOME_JOURNEY_VISIBLE_LIMITS.compact.next)
    expect(model.next.visibleEntries).toHaveLength(3)
    expect(model.later.visibleLimit).toBe(HOME_JOURNEY_VISIBLE_LIMITS.compact.later)
    expect(model.later.visibleEntries).toHaveLength(3)
  })

  it('returns the three most recently updated completed items', () => {
    const items = [
      item('older', 'completed', '2026-01-01T00:00:00.000Z'),
      item('active', 'in_progress', '2026-12-01T00:00:00.000Z'),
      item('newest', 'completed', '2026-05-01T00:00:00.000Z'),
      item('third', 'completed', '2026-03-01T00:00:00.000Z'),
      item('second', 'completed', '2026-04-01T00:00:00.000Z'),
    ]
    const originalOrder = items.map(({ id }) => id)
    const model = buildHomeJourneyModel({ roadmap: roadmap(), items, loading: false })

    expect(model.recentCompleted.map(({ id }) => id)).toEqual(['newest', 'second', 'third'])
    expect(items.map(({ id }) => id)).toEqual(originalOrder)
  })

  it('preserves long titles verbatim without mutating source entries', () => {
    const longTitle = 'T'.repeat(200)
    const protagonist = entry('long-current', 'now', longTitle)
    const sourceRoadmap = roadmap({ now: [protagonist] })
    const snapshot = structuredClone(sourceRoadmap)
    const model = buildHomeJourneyModel({ roadmap: sourceRoadmap, items: [protagonist.item], loading: false })

    expect(model.hero).toMatchObject({ kind: 'current', entry: { item: { title: longTitle } } })
    expect(sourceRoadmap).toEqual(snapshot)
  })
})
