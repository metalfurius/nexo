import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROADMAP_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  type ItemStatus,
  type ListItem,
  type RoadmapPreferences,
} from '../domain/types'
import {
  applyRoadmapMutationToLibrary,
  cleanupRoadmapPreferences,
  createRoadmapDeleteMutation,
  createRoadmapRestoreMutation,
  createRoadmapUndoMutation,
  deriveRoadmap,
  hideRoadmapItem,
  moveRoadmapItem,
  normalizeRoadmapPreferences,
  prepareRoadmapBatchMutation,
  reorderRoadmapItem,
  resetRoadmapItemToAutomatic,
  transitionRoadmapItem,
} from './roadmap'

const roadmap: RoadmapPreferences = {
  now: ['now-1'],
  next: ['next-1', 'next-2'],
  later: ['later-1'],
  hidden: ['hidden-1'],
}

function item(id: string, status: ItemStatus = 'wishlist', priority = 1): ListItem {
  return {
    id,
    title: id,
    type: 'book',
    status,
    genres: [],
    tags: [],
    moodTags: [],
    weights: { ...DEFAULT_WEIGHTS, priority },
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('roadmap preferences', () => {
  it('normalizes malformed input and gives hidden/now/next/later deterministic precedence', () => {
    expect(
      normalizeRoadmapPreferences({
        hidden: [' same ', '', 4, 'hidden'],
        now: ['same', 'now', 'now'],
        next: ['now', 'next'],
        later: ['next', 'later'],
      }),
    ).toEqual({
      hidden: ['same', 'hidden'],
      now: ['now'],
      next: ['next'],
      later: ['later'],
    })
    expect(normalizeRoadmapPreferences(undefined)).toEqual(DEFAULT_ROADMAP_PREFERENCES)
    expect(normalizeRoadmapPreferences(undefined)).not.toBe(DEFAULT_ROADMAP_PREFERENCES)
  })

  it('drops IDs outside an optional valid-item set', () => {
    expect(normalizeRoadmapPreferences(roadmap, ['next-2', 'later-1'])).toEqual({
      hidden: [],
      now: [],
      next: ['next-2'],
      later: ['later-1'],
    })
  })

  it('cleans deleted and terminal items from every preference array', () => {
    expect(
      cleanupRoadmapPreferences(roadmap, [
        item('now-1', 'completed'),
        item('next-1'),
        item('later-1', 'dropped'),
        item('hidden-1', 'paused'),
      ]),
    ).toEqual({
      hidden: ['hidden-1'],
      now: [],
      next: ['next-1'],
      later: [],
    })
  })
})

describe('deriveRoadmap', () => {
  it('preserves manual ordering and labels each placement', () => {
    const view = deriveRoadmap(
      [item('next-1'), item('next-2'), item('later-1', 'paused'), item('now-1')],
      roadmap,
    )

    expect(view.now.map((entry) => [entry.item.id, entry.placement])).toEqual([['now-1', 'manual']])
    expect(view.next.map((entry) => [entry.item.id, entry.placement])).toEqual([
      ['next-1', 'manual'],
      ['next-2', 'manual'],
    ])
    expect(view.later.map((entry) => [entry.item.id, entry.placement])).toEqual([['later-1', 'manual']])
    expect(view.now[0].lane).toBe('now')
  })

  it('automatically sends the three highest-focus wishlist items next and the rest later', () => {
    const view = deriveRoadmap(
      [item('tie-first', 'wishlist', 3), item('low', 'wishlist', 1), item('top', 'wishlist', 8), item('tie-second', 'wishlist', 3)],
      DEFAULT_ROADMAP_PREFERENCES,
    )

    expect(view.next.map((entry) => entry.item.id)).toEqual(['top', 'tie-first', 'tie-second'])
    expect(view.later.map((entry) => entry.item.id)).toEqual(['low'])
    expect([...view.next, ...view.later].every((entry) => entry.placement === 'automatic')).toBe(true)
  })

  it('places active work now and paused work later', () => {
    const view = deriveRoadmap(
      [item('active-a', 'in_progress'), item('paused-a', 'paused'), item('active-b', 'in_progress')],
      DEFAULT_ROADMAP_PREFERENCES,
    )

    expect(view.now.map((entry) => entry.item.id)).toEqual(['active-a', 'active-b'])
    expect(view.later.map((entry) => entry.item.id)).toEqual(['paused-a'])
  })

  it('forces stale manual active placements into now while retaining their manual flag', () => {
    const view = deriveRoadmap(
      [item('active-next', 'in_progress'), item('active-later', 'in_progress')],
      { now: [], next: ['active-next'], later: ['active-later'], hidden: [] },
    )

    expect(view.now.map((entry) => [entry.item.id, entry.placement])).toEqual([
      ['active-next', 'manual'],
      ['active-later', 'manual'],
    ])
    expect(view.next).toEqual([])
    expect(view.later).toEqual([])
  })

  it('excludes hidden, completed, dropped and missing items', () => {
    const view = deriveRoadmap(
      [item('hidden-active', 'in_progress'), item('done', 'completed'), item('dropped', 'dropped'), item('visible')],
      { now: ['missing'], next: ['done'], later: ['dropped'], hidden: ['hidden-active'] },
    )

    expect(view.now).toEqual([])
    expect(view.next.map((entry) => entry.item.id)).toEqual(['visible'])
    expect(view.later).toEqual([])
  })
})

describe('roadmap mutations', () => {
  it('moves an item, removes previous/hidden placement and supports an explicit insertion index', () => {
    expect(moveRoadmapItem(roadmap, 'hidden-1', 'next', 1)).toEqual({
      hidden: [],
      now: ['now-1'],
      next: ['next-1', 'hidden-1', 'next-2'],
      later: ['later-1'],
    })
  })

  it('reorders within a lane and treats boundaries or automatic items as no-ops', () => {
    expect(reorderRoadmapItem(roadmap, 'next', 'next-2', 'up').next).toEqual(['next-2', 'next-1'])
    expect(reorderRoadmapItem(roadmap, 'next', 'next-1', 'up').next).toEqual(['next-1', 'next-2'])
    expect(reorderRoadmapItem(roadmap, 'next', 'automatic', 'down')).toEqual(roadmap)
  })

  it('hides items and restores them to automatic placement', () => {
    const hidden = hideRoadmapItem(roadmap, 'next-1')
    expect(hidden.next).toEqual(['next-2'])
    expect(hidden.hidden).toEqual(['hidden-1', 'next-1'])
    expect(resetRoadmapItemToAutomatic(hidden, 'next-1')).toEqual({
      ...hidden,
      hidden: ['hidden-1'],
    })
  })

  it.each([
    ['in_progress', 'now'],
    ['paused', 'later'],
    ['wishlist', 'next'],
  ] as const)('moves a %s transition to %s atomically', (status, lane) => {
    const mutation = transitionRoadmapItem(roadmap, 'next-1', status)

    expect(mutation.item).toEqual({ kind: 'status', itemId: 'next-1', status })
    expect(mutation.roadmap[lane]).toContain('next-1')
    expect(
      (['now', 'next', 'later', 'hidden'] as const)
        .filter((key) => key !== lane)
        .every((key) => !mutation.roadmap[key].includes('next-1')),
    ).toBe(true)
  })

  it.each(['completed', 'dropped'] as const)('cleans placement for a %s transition', (status) => {
    const mutation = transitionRoadmapItem(roadmap, 'next-1', status)
    expect(Object.values(mutation.roadmap).flat()).not.toContain('next-1')
  })

  it('creates a delete mutation that cleans placement', () => {
    expect(createRoadmapDeleteMutation(roadmap, 'later-1')).toEqual({
      roadmap: { ...roadmap, later: [] },
      item: { kind: 'delete', itemId: 'later-1' },
    })
  })

  it('captures previous status and placement for undo', () => {
    const previousItem = item('next-1', 'paused')
    const undo = createRoadmapUndoMutation(roadmap, previousItem)

    expect(undo).toEqual({
      roadmap,
      item: { kind: 'status', itemId: 'next-1', status: 'paused' },
    })
    expect(undo.roadmap).not.toBe(roadmap)
    expect(undo.roadmap.next).not.toBe(roadmap.next)
  })

  it('restores a deleted item and its exact placement in one mutation', () => {
    const previousItem = item('later-1', 'paused')
    const mutation = createRoadmapRestoreMutation(roadmap, previousItem)
    const restored = applyRoadmapMutationToLibrary(
      [],
      { ...DEFAULT_SETTINGS, roadmap: DEFAULT_ROADMAP_PREFERENCES },
      mutation,
      '2026-02-03T00:00:00.000Z',
    )

    expect(mutation.roadmap).toEqual(roadmap)
    expect(mutation.item).toEqual({ item: previousItem, kind: 'restore' })
    expect(restored.items).toEqual([
      expect.objectContaining({ id: 'later-1', status: 'paused', updatedAt: '2026-02-03T00:00:00.000Z' }),
    ])
    expect(restored.settings.roadmap.later).toEqual(['later-1'])
  })

  it('upserts a complete edited item while applying its status placement atomically', () => {
    const editedItem = {
      ...item('next-1', 'in_progress'),
      notes: 'Progreso actualizado desde el editor',
      progressCurrent: 7,
    }
    const updated = applyRoadmapMutationToLibrary(
      [item('next-1')],
      { ...DEFAULT_SETTINGS, roadmap },
      {
        roadmap: { now: ['next-1'], next: [], later: ['later-1'], hidden: ['hidden-1'] },
        item: { item: editedItem, kind: 'upsert' },
      },
      '2026-02-04T00:00:00.000Z',
    )

    expect(updated.items.find((entry) => entry.id === 'next-1')).toEqual(expect.objectContaining({
      status: 'in_progress',
      notes: 'Progreso actualizado desde el editor',
      progressCurrent: 7,
      updatedAt: '2026-02-04T00:00:00.000Z',
    }))
    expect(updated.settings.roadmap.now).toEqual(['next-1'])
    expect(updated.settings.roadmap.next).toEqual([])
  })

  it('applies status and delete mutations to local state with identical cleanup semantics', () => {
    const initialItems = [item('next-1'), item('later-1', 'paused')]
    const initialSettings = { ...DEFAULT_SETTINGS, roadmap }
    const statusState = applyRoadmapMutationToLibrary(
      initialItems,
      initialSettings,
      transitionRoadmapItem(roadmap, 'next-1', 'completed'),
      '2026-02-02T00:00:00.000Z',
    )

    expect(statusState.items[0]).toEqual(expect.objectContaining({
      status: 'completed',
      updatedAt: '2026-02-02T00:00:00.000Z',
    }))
    expect(Object.values(statusState.settings.roadmap).flat()).not.toContain('next-1')

    const deleteState = applyRoadmapMutationToLibrary(
      statusState.items,
      statusState.settings,
      createRoadmapDeleteMutation(statusState.settings.roadmap, 'later-1'),
      '2026-02-02T00:00:00.000Z',
    )
    expect(deleteState.items).toEqual([expect.objectContaining({ id: 'next-1' })])
    expect(deleteState.settings.roadmap).toEqual(DEFAULT_ROADMAP_PREFERENCES)
  })

  it('calculates a batch from each latest intermediate state and produces one final roadmap', () => {
    const initialItems = [item('first'), item('second'), item('third')]
    const prepared = prepareRoadmapBatchMutation(
      initialItems,
      { ...DEFAULT_SETTINGS, roadmap: { now: [], next: ['first', 'second', 'third'], later: [], hidden: [] } },
      [
        { kind: 'status', itemId: 'first', status: 'in_progress' },
        { kind: 'status', itemId: 'second', status: 'paused' },
        { item: { ...initialItems[2], weights: { ...initialItems[2].weights, priority: 3 } }, kind: 'upsert' },
      ],
      '2026-07-11T12:00:00.000Z',
    )

    expect(prepared.state.items).toEqual([
      expect.objectContaining({ id: 'first', status: 'in_progress' }),
      expect.objectContaining({ id: 'second', status: 'paused' }),
      expect.objectContaining({ id: 'third', weights: expect.objectContaining({ priority: 3 }) }),
    ])
    expect(prepared.mutation.roadmap).toEqual({
      now: ['first'],
      next: ['third'],
      later: ['second'],
      hidden: [],
    })
    expect(prepared.mutation.items).toHaveLength(3)
  })

  it('rejects roadmap batches above the 400-change safety boundary', () => {
    expect(() => prepareRoadmapBatchMutation(
      [],
      DEFAULT_SETTINGS,
      Array.from({ length: 401 }, (_, index) => ({
        kind: 'status' as const,
        itemId: `item-${index}`,
        status: 'wishlist' as const,
      })),
      '2026-07-11T12:00:00.000Z',
    )).toThrow('hasta 400 cambios')
  })
})
