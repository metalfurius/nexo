import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirebaseConfig, isFirebaseConfigured } from './firebaseConfig'

let app: FirebaseApp | undefined
let appCheckScheduled = false

export function getFirebaseApp() {
  if (!isFirebaseConfigured) return undefined
  if (!app) {
    app = initializeApp(getFirebaseConfig())
    scheduleAppCheckObservation(app)
  }
  return app
}

function scheduleAppCheckObservation(firebaseApp: FirebaseApp) {
  if (appCheckScheduled || !import.meta.env.PROD) return
  if (!String(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '').trim()) return
  appCheckScheduled = true

  const start = () => {
    void import('./firebaseAppCheck')
      .then(({ initializeAppCheckObservation }) => initializeAppCheckObservation(firebaseApp))
      .catch(() => undefined)
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 2_000 })
  } else {
    window.setTimeout(start, 0)
  }
}
