import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPublicCatalog, normalizePublicCatalogItems } from './publicCatalog'

type FetchInput = Parameters<typeof fetch>[0]

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function installFetchMock(handler: (url: URL, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (input: FetchInput, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return jsonResponse(handler(url, init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('public catalog service', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not fetch when the public catalog endpoint is not configured', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPublicCatalog()).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests the configured catalog endpoint with trimmed query, type, limit and JSON accept header', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://catalog.example/publicCatalog')
    const fetchMock = installFetchMock(() => ({
      items: [
        {
          id: 'book-dune',
          title: 'Dune',
          type: 'book',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    }))

    const results = await fetchPublicCatalog('  Dune  ', 'book', 12)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]
    const url = new URL(input instanceof Request ? input.url : String(input))
    expect(url.origin + url.pathname).toBe('https://catalog.example/publicCatalog')
    expect(url.searchParams.get('q')).toBe('Dune')
    expect(url.searchParams.get('type')).toBe('book')
    expect(url.searchParams.get('limit')).toBe('12')
    expect(init?.headers).toEqual({ accept: 'application/json' })
    expect(results).toEqual([
      expect.objectContaining({
        id: 'book-dune',
        title: 'Dune',
        type: 'book',
      }),
    ])
  })

  it('returns undefined when the endpoint fails or the payload shape is invalid', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://catalog.example/publicCatalog')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }, 500))
      .mockResolvedValueOnce(jsonResponse({ items: {} }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPublicCatalog('Dune')).resolves.toBeUndefined()
    await expect(fetchPublicCatalog('Dune')).resolves.toBeUndefined()
  })

  it('drops invalid catalog entries before returning normalized items', () => {
    const results = normalizePublicCatalogItems([
      undefined,
      [],
      'Dune',
      { id: 'missing-title', type: 'book' },
      { id: 'missing-type', title: 'Dune' },
      { id: 'blank-title', title: '   ', type: 'book' },
      { id: '   ', title: 'Blank id', type: 'book' },
      { id: 'bad-type', title: 'Dune', type: 'boardgame' },
      {
        id: 'movie-dune-2021',
        title: 'Dune',
        type: 'movie',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ])

    expect(results).toEqual([
      expect.objectContaining({
        id: 'movie-dune-2021',
        title: 'Dune',
        type: 'movie',
      }),
    ])
  })

  it('normalizes complete catalog entries while preserving remote timestamps', () => {
    const results = normalizePublicCatalogItems([
      {
        id: ' anime-frieren ',
        title: ' Frieren ',
        type: 'anime',
        description: '  Fantasy journey  ',
        releaseYear: 2023,
        progressTotal: 28,
        progressUnit: 'episodes',
        genres: ['Fantasy', ' fantasy ', 42, null, ''],
        tags: ['cozy', undefined, 'adventure', ' Adventure ', { bad: true }],
        moodTags: [' calm ', false],
        searchAliases: ['Sousou no Frieren', 'sousou no frieren', undefined],
        externalRefs: { anilistId: ' 154587 ', empty: '  ', missing: undefined },
        posterUrl: '  https://example.test/frieren.jpg  ',
        searchTokens: ['frieren', 2023, ''],
        canonicalKey: ' anime:frieren ',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z',
        createdBy: ' moderator-1 ',
        updatedBy: ' moderator-2 ',
        archivedAt: ' 2026-03-01T00:00:00.000Z ',
        autoIngestedAt: ' 2026-02-03T00:00:00.000Z ',
        demandCount: 7,
        lastDemandAt: ' 2026-02-04T00:00:00.000Z ',
      },
    ])

    expect(results).toEqual([
      {
        id: 'anime-frieren',
        title: 'Frieren',
        type: 'anime',
        description: 'Fantasy journey',
        releaseYear: 2023,
        progressTotal: 28,
        progressUnit: 'episodes',
        genres: ['Fantasy', '42'],
        tags: ['cozy', 'adventure'],
        moodTags: ['calm'],
        searchAliases: ['Sousou no Frieren'],
        externalRefs: { anilistId: '154587' },
        posterUrl: 'https://example.test/frieren.jpg',
        searchTokens: ['frieren', '2023'],
        canonicalKey: 'anime:frieren',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z',
        createdBy: 'moderator-1',
        updatedBy: 'moderator-2',
        archivedAt: '2026-03-01T00:00:00.000Z',
        autoIngestedAt: '2026-02-03T00:00:00.000Z',
        demandCount: 7,
        lastDemandAt: '2026-02-04T00:00:00.000Z',
      },
    ])
  })

  it('normalizes unsafe catalog limits before requesting the endpoint', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://catalog.example/publicCatalog')
    const fetchMock = installFetchMock(() => ({ items: [] }))

    await fetchPublicCatalog('', 'any', Number.NaN)
    await fetchPublicCatalog('', 'any', -4)
    await fetchPublicCatalog('', 'any', 250)

    const requestedLimits = fetchMock.mock.calls.map(([input]) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      return url.searchParams.get('limit')
    })

    expect(requestedLimits).toEqual(['24', '1', '100'])
  })

  it('drops invalid numeric catalog metadata', () => {
    const results = normalizePublicCatalogItems([
      {
        id: 'book-invalid-numbers',
        title: 'Invalid Numbers',
        type: 'book',
        releaseYear: Number.POSITIVE_INFINITY,
        progressTotal: 0,
        demandCount: -1,
      },
      {
        id: 'game-zero-demand',
        title: 'Zero Demand',
        type: 'game',
        releaseYear: 2026,
        progressTotal: 12,
        demandCount: 0,
      },
    ])

    expect(results[0]).toEqual(expect.objectContaining({ id: 'book-invalid-numbers' }))
    expect(results[0].demandCount).toBeUndefined()
    expect(results[0].progressTotal).toBeUndefined()
    expect(results[0].releaseYear).toBeUndefined()
    expect(results[1]).toEqual(
      expect.objectContaining({
        demandCount: 0,
        progressTotal: 12,
        releaseYear: 2026,
      }),
    )
  })

  it('drops malformed public catalog external refs', () => {
    const results = normalizePublicCatalogItems([
      {
        id: 'anime-frieren',
        title: 'Frieren',
        type: 'anime',
        externalRefs: {
          anilistId: ' 154587 ',
          empty: '   ',
          numeric: 2023,
          enabled: true,
          nested: { value: 'bad' },
        },
      },
    ])

    expect(results[0].externalRefs).toEqual({ anilistId: '154587' })
  })

  it('normalizes fallback canonical keys for remote catalog entries', () => {
    const results = normalizePublicCatalogItems([
      {
        id: 'book-epic-scifi',
        title: '  Ciencia-ficcion: Epica!  ',
        type: 'book',
      },
    ])

    expect(results[0]).toEqual(
      expect.objectContaining({
        canonicalKey: 'book:ciencia ficcion epica',
      }),
    )
  })

  it('applies defaults and uses the same fallback timestamp for missing createdAt and updatedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T12:34:56.000Z'))

    const results = normalizePublicCatalogItems([
      {
        id: 'game-outer-wilds',
        title: '  Outer Wilds  ',
        type: 'game',
      },
    ])

    expect(results).toEqual([
      expect.objectContaining({
        canonicalKey: 'game:outer wilds',
        createdAt: '2026-07-05T12:34:56.000Z',
        createdBy: 'public-catalog',
        externalRefs: {},
        genres: [],
        moodTags: [],
        searchTokens: [],
        tags: [],
        updatedAt: '2026-07-05T12:34:56.000Z',
        updatedBy: 'public-catalog',
      }),
    ])
  })

  it('fills only the missing timestamp when one remote timestamp is present', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T12:34:56.000Z'))

    const results = normalizePublicCatalogItems([
      {
        id: 'book-solaris',
        title: 'Solaris',
        type: 'book',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    expect(results[0]).toEqual(
      expect.objectContaining({
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-07-05T12:34:56.000Z',
      }),
    )
  })
})
