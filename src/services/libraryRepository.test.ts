import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import { createFirestoreRepository } from './libraryRepository'

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  batchCommit: vi.fn(),
  batchDelete: vi.fn(),
  callable: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  httpsCallable: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
}))

const firebaseServices = vi.hoisted(() => ({
  db: { name: 'db' },
  functions: { name: 'functions' },
}))

const sdkPath = vi.hoisted(() => (args: unknown[]) => args.slice(1).map(String).join('/'))

vi.mock('./firebase', () => ({
  getFirebaseServices: vi.fn(() => firebaseServices),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: mocks.httpsCallable,
}))

vi.mock('firebase/firestore', () => ({
  addDoc: mocks.addDoc,
  collection: vi.fn((...args: unknown[]) => ({ kind: 'collection', path: sdkPath(args) })),
  deleteDoc: mocks.deleteDoc,
  doc: vi.fn((...args: unknown[]) => ({ kind: 'doc', path: sdkPath(args) })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  onSnapshot: mocks.onSnapshot,
  orderBy: vi.fn((field: string, direction: string) => ({ direction, field })),
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({ collectionRef, constraints })),
  setDoc: mocks.setDoc,
  writeBatch: vi.fn(() => ({
    commit: mocks.batchCommit,
    delete: mocks.batchDelete,
  })),
}))

const item: ListItem = {
  id: 'movie-arrival',
  title: 'Arrival',
  type: 'movie',
  status: 'wishlist',
  genres: ['sci-fi'],
  tags: ['sci-fi'],
  moodTags: [],
  weights: DEFAULT_WEIGHTS,
  source: 'manual',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('createFirestoreRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.addDoc.mockResolvedValue(undefined)
    mocks.batchCommit.mockResolvedValue(undefined)
    mocks.callable.mockResolvedValue({ data: { candidates: [] } })
    mocks.deleteDoc.mockResolvedValue(undefined)
    mocks.getDoc.mockResolvedValue({ exists: () => false })
    mocks.getDocs.mockResolvedValue({ docs: [] })
    mocks.httpsCallable.mockReturnValue(mocks.callable)
    mocks.setDoc.mockResolvedValue(undefined)
  })

  it('subscribes to the signed-in user item collection', () => {
    const unsubscribe = vi.fn()
    const onItems = vi.fn()
    mocks.onSnapshot.mockImplementation((source, onNext) => {
      onNext({ docs: [{ data: () => item }] })
      return unsubscribe
    })

    const repository = createFirestoreRepository('user-1')
    const result = repository?.subscribeItems(onItems, vi.fn())

    expect(mocks.onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionRef: expect.objectContaining({ path: 'users/user-1/items' }),
      }),
      expect.any(Function),
      expect.any(Function),
    )
    expect(onItems).toHaveBeenCalledWith([item])
    expect(result).toBe(unsubscribe)
  })

  it('writes item mutations under the signed-in user', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.saveItem(item)
    await repository?.setStatus(item.id, 'completed')
    await repository?.deleteItem(item.id)

    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({ id: item.id, title: item.title }),
    )
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({ status: 'completed' }),
      { merge: true },
    )
    expect(mocks.deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
    )
  })

  it('deletes only the signed-in user item collection', async () => {
    const docRef = { path: 'users/user-1/items/movie-arrival' }
    mocks.getDocs.mockResolvedValue({ docs: [{ ref: docRef }] })

    const repository = createFirestoreRepository('user-1')
    await repository?.deleteAllItems()

    expect(mocks.getDocs).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/user-1/items' }))
    expect(mocks.batchDelete).toHaveBeenCalledWith(docRef)
    expect(mocks.batchCommit).toHaveBeenCalled()
  })

  it('records recommendation runs under the signed-in user', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.recordRecommendation(item.id, ['encaja'])

    expect(mocks.addDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/recommendationRuns' }),
      expect.objectContaining({ itemId: item.id, reasons: ['encaja'] }),
    )
  })

  it('persists settings and discovery candidates under the signed-in user', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.saveSettings({ favoriteTags: ['sci-fi'] })
    await repository?.saveDiscoveryCandidate({
      id: 'public-book-odisea',
      title: 'Odisea',
      type: 'book',
      status: 'queued',
      origin: 'publicCatalog',
      source: 'nexo',
      sourceId: 'book-odisea',
      genres: ['clasico'],
      tags: ['epico'],
      moodTags: [],
      externalRefs: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'users/user-1/userSettings/preferences' }),
      expect.objectContaining({ favoriteTags: ['sci-fi'] }),
      { merge: true },
    )
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'users/user-1/externalCandidates/public-book-odisea' }),
      expect.objectContaining({ title: 'Odisea', origin: 'publicCatalog' }),
    )
  })

  it('uses Firestore for public catalog search and moderator writes', async () => {
    const repository = createFirestoreRepository('user-1')
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            id: 'movie-arrival',
            title: 'Arrival',
            type: 'movie',
            genres: [],
            tags: [],
            moodTags: [],
            externalRefs: {},
            searchTokens: ['arrival'],
            canonicalKey: 'movie:arrival',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            createdBy: 'moderator',
            updatedBy: 'moderator',
          }),
        },
      ],
    })

    const results = await repository?.searchPublicCatalog('', 'movie')
    await repository?.upsertPublicItem({
      title: 'Arrival',
      type: 'movie',
      genres: [],
      tags: [],
      moodTags: [],
      externalRefs: {},
    })
    await repository?.archivePublicItem('movie-arrival')

    expect(results?.[0]?.title).toBe('Arrival')
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'publicItems/movie-arrival' }),
      expect.objectContaining({ title: 'Arrival', updatedBy: 'user-1' }),
      { merge: true },
    )
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'publicItems/movie-arrival' }),
      expect.objectContaining({ archivedAt: expect.any(String), updatedBy: 'user-1' }),
      { merge: true },
    )
  })
})
