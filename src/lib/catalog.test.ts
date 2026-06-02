import { describe, expect, it } from 'vitest'
import {
  buildPublicCatalogItem,
  discoveryToListItem,
  publicItemToDiscovery,
  shouldPreserveDiscoveryDecision,
} from './catalog'

describe('catalog helpers', () => {
  it('builds searchable public catalog entries', () => {
    const item = buildPublicCatalogItem(
      {
        title: 'Odisea',
        type: 'book',
        genres: ['Clasico', 'Mitologia'],
        tags: ['Grecia'],
      },
      'moderator-1',
    )

    expect(item.id).toBe('book-odisea')
    expect(item.canonicalKey).toBe('book:odisea')
    expect(item.searchTokens).toEqual(expect.arrayContaining(['odisea', 'book', 'clasico']))
    expect(item.createdBy).toBe('moderator-1')
  })

  it('copies a public item into a private library item with a snapshot reference', () => {
    const publicItem = buildPublicCatalogItem(
      {
        id: 'book-odisea',
        title: 'Odisea',
        type: 'book',
        description: 'Viaje y regreso.',
        genres: ['clasico'],
        tags: ['epico'],
      },
      'moderator-1',
    )

    const candidate = publicItemToDiscovery(publicItem)
    const libraryItem = discoveryToListItem(candidate)

    expect(candidate.source).toBe('nexo')
    expect(libraryItem.source).toBe('public')
    expect(libraryItem.publicItemId).toBe('book-odisea')
    expect(libraryItem.publicSnapshot?.title).toBe('Odisea')
    expect(libraryItem.status).toBe('wishlist')
  })

  it('keeps resolved discovery decisions when the same result is queued again', () => {
    expect(
      shouldPreserveDiscoveryDecision(
        {
          id: 'public-book-odisea',
          title: 'Odisea',
          type: 'book',
          status: 'saved',
          origin: 'publicCatalog',
          source: 'nexo',
          sourceId: 'book-odisea',
          genres: [],
          tags: [],
          moodTags: [],
          externalRefs: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        { status: 'queued' },
      ),
    ).toBe(true)
  })
})
