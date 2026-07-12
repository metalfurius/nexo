import { render, screen, waitFor, within } from '@testing-library/react'
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
    .map((article) => article.querySelector('.roadmap-card-main strong')?.textContent)
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
    expect(titlesInLane(/Mas adelante/)).toEqual(['Paused'])
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Completadas recientes' })).getByRole('button', { name: /Done/ })).toBeVisible()
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

  it('shows five entries per lane on desktop until the user expands it', async () => {
    const user = userEvent.setup()
    const items = Array.from({ length: 6 }, (_, index) => item(`item-${index + 1}`, `Item ${index + 1}`))
    const library = createLibrarySurface(items, {
      now: [],
      next: items.map(({ id }) => id),
      later: [],
      hidden: [],
    })
    renderHome(library)

    expect(screen.queryByText('Item 6')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver todas (6)' }))
    expect(screen.getAllByText('Item 6')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toBeVisible()
  })

  it('shows only three entries per lane on compact mobile layouts', () => {
    installMatchMedia(true)
    const items = Array.from({ length: 4 }, (_, index) => item(`mobile-${index + 1}`, `Mobile ${index + 1}`))
    renderHome(createLibrarySurface(items, {
      now: [],
      next: items.map(({ id }) => id),
      later: [],
      hidden: [],
    }))

    expect(screen.getAllByText('Mobile 3').length).toBeGreaterThan(0)
    expect(screen.queryByText('Mobile 4')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver todas (4)' })).toBeVisible()
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
