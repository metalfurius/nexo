import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import {
  assertLibraryImportFileLimit,
  createLibraryExportPayload,
  getLibraryImportRollbackPlan,
  getLibraryImportSummary,
  parseLibraryImportPayload,
  LIBRARY_IMPORT_MAX_FILE_BYTES,
  LIBRARY_IMPORT_MAX_ITEMS,
} from './libraryBackup'

const baseItem: ListItem = {
  id: 'game-outer-wilds',
  title: 'Outer Wilds',
  type: 'game',
  status: 'wishlist',
  genres: ['misterio'],
  tags: ['sci-fi'],
  moodTags: [],
  weights: DEFAULT_WEIGHTS,
  source: 'manual',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('library backup schema', () => {
  it('creates a versioned export payload with items and settings', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      roadmap: { now: [], next: ['game-outer-wilds'], later: [], hidden: [] },
    }
    const payload = createLibraryExportPayload([baseItem], settings, '2026-01-02T00:00:00.000Z')

    expect(payload.schemaVersion).toBe(1)
    expect(payload.exportedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(payload.items).toEqual([baseItem])
    const exportedSettings = payload.settings!
    expect(exportedSettings.theme).toBe('dark')
    expect(exportedSettings.libraryViewMode).toBe('mosaic')
    expect(exportedSettings.libraryCardsPerRow).toBe(4)
    expect(exportedSettings.roadmap).toEqual(settings.roadmap)
    expect(exportedSettings).not.toBe(settings)
    expect(exportedSettings.roadmap).not.toBe(settings.roadmap)
    expect(exportedSettings.roadmap.next).not.toBe(settings.roadmap.next)
  })

  it('creates a scoped export payload without private settings', () => {
    const payload = createLibraryExportPayload([baseItem], undefined, '2026-01-02T00:00:00.000Z')

    expect(payload.schemaVersion).toBe(1)
    expect(payload.exportedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(payload.items).toEqual([baseItem])
    expect(payload.settings).toBeUndefined()
  })

  it('parses a valid export and stamps imported items as updated now', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload([baseItem], DEFAULT_SETTINGS, '2026-01-02T00:00:00.000Z'),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toEqual(expect.objectContaining({ title: 'Outer Wilds', updatedAt: '2026-01-03T00:00:00.000Z' }))
    expect(parsed.settings?.explorerDefaultType).toBe('watch')
    expect(parsed.settings?.libraryViewMode).toBe('mosaic')
    expect(parsed.settings?.libraryCardsPerRow).toBe(4)
    expect(parsed.settings?.roadmap).toEqual({ now: [], next: [], later: [], hidden: [] })
  })

  it('preserves and normalizes an additive roadmap in schemaVersion 1 backups', () => {
    const parsed = parseLibraryImportPayload(
      {
        schemaVersion: 1,
        exportedAt: '2026-01-02T00:00:00.000Z',
        items: [
          baseItem,
          { ...baseItem, id: 'book-solaris', title: 'Solaris', type: 'book' },
          { ...baseItem, id: 'book-done', title: 'Done', type: 'book', status: 'completed' },
        ],
        settings: {
          ...DEFAULT_SETTINGS,
          roadmap: {
            hidden: ['game-outer-wilds'],
            now: ['game-outer-wilds', 'missing'],
            next: ['book-solaris', 'book-solaris'],
            later: ['book-done'],
          },
        },
      },
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.settings?.roadmap).toEqual({
      hidden: ['game-outer-wilds'],
      now: [],
      next: ['book-solaris'],
      later: [],
    })
  })

  it('preserves every supported external ref when parsing backups', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload(
        [
          {
            ...baseItem,
            externalRefs: {
              anilistId: '1',
              googleBooksId: 'gb-1',
              goodreadsBookId: 'gr-1',
              isbn: '9780000000001',
              kitsuId: 'kitsu-1',
              letterboxdSlug: 'arrival-2016',
              malId: 'mal-1',
              mangaDexId: 'mangadex-1',
              openLibraryKey: '/works/OL1W',
              rawgId: 'rawg-1',
              sourceUrl: 'https://example.test/item',
              tmdbId: 'tmdb-1',
              wikidataId: 'Q1',
            },
          },
        ],
        undefined,
        '2026-01-02T00:00:00.000Z',
      ),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.items[0].externalRefs).toEqual({
      anilistId: '1',
      googleBooksId: 'gb-1',
      goodreadsBookId: 'gr-1',
      isbn: '9780000000001',
      kitsuId: 'kitsu-1',
      letterboxdSlug: 'arrival-2016',
      malId: 'mal-1',
      mangaDexId: 'mangadex-1',
      openLibraryKey: '/works/OL1W',
      rawgId: 'rawg-1',
      sourceUrl: 'https://example.test/item',
      tmdbId: 'tmdb-1',
      wikidataId: 'Q1',
    })
  })

  it('preserves structured progress and drops legacy related references when parsing backups', () => {
    const parsed = parseLibraryImportPayload(
      {
        schemaVersion: 1,
        exportedAt: '2026-01-02T00:00:00.000Z',
        items: [
          {
            ...baseItem,
            progressCurrent: 3,
            progressTotal: 12,
            progressUnit: 'episodes',
            publicSnapshot: {
              id: 'anime-cyberpunk-edgerunners',
              title: 'Cyberpunk: Edgerunners',
              type: 'anime',
              progressTotal: 10,
              progressUnit: 'episodes',
              genres: [],
              tags: [],
              moodTags: [],
              externalRefs: {},
              relatedItems: [
                {
                  title: 'Cyberpunk 2077',
                  type: 'game',
                  relation: 'source',
                  source: 'rawg',
                  sourceId: '41494',
                },
              ],
              canonicalKey: 'anime:cyberpunk edgerunners',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            relatedItems: [
              {
                title: 'Cyberpunk 2077',
                type: 'game',
                relation: 'source',
                source: 'rawg',
                sourceId: '41494',
              },
            ],
          },
        ],
      },
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.items[0]).toEqual(
      expect.objectContaining({
        progressCurrent: 3,
        progressTotal: 12,
        progressUnit: 'episodes',
      }),
    )
    expect('relatedItems' in parsed.items[0]).toBe(false)
    expect('relatedItems' in (parsed.items[0].publicSnapshot ?? {})).toBe(false)
  })

  it('keeps a library card density preference from exported settings', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload(
        [baseItem],
        { ...DEFAULT_SETTINGS, libraryCardsPerRow: 6 },
        '2026-01-02T00:00:00.000Z',
      ),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.settings?.libraryCardsPerRow).toBe(6)
  })

  it('keeps a cards view preference from exported settings', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload(
        [baseItem],
        { ...DEFAULT_SETTINGS, libraryViewMode: 'cards' },
        '2026-01-02T00:00:00.000Z',
      ),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.settings?.libraryViewMode).toBe('cards')
  })

  it('keeps a list view preference from exported settings', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload(
        [baseItem],
        { ...DEFAULT_SETTINGS, libraryViewMode: 'list' },
        '2026-01-02T00:00:00.000Z',
      ),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.settings?.libraryViewMode).toBe('list')
  })

  it('keeps a custom color theme from exported settings', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload(
        [baseItem],
        { ...DEFAULT_SETTINGS, theme: 'rose' },
        '2026-01-02T00:00:00.000Z',
      ),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.settings?.theme).toBe('rose')
  })

  it('summarizes backup imports against the current library before applying them', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload(
        [
          baseItem,
          { ...baseItem, id: 'book-solaris', title: 'Solaris', type: 'book' },
          { ...baseItem, id: 'book-solaris', title: 'Solaris duplicate', type: 'book' },
        ],
        DEFAULT_SETTINGS,
        '2026-01-02T00:00:00.000Z',
      ),
      '2026-01-03T00:00:00.000Z',
    )

    expect(getLibraryImportSummary(parsed, [baseItem])).toEqual({
      totalItems: 3,
      newItems: 1,
      updatedItems: 1,
      duplicateItems: 1,
      settingsIncluded: true,
    })
  })

  it('builds rollback plans for new items, overwritten items and imported settings', () => {
    const currentSettings = { ...DEFAULT_SETTINGS, favoriteTags: ['actual'], recommendationPreferences: { ...DEFAULT_SETTINGS.recommendationPreferences } }
    const overwritten = { ...baseItem, title: 'Outer Wilds before import', tags: ['before'] }
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload(
        [
          { ...baseItem, title: 'Outer Wilds imported', tags: ['after'] },
          { ...baseItem, id: 'book-solaris', title: 'Solaris', type: 'book' },
          { ...baseItem, id: 'book-solaris', title: 'Solaris duplicate', type: 'book' },
        ],
        { ...DEFAULT_SETTINGS, favoriteTags: ['imported'] },
        '2026-01-02T00:00:00.000Z',
      ),
      '2026-01-03T00:00:00.000Z',
    )

    const rollback = getLibraryImportRollbackPlan(parsed, [overwritten], currentSettings)

    expect(rollback.newItemIds).toEqual(['book-solaris'])
    expect(rollback.previousItems).toEqual([overwritten])
    expect(rollback.previousItems[0]).not.toBe(overwritten)
    expect(rollback.previousItems[0].tags).not.toBe(overwritten.tags)
    expect(rollback.previousSettings).toEqual(currentSettings)
    expect(rollback.previousSettings).not.toBe(currentSettings)
    expect(rollback.previousSettings?.favoriteTags).not.toBe(currentSettings.favoriteTags)
    expect(rollback.previousSettings?.roadmap).not.toBe(currentSettings.roadmap)
    expect(rollback.previousSettings?.roadmap.now).not.toBe(currentSettings.roadmap.now)
  })

  it('normalizes missing optional arrays and weights from older backups', () => {
    const parsed = parseLibraryImportPayload(
      {
        schemaVersion: 1,
        exportedAt: '2026-01-02T00:00:00.000Z',
        items: [
          {
            title: 'Solaris',
            type: 'book',
            status: 'wishlist',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.items[0]).toEqual(
      expect.objectContaining({
        id: 'book-solaris',
        genres: [],
        tags: [],
        moodTags: [],
        weights: DEFAULT_WEIGHTS,
        source: 'manual',
      }),
    )
  })

  it('rejects unsupported schema versions and invalid item types', () => {
    expect(() => parseLibraryImportPayload({ schemaVersion: 99, items: [] })).toThrow('Version de export no soportada')
    expect(() =>
      parseLibraryImportPayload({
        schemaVersion: 1,
        items: [{ title: 'Broken', type: 'boardgame', status: 'wishlist' }],
      }),
    ).toThrow('tipo no soportado')
  })

  it('rejects oversized backups and item collections before normalizing entries', () => {
    expect(() => assertLibraryImportFileLimit({ size: LIBRARY_IMPORT_MAX_FILE_BYTES + 1 })).toThrow(
      'El backup JSON supera el limite de 10 MB.',
    )
    expect(() =>
      parseLibraryImportPayload({
        schemaVersion: 1,
        items: Array.from({ length: LIBRARY_IMPORT_MAX_ITEMS + 1 }, () => null),
      }),
    ).toThrow('La importacion supera el limite de 5.000 entradas.')
  })
})
