import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestoreMocks = vi.hoisted(() => ({
  clearIndexedDbPersistence: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  initializeFirestore: vi.fn(() => ({ id: 'db' })),
  persistentLocalCache: vi.fn((settings: unknown) => ({ kind: 'persistentLocalCache', settings })),
  persistentMultipleTabManager: vi.fn(() => ({ kind: 'persistentMultipleTabManager' })),
  terminate: vi.fn(),
}))

const firebaseApp = vi.hoisted(() => ({ id: 'app' }))
const preferences = vi.hoisted(() => ({
  enabled: false,
}))

vi.mock('firebase/firestore', () => firestoreMocks)

vi.mock('./firebaseApp', () => ({
  getFirebaseApp: vi.fn(() => firebaseApp),
}))

vi.mock('./devicePreferences', () => ({
  isFirestoreOfflinePersistenceEnabled: vi.fn(() => preferences.enabled),
}))

describe('firebase db', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    preferences.enabled = false
    firestoreMocks.initializeFirestore.mockReturnValue({ id: 'db' })
    firestoreMocks.persistentLocalCache.mockImplementation((settings: unknown) => ({ kind: 'persistentLocalCache', settings }))
    firestoreMocks.persistentMultipleTabManager.mockReturnValue({ kind: 'persistentMultipleTabManager' })
  })

  it('initializes Firestore without persistent cache by default', async () => {
    const { getFirebaseServices } = await import('./firebaseDb')

    expect(getFirebaseServices()).toEqual({ db: { id: 'db' } })
    expect(firestoreMocks.initializeFirestore).toHaveBeenCalledWith(firebaseApp, {
      experimentalAutoDetectLongPolling: true,
    })
    expect(firestoreMocks.persistentLocalCache).not.toHaveBeenCalled()
  })

  it('uses persistent multi-tab cache when the device opt-in is enabled', async () => {
    preferences.enabled = true
    const { getFirebaseServices } = await import('./firebaseDb')

    getFirebaseServices()

    expect(firestoreMocks.persistentMultipleTabManager).toHaveBeenCalled()
    expect(firestoreMocks.persistentLocalCache).toHaveBeenCalledWith({
      tabManager: { kind: 'persistentMultipleTabManager' },
    })
    expect(firestoreMocks.initializeFirestore).toHaveBeenCalledWith(
      firebaseApp,
      expect.objectContaining({
        experimentalAutoDetectLongPolling: true,
        localCache: expect.objectContaining({ kind: 'persistentLocalCache' }),
      }),
    )
  })

  it('terminates and clears persisted cache on request', async () => {
    const db = { id: 'db-to-clear' }
    firestoreMocks.initializeFirestore.mockReturnValue(db)
    firestoreMocks.terminate.mockResolvedValue(undefined)
    firestoreMocks.clearIndexedDbPersistence.mockResolvedValue(undefined)
    const { clearPersistedFirestoreCache, getFirebaseServices } = await import('./firebaseDb')

    getFirebaseServices()
    await clearPersistedFirestoreCache()

    expect(firestoreMocks.terminate).toHaveBeenCalledWith(db)
    expect(firestoreMocks.clearIndexedDbPersistence).toHaveBeenCalledWith(db)
  })
})
