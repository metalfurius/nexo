import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'
import { getFirebaseApp } from './firebaseApp'

let functionsClient: Functions | undefined
let emulatorsConnected = false

export function getFirebaseFunctionsClient() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return undefined

  functionsClient ??= getFunctions(firebaseApp)

  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
    connectFunctionsEmulator(functionsClient, '127.0.0.1', 5001)
    emulatorsConnected = true
  }

  return functionsClient
}
