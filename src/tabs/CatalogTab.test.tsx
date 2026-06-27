import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type ListItem, type PublicCatalogItem } from '../domain/types'
import { buildPublicCatalogItem, discoveryToListItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import type { LibrarySurface } from '../app/shared'
import CatalogTab from './CatalogTab'

function createPublicCatalogItem(index?: number) {
  const title = index === undefined ? "Frieren: Beyond Journey's End" : `Catalog Item ${index}`
  return buildPublicCatalogItem(
    {
      id: index === undefined ? 'anime-frieren' : `anime-catalog-item-${index}`,
      title,
      type: 'anime',
      description: 'Fantasia contemplativa sobre memoria, duelo y tiempo despues de la aventura.',
      releaseYear: 2023,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['fantasia', 'aventura'],
      tags: ['anime'],
      moodTags: ['calma'],
    },
    'test-moderator',
  )
}

function createLibrarySurface(options: { items?: ListItem[]; publicItems: PublicCatalogItem[] }) {
  let items = options.items ?? []
  const saveDiscoveryToLibrary = vi.fn(async (candidate) => discoveryToListItem(candidate))
  const library: LibrarySurface = {
    get items() {
      return items
    },
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
    listPublicCatalog: vi.fn(async () => options.publicItems),
    searchPublicCatalog: vi.fn(async () => options.publicItems),
    saveSettings: vi.fn(async () => undefined),
    queueDiscoveryCandidates: vi.fn(async () => 1),
    dismissDiscoveryCandidate: vi.fn(async () => undefined),
    restoreDiscoveryCandidate: vi.fn(async () => undefined),
    saveDiscoveryToLibrary,
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

  return {
    library,
    saveDiscoveryToLibrary,
    setItems(nextItems: ListItem[]) {
      items = nextItems
    },
  }
}

function renderCatalog(library: LibrarySurface) {
  return render(
    <CatalogTab
      isSignedIn
      library={library}
      onActivity={vi.fn()}
      onNavigate={vi.fn()}
      onSignIn={vi.fn()}
    />,
  )
}

async function getCatalogCard(title: string) {
  await screen.findByRole('heading', { name: title })
  const card = screen.getByRole('heading', { name: title }).closest('article')
  expect(card).toBeTruthy()
  return within(card as HTMLElement)
}

describe('CatalogTab', () => {
  it('marks public catalog entries already saved in the library', async () => {
    const publicItem = createPublicCatalogItem()
    const savedItem = discoveryToListItem(publicItemToDiscovery(publicItem))
    const { library } = createLibrarySurface({ items: [savedItem], publicItems: [publicItem] })

    renderCatalog(library)

    const card = await getCatalogCard(publicItem.title)
    const savedButton = card.getByRole('button', { name: 'Guardado' })
    expect(savedButton).toBeDisabled()
    expect(card.getByRole('button', { name: 'Explorar' })).toBeEnabled()
    expect(card.getByTitle('Ver ficha')).toBeEnabled()
    expect(screen.queryByText('Biblioteca conectada')).not.toBeInTheDocument()

    await userEvent.click(card.getByTitle('Ver ficha'))
    const dialog = screen.getByRole('dialog', { name: publicItem.title })
    expect(within(dialog).getByRole('button', { name: 'Guardado' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Mandar al Explorador' })).toBeEnabled()
  })

  it('does not save a stale duplicate when the item is already in the library', async () => {
    const publicItem = createPublicCatalogItem()
    const savedItem = discoveryToListItem(publicItemToDiscovery(publicItem))
    const { library, saveDiscoveryToLibrary, setItems } = createLibrarySurface({ publicItems: [publicItem] })

    renderCatalog(library)

    const card = await getCatalogCard(publicItem.title)
    const saveButton = card.getByRole('button', { name: 'Guardar' })
    setItems([savedItem])
    await userEvent.click(saveButton)

    await waitFor(() => expect(saveDiscoveryToLibrary).not.toHaveBeenCalled())
    expect(screen.getByRole('status')).toHaveTextContent(`${publicItem.title} ya esta en tu Biblioteca.`)
  })

  it('shows public catalog entries in an incremental window', async () => {
    const publicItems = Array.from({ length: 30 }, (_entry, index) => createPublicCatalogItem(index + 1))
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mostrando 24 de 30 obras del catalogo.'))
    expect(screen.getByRole('heading', { name: 'Catalog Item 24' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Catalog Item 25' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mas' }))

    expect(await screen.findByRole('heading', { name: 'Catalog Item 30' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando 30 de 30 obras del catalogo.')
    expect(screen.queryByRole('button', { name: 'Mostrar mas' })).not.toBeInTheDocument()
  })

  it('keeps public search results paged locally instead of truncating them', async () => {
    const publicItems = Array.from({ length: 30 }, (_entry, index) => createPublicCatalogItem(index + 1))
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mostrando 24 de 30 obras del catalogo.'))
    await userEvent.type(screen.getByLabelText('Buscar en el catalogo publico'), 'Catalog')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mostrando 24 de 30 resultados para explorar.'))
    expect(library.searchPublicCatalog).toHaveBeenCalledWith('Catalog', 'any')
    expect(screen.getByRole('heading', { name: 'Catalog Item 24' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Catalog Item 25' })).not.toBeInTheDocument()
  })
})
