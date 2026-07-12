import type { FirebaseApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

let initialized = false

export function initializeAppCheckObservation(app: FirebaseApp) {
  if (initialized) return
  const siteKey = String(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '').trim()
  if (!siteKey) return

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  })
  initialized = true
}
