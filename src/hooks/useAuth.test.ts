import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './useAuth'

const authMocks = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutCurrentUser: vi.fn(),
  watchAuth: vi.fn(),
}))

vi.mock('../services/firebaseConfig', () => ({
  isFirebaseConfigured: true,
}))

vi.mock('../services/firebaseAuth', () => authMocks)

describe('useAuth', () => {
  beforeEach(() => {
    authMocks.signInWithEmail.mockReset()
    authMocks.signInWithGoogle.mockReset()
    authMocks.signOutCurrentUser.mockReset()
    authMocks.watchAuth.mockReset()
    authMocks.watchAuth.mockImplementation((callback: (user: null) => void) => {
      callback(null)
      return vi.fn()
    })
  })

  it('delegates email and password sign-in to Firebase Auth', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signInWithEmail('moderator@nexo.local', 'secret-password')
    })

    expect(authMocks.signInWithEmail).toHaveBeenCalledWith('moderator@nexo.local', 'secret-password')
    expect(result.current.error).toBeUndefined()
  })

  it('exposes Firebase email sign-in failures', async () => {
    const failure = new Error('Credenciales invalidas')
    authMocks.signInWithEmail.mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let thrown: unknown
    await act(async () => {
      try {
        await result.current.signInWithEmail('moderator@nexo.local', 'wrong-password')
      } catch (reason) {
        thrown = reason
      }
    })

    expect(thrown).toBe(failure)
    expect(result.current.error).toBe('Credenciales invalidas')
  })

  it('keeps Google sign-in available', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signInWithGoogle()
    })

    expect(authMocks.signInWithGoogle).toHaveBeenCalledTimes(1)
  })
})
