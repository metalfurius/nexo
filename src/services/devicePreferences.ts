const firestoreOfflinePersistenceKey = 'nexo-firestore-offline-persistence'
const notificationDebugKey = 'nexo-notification-app-update-debug'

function readLocalStorage(key: string) {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

function writeLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function removeLocalStorage(key: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function isFirestoreOfflinePersistenceEnabled() {
  return readLocalStorage(firestoreOfflinePersistenceKey) === 'enabled'
}

export function setFirestoreOfflinePersistenceEnabled(enabled: boolean) {
  if (enabled) {
    writeLocalStorage(firestoreOfflinePersistenceKey, 'enabled')
    return
  }

  removeLocalStorage(firestoreOfflinePersistenceKey)
}

export function isAppUpdateDebugNotificationEnabled() {
  return readLocalStorage(notificationDebugKey) === 'enabled'
}

export function setAppUpdateDebugNotificationEnabled(enabled: boolean) {
  if (enabled) {
    writeLocalStorage(notificationDebugKey, 'enabled')
    return
  }

  removeLocalStorage(notificationDebugKey)
}
