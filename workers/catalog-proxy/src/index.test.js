import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index.js'

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

describe('catalog proxy worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('enriches TMDB series with episode totals and related seasons/anime references', async () => {
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

        if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/anime/52299/relations') {
          return jsonResponse({
            data: [
              {
                relation: 'Sequel',
                entry: [
                  {
                    mal_id: 58567,
                    name: 'Solo Leveling Season 2: Arise from the Shadow',
                    type: 'anime',
                    url: 'https://myanimelist.net/anime/58567/Solo_Leveling_Season_2',
                  },
                ],
              },
              {
                relation: 'Adaptation',
                entry: [
                  {
                    mal_id: 121496,
                    name: 'Solo Leveling',
                    type: 'manga',
                    url: 'https://myanimelist.net/manga/121496/Solo_Leveling',
                  },
                ],
              },
            ],
          })
        }

        if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/anime/58567') {
          return jsonResponse({
            data: {
              images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/season-2.jpg' } },
              year: 2025,
            },
          })
        }

        if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/manga/121496') {
          return jsonResponse({
            data: {
              images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/solo-leveling.jpg' } },
              published: { prop: { from: { year: 2018 } } },
            },
          })
        }

        if (url.hostname === 'www.wikidata.org') {
          return jsonResponse({
            entities: {
              Q115787130: {
                claims: {},
              },
            },
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
        relatedItems: expect.arrayContaining([
          expect.objectContaining({
            relation: 'sequel',
            source: 'tmdb',
            title: 'Solo Leveling Season 2',
            type: 'series',
          }),
          expect.objectContaining({
            relation: 'source',
            posterUrl: 'https://cdn.myanimelist.net/images/manga/solo-leveling.jpg',
            source: 'jikan',
            title: 'Solo Leveling',
            type: 'manga',
          }),
          expect.objectContaining({
            relation: 'sequel',
            posterUrl: 'https://cdn.myanimelist.net/images/anime/season-2.jpg',
            source: 'jikan',
            title: 'Solo Leveling Season 2: Arise from the Shadow',
            type: 'anime',
          }),
        ]),
        source: 'tmdb',
        title: 'Solo Leveling',
        type: 'series',
      }),
    )
    expect(cachePut.mock.calls[0]?.[0].url).toContain('v=2026-06-16-v19')
  })

  it('keeps AniList anime adaptations as adaptations for manga source entries', async () => {
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

        if (url.hostname === 'api.mangadex.org') return jsonResponse({ data: [] })
        if (url.hostname === 'kitsu.io') return jsonResponse({ data: [] })
        if (url.hostname === 'api.jikan.moe') return jsonResponse({ data: [] })

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

    expect(payload.results[0]?.relatedItems?.[0]).toEqual(
      expect.objectContaining({
        relation: 'adaptation',
        title: 'Solo Leveling',
        type: 'anime',
      }),
    )
  })
})
