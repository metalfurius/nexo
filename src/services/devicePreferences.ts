const firestoreOfflinePersistenceKey = 'nexo-firestore-offline-persistence'
const notificationDebugKey = 'nexo-notification-app-update-debug'

function readLocalStorage(key: string) {
  if (typeof window === 'undefined') return undefined
  return window.localStorage.getItem(key) ?? undefined
}

function writeLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
}

function removeLocalStorage(key: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(key)
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
