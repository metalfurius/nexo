import { describe, expect, it } from 'vitest'
import {
  CatalogInputError,
  createCatalogQueryPlan,
  createCatalogSearchMetric,
  parseCatalogDemandItems,
  parseCatalogSearchInput,
} from '../src/catalogValidation.js'

describe('catalog search input', () => {
  it('normalizes a valid public request', () => {
    expect(
      parseCatalogSearchInput(
        { q: '  Dune  ', type: 'book', limit: '12' },
        { defaultLimit: 24 },
      ),
    ).toEqual({ query: 'Dune', type: 'book', limit: 12 })
  })

  it.each([
    [{ q: 'x'.repeat(121) }, '120 caracteres'],
    [{ q: { private: 'Dune' } }, 'debe ser texto'],
    [{ q: 'Dune', type: 'unknown' }, 'tipo de busqueda'],
    [{ q: 'Dune', type: 42 }, 'tipo de busqueda'],
    [{ q: 'Dune', limit: 49 }, 'entre 1 y 48'],
    [{ q: 'Dune', limit: 1.5 }, 'entre 1 y 48'],
  ])('rejects invalid input %#', (input, expectedMessage) => {
    let thrown: unknown
    try {
      parseCatalogSearchInput(input, { defaultLimit: 24 })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(CatalogInputError)
    expect((thrown as Error).message).toContain(expectedMessage)
  })

  it('requires a non-empty query when a minimum length is configured', () => {
    expect(() => parseCatalogSearchInput({ q: '' }, { defaultLimit: 8, minQueryLength: 2 })).toThrow(
      'al menos 2 caracteres',
    )
  })

  it('keeps the Firestore search plan to two bounded query operands', () => {
    const plan = createCatalogQueryPlan(
      'dune',
      Array.from({ length: 20 }, (_, index) => `token-${index}`),
      ['book', 'movie', 'series'],
    )

    expect(plan.tokens).toHaveLength(10)
    expect(plan.canonicalKeys).toEqual(['book:dune', 'movie:dune', 'series:dune'])
  })

  it('records only aggregate search metrics without query text', () => {
    const metric = createCatalogSearchMetric('book', 3, new Date('2026-07-12T09:30:00.000Z'))

    expect(metric).toEqual({
      id: '2026-07-12-book',
      data: {
        date: '2026-07-12',
        type: 'book',
        count: 1,
        resultCount: 3,
        zeroResultCount: 0,
        updatedAt: '2026-07-12T09:30:00.000Z',
      },
    })
    expect(JSON.stringify(metric)).not.toContain('Dune')
  })

  it.each(['movie', 'series', 'comic', 'other'])('accepts existing catalog type %s', (type) => {
    expect(parseCatalogSearchInput({ q: 'Dune', type }, { defaultLimit: 24 }).type).toBe(type)
  })

  it('sanitizes and deduplicates catalog demand items', () => {
    const items = parseCatalogDemandItems([
      {
        id: 'book-dune',
        title: ' Dune ',
        type: 'book',
        overview: ' Desert politics ',
        releaseYear: 1965,
        progressTotal: 412,
        progressUnit: 'pages',
        genres: ['Science fiction', 'Science fiction'],
        externalRefs: { openLibraryKey: '/works/OL893415W' },
      },
      { id: 'book-dune', title: 'Ignored duplicate', type: 'book' },
    ])

    expect(items).toEqual([
      expect.objectContaining({
        id: 'book-dune',
        title: 'Dune',
        type: 'book',
        description: 'Desert politics',
        genres: ['Science fiction'],
        progressUnit: 'pages',
      }),
    ])
  })

  it.each([
    [[], 'entre 1 y 100'],
    [[{ id: 'bad/id', title: 'Dune', type: 'book' }], 'no puede contener barras'],
    [[{ id: 'book-dune', title: 'x'.repeat(201), type: 'book' }], 'supera 200'],
    [[{ id: 'book-dune', title: 'Dune', type: 'unknown' }], 'type no es valido'],
    [[{ id: 'book-dune', title: 'Dune', type: 'book', tags: Array(65).fill('tag') }], 'hasta 64'],
    [[{ id: 'book-dune', title: 'Dune', type: 'book', externalRefs: { privateToken: 'secret' } }], 'claves no permitidas'],
    [[{ id: 'book-dune', title: 'Dune', type: 'book', releaseYear: Number.NaN }], 'numero finito'],
  ])('rejects unsafe catalog demand payload %#', (payload, message) => {
    expect(() => parseCatalogDemandItems(payload)).toThrow(message)
  })
})
