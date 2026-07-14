import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchCatalogSources } from './catalogSearchClient'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  })
}

describe('catalogSearchClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses exactly the public catalog and catalog gateway for a text search', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://public.example/catalog')
    vi.stubEnv('VITE_CATALOG_API_URL', 'https://gateway.example')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'public.example') {
        return jsonResponse({ items: [{ id: 'book-dune', title: 'Dune', type: 'book', genres: ['Sci-Fi'] }] })
      }
      return jsonResponse({
        results: [{ id: 'tmdb-dune', title: 'Dune', type: 'movie', source: 'tmdb', sourceId: '438631', genres: ['Sci-Fi'] }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchCatalogSources({ query: ' Dune ', type: 'any', limit: 24 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/v1/catalog/search',
    ])
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).searchParams.get('q'))).toEqual(['Dune', 'Dune'])
    expect(result.sources).toEqual(['publicCatalog', 'catalogApi'])
    expect(result.partial).toBe(false)
    expect(result.candidates).toHaveLength(2)
  })

  it('returns partial results without adding hidden fallback requests', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://public.example/catalog')
    vi.stubEnv('VITE_CATALOG_API_URL', 'https://gateway.example')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'public.example'
        ? jsonResponse({ items: [{ id: 'book-dune', title: 'Dune', type: 'book', genres: [] }] })
        : jsonResponse({ error: 'unavailable' }, 503)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchCatalogSources({ query: 'Dune', type: 'book' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.sources).toEqual(['publicCatalog'])
    expect(result.partial).toBe(true)
    expect(result.candidates.map((candidate) => candidate.title)).toEqual(['Dune'])
  })

  it('preserves the gateway partial flag when one external provider fails', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://public.example/catalog')
    vi.stubEnv('VITE_CATALOG_API_URL', 'https://gateway.example')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'public.example'
        ? jsonResponse({ items: [{ id: 'book-dune', title: 'Dune', type: 'book', genres: [] }] })
        : jsonResponse({ results: [] }, 200, { 'x-nexo-partial': 'true' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchCatalogSources({ query: 'Dune', type: 'any' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.sources).toEqual(['publicCatalog', 'catalogApi'])
    expect(result.partial).toBe(true)
  })

  it('uses only the public catalog when there is no text query', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://public.example/catalog')
    vi.stubEnv('VITE_CATALOG_API_URL', 'https://gateway.example')
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchCatalogSources({ query: '', type: 'any' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ candidates: [], partial: false, sources: ['publicCatalog'] })
  })

  it('clamps query and limit before either network request', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://public.example/catalog')
    vi.stubEnv('VITE_CATALOG_API_URL', 'https://gateway.example')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'public.example' ? jsonResponse({ items: [] }) : jsonResponse({ results: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    await searchCatalogSources({ query: `  ${'x'.repeat(140)}  `, type: 'any', limit: 400 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [input] of fetchMock.mock.calls) {
      const url = new URL(String(input))
      expect(url.searchParams.get('q')).toHaveLength(120)
      expect(url.searchParams.get('limit')).toBe('48')
    }
  })

  it('fails recoverably when both bounded sources fail', async () => {
    vi.stubEnv('VITE_PUBLIC_CATALOG_URL', 'https://public.example/catalog')
    vi.stubEnv('VITE_CATALOG_API_URL', 'https://gateway.example')
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'unavailable' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchCatalogSources({ query: 'Dune', type: 'any' })).rejects.toThrow(
      'No se pudo consultar el catalogo. Prueba de nuevo.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
