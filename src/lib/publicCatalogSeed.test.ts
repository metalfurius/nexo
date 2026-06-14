import { describe, expect, it } from 'vitest'
import {
  createPublicCatalogSeedTemplate,
  getPublicCatalogSeedRollbackPlan,
  getPublicCatalogSeedSummary,
  parsePublicCatalogSeed,
} from './publicCatalogSeed'

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
            progressTotal: 20,
            progressUnit: 'hours',
            genres: ['Exploracion', 'Misterio'],
            tags: ['indie'],
            searchAliases: ['Outer Wilds Ventures'],
            externalRefs: { wikidataId: 'Q65058922' },
            relatedItems: [
              {
                title: 'Outer Wilds: Echoes of the Eye',
                type: 'game',
                relation: 'sequel',
                source: 'rawg',
                sourceId: 'outer-wilds-echoes-of-the-eye',
              },
            ],
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
    expect(result.items[0].searchAliases).toEqual(['Outer Wilds Ventures'])
    expect(result.items[0].searchTokens).toEqual(expect.arrayContaining(['outer', 'wilds', 'ventures', 'game', '2019']))
    expect(result.items[0].externalRefs.wikidataId).toBe('Q65058922')
    expect(result.items[0].progressTotal).toBe(20)
    expect(result.items[0].progressUnit).toBe('hours')
    expect(result.items[0].relatedItems?.[0]).toEqual(expect.objectContaining({ relation: 'sequel' }))
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

  it('builds a rollback plan for new and updated public catalog entries', () => {
    const currentArrival = parsePublicCatalogSeed(
      {
        items: [
          {
            title: 'Arrival',
            type: 'movie',
            description: 'Descripcion anterior.',
            genres: ['Drama'],
            tags: ['linguistica'],
            externalRefs: { wikidataId: 'Q203827' },
          },
        ],
      },
      'admin-1',
    ).items[0]
    const result = parsePublicCatalogSeed(
      {
        items: [
          { title: 'Arrival', type: 'movie', description: 'Descripcion importada.' },
          { title: 'Moon', type: 'movie' },
        ],
      },
      'admin-1',
    )

    const plan = getPublicCatalogSeedRollbackPlan(result, [currentArrival])

    expect(plan.newItemIds).toEqual(['movie-moon'])
    expect(plan.previousItems).toEqual([currentArrival])
    expect(plan.previousItems[0]).not.toBe(currentArrival)
    expect(plan.previousItems[0].genres).not.toBe(currentArrival.genres)
    expect(plan.previousItems[0].externalRefs).not.toBe(currentArrival.externalRefs)
  })
})
