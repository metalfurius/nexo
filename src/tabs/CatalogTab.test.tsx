import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type DiscoveryCandidate, type ItemType, type ListItem, type PublicCatalogItem } from '../domain/types'
import { buildPublicCatalogItem, discoveryToListItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import { scoreCatalogSearchCandidate } from '../lib/catalogSearch'
import type { CatalogSearchResult } from '../services/catalogSearchClient'
import type { LibrarySurface } from '../app/shared'
import CatalogTab from './CatalogTab'

function createPublicCatalogItem(index?: number, overrides: Partial<PublicCatalogItem> = {}) {
  const title = overrides.title ?? (index === undefined ? "Frieren: Beyond Journey's End" : `Catalog Item ${index}`)
  const type = overrides.type ?? 'anime'
  return buildPublicCatalogItem(
    {
      id: index === undefined ? 'anime-frieren' : `anime-catalog-item-${index}`,
      title,
      type,
      description: 'Fantasia contemplativa sobre memoria, duelo y tiempo despues de la aventura.',
      releaseYear: 2023,
      progressTotal: type === 'manga' || type === 'manhwa' ? 120 : 28,
      progressUnit: type === 'manga' || type === 'manhwa' ? 'chapters' : 'episodes',
      genres: ['fantasia', 'aventura'],
      tags: [type],
      moodTags: ['calma'],
      ...overrides,
    },
    'test-moderator',
  )
}

function matchesPublicCatalogTestType(itemType: ItemType, requestedType?: string) {
  if (!requestedType || requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
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
    deleteAllItems: vi.fn(async () => ({ complete: true, deletedItemIds: [], roadmap: DEFAULT_SETTINGS.roadmap, total: 0 })),
    setStatus: vi.fn(async () => undefined),
    snoozeRecommendation: vi.fn(async () => undefined),
    reactivateRecommendation: vi.fn(async () => undefined),
    setRecommendationCooldown: vi.fn(async () => undefined),
    recordRecommendation: vi.fn(async () => undefined),
    searchExternal: vi.fn(async () => []),
    searchCatalog: vi.fn(async (query, type) =>
      options.publicItems
        .filter((item) => matchesPublicCatalogTestType(item.type, type))
        .filter((item) => !query.trim() || scoreCatalogSearchCandidate(query, item, type) > 0)
        .map(publicItemToDiscovery),
    ),
    listPublicCatalog: vi.fn(async () => options.publicItems),
    searchPublicCatalog: vi.fn(async (query, type) =>
      options.publicItems
        .filter((item) => matchesPublicCatalogTestType(item.type, type))
        .filter((item) => !query.trim() || scoreCatalogSearchCandidate(query, item, type) > 0),
    ),
    saveSettings: vi.fn(async () => undefined),
    applyRoadmapMutation: vi.fn(async () => undefined),
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
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders a compact public catalog masthead with integrated controls', async () => {
    const publicItems = [createPublicCatalogItem()]
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    expect(await screen.findByRole('heading', { name: publicItems[0].title })).toBeInTheDocument()
    const masthead = screen.getByTestId('catalog-public-masthead')
    expect(within(masthead).getByRole('heading', { name: 'Buscar en Nexo' })).toBeVisible()
    expect(within(masthead).getByLabelText('Buscar en el catalogo publico')).toBeVisible()
    expect(within(masthead).getByLabelText('Tipo de obra')).toBeVisible()
    expect(within(masthead).getByRole('button', { name: 'Buscar' })).toBeVisible()
    const summary = within(masthead).getByLabelText('Resumen del catalogo')
    expect(within(summary).getByText('1 de 1')).toBeVisible()
    expect(within(summary).getByText('Todo')).toBeVisible()
    expect(masthead).not.toHaveTextContent('Biblioteca conectada')
  })

  it('marks public catalog entries already saved in the library while keeping compact actions accessible', async () => {
    const publicItem = createPublicCatalogItem()
    const savedItem = discoveryToListItem(publicItemToDiscovery(publicItem))
    const { library } = createLibrarySurface({ items: [savedItem], publicItems: [publicItem] })

    renderCatalog(library)

    const card = await getCatalogCard(publicItem.title)
    expect(within(screen.getByTestId('catalog-public-masthead')).getByText('1 guardada')).toBeVisible()
    const savedButton = card.getByRole('button', { name: 'Guardado' })
    expect(savedButton).toBeDisabled()
    expect(card.getByRole('button', { name: `Revisar después ${publicItem.title}` })).toBeEnabled()
    expect(card.getByRole('button', { name: `Ver ficha de ${publicItem.title}` })).toBeEnabled()
    expect(screen.queryByText('Biblioteca conectada')).not.toBeInTheDocument()

    await userEvent.click(card.getByRole('button', { name: `Ver ficha de ${publicItem.title}` }))
    const dialog = screen.getByRole('dialog', { name: publicItem.title })
    expect(within(dialog).getByRole('button', { name: 'Guardado' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Revisar después' })).toBeEnabled()
  })

  it('keeps long public descriptions out of the gallery card and in the detail dialog', async () => {
    const publicItem = createPublicCatalogItem()
    const { library } = createLibrarySurface({ publicItems: [publicItem] })

    renderCatalog(library)

    const card = await getCatalogCard(publicItem.title)
    expect(card.queryByText(/Fantasia contemplativa/)).not.toBeInTheDocument()

    await userEvent.click(card.getByRole('button', { name: `Ver ficha de ${publicItem.title}` }))

    const dialog = screen.getByRole('dialog', { name: publicItem.title })
    expect(dialog).toHaveTextContent('Fantasia contemplativa')
    expect(within(dialog).getByRole('button', { name: `Cerrar ficha de ${publicItem.title}` })).toBeVisible()
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

  it('offers to place a newly saved result in Despues from the confirmation', async () => {
    const publicItem = createPublicCatalogItem()
    const savedItem = discoveryToListItem(publicItemToDiscovery(publicItem))
    const { library } = createLibrarySurface({ publicItems: [publicItem] })
    renderCatalog(library)

    const card = await getCatalogCard(publicItem.title)
    await userEvent.click(card.getByRole('button', { name: 'Guardar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Poner en Despues' }))

    expect(library.applyRoadmapMutation).toHaveBeenCalledWith({
      roadmap: { now: [], next: [savedItem.id], later: [], hidden: [] },
    })
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
    expect(library.searchCatalog).toHaveBeenCalledWith('Catalog', 'any')
    expect(screen.getByRole('heading', { name: 'Catalog Item 24' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Catalog Item 25' })).not.toBeInTheDocument()
  })

  it('searches Dune across the whole Nexo catalog when Todo is selected', async () => {
    const publicItems = [
      createPublicCatalogItem(1, { id: 'movie-dune-2021', title: 'Dune', type: 'movie' }),
      createPublicCatalogItem(2, { id: 'book-dune', title: 'Dune', type: 'book' }),
      createPublicCatalogItem(3, { id: 'movie-arrival', title: 'Arrival', type: 'movie' }),
    ]
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Arrival' })
    await userEvent.type(screen.getByLabelText('Buscar en el catalogo publico'), 'Dune')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(library.searchCatalog).toHaveBeenCalledWith('Dune', 'any'))
    expect(window.location.search).toBe('?tab=discover&mode=search&q=Dune')
    expect(screen.getAllByRole('heading', { name: 'Dune' })).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Arrival' })).not.toBeInTheDocument()
  })

  it('uses search-specific empty copy when the catalog has no matches', async () => {
    const publicItems = [
      createPublicCatalogItem(1, { id: 'movie-arrival', title: 'Arrival', type: 'movie' }),
    ]
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Arrival' })
    await userEvent.type(screen.getByLabelText('Buscar en el catalogo publico'), 'Solaris')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(library.searchCatalog).toHaveBeenCalledWith('Solaris', 'any'))
    expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Catalogo en blanco' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar busqueda' })).toBeVisible()
  })

  it('shows a loading state before declaring the public catalog empty', async () => {
    const initialLoad = createDeferred<PublicCatalogItem[]>()
    const { library } = createLibrarySurface({ publicItems: [] })
    library.listPublicCatalog = vi.fn(() => initialLoad.promise)

    renderCatalog(library)

    expect(screen.getByRole('heading', { name: 'Cargando catalogo' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Catalogo en blanco' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recargar catalogo' })).not.toBeInTheDocument()

    initialLoad.resolve([])

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Catalogo en blanco' })).toBeVisible())
    expect(screen.queryByRole('heading', { name: 'Cargando catalogo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar catalogo' })).toBeVisible()
  })

  it('shows a routed search loading state before declaring no catalog results', async () => {
    window.history.replaceState(null, '', '/?catalogQ=Solaris')
    const searchLoad = createDeferred<DiscoveryCandidate[]>()
    const { library } = createLibrarySurface({ publicItems: [] })
    library.searchCatalog = vi.fn(() => searchLoad.promise)

    renderCatalog(library)

    expect(screen.getByRole('heading', { name: 'Buscando en el catalogo' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Sin resultados' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar busqueda' })).not.toBeInTheDocument()

    searchLoad.resolve([])

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeVisible())
    expect(screen.queryByRole('heading', { name: 'Buscando en el catalogo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar busqueda' })).toBeVisible()
  })

  it('hydrates public search from the URL instead of loading the default catalog', async () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune')
    const initialCatalog = [
      createPublicCatalogItem(1, { id: 'movie-arrival', title: 'Arrival', type: 'movie' }),
    ]
    const duneResults = [
      createPublicCatalogItem(2, { id: 'movie-dune-2021', title: 'Dune', type: 'movie' }),
      createPublicCatalogItem(3, { id: 'book-dune', title: 'Dune', type: 'book' }),
    ]
    const { library } = createLibrarySurface({ publicItems: initialCatalog })
    library.listPublicCatalog = vi.fn(async () => initialCatalog)
    library.searchCatalog = vi.fn(async () => duneResults.map(publicItemToDiscovery))

    renderCatalog(library)

    await waitFor(() => expect(library.searchCatalog).toHaveBeenCalledWith('Dune', 'any'))
    expect(library.listPublicCatalog).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Buscar en el catalogo publico')).toHaveValue('Dune')
    expect(screen.getAllByRole('heading', { name: 'Dune' })).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Arrival' })).not.toBeInTheDocument()
  })

  it('hydrates exactly once in StrictMode', async () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune')
    const dune = createPublicCatalogItem(1, { id: 'book-dune', title: 'Dune', type: 'book' })
    const { library } = createLibrarySurface({ publicItems: [dune] })
    library.searchCatalog = vi.fn(async () => [publicItemToDiscovery(dune)])

    render(
      <StrictMode>
        <CatalogTab
          isSignedIn
          library={library}
          onActivity={vi.fn()}
          onNavigate={vi.fn()}
          onSignIn={vi.fn()}
        />
      </StrictMode>,
    )

    expect(await screen.findByRole('heading', { name: 'Dune' })).toBeVisible()
    expect(library.searchCatalog).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a routed authenticated search when callbacks or loading state rerender', async () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune')
    const dune = createPublicCatalogItem(1, { id: 'book-dune', title: 'Dune', type: 'book' })
    const { library } = createLibrarySurface({ publicItems: [dune] })
    library.searchCatalog = vi.fn(async () => [publicItemToDiscovery(dune)])
    const view = render(
      <CatalogTab
        isSignedIn
        library={library}
        onActivity={vi.fn()}
        onNavigate={vi.fn()}
        onSignIn={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Dune' })).toBeVisible()
    view.rerender(
      <CatalogTab
        isSignedIn
        library={{ ...library, loading: true }}
        onActivity={vi.fn()}
        onNavigate={vi.fn()}
        onSignIn={vi.fn()}
      />,
    )
    view.rerender(
      <CatalogTab
        isSignedIn
        library={{ ...library, loading: false }}
        onActivity={vi.fn()}
        onNavigate={vi.fn()}
        onSignIn={vi.fn()}
      />,
    )
    await act(async () => undefined)

    expect(library.searchCatalog).toHaveBeenCalledTimes(1)
  })

  it('records activity only once after an explicit successful submit', async () => {
    const dune = createPublicCatalogItem(1, { id: 'book-dune', title: 'Dune', type: 'book' })
    const { library } = createLibrarySurface({ publicItems: [dune] })
    const onActivity = vi.fn()
    render(
      <CatalogTab
        isSignedIn
        library={library}
        onActivity={onActivity}
        onNavigate={vi.fn()}
        onSignIn={vi.fn()}
      />,
    )

    await screen.findByRole('heading', { name: 'Dune' })
    await userEvent.type(screen.getByLabelText('Buscar en el catalogo publico'), 'Dune')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(onActivity).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(library.searchCatalog).toHaveBeenCalledTimes(1)
    expect(onActivity).toHaveBeenCalledTimes(1)
  })

  it('forces a fresh request when retrying a failed or empty search', async () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune')
    const dune = createPublicCatalogItem(1, { id: 'book-dune', title: 'Dune', type: 'book' })
    const { library } = createLibrarySurface({ publicItems: [] })
    library.searchCatalog = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([publicItemToDiscovery(dune)])

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Sin resultados' })
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar busqueda' }))

    expect(await screen.findByRole('heading', { name: 'Dune' })).toBeVisible()
    expect(library.searchCatalog).toHaveBeenCalledTimes(2)
  })

  it('writes catalog type URL state when filtering without a query', async () => {
    const publicItems = [
      createPublicCatalogItem(1, { title: 'Chainsaw Man', type: 'manga' }),
      createPublicCatalogItem(2, { title: 'Dune', type: 'book' }),
    ]
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Chainsaw Man' })
    await userEvent.selectOptions(screen.getByLabelText('Tipo de obra'), 'book')

    await waitFor(() => expect(library.searchPublicCatalog).toHaveBeenCalledWith('', 'book'))
    expect(window.location.search).toBe('?tab=discover&mode=search&type=book')
    expect(screen.getByRole('heading', { name: 'Dune' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chainsaw Man' })).not.toBeInTheDocument()
  })

  it('restores catalog searches from browser history popstate', async () => {
    const publicItems = [
      createPublicCatalogItem(1, { id: 'movie-arrival', title: 'Arrival', type: 'movie' }),
      createPublicCatalogItem(2, { id: 'movie-dune-2021', title: 'Dune', type: 'movie' }),
      createPublicCatalogItem(3, { id: 'book-dune', title: 'Dune', type: 'book' }),
    ]
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Arrival' })
    act(() => {
      window.history.pushState(null, '', '/?catalogQ=Dune&catalogType=watch')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await waitFor(() => expect(library.searchCatalog).toHaveBeenCalledWith('Dune', 'watch'))
    expect(screen.getByLabelText('Buscar en el catalogo publico')).toHaveValue('Dune')
    expect(screen.getByLabelText('Tipo de obra')).toHaveValue('watch')
    expect(screen.getAllByRole('heading', { name: 'Dune' })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Arrival' })).not.toBeInTheDocument()
  })

  it('lets an immediate popstate replace the pending initial hydration', async () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune')
    const solaris = createPublicCatalogItem(1, { id: 'book-solaris', title: 'Solaris', type: 'book' })
    const { library } = createLibrarySurface({ publicItems: [solaris] })
    library.searchCatalog = vi.fn(async (query: string) => (
      query === 'Solaris' ? [publicItemToDiscovery(solaris)] : []
    ))

    renderCatalog(library)
    act(() => {
      window.history.pushState(null, '', '/?catalogQ=Solaris&catalogType=book')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByRole('heading', { name: 'Solaris' })).toBeVisible()
    await new Promise((resolve) => window.setTimeout(resolve, 10))
    expect(library.searchCatalog).toHaveBeenCalledTimes(1)
    expect(library.searchCatalog).toHaveBeenCalledWith('Solaris', 'book')
  })

  it('clears catalog route state and reloads the public catalog', async () => {
    const publicItems = [
      createPublicCatalogItem(1, { id: 'movie-arrival', title: 'Arrival', type: 'movie' }),
      createPublicCatalogItem(2, { id: 'movie-dune-2021', title: 'Dune', type: 'movie' }),
    ]
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Arrival' })
    await userEvent.type(screen.getByLabelText('Buscar en el catalogo publico'), 'Dune')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(window.location.search).toBe('?tab=discover&mode=search&q=Dune'))

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar busqueda del catalogo' }))

    await waitFor(() => expect(window.location.search).toBe('?tab=discover&mode=search'))
    expect(screen.getByLabelText('Buscar en el catalogo publico')).toHaveValue('')
    expect(screen.getByLabelText('Tipo de obra')).toHaveValue('any')
    expect(screen.getByRole('heading', { name: 'Arrival' })).toBeInTheDocument()
  })

  it('keeps search results when an older catalog load resolves later', async () => {
    const initialCatalog = [
      createPublicCatalogItem(1, { id: 'movie-arrival', title: 'Arrival', type: 'movie' }),
    ]
    const duneResults = [
      createPublicCatalogItem(2, { id: 'movie-dune-2021', title: 'Dune', type: 'movie' }),
      createPublicCatalogItem(3, { id: 'book-dune', title: 'Dune', type: 'book' }),
    ]
    const initialLoad = createDeferred<PublicCatalogItem[]>()
    const { library } = createLibrarySurface({ publicItems: initialCatalog })
    library.listPublicCatalog = vi.fn(() => initialLoad.promise)
    library.searchCatalog = vi.fn(async () => duneResults.map(publicItemToDiscovery))

    renderCatalog(library)

    const searchInput = screen.getByLabelText('Buscar en el catalogo publico')
    await userEvent.type(searchInput, 'Dune')
    fireEvent.submit(searchInput.closest('form') as HTMLFormElement)

    await waitFor(() => expect(library.searchCatalog).toHaveBeenCalledWith('Dune', 'any'))
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Dune' })).toHaveLength(2))
    expect(searchInput).toHaveValue('Dune')
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando 2 de 2 resultados para explorar.')

    initialLoad.resolve(initialCatalog)

    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Dune' })).toHaveLength(2))
    expect(searchInput).toHaveValue('Dune')
    expect(screen.queryByRole('heading', { name: 'Arrival' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando 2 de 2 resultados para explorar.')
  })

  it('cancels an active search as soon as the query changes', async () => {
    const arrival = createPublicCatalogItem(1, { id: 'movie-arrival', title: 'Arrival', type: 'movie' })
    const { library } = createLibrarySurface({ publicItems: [arrival] })
    let duneSignal: AbortSignal | undefined
    library.searchCatalogRequest = vi.fn(async (request): Promise<CatalogSearchResult> => {
      if (!request.query) {
        return { candidates: [publicItemToDiscovery(arrival)], partial: false, sources: ['publicCatalog'] }
      }
      duneSignal = request.signal
      return new Promise<CatalogSearchResult>((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true })
      })
    })

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Arrival' })
    const input = screen.getByLabelText('Buscar en el catalogo publico')
    await userEvent.type(input, 'Dune')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(library.searchCatalogRequest).toHaveBeenCalledTimes(2))
    await userEvent.type(input, ' 2')

    expect(duneSignal?.aborted).toBe(true)
    expect(input).toHaveValue('Dune 2')
    expect(screen.queryByRole('heading', { name: 'Buscando en el catalogo' })).not.toBeInTheDocument()
  })

  it('filters the Nexo catalog by type without requiring a query', async () => {
    const publicItems = [
      createPublicCatalogItem(1, { title: 'Chainsaw Man', type: 'manga' }),
      createPublicCatalogItem(2, { title: 'Solo Leveling', type: 'manhwa' }),
      createPublicCatalogItem(3, { title: 'Frieren Anime', type: 'anime' }),
    ]
    const { library } = createLibrarySurface({ publicItems })

    renderCatalog(library)

    await screen.findByRole('heading', { name: 'Chainsaw Man' })
    await userEvent.selectOptions(screen.getByLabelText('Tipo de obra'), 'manga')

    await waitFor(() => expect(library.searchPublicCatalog).toHaveBeenCalledWith('', 'manga'))
    expect(screen.getByRole('heading', { name: 'Chainsaw Man' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Solo Leveling' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Frieren Anime' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando 1 de 1 obras del catalogo.')
  })
})
