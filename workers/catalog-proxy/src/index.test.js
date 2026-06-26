import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index.js'

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function fetchedUrls() {
  return vi.mocked(fetch).mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
}

describe('catalog proxy worker', () => {
  afterEach(() => {
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
})
