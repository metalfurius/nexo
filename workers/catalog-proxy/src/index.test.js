import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index.js'

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function delayedJsonResponse(payload, delayMs, callbacks = {}) {
  const body = new TextEncoder().encode(JSON.stringify(payload))
  let settled = false
  let timer
  const settle = (callback) => {
    if (settled) return
    settled = true
    callback?.()
    callbacks.onFinish?.()
  }

  return new Response(new ReadableStream({
    start(controller) {
      callbacks.onStart?.()
      timer = setTimeout(() => {
        controller.enqueue(body)
        controller.close()
        settle()
      }, delayMs)
    },
    cancel() {
      clearTimeout(timer)
      settle(callbacks.onCancel)
    },
  }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function emptyProviderPayload(url) {
  if (url.hostname === 'api.themoviedb.org' || url.hostname === 'api.rawg.io') return { results: [] }
  if (url.hostname === 'graphql.anilist.co') return { data: { Page: { media: [] } } }
  if (url.hostname === 'api.jikan.moe' || url.hostname === 'kitsu.io') return { data: [] }
  if (url.hostname === 'www.googleapis.com') return { items: [] }
  if (url.hostname === 'openlibrary.org') return { docs: [] }
  if (url.hostname === 'www.wikidata.org') return { search: [] }
  throw new Error(`Unexpected fetch: ${url.href}`)
}

function fetchedUrls() {
  return vi.mocked(fetch).mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
}

function executionContext() {
  const promises = []
  return {
    waitUntil: vi.fn((promise) => promises.push(promise)),
    drain: () => Promise.all(promises),
  }
}

describe('catalog proxy worker', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns TMDB series episode totals without related references', async () => {
    const cachePut = vi.fn(async () => undefined)
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: cachePut,
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input))

        if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/search/multi') {
          return jsonResponse({
            results: [
              {
                id: 127532,
                media_type: 'tv',
                name: 'Solo Leveling',
                first_air_date: '2024-01-07',
                genre_ids: [16, 10759, 10765],
                poster_path: '/solo-leveling.jpg',
              },
            ],
          })
        }

        if (url.hostname === 'api.themoviedb.org' && url.pathname === '/3/tv/127532') {
          return jsonResponse({
            id: 127532,
            name: 'Solo Leveling',
            first_air_date: '2024-01-07',
            number_of_episodes: 25,
            number_of_seasons: 2,
            overview: 'They say whatever does not kill you makes you stronger.',
            poster_path: '/solo-leveling.jpg',
            genres: [{ id: 16, name: 'Animacion' }],
            external_ids: { wikidata_id: 'Q115787130' },
            seasons: [
              {
                air_date: '2024-01-07',
                episode_count: 12,
                name: 'Temporada 1',
                season_number: 1,
              },
              {
                air_date: '2025-01-05',
                episode_count: 13,
                name: 'Solo Leveling Season 2',
                poster_path: '/solo-leveling-season-2.jpg',
                season_number: 2,
              },
            ],
          })
        }

        if (url.hostname === 'graphql.anilist.co') {
          return jsonResponse({
            data: {
              Page: {
                media: [],
              },
            },
          })
        }

        if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/anime') {
          return jsonResponse({
            data: [
              ...Array.from({ length: 4 }, (_, index) => ({
                mal_id: 9000 + index,
                title: `Distractor ${index + 1}`,
                title_english: `Distractor ${index + 1}`,
                type: 'TV',
                episodes: 12,
                year: 2024,
                images: { jpg: { image_url: `https://cdn.myanimelist.net/images/anime/distractor-${index + 1}.jpg` } },
                genres: [{ name: 'Action' }],
                url: `https://myanimelist.net/anime/${9000 + index}/Distractor_${index + 1}`,
              })),
              {
                mal_id: 52299,
                title: 'Ore dake Level Up na Ken',
                title_english: 'Solo Leveling',
                type: 'TV',
                episodes: 12,
                year: 2024,
                images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/solo-leveling.jpg' } },
                genres: [{ name: 'Action' }],
                url: 'https://myanimelist.net/anime/52299/Ore_dake_Level_Up_na_Ken',
              },
            ],
          })
        }

        throw new Error(`Unexpected fetch: ${url.href}`)
      }),
    )

    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=solo%20leveling&type=series', {
        headers: { origin: 'http://localhost:5173' },
      }),
      {
        ALLOWED_ORIGINS: 'http://localhost:5173',
        TMDB_READ_TOKEN: 'token',
      },
    )
    const payload = await response.json()

    expect(payload.results[0]).toEqual(
      expect.objectContaining({
        progressTotal: 25,
        progressUnit: 'episodes',
        source: 'tmdb',
        title: 'Solo Leveling',
        type: 'series',
      }),
    )
    expect('relatedItems' in payload.results[0]).toBe(false)
    expect(fetchedUrls().some((url) => url.hostname === 'graphql.anilist.co' || url.hostname === 'api.jikan.moe' || url.hostname === 'www.wikidata.org')).toBe(false)
    expect(response.headers.get('x-nexo-provider-version')).toBe('2026-06-26-v21')
    expect(cachePut.mock.calls[0]?.[0].url).toContain('v=2026-06-26-v21')
  })

  it('ignores AniList relations for manga source entries', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input))

        if (url.hostname === 'graphql.anilist.co') {
          return jsonResponse({
            data: {
              Page: {
                media: [
                  {
                    id: 105398,
                    title: { english: 'Solo Leveling', romaji: 'Na Honjaman Level Up' },
                    description: 'A hunter levels up alone.',
                    format: 'MANGA',
                    countryOfOrigin: 'KR',
                    chapters: 200,
                    genres: ['Action'],
                    startDate: { year: 2018 },
                    coverImage: { medium: 'https://img.anili.st/media/105398.jpg' },
                    siteUrl: 'https://anilist.co/manga/105398',
                    relations: {
                      edges: [
                        {
                          relationType: 'ADAPTATION',
                          node: {
                            id: 151807,
                            type: 'ANIME',
                            format: 'TV',
                            title: { english: 'Solo Leveling' },
                            startDate: { year: 2024 },
                            coverImage: { medium: 'https://img.anili.st/media/151807.jpg' },
                            siteUrl: 'https://anilist.co/anime/151807',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })
        }

        if (url.hostname === 'kitsu.io') return jsonResponse({ data: [] })
        if (url.hostname === 'api.jikan.moe') return jsonResponse({ data: [] })
        if (url.hostname === 'api.mangadex.org') throw new Error('MangaDex should not be requested')

        throw new Error(`Unexpected fetch: ${url.href}`)
      }),
    )

    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=solo%20leveling&type=manhwa', {
        headers: { origin: 'http://localhost:5173' },
      }),
      {
        ALLOWED_ORIGINS: 'http://localhost:5173',
      },
    )
    const payload = await response.json()

    expect(payload.results[0]).toEqual(
      expect.objectContaining({
        progressTotal: 200,
        title: 'Solo Leveling',
        type: 'manhwa',
      }),
    )
    expect('relatedItems' in payload.results[0]).toBe(false)
    const aniListCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes('graphql.anilist.co'))
    expect(String(aniListCall?.[1]?.body ?? '')).not.toContain('relations')
    expect(fetchedUrls().some((url) => url.hostname === 'api.mangadex.org')).toBe(false)
  })

  it('does not call MangaDex while discovering anime and manga candidates', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input))

        if (url.hostname === 'graphql.anilist.co') {
          return jsonResponse({
            data: {
              Page: {
                media: [
                  {
                    id: 154587,
                    title: { english: 'Frieren: Beyond Journey End', romaji: 'Sousou no Frieren' },
                    description: 'Fantasy journey.',
                    format: 'TV',
                    episodes: 28,
                    genres: ['Fantasy'],
                    startDate: { year: 2023 },
                    coverImage: { medium: 'https://img.anili.st/media/154587.jpg' },
                    siteUrl: 'https://anilist.co/anime/154587',
                  },
                ],
              },
            },
          })
        }

        if (url.hostname === 'api.jikan.moe') return jsonResponse({ data: [] })
        if (url.hostname === 'kitsu.io') return jsonResponse({ data: [] })
        if (url.hostname === 'api.mangadex.org') throw new Error('MangaDex should not be requested')

        throw new Error(`Unexpected fetch: ${url.href}`)
      }),
    )

    const response = await worker.fetch(
      new Request('https://proxy.example/discover?type=animeManga&duration=any&seed=frieren', {
        headers: { origin: 'http://localhost:5173' },
      }),
      {
        ALLOWED_ORIGINS: 'http://localhost:5173',
      },
    )
    const payload = await response.json()

    expect(payload.result).toEqual(expect.objectContaining({ source: 'anilist' }))
    expect(fetchedUrls().some((url) => url.hostname === 'api.mangadex.org')).toBe(false)
  })

  it('ignores Open Library docs without usable keys before returning book candidates', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input))

        if (url.hostname === 'openlibrary.org') {
          return jsonResponse({
            docs: [
              {
                title: 'Missing Key',
                author_name: ['Ghost Author'],
              },
              {
                key: '   ',
                title: 'Blank Key',
                author_name: ['Blank Author'],
              },
              {
                key: 42,
                title: 'Numeric Key',
                author_name: ['Numeric Author'],
              },
              {
                key: '/works/OL123W',
                title: 'Valid Key',
                author_name: ['Present Author'],
                first_publish_year: 2026,
                cover_i: 8327756,
                subject: ['Reference'],
                number_of_pages_median: 321,
              },
            ],
          })
        }

        throw new Error(`Unexpected fetch: ${url.href}`)
      }),
    )

    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=valid%20key&type=book', {
        headers: { origin: 'http://localhost:5173' },
      }),
      {
        ALLOWED_ORIGINS: 'http://localhost:5173',
      },
    )
    const payload = await response.json()

    expect(payload.results).toHaveLength(1)
    expect(payload.results[0]).toEqual(
      expect.objectContaining({
        id: 'open-library--works-OL123W',
        source: 'openLibrary',
        sourceId: '/works/OL123W',
        title: 'Valid Key - Present Author',
      }),
    )
    expect(payload.results[0].externalRefs).toEqual(
      expect.objectContaining({
        openLibraryKey: '/works/OL123W',
        sourceUrl: 'https://openlibrary.org/works/OL123W',
      }),
    )
  })

  it('exposes immutable health metadata and only accepts GET', async () => {
    const health = await worker.fetch(new Request('https://proxy.example/health'), {
      BUILD_SHA: 'abc123',
      NEXO_VERSION: '1.1.50',
    })

    expect(health.status).toBe(200)
    expect(health.headers.get('cache-control')).toBe('no-store')
    await expect(health.json()).resolves.toEqual(expect.objectContaining({
      ok: true,
      version: '1.1.50',
      revision: 'abc123',
    }))

    const invalidMethod = await worker.fetch(new Request('https://proxy.example/health', { method: 'POST' }), {})
    expect(invalidMethod.status).toBe(405)
    expect(invalidMethod.headers.get('allow')).toBe('GET')
  })

  it.each([
    ['/search?q=ok&type=unknown', 'invalid_type'],
    ['/search?q=ok&type=book&limit=0', 'invalid_limit'],
    ['/search?q=ok&type=book&limit=49', 'invalid_limit'],
    ['/search?q=ok&type=book&limit=1.5', 'invalid_limit'],
    [`/search?q=${'x'.repeat(121)}&type=book`, 'query_too_long'],
    ['/discover?type=unknown', 'invalid_type'],
    ['/discover?type=book&duration=forever', 'invalid_duration'],
  ])('rejects invalid catalog input at %s', async (path, expectedError) => {
    const response = await worker.fetch(new Request(`https://proxy.example${path}`), {})

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: expectedError })
  })

  it('supports the versioned search route, applies limit and schedules cache writes', async () => {
    const cachePut = vi.fn(async () => undefined)
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: cachePut,
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      docs: [
        { key: '/works/one', title: 'Dune One' },
        { key: '/works/two', title: 'Dune Two' },
      ],
    })))
    const ctx = executionContext()

    const response = await worker.fetch(
      new Request('https://proxy.example/v1/catalog/search?q=dune&type=book&limit=1'),
      {},
      ctx,
    )
    await ctx.drain()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.results).toHaveLength(1)
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1)
    expect(cachePut).toHaveBeenCalledTimes(1)
    expect(cachePut.mock.calls[0][0].url).toContain('limit=1')
  })

  it('rejects disallowed origins without reflecting them', async () => {
    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=dune&type=book', {
        headers: { origin: 'https://attacker.example' },
      }),
      { ALLOWED_ORIGINS: 'https://nexo.codeoverdose.es' },
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('returns 429 with a privacy-preserving per-client rate-limit key', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=dune&type=book', {
        headers: { 'cf-connecting-ip': '203.0.113.42' },
      }),
      { SEARCH_RATE_LIMITER: { limit } },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(limit).toHaveBeenCalledOnce()
    const rateKey = limit.mock.calls[0][0].key
    expect(rateKey).toMatch(/^search:[a-f0-9]{32}$/)
    expect(rateKey).not.toContain('203.0.113.42')
  })

  it('keeps query text and client addresses out of structured logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ docs: [] })))
    const ctx = executionContext()

    await worker.fetch(
      new Request('https://proxy.example/search?q=private-search-needle&type=book', {
        headers: { 'cf-connecting-ip': '203.0.113.99' },
      }),
      { SEARCH_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } },
      ctx,
    )
    await ctx.drain()

    const logs = JSON.stringify(log.mock.calls)
    expect(logs).not.toContain('private-search-needle')
    expect(logs).not.toContain('203.0.113.99')
  })

  it('ignores a corrupt cache entry, returns partial provider results and does not cache them', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const cachePut = vi.fn(async () => undefined)
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => jsonResponse({ stale: true })),
        put: cachePut,
      },
    })
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'www.googleapis.com') throw new Error('Google Books unavailable')
      if (url.hostname === 'openlibrary.org') {
        return jsonResponse({ docs: [{ key: '/works/OL27448W', title: 'Dune' }] })
      }
      throw new Error(`Unexpected fetch: ${url.href}`)
    }))
    const ctx = executionContext()

    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=dune&type=book'),
      { GOOGLE_BOOKS_API_KEY: 'secret' },
      ctx,
    )
    await ctx.drain()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nexo-cache')).toBe('miss')
    expect(response.headers.get('x-nexo-partial')).toBe('true')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(payload.results).toEqual([expect.objectContaining({ source: 'openLibrary' })])
    expect(cachePut).not.toHaveBeenCalled()
    expect(ctx.waitUntil).not.toHaveBeenCalled()
  })

  it('marks a non-success provider status as partial while preserving healthy results', async () => {
    const cachePut = vi.fn(async () => undefined)
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: cachePut,
      },
    })
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'www.googleapis.com') {
        return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), {
          headers: { 'content-type': 'application/json' },
          status: 503,
        })
      }
      if (url.hostname === 'openlibrary.org') {
        return jsonResponse({ docs: [{ key: '/works/OL27448W', title: 'Dune' }] })
      }
      throw new Error(`Unexpected fetch: ${url.href}`)
    }))
    const ctx = executionContext()

    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=dune&type=book'),
      { GOOGLE_BOOKS_API_KEY: 'secret' },
      ctx,
    )
    await ctx.drain()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nexo-partial')).toBe('true')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(payload.results).toEqual([expect.objectContaining({ source: 'openLibrary' })])
    expect(cachePut).not.toHaveBeenCalled()
  })

  it('enforces four concurrent provider requests and stays within the 36 subrequest budget', async () => {
    let active = 0
    let maxActive = 0
    let providerRequests = 0
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      providerRequests += 1
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'api.themoviedb.org' || url.hostname === 'api.rawg.io') return jsonResponse({ results: [] })
      if (url.hostname === 'graphql.anilist.co') return jsonResponse({ data: { Page: { media: [] } } })
      if (url.hostname === 'api.jikan.moe' || url.hostname === 'kitsu.io') return jsonResponse({ data: [] })
      if (url.hostname === 'www.googleapis.com') return jsonResponse({ items: [] })
      if (url.hostname === 'openlibrary.org') return jsonResponse({ docs: [] })
      if (url.hostname === 'www.wikidata.org') return jsonResponse({ search: [] })
      throw new Error(`Unexpected fetch: ${url.href}`)
    }))
    const ctx = executionContext()

    const response = await worker.fetch(
      new Request('https://proxy.example/discover?type=any&duration=any&seed=budget'),
      {
        GOOGLE_BOOKS_API_KEY: 'google',
        RAWG_API_KEY: 'rawg',
        TMDB_READ_TOKEN: 'tmdb',
      },
      ctx,
    )
    await ctx.drain()

    expect(response.status).toBe(200)
    expect(providerRequests).toBeGreaterThan(4)
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(Number(response.headers.get('x-nexo-subrequests'))).toBeLessThanOrEqual(36)
  })

  it('holds each concurrency slot until a fast-header response body has been consumed', async () => {
    let activeBodies = 0
    let maxActiveBodies = 0
    let providerRequests = 0
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      providerRequests += 1
      return delayedJsonResponse(emptyProviderPayload(url), 10, {
        onStart: () => {
          activeBodies += 1
          maxActiveBodies = Math.max(maxActiveBodies, activeBodies)
        },
        onFinish: () => {
          activeBodies -= 1
        },
      })
    }))
    const ctx = executionContext()

    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=body%20slots&type=any'),
      {
        GOOGLE_BOOKS_API_KEY: 'google',
        RAWG_API_KEY: 'rawg',
        TMDB_READ_TOKEN: 'tmdb',
      },
      ctx,
    )
    await ctx.drain()

    expect(response.status).toBe(200)
    expect(providerRequests).toBeGreaterThan(4)
    expect(maxActiveBodies).toBeLessThanOrEqual(4)
    expect(activeBodies).toBe(0)
    expect(Number(response.headers.get('x-nexo-subrequests'))).toBeLessThanOrEqual(36)
  })

  it('applies the three-second provider timeout while consuming a slow body and returns partial results', async () => {
    vi.useFakeTimers()
    let canceledBodies = 0
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => delayedJsonResponse({ docs: [] }, 4_000, {
      onCancel: () => {
        canceledBodies += 1
      },
    })))
    const ctx = executionContext()

    const pending = worker.fetch(
      new Request('https://proxy.example/search?q=slow%20body&type=book'),
      {},
      ctx,
    )
    await vi.advanceTimersByTimeAsync(3_001)
    const response = await pending
    await ctx.drain()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nexo-partial')).toBe('true')
    expect(canceledBodies).toBe(1)
    expect(Number(response.headers.get('x-nexo-subrequests'))).toBeLessThanOrEqual(36)
    await expect(response.json()).resolves.toEqual({ results: [] })
  })

  it('checks the provider deadline again after JSON parsing completes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      deadlineMarker: true,
      docs: [{ key: '/works/late', title: 'Parsed too late' }],
    })))
    const parseJson = JSON.parse.bind(JSON)
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation((source, reviver) => {
      const payload = parseJson(source, reviver)
      if (typeof source === 'string' && source.includes('"deadlineMarker":true')) {
        vi.setSystemTime(Date.now() + 3_001)
      }
      return payload
    })
    const ctx = executionContext()

    const response = await worker.fetch(
      new Request('https://proxy.example/search?q=parse%20deadline&type=book'),
      {},
      ctx,
    )
    await ctx.drain()
    parseSpy.mockRestore()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nexo-partial')).toBe('true')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ results: [] })
  })

  it('applies the eight-second request deadline across queued slow bodies and preserves early partial results', async () => {
    vi.useFakeTimers()
    let canceledBodies = 0
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const payload = url.hostname === 'graphql.anilist.co'
        ? {
            data: {
              Page: {
                media: [{
                  id: 1,
                  title: { english: 'Early result' },
                  description: 'Completed before the global deadline.',
                  episodes: 12,
                  format: 'TV',
                  countryOfOrigin: 'JP',
                  genres: ['Drama'],
                  startDate: { year: 2026 },
                  coverImage: { medium: 'https://example.com/early.jpg' },
                  siteUrl: 'https://anilist.co/anime/1',
                }],
              },
            },
          }
        : emptyProviderPayload(url)
      return delayedJsonResponse(payload, 2_800, {
        onCancel: () => {
          canceledBodies += 1
        },
      })
    }))
    const ctx = executionContext()

    const pending = worker.fetch(
      new Request('https://proxy.example/search?q=early%20result&type=any'),
      {
        GOOGLE_BOOKS_API_KEY: 'google',
        RAWG_API_KEY: 'rawg',
        TMDB_READ_TOKEN: 'tmdb',
      },
      ctx,
    )
    await vi.advanceTimersByTimeAsync(8_001)
    const response = await pending
    await ctx.drain()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nexo-partial')).toBe('true')
    expect(payload.results).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Early result' })]))
    expect(canceledBodies).toBeGreaterThan(0)
    expect(Number(response.headers.get('x-nexo-subrequests'))).toBeLessThanOrEqual(36)
  })

  it('aborts a stalled provider after three seconds and returns a partial response', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })))
    const ctx = executionContext()

    const pending = worker.fetch(
      new Request('https://proxy.example/search?q=dune&type=book'),
      {},
      ctx,
    )
    await vi.advanceTimersByTimeAsync(3_001)
    const response = await pending
    await ctx.drain()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-nexo-partial')).toBe('true')
    await expect(response.json()).resolves.toEqual({ results: [] })
  })
})
