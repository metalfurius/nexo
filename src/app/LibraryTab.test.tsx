import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type PublicCatalogItem } from '../domain/types'
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

function createLibrarySurface(publicItems: PublicCatalogItem[]) {
  const searchCatalog = vi.fn(async () => [])
  const searchPublicCatalog = vi.fn(async (_query: string, type?: string) =>
    publicItems.filter((item) => !type || type === 'any' || item.type === type),
  )
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

function renderLibraryTab(library: LibrarySurface) {
  return render(
    <LibraryTab
      library={library}
      selectedItemIds={[]}
      onActivity={vi.fn()}
      onActivityFocusHandled={vi.fn()}
      onDraftRequestHandled={vi.fn()}
      onImportRequestHandled={vi.fn()}
      onNavigate={vi.fn()}
      onPrimaryActionRequestHandled={vi.fn()}
      onReviewRequestHandled={vi.fn()}
      onRollDice={vi.fn()}
      onVisibleSelectionSummaryChange={vi.fn()}
      setSelectedItemIds={vi.fn()}
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
})
