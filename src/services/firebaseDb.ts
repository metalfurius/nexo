import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseApp } from './firebaseApp'
import { isFirestoreOfflinePersistenceEnabled } from './devicePreferences'

let db: Firestore | undefined
let emulatorsConnected = false

export function getFirebaseServices() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return undefined

  db ??= initializeFirestore(firebaseApp, {
    experimentalAutoDetectLongPolling: true,
    ...(isFirestoreOfflinePersistenceEnabled()
      ? {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        }
      : {}),
  })

  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    emulatorsConnected = true
  }

  return { db }
}

export async function clearPersistedFirestoreCache() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return

  const currentDb = db ?? initializeFirestore(firebaseApp, {
    experimentalAutoDetectLongPolling: true,
  })

  db = undefined
  emulatorsConnected = false
  await terminate(currentDb)
  await clearIndexedDbPersistence(currentDb)
}
