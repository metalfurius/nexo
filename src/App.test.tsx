import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from './app/shared'
import App from './App'
import { DEFAULT_SETTINGS } from './domain/types'

const authMock = vi.hoisted(() => ({
  state: {
    user: null as { uid: string } | null,
    loading: false,
    isFirebaseConfigured: true,
    error: undefined as string | undefined,
    createAccount: vi.fn(),
    resetPassword: vi.fn(),
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  },
}))

const libraryMock = vi.hoisted(() => ({
  current: undefined as unknown,
}))

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => authMock.state,
}))

vi.mock('./hooks/useLibrary', () => ({
  useLibrary: () => libraryMock.current,
}))

vi.mock('./services/firebaseAnalytics', () => ({
  initializeAnalytics: vi.fn(),
}))

vi.mock('./tabs/CatalogTab', () => ({
  default: () => <section aria-label="Catalogo mock">Catalog tab</section>,
}))

vi.mock('./tabs/HomeTab', () => ({
  default: () => <section aria-label="Inicio mock">Home tab</section>,
}))

vi.mock('./tabs/DiscoverTab', () => ({
  default: () => <section aria-label="Descubrir mock">Discover tab</section>,
}))

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
    saveDiscoveryToLibrary: vi.fn(async () => {
      throw new Error('saveDiscoveryToLibrary is not expected in App tests')
    }),
    recordImportedItemToPublicCatalog: vi.fn(async () => undefined),
    upsertPublicItem: vi.fn(async () => {
      throw new Error('upsertPublicItem is not expected in App tests')
    }),
    replacePublicItem: vi.fn(async (item) => item),
    archivePublicItem: vi.fn(async () => undefined),
    restorePublicItem: vi.fn(async () => undefined),
    updateUserRole: vi.fn(async () => undefined),
    recordActivity: vi.fn(),
    clearActivityEntries: vi.fn(async () => undefined),
    restoreActivityEntries: vi.fn(async () => undefined),
    publicItemToDiscovery: vi.fn(() => {
      throw new Error('publicItemToDiscovery is not expected in App tests')
    }),
    externalCandidateToDiscovery: vi.fn(() => {
      throw new Error('externalCandidateToDiscovery is not expected in App tests')
    }),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('App sign-in dialog', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    window.localStorage.clear()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    authMock.state.user = null
    authMock.state.loading = false
    authMock.state.isFirebaseConfigured = true
    authMock.state.error = undefined
    authMock.state.createAccount.mockReset()
    authMock.state.createAccount.mockResolvedValue(undefined)
    authMock.state.resetPassword.mockReset()
    authMock.state.resetPassword.mockResolvedValue(undefined)
    authMock.state.signInWithEmail.mockReset()
    authMock.state.signInWithEmail.mockResolvedValue(undefined)
    authMock.state.signInWithGoogle.mockReset()
    authMock.state.signInWithGoogle.mockResolvedValue(undefined)
    authMock.state.signOut.mockReset()
    authMock.state.signOut.mockResolvedValue(undefined)
    libraryMock.current = createLibrarySurface()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dialog-scroll-locked')
    document.body.classList.remove('dialog-scroll-locked')
    document.documentElement.removeAttribute('style')
    document.body.removeAttribute('style')
  })

  it('locks scroll, focuses email and restores focus when closed with Escape', async () => {
    const user = userEvent.setup()
    render(<App />)

    const signInButton = await screen.findByRole('button', { name: 'Entrar' })
    await user.click(signInButton)

    const dialog = await screen.findByRole('dialog', { name: 'Entrar en Nexo' })
    const emailInput = within(dialog).getByLabelText('Email')
    await waitFor(() => expect(emailInput).toHaveFocus())
    expect(document.documentElement).toHaveClass('dialog-scroll-locked')
    expect(document.body).toHaveClass('dialog-scroll-locked')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Entrar en Nexo' })).not.toBeInTheDocument())
    await waitFor(() => expect(document.documentElement).not.toHaveClass('dialog-scroll-locked'))
    await waitFor(() => expect(signInButton).toHaveFocus())
  })

  it('labels the sign-in icon close button with its dialog context', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Entrar' }))

    const dialog = await screen.findByRole('dialog', { name: 'Entrar en Nexo' })
    expect(within(dialog).getByRole('button', { name: 'Cerrar acceso a Nexo' })).toBeVisible()
  })

  it('keeps anonymous users on public Discover at the clean root', async () => {
    render(<App />)

    expect(await screen.findByRole('region', { name: 'Descubrir mock' })).toBeVisible()
    const navigation = screen.getByRole('navigation', { name: 'Secciones de Nexo' })
    expect(within(navigation).getByRole('button', { name: 'Descubrir' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('button', { name: 'Inicio' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Biblioteca' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Dado' })).toBeVisible()
  })

  it('asks anonymous users to sign in before entering a private destination', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('region', { name: 'Descubrir mock' })

    await user.click(screen.getByRole('button', { name: 'Inicio' }))

    expect(await screen.findByRole('dialog', { name: 'Entrar en Nexo' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Descubrir mock' })).toBeVisible()
    expect(window.location.search).toBe('')
  })

  it('canonicalizes a legacy Catalog deep link without losing its search', async () => {
    window.history.replaceState(null, '', '/?tab=catalog&catalogQ=Dune&catalogType=book#legacy')
    render(<App />)

    expect(await screen.findByRole('region', { name: 'Descubrir mock' })).toBeVisible()
    await waitFor(() => expect(window.location.search).toBe('?tab=discover&mode=search&q=Dune&type=book'))
    expect(window.location.hash).toBe('#legacy')
  })

  it('uses Home as the authenticated default while preserving an explicit Discover route', async () => {
    authMock.state.user = { uid: 'user-1' }
    const { unmount } = render(<App />)

    expect(await screen.findByRole('region', { name: 'Inicio mock' })).toBeVisible()
    expect(window.location.search).toBe('?tab=home')

    unmount()
    window.history.replaceState(null, '', '/?tab=discover&mode=queue')
    render(<App />)

    expect(await screen.findByRole('region', { name: 'Descubrir mock' })).toBeVisible()
    expect(window.location.search).toBe('?tab=discover&mode=queue')
  })

  it('blocks navigation and beforeunload while Biblioteca has an unsaved editor draft', async () => {
    const user = userEvent.setup()
    authMock.state.user = { uid: 'user-1' }
    window.history.replaceState(null, '', '/?tab=library')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Anadir manualmente' }))
    await user.type(screen.getByRole('dialog', { name: 'Anadir manualmente' }).querySelector('input') as HTMLInputElement, 'Pendiente')

    await waitFor(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: 'Inicio' }))
    expect(screen.getByText('Cambios pendientes en Biblioteca')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByRole('dialog', { name: 'Anadir manualmente' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Inicio' }))
    await user.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    expect(await screen.findByRole('region', { name: 'Inicio mock' })).toBeVisible()
  })

  it('blocks same-tab history deep links while Biblioteca has an unsaved editor draft', async () => {
    const user = userEvent.setup()
    authMock.state.user = { uid: 'user-1' }
    window.history.replaceState(null, '', '/?tab=library')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Anadir manualmente' }))
    await user.type(
      screen.getByRole('dialog', { name: 'Anadir manualmente' }).querySelector('input') as HTMLInputElement,
      'Pendiente',
    )

    window.history.pushState(null, '', '/?tab=library&item=otra-ficha')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByText('Cambios pendientes en Biblioteca')).toBeVisible()
    expect(window.location.search).toBe('?tab=library')
    expect(screen.getByRole('dialog', { name: 'Anadir manualmente' })).toBeVisible()
  })

  it('routes sign-out through the unsaved-change guard before discarding the private draft', async () => {
    const user = userEvent.setup()
    authMock.state.user = { uid: 'user-1' }
    window.history.replaceState(null, '', '/?tab=library')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Anadir manualmente' }))
    const editor = screen.getByRole('dialog', { name: 'Anadir manualmente' })
    await user.type(within(editor).getByLabelText('Titulo'), 'Borrador privado')

    await user.click(screen.getByRole('button', { name: 'Salir' }))

    expect(await screen.findByText('Cambios pendientes en Biblioteca')).toBeVisible()
    expect(authMock.state.signOut).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(editor).toBeVisible()
    expect(within(editor).getByLabelText('Titulo')).toHaveValue('Borrador privado')

    await user.click(screen.getByRole('button', { name: 'Salir' }))
    await user.click(await screen.findByRole('button', { name: 'Descartar cambios' }))

    await waitFor(() => expect(authMock.state.signOut).toHaveBeenCalledTimes(1))
  })

  it('clears private Biblioteca selection and editor drafts when the authenticated UID changes', async () => {
    const user = userEvent.setup()
    authMock.state.user = { uid: 'user-1' }
    window.history.replaceState(null, '', '/?tab=library')
    libraryMock.current = {
      ...createLibrarySurface(),
      items: [{
        id: 'private-item',
        title: 'Privada',
        type: 'book',
        status: 'wishlist',
        genres: [],
        tags: [],
        moodTags: [],
        weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
        source: 'manual',
        createdAt: '2026-07-11T10:00:00.000Z',
        updatedAt: '2026-07-11T10:00:00.000Z',
      }],
    }
    const { rerender } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: 'Seleccionar visibles' }))
    expect(screen.getByLabelText('Seleccion de biblioteca')).toHaveTextContent('1 seleccionadas')
    await user.click(screen.getByRole('button', { name: 'Editar Privada' }))
    await user.type(within(screen.getByRole('dialog', { name: 'Editar Privada' })).getByLabelText('Notas'), 'Solo A')

    authMock.state.user = { uid: 'user-2' }
    rerender(<App />)

    await waitFor(() => expect(screen.queryByLabelText('Seleccion de biblioteca')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Editar Privada' })).not.toBeInTheDocument()
  })

  it('does not redirect a private route while Firebase restores the session', async () => {
    window.history.replaceState(null, '', '/?tab=home')
    authMock.state.loading = true
    const { rerender } = render(<App />)

    expect(screen.getByText('Cargando acceso')).toBeVisible()
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(window.location.search).toBe('?tab=home')

    authMock.state.loading = false
    authMock.state.user = { uid: 'user-1' }
    rerender(<App />)

    expect(await screen.findByRole('region', { name: 'Inicio mock' })).toBeVisible()
    expect(window.location.search).toBe('?tab=home')
  })

  it('keeps utility destinations under More and hides Curar from regular users', async () => {
    const user = userEvent.setup()
    authMock.state.user = { uid: 'user-1' }
    render(<App />)
    await screen.findByRole('region', { name: 'Inicio mock' })

    const navigation = screen.getByRole('navigation', { name: 'Secciones de Nexo' })
    await user.click(within(navigation).getByLabelText(/secciones/i))

    expect(within(navigation).getByRole('menuitem', { name: /Importar/ })).toBeVisible()
    expect(within(navigation).getByRole('menuitem', { name: /Ajustes/ })).toBeVisible()
    expect(within(navigation).queryByRole('menuitem', { name: /Curar/ })).not.toBeInTheDocument()
  })

  it('creates an email account from the same access dialog', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Entrar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Entrar en Nexo' })
    await user.click(within(dialog).getByRole('tab', { name: 'Crear cuenta' }))
    expect(dialog).toHaveAccessibleName('Crear cuenta')

    await user.type(within(dialog).getByLabelText('Email'), 'new-user@nexo.test')
    await user.type(within(dialog).getByLabelText(/Contrase/), 'safe-password')
    await user.click(within(dialog).getByRole('button', { name: 'Crear cuenta' }))

    await waitFor(() => expect(authMock.state.createAccount).toHaveBeenCalledWith('new-user@nexo.test', 'safe-password'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear cuenta' })).not.toBeInTheDocument())
  })

  it('requests password recovery without closing the dialog or exposing account existence', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Entrar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Entrar en Nexo' })
    await user.click(within(dialog).getByRole('button', { name: /olvidado mi contrase/ }))
    expect(dialog).toHaveAccessibleName('Recuperar acceso')
    expect(within(dialog).queryByLabelText(/Contrase/)).not.toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Email'), 'possible-user@nexo.test')
    await user.click(within(dialog).getByRole('button', { name: 'Enviar recuperacion' }))

    await waitFor(() => expect(authMock.state.resetPassword).toHaveBeenCalledWith('possible-user@nexo.test'))
    expect(within(dialog).getByRole('status')).toHaveTextContent(/Si existe una cuenta/)
    expect(dialog).toBeVisible()
  })

  it('keeps the sign-in dialog open while email sign-in is pending', async () => {
    const user = userEvent.setup()
    const signIn = createDeferred<void>()
    authMock.state.signInWithEmail.mockReturnValueOnce(signIn.promise)
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Entrar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Entrar en Nexo' })
    await user.type(within(dialog).getByLabelText('Email'), 'moderator@nexo.local')
    await user.type(within(dialog).getByLabelText(/Contrase/), 'secret-password')
    await user.click(within(dialog).getByRole('button', { name: 'Entrar con email' }))

    await waitFor(() => expect(authMock.state.signInWithEmail).toHaveBeenCalledWith('moderator@nexo.local', 'secret-password'))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Entrar en Nexo' })).toBeInTheDocument()

    signIn.resolve()

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Entrar en Nexo' })).not.toBeInTheDocument())
  })

  it('disables sign-out while pending and avoids duplicate requests', async () => {
    const user = userEvent.setup()
    const signOut = createDeferred<void>()
    authMock.state.user = { uid: 'user-1' }
    authMock.state.signOut.mockReturnValueOnce(signOut.promise)
    render(<App />)

    const signOutButton = await screen.findByRole('button', { name: 'Salir' })
    await user.click(signOutButton)

    expect(authMock.state.signOut).toHaveBeenCalledTimes(1)
    expect(signOutButton).toBeDisabled()

    await user.click(signOutButton)
    expect(authMock.state.signOut).toHaveBeenCalledTimes(1)

    signOut.resolve()
    await waitFor(() => expect(signOutButton).not.toBeDisabled())
  })

  it('shows sign-out errors and clears them before retrying', async () => {
    const user = userEvent.setup()
    authMock.state.user = { uid: 'user-1' }
    authMock.state.signOut.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
    render(<App />)

    const signOutButton = await screen.findByRole('button', { name: 'Salir' })
    await user.click(signOutButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo salir')

    await user.click(signOutButton)
    await waitFor(() => expect(authMock.state.signOut).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
