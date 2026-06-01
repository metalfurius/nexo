import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoveryCandidate } from '../domain/types'
import { useLibrary } from './useLibrary'

const repositoryMock = vi.hoisted(() => ({
  archivePublicItem: vi.fn(),
  deleteAllItems: vi.fn(),
  deleteItem: vi.fn(),
  dismissDiscoveryCandidate: vi.fn(),
  ensureUserProfile: vi.fn(),
  markDiscoveryCandidateSaved: vi.fn(),
  recordRecommendation: vi.fn(),
  saveDiscoveryCandidate: vi.fn(),
  saveItem: vi.fn(),
  saveSettings: vi.fn(),
  searchExternal: vi.fn(),
  searchPublicCatalog: vi.fn(),
  setStatus: vi.fn(),
  snoozeRecommendation: vi.fn(),
  subscribeDiscoveryCandidates: vi.fn(),
  subscribeItems: vi.fn(),
  subscribeSettings: vi.fn(),
  subscribeUserProfile: vi.fn(),
  upsertPublicItem: vi.fn(),
}))

vi.mock('../services/libraryRepository', () => ({
  createFirestoreRepository: vi.fn(() => repositoryMock),
}))

const candidate: DiscoveryCandidate = {
  id: 'public-book-odisea',
  title: 'Odisea',
  type: 'book',
  status: 'queued',
  origin: 'publicCatalog',
  source: 'nexo',
  sourceId: 'book-odisea',
  genres: ['clasico'],
  tags: ['epico'],
  moodTags: [],
  externalRefs: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('useLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repositoryMock.ensureUserProfile.mockResolvedValue(undefined)
    repositoryMock.saveDiscoveryCandidate.mockResolvedValue(undefined)
    repositoryMock.subscribeItems.mockImplementation((onItems: (items: unknown[]) => void) => {
      onItems([])
      return vi.fn()
    })
    repositoryMock.subscribeUserProfile.mockImplementation((onProfile: (profile: unknown) => void) => {
      onProfile({ role: 'user' })
      return vi.fn()
    })
    repositoryMock.subscribeSettings.mockImplementation((onSettings: (settings: unknown) => void) => {
      onSettings({})
      return vi.fn()
    })
    repositoryMock.subscribeDiscoveryCandidates.mockImplementation((onCandidates: (candidates: unknown[]) => void) => {
      onCandidates([])
      return vi.fn()
    })
  })

  it('persists queued discovery candidates for signed-in users', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await act(async () => {
      await result.current.queueDiscoveryCandidates([candidate])
    })

    expect(repositoryMock.saveDiscoveryCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'public-book-odisea',
        status: 'queued',
        title: 'Odisea',
      }),
    )
    expect(result.current.discoveryCandidates).toEqual([
      expect.objectContaining({
        id: 'public-book-odisea',
        title: 'Odisea',
      }),
    ])
  })
})
