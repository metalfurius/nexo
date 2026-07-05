import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from './app/shared'
import App from './App'
import { DEFAULT_SETTINGS } from './domain/types'

const authMock = vi.hoisted(() => ({
  state: {
    user: null,
    loading: false,
    isFirebaseConfigured: true,
    error: undefined as string | undefined,
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
    deleteAllItems: vi.fn(async () => undefined),
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
})
