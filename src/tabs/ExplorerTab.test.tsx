import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type DiscoveryCandidate, type ListItem } from '../domain/types'
import type { LibrarySurface } from '../app/shared'
import ExplorerTab from './ExplorerTab'

function createCandidate(
  id: string,
  title: string,
  overrides: Partial<DiscoveryCandidate> = {},
): DiscoveryCandidate {
  return {
    id,
    title,
    type: 'book',
    status: 'queued',
    origin: 'externalSearch',
    source: 'openLibrary',
    sourceId: id,
    genres: ['Ciencia ficción', 'Aventura', 'Drama'],
    tags: [],
    moodTags: [],
    externalRefs: { openLibraryKey: id },
    overview: 'Una obra encontrada para decidir si merece un lugar en tu biblioteca.',
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  }
}

function itemFromCandidate(candidate: DiscoveryCandidate): ListItem {
  return {
    id: `item-${candidate.id}`,
    title: candidate.title,
    type: candidate.type,
    status: 'wishlist',
    genres: candidate.genres,
    tags: candidate.tags,
    moodTags: candidate.moodTags,
    weights: DEFAULT_WEIGHTS,
    notes: '',
    source: 'external',
    externalRefs: candidate.externalRefs,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function createLibrarySurface(discoveryCandidates: DiscoveryCandidate[] = [], overrides: Partial<LibrarySurface> = {}) {
  return {
    items: [],
    settings: DEFAULT_SETTINGS,
    discoveryCandidates,
    isModerator: false,
    dismissDiscoveryCandidate: vi.fn().mockResolvedValue(undefined),
    restoreDiscoveryCandidate: vi.fn().mockResolvedValue(undefined),
    saveDiscoveryToLibrary: vi.fn(async (candidate: DiscoveryCandidate) => itemFromCandidate(candidate)),
    queueDiscoveryCandidates: vi.fn().mockResolvedValue(1),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LibrarySurface
}

function reviewElement(library: LibrarySurface) {
  return (
    <ExplorerTab
      library={library}
      onActivity={vi.fn()}
      onCandidateDismissRequestHandled={vi.fn()}
      onCandidateRequestHandled={vi.fn()}
      onCandidateSaveRequestHandled={vi.fn()}
      onPromptCardRequestHandled={vi.fn()}
      onSignIn={vi.fn()}
      surfaceMode="queue"
    />
  )
}

function renderReview(library: LibrarySurface) {
  return render(reviewElement(library))
}

describe('ExplorerTab review surface', () => {
  it('shows a clear review inbox without the old spotlight, search or progress meter', () => {
    const candidate = createCandidate('dune', 'Dune')
    renderReview(createLibrarySurface([candidate]))

    expect(screen.getByRole('heading', { name: 'Hallazgos por revisar' })).toBeVisible()
    expect(screen.getByText('Guarda en tu Biblioteca lo que te interese o descarta el resto.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Dune' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Guardar en Biblioteca Dune' })).toBeVisible()
    expect(screen.queryByText('Filtros y busqueda')).not.toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('candidate-spotlight')).not.toBeInTheDocument()
  })

  it('keeps status history visible and filters it with human source names', async () => {
    const user = userEvent.setup()
    const library = createLibrarySurface([
      createCandidate('queued-external', 'Dune'),
      createCandidate('queued-nexo', 'Nexo local', { source: 'nexo', origin: 'publicCatalog' }),
      createCandidate('saved', 'Guardada', { status: 'saved' }),
      createCandidate('dismissed', 'Descartada', { status: 'dismissed' }),
    ])
    renderReview(library)

    expect(screen.getByRole('button', { name: 'Por revisar, 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Guardados, 1' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Descartados, 1' })).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Origen'), 'nexo')
    expect(screen.getByRole('heading', { name: 'Nexo local' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Dune' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Descartados, 1' }))
    expect(screen.getByRole('heading', { name: /Sin hallazgos de Catálogo Nexo/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Mostrar todos' }))
    expect(screen.getByRole('heading', { name: 'Descartada' })).toBeVisible()
  })

  it('serializes an individual save and disables the card while it is pending', async () => {
    const user = userEvent.setup()
    const candidate = createCandidate('dune', 'Dune')
    const deferred = createDeferred<ListItem>()
    const saveDiscoveryToLibrary = vi.fn(() => deferred.promise)
    const library = createLibrarySurface([candidate], { saveDiscoveryToLibrary })
    renderReview(library)

    const saveButton = screen.getByRole('button', { name: 'Guardar en Biblioteca Dune' })
    await user.dblClick(saveButton)

    expect(saveDiscoveryToLibrary).toHaveBeenCalledTimes(1)
    expect(saveButton).toBeDisabled()
    expect(saveButton).toHaveTextContent('Guardando…')

    await act(async () => deferred.resolve(itemFromCandidate(candidate)))
    await waitFor(() => expect(saveButton).toBeEnabled())
  })

  it('moves a discard to its history tab and lets the user recover it', async () => {
    const user = userEvent.setup()
    const candidate = createCandidate('dune', 'Dune')
    const dismissDiscoveryCandidate = vi.fn().mockResolvedValue(undefined)
    const restoreDiscoveryCandidate = vi.fn().mockResolvedValue(undefined)
    const library = createLibrarySurface([candidate], { dismissDiscoveryCandidate, restoreDiscoveryCandidate })
    const view = renderReview(library)

    await user.click(screen.getByRole('button', { name: 'Descartar Dune' }))
    expect(dismissDiscoveryCandidate).toHaveBeenCalledTimes(1)
    expect(dismissDiscoveryCandidate).toHaveBeenCalledWith('dune')

    const dismissedCandidate = { ...candidate, status: 'dismissed' as const }
    view.rerender(reviewElement({ ...library, discoveryCandidates: [dismissedCandidate] }))
    await user.click(screen.getByRole('button', { name: 'Descartados, 1' }))
    expect(screen.getByRole('heading', { name: 'Dune' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Recuperar Dune' }))
    expect(restoreDiscoveryCandidate).toHaveBeenCalledTimes(1)
    expect(restoreDiscoveryCandidate).toHaveBeenCalledWith('dune')
  })

  it('undoes a save by deleting the private copy and restoring the review candidate', async () => {
    const user = userEvent.setup()
    const candidate = createCandidate('dune', 'Dune')
    const savedItem = itemFromCandidate(candidate)
    const deleteItem = vi.fn().mockResolvedValue(undefined)
    const restoreDiscoveryCandidate = vi.fn().mockResolvedValue(undefined)
    const saveDiscoveryToLibrary = vi.fn().mockResolvedValue(savedItem)
    const library = createLibrarySurface([candidate], { deleteItem, restoreDiscoveryCandidate, saveDiscoveryToLibrary })
    renderReview(library)

    await user.click(screen.getByRole('button', { name: 'Guardar en Biblioteca Dune' }))
    expect(await screen.findByText('Dune guardado en Biblioteca.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Deshacer guardado' }))

    expect(deleteItem).toHaveBeenCalledTimes(1)
    expect(deleteItem).toHaveBeenCalledWith(savedItem.id)
    expect(restoreDiscoveryCandidate).toHaveBeenCalledTimes(1)
    expect(restoreDiscoveryCandidate).toHaveBeenCalledWith(candidate.id)
    expect(await screen.findByText('Dune recuperado para revisar y eliminado de Biblioteca.')).toBeVisible()
  })

  it('keeps Catalog in the moderator overflow and closes it with Escape or outside click', async () => {
    const user = userEvent.setup()
    const candidate = createCandidate('dune', 'Dune')
    const library = createLibrarySurface([candidate], { isModerator: true })
    renderReview(library)

    const moreButton = screen.getByRole('button', { name: 'Más acciones para Dune' })
    const details = moreButton.closest('details') as HTMLDetailsElement
    await user.click(moreButton)
    expect(details).toHaveAttribute('open')
    expect(within(details).getByRole('button', { name: 'Crear ficha en catálogo Dune' })).toBeVisible()

    await user.keyboard('{Escape}')
    expect(details).not.toHaveAttribute('open')
    expect(moreButton).toHaveFocus()

    await user.click(moreButton)
    await user.click(document.body)
    expect(details).not.toHaveAttribute('open')
  })

  it('explains how to fill an empty review inbox', () => {
    renderReview(createLibrarySurface())

    expect(screen.getByRole('heading', { name: 'Busca una obra para guardar' })).toBeVisible()
    expect(screen.getByText('Busca una obra o usa Sorpréndeme. Los resultados que quieras pensar aparecerán aquí.')).toBeVisible()
  })
})
