import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isAppUpdateDebugNotificationEnabled,
  isFirestoreOfflinePersistenceEnabled,
  setAppUpdateDebugNotificationEnabled,
  setFirestoreOfflinePersistenceEnabled,
} from './devicePreferences'

const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

function installBlockedLocalStorage() {
  const storage = {
    getItem: vi.fn(() => {
      throw new Error('storage blocked')
    }),
    removeItem: vi.fn(() => {
      throw new Error('storage blocked')
    }),
    setItem: vi.fn(() => {
      throw new Error('storage blocked')
    }),
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
  return storage
}

describe('device preferences', () => {
  afterEach(() => {
    if (localStorageDescriptor) Object.defineProperty(window, 'localStorage', localStorageDescriptor)
    vi.restoreAllMocks()
  })

  it('treats blocked localStorage as disabled preferences', () => {
    const storage = installBlockedLocalStorage()

    expect(isFirestoreOfflinePersistenceEnabled()).toBe(false)
    expect(isAppUpdateDebugNotificationEnabled()).toBe(false)
    expect(() => setFirestoreOfflinePersistenceEnabled(true)).not.toThrow()
    expect(() => setFirestoreOfflinePersistenceEnabled(false)).not.toThrow()
    expect(() => setAppUpdateDebugNotificationEnabled(true)).not.toThrow()
    expect(() => setAppUpdateDebugNotificationEnabled(false)).not.toThrow()
    expect(storage.getItem).toHaveBeenCalledTimes(2)
    expect(storage.setItem).toHaveBeenCalledTimes(2)
    expect(storage.removeItem).toHaveBeenCalledTimes(2)
  })
})
