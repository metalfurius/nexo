import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirebaseApp } from './firebaseApp'

export type FirebaseUser = User

export function watchAuth(callback: (user: FirebaseUser | null) => void) {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) {
    callback(null)
    return () => undefined
  }

  return onAuthStateChanged(getAuth(firebaseApp), callback)
}

export async function signInWithGoogle() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) throw new Error('Firebase no esta configurado')
  const auth = getAuth(firebaseApp)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, provider)
}

export async function signOutCurrentUser() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return
  await signOut(getAuth(firebaseApp))
}
