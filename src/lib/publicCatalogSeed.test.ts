import { describe, expect, it } from 'vitest'
import { createPublicCatalogSeedTemplate, getPublicCatalogSeedSummary, parsePublicCatalogSeed } from './publicCatalogSeed'

describe('parsePublicCatalogSeed', () => {
  it('creates a valid editable seed template', () => {
    const template = createPublicCatalogSeedTemplate()
    const result = parsePublicCatalogSeed(template, 'admin-1')

    expect(template.items.length).toBeGreaterThan(0)
    expect(result.errors).toEqual([])
    expect(result.items.length).toBe(template.items.length)
  })

  it('normalizes valid seed entries into public catalog items', () => {
    const result = parsePublicCatalogSeed(
      {
        items: [
          {
            title: 'Outer Wilds',
            type: 'game',
            releaseYear: 2019,
            genres: ['Exploracion', 'Misterio'],
            tags: ['indie'],
            externalRefs: { wikidataId: 'Q65058922' },
          },
        ],
      },
      'admin-1',
    )

    expect(result.errors).toEqual([])
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'game-outer-wilds',
        title: 'Outer Wilds',
        type: 'game',
        canonicalKey: 'game:outer wilds',
        createdBy: 'admin-1',
        updatedBy: 'admin-1',
      }),
    )
    expect(result.items[0].searchTokens).toEqual(expect.arrayContaining(['outer', 'wilds', 'game', '2019']))
    expect(result.items[0].externalRefs.wikidataId).toBe('Q65058922')
  })

  it('reports duplicates and invalid entries', () => {
    const result = parsePublicCatalogSeed(
      {
        items: [
          { title: 'Arrival', type: 'movie' },
          { title: 'Arrival', type: 'movie' },
          { title: 'Nope', type: 'album' },
          { type: 'book' },
        ],
      },
      'admin-1',
    )

    expect(result.items).toHaveLength(1)
    expect(result.errors).toEqual([
      'items[1] duplicates canonical key movie:arrival.',
      'items[2].type must be one of: game, book, movie, series, anime, manga, manhwa, comic, other.',
      'items[3].title is required.',
    ])
  })

  it('summarizes prepared seed entries against the current public catalog', () => {
    const result = parsePublicCatalogSeed(
      {
        items: [
          { title: 'Arrival', type: 'movie' },
          { title: 'Moon', type: 'movie' },
        ],
      },
      'admin-1',
    )

    expect(getPublicCatalogSeedSummary(result, [{ id: 'movie-arrival' }])).toEqual({
      totalItems: 2,
      newItems: 1,
      updatedItems: 1,
    })
  })
})
