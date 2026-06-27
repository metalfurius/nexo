import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Dispatch, SetStateAction } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem, type PublicCatalogItem } from '../domain/types'
import { buildPublicCatalogItem, discoveryToListItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import { LibraryTab, type LibrarySurface } from './shared'

function createPublicCatalogItem(): PublicCatalogItem {
  return buildPublicCatalogItem(
    {
      id: 'manga-berserk',
      title: 'Berserk',
      type: 'manga',
      description: 'Dark fantasy manga in the Nexo catalog.',
      progressTotal: 376,
      progressUnit: 'chapters',
      genres: ['dark fantasy'],
      tags: ['manga'],
      moodTags: [],
    },
    'test-moderator',
  )
}

function createLibraryItem(index: number, overrides: Partial<ListItem> = {}): ListItem {
  const paddedIndex = String(index).padStart(2, '0')
  return {
    id: `library-item-${paddedIndex}`,
    title: `Library Item ${paddedIndex}`,
    type: 'game',
    status: 'completed',
    genres: ['test'],
    tags: ['fixture'],
    moodTags: [],
    weights: DEFAULT_WEIGHTS,
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createLibrarySurface(publicItems: PublicCatalogItem[], items: ListItem[] = []) {
  const searchCatalog = vi.fn(async () => [])
  const searchPublicCatalog = vi.fn(async (_query: string, type?: string) =>
    publicItems.filter((item) => !type || type === 'any' || item.type === type),
  )
  const library: LibrarySurface = {
    items,
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
    searchCatalog,
    listPublicCatalog: vi.fn(async () => publicItems),
    searchPublicCatalog,
    saveSettings: vi.fn(async () => undefined),
    queueDiscoveryCandidates: vi.fn(async () => 0),
    dismissDiscoveryCandidate: vi.fn(async () => undefined),
    restoreDiscoveryCandidate: vi.fn(async () => undefined),
    saveDiscoveryToLibrary: vi.fn(async (candidate) => discoveryToListItem(candidate)),
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
  }
  return { library, searchCatalog, searchPublicCatalog }
}

function renderLibraryTab(
  library: LibrarySurface,
  options: {
    selectedItemIds?: string[]
    setSelectedItemIds?: Dispatch<SetStateAction<string[]>>
  } = {},
) {
  return render(
    <LibraryTab
      library={library}
      selectedItemIds={options.selectedItemIds ?? []}
      onActivity={vi.fn()}
      onActivityFocusHandled={vi.fn()}
      onDraftRequestHandled={vi.fn()}
      onImportRequestHandled={vi.fn()}
      onNavigate={vi.fn()}
      onPrimaryActionRequestHandled={vi.fn()}
      onReviewRequestHandled={vi.fn()}
      onRollDice={vi.fn()}
      onVisibleSelectionSummaryChange={vi.fn()}
      setSelectedItemIds={options.setSelectedItemIds ?? vi.fn()}
      setTheme={vi.fn()}
    />,
  )
}

describe('LibraryTab catalog search', () => {
  it('browses Nexo catalog items by type without requiring a query', async () => {
    const publicItem = createPublicCatalogItem()
    const { library, searchCatalog, searchPublicCatalog } = createLibrarySurface([publicItem])

    renderLibraryTab(library)

    await userEvent.selectOptions(screen.getByLabelText('Tipo de obra para buscar'), 'manga')

    await waitFor(() => expect(searchPublicCatalog).toHaveBeenCalledWith('', 'manga'))
    expect(searchCatalog).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('1 obra de manga en Nexo lista para guardar.')
    expect(within(screen.getByLabelText('Resultados para guardar')).getByRole('heading', { name: 'Berserk' })).toBeInTheDocument()
  })

  it('paginates saved library items incrementally', async () => {
    const items = Array.from({ length: 30 }, (_entry, index) => createLibraryItem(index + 1))
    const { library } = createLibrarySurface([], items)

    renderLibraryTab(library)

    const grid = within(screen.getByTestId('library-grid'))
    expect(screen.getByTestId('library-grid').querySelectorAll('.item-card')).toHaveLength(24)
    expect(grid.getByRole('heading', { name: 'Library Item 24' })).toBeInTheDocument()
    expect(grid.queryByRole('heading', { name: 'Library Item 25' })).not.toBeInTheDocument()
    expect(screen.getByText('Mostrando 24 de 30 entradas')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mas' }))

    expect(within(screen.getByTestId('library-grid')).getByRole('heading', { name: 'Library Item 30' })).toBeInTheDocument()
    expect(screen.getByText('Mostrando 30 de 30 entradas')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Mostrar mas' })).not.toBeInTheDocument()
  })

  it('resets the saved library window when filters change', async () => {
    const items = Array.from({ length: 30 }, (_entry, index) => createLibraryItem(index + 1))
    const { library } = createLibrarySurface([], items)

    renderLibraryTab(library)
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mas' }))
    expect(within(screen.getByTestId('library-grid')).getByRole('heading', { name: 'Library Item 30' })).toBeInTheDocument()

    await userEvent.selectOptions(
      within(screen.getByTestId('library-shelf-header')).getByLabelText('Filtrar por tipo'),
      'game',
    )

    await waitFor(() =>
      expect(within(screen.getByTestId('library-grid')).queryByRole('heading', { name: 'Library Item 25' })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Mostrando 24 de 30 entradas')).toBeVisible()
  })

  it('selects only the rendered saved library page as visible', async () => {
    const items = Array.from({ length: 30 }, (_entry, index) => createLibraryItem(index + 1))
    const setSelectedItemIds = vi.fn()
    const { library } = createLibrarySurface([], items)

    renderLibraryTab(library, { setSelectedItemIds })
    await userEvent.click(screen.getByText('Avanzado'))
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar visibles' }))

    expect(setSelectedItemIds).toHaveBeenCalledTimes(1)
    const updater = setSelectedItemIds.mock.calls[0][0] as (current: string[]) => string[]
    const selectedIds = updater([])
    expect(selectedIds).toHaveLength(24)
    expect(selectedIds).toContain('library-item-24')
    expect(selectedIds).not.toContain('library-item-25')
  })
})
