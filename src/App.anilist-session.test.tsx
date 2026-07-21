import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from './app/shared'
import App from './App'
import { DEFAULT_SETTINGS } from './domain/types'

const authMock = vi.hoisted(() => ({
  state: {
    user: { uid: 'user-1' } as { uid: string } | null,
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

const runtimeMock = vi.hoisted(() => ({
  callbacks: new Map<string, (controller: { integration?: { username: string } }) => void>(),
}))

const libraryMock = vi.hoisted(() => {
  return { current: undefined as LibrarySurface | undefined }
})

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => authMock.state,
}))

vi.mock('./hooks/useLibrary', () => ({
  useLibrary: () => libraryMock.current,
}))

vi.mock('./services/firebaseAnalytics', () => ({
  initializeAnalytics: vi.fn(),
}))

vi.mock('./hooks/AniListSyncRuntime', () => ({
  default: ({ userId, onChange }: { userId: string; onChange: (controller: { integration?: { username: string } }) => void }) => {
    runtimeMock.callbacks.set(userId, onChange)
    return null
  },
}))

vi.mock('./tabs/SettingsTab', () => ({
  default: ({ aniListSync }: { aniListSync: { integration?: { username: string } } }) => (
    <section aria-label="Ajustes AniList mock">
      <output data-testid="anilist-username">{aniListSync.integration?.username ?? 'none'}</output>
    </section>
  ),
}))

function controller(username: string) {
  return { integration: { username } }
}

function createLibrarySurface() {
  const base = {
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
  }
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property in target) return Reflect.get(target, property, receiver)
      return vi.fn()
    },
  }) as unknown as LibrarySurface
}

describe('App AniList session isolation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?tab=settings')
    authMock.state.user = { uid: 'user-1' }
    runtimeMock.callbacks.clear()
    libraryMock.current = createLibrarySurface()
  })

  it('does not expose the previous user controller while a new session loads', async () => {
    const { rerender } = render(<App />)

    await waitFor(() => expect(runtimeMock.callbacks.has('user-1')).toBe(true))
    act(() => runtimeMock.callbacks.get('user-1')?.(controller('previous-user')))
    expect(await screen.findByTestId('anilist-username')).toHaveTextContent('previous-user')

    authMock.state.user = { uid: 'user-2' }
    rerender(<App />)

    expect(screen.getByTestId('anilist-username')).toHaveTextContent('none')

    act(() => runtimeMock.callbacks.get('user-2')?.(controller('current-user')))
    expect(screen.getByTestId('anilist-username')).toHaveTextContent('current-user')

    authMock.state.user = null
    rerender(<App />)
    expect(screen.getByTestId('anilist-username')).toHaveTextContent('none')
  })
})
