import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { getFirebaseApp } from './firebaseApp'

export type FirebaseUser = User

export type FirebaseAuthOperation =
  | 'create-account'
  | 'google-sign-in'
  | 'reset-password'
  | 'sign-in'
  | 'sign-out'

const operationFallbacks: Record<FirebaseAuthOperation, string> = {
  'create-account': 'No se pudo crear la cuenta.',
  'google-sign-in': 'No se pudo iniciar sesión con Google.',
  'reset-password': 'No se pudo enviar el correo de recuperación.',
  'sign-in': 'No se pudo iniciar sesión.',
  'sign-out': 'No se pudo cerrar la sesión.',
}

const firebaseAuthErrorMessages: Record<string, string> = {
  'auth/account-exists-with-different-credential': 'Ya existe una cuenta con este correo y otro método de acceso.',
  'auth/email-already-in-use': 'Ya existe una cuenta con este correo.',
  'auth/invalid-email': 'Introduce un correo electrónico válido.',
  'auth/missing-email': 'Introduce tu correo electrónico.',
  'auth/missing-password': 'Introduce tu contraseña.',
  'auth/network-request-failed': 'No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.',
  'auth/operation-not-allowed': 'Este método de acceso no está disponible.',
  'auth/password-does-not-meet-requirements': 'La contraseña no cumple los requisitos de seguridad.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de acceso. Permítela e inténtalo de nuevo.',
  'auth/popup-closed-by-user': 'Se cerró la ventana antes de completar el acceso.',
  'auth/cancelled-popup-request': 'Se canceló el intento de acceso anterior.',
  'auth/too-many-requests': 'Se han realizado demasiados intentos. Espera un momento y vuelve a probar.',
  'auth/unauthorized-domain': 'No se puede usar este método de acceso desde este dominio.',
  'auth/user-disabled': 'No se puede acceder con esta cuenta.',
  'auth/weak-password': 'La contraseña no cumple los requisitos de seguridad.',
}

const privateCredentialErrorCodes = new Set([
  'auth/invalid-credential',
  'auth/user-not-found',
  'auth/wrong-password',
])

class FirebaseAuthUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirebaseAuthUserError'
  }
}

function readFirebaseAuthErrorCode(reason: unknown) {
  if (!reason || typeof reason !== 'object' || !('code' in reason)) return undefined
  const code = reason.code
  return typeof code === 'string' ? code : undefined
}

export function getFirebaseAuthErrorMessage(reason: unknown, operation: FirebaseAuthOperation) {
  if (reason instanceof FirebaseAuthUserError) return reason.message

  const code = readFirebaseAuthErrorCode(reason)
  if (code && privateCredentialErrorCodes.has(code)) {
    return operation === 'reset-password'
      ? operationFallbacks['reset-password']
      : 'El correo o la contraseña no son correctos.'
  }
  return (code && firebaseAuthErrorMessages[code]) || operationFallbacks[operation]
}

function createSafeAuthError(reason: unknown, operation: FirebaseAuthOperation) {
  return new FirebaseAuthUserError(getFirebaseAuthErrorMessage(reason, operation))
}

let authEmulatorConnected = false

function getConfiguredAuth(): Auth | undefined {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return undefined

  const auth = getAuth(firebaseApp)
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !authEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    authEmulatorConnected = true
  }
  return auth
}

export function watchAuth(callback: (user: FirebaseUser | null) => void) {
  const auth = getConfiguredAuth()
  if (!auth) {
    callback(null)
    return () => undefined
  }

  return onAuthStateChanged(auth, callback)
}

export async function signInWithGoogle() {
  const auth = getConfiguredAuth()
  if (!auth) throw createSafeAuthError(undefined, 'google-sign-in')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (reason) {
    throw createSafeAuthError(reason, 'google-sign-in')
  }
}

export async function signInWithEmail(email: string, password: string) {
  const auth = getConfiguredAuth()
  if (!auth) throw createSafeAuthError(undefined, 'sign-in')
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  } catch (reason) {
    throw createSafeAuthError(reason, 'sign-in')
  }
}

export async function createAccount(email: string, password: string) {
  const auth = getConfiguredAuth()
  if (!auth) throw createSafeAuthError(undefined, 'create-account')
  try {
    await createUserWithEmailAndPassword(auth, email.trim(), password)
  } catch (reason) {
    throw createSafeAuthError(reason, 'create-account')
  }
}

export async function resetPassword(email: string) {
  const auth = getConfiguredAuth()
  if (!auth) throw createSafeAuthError(undefined, 'reset-password')
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (reason) {
    throw createSafeAuthError(reason, 'reset-password')
  }
}

export async function signOutCurrentUser() {
  const auth = getConfiguredAuth()
  if (!auth) return
  try {
    await signOut(auth)
  } catch (reason) {
    throw createSafeAuthError(reason, 'sign-out')
  }
}
