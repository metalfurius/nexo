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
            genres: ['Fantasy', 'Slice of Life'],
            startDate: { year: 2026 },
            coverImage: { medium: 'https://img.anili.st/media/197824.jpg' },
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
})
