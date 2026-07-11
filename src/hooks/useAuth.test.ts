import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './useAuth'

const authMocks = vi.hoisted(() => ({
  createAccount: vi.fn(),
  getFirebaseAuthErrorMessage: vi.fn((_reason: unknown, operation: string) => `Error seguro: ${operation}`),
  resetPassword: vi.fn(),
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
    authMocks.createAccount.mockReset()
    authMocks.getFirebaseAuthErrorMessage.mockClear()
    authMocks.resetPassword.mockReset()
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

  it('exposes a safe Firebase email sign-in failure', async () => {
    const failure = new Error('Internal Firebase detail for private@example.test')
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

    expect(thrown).toEqual(new Error('Error seguro: sign-in'))
    expect(result.current.error).toBe('Error seguro: sign-in')
    expect(result.current.error).not.toContain('private@example.test')
    expect(authMocks.getFirebaseAuthErrorMessage).toHaveBeenCalledWith(failure, 'sign-in')
  })

  it('creates an account and clears a previous error', async () => {
    authMocks.signInWithEmail.mockRejectedValueOnce(new Error('internal'))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.signInWithEmail('user@example.test', 'wrong')).rejects.toThrow()
    })
    expect(result.current.error).toBe('Error seguro: sign-in')

    await act(async () => {
      await result.current.createAccount('new@example.test', 'safe-password')
    })

    expect(authMocks.createAccount).toHaveBeenCalledWith('new@example.test', 'safe-password')
    expect(result.current.error).toBeUndefined()
  })

  it('requests a password reset and exposes a safe failure', async () => {
    const failure = new Error('SMTP or account detail')
    authMocks.resetPassword.mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.resetPassword('user@example.test')).rejects.toThrow(
        'Error seguro: reset-password',
      )
    })

    expect(authMocks.resetPassword).toHaveBeenCalledWith('user@example.test')
    expect(result.current.error).toBe('Error seguro: reset-password')
    expect(authMocks.getFirebaseAuthErrorMessage).toHaveBeenCalledWith(failure, 'reset-password')
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
