import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import type { LibraryImportRollbackPlan } from './libraryBackup'
import {
  activateLibraryImportRollbackOwner,
  clearLibraryImportRollback,
  persistLibraryImportRollback,
  readLibraryImportRollback,
} from './libraryImportRollbackStore'

const previousItem: ListItem = {
  id: 'book-solaris',
  title: 'Solaris',
  type: 'book',
  status: 'wishlist',
  genres: ['Science Fiction'],
  tags: ['clasico'],
  moodTags: [],
  weights: DEFAULT_WEIGHTS,
  source: 'manual',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const rollbackPlan: LibraryImportRollbackPlan = {
  newItemIds: ['book-new'],
  previousItems: [previousItem],
  previousSettings: {
    ...DEFAULT_SETTINGS,
    favoriteTags: ['antes'],
    roadmap: { now: ['book-solaris'], next: ['book-new'], later: [], hidden: [] },
  },
}

describe('library import rollback session store', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('restores a normalized rollback after reload for the same UID and scope', () => {
    persistLibraryImportRollback('backup', 'uid-a', rollbackPlan)

    const restored = readLibraryImportRollback('backup', 'uid-a')

    expect(restored).toEqual(
      expect.objectContaining({
        newItemIds: rollbackPlan.newItemIds,
        previousItems: [expect.objectContaining(previousItem)],
        previousSettings: rollbackPlan.previousSettings,
      }),
    )
    expect(restored).not.toBe(rollbackPlan)
    expect(restored?.previousItems[0]).not.toBe(previousItem)
    expect(restored?.previousSettings?.roadmap).toEqual(rollbackPlan.previousSettings?.roadmap)
  })

  it('keeps backup and service rollback plans independent', () => {
    persistLibraryImportRollback('backup', 'uid-a', rollbackPlan)
    persistLibraryImportRollback('service', 'uid-a', { newItemIds: ['movie-arrival'], previousItems: [] })

    clearLibraryImportRollback('backup', 'uid-a')

    expect(readLibraryImportRollback('backup', 'uid-a')).toBeUndefined()
    expect(readLibraryImportRollback('service', 'uid-a')?.newItemIds).toEqual(['movie-arrival'])
  })

  it('clears every rollback from the previous UID without exposing it to the next account', () => {
    persistLibraryImportRollback('backup', 'uid-a', rollbackPlan)
    persistLibraryImportRollback('service', 'uid-a', rollbackPlan)

    activateLibraryImportRollbackOwner('uid-b')

    const keys = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index))
    expect(keys.some((key) => key?.includes('uid-a'))).toBe(false)
    expect(readLibraryImportRollback('backup', 'uid-b')).toBeUndefined()
    expect(readLibraryImportRollback('service', 'uid-b')).toBeUndefined()
  })

  it('drops corrupt persisted data instead of applying it', () => {
    persistLibraryImportRollback('service', 'uid-a', rollbackPlan)
    const rollbackKey = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index))
      .find((key) => key?.includes(':service:'))
    expect(rollbackKey).toBeTruthy()
    window.sessionStorage.setItem(rollbackKey!, '{"schemaVersion":1,"plan":{"newItemIds":[42]}}')

    expect(readLibraryImportRollback('service', 'uid-a')).toBeUndefined()
    expect(window.sessionStorage.getItem(rollbackKey!)).toBeNull()
  })
})
