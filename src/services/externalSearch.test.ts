import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchExternalSources } from './externalSearch'

type FetchInput = Parameters<typeof fetch>[0]

function mockCatalogFetch(handler: (url: URL, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: FetchInput, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const payload = handler(url, init)
      return new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }),
  )
}

function aniListPayload(media: unknown[]) {
  return {
    data: {
      Page: {
        media,
      },
    },
  }
}

function jikanPayload(data: unknown[]) {
  return { data }
}

function mangaDexPayload(data: unknown[]) {
  return { data }
}

function kitsuPayload(data: unknown[]) {
  return { data }
}

describe('external search', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('classifies AniList Korean manga entries as manhwa', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') {
        return aniListPayload([
          {
            id: 119257,
            title: { english: 'Omniscient Reader', romaji: 'Jeonjijeok Dokja Sijeom', native: '전지적 독자 시점' },
            description: 'A reader survives inside a story he knows.',
            format: 'MANGA',
            countryOfOrigin: 'KR',
            genres: ['Action', 'Fantasy'],
            startDate: { year: 2020 },
            coverImage: { medium: 'https://img.anili.st/media/119257.jpg' },
          },
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('Omniscient reader', 'manhwa')

    expect(results).toContainEqual(
      expect.objectContaining({
        source: 'anilist',
        sourceId: '119257',
        title: 'Omniscient Reader',
        type: 'manhwa',
      }),
    )
  })

  it('uses Jikan as a manhwa fallback with MyAnimeList refs', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      return jikanPayload([
        {
          mal_id: 132214,
          title: "Omniscient Reader's Viewpoint",
          title_english: "Omniscient Reader's Viewpoint",
          synopsis: 'Apocalyptic story survival.',
          type: 'Manhwa',
          published: { prop: { from: { year: 2020 } } },
          images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/1/132214.jpg' } },
          genres: [{ name: 'Action' }, { name: 'Fantasy' }],
          url: 'https://myanimelist.net/manga/132214/Omniscient_Readers_Viewpoint',
        },
      ])
    })

    const results = await searchExternalSources('Omniscient reader', 'manhwa')

    expect(results).toContainEqual(
      expect.objectContaining({
        externalRefs: expect.objectContaining({ malId: '132214' }),
        source: 'jikan',
        title: "Omniscient Reader's Viewpoint",
        type: 'manhwa',
      }),
    )
  })

  it('uses MangaDex localized aliases for manhwa searches', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      if (url.hostname === 'api.mangadex.org') {
        return mangaDexPayload([
          {
            id: '81057c75-09da-4f48-a22d-0cba875477cf',
            attributes: {
              title: { en: 'Painter of the Night' },
              altTitles: [{ es: 'Pintor Nocturno' }, { ko: '야화첩' }],
              originalLanguage: 'ko',
              year: 2019,
              description: { en: 'Historical BL manhwa.' },
              tags: [{ attributes: { name: { en: 'Drama' } } }],
            },
            relationships: [
              {
                type: 'cover_art',
                attributes: { fileName: 'cover.jpg' },
              },
            ],
          },
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('Pintor nocturno', 'manhwa')

    expect(results[0]).toEqual(
      expect.objectContaining({
        externalRefs: expect.objectContaining({ mangaDexId: '81057c75-09da-4f48-a22d-0cba875477cf' }),
        searchAliases: expect.arrayContaining(['Pintor Nocturno']),
        source: 'mangaDex',
        title: 'Pintor Nocturno',
        type: 'manhwa',
      }),
    )
  })

  it('uses a readable MangaDex alias when the primary title is non-Latin but the query is Latin', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      if (url.hostname === 'api.mangadex.org') {
        return mangaDexPayload([
          {
            id: 'b0b721ff-c388-4486-aa0f-c2b0bb321512',
            attributes: {
              title: {
                th: '\u0e04\u0e33\u0e2d\u0e18\u0e34\u0e29\u0e10\u0e32\u0e19\u0e43\u0e19\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e08\u0e32\u0e01\u0e25\u0e32 Frieren',
              },
              altTitles: [{ 'ja-ro': 'Sousou no Frieren' }, { en: "Frieren: Beyond Journey's End" }],
              originalLanguage: 'ja',
              year: 2020,
              description: { en: 'Fantasy manga.' },
              tags: [{ attributes: { name: { en: 'Fantasy' } } }],
            },
            relationships: [
              {
                type: 'cover_art',
                attributes: { fileName: 'cover.jpg' },
              },
            ],
          },
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('Frieren', 'manga')

    expect(results[0]).toEqual(
      expect.objectContaining({
        externalRefs: expect.objectContaining({ mangaDexId: 'b0b721ff-c388-4486-aa0f-c2b0bb321512' }),
        searchAliases: expect.arrayContaining(["Frieren: Beyond Journey's End"]),
        source: 'mangaDex',
        title: "Frieren: Beyond Journey's End",
        type: 'manga',
      }),
    )
  })

  it('uses Kitsu localized titles when other manga providers miss a Spanish alias', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      if (url.hostname === 'api.mangadex.org') return mangaDexPayload([])
      if (url.hostname === 'kitsu.io') {
        return kitsuPayload([
          {
            id: '12345',
            attributes: {
              canonicalTitle: 'The Remarried Empress',
              titles: {
                en_us: 'The Remarried Empress',
                es_es: 'La emperatriz divorciada',
                ko_kr: '재혼 황후',
              },
              subtype: 'manhwa',
              startDate: '2019-10-24',
              synopsis: 'A remarried empress story.',
              posterImage: { small: 'https://media.kitsu.io/manga/poster_images/12345/small.jpg' },
              slug: 'the-remarried-empress',
            },
          },
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('La emperatriz divorciada', 'manhwa')

    expect(results[0]).toEqual(
      expect.objectContaining({
        externalRefs: expect.objectContaining({ kitsuId: '12345' }),
        searchAliases: expect.arrayContaining(['La emperatriz divorciada']),
        source: 'kitsu',
        title: 'La emperatriz divorciada',
        type: 'manhwa',
      }),
    )
  })

  it('uses Jikan title synonyms for compact manga aliases', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      if (url.hostname === 'api.mangadex.org') return mangaDexPayload([])
      if (url.hostname === 'kitsu.io') return kitsuPayload([])
      return jikanPayload([
        {
          mal_id: 116312,
          title: '19 Tian',
          type: 'Manga',
          titles: [
            { type: 'Default', title: '19 Tian' },
            { type: 'Synonym', title: '19 Days' },
          ],
          published: { prop: { from: { year: 2014 } } },
          images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/2/116312.jpg' } },
          genres: [{ name: 'Comedy' }],
          url: 'https://myanimelist.net/manga/116312/19_Tian',
        },
      ])
    })

    const results = await searchExternalSources('19days', 'manga')

    expect(results[0]).toEqual(
      expect.objectContaining({
        searchAliases: expect.arrayContaining(['19 Days']),
        source: 'jikan',
        title: '19 Tian',
      }),
    )
  })

  it('adds Jikan related sequel and source references with posters', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/anime') {
        return jikanPayload([
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
        ])
      }
      if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/anime/52299/relations') {
        return {
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
        }
      }
      if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/anime/58567') {
        return { data: { images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/season-2.jpg' } }, year: 2025 } }
      }
      if (url.hostname === 'api.jikan.moe' && url.pathname === '/v4/manga/121496') {
        return {
          data: {
            images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/solo-leveling.jpg' } },
            published: { prop: { from: { year: 2018 } } },
          },
        }
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('solo leveling', 'anime')

    expect(results[0]).toEqual(
      expect.objectContaining({
        progressTotal: 12,
        progressUnit: 'episodes',
        relatedItems: expect.arrayContaining([
          expect.objectContaining({
            posterUrl: 'https://cdn.myanimelist.net/images/anime/season-2.jpg',
            relation: 'sequel',
            title: 'Solo Leveling Season 2: Arise from the Shadow',
            type: 'anime',
          }),
          expect.objectContaining({
            posterUrl: 'https://cdn.myanimelist.net/images/manga/solo-leveling.jpg',
            relation: 'source',
            title: 'Solo Leveling',
            type: 'manga',
          }),
        ]),
        source: 'jikan',
        title: 'Solo Leveling',
      }),
    )
  })

  it('keeps cross-media adaptations as adaptations when the current item is the source medium', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') {
        return aniListPayload([
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
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('solo leveling', 'manhwa')

    expect(results[0]?.relatedItems?.[0]).toEqual(
      expect.objectContaining({
        relation: 'adaptation',
        title: 'Solo Leveling',
        type: 'anime',
      }),
    )
  })

  it('drops invalid Jikan genre names', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      return jikanPayload([
        {
          mal_id: 104241,
          title: 'Mairimashita! Iruma-kun',
          title_english: 'Welcome to Demon School! Iruma-kun',
          type: 'Manga',
          published: { prop: { from: { year: 2017 } } },
          images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/3/104241.jpg' } },
          genres: [{ name: undefined }, { name: 'Action' }, {}, null, { name: '  ' }, { name: 'Fantasy' }, 'Comedy'],
          url: 'https://myanimelist.net/manga/104241/Mairimashita_Iruma-kun',
        },
      ])
    })

    const results = await searchExternalSources('Iruma-kun', 'manga')
    const candidate = results.find((result) => result.source === 'jikan')

    expect(candidate?.genres).toEqual(['Action', 'Fantasy'])
    expect(candidate?.genres).not.toContain('undefined')
  })

  it('keeps Japanese AniList manga entries as manga', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') {
        return aniListPayload([
          {
            id: 99324,
            title: { english: 'Welcome to Demon School! Iruma-kun', romaji: 'Mairimashita! Iruma-kun' },
            format: 'MANGA',
            countryOfOrigin: 'JP',
            genres: ['Comedy'],
            startDate: { year: 2017 },
            coverImage: { medium: 'https://img.anili.st/media/99324.jpg' },
          },
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('Iruma-kun', 'manga')

    expect(results).toContainEqual(
      expect.objectContaining({
        source: 'anilist',
        title: 'Welcome to Demon School! Iruma-kun',
        type: 'manga',
      }),
    )
  })

  it('keeps AniList TV entries as anime', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') {
        return aniListPayload([
          {
            id: 197824,
            title: { english: 'Farming Life in Another World 2', romaji: 'Isekai Nonbiri Nouka 2' },
            format: 'TV',
            countryOfOrigin: 'JP',
            episodes: 12,
            genres: ['Fantasy', 'Slice of Life'],
            startDate: { year: 2026 },
            coverImage: { medium: 'https://img.anili.st/media/197824.jpg' },
            siteUrl: 'https://anilist.co/anime/197824',
            relations: {
              edges: [
                {
                  relationType: 'PREQUEL',
                  node: {
                    id: 146850,
                    type: 'ANIME',
                    format: 'TV',
                    countryOfOrigin: 'JP',
                    title: { english: 'Farming Life in Another World', romaji: 'Isekai Nonbiri Nouka' },
                    startDate: { year: 2023 },
                    coverImage: { medium: 'https://img.anili.st/media/146850.jpg' },
                    siteUrl: 'https://anilist.co/anime/146850',
                  },
                },
              ],
            },
          },
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('Isekai Nonbiri Nouka 2', 'anime')

    expect(results).toContainEqual(
      expect.objectContaining({
        source: 'anilist',
        title: 'Farming Life in Another World 2',
        type: 'anime',
        progressTotal: 12,
        progressUnit: 'episodes',
        relatedItems: [
          expect.objectContaining({
            relation: 'prequel',
            title: 'Farming Life in Another World',
            type: 'anime',
          }),
        ],
      }),
    )
  })

  it('falls back to direct free sources when the proxy returns no candidates', async () => {
    vi.stubEnv('VITE_CATALOG_PROXY_URL', 'https://catalog-proxy.example')
    mockCatalogFetch((url) => {
      if (url.hostname === 'catalog-proxy.example') return { results: [] }
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      return jikanPayload([
        {
          mal_id: 104241,
          title: 'Mairimashita! Iruma-kun',
          title_english: 'Welcome to Demon School! Iruma-kun',
          type: 'Manga',
          published: { prop: { from: { year: 2017 } } },
          images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/3/104241.jpg' } },
          genres: [{ name: 'Comedy' }],
          url: 'https://myanimelist.net/manga/104241/Mairimashita_Iruma-kun',
        },
      ])
    })

    const results = await searchExternalSources('Iruma-kun', 'manga')

    expect(results).toContainEqual(
      expect.objectContaining({
        externalRefs: expect.objectContaining({ malId: '104241' }),
        source: 'jikan',
        title: 'Welcome to Demon School! Iruma-kun',
        type: 'manga',
      }),
    )
  })

  it('keeps proxy progress metadata and related references for non-AniList sources', async () => {
    vi.stubEnv('VITE_CATALOG_PROXY_URL', 'https://catalog-proxy.example')
    mockCatalogFetch((url) => {
      if (url.hostname === 'catalog-proxy.example') {
        return {
          results: [
            {
              id: 'tmdb-movie-603',
              title: 'The Matrix',
              type: 'movie',
              source: 'tmdb',
              sourceId: '603',
              progressTotal: 2.3,
              progressUnit: 'hours',
              genres: ['Ciencia ficcion'],
              externalRefs: {
                tmdbId: '603',
                wikidataId: 'Q83495',
                sourceUrl: 'https://www.themoviedb.org/movie/603',
              },
              relatedItems: [
                {
                  title: 'The Matrix Reloaded',
                  type: 'movie',
                  relation: 'sequel',
                  source: 'tmdb',
                  sourceId: '604',
                  externalRefs: {
                    tmdbId: '604',
                    sourceUrl: 'https://www.themoviedb.org/movie/604',
                  },
                },
                {
                  title: 'Neuromancer',
                  type: 'book',
                  relation: 'source',
                  source: 'wikidata',
                  sourceId: 'Q174596',
                  externalRefs: {
                    wikidataId: 'Q174596',
                    sourceUrl: 'https://www.wikidata.org/wiki/Q174596',
                  },
                },
              ],
              createdAt: '2026-06-14T00:00:00.000Z',
            },
          ],
        }
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('matrix', 'movie')

    expect(results[0]).toEqual(
      expect.objectContaining({
        source: 'tmdb',
        progressTotal: 2.3,
        progressUnit: 'hours',
        relatedItems: [
          expect.objectContaining({ relation: 'sequel', source: 'tmdb', title: 'The Matrix Reloaded' }),
          expect.objectContaining({ relation: 'source', source: 'wikidata', title: 'Neuromancer', type: 'book' }),
        ],
      }),
    )
  })

  it('enriches animated TMDB series proxy results with AniList relations in the browser', async () => {
    vi.stubEnv('VITE_CATALOG_PROXY_URL', 'https://catalog-proxy.example')
    mockCatalogFetch((url) => {
      if (url.hostname === 'catalog-proxy.example') {
        return {
          results: [
            {
              id: 'tmdb-tv-127532',
              title: 'Solo Leveling',
              type: 'series',
              source: 'tmdb',
              sourceId: '127532',
              progressTotal: 25,
              progressUnit: 'episodes',
              genres: ['Animacion', 'Accion y aventura'],
              externalRefs: {
                tmdbId: '127532',
                sourceUrl: 'https://www.themoviedb.org/tv/127532',
              },
              createdAt: '2026-06-16T00:00:00.000Z',
            },
          ],
        }
      }
      if (url.hostname === 'graphql.anilist.co') {
        return aniListPayload([
          {
            id: 151807,
            title: {
              english: 'Solo Leveling',
              romaji: 'Ore dake Level Up na Ken',
            },
            description: 'A hunter levels up alone.',
            format: 'TV',
            episodes: 12,
            genres: ['Action'],
            startDate: { year: 2024 },
            coverImage: { medium: 'https://img.anili.st/media/151807.jpg' },
            siteUrl: 'https://anilist.co/anime/151807',
            relations: {
              edges: [
                {
                  relationType: 'ADAPTATION',
                  node: {
                    id: 105398,
                    type: 'MANGA',
                    format: 'MANGA',
                    countryOfOrigin: 'KR',
                    title: { english: 'Solo Leveling', romaji: 'Na Honjaman Level Up' },
                    startDate: { year: 2018 },
                    coverImage: { medium: 'https://img.anili.st/media/105398.jpg' },
                    siteUrl: 'https://anilist.co/manga/105398',
                  },
                },
                {
                  relationType: 'SEQUEL',
                  node: {
                    id: 176496,
                    type: 'ANIME',
                    format: 'TV',
                    title: { english: 'Solo Leveling Season 2 -Arise from the Shadow-' },
                    startDate: { year: 2025 },
                    coverImage: { medium: 'https://img.anili.st/media/176496.jpg' },
                    siteUrl: 'https://anilist.co/anime/176496',
                  },
                },
              ],
            },
          },
        ])
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('solo leveling', 'series')

    expect(results[0]).toEqual(
      expect.objectContaining({
        progressTotal: 25,
        progressUnit: 'episodes',
        relatedItems: expect.arrayContaining([
          expect.objectContaining({
            posterUrl: 'https://img.anili.st/media/105398.jpg',
            relation: 'source',
            title: 'Solo Leveling',
            type: 'manhwa',
          }),
          expect.objectContaining({
            posterUrl: 'https://img.anili.st/media/176496.jpg',
            relation: 'sequel',
            title: 'Solo Leveling Season 2 -Arise from the Shadow-',
            type: 'anime',
          }),
        ]),
        source: 'tmdb',
        title: 'Solo Leveling',
        type: 'series',
      }),
    )
  })
})
