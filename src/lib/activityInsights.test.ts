import { describe, expect, it } from 'vitest'
import type { ActivityEntry } from '../domain/types'
import { getActivityContinuitySummary, getActivityDestinationTab } from './activityInsights'

function activity(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    createdAt: '2026-06-03T12:00:00.000Z',
    detail: 'Detail',
    id: 'activity',
    label: 'Activity',
    tab: 'settings',
    tone: 'success',
    ...overrides,
  }
}

describe('activity insights', () => {
  it('prefers resumable item activity and groups entries by destination', () => {
    const itemEntry = activity({
      createdAt: '2026-06-03T11:58:00.000Z',
      id: 'item',
      label: 'Ficha guardada',
      tab: 'dice',
      target: { kind: 'item', id: 'movie-arrival' },
    })
    const summary = getActivityContinuitySummary([
      activity({ createdAt: '2026-06-03T12:00:00.000Z', id: 'settings', label: 'Ajustes guardados' }),
      itemEntry,
      activity({ createdAt: '2026-06-03T11:55:00.000Z', id: 'library', label: 'Backup exportado', tab: 'library' }),
    ])

    expect(summary?.primaryEntry).toBe(itemEntry)
    expect(summary?.resumableCount).toBe(1)
    expect(summary?.totalCount).toBe(3)
    expect(summary?.groups.map((group) => [group.tab, group.count, group.entry.id])).toEqual([
      ['settings', 1, 'settings'],
      ['library', 2, 'item'],
    ])
  })

  it('maps legacy discovery activity and keeps current destinations', () => {
    expect(getActivityDestinationTab(activity({ tab: 'explorer' }))).toBe('discover')
    expect(getActivityDestinationTab(activity({ tab: 'catalog' }))).toBe('discover')
    expect(getActivityDestinationTab(activity({ tab: 'dice', target: { kind: 'item', id: 'item-1' } }))).toBe(
      'library',
    )
    expect(getActivityContinuitySummary([])).toBeUndefined()
  })
})
