import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from '../app/shared'
import {
  DEFAULT_ROADMAP_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  type ItemStatus,
  type ListItem,
  type RoadmapPreferences,
} from '../domain/types'
import HomeTab from './HomeTab'

function item(
  id: string,
  title: string,
  status: ItemStatus = 'wishlist',
  priority = 1,
  updatedAt = '2026-01-01T00:00:00.000Z',
): ListItem {
  return {
    id,
    title,
    type: 'book',
    status,
    genres: [],
    tags: [],
    moodTags: [],
    weights: { ...DEFAULT_WEIGHTS, priority },
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  }
}

function createLibrarySurface(
  items: ListItem[] = [],
  roadmap: RoadmapPreferences = DEFAULT_ROADMAP_PREFERENCES,
): LibrarySurface {
  return {
    items,
    settings: {
      ...DEFAULT_SETTINGS,
      roadmap: {
        now: [...roadmap.now],
        next: [...roadmap.next],
        later: [...roadmap.later],
        hidden: [...roadmap.hidden],
      },
    },
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
      remote: false,
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
    saveDiscoveryToLibrary: vi.fn(async () => {
      throw new Error('Unexpected saveDiscoveryToLibrary call')
    }),
    recordImportedItemToPublicCatalog: vi.fn(async () => undefined),
    upsertPublicItem: vi.fn(async () => {
      throw new Error('Unexpected upsertPublicItem call')
    }),
    replacePublicItem: vi.fn(async (publicItem) => publicItem),
    archivePublicItem: vi.fn(async () => undefined),
    restorePublicItem: vi.fn(async () => undefined),
    updateUserRole: vi.fn(async () => undefined),
    recordActivity: vi.fn(),
    clearActivityEntries: vi.fn(async () => undefined),
    restoreActivityEntries: vi.fn(async () => undefined),
    publicItemToDiscovery: vi.fn(() => {
      throw new Error('Unexpected publicItemToDiscovery call')
    }),
    externalCandidateToDiscovery: vi.fn(() => {
      throw new Error('Unexpected externalCandidateToDiscovery call')
    }),
  }
}

function renderHome(library: LibrarySurface, overrides: Partial<Parameters<typeof HomeTab>[0]> = {}) {
  const props: Parameters<typeof HomeTab>[0] = {
    activityClearCount: 0,
    library,
    onActivity: vi.fn(),
    onAdd: vi.fn(),
    onClearActivity: vi.fn(),
    onNavigate: vi.fn(),
    onOpenItem: vi.fn(),
    onRollDice: vi.fn(),
    onUndoClearActivity: vi.fn(),
    ...overrides,
  }
  return { ...render(<HomeTab {...props} />), props }
}

function titlesInLane(name: RegExp) {
  return within(screen.getByRole('region', { name }))
    .getAllByRole('article')
    .map((article) => article.querySelector('.roadmap-card-main > span > strong')?.textContent)
}

function installMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('HomeTab', () => {
  beforeEach(() => installMatchMedia(false))

  it('guides an empty library through the first add and discover actions', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onNavigate = vi.fn()
    renderHome(createLibrarySurface(), { onAdd, onNavigate })

    expect(screen.getByRole('heading', { name: /Construye una ruta/ })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Primeros pasos de Nexo' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Decide/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /A.adir primera obra/ }))
    await user.click(screen.getByRole('button', { name: /Descubre/ }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith('discover')
  })

  it('renders manual order, automatic suggestions, active work and recent completions in their lanes', () => {
    const library = createLibrarySurface(
      [
        item('active', 'Active', 'in_progress'),
        item('manual-a', 'Manual A'),
        item('manual-b', 'Manual B'),
        item('automatic', 'Automatic', 'wishlist', 9),
        item('paused', 'Paused', 'paused'),
        item('hidden', 'Hidden', 'wishlist', 20),
        item('done', 'Done', 'completed', 1, '2026-06-01T00:00:00.000Z'),
      ],
      {
        now: [],
        next: ['manual-b', 'manual-a'],
        later: [],
        hidden: ['hidden'],
      },
    )

    renderHome(library)

    expect(titlesInLane(/^Ahora$/)).toEqual(['Active'])
    expect(titlesInLane(/Despu.s/)).toEqual(['Manual B', 'Manual A', 'Automatic'])
    expect(titlesInLane(/M.s adelante/)).toEqual(['Paused'])
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Completadas recientes' })).getByRole('button', { name: /Done/ })).toBeVisible()
  })

  it('keeps only the visible hero eager and degrades broken or missing covers accessibly', () => {
    const longTitle = 'L'.repeat(200)
    const hero = { ...item('hero', longTitle, 'in_progress'), posterUrl: 'https://images.example.test/broken.jpg' }
    const companion = { ...item('companion', 'Companion', 'in_progress'), posterUrl: 'https://images.example.test/companion.jpg' }
    const next = { ...item('next-cover', 'Next cover'), posterUrl: 'https://images.example.test/next.jpg' }
    const later = item('later-missing', 'Later missing', 'paused')
    const done = { ...item('done-cover', 'Done cover', 'completed'), posterUrl: 'https://images.example.test/done.jpg' }
    const { container } = renderHome(createLibrarySurface(
      [hero, companion, next, later, done],
      { hidden: [], later: [], next: ['next-cover'], now: [] },
    ))

    const heroButton = container.querySelector('.journey-feature-main') as HTMLButtonElement
    const heroCover = heroButton.querySelector('.cover-art') as HTMLElement
    const heroImage = heroCover.querySelector('img') as HTMLImageElement
    expect(heroButton).toHaveAccessibleName(new RegExp(longTitle))
    expect(heroCover).toHaveAttribute('aria-hidden', 'true')
    expect(heroCover).toHaveClass('cover-art-hero')
    expect(heroImage).toHaveAttribute('alt', '')
    expect(heroImage).toHaveAttribute('loading', 'eager')
    expect(heroImage).toHaveAttribute('fetchpriority', 'high')

    const allImages = [...container.querySelectorAll('.cover-art img')]
    expect(allImages.filter((image) => image.getAttribute('loading') === 'eager')).toEqual([heroImage])
    for (const image of allImages.filter((entry) => entry !== heroImage)) {
      expect(image).toHaveAttribute('loading', 'lazy')
      expect(image).not.toHaveAttribute('fetchpriority')
    }

    fireEvent.error(heroImage)
    expect(heroCover).toHaveClass('fallback-cover')
    expect(heroCover.querySelector('img')).toBeNull()
    expect(heroCover.querySelector('.cover-art-title')).toHaveTextContent('L'.repeat(48))

    const laterCard = screen.getByLabelText('Organizar Later missing').closest('article') as HTMLElement
    expect(laterCard.querySelector('.cover-art')).toHaveClass('fallback-cover')
    expect(laterCard.querySelector('.cover-art img')).toBeNull()
    expect([...container.querySelectorAll('.cover-art')].every((cover) => cover.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('starts a next item through one atomic roadmap mutation', async () => {
    const user = userEvent.setup()
    const onActivity = vi.fn()
    const library = createLibrarySurface([item('next', 'Next')], {
      now: [],
      next: ['next'],
      later: [],
      hidden: [],
    })
    renderHome(library, { onActivity })

    expect(screen.getByLabelText('Resumen de Tu ruta')).toHaveTextContent('1 próximo0 después')
    const nextLane = screen.getByRole('region', { name: 'Después' })
    expect(nextLane.querySelector('.atlas-section-heading > strong')).toHaveTextContent('0')
    expect(within(nextLane).getByText('Busca lo siguiente')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Empezar ahora' }))

    await waitFor(() => expect(library.applyRoadmapMutation).toHaveBeenCalledWith({
      roadmap: { now: ['next'], next: [], later: [], hidden: [] },
      item: { kind: 'status', itemId: 'next', status: 'in_progress' },
    }))
    expect(screen.getByRole('status')).toHaveTextContent('Next pasa a Ahora')
    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ label: 'Tu ruta actualizada', tab: 'home' }))

    await user.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(library.applyRoadmapMutation).toHaveBeenNthCalledWith(2, {
      roadmap: { now: [], next: ['next'], later: [], hidden: [] },
      item: { kind: 'status', itemId: 'next', status: 'wishlist' },
    }))
  })

  it('reorders a manually placed lane with explicit controls', async () => {
    const user = userEvent.setup()
    const library = createLibrarySurface([item('alpha', 'Alpha'), item('beta', 'Beta')], {
      now: [],
      next: ['alpha', 'beta'],
      later: [],
      hidden: [],
    })
    renderHome(library)
    const alphaCard = screen.getByLabelText('Organizar Alpha').closest('article') as HTMLElement

    await user.click(within(alphaCard).getByLabelText('Organizar Alpha'))
    await user.click(within(alphaCard).getByRole('button', { name: /Bajar/ }))

    await waitFor(() => expect(library.applyRoadmapMutation).toHaveBeenCalledWith({
      roadmap: { now: [], next: ['beta', 'alpha'], later: [], hidden: [] },
    }))
  })

  it('materializes an automatic lane before reordering so reload keeps the relative order', async () => {
    const user = userEvent.setup()
    const library = createLibrarySurface([
      item('alpha', 'Alpha', 'wishlist', 9),
      item('beta', 'Beta', 'wishlist', 8),
      item('gamma', 'Gamma', 'wishlist', 7),
    ])
    renderHome(library)
    const alphaCard = screen.getByLabelText('Organizar Alpha').closest('article') as HTMLElement

    await user.click(within(alphaCard).getByLabelText('Organizar Alpha'))
    await user.click(within(alphaCard).getByRole('button', { name: /Bajar/ }))

    await waitFor(() => expect(library.applyRoadmapMutation).toHaveBeenCalledWith({
      roadmap: { now: [], next: ['beta', 'alpha', 'gamma'], later: [], hidden: [] },
    }))
  })

  it('hides an automatic suggestion so it cannot return automatically', async () => {
    const user = userEvent.setup()
    const library = createLibrarySurface([item('alpha', 'Alpha')])
    renderHome(library)
    const alphaCard = screen.getByLabelText('Organizar Alpha').closest('article') as HTMLElement

    await user.click(within(alphaCard).getByLabelText('Organizar Alpha'))
    await user.click(within(alphaCard).getByRole('button', { name: /Quitar de la ruta/ }))

    await waitFor(() => expect(library.applyRoadmapMutation).toHaveBeenCalledWith({
      roadmap: { now: [], next: [], later: [], hidden: ['alpha'] },
    }))
  })

  it('shows a promoted chapter plus four next cards on desktop until the user expands them', async () => {
    const user = userEvent.setup()
    const items = Array.from({ length: 6 }, (_, index) => item(`item-${index + 1}`, `Item ${index + 1}`))
    const library = createLibrarySurface(items, {
      now: [],
      next: items.map(({ id }) => id),
      later: [],
      hidden: [],
    })
    renderHome(library)

    expect(screen.getAllByText('Item 1').length).toBeGreaterThan(0)
    expect(screen.queryByText('Item 6')).not.toBeInTheDocument()
    const expand = screen.getByRole('button', { name: 'Ver 1 más' })
    expect(expand).toHaveAttribute('aria-controls', 'home-next-list')
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.click(expand)
    expect(screen.getAllByText('Item 6').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows only three entries per lane on compact mobile layouts', () => {
    installMatchMedia(true)
    const items = Array.from({ length: 5 }, (_, index) => item(`mobile-${index + 1}`, `Mobile ${index + 1}`))
    renderHome(createLibrarySurface(items, {
      now: [],
      next: items.map(({ id }) => id),
      later: [],
      hidden: [],
    }))

    expect(screen.getAllByText('Mobile 3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mobile 4').length).toBeGreaterThan(0)
    expect(screen.queryByText('Mobile 5')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver 1 más' })).toBeVisible()
  })

  it('keeps a stable loading skeleton instead of exposing a false empty state', () => {
    const library = createLibrarySurface()
    library.loading = true

    renderHome(library)

    expect(screen.getByRole('region', { name: 'Cargando Tu ruta' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('heading', { name: /Construye una ruta/ })).not.toBeInTheDocument()
  })

  it('blocks a second roadmap mutation while the first write is pending', async () => {
    const user = userEvent.setup()
    let finishMutation: (() => void) | undefined
    const library = createLibrarySurface([item('next', 'Next')], {
      now: [],
      next: ['next'],
      later: [],
      hidden: [],
    })
    library.applyRoadmapMutation = vi.fn(() => new Promise<void>((resolve) => {
      finishMutation = resolve
    }))
    renderHome(library)

    const start = screen.getByRole('button', { name: 'Empezar ahora' })
    await user.dblClick(start)

    expect(library.applyRoadmapMutation).toHaveBeenCalledTimes(1)
    expect(start).toBeDisabled()
    const menu = screen.getByLabelText('Organizar Next').closest('details') as HTMLDetailsElement
    await user.click(screen.getByLabelText('Organizar Next'))
    expect(menu.open).toBe(false)
    finishMutation?.()
    await waitFor(() => expect(start).not.toBeDisabled())
  })

  it('surfaces mutation failures and restores every blocked control', async () => {
    const user = userEvent.setup()
    const library = createLibrarySurface([item('next', 'Next')], {
      now: [],
      next: ['next'],
      later: [],
      hidden: [],
    })
    library.applyRoadmapMutation = vi.fn(async () => {
      throw new Error('La ruta no se pudo guardar')
    })
    renderHome(library)

    const start = screen.getByRole('button', { name: 'Empezar ahora' })
    await user.click(start)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('La ruta no se pudo guardar'))
    expect(start).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()
  })

  it('prioritizes the next lane for Dice and falls back to all eligible items', async () => {
    const user = userEvent.setup()
    const nextRoll = vi.fn()
    const { unmount } = renderHome(
      createLibrarySurface([item('next', 'Next')], { now: [], next: ['next'], later: [], hidden: [] }),
      { onRollDice: nextRoll },
    )

    await user.click(screen.getByRole('button', { name: /Elegir con Dado/ }))
    expect(nextRoll).toHaveBeenCalledWith('roadmap-next')

    unmount()
    const allRoll = vi.fn()
    renderHome(createLibrarySurface([item('paused', 'Paused', 'paused')]), { onRollDice: allRoll })
    await user.click(screen.getByRole('button', { name: /Elegir con Dado/ }))
    expect(allRoll).toHaveBeenCalledWith('all')
  })
})
