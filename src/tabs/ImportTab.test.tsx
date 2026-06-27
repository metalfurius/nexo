import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ImportPreview, type ImportPreviewItem, type ListItem } from '../domain/types'
import { buildPublicCatalogItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import type { LibrarySurface } from '../app/shared'
import ImportTab from './ImportTab'

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
    deleteAllItems: vi.fn(async () => undefined),
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

async function prepareAniListImport() {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('usuario o anilist.co/user/...'), 'fran')
  await user.click(screen.getAllByRole('button', { name: 'Leer perfil' })[0])
  await screen.findByText('Frieren: Beyond Journey End')
  return user
}

describe('ImportTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'scrollTo', {
      value: vi.fn(),
      writable: true,
    })
  })

  it('registers selected new imports in the public catalog after saving them privately', async () => {
    const { duplicatePreviewItem, frierenPreviewItem } = createPreviewItems()
    const importedItem = createImportedItem()
    const preview = createPreview([frierenPreviewItem, duplicatePreviewItem])
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(preview)
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce([importedItem])
    const library = createLibrarySurface()

    render(<ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} />)
    const user = await prepareAniListImport()

    expect(screen.getByText(/Nexo puede usar metadatos publicos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Importar todo' }))

    await waitFor(() => {
      expect(screen.getAllByText('Importadas 1 entradas desde AniList. 1 registradas para mejorar el catalogo.').length).toBeGreaterThan(0)
    })
    expect(importerMocks.importPreviewItemsToListItems).toHaveBeenCalledWith([frierenPreviewItem])
    expect(library.saveItem).toHaveBeenCalledWith(importedItem)
    expect(library.recordImportedItemToPublicCatalog).toHaveBeenCalledWith(importedItem)
    expect(vi.mocked(library.saveItem).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(library.recordImportedItemToPublicCatalog).mock.invocationCallOrder[0],
    )
  })

  it('completes the private import when public catalog registration fails', async () => {
    const { frierenPreviewItem } = createPreviewItems()
    const importedItem = createImportedItem()
    const preview = createPreview([frierenPreviewItem])
    importerMocks.importAniListLibrary.mockResolvedValueOnce({ sourceId: 'anilist', drafts: [], warnings: [] })
    importerMocks.buildImportPreview.mockReturnValueOnce(preview)
    importerMocks.importPreviewItemsToListItems.mockReturnValueOnce([importedItem])
    const library = createLibrarySurface({
      recordImportedItemToPublicCatalog: vi.fn(async () => {
        throw new Error('catalog unavailable')
      }),
    })

    render(<ImportTab library={library} onActivity={vi.fn()} onNavigate={vi.fn()} />)
    const user = await prepareAniListImport()

    await user.click(screen.getByRole('button', { name: 'Importar todo' }))

    await waitFor(() => {
      expect(screen.getAllByText(/Importacion completada; algunas obras no se pudieron registrar en el catalogo/).length).toBeGreaterThan(0)
    })
    expect(library.saveItem).toHaveBeenCalledWith(importedItem)
    expect(library.recordImportedItemToPublicCatalog).toHaveBeenCalledWith(importedItem)
  })
})
