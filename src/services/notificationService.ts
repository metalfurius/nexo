import {
  isAppUpdateDebugNotificationEnabled,
  setAppUpdateDebugNotificationEnabled,
} from './devicePreferences'

export type NotificationIntent = 'app_update_debug'

export interface NotificationIntentState {
  enabled: boolean
  permission: NotificationPermission | 'unsupported'
  supported: boolean
}

export function getNotificationIntentState(intent: NotificationIntent): NotificationIntentState {
  const supported = isNotificationSupported()
  return {
    enabled: intent === 'app_update_debug' && isAppUpdateDebugNotificationEnabled(),
    permission: supported ? Notification.permission : 'unsupported',
    supported,
  }
}

export async function setNotificationIntentEnabled(intent: NotificationIntent, enabled: boolean): Promise<NotificationIntentState> {
  if (intent !== 'app_update_debug') return getNotificationIntentState(intent)
  if (!isNotificationSupported()) {
    setAppUpdateDebugNotificationEnabled(false)
    return getNotificationIntentState(intent)
  }

  if (!enabled) {
    setAppUpdateDebugNotificationEnabled(false)
    return getNotificationIntentState(intent)
  }

  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  setAppUpdateDebugNotificationEnabled(permission === 'granted')
  return getNotificationIntentState(intent)
}

export async function notifyAppUpdateReady() {
  const state = getNotificationIntentState('app_update_debug')
  if (!state.supported || !state.enabled || state.permission !== 'granted') return false
  if (!('serviceWorker' in navigator)) return false

  const registration = await navigator.serviceWorker.ready.catch(() => undefined)
  if (!registration?.showNotification) return false

  await registration.showNotification('Actualizacion de Nexo lista', {
    badge: '/icons/nexo-192.png',
    body: 'Modo debug: hay una nueva version preparada para aplicar.',
    data: { intent: 'app_update_debug', url: '/' },
    icon: '/icons/nexo-192.png',
    tag: 'nexo-app-update-debug',
  })
  return true
}

function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}
