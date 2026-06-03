import { act, renderHook, waitFor } from '@testing-library/react'
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
  restoreDiscoveryCandidate: vi.fn(),
  restorePublicItem: vi.fn(),
  saveDiscoveryCandidate: vi.fn(),
  saveItem: vi.fn(),
  saveSettings: vi.fn(),
  searchExternal: vi.fn(),
  searchPublicCatalog: vi.fn(),
  setStatus: vi.fn(),
  snoozeRecommendation: vi.fn(),
  reactivateRecommendation: vi.fn(),
  subscribeDiscoveryCandidates: vi.fn(),
  subscribeItems: vi.fn(),
  subscribeSettings: vi.fn(),
  subscribeUserProfile: vi.fn(),
  subscribeUserProfiles: vi.fn(),
  updateUserRole: vi.fn(),
  upsertPublicItem: vi.fn(),
}))

vi.mock('../services/libraryRepository', () => ({
  createFirestoreRepository: vi.fn(() => repositoryMock),
}))

vi.mock('../services/firebaseConfig', () => ({
  isFirebaseConfigured: true,
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
    repositoryMock.updateUserRole.mockResolvedValue(undefined)
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
    repositoryMock.subscribeUserProfiles.mockImplementation((onProfiles: (profiles: unknown[]) => void) => {
      onProfiles([])
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

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    let queuedCount = 0
    await act(async () => {
      queuedCount = await result.current.queueDiscoveryCandidates([candidate])
    })

    expect(queuedCount).toBe(1)
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

  it('delegates recommendation runs to the signed-in repository', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.recordRecommendation('movie-arrival', ['encaja'])
    })

    expect(repositoryMock.recordRecommendation).toHaveBeenCalledWith('movie-arrival', ['encaja'])
  })

  it('delegates recommendation snoozes to the signed-in repository', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.snoozeRecommendation('game-outer-wilds')
    })

    expect(repositoryMock.snoozeRecommendation).toHaveBeenCalledWith('game-outer-wilds')
  })

  it('delegates recommendation reactivations to the signed-in repository', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.reactivateRecommendation('game-outer-wilds')
    })

    expect(repositoryMock.reactivateRecommendation).toHaveBeenCalledWith('game-outer-wilds')
  })

  it('does not requeue discovery candidates already saved by the user', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    let queuedCount = 0
    await act(async () => {
      queuedCount = await result.current.queueDiscoveryCandidates([candidate])
    })
    expect(queuedCount).toBe(1)

    await act(async () => {
      await result.current.saveDiscoveryToLibrary(candidate)
    })

    await waitFor(() =>
      expect(result.current.discoveryCandidates[0]).toEqual(
        expect.objectContaining({
          id: 'public-book-odisea',
          status: 'saved',
        }),
      ),
    )

    await act(async () => {
      queuedCount = await result.current.queueDiscoveryCandidates([{ ...candidate, updatedAt: '2026-01-04T00:00:00.000Z' }])
    })

    expect(queuedCount).toBe(0)
    expect(result.current.discoveryCandidates[0]).toEqual(
      expect.objectContaining({
        id: 'public-book-odisea',
        status: 'saved',
      }),
    )
    expect(repositoryMock.saveDiscoveryCandidate).toHaveBeenCalledTimes(1)
  })

  it('restores dismissed discovery candidates back to the queue', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.queueDiscoveryCandidates([candidate])
      await result.current.dismissDiscoveryCandidate(candidate.id)
      await result.current.restoreDiscoveryCandidate(candidate.id)
    })

    expect(result.current.discoveryCandidates[0]).toEqual(
      expect.objectContaining({
        id: 'public-book-odisea',
        status: 'queued',
      }),
    )
    expect(result.current.discoveryCandidates[0].dismissedAt).toBeUndefined()
    expect(result.current.discoveryCandidates[0].savedItemId).toBeUndefined()
    expect(repositoryMock.restoreDiscoveryCandidate).toHaveBeenCalledWith('public-book-odisea')
  })

  it('delegates public item restoration to the signed-in repository', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.restorePublicItem('book-solaris')
    })

    expect(repositoryMock.restorePublicItem).toHaveBeenCalledWith('book-solaris')
  })

  it('loads user profiles and delegates role updates for admins', async () => {
    repositoryMock.subscribeUserProfile.mockImplementation((onProfile: (profile: unknown) => void) => {
      onProfile({ role: 'admin' })
      return vi.fn()
    })
    repositoryMock.subscribeUserProfiles.mockImplementation((onProfiles: (profiles: unknown[]) => void) => {
      onProfiles([
        {
          uid: 'user-1',
          role: 'user',
          email: 'fran@example.com',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ])
      return vi.fn()
    })

    const user = {
      uid: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Admin',
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeUserProfiles).toHaveBeenCalled())

    expect(result.current.userProfiles).toEqual([
      expect.objectContaining({
        uid: 'user-1',
        role: 'user',
      }),
    ])

    await act(async () => {
      await result.current.updateUserRole('user-1', 'moderator')
    })

    expect(repositoryMock.updateUserRole).toHaveBeenCalledWith('user-1', 'moderator')
  })
})
