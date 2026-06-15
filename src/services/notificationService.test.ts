import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getNotificationIntentState,
  notifyAppUpdateReady,
  setNotificationIntentEnabled,
} from './notificationService'

function installNotificationMock(permission: NotificationPermission, requestPermission = vi.fn()) {
  class NotificationMock {}
  Object.defineProperty(NotificationMock, 'permission', { configurable: true, value: permission })
  Object.defineProperty(NotificationMock, 'requestPermission', {
    configurable: true,
    value: requestPermission,
  })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: NotificationMock,
  })
}

function installServiceWorkerMock(showNotification = vi.fn()) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ showNotification }),
    },
  })
  return showNotification
}

describe('notification service', () => {
  beforeEach(() => {
    window.localStorage.clear()
    installNotificationMock('default', vi.fn().mockResolvedValue('granted'))
    installServiceWorkerMock()
  })

  it('enables app update debug notifications after permission is granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    installNotificationMock('default', requestPermission)

    const state = await setNotificationIntentEnabled('app_update_debug', true)

    expect(requestPermission).toHaveBeenCalled()
    expect(state.enabled).toBe(true)
    expect(getNotificationIntentState('app_update_debug').enabled).toBe(true)
  })

  it('keeps the debug intent disabled when notifications are blocked', async () => {
    installNotificationMock('denied')

    const state = await setNotificationIntentEnabled('app_update_debug', true)

    expect(state.enabled).toBe(false)
    expect(state.permission).toBe('denied')
  })

  it('shows the update notification only for the enabled debug intent', async () => {
    installNotificationMock('granted')
    const showNotification = installServiceWorkerMock()
    await setNotificationIntentEnabled('app_update_debug', true)

    await expect(notifyAppUpdateReady()).resolves.toBe(true)

    expect(showNotification).toHaveBeenCalledWith(
      'Actualizacion de Nexo lista',
      expect.objectContaining({
        data: { intent: 'app_update_debug', url: '/' },
        tag: 'nexo-app-update-debug',
      }),
    )
  })

  it('does not notify when the debug intent is disabled', async () => {
    installNotificationMock('granted')
    const showNotification = installServiceWorkerMock()

    await expect(notifyAppUpdateReady()).resolves.toBe(false)

    expect(showNotification).not.toHaveBeenCalled()
  })
})
