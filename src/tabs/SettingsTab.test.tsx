import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from '../app/shared'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import { buildPublicCatalogItem, discoveryToListItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import { createLibraryExportPayload, LIBRARY_IMPORT_MAX_FILE_BYTES } from '../lib/libraryBackup'
import SettingsTab from './SettingsTab'

function createLibrarySurface(): LibrarySurface {
  return {
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
}

function settingsTabElement(
  library = createLibrarySurface(),
  sessionKey = 'user-123',
  onUnsavedChange = vi.fn(),
) {
  return (
    <SettingsTab
      aniListSync={{ loading: false, pending: false, configure: vi.fn(async () => undefined), syncNow: vi.fn(async () => undefined) }}
      library={library}
      onActivity={vi.fn()}
      onNavigate={vi.fn()}
      onRollDice={vi.fn()}
      onSaveRequestHandled={vi.fn()}
      onTasteSuggestionsRequestHandled={vi.fn()}
      onTaxonomyRepairRequestHandled={vi.fn()}
      onUnsavedChange={onUnsavedChange}
      sessionKey={sessionKey}
      setTheme={vi.fn()}
      theme={DEFAULT_SETTINGS.theme}
      user={{ displayName: 'Fran', email: 'fran@example.test', uid: 'user-123' }}
    />
  )
}

function renderSettingsTab(library = createLibrarySurface(), sessionKey = 'user-123') {
  return render(settingsTabElement(library, sessionKey))
}

describe('SettingsTab', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('labels the UID copy icon button with account context', () => {
    renderSettingsTab()

    const accountDrawer = screen.getByTestId('settings-account-drawer')
    expect(within(accountDrawer).getByRole('button', { name: 'Copiar UID de usuario' })).toBeEnabled()
  })

  it('keeps advanced areas collapsed and presents a single save action', async () => {
    const user = userEvent.setup()
    renderSettingsTab()

    expect(screen.getByTestId('settings-account-drawer')).not.toHaveAttribute('open')
    expect(screen.getByTestId('settings-private-data-drawer')).not.toHaveAttribute('open')
    expect(screen.getByTestId('settings-beta-drawer')).not.toHaveAttribute('open')

    await user.click(screen.getByRole('button', { name: 'Tema Claro' }))

    expect(screen.getAllByRole('button', { name: 'Guardar cambios' })).toHaveLength(1)
    expect(screen.getByText('Cambios pendientes')).toBeVisible()
  })

  it('hydrates the untouched draft from the first settings snapshot without a transient dirty report', async () => {
    const onUnsavedChange = vi.fn()
    const initialLibrary = createLibrarySurface()
    const view = render(settingsTabElement(initialLibrary, 'user-123', onUnsavedChange))

    expect(screen.getByLabelText('Tags favoritos')).toHaveValue('')
    const hydratedLibrary = {
      ...initialLibrary,
      settings: { ...DEFAULT_SETTINGS, favoriteTags: ['servidor'], theme: 'rose' as const },
    }
    view.rerender(settingsTabElement(hydratedLibrary, 'user-123', onUnsavedChange))

    expect(screen.getByLabelText('Tags favoritos')).toHaveValue('servidor')
    expect(onUnsavedChange).not.toHaveBeenCalledWith(true)
  })

  it('preserves a draft edited before the first settings snapshot arrives', async () => {
    const user = userEvent.setup()
    const onUnsavedChange = vi.fn()
    const initialLibrary = createLibrarySurface()
    const view = render(settingsTabElement(initialLibrary, 'user-123', onUnsavedChange))

    await user.type(screen.getByLabelText('Tags favoritos'), 'local-antes-del-snapshot')
    await waitFor(() => expect(onUnsavedChange).toHaveBeenCalledWith(true))

    view.rerender(settingsTabElement({
      ...initialLibrary,
      settings: { ...DEFAULT_SETTINGS, favoriteTags: ['servidor'], theme: 'rose' },
    }, 'user-123', onUnsavedChange))

    expect(screen.getByLabelText('Tags favoritos')).toHaveValue('local-antes-del-snapshot')
  })

  it('keeps a locally selected theme dirty until the user saves it', async () => {
    const user = userEvent.setup()
    const onUnsavedChange = vi.fn()
    render(settingsTabElement(createLibrarySurface(), 'user-123', onUnsavedChange))

    await user.click(screen.getByRole('button', { name: 'Tema Claro' }))

    await waitFor(() => expect(onUnsavedChange).toHaveBeenCalledWith(true))
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tema Claro' })).toHaveClass('active')
  })

  it('keeps the dirty guard active while saving and after a rejected write', async () => {
    const user = userEvent.setup()
    const onUnsavedChange = vi.fn()
    let rejectWrite!: (reason: Error) => void
    const library = createLibrarySurface()
    library.saveSettings = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectWrite = reject
    }))
    render(settingsTabElement(library, 'user-123', onUnsavedChange))

    await user.click(screen.getByRole('button', { name: 'Tema Claro' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled()
    await waitFor(() => expect(onUnsavedChange).toHaveBeenLastCalledWith(true))

    await act(async () => rejectWrite(new Error('write rejected')))

    expect(await screen.findByText('write rejected')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
    await waitFor(() => expect(onUnsavedChange).toHaveBeenLastCalledWith(true))
  })

  it('rejects an oversized JSON backup before reading its contents', async () => {
    const user = userEvent.setup()
    renderSettingsTab()
    const file = new File(['{}'], 'oversized.json', { type: 'application/json' })
    const readText = vi.fn(async () => '{}')
    Object.defineProperties(file, {
      size: { value: LIBRARY_IMPORT_MAX_FILE_BYTES + 1 },
      text: { value: readText },
    })

    await user.upload(screen.getByLabelText('Importar backup JSON'), file)

    expect(await screen.findByText('El backup JSON supera el limite de 10 MB.')).toBeInTheDocument()
    expect(readText).not.toHaveBeenCalled()
  })

  it('offers the persisted rollback after remount and clears it after undo', async () => {
    const user = userEvent.setup()
    const importedItem: ListItem = {
      id: 'book-solaris',
      title: 'Solaris',
      type: 'book',
      status: 'wishlist',
      genres: ['Science Fiction'],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const library = createLibrarySurface()
    const firstRender = renderSettingsTab(library)
    const file = new File([JSON.stringify(createLibraryExportPayload([importedItem]))], 'backup.json', {
      type: 'application/json',
    })

    await user.upload(screen.getByLabelText('Importar backup JSON'), file)
    await user.click(await screen.findByRole('button', { name: 'Aplicar backup' }))
    expect(await screen.findByText('Importadas 1 entradas desde backup')).toBeInTheDocument()

    firstRender.unmount()
    renderSettingsTab(library)
    await user.click(await screen.findByRole('button', { name: 'Deshacer importacion' }))

    expect(library.deleteItem).toHaveBeenCalledWith('book-solaris')
    expect(screen.queryByRole('button', { name: 'Deshacer importacion' })).not.toBeInTheDocument()
  })

  it('restores the original roadmap when undoing a completed total delete', async () => {
    const user = userEvent.setup()
    const items: ListItem[] = ['one', 'two'].map((id) => ({
      id,
      title: `Ficha ${id}`,
      type: 'book',
      status: 'wishlist',
      genres: [],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const originalRoadmap = { hidden: [], later: ['two'], next: ['one'], now: [] }
    const library = createLibrarySurface()
    library.items = items
    library.settings = { ...DEFAULT_SETTINGS, roadmap: originalRoadmap }
    vi.mocked(library.deleteAllItems).mockResolvedValueOnce({
      complete: true,
      deletedItemIds: ['one', 'two'],
      roadmap: { hidden: [], later: [], next: [], now: [] },
      total: 2,
    })
    renderSettingsTab(library)

    await user.click(screen.getByRole('button', { name: /^Borrar entradas/ }))
    await user.type(screen.getByLabelText('Confirmacion'), 'BORRAR')
    await user.click(within(screen.getByRole('dialog', { name: 'Borrar entradas privadas' })).getByRole('button', { name: 'Borrar entradas' }))
    expect(await screen.findByText('Tus entradas privadas han sido borradas')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Deshacer borrado total' }))

    expect(library.saveItem).toHaveBeenCalledTimes(2)
    expect(library.saveSettings).toHaveBeenCalledWith({ roadmap: originalRoadmap })
    expect(await screen.findByText('2 entradas recuperadas en Biblioteca')).toBeVisible()
  })

  it('surfaces partial delete progress and only offers undo for committed items', async () => {
    const user = userEvent.setup()
    const items: ListItem[] = ['one', 'two', 'three'].map((id) => ({
      id,
      title: `Ficha ${id}`,
      type: 'book',
      status: 'wishlist',
      genres: [],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const originalRoadmap = { hidden: [], later: ['three'], next: ['one', 'two'], now: [] }
    const library = createLibrarySurface()
    library.items = items
    library.settings = { ...DEFAULT_SETTINGS, roadmap: originalRoadmap }
    vi.mocked(library.deleteAllItems).mockResolvedValueOnce({
      complete: false,
      deletedItemIds: ['one'],
      error: 'Borrado interrumpido tras eliminar 1 de 3 entradas.',
      roadmap: { hidden: [], later: ['three'], next: ['two'], now: [] },
      total: 3,
    })
    renderSettingsTab(library)

    await user.click(screen.getByRole('button', { name: /^Borrar entradas/ }))
    await user.type(screen.getByLabelText('Confirmacion'), 'BORRAR')
    await user.click(within(screen.getByRole('dialog', { name: 'Borrar entradas privadas' })).getByRole('button', { name: 'Borrar entradas' }))

    expect(await screen.findByText(/Borrado interrumpido tras eliminar 1 de 3 entradas/)).toBeVisible()
    expect(screen.queryByText('Tus entradas privadas han sido borradas')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deshacer borrado total' }))
    expect(library.saveItem).toHaveBeenCalledTimes(1)
    expect(library.saveItem).toHaveBeenCalledWith(items[0])
    expect(library.saveSettings).toHaveBeenCalledWith({ roadmap: originalRoadmap })
  })
})
