import { beforeEach, describe, expect, it, vi } from 'vitest'

const configuredAuth = vi.hoisted(() => ({ id: 'auth' }))
const firebaseApp = vi.hoisted(() => ({ id: 'app' }))
const authMocks = vi.hoisted(() => ({
  connectAuthEmulator: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  getAuth: vi.fn(() => configuredAuth),
  GoogleAuthProvider: vi.fn(function GoogleAuthProviderMock(this: { setCustomParameters: ReturnType<typeof vi.fn> }) {
    this.setCustomParameters = vi.fn()
  }),
  onAuthStateChanged: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('firebase/auth', () => authMocks)

vi.mock('./firebaseApp', () => ({
  getFirebaseApp: vi.fn(() => firebaseApp),
}))

describe('firebase auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.getAuth.mockReturnValue(configuredAuth)
  })

  it('creates an account with a normalized email and without requiring verification', async () => {
    const { createAccount } = await import('./firebaseAuth')

    await createAccount('  new@example.test  ', 'safe-password')

    expect(authMocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      configuredAuth,
      'new@example.test',
      'safe-password',
    )
    expect(authMocks.sendEmailVerification).not.toHaveBeenCalled()
  })

  it('sends password recovery to a normalized email', async () => {
    const { resetPassword } = await import('./firebaseAuth')

    await resetPassword('  user@example.test  ')

    expect(authMocks.sendPasswordResetEmail).toHaveBeenCalledWith(configuredAuth, 'user@example.test')
  })

  it('translates common Firebase errors without leaking their message', async () => {
    const privateFailure = Object.assign(
      new Error('Firebase internal response containing private@example.test'),
      { code: 'auth/invalid-credential' },
    )
    authMocks.signInWithEmailAndPassword.mockRejectedValueOnce(privateFailure)
    const { signInWithEmail } = await import('./firebaseAuth')

    await expect(signInWithEmail('private@example.test', 'wrong-password')).rejects.toThrow(
      'El correo o la contraseña no son correctos.',
    )
  })

  it('uses a stable fallback for unknown errors and does not reveal whether a reset account exists', async () => {
    const { getFirebaseAuthErrorMessage } = await import('./firebaseAuth')
    const unknownFailure = new Error('secret backend detail')
    const missingAccountFailure = Object.assign(new Error('private@example.test does not exist'), {
      code: 'auth/user-not-found',
    })

    expect(getFirebaseAuthErrorMessage(unknownFailure, 'create-account')).toBe('No se pudo crear la cuenta.')
    expect(getFirebaseAuthErrorMessage(missingAccountFailure, 'reset-password')).toBe(
      'No se pudo enviar el correo de recuperación.',
    )
  })

  it.each([
    ['auth/email-already-in-use', 'Ya existe una cuenta con este correo.'],
    ['auth/weak-password', 'La contraseña no cumple los requisitos de seguridad.'],
    ['auth/too-many-requests', 'Se han realizado demasiados intentos. Espera un momento y vuelve a probar.'],
    ['auth/network-request-failed', 'No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.'],
  ])('maps %s to a stable Spanish message', async (code, expected) => {
    const { getFirebaseAuthErrorMessage } = await import('./firebaseAuth')

    expect(getFirebaseAuthErrorMessage({ code, message: 'internal detail' }, 'create-account')).toBe(expected)
  })
})
