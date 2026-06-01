import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirebaseConfig, isFirebaseConfigured } from './firebaseConfig'

let app: FirebaseApp | undefined

export function getFirebaseApp() {
  if (!isFirebaseConfigured) return undefined
  app ??= initializeApp(getFirebaseConfig())
  return app
}
