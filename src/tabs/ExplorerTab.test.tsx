import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type DiscoveryCandidate } from '../domain/types'
import type { LibrarySurface } from '../app/shared'
import ExplorerTab from './ExplorerTab'

function createCandidate(id: string, title: string): DiscoveryCandidate {
  return {
    id,
    title,
    type: 'book',
    status: 'queued',
    origin: 'externalSearch',
    source: 'openLibrary',
    sourceId: id,
    genres: [],
    tags: [],
    moodTags: [],
    externalRefs: { openLibraryKey: id },
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function createLibrarySurface(searchCatalog: LibrarySurface['searchCatalog'], discoveryCandidates: DiscoveryCandidate[] = []) {
  return {
    items: [],
    settings: DEFAULT_SETTINGS,
    discoveryCandidates,
    isModerator: false,
    searchCatalog,
    queueDiscoveryCandidates: vi.fn().mockResolvedValue(1),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as unknown as LibrarySurface
}

describe('ExplorerTab concurrent searches', () => {
  it('keeps the pending focus visible while secondary tools start collapsed', () => {
    const candidate = createCandidate('focus', 'La obra pendiente')
    const library = createLibrarySurface(vi.fn().mockResolvedValue([]), [candidate])

    render(
      <ExplorerTab
        library={library}
        onActivity={vi.fn()}
        onCandidateDismissRequestHandled={vi.fn()}
        onCandidateRequestHandled={vi.fn()}
        onCandidateSaveRequestHandled={vi.fn()}
        onPromptCardRequestHandled={vi.fn()}
        onSearchRequestHandled={vi.fn()}
        onSignIn={vi.fn()}
        onVisibleDismissRequestHandled={vi.fn()}
        onVisibleSaveRequestHandled={vi.fn()}
        surfaceMode="queue"
      />,
    )

    expect(screen.getByTestId('candidate-spotlight')).toHaveTextContent(candidate.title)
    expect(screen.getByText('Filtros y busqueda').closest('details')).not.toHaveAttribute('open')
  })

  it('keeps a compact four-item queue until the user asks for the rest', async () => {
    const user = userEvent.setup()
    const candidates = Array.from({ length: 7 }, (_entry, index) => createCandidate(`candidate-${index}`, `Obra ${index}`))
    const library = createLibrarySurface(vi.fn().mockResolvedValue([]), candidates)

    render(
      <ExplorerTab
        library={library}
        onActivity={vi.fn()}
        onCandidateDismissRequestHandled={vi.fn()}
        onCandidateRequestHandled={vi.fn()}
        onCandidateSaveRequestHandled={vi.fn()}
        onPromptCardRequestHandled={vi.fn()}
        onSearchRequestHandled={vi.fn()}
        onSignIn={vi.fn()}
        onVisibleDismissRequestHandled={vi.fn()}
        onVisibleSaveRequestHandled={vi.fn()}
        surfaceMode="queue"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Obra 4' })).toBeVisible()
    expect(screen.queryByText('Obra 5')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver 2 mas' }))
    expect(screen.getByRole('heading', { name: 'Obra 6' })).toBeVisible()
  })

  it('ignores stale results without enqueueing them or clearing the active loading state', async () => {
    const user = userEvent.setup()
    const first = createDeferred<DiscoveryCandidate[]>()
    const second = createDeferred<DiscoveryCandidate[]>()
    const firstCandidate = createCandidate('first', 'Primera antigua')
    const secondCandidate = createCandidate('second', 'Segunda vigente')
    const searchCatalog = vi.fn((query: string) => query === 'Primera' ? first.promise : second.promise)
    const library = createLibrarySurface(searchCatalog)

    render(
      <ExplorerTab
        library={library}
        onActivity={vi.fn()}
        onCandidateDismissRequestHandled={vi.fn()}
        onCandidateRequestHandled={vi.fn()}
        onCandidateSaveRequestHandled={vi.fn()}
        onPromptCardRequestHandled={vi.fn()}
        onSearchRequestHandled={vi.fn()}
        onSignIn={vi.fn()}
        onVisibleDismissRequestHandled={vi.fn()}
        onVisibleSaveRequestHandled={vi.fn()}
        surfaceMode="queue"
      />,
    )

    await user.click(screen.getByText('Filtros y busqueda').closest('summary') as HTMLElement)
    const input = screen.getByLabelText('Buscar en explorador')
    const form = input.closest('form') as HTMLFormElement
    await user.type(input, 'Primera')
    fireEvent.submit(form)
    await waitFor(() => expect(searchCatalog).toHaveBeenCalledWith('Primera', 'watch'))

    await user.clear(input)
    await user.type(input, 'Segunda')
    fireEvent.submit(form)
    await waitFor(() => expect(searchCatalog).toHaveBeenCalledWith('Segunda', 'watch'))

    await act(async () => first.resolve([firstCandidate]))
    expect(library.queueDiscoveryCandidates).not.toHaveBeenCalledWith([firstCandidate])
    expect(screen.getByRole('button', { name: 'Buscando' })).toBeDisabled()

    await act(async () => second.resolve([secondCandidate]))
    await waitFor(() => expect(library.queueDiscoveryCandidates).toHaveBeenCalledTimes(1))
    expect(library.queueDiscoveryCandidates).toHaveBeenCalledWith([secondCandidate])
    expect(await screen.findByText('1 hallazgos enviados a la cola.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeEnabled()
  })
})
