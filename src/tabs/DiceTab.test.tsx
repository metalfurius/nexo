import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from '../app/shared'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import DiceTab from './DiceTab'

function item(id: string, title: string): ListItem {
  return {
    id,
    title,
    type: 'book',
    status: 'wishlist',
    genres: ['Fantasia'],
    tags: ['Aventura'],
    moodTags: ['Inmersivo'],
    weights: { ...DEFAULT_WEIGHTS },
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function createLibrarySurface(items: ListItem[]): LibrarySurface {
  return {
    items,
    settings: { ...DEFAULT_SETTINGS },
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

function installMatchMedia(matches: boolean) {
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

function renderDice(library: LibrarySurface, overrides: Partial<Parameters<typeof DiceTab>[0]> = {}) {
  const props: Parameters<typeof DiceTab>[0] = {
    library,
    onActivity: vi.fn(),
    onCooldownReactivateRequestHandled: vi.fn(),
    onRollRequestHandled: vi.fn(),
    onRollSummaryChange: vi.fn(),
    onSaveRequestHandled: vi.fn(),
    onUnsavedChange: vi.fn(),
    ...overrides,
  }
  return render(<DiceTab {...props} />)
}

describe('DiceTab experience', () => {
  beforeEach(() => installMatchMedia(false))

  afterEach(() => {
    vi.useRealTimers()
  })

  it('presents the roll as a compact three-step flow with four visual candidates', () => {
    const library = createLibrarySurface([
      item('one', 'Uno'),
      item('two', 'Dos'),
      item('three', 'Tres'),
      item('four', 'Cuatro'),
      item('five', 'Cinco'),
    ])

    renderDice(library)

    const steps = screen.getByRole('list', { name: 'Tirar, decidir y afinar' })
    expect(steps).toHaveTextContent('1Tirar2Decidir3Afinar')
    expect(within(steps).getByText('Tirar').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(within(screen.getByTestId('dice-readiness')).getAllByRole('button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Tirar dado ponderado' })).toBeEnabled()
  })

  it('keeps the rolling slot stable for 420ms and then reveals the decision', async () => {
    vi.useFakeTimers()
    const library = createLibrarySurface([item('one', 'Uno'), item('two', 'Dos')])
    renderDice(library)

    fireEvent.click(screen.getByTestId('roll-button'))
    expect(screen.getByTestId('recommendation-result')).toHaveTextContent('Eligiendo entre 2')

    act(() => vi.advanceTimersByTime(419))
    expect(screen.getByTestId('recommendation-result')).toHaveTextContent('Eligiendo entre 2')

    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByTestId('recommendation-result')).toHaveTextContent('Dado eligio')
    expect(screen.getByText('Decidir').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(library.recordRecommendation).toHaveBeenCalledTimes(1)
  })

  it('keeps the roll locked until its recommendation has been persisted', async () => {
    installMatchMedia(true)
    let finishRecording: (() => void) | undefined
    const library = createLibrarySurface([item('one', 'Uno'), item('two', 'Dos')])
    library.recordRecommendation = vi.fn(() => new Promise<void>((resolve) => { finishRecording = resolve }))
    renderDice(library)

    const roll = screen.getByTestId('roll-button')
    fireEvent.click(roll)
    expect(roll).toBeDisabled()
    expect(screen.getByTestId('recommendation-result')).toHaveTextContent('Eligiendo entre 2')

    fireEvent.click(roll)
    expect(library.recordRecommendation).toHaveBeenCalledTimes(1)

    await act(async () => finishRecording?.())
    await waitFor(() => expect(screen.getByTestId('recommendation-result')).toHaveTextContent('Dado eligio'))
    expect(roll).toBeEnabled()
  })

  it('settles an external roll request when the tab unmounts during its reveal delay', async () => {
    vi.useFakeTimers()
    const library = createLibrarySurface([item('one', 'Uno'), item('two', 'Dos')])
    const onRollRequestHandled = vi.fn()
    const view = renderDice(library, {
      onRollRequestHandled,
      rollRequest: { requestId: 1, scope: 'all' },
    })

    await act(async () => vi.advanceTimersByTimeAsync(0))
    expect(library.recordRecommendation).toHaveBeenCalledTimes(1)

    await act(async () => {
      view.unmount()
      await Promise.resolve()
    })
    expect(onRollRequestHandled).toHaveBeenCalledTimes(1)
  })

  it('removes motion delay when requested and serializes a decision mutation', async () => {
    installMatchMedia(true)
    let finishSnooze: (() => void) | undefined
    const library = createLibrarySurface([item('one', 'Uno'), item('two', 'Dos')])
    library.snoozeRecommendation = vi.fn(() => new Promise<void>((resolve) => { finishSnooze = resolve }))
    renderDice(library)

    fireEvent.click(screen.getByTestId('roll-button'))
    await waitFor(() => expect(screen.getByTestId('recommendation-result')).toHaveTextContent('Dado eligio'))

    const skip = screen.getByRole('button', { name: 'No hoy' })
    fireEvent.click(skip)
    fireEvent.click(skip)
    expect(library.snoozeRecommendation).toHaveBeenCalledTimes(1)
    expect(skip).toBeDisabled()
    expect(screen.getByTestId('roll-button')).toBeDisabled()

    await act(async () => finishSnooze?.())
    await waitFor(() => expect(screen.getByTestId('dice-decision-summary')).toHaveTextContent('Decision cerrada'))
    expect(within(screen.getByRole('list', { name: 'Tirar, decidir y afinar' })).getByText('Afinar').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})
