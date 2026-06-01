import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import { createLibraryExportPayload, parseLibraryImportPayload } from './libraryBackup'

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
  })

  it('parses a valid export and stamps imported items as updated now', () => {
    const parsed = parseLibraryImportPayload(
      createLibraryExportPayload([baseItem], DEFAULT_SETTINGS, '2026-01-02T00:00:00.000Z'),
      '2026-01-03T00:00:00.000Z',
    )

    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toEqual(expect.objectContaining({ title: 'Outer Wilds', updatedAt: '2026-01-03T00:00:00.000Z' }))
    expect(parsed.settings?.explorerDefaultType).toBe('watch')
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
