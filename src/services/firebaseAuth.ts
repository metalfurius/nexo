import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { getFirebaseApp } from './firebaseApp'

export type FirebaseUser = User

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
  if (!auth) throw new Error('Firebase no esta configurado')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, provider)
}

export async function signInWithEmail(email: string, password: string) {
  const auth = getConfiguredAuth()
  if (!auth) throw new Error('Firebase no esta configurado')
  await signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function signOutCurrentUser() {
  const auth = getConfiguredAuth()
  if (!auth) return
  await signOut(auth)
}
