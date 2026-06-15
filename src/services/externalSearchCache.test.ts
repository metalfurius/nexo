import { describe, expect, it } from 'vitest'
import type { ExternalCandidate } from '../domain/types'
import {
  createExternalSearchCacheEntry,
  createExternalSearchCacheKey,
  isExternalSearchCacheFresh,
} from './externalSearchCache'

const candidate: ExternalCandidate = {
  id: 'anilist-1',
  title: 'Cyberpunk: Edgerunners',
  type: 'anime',
  source: 'anilist',
  sourceId: '1',
  genres: ['Action'],
  externalRefs: { anilistId: '1' },
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('external search cache', () => {
  it('normalizes cache keys by type and query', () => {
    expect(createExternalSearchCacheKey('  Cyberpunk: Edgerunners  ', 'anime')).toBe(
      createExternalSearchCacheKey('cyberpunk edgerunners', 'anime'),
    )
    expect(createExternalSearchCacheKey('Cyberpunk Edgerunners', 'series')).not.toBe(
      createExternalSearchCacheKey('Cyberpunk Edgerunners', 'anime'),
    )
  })

  it('marks entries fresh until the seven day ttl expires', () => {
    const now = Date.UTC(2026, 0, 1)
    const entry = createExternalSearchCacheEntry('Cyberpunk', 'anime', [candidate], now)

    expect(entry.results).toEqual([candidate])
    expect(isExternalSearchCacheFresh(entry, now + 7 * 24 * 60 * 60 * 1000 - 1)).toBe(true)
    expect(isExternalSearchCacheFresh(entry, now + 7 * 24 * 60 * 60 * 1000)).toBe(false)
  })
})
