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
})
