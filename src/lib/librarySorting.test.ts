import { describe, expect, it } from 'vitest'
import type { ListItem } from '../domain/types'
import { sortLibraryItems } from './librarySorting'

const baseItem: ListItem = {
  id: 'base',
  title: 'Base',
  type: 'book',
  status: 'wishlist',
  genres: [],
  tags: [],
  moodTags: [],
  weights: { priority: 1, challenge: 0, surprise: 0 },
  source: 'manual',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

type ItemOverrides = Omit<Partial<ListItem>, 'weights'> & { weights?: Partial<ListItem['weights']> }

function item(overrides: ItemOverrides): ListItem {
  return { ...baseItem, ...overrides, weights: { ...baseItem.weights, ...overrides.weights } }
}

describe('sortLibraryItems', () => {
  it('orders focus by active status before passive items', () => {
    const sorted = sortLibraryItems(
      [
        item({ id: 'done', title: 'Done', status: 'completed' }),
        item({ id: 'paused', title: 'Paused', status: 'paused' }),
        item({ id: 'active', title: 'Active', status: 'in_progress' }),
        item({ id: 'wish', title: 'Wish', status: 'wishlist' }),
      ],
      'focus',
    )

    expect(sorted.map((entry) => entry.id)).toEqual(['active', 'wish', 'paused', 'done'])
  })

  it('uses weighted priority inside the same focus band', () => {
    const sorted = sortLibraryItems(
      [
        item({ id: 'low', title: 'Low', weights: { priority: 1 } }),
        item({ id: 'challenge', title: 'Challenge', weights: { priority: 1, challenge: 1 } }),
        item({ id: 'high', title: 'High', weights: { priority: 1.5 } }),
      ],
      'priority',
    )

    expect(sorted.map((entry) => entry.id)).toEqual(['high', 'challenge', 'low'])
  })

  it('keeps missing ratings below rated items', () => {
    const sorted = sortLibraryItems(
      [
        item({ id: 'missing', title: 'Missing', rating: undefined }),
        item({ id: 'good', title: 'Good', rating: 8.5 }),
        item({ id: 'best', title: 'Best', rating: 9.1 }),
      ],
      'rating',
    )

    expect(sorted.map((entry) => entry.id)).toEqual(['best', 'good', 'missing'])
  })

  it('sorts titles with numeric collation', () => {
    const sorted = sortLibraryItems(
      [
        item({ id: 'ten', title: 'Saga 10' }),
        item({ id: 'two', title: 'Saga 2' }),
        item({ id: 'one', title: 'Saga 1' }),
      ],
      'title',
    )

    expect(sorted.map((entry) => entry.id)).toEqual(['one', 'two', 'ten'])
  })
})
