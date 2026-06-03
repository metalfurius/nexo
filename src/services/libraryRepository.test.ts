import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEIGHTS, type ListItem } from '../domain/types'
import { createFirestoreRepository } from './libraryRepository'

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  batchCommit: vi.fn(),
  batchDelete: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
}))

const firebaseServices = vi.hoisted(() => ({
  db: { name: 'db' },
}))

const sdkPath = vi.hoisted(() => (args: unknown[]) => args.slice(1).map(String).join('/'))

vi.mock('./firebaseDb', () => ({
  getFirebaseServices: vi.fn(() => firebaseServices),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: mocks.addDoc,
  collection: vi.fn((...args: unknown[]) => ({ kind: 'collection', path: sdkPath(args) })),
  deleteDoc: mocks.deleteDoc,
  deleteField: vi.fn(() => ({ kind: 'deleteField' })),
  doc: vi.fn((...args: unknown[]) => ({ kind: 'doc', path: sdkPath(args) })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  limit: mocks.limit,
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
    mocks.deleteDoc.mockResolvedValue(undefined)
    mocks.getDoc.mockResolvedValue({ exists: () => false })
    mocks.getDocs.mockResolvedValue({ docs: [] })
    mocks.limit.mockImplementation((count: number) => ({ count, kind: 'limit' }))
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
    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({
        lastRecommendedAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
      { merge: true },
    )
  })

  it('clears recommendation cooldowns with a partial item update', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.reactivateRecommendation(item.id)

    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({
        recommendationCooldownUntil: { kind: 'deleteField' },
        updatedAt: expect.any(String),
      }),
      { merge: true },
    )
  })

  it('creates user profiles as user and updates safe account fields later', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.ensureUserProfile({
      email: 'fran@example.com',
      displayName: 'Fran',
    })
    mocks.getDoc.mockResolvedValueOnce({ exists: () => true })
    await repository?.ensureUserProfile({
      email: 'fran@codeoverdose.es',
      displayName: 'Fran',
    })

    expect(mocks.getDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/user-1' }))
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'users/user-1' }),
      expect.objectContaining({ email: 'fran@example.com', role: 'user', uid: 'user-1' }),
    )
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'users/user-1' }),
      expect.not.objectContaining({ role: expect.any(String) }),
      { merge: true },
    )
  })

  it('subscribes to the current user profile role', () => {
    const unsubscribe = vi.fn()
    const onProfile = vi.fn()
    mocks.onSnapshot.mockImplementation((source, onNext) => {
      onNext({
        exists: () => true,
        data: () => ({
          uid: 'user-1',
          role: 'admin',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      })
      return unsubscribe
    })

    const repository = createFirestoreRepository('user-1')
    const result = repository?.subscribeUserProfile(onProfile, vi.fn())

    expect(mocks.onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1' }),
      expect.any(Function),
      expect.any(Function),
    )
    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin', uid: 'user-1' }))
    expect(result).toBe(unsubscribe)
  })

  it('subscribes to user profiles and updates roles for admins', async () => {
    const unsubscribe = vi.fn()
    const onProfiles = vi.fn()
    mocks.onSnapshot.mockImplementation((source, onNext) => {
      onNext({
        docs: [
          {
            id: 'user-2',
            data: () => ({
              role: 'user',
              email: 'user@example.com',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }),
          },
        ],
      })
      return unsubscribe
    })

    const repository = createFirestoreRepository('admin-1')
    const result = repository?.subscribeUserProfiles(onProfiles, vi.fn())
    await repository?.updateUserRole('user-2', 'moderator')

    expect(mocks.onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionRef: expect.objectContaining({ path: 'users' }),
      }),
      expect.any(Function),
      expect.any(Function),
    )
    expect(onProfiles).toHaveBeenCalledWith([
      expect.objectContaining({ email: 'user@example.com', role: 'user', uid: 'user-2' }),
    ])
    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-2' }),
      expect.objectContaining({ role: 'moderator' }),
      { merge: true },
    )
    expect(result).toBe(unsubscribe)
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

  it('subscribes, writes and clears activity entries under the signed-in user', async () => {
    const unsubscribe = vi.fn()
    const onEntries = vi.fn()
    const activityEntry = {
      id: 'activity-1',
      label: 'Ficha guardada',
      detail: 'Arrival',
      tab: 'library' as const,
      tone: 'success' as const,
      target: { kind: 'item' as const, id: 'game-outer-wilds' },
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const entryRef = { path: 'users/user-1/activityEntries/activity-1' }
    mocks.onSnapshot.mockImplementation((source, onNext) => {
      onNext({
        docs: [
          {
            id: activityEntry.id,
            data: () => activityEntry,
          },
        ],
      })
      return unsubscribe
    })
    mocks.getDocs.mockResolvedValueOnce({ docs: [{ ref: entryRef }] })

    const repository = createFirestoreRepository('user-1')
    const result = repository?.subscribeActivityEntries(onEntries, vi.fn())
    await repository?.saveActivityEntry(activityEntry)
    await repository?.clearActivityEntries()

    expect(mocks.onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionRef: expect.objectContaining({ path: 'users/user-1/activityEntries' }),
      }),
      expect.any(Function),
      expect.any(Function),
    )
    expect(onEntries).toHaveBeenCalledWith([activityEntry])
    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/activityEntries/activity-1' }),
      expect.objectContaining({ label: 'Ficha guardada', tab: 'library', target: activityEntry.target }),
    )
    expect(mocks.getDocs).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/user-1/activityEntries' }))
    expect(mocks.batchDelete).toHaveBeenCalledWith(entryRef)
    expect(mocks.batchCommit).toHaveBeenCalled()
    expect(result).toBe(unsubscribe)
  })

  it('does not overwrite saved discovery candidates with queued search results', async () => {
    const repository = createFirestoreRepository('user-1')
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        id: 'public-book-odisea',
        title: 'Odisea',
        type: 'book',
        status: 'saved',
        origin: 'publicCatalog',
        source: 'nexo',
        sourceId: 'book-odisea',
        genres: ['clasico'],
        tags: ['epico'],
        moodTags: [],
        externalRefs: {},
        savedItemId: 'book-odisea',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
    })

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
      updatedAt: '2026-01-04T00:00:00.000Z',
    })

    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('restores dismissed discovery candidates back to queued', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.restoreDiscoveryCandidate('public-book-odisea')

    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/externalCandidates/public-book-odisea' }),
      expect.objectContaining({
        id: 'public-book-odisea',
        status: 'queued',
        dismissedAt: { kind: 'deleteField' },
        savedItemId: { kind: 'deleteField' },
      }),
      { merge: true },
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
    await repository?.restorePublicItem('movie-arrival')

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
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ path: 'publicItems/movie-arrival' }),
      expect.objectContaining({ archivedAt: { kind: 'deleteField' }, updatedBy: 'user-1' }),
      { merge: true },
    )
  })
})
