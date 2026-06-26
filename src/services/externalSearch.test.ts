import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalSourceCredits } from './externalSourceCredits'
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


function kitsuPayload(data: unknown[]) {
  return { data }
}

function fetchedUrls() {
  return vi.mocked(fetch).mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
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

  it('does not request MangaDex for manga and manhwa searches', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
      if (url.hostname === 'kitsu.io') return kitsuPayload([])
      if (url.hostname === 'api.mangadex.org') throw new Error('MangaDex should not be requested')
      return jikanPayload([
        {
          mal_id: 116312,
          title: '19 Tian',
          type: 'Manga',
          images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/2/116312.jpg' } },
          url: 'https://myanimelist.net/manga/116312/19_Tian',
        },
      ])
    })

    await searchExternalSources('19days', 'manga')
    await searchExternalSources('Omniscient reader', 'manhwa')

    expect(fetchedUrls().some((url) => url.hostname === 'api.mangadex.org')).toBe(false)
  })

  it('keeps MangaDex out of visible source credits', () => {
    expect(externalSourceCredits.map((source) => source.id)).not.toContain('mangaDex')
  })

  it('uses Kitsu localized titles when other manga providers miss a Spanish alias', async () => {
    mockCatalogFetch((url) => {
      if (url.hostname === 'graphql.anilist.co') return aniListPayload([])
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

  it('keeps Jikan progress metadata without requesting related references', async () => {
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
      return jikanPayload([])
    })

    const results = await searchExternalSources('solo leveling', 'anime')

    expect(results[0]).toEqual(
      expect.objectContaining({
        progressTotal: 12,
        progressUnit: 'episodes',
        source: 'jikan',
        title: 'Solo Leveling',
      }),
    )
    expect('relatedItems' in (results[0] ?? {})).toBe(false)
    expect(fetchedUrls().some((url) => url.pathname.includes('/relations'))).toBe(false)
  })

  it('ignores AniList relations while keeping source medium progress metadata', async () => {
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

    expect(results[0]).toEqual(
      expect.objectContaining({
        progressTotal: 200,
        title: 'Solo Leveling',
        type: 'manhwa',
      }),
    )
    expect('relatedItems' in (results[0] ?? {})).toBe(false)
    const aniListCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes('graphql.anilist.co'))
    expect(String(aniListCall?.[1]?.body ?? '')).not.toContain('relations')
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
      }),
    )
    const candidate = results.find((result) => result.source === 'anilist')
    expect(candidate && 'relatedItems' in candidate).toBe(false)
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

  it('filters MangaDex candidates returned by an older catalog proxy', async () => {
    vi.stubEnv('VITE_CATALOG_PROXY_URL', 'https://catalog-proxy.example')
    mockCatalogFetch((url) => {
      if (url.hostname === 'catalog-proxy.example') {
        return {
          results: [
            {
              id: 'mangadex-legacy',
              title: 'Legacy MangaDex',
              type: 'manga',
              source: 'mangaDex',
              sourceId: 'legacy',
              posterUrl: 'https://uploads.mangadex.org/covers/legacy/cover.jpg.256.jpg',
              externalRefs: { mangaDexId: 'legacy' },
              createdAt: '2026-06-01T00:00:00.000Z',
            },
            {
              id: 'anilist-99324',
              title: 'Welcome to Demon School! Iruma-kun',
              type: 'manga',
              source: 'anilist',
              sourceId: '99324',
              posterUrl: 'https://img.anili.st/media/99324.jpg',
              externalRefs: { anilistId: '99324' },
              createdAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        }
      }
      return jikanPayload([])
    })

    const results = await searchExternalSources('Iruma-kun', 'manga')

    expect(results).toContainEqual(expect.objectContaining({ source: 'anilist' }))
    expect(results.some((result) => result.source === 'mangaDex')).toBe(false)
  })

  it('keeps proxy progress metadata and drops legacy related references for non-AniList sources', async () => {
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
      }),
    )
    expect('relatedItems' in (results[0] ?? {})).toBe(false)
  })

  it('does not enrich animated TMDB series proxy results with related references in the browser', async () => {
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
        source: 'tmdb',
        title: 'Solo Leveling',
        type: 'series',
      }),
    )
    expect('relatedItems' in (results[0] ?? {})).toBe(false)
    expect(fetchedUrls().some((url) => url.hostname === 'graphql.anilist.co')).toBe(false)
  })
})
