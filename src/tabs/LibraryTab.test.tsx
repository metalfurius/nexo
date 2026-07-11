import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type ItemStatus,
  type ListItem,
} from '../domain/types'
import {
  LibraryTab,
  type LibraryTabProps,
  type LibraryTabSurface,
} from './LibraryTab'

function createItem(id: string, patch: Partial<ListItem> = {}): ListItem {
  return {
    id,
    title: `Obra ${id}`,
    type: 'movie',
    status: 'wishlist',
    genres: [],
    tags: [],
    moodTags: [],
    weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
    source: 'manual',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...patch,
  }
}

function createSurface(items: ListItem[] = []) {
  const surface: LibraryTabSurface = {
    items,
    settings: {
      ...DEFAULT_SETTINGS,
      favoriteTags: [],
      favoriteGenres: [],
      blockedTags: [],
      recommendationPreferences: { ...DEFAULT_SETTINGS.recommendationPreferences },
      roadmap: { now: [], next: [], later: [], hidden: [] },
    },
    loading: false,
    syncState: {
      fromCache: false,
      hasPendingWrites: false,
      offlinePersistenceEnabled: true,
      pendingWriteCount: 0,
      remote: true,
    },
    saveItem: vi.fn().mockResolvedValue(undefined),
    applyRoadmapMutation: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    setStatus: vi.fn().mockResolvedValue(undefined),
    snoozeRecommendation: vi.fn().mockResolvedValue(undefined),
    reactivateRecommendation: vi.fn().mockResolvedValue(undefined),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  }
  return surface
}

function createCallbacks() {
  return {
    onActivity: vi.fn(),
    onActivityFocusHandled: vi.fn(),
    onDraftRequestHandled: vi.fn(),
    onImportRequestHandled: vi.fn(),
    onNavigate: vi.fn(),
    onPrimaryActionRequestHandled: vi.fn(),
    onReviewRequestHandled: vi.fn(),
    onRollDice: vi.fn(),
    onVisibleSelectionSummaryChange: vi.fn(),
    setTheme: vi.fn(),
  }
}

function LibraryHarness({
  initialSelection = [],
  ...props
}: Omit<LibraryTabProps, 'selectedItemIds' | 'setSelectedItemIds'> & { initialSelection?: string[] }) {
  const [selectedItemIds, setSelectedItemIds] = useState(initialSelection)
  return (
    <LibraryTab
      {...props}
      selectedItemIds={selectedItemIds}
      setSelectedItemIds={setSelectedItemIds}
    />
  )
}

function renderLibrary(
  surface: LibraryTabSurface,
  props: Partial<Omit<LibraryTabProps, 'library' | 'selectedItemIds' | 'setSelectedItemIds'>> & {
    initialSelection?: string[]
  } = {},
) {
  const callbacks = createCallbacks()
  const result = render(
    <LibraryHarness
      {...callbacks}
      {...props}
      initialSelection={props.initialSelection}
      library={surface}
    />,
  )
  return { ...callbacks, ...result }
}

describe('LibraryTab simplificada', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  })

  afterEach(() => vi.restoreAllMocks())

  it('busca solo dentro de las obras privadas y mantiene el estado visible', async () => {
    const user = userEvent.setup()
    const surface = createSurface([
      createItem('cozy', { title: 'El refugio', tags: ['Cozy'], status: 'in_progress' }),
      createItem('space', { title: 'Viaje espacial', genres: ['Ciencia ficcion'] }),
    ])
    renderLibrary(surface)

    expect(screen.getByLabelText('Cambiar estado de El refugio')).toHaveValue('in_progress')
    expect(screen.getByRole('heading', { name: 'El refugio' }).closest('article')?.querySelector('.status')).toHaveTextContent('En progreso')

    await user.type(screen.getByLabelText('Buscar en tu biblioteca'), 'cozy')

    expect(screen.getByRole('heading', { name: 'El refugio' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Viaje espacial' })).not.toBeInTheDocument()
    expect(screen.queryByText(/catalogo/i)).not.toBeInTheDocument()
  })

  it('filtra por tipo, ordena, persiste densidad y restablece la vista', async () => {
    const user = userEvent.setup()
    const surface = createSurface([
      createItem('zeta', { title: 'Zeta', type: 'book' }),
      createItem('alfa', { title: 'Alfa', type: 'book' }),
      createItem('movie', { title: 'Cine', type: 'movie' }),
    ])
    renderLibrary(surface)

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'book')
    await user.selectOptions(screen.getByLabelText('Ordenar biblioteca'), 'title')

    const headings = within(screen.getByTestId('library-grid')).getAllByRole('heading').map((heading) => heading.textContent)
    expect(headings).toEqual(['Alfa', 'Zeta'])

    await user.selectOptions(screen.getByLabelText('Densidad de biblioteca'), 'list')
    await waitFor(() => expect(surface.saveSettings).toHaveBeenCalledWith({ libraryViewMode: 'list' }))
    expect(screen.getByTestId('library-grid')).toHaveAttribute('data-density', 'list')

    await user.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(screen.getByRole('heading', { name: 'Cine' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filtrar por tipo')).toHaveValue('all')
    expect(screen.getByLabelText('Ordenar biblioteca')).toHaveValue('focus')
  })

  it('muestra exportacion completa o de seleccion dentro de Filtros', async () => {
    const user = userEvent.setup()
    const item = createItem('export', { title: 'Para exportar' })
    const surface = createSurface([item])
    renderLibrary(surface)

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    expect(screen.getByRole('button', { name: 'Exportar biblioteca' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Seleccionar visibles' }))
    expect(screen.getByRole('button', { name: 'Exportar seleccion' })).toBeEnabled()
  })

  it('crea una ficha manual desde el flujo corto', async () => {
    const user = userEvent.setup()
    const surface = createSurface()
    const { onActivity } = renderLibrary(surface)

    await user.click(screen.getByRole('button', { name: 'Anadir manualmente' }))
    const dialog = screen.getByRole('dialog', { name: 'Anadir manualmente' })
    await user.type(within(dialog).getByLabelText('Titulo'), 'La ciudad de laton')
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'book')
    await user.selectOptions(within(dialog).getByLabelText('Estado'), 'in_progress')
    await user.type(within(dialog).getByLabelText('Generos'), 'Fantasia, Aventura')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar ficha' }))

    await waitFor(() => expect(surface.saveItem).toHaveBeenCalledTimes(1))
    expect(surface.saveItem).toHaveBeenCalledWith(expect.objectContaining({
      title: 'La ciudad de laton',
      type: 'book',
      status: 'in_progress',
      genres: ['Fantasia', 'Aventura'],
      source: 'manual',
    }))
    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ label: 'Obra anadida' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('cambia el estado y permite restaurar estado y posicion exactos', async () => {
    const user = userEvent.setup()
    const item = createItem('one', { title: 'Una obra' })
    const surface = createSurface([item])
    surface.settings.roadmap.next = ['one']
    renderLibrary(surface)

    await user.selectOptions(screen.getByLabelText('Cambiar estado de Una obra'), 'completed')
    await waitFor(() => expect(surface.setStatus).toHaveBeenCalledWith('one', 'completed'))
    await user.click(screen.getByRole('button', { name: 'Deshacer' }))

    await waitFor(() => expect(surface.applyRoadmapMutation).toHaveBeenCalledWith({
      roadmap: { now: [], next: ['one'], later: [], hidden: [] },
      item: { kind: 'status', itemId: 'one', status: 'wishlist' },
    }))
  })

  it('confirma el borrado y recupera ficha y roadmap en una sola mutacion', async () => {
    const user = userEvent.setup()
    const item = createItem('one', { title: 'Una obra' })
    const surface = createSurface([item])
    surface.settings.roadmap.later = ['one']
    renderLibrary(surface)

    await user.click(screen.getByRole('button', { name: 'Borrar Una obra' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Borrar Una obra' })
    await user.click(within(dialog).getByRole('button', { name: 'Borrar definitivamente' }))

    await waitFor(() => expect(surface.deleteItem).toHaveBeenCalledWith('one'))
    await user.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(surface.applyRoadmapMutation).toHaveBeenCalledWith({
      roadmap: { now: [], next: [], later: ['one'], hidden: [] },
      item: { item, kind: 'restore' },
    }))
  })

  it('enfoca progreso, atrapa el foco y lo devuelve al cerrar el editor', async () => {
    const user = userEvent.setup()
    const item = createItem('progress', {
      title: 'Obra en curso',
      status: 'in_progress',
      progressCurrent: 3,
      progressTotal: 12,
      progressUnit: 'episodes',
    })
    const surface = createSurface([item])
    renderLibrary(surface)
    const editButton = screen.getByRole('button', { name: 'Editar Obra en curso' })

    await user.click(editButton)

    const dialog = screen.getByRole('dialog', { name: 'Editar Obra en curso' })
    expect(within(dialog).getByLabelText('Progreso actual')).toHaveFocus()
    const saveButton = within(dialog).getByRole('button', { name: 'Guardar ficha' })
    saveButton.focus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Cerrar editor' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Editar Obra en curso' })).not.toBeInTheDocument()
    await waitFor(() => expect(editButton).toHaveFocus())
  })

  it('atrapa el foco y lo restaura en la confirmacion de borrado', async () => {
    const user = userEvent.setup()
    const item = createItem('delete-focus', { title: 'Borrado accesible' })
    const surface = createSurface([item])
    renderLibrary(surface)
    const deleteButton = screen.getByRole('button', { name: 'Borrar Borrado accesible' })

    await user.click(deleteButton)

    const dialog = screen.getByRole('alertdialog', { name: 'Borrar Borrado accesible' })
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancelar' })
    expect(cancelButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Borrar definitivamente' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(deleteButton).toHaveFocus())
  })

  it('abre draftRequest y activityFocus, notificando que ambos intents se consumieron', async () => {
    const draft = createItem('draft', { source: 'public', title: 'Desde Descubrir' })
    const surface = createSurface([createItem('focus', { title: 'Obra enfocada' })])
    const callbacks = createCallbacks()
    const { rerender } = render(
      <StrictMode><LibraryHarness {...callbacks} draftRequest={draft} library={surface} /></StrictMode>,
    )

    expect(await screen.findByRole('dialog', { name: 'Anadir Desde Descubrir' })).toBeInTheDocument()
    expect(callbacks.onDraftRequestHandled).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar editor' }))
    rerender(<StrictMode><LibraryHarness {...callbacks} activityFocusItemId="focus" library={surface} /></StrictMode>)

    expect(await screen.findByRole('dialog', { name: 'Editar Obra enfocada' })).toBeInTheDocument()
    expect(callbacks.onActivityFocusHandled).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar editor' }))
    expect(callbacks.onNavigate).toHaveBeenCalledWith('library')
  })

  it('resuelve requests heredados de importacion y estado sin repetirlos al rerenderizar', async () => {
    const item = createItem('selected', { title: 'Seleccionada' })
    const surface = createSurface([item])
    const callbacks = createCallbacks()
    const importRequest = { requestId: 8 }
    const selectedStatusRequest = { requestId: 9, status: 'paused' as ItemStatus }
    const { rerender } = render(
      <LibraryHarness
        {...callbacks}
        importRequest={importRequest}
        initialSelection={[item.id]}
        library={surface}
        selectedStatusRequest={selectedStatusRequest}
      />,
    )

    await waitFor(() => expect(callbacks.onNavigate).toHaveBeenCalledWith('import'))
    expect(callbacks.onImportRequestHandled).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(surface.setStatus).toHaveBeenCalledWith(item.id, 'paused'))

    rerender(
      <LibraryHarness
        {...callbacks}
        importRequest={importRequest}
        initialSelection={[item.id]}
        library={surface}
        selectedStatusRequest={selectedStatusRequest}
      />,
    )

    await waitFor(() => expect(surface.setStatus).toHaveBeenCalledTimes(1))
    expect(callbacks.onImportRequestHandled).toHaveBeenCalledTimes(1)
  })
})
