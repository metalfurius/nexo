import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import {
  createLibraryExportPayload,
  getLibraryImportRollbackPlan,
  getLibraryImportSummary,
  parseLibraryImportPayload,
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
    const payload = createLibraryExportPayload([baseItem], DEFAULT_SETTINGS, '2026-01-02T00:00:00.000Z')

    expect(payload.schemaVersion).toBe(1)
    expect(payload.exportedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(payload.items).toEqual([baseItem])
    expect(payload.settings.theme).toBe('dark')
    expect(payload.settings.libraryViewMode).toBe('cards')
  })

  it('parses a valid export and stamps imported items as updated now', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload([baseItem], DEFAULT_SETTINGS, '2026-01-02T00:00:00.000Z'),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toEqual(expect.objectContaining({ title: 'Outer Wilds', updatedAt: '2026-01-03T00:00:00.000Z' }))
    expect(parsed.settings?.explorerDefaultType).toBe('watch')
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
})
