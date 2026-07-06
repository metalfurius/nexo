import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEIGHTS, type ImportedLibraryItemDraft, type ListItem } from '../domain/types'
import {
  buildImportPreview,
  getImportPreviewNewItems,
  importAniListLibrary,
  importGoodreadsCsv,
  importLetterboxdZip,
  importMyAnimeListLibrary,
  importPreviewItemsToListItems,
  parseGoodreadsCsv,
  parseLetterboxdZipBytes,
} from './libraryImporters'

type FetchInput = Parameters<typeof fetch>[0]

const currentItem: ListItem = {
  id: 'book-left-hand',
  title: 'The Left Hand of Darkness',
  type: 'book',
  status: 'completed',
  rating: 10,
  progress: 'Leido',
  genres: ['Science Fiction'],
  tags: ['favorito'],
  moodTags: [],
  weights: DEFAULT_WEIGHTS,
  notes: 'Nota privada que no debe pisarse.',
  source: 'manual',
  externalRefs: { goodreadsBookId: '42' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('library importers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses Goodreads CSV exports into private book drafts', () => {
    const csv = [
      'Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Bookshelves,Original Publication Year,My Review',
      '42,The Left Hand of Darkness,Ursula K. Le Guin,"=""9780441478125""",5,read,"sci-fi, favorites",1969,Gran lectura',
      '99,A Psalm for the Wild-Built,Becky Chambers,9781250236210,4,to-read,hopepunk,2021,',
    ].join('\n')

    const result = parseGoodreadsCsv(csv)

    expect(result.drafts).toHaveLength(2)
    expect(result.drafts[0]).toEqual(
      expect.objectContaining({
        sourceId: 'goodreads',
        sourceItemId: '42',
        title: 'The Left Hand of Darkness',
        type: 'book',
        status: 'completed',
        rating: 10,
        releaseYear: 1969,
        externalRefs: expect.objectContaining({
          goodreadsBookId: '42',
          isbn: '9780441478125',
        }),
      }),
    )
    expect(result.drafts[1]).toEqual(expect.objectContaining({ status: 'wishlist', rating: 8 }))
  })

  it('reads Letterboxd ZIP exports and merges repeated film rows', () => {
    const zipBytes = zipSync({
      'letterboxd/watchlist.csv': strToU8(
        'Date,Name,Year,Letterboxd URI\n2026-01-01,Arrival,2016,https://letterboxd.com/film/arrival-2016/\n',
      ),
      'letterboxd/ratings.csv': strToU8(
        'Date,Name,Year,Letterboxd URI,Rating\n2026-01-02,Arrival,2016,https://letterboxd.com/film/arrival-2016/,4.5\n',
      ),
    })

    const result = parseLetterboxdZipBytes(zipBytes)

    expect(result.warnings).toEqual([])
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]).toEqual(
      expect.objectContaining({
        title: 'Arrival',
        type: 'movie',
        status: 'completed',
        rating: 9,
        releaseYear: 2016,
        externalRefs: expect.objectContaining({ letterboxdSlug: 'arrival-2016' }),
      }),
    )
  })

  it('rejects oversized Letterboxd ZIP and CSV payloads before parsing rows', () => {
    expect(() => parseLetterboxdZipBytes(new Uint8Array(10 * 1024 * 1024 + 1))).toThrow(
      'El ZIP de Letterboxd supera el limite de 10 MB.',
    )

    const zipBytes = zipSync({
      'letterboxd/watched.csv': strToU8(`Date,Name,Year,Letterboxd URI\n${'A'.repeat(4 * 1024 * 1024 + 1)}`),
    })

    expect(() => parseLetterboxdZipBytes(zipBytes)).toThrow('El CSV letterboxd/watched.csv supera el limite de 4 MB.')
  })

  it('rejects oversized Letterboxd files before reading them into memory', async () => {
    const arrayBuffer = vi.fn()
    const file = { arrayBuffer, size: 10 * 1024 * 1024 + 1 } as unknown as File

    await expect(importLetterboxdZip(file)).rejects.toThrow('El ZIP de Letterboxd supera el limite de 10 MB.')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('merges repeated Letterboxd rows in a stable priority order', () => {
    const csvs = {
      'letterboxd/watchlist.csv': strToU8(
        'Date,Name,Year,Letterboxd URI\n2026-01-01,Arrival,2016,https://letterboxd.com/film/arrival-2016/\n',
      ),
      'letterboxd/diary.csv': strToU8(
        'Date,Name,Year,Letterboxd URI,Rating\n2026-01-02,Arrival,2016,https://letterboxd.com/film/arrival-2016/,2\n',
      ),
      'letterboxd/ratings.csv': strToU8(
        'Date,Name,Year,Letterboxd URI,Rating\n2026-01-03,Arrival,2016,https://letterboxd.com/film/arrival-2016/,3\n',
      ),
      'letterboxd/reviews.csv': strToU8(
        'Date,Name,Year,Letterboxd URI,Rating,Review\n2026-01-04,Arrival,2016,https://letterboxd.com/film/arrival-2016/,4.5,Review wins\n',
      ),
    }
    const naturalOrder = parseLetterboxdZipBytes(zipSync(csvs))
    const reverseOrder = parseLetterboxdZipBytes(zipSync(Object.fromEntries(Object.entries(csvs).reverse())))

    expect(naturalOrder.drafts).toEqual(reverseOrder.drafts)
    expect(naturalOrder.drafts[0]).toEqual(
      expect.objectContaining({
        notes: 'Review wins',
        progress: 'Vista el 2026-01-04',
        rating: 9,
        status: 'completed',
      }),
    )
  })

  it('ignores non-official Letterboxd CSV names that only share suffixes', () => {
    const zipBytes = zipSync({
      'letterboxd/unwatched.csv': strToU8(
        'Date,Name,Year,Letterboxd URI\n2026-01-01,Should Not Import,2026,https://letterboxd.com/film/should-not-import/\n',
      ),
    })

    const result = parseLetterboxdZipBytes(zipBytes)

    expect(result.drafts).toEqual([])
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'parse' })])
  })

  it('rejects oversized Goodreads CSV files before reading them', async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'goodreads-too-large.csv', { type: 'text/csv' })

    await expect(importGoodreadsCsv(file)).rejects.toThrow('El CSV de Goodreads supera el limite de 10 MB.')
  })

  it('keeps preview IDs unique when duplicate drafts already hit the max ID length', () => {
    const draft: ImportedLibraryItemDraft = {
      sourceId: 'goodreads',
      sourceItemId: 'same-book',
      title: 'A'.repeat(180),
      type: 'book',
      status: 'completed',
      genres: [],
      tags: ['Goodreads'],
      moodTags: [],
    }

    const preview = buildImportPreview({ sourceId: 'goodreads', warnings: [], drafts: [draft, { ...draft }] }, [])
    const previewIds = preview.items.map((item) => item.id)

    expect(previewIds).toHaveLength(2)
    expect(new Set(previewIds).size).toBe(2)
    expect(previewIds[0]).toHaveLength(120)
    expect(previewIds[1]).toHaveLength(120)
    expect(previewIds[1]).toMatch(/-2$/)
    expect(preview.duplicateItems).toBe(1)
  })

  it('marks duplicates inside the same preview by external refs and title type year', () => {
    const duplicateIsbn = parseGoodreadsCsv(
      [
        'Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Bookshelves,Original Publication Year,My Review',
        '100,Duplicate ISBN One,Author A,9780000000001,0,to-read,,2020,',
        '101,Duplicate ISBN Two,Author B,9780000000001,0,to-read,,2021,',
      ].join('\n'),
    )
    const duplicateTitle = parseGoodreadsCsv(
      [
        'Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Bookshelves,Original Publication Year,My Review',
        '200,Same Title Same Year,Author A,9780000000002,0,to-read,,2020,',
        '201,Same Title Same Year,Author B,9780000000003,0,to-read,,2020,',
      ].join('\n'),
    )

    const isbnPreview = buildImportPreview(duplicateIsbn, [])
    const titlePreview = buildImportPreview(duplicateTitle, [])

    expect(isbnPreview.items[1]).toEqual(
      expect.objectContaining({
        duplicateOfId: isbnPreview.items[0].id,
        duplicateReason: 'externalRefs',
      }),
    )
    expect(titlePreview.items[1]).toEqual(
      expect.objectContaining({
        duplicateOfId: titlePreview.items[0].id,
        duplicateReason: 'titleTypeYear',
      }),
    )
  })

  it('matches import duplicates when external refs use harmless formatting differences', () => {
    const existingBook = {
      ...currentItem,
      externalRefs: { isbn: '978-0-441-47812-5' },
    }
    const result = parseGoodreadsCsv(
      [
        'Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Bookshelves,Original Publication Year,My Review',
        '42,The Left Hand of Darkness,Ursula K. Le Guin,9780441478125,5,read,sci-fi,1969,',
        '43,The Left Hand of Darkness,Ursula K. Le Guin,978-0-441-47812-5,5,read,sci-fi,1969,',
      ].join('\n'),
    )

    const preview = buildImportPreview(result, [existingBook])

    expect(preview.duplicateItems).toBe(2)
    expect(preview.items[0]).toEqual(expect.objectContaining({ duplicateOfId: 'book-left-hand', duplicateReason: 'externalRefs' }))
    expect(preview.items[1]).toEqual(expect.objectContaining({ duplicateOfId: 'book-left-hand', duplicateReason: 'externalRefs' }))
  })

  it('previews duplicates by external refs before import and exposes all new rows for import-all', () => {
    const result = parseGoodreadsCsv(
      [
        'Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Bookshelves,Original Publication Year,My Review',
        '42,The Left Hand of Darkness,Ursula K. Le Guin,9780441478125,5,read,sci-fi,1969,',
        '99,A Psalm for the Wild-Built,Becky Chambers,9781250236210,4,to-read,hopepunk,2021,',
      ].join('\n'),
    )

    const preview = buildImportPreview(result, [currentItem])
    const newItems = getImportPreviewNewItems(preview)
    const listItems = importPreviewItemsToListItems(newItems, '2026-06-13T00:00:00.000Z')

    expect(preview).toEqual(
      expect.objectContaining({
        duplicateItems: 1,
        newItems: 1,
        invalidItems: 0,
      }),
    )
    expect(preview.items[0]).toEqual(expect.objectContaining({ duplicateOfId: 'book-left-hand', duplicateReason: 'externalRefs' }))
    expect(newItems).toEqual([expect.objectContaining({ draft: expect.objectContaining({ title: 'A Psalm for the Wild-Built' }) })])
    expect(listItems).toHaveLength(1)
    expect(listItems[0]).toEqual(
      expect.objectContaining({
        title: 'A Psalm for the Wild-Built',
        source: 'external',
        status: 'wishlist',
        importNotes: expect.arrayContaining(['Importado desde Goodreads', 'Ano: 2021']),
      }),
    )
  })

  it('keeps every new valid preview row selectable even beyond the render page size', () => {
    const rows = Array.from({ length: 85 }, (_, index) => {
      const rowNumber = String(index + 1).padStart(3, '0')
      return `${9000 + index},Service Import All Probe ${rowNumber},Test Author,,0,read,,2026,`
    })
    const result = parseGoodreadsCsv(
      ['Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Bookshelves,Original Publication Year,My Review', ...rows].join('\n'),
    )
    const preview = buildImportPreview(result, [])

    expect(preview.items).toHaveLength(85)
    expect(getImportPreviewNewItems(preview)).toHaveLength(85)
  })

  it('does not match title duplicates across different known years', () => {
    const preview = buildImportPreview(
      {
        sourceId: 'letterboxd',
        warnings: [],
        drafts: [
          {
            sourceId: 'letterboxd',
            sourceItemId: 'little-women-2019',
            title: 'Little Women',
            type: 'movie',
            status: 'completed',
            genres: [],
            tags: ['Letterboxd'],
            moodTags: [],
            releaseYear: 2019,
          },
        ],
      },
      [
        {
          ...currentItem,
          id: 'movie-little-women-1994',
          title: 'Little Women',
          type: 'movie',
          externalRefs: {},
          publicSnapshot: {
            id: 'movie-little-women-1994',
            title: 'Little Women',
            type: 'movie',
            releaseYear: 1994,
            genres: [],
            tags: [],
            moodTags: [],
            externalRefs: {},
            canonicalKey: 'movie:little women',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
    )

    expect(preview.duplicateItems).toBe(0)
    expect(preview.newItems).toBe(1)
  })

  it('imports AniList public collections for anime, manga and manhwa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: FetchInput, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body))
        const type = requestBody.variables.type
        const entries =
          type === 'ANIME'
            ? [
                {
                  status: 'CURRENT',
                  score: 86,
                  progress: 7,
                  media: {
                    id: 21,
                    idMal: 21,
                    type: 'ANIME',
                    format: 'TV',
                    siteUrl: 'https://anilist.co/anime/21',
                    episodes: 1000,
                    title: { userPreferred: 'One Piece' },
                    startDate: { year: 1999 },
                    coverImage: { large: 'https://img.anili.st/media/21.jpg' },
                    genres: ['Adventure'],
                  },
                },
              ]
            : [
                {
                  status: 'PLANNING',
                  score: 0,
                  media: {
                    id: 119257,
                    type: 'MANGA',
                    format: 'MANGA',
                    countryOfOrigin: 'KR',
                    siteUrl: 'https://anilist.co/manga/119257',
                    title: { english: 'Omniscient Reader' },
                    startDate: { year: 2020 },
                    coverImage: { large: 'https://img.anili.st/media/119257.jpg' },
                    genres: ['Action'],
                  },
                },
              ]

        return new Response(JSON.stringify({ data: { MediaListCollection: { lists: [{ entries }] } } }), {
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    const result = await importAniListLibrary('https://anilist.co/user/fran/')

    expect(result.drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'One Piece',
          type: 'anime',
          status: 'in_progress',
          rating: 8.6,
          progressCurrent: 7,
          progressTotal: 1000,
          progressUnit: 'episodes',
        }),
        expect.objectContaining({ title: 'Omniscient Reader', type: 'manhwa', status: 'wishlist' }),
      ]),
    )
  })

  it('imports MyAnimeList public lists through Jikan as best effort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: FetchInput) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        const data = url.pathname.endsWith('/animelist')
          ? [
              {
                status: 'Watching',
                score: 8,
                episodes_watched: 3,
                anime: {
                  mal_id: 5114,
                  title: 'Fullmetal Alchemist: Brotherhood',
                  type: 'TV',
                  episodes: 64,
                  year: 2009,
                  url: 'https://myanimelist.net/anime/5114',
                  images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/1208/94745.jpg' } },
                  genres: [{ name: 'Action' }],
                },
              },
            ]
          : [
              {
                status: 'Plan to Read',
                score: 0,
                manga: {
                  mal_id: 132214,
                  title: "Omniscient Reader's Viewpoint",
                  type: 'Manhwa',
                  published: { from: '2020-05-26' },
                  url: 'https://myanimelist.net/manga/132214',
                  images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/1/132214.jpg' } },
                  genres: [{ name: 'Action' }],
                },
              },
            ]

        return new Response(JSON.stringify({ data, pagination: { has_next_page: false } }), {
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    const result = await importMyAnimeListLibrary('https://myanimelist.net/profile/fran')

    expect(result.warnings[0]).toEqual(expect.objectContaining({ code: 'partial' }))
    expect(result.drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Fullmetal Alchemist: Brotherhood',
          type: 'anime',
          status: 'in_progress',
          progressCurrent: 3,
          progressTotal: 64,
          progressUnit: 'episodes',
        }),
        expect.objectContaining({ title: "Omniscient Reader's Viewpoint", type: 'manhwa', status: 'wishlist', releaseYear: 2020 }),
      ]),
    )
  })

  it('warns when Jikan still has more pages after the import page limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], pagination: { has_next_page: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    const result = await importMyAnimeListLibrary('very-long-list')

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'partial',
          message: 'Jikan tiene mas de 20 paginas en animelist; se importaron solo las primeras 20.',
        }),
        expect.objectContaining({
          code: 'partial',
          message: 'Jikan tiene mas de 20 paginas en mangalist; se importaron solo las primeras 20.',
        }),
      ]),
    )
  })
})
