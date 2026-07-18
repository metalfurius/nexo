import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ImportPreview, type ImportPreviewItem, type ListItem } from '../domain/types'
import { buildPublicCatalogItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import type { LibrarySurface } from '../app/shared'
import ImportTab, { publicCatalogImportRecordLimit } from './ImportTab'

const importerMocks = vi.hoisted(() => ({
  buildImportPreview: vi.fn(),
  importAniListLibrary: vi.fn(),
  importGoodreadsCsv: vi.fn(),
  importLetterboxdZip: vi.fn(),
  importMyAnimeListLibrary: vi.fn(),
  importPreviewItemsToListItems: vi.fn(),
}))

vi.mock('../services/libraryImporters', () => importerMocks)

function createPreviewItems() {
  const frierenPreviewItem: ImportPreviewItem = {
    id: 'anilist:154587',
    draft: {
      sourceId: 'anilist',
      sourceItemId: '154587',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      status: 'completed',
      progressCurrent: 28,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['Fantasy'],
      tags: [],
      moodTags: [],
      externalRefs: {
        anilistId: '154587',
      },
      releaseYear: 2023,
    },
  }
  const duplicatePreviewItem: ImportPreviewItem = {
    id: 'anilist:1',
    duplicateOfId: 'anime-existing',
    duplicateReason: 'externalRefs',
    draft: {
      sourceId: 'anilist',
      sourceItemId: '1',
      title: 'Existing Anime',
      type: 'anime',
      status: 'completed',
      genres: [],
      tags: [],
      moodTags: [],
      externalRefs: {
        anilistId: '1',
      },
    },
  }
  return { duplicatePreviewItem, frierenPreviewItem }
}

function createPreview(items: ImportPreviewItem[]): ImportPreview {
  return {
    sourceId: 'anilist',
    sourceLabel: 'AniList',
    createdAt: '2026-06-27T00:00:00.000Z',
    totalEntries: items.length,
    newItems: items.filter((item) => !item.duplicateOfId).length,
    duplicateItems: items.filter((item) => item.duplicateOfId).length,
    invalidItems: 0,
    statusCounts: {
      completed: items.length,
    },
    typeCounts: {
      anime: items.length,
    },
    items,
    warnings: [],
  }
}

function createImportedItem(): ListItem {
  return {
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
    weights: DEFAULT_WEIGHTS,
    source: 'external',
    externalRefs: {
      anilistId: '154587',
    },
    createdAt: '2026-06-27T00:00:00.000Z',
    updatedAt: '2026-06-27T00:00:00.000Z',
  }
}

function createGeneratedPreviewItem(index: number, externalId = String(100000 + index)): ImportPreviewItem {
  return {
    id: `anilist:${externalId}`,
    draft: {
      sourceId: 'anilist',
      sourceItemId: externalId,
      title: `Anime ${index}`,
      type: 'anime',
      status: 'completed',
      progressTotal: 12,
      progressUnit: 'episodes',
      genres: ['Fantasy'],
      tags: [],
      moodTags: [],
      externalRefs: {
        anilistId: externalId,
      },
      releaseYear: 2024,
    },
  }
}

function createGeneratedImportedItem(index: number, externalId = String(100000 + index)): ListItem {
  return {
    ...createImportedItem(),
    id: `anime-${index}-anilist-${externalId}`,
    title: `Anime ${index}`,
    progressCurrent: undefined,
    progressTotal: 12,
    externalRefs: {
      anilistId: externalId,
    },
  }
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function createLibrarySurface(overrides: Partial<LibrarySurface> = {}) {
  const library: LibrarySurface = {
    items: [],
    settings: DEFAULT_SETTINGS,
    discoveryCandidates: [],
    activityEntries: [],
    userProfiles: [],
    userRole: 'user',
    isModerator: false,
    loading: false,
    syncState: {
      fromCache: false,
      hasPendingWrites: false,
      offlinePersistenceEnabled: false,
      pendingWriteCount: 0,
      remote: true,
    },
    saveItem: vi.fn(async () => undefined),
    deleteItem: vi.fn(async () => undefined),
    deleteAllItems: vi.fn(async () => ({ complete: true, deletedItemIds: [], roadmap: DEFAULT_SETTINGS.roadmap, total: 0 })),
    setStatus: vi.fn(async () => undefined),
    snoozeRecommendation: vi.fn(async () => undefined),
    reactivateRecommendation: vi.fn(async () => undefined),
    setRecommendationCooldown: vi.fn(async () => undefined),
    recordRecommendation: vi.fn(async () => undefined),
    searchExternal: vi.fn(async () => []),
    searchCatalog: vi.fn(async () => []),
    listPublicCatalog: vi.fn(async () => []),
    searchPublicCatalog: vi.fn(async () => []),
    saveSettings: vi.fn(async () => undefined),
    applyRoadmapMutation: vi.fn(async () => undefined),
    queueDiscoveryCandidates: vi.fn(async () => 0),
    dismissDiscoveryCandidate: vi.fn(async () => undefined),
    restoreDiscoveryCandidate: vi.fn(async () => undefined),
    saveDiscoveryToLibrary: vi.fn(async () => createImportedItem()),
    recordImportedItemToPublicCatalog: vi.fn(async () => undefined),
    upsertPublicItem: vi.fn(async (item) => buildPublicCatalogItem(item, 'test-moderator')),
    replacePublicItem: vi.fn(async (item) => item),
    archivePublicItem: vi.fn(async () => undefined),
    restorePublicItem: vi.fn(async () => undefined),
    updateUserRole: vi.fn(async () => undefined),
    recordActivity: vi.fn(),
    clearActivityEntries: vi.fn(async () => undefined),
    restoreActivityEntries: vi.fn(async () => undefined),
    publicItemToDiscovery,
    externalCandidateToDiscovery,
    ...overrides,
  }
  return library
}

async function prepareAniListImport(expectedPreviewTitle = 'Frieren: Beyond Journey End') {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('usuario o myanimelist.net/profile/...'), 'fran')
  await user.click(screen.getByRole('button', { name: 'Leer perfil' }))
  await screen.findByText(expectedPreviewTitle)
  return user
}

describe('ImportTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    importerMocks.importMyAnimeListLibrary.mockImplementation(() => importerMocks.importAniListLibrary())
    window.sessionStorage.clear()
    Object.defineProperty(window, 'scrollTo', {
      value: vi.fn(),
      writable: true,
    })
  })

  it('presents profile and file imports as clear accessible paths', () => {
    render(<ImportTab library={createLibrarySurface()} onActivity={vi.fn()} onNavigate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Trae tu biblioteca' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Desde un perfil' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Desde un archivo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Importar ZIP oficial de Letterboxd')).toBeInTheDocument()
    expect(screen.getByLabelText('Importar CSV oficial de Goodreads')).toBeInTheDocument()
    expect(screen.getByText('Qué ocurre con los datos importados')).toBeInTheDocument()
  })

  it('completes the private import before public catalog registration finishes', async () => {
    const { duplicatePreviewItem, frierenPreviewItem } = createPreviewItems()
    const importedItem = createImportedItem()
    const publicRecord = createDeferred()
    const preview = createPreview([frierenPreviewItem, duplicatePreviewItem])
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(preview)
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce([importedItem])
    const library = createLibrarySurface({
      recordImportedItemToPublicCatalog: vi.fn(() => publicRecord.promise),
    })

    render(<ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} />)
    const user = await prepareAniListImport()

    expect(screen.getByText(/Nexo puede usar metadatos publicos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Importar todo' }))

    await waitFor(() => {
      expect(
        screen.getAllByText('Importadas 1 entradas desde AniList. Registrando 1 para mejorar el catalogo en segundo plano.').length,
      ).toBeGreaterThan(0)
    })
    expect(screen.getAllByRole('button', { name: 'Ver Biblioteca' }).some((button) => !button.hasAttribute('disabled'))).toBe(true)
    expect(importerMocks.importPreviewItemsToListItems).toHaveBeenCalledWith([frierenPreviewItem])
    expect(library.saveItem).toHaveBeenCalledWith(importedItem)
    expect(library.recordImportedItemToPublicCatalog).toHaveBeenCalledWith(importedItem)
    expect(vi.mocked(library.saveItem).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(library.recordImportedItemToPublicCatalog).mock.invocationCallOrder[0],
    )

    publicRecord.resolve()
    await waitFor(() => {
      expect(screen.getAllByText('Importadas 1 entradas desde AniList. 1 registradas para mejorar el catalogo.').length).toBeGreaterThan(0)
    })
  })

  it('completes the private import when public catalog registration fails', async () => {
    const { frierenPreviewItem } = createPreviewItems()
    const importedItem = createImportedItem()
    const preview = createPreview([frierenPreviewItem])
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(preview)
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce([importedItem])
    const publicRecord = createDeferred()
    const library = createLibrarySurface({
      recordImportedItemToPublicCatalog: vi.fn(() => publicRecord.promise),
    })

    render(<ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} />)
    const user = await prepareAniListImport()

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))

    await waitFor(() => {
      expect(
        screen.getAllByText('Importadas 1 entradas desde AniList. Registrando 1 para mejorar el catalogo en segundo plano.').length,
      ).toBeGreaterThan(0)
    })
    publicRecord.reject(new Error('catalog unavailable'))
    await waitFor(() => {
      expect(screen.getAllByText(/Importacion completada; algunas obras no se pudieron registrar en el catalogo/).length).toBeGreaterThan(0)
    })
    expect(library.saveItem).toHaveBeenCalledWith(importedItem)
    expect(library.recordImportedItemToPublicCatalog).toHaveBeenCalledWith(importedItem)
  })

  it('records imported public catalog items in sequential chunks of at most 100', async () => {
    const previewItems = Array.from({ length: 102 }, (_entry, index) =>
      createGeneratedPreviewItem(index),
    )
    const importedItems = previewItems.map((item, index) => createGeneratedImportedItem(index, item.draft.sourceItemId))
    const firstChunk = createDeferred()
    const recordImportedItemsToPublicCatalog = vi.fn()
      .mockReturnValueOnce(firstChunk.promise)
      .mockResolvedValueOnce(undefined)
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(createPreview(previewItems))
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce(importedItems)
    const library = createLibrarySurface({ recordImportedItemsToPublicCatalog })

    render(<ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} />)
    const user = await prepareAniListImport('Anime 0')

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))

    await waitFor(() => expect(recordImportedItemsToPublicCatalog).toHaveBeenCalledTimes(1))
    expect(recordImportedItemsToPublicCatalog).toHaveBeenNthCalledWith(1, importedItems.slice(0, 100))
    expect(library.recordImportedItemToPublicCatalog).not.toHaveBeenCalled()
    firstChunk.resolve()
    await waitFor(() => expect(recordImportedItemsToPublicCatalog).toHaveBeenCalledTimes(2))
    expect(recordImportedItemsToPublicCatalog).toHaveBeenNthCalledWith(2, importedItems.slice(100))
    await waitFor(() => {
      expect(
        screen.getAllByText(`Importadas ${importedItems.length} entradas desde AniList. ${importedItems.length} registradas para mejorar el catalogo.`).length,
      ).toBeGreaterThan(0)
    })
  })

  it('does not start public catalog registration after the import session changes', async () => {
    const { frierenPreviewItem } = createPreviewItems()
    const importedItem = createImportedItem()
    const privateSave = createDeferred()
    const recordImportedItemsToPublicCatalog = vi.fn().mockResolvedValue(undefined)
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(createPreview([frierenPreviewItem]))
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce([importedItem])
    const libraryA = createLibrarySurface({
      recordImportedItemsToPublicCatalog,
      saveItem: vi.fn(() => privateSave.promise),
    })
    const libraryB = createLibrarySurface({ recordImportedItemsToPublicCatalog: vi.fn().mockResolvedValue(undefined) })
    const onActivity = vi.fn()
    const onNavigate = vi.fn()
    const view = render(
      <ImportTab library={libraryA} onActivity={onActivity} onNavigate={onNavigate} sessionKey="uid-a" />,
    )
    const user = await prepareAniListImport()

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))
    await waitFor(() => expect(libraryA.saveItem).toHaveBeenCalledTimes(1))
    view.rerender(
      <ImportTab library={libraryB} onActivity={onActivity} onNavigate={onNavigate} sessionKey="uid-b" />,
    )
    await act(async () => {
      privateSave.resolve()
      await privateSave.promise
    })

    expect(recordImportedItemsToPublicCatalog).not.toHaveBeenCalled()
    expect(libraryB.recordImportedItemsToPublicCatalog).not.toHaveBeenCalled()
  })

  it('does not continue private item writes after the account session changes', async () => {
    const previewItems = [createGeneratedPreviewItem(0), createGeneratedPreviewItem(1)]
    const importedItems = previewItems.map((item, index) => createGeneratedImportedItem(index, item.draft.sourceItemId))
    const firstPrivateSave = createDeferred()
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(createPreview(previewItems))
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce(importedItems)
    const saveForA = vi.fn().mockReturnValueOnce(firstPrivateSave.promise).mockResolvedValue(undefined)
    const saveForB = vi.fn().mockResolvedValue(undefined)
    const view = render(
      <ImportTab
        library={createLibrarySurface({ saveItem: saveForA })}
        onActivity={vi.fn()}
        onNavigate={vi.fn()}
        sessionKey="uid-a"
      />,
    )
    const user = await prepareAniListImport('Anime 0')

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))
    await waitFor(() => expect(saveForA).toHaveBeenCalledTimes(1))
    view.rerender(
      <ImportTab
        library={createLibrarySurface({ saveItem: saveForB })}
        onActivity={vi.fn()}
        onNavigate={vi.fn()}
        sessionKey="uid-b"
      />,
    )
    await act(async () => {
      firstPrivateSave.resolve()
      await firstPrivateSave.promise
    })

    expect(saveForA).toHaveBeenCalledTimes(1)
    expect(saveForB).not.toHaveBeenCalled()
  })

  it('does not schedule another catalog chunk after unmounting', async () => {
    const previewItems = Array.from({ length: 102 }, (_entry, index) => createGeneratedPreviewItem(index))
    const importedItems = previewItems.map((item, index) => createGeneratedImportedItem(index, item.draft.sourceItemId))
    const firstChunk = createDeferred()
    const recordImportedItemsToPublicCatalog = vi.fn()
      .mockReturnValueOnce(firstChunk.promise)
      .mockResolvedValueOnce(undefined)
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(createPreview(previewItems))
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce(importedItems)
    const library = createLibrarySurface({ recordImportedItemsToPublicCatalog })
    const view = render(
      <ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} sessionKey="uid-a" />,
    )
    const user = await prepareAniListImport('Anime 0')

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))
    await waitFor(() => expect(recordImportedItemsToPublicCatalog).toHaveBeenCalledTimes(1))
    view.unmount()
    await act(async () => {
      firstChunk.resolve()
      await firstChunk.promise
    })

    expect(recordImportedItemsToPublicCatalog).toHaveBeenCalledTimes(1)
  })

  it('does not carry remaining catalog chunks into another account session', async () => {
    const previewItems = Array.from({ length: 102 }, (_entry, index) => createGeneratedPreviewItem(index))
    const importedItems = previewItems.map((item, index) => createGeneratedImportedItem(index, item.draft.sourceItemId))
    const firstChunk = createDeferred()
    const recordCatalogForA = vi.fn()
      .mockReturnValueOnce(firstChunk.promise)
      .mockResolvedValueOnce(undefined)
    const recordCatalogForB = vi.fn().mockResolvedValue(undefined)
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(createPreview(previewItems))
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce(importedItems)
    const libraryA = createLibrarySurface({ recordImportedItemsToPublicCatalog: recordCatalogForA })
    const libraryB = createLibrarySurface({ recordImportedItemsToPublicCatalog: recordCatalogForB })
    const onActivity = vi.fn()
    const onNavigate = vi.fn()
    const view = render(
      <ImportTab library={libraryA} onActivity={onActivity} onNavigate={onNavigate} sessionKey="uid-a" />,
    )
    const user = await prepareAniListImport('Anime 0')

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))
    await waitFor(() => expect(recordCatalogForA).toHaveBeenCalledTimes(1))
    view.rerender(
      <ImportTab library={libraryB} onActivity={onActivity} onNavigate={onNavigate} sessionKey="uid-b" />,
    )
    await act(async () => {
      firstChunk.resolve()
      await firstChunk.promise
    })

    expect(recordCatalogForA).toHaveBeenCalledTimes(1)
    expect(recordCatalogForB).not.toHaveBeenCalled()
  })

  it('dedupes and caps the public catalog registration queue', async () => {
    const previewItems = Array.from({ length: publicCatalogImportRecordLimit + 2 }, (_entry, index) =>
      createGeneratedPreviewItem(index, String(200000 + index)),
    )
    const importedItems = previewItems.map((item, index) => createGeneratedImportedItem(index, item.draft.sourceItemId))
    importedItems[1] = createGeneratedImportedItem(1, importedItems[0].externalRefs?.anilistId)
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(createPreview(previewItems))
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce(importedItems)
    const recordImportedItemsToPublicCatalog = vi.fn().mockResolvedValue(undefined)
    const library = createLibrarySurface({ recordImportedItemsToPublicCatalog })

    render(<ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} />)
    const user = await prepareAniListImport('Anime 0')

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))

    await waitFor(() => expect(recordImportedItemsToPublicCatalog).toHaveBeenCalledTimes(5))
    const recordedItems = recordImportedItemsToPublicCatalog.mock.calls.flatMap(([items]) => items)
    expect(recordedItems).toHaveLength(publicCatalogImportRecordLimit)
    expect(recordImportedItemsToPublicCatalog.mock.calls.every(([items]) => items.length <= 100)).toBe(true)
    expect(library.recordImportedItemToPublicCatalog).not.toHaveBeenCalled()
    expect(screen.getAllByText(
      `Importadas ${importedItems.length} entradas desde AniList. ${publicCatalogImportRecordLimit} registradas para mejorar el catalogo.`,
    ).length).toBeGreaterThan(0)
  })

  it('restores a service rollback after remount and clears it after undo', async () => {
    const { frierenPreviewItem } = createPreviewItems()
    const importedItem = createImportedItem()
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(createPreview([frierenPreviewItem]))
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce([importedItem])
    const library = createLibrarySurface({ syncState: { fromCache: false, hasPendingWrites: false, offlinePersistenceEnabled: false, pendingWriteCount: 0, remote: false } })
    const firstRender = render(
      <ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} sessionKey="uid-a" />,
    )
    const user = await prepareAniListImport()

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))
    await waitFor(() => expect(library.saveItem).toHaveBeenCalledWith(importedItem))
    firstRender.unmount()

    render(<ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} sessionKey="uid-a" />)
    await user.click(await screen.findByRole('button', { name: 'Deshacer importacion' }))

    expect(library.deleteItem).toHaveBeenCalledWith(importedItem.id)
    expect(screen.queryByRole('button', { name: 'Deshacer importacion' })).not.toBeInTheDocument()
  })
})
