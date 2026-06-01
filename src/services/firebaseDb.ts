import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore'
import { getFirebaseApp } from './firebaseApp'

let db: Firestore | undefined
let emulatorsConnected = false

export function getFirebaseServices() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return undefined

  db ??= initializeFirestore(firebaseApp, {
    experimentalAutoDetectLongPolling: true,
  })

  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    emulatorsConnected = true
  }

  return { db }
}
