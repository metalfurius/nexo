import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'
import { getFirebaseConfig } from './firebaseConfig'
import { getFirebaseApp } from './firebaseApp'

let analytics: Analytics | undefined

export async function initializeAnalytics() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp || !getFirebaseConfig().measurementId || analytics) return analytics
  if (!(await isSupported())) return undefined
  analytics = getAnalytics(firebaseApp)
  return analytics
}
