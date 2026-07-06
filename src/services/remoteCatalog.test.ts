import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchRemoteCatalog } from './remoteCatalog'

const mocks = vi.hoisted(() => ({
  functionsClient: { name: 'functions' },
  httpsCallable: vi.fn(),
  searchCatalog: vi.fn(),
}))

vi.mock('./firebaseFunctions', () => ({
  getFirebaseFunctionsClient: vi.fn(() => mocks.functionsClient),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: mocks.httpsCallable,
}))

describe('searchRemoteCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.httpsCallable.mockReturnValue(mocks.searchCatalog)
    mocks.searchCatalog.mockResolvedValue({
      data: {
        candidates: [],
        ingestedItems: [
          {
            id: 'anime-anilist-154587',
            title: 'Frieren: Beyond Journey End',
            type: 'anime',
            progressTotal: 28,
            progressUnit: 'episodes',
          },
        ],
        items: [],
      },
    })
  })

  it('treats function ingestedItems as public catalog results', async () => {
    const results = await searchRemoteCatalog('Frieren', 'anime')

    expect(mocks.httpsCallable).toHaveBeenCalledWith(mocks.functionsClient, 'searchCatalog')
    expect(mocks.searchCatalog).toHaveBeenCalledWith({ query: 'Frieren', type: 'anime' })
    expect(results).toEqual([
      expect.objectContaining({
        origin: 'publicCatalog',
        progressTotal: 28,
        progressUnit: 'episodes',
        publicItemId: 'anime-anilist-154587',
        source: 'nexo',
        title: 'Frieren: Beyond Journey End',
      }),
    ])
  })

  it('drops empty and non-scalar metadata from remote external candidates', async () => {
    mocks.searchCatalog.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            id: 'anilist-154587',
            title: 'Frieren: Beyond Journey End',
            type: 'anime',
            source: 'anilist',
            sourceId: '154587',
            genres: [' Fantasy ', undefined, 2023, null, { bad: true }],
            searchAliases: [' Sousou no Frieren ', undefined, false],
            externalRefs: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        ingestedItems: [],
        items: [],
      },
    })

    const results = await searchRemoteCatalog('Frieren', 'anime')

    expect(results).toEqual([
      expect.objectContaining({
        genres: ['Fantasy', '2023'],
        tags: ['anime', 'anilist', 'Fantasy', '2023'],
        title: 'Frieren: Beyond Journey End',
      }),
    ])
  })

  it('drops invalid numeric metadata from remote external candidates', async () => {
    mocks.searchCatalog.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            id: 'open-library-invalid-numbers',
            title: 'Invalid Numbers',
            type: 'book',
            source: 'openLibrary',
            sourceId: 'OL123W',
            releaseYear: Number.POSITIVE_INFINITY,
            progressTotal: -320,
            progressUnit: 'pages',
            genres: [],
            externalRefs: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        ingestedItems: [],
        items: [],
      },
    })

    const results = await searchRemoteCatalog('Invalid', 'book')

    expect(results?.[0]).toEqual(expect.objectContaining({ title: 'Invalid Numbers' }))
    expect(results?.[0]?.releaseYear).toBeUndefined()
    expect(results?.[0]?.progressTotal).toBeUndefined()
  })
})
