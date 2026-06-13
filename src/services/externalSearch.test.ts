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
