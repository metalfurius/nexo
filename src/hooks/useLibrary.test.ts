import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityEntry, DiscoveryCandidate, ListItem } from '../domain/types'
import { useLibrary } from './useLibrary'

const repositoryMock = vi.hoisted(() => ({
  archivePublicItem: vi.fn(),
  deleteAllItems: vi.fn(),
  deleteItem: vi.fn(),
  dismissDiscoveryCandidate: vi.fn(),
  ensureUserProfile: vi.fn(),
  listPublicCatalog: vi.fn(),
  markDiscoveryCandidateSaved: vi.fn(),
  recordDiscoverySaveToPublicCatalog: vi.fn(),
  recordImportedItemToPublicCatalog: vi.fn(),
  recordRecommendation: vi.fn(),
  replacePublicItem: vi.fn(),
  restoreDiscoveryCandidate: vi.fn(),
  restorePublicItem: vi.fn(),
  clearActivityEntries: vi.fn(),
  saveActivityEntry: vi.fn(),
  saveDiscoveryCandidate: vi.fn(),
  saveItem: vi.fn(),
  saveSettings: vi.fn(),
  searchExternal: vi.fn(),
  searchCatalog: vi.fn(),
  searchPublicCatalog: vi.fn(),
  setRecommendationCooldown: vi.fn(),
  setStatus: vi.fn(),
  snoozeRecommendation: vi.fn(),
  reactivateRecommendation: vi.fn(),
  subscribeDiscoveryCandidates: vi.fn(),
  subscribeActivityEntries: vi.fn(),
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
    for (const method of [
      'archivePublicItem',
      'deleteAllItems',
      'deleteItem',
      'dismissDiscoveryCandidate',
      'markDiscoveryCandidateSaved',
      'recordDiscoverySaveToPublicCatalog',
      'recordImportedItemToPublicCatalog',
      'recordRecommendation',
      'replacePublicItem',
      'restoreDiscoveryCandidate',
      'restorePublicItem',
      'reactivateRecommendation',
      'saveItem',
      'saveSettings',
      'setRecommendationCooldown',
      'setStatus',
      'snoozeRecommendation',
      'searchCatalog',
      'upsertPublicItem',
    ] as const) {
      repositoryMock[method].mockResolvedValue(undefined)
    }
    repositoryMock.ensureUserProfile.mockResolvedValue(undefined)
    repositoryMock.clearActivityEntries.mockResolvedValue(undefined)
    repositoryMock.saveActivityEntry.mockResolvedValue(undefined)
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
    repositoryMock.subscribeActivityEntries.mockImplementation((onEntries: (entries: unknown[]) => void) => {
      onEntries([])
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

  it('delegates unified catalog search for signed-in users', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    repositoryMock.searchCatalog.mockResolvedValueOnce([candidate])
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    const catalogResults = await result.current.searchCatalog('Odisea', 'book')

    expect(repositoryMock.searchCatalog).toHaveBeenCalledWith('Odisea', 'book')
    expect(catalogResults).toEqual([candidate])
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

  it('delegates exact recommendation cooldown restores to the signed-in repository', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.setRecommendationCooldown('game-outer-wilds', '2026-06-04T12:00:00.000Z')
    })

    expect(repositoryMock.setRecommendationCooldown).toHaveBeenCalledWith(
      'game-outer-wilds',
      '2026-06-04T12:00:00.000Z',
    )
  })

  it('exposes snapshot sync metadata for signed-in libraries', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    repositoryMock.subscribeItems.mockImplementation((onItems: (items: unknown[], state?: unknown) => void) => {
      onItems([], { fromCache: true, hasPendingWrites: true, pendingWriteCount: 2 })
      return vi.fn()
    })
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(result.current.syncState.fromCache).toBe(true))

    expect(result.current.syncState).toEqual(
      expect.objectContaining({
        fromCache: true,
        hasPendingWrites: true,
        pendingWriteCount: 2,
        remote: true,
      }),
    )
  })

  it('shows optimistic saved items while Firestore writes are still pending', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    let resolveWrite: (() => void) | undefined
    repositoryMock.saveItem.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWrite = resolve
      }),
    )
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = result.current.saveItem({
        id: 'movie-arrival',
        title: 'Arrival',
        type: 'movie',
        status: 'in_progress',
        genres: ['sci-fi'],
        tags: ['sci-fi'],
        moodTags: [],
        weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
        source: 'manual',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    })

    expect(result.current.items).toEqual([expect.objectContaining({ id: 'movie-arrival', title: 'Arrival' })])
    expect(result.current.syncState.hasPendingWrites).toBe(true)
    expect(result.current.syncState.pendingWriteCount).toBe(1)

    await act(async () => {
      resolveWrite?.()
      await savePromise
    })

    expect(result.current.syncState.pendingWriteCount).toBe(0)
  })

  it('does not double-count local pending writes already reported by snapshot metadata', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const item: ListItem = {
      id: 'movie-arrival',
      title: 'Arrival',
      type: 'movie',
      status: 'in_progress',
      genres: ['sci-fi'],
      tags: ['sci-fi'],
      moodTags: [],
      weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    let emitItems: ((items: ListItem[], state: { fromCache: boolean; hasPendingWrites: boolean; pendingWriteCount: number }) => void) | undefined
    let resolveWrite: (() => void) | undefined
    repositoryMock.subscribeItems.mockImplementation((onItems: (items: unknown[], state?: unknown) => void) => {
      emitItems = onItems as typeof emitItems
      onItems([], { fromCache: false, hasPendingWrites: false, pendingWriteCount: 0 })
      return vi.fn()
    })
    repositoryMock.saveItem.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWrite = resolve
      }),
    )
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = result.current.saveItem(item)
    })

    expect(result.current.syncState.pendingWriteCount).toBe(1)

    act(() => {
      emitItems?.([item], { fromCache: false, hasPendingWrites: true, pendingWriteCount: 1 })
    })

    expect(result.current.syncState.pendingWriteCount).toBe(1)

    await act(async () => {
      resolveWrite?.()
      await savePromise
      emitItems?.([item], { fromCache: false, hasPendingWrites: false, pendingWriteCount: 0 })
    })

    expect(result.current.syncState.pendingWriteCount).toBe(0)
  })

  it('waits for repository item writes and propagates failures to callers', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    let resolveWrite: (() => void) | undefined
    repositoryMock.saveItem.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWrite = resolve
      }),
    )
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    const item: ListItem = {
      id: 'movie-arrival',
      title: 'Arrival',
      type: 'movie',
      status: 'in_progress',
      genres: ['sci-fi'],
      tags: ['sci-fi'],
      moodTags: [],
      weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = result.current.saveItem(item)
    })
    let settled = false
    void savePromise?.then(() => {
      settled = true
    })

    await Promise.resolve()

    expect(settled).toBe(false)

    await act(async () => {
      resolveWrite?.()
      await savePromise
    })

    expect(settled).toBe(true)

    const failure = new Error('network down')
    repositoryMock.saveItem.mockRejectedValueOnce(failure)

    let caught: unknown
    await act(async () => {
      try {
        await result.current.saveItem({ ...item, id: 'movie-failure' })
      } catch (reason) {
        caught = reason
      }
    })

    expect(caught).toBe(failure)
    expect(result.current.syncState.error).toBe('network down')
  })

  it('records and clears recent activity for signed-in users', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeActivityEntries).toHaveBeenCalled())

    await act(async () => {
      await result.current.recordActivity({
        detail: 'Arrival',
        label: 'Ficha guardada',
        tab: 'library',
        target: { kind: 'item', id: 'game-outer-wilds' },
        tone: 'success',
      })
    })

    await waitFor(() =>
      expect(result.current.activityEntries[0]).toEqual(
        expect.objectContaining({
          detail: 'Arrival',
          label: 'Ficha guardada',
          tab: 'library',
          target: { kind: 'item', id: 'game-outer-wilds' },
        }),
      ),
    )
    expect(repositoryMock.saveActivityEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'Arrival',
        label: 'Ficha guardada',
        tab: 'library',
        target: { kind: 'item', id: 'game-outer-wilds' },
      }),
    )

    await act(async () => {
      await result.current.clearActivityEntries()
    })

    expect(result.current.activityEntries).toEqual([])
    expect(repositoryMock.clearActivityEntries).toHaveBeenCalled()

    const restoredEntry: ActivityEntry = {
      id: 'activity-restored',
      detail: 'Arrival',
      label: 'Ficha guardada',
      tab: 'library',
      target: { kind: 'item', id: 'game-outer-wilds' },
      tone: 'success',
      createdAt: '2026-06-03T12:00:00.000Z',
    }

    await act(async () => {
      await result.current.restoreActivityEntries([restoredEntry])
    })

    expect(result.current.activityEntries).toEqual([restoredEntry])
    expect(repositoryMock.saveActivityEntry).toHaveBeenCalledWith(restoredEntry)
  })

  it('keeps activity permission errors out of the primary library error', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    repositoryMock.subscribeActivityEntries.mockImplementation((_onEntries: (entries: unknown[]) => void, onError: (error: Error) => void) => {
      onError(permissionError)
      return vi.fn()
    })
    repositoryMock.saveActivityEntry.mockRejectedValueOnce(permissionError)

    try {
      const user = {
        uid: 'user-1',
        email: null,
        displayName: null,
      }
      const { result } = renderHook(() => useLibrary(user))

      await waitFor(() => expect(repositoryMock.subscribeActivityEntries).toHaveBeenCalled())

      await act(async () => {
        await result.current.recordActivity({
          detail: 'Cambio de pestana',
          label: 'Navegacion',
          tab: 'settings',
          tone: 'info',
        })
      })

      expect(result.current.error).toBeUndefined()
      expect(consoleWarn).not.toHaveBeenCalled()
    } finally {
      consoleWarn.mockRestore()
    }
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

  it('can save discovery results from Biblioteca without writing externalCandidates', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.saveDiscoveryToLibrary(candidate, { persistDiscoveryCandidate: false })
    })

    expect(repositoryMock.saveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'public',
        title: 'Odisea',
      }),
    )
    expect(repositoryMock.markDiscoveryCandidateSaved).not.toHaveBeenCalled()
    expect(repositoryMock.saveDiscoveryCandidate).not.toHaveBeenCalled()
    expect(repositoryMock.recordDiscoverySaveToPublicCatalog).toHaveBeenCalledWith(candidate)
  })

  it('can save public catalog entries without feeding public catalog demand again', async () => {
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await result.current.saveDiscoveryToLibrary(candidate, {
        persistDiscoveryCandidate: false,
        registerPublicCatalog: false,
      })
    })

    expect(repositoryMock.saveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'public',
        title: 'Odisea',
      }),
    )
    expect(repositoryMock.markDiscoveryCandidateSaved).not.toHaveBeenCalled()
    expect(repositoryMock.saveDiscoveryCandidate).not.toHaveBeenCalled()
    expect(repositoryMock.recordDiscoverySaveToPublicCatalog).not.toHaveBeenCalled()
  })

  it('surfaces public catalog registration failures when saving external discovery results', async () => {
    const externalCandidate: DiscoveryCandidate = {
      id: 'external-jikan-52991',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      status: 'queued',
      origin: 'externalSearch',
      source: 'jikan',
      sourceId: '52991',
      releaseYear: 2023,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['Fantasy'],
      tags: ['anime', 'Jikan'],
      moodTags: [],
      externalRefs: {
        malId: '52991',
        sourceUrl: 'https://myanimelist.net/anime/52991',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    repositoryMock.recordDiscoverySaveToPublicCatalog.mockRejectedValueOnce(
      new Error('Missing or insufficient permissions.'),
    )
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await expect(result.current.saveDiscoveryToLibrary(externalCandidate)).rejects.toThrow(
        'Missing or insufficient permissions.',
      )
    })

    expect(repositoryMock.saveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        progressCurrent: 0,
        progressTotal: 28,
        progressUnit: 'episodes',
        title: 'Frieren: Beyond Journey End',
      }),
    )
    expect(repositoryMock.markDiscoveryCandidateSaved).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.error).toBe('Missing or insufficient permissions.'))
  })

  it('records imported items in the public catalog without setting a global sync error', async () => {
    const importedItem: ListItem = {
      id: 'anime-frieren-anilist-154587',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      status: 'completed',
      progressCurrent: 28,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['Fantasy'],
      tags: [],
      moodTags: [],
      weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
      source: 'external',
      externalRefs: {
        anilistId: '154587',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    repositoryMock.recordImportedItemToPublicCatalog.mockRejectedValueOnce(new Error('catalog unavailable'))
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(repositoryMock.subscribeItems).toHaveBeenCalled())

    await act(async () => {
      await expect(result.current.recordImportedItemToPublicCatalog(importedItem)).rejects.toThrow('catalog unavailable')
    })

    expect(repositoryMock.recordImportedItemToPublicCatalog).toHaveBeenCalledWith(importedItem)
    expect(result.current.error).toBeUndefined()
  })

  it('preserves locked external metadata when saving personal progress', async () => {
    const externalItem: ListItem = {
      id: 'anime-frieren-anilist-154587',
      title: 'Frieren: Tras finalizar el viaje',
      type: 'anime',
      status: 'wishlist',
      rating: undefined,
      progress: undefined,
      durationMaxHours: 12,
      genres: ['Animacion', 'Aventura'],
      tags: ['anime', 'anilist', 'Animacion'],
      moodTags: [],
      weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
      notes: 'Metadatos desde AniList.',
      source: 'external',
      externalRefs: { anilistId: '154587', sourceUrl: 'https://anilist.co/anime/154587' },
      posterUrl: 'https://img.anili.st/media/154587.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    repositoryMock.subscribeItems.mockImplementation((onItems: (items: unknown[]) => void) => {
      onItems([externalItem])
      return vi.fn()
    })
    const user = {
      uid: 'user-1',
      email: null,
      displayName: null,
    }
    const { result } = renderHook(() => useLibrary(user))

    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.saveItem({
        ...externalItem,
        title: 'Titulo cambiado',
        type: 'book',
        status: 'in_progress',
        rating: 9.2,
        progress: 'Ep 6',
        genres: ['Sobrescrito'],
        tags: ['manual'],
        moodTags: ['calido'],
        weights: { priority: 2, surprise: 1, challenge: 1 },
        notes: 'Me esta gustando.',
        posterUrl: 'https://example.com/changed.jpg',
        externalRefs: { sourceUrl: 'https://example.com/changed' },
      })
    })

    expect(repositoryMock.saveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: externalItem.id,
        title: externalItem.title,
        type: externalItem.type,
        source: 'external',
        status: 'in_progress',
        rating: 9.2,
        progress: 'Ep 6',
        genres: externalItem.genres,
        tags: externalItem.tags,
        moodTags: ['calido'],
        notes: 'Me esta gustando.',
        posterUrl: externalItem.posterUrl,
        externalRefs: externalItem.externalRefs,
        weights: {
          priority: 2,
          surprise: externalItem.weights.surprise,
          challenge: externalItem.weights.challenge,
        },
      }),
    )
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
