import { describe, expect, it } from 'vitest'
import {
  buildPublicCatalogItem,
  discoveryToListItem,
  externalCandidateToDiscovery,
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
        searchAliases: ['The Odyssey', 'Odyssey'],
      },
      'moderator-1',
    )

    expect(item.id).toBe('book-odisea')
    expect(item.canonicalKey).toBe('book:odisea')
    expect(item.searchAliases).toEqual(['The Odyssey', 'Odyssey'])
    expect(item.searchTokens).toEqual(expect.arrayContaining(['odisea', 'book', 'clasico', 'odyssey']))
    expect(item.createdBy).toBe('moderator-1')
  })

  it('copies a public item into a private library item with a snapshot reference', () => {
    const publicItem = buildPublicCatalogItem(
      ({
        id: 'book-odisea',
        title: 'Odisea',
        type: 'book',
        description: 'Viaje y regreso.',
        progressTotal: 320,
        progressUnit: 'pages',
        genres: ['clasico'],
        tags: ['epico'],
        relatedItems: [
          {
            title: 'Odisea adaptada',
            type: 'movie',
            relation: 'adaptation',
            source: 'nexo',
          },
        ],
      } as unknown) as Parameters<typeof buildPublicCatalogItem>[0],
      'moderator-1',
    )

    const candidate = publicItemToDiscovery(publicItem)
    const libraryItem = discoveryToListItem(candidate)

    expect(candidate.source).toBe('nexo')
    expect(libraryItem.source).toBe('public')
    expect(libraryItem.publicItemId).toBe('book-odisea')
    expect(libraryItem.publicSnapshot?.title).toBe('Odisea')
    expect(libraryItem.publicSnapshot?.searchAliases).toEqual([])
    expect(libraryItem.notes).toBeUndefined()
    expect(libraryItem.progressCurrent).toBe(0)
    expect(libraryItem.progressTotal).toBe(320)
    expect(libraryItem.progressUnit).toBe('pages')
    expect('relatedItems' in libraryItem).toBe(false)
    expect('relatedItems' in (libraryItem.publicSnapshot ?? {})).toBe(false)
    expect(libraryItem.status).toBe('wishlist')
  })

  it('copies external series progress totals without carrying legacy related references', () => {
    const candidate = externalCandidateToDiscovery({
      id: 'tmdb-tv-127532',
      title: 'Solo Leveling',
      type: 'series',
      source: 'tmdb',
      sourceId: '127532',
      progressTotal: 25,
      progressUnit: 'episodes',
      genres: ['Animacion', 'Accion y aventura'],
      externalRefs: {
        tmdbId: '127532',
        sourceUrl: 'https://www.themoviedb.org/tv/127532',
      },
      relatedItems: [
        {
          title: 'Solo Leveling Season 2',
          type: 'series',
          relation: 'sequel',
          source: 'tmdb',
          sourceId: '127532-season-2',
          posterUrl: 'https://image.tmdb.org/t/p/w342/season-2.jpg',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Parameters<typeof externalCandidateToDiscovery>[0])

    const libraryItem = discoveryToListItem(candidate)

    expect(libraryItem.source).toBe('external')
    expect(libraryItem.progressCurrent).toBe(0)
    expect(libraryItem.progressTotal).toBe(25)
    expect(libraryItem.progressUnit).toBe('episodes')
    expect('relatedItems' in candidate).toBe(false)
    expect('relatedItems' in libraryItem).toBe(false)
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
