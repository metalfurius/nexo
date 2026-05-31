import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const allowedEmail = import.meta.env.VITE_ALLOWED_EMAIL?.trim().toLowerCase()

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)

let app: FirebaseApp | undefined
let emulatorsConnected = false

export function getFirebaseApp() {
  if (!isFirebaseConfigured) return undefined
  app ??= initializeApp(firebaseConfig)
  return app
}

export function getFirebaseServices() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return undefined

  const auth = getAuth(firebaseApp)
  const db = getFirestore(firebaseApp)
  const functions = getFunctions(firebaseApp)

  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
    emulatorsConnected = true
  }

  return { auth, db, functions }
}

export function watchAuth(callback: (user: User | null) => void) {
  const services = getFirebaseServices()
  if (!services) {
    callback(null)
    return () => undefined
  }
  return onAuthStateChanged(services.auth, callback)
}

export async function signInWithGoogle() {
  const services = getFirebaseServices()
  if (!services) throw new Error('Firebase no esta configurado')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(services.auth, provider)
}

export async function signOutCurrentUser() {
  const services = getFirebaseServices()
  if (!services) return
  await signOut(services.auth)
}

export function isAllowedUser(user: User | null) {
  if (!user) return false
  if (!allowedEmail) return true
  return user.email?.toLowerCase() === allowedEmail
}

