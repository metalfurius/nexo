import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ROADMAP_PREFERENCES, DEFAULT_WEIGHTS, type DiscoveryCandidate, type ListItem, type PublicCatalogItem } from '../domain/types'
import { externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import { createFirestoreRepository } from './libraryRepository'

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  batchCommit: vi.fn(),
  batchDelete: vi.fn(),
  batchSet: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  where: vi.fn(),
}))

const firebaseServices = vi.hoisted(() => ({
  db: { name: 'db' },
}))

const searchMocks = vi.hoisted(() => ({
  recordCatalogDemands: vi.fn(),
  searchCatalogSources: vi.fn(),
  searchExternalSources: vi.fn(),
  searchRemoteCatalog: vi.fn(),
}))

const sdkPath = vi.hoisted(() => (args: unknown[]) => args.slice(1).map(String).join('/'))

class FirestoreSentinel {
  kind: string
  value?: number

  constructor(kind: string, value?: number) {
    this.kind = kind
    this.value = value
  }
}

vi.mock('./firebaseDb', () => ({
  getFirebaseServices: vi.fn(() => firebaseServices),
}))

vi.mock('./externalSearch', () => ({
  searchExternalSources: searchMocks.searchExternalSources,
}))

vi.mock('./remoteCatalog', () => ({
  recordCatalogDemands: searchMocks.recordCatalogDemands,
  searchRemoteCatalog: searchMocks.searchRemoteCatalog,
}))

vi.mock('./catalogSearchClient', () => ({
  searchCatalogSources: searchMocks.searchCatalogSources,
}))

vi.mock('firebase/firestore', () => ({
  addDoc: mocks.addDoc,
  collection: vi.fn((...args: unknown[]) => ({ kind: 'collection', path: sdkPath(args) })),
  deleteDoc: mocks.deleteDoc,
  deleteField: mocks.deleteField,
  doc: vi.fn((...args: unknown[]) => ({ kind: 'doc', path: sdkPath(args) })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  increment: mocks.increment,
  limit: mocks.limit,
  onSnapshot: mocks.onSnapshot,
  orderBy: vi.fn((field: string, direction: string) => ({ direction, field })),
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({ collectionRef, constraints })),
  setDoc: mocks.setDoc,
  where: mocks.where,
  writeBatch: vi.fn(() => ({
    commit: mocks.batchCommit,
    delete: mocks.batchDelete,
    set: mocks.batchSet,
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
    mocks.deleteField.mockImplementation(() => new FirestoreSentinel('deleteField'))
    mocks.getDoc.mockResolvedValue({ exists: () => false })
    mocks.getDocs.mockResolvedValue({ docs: [] })
    mocks.increment.mockImplementation((value: number) => new FirestoreSentinel('increment', value))
    mocks.limit.mockImplementation((count: number) => ({ count, kind: 'limit' }))
    mocks.setDoc.mockResolvedValue(undefined)
    mocks.where.mockImplementation((field: string, operator: string, value: unknown) => ({ field, kind: 'where', operator, value }))
    searchMocks.searchExternalSources.mockResolvedValue([])
    searchMocks.searchCatalogSources.mockResolvedValue({ candidates: [], partial: false, sources: ['publicCatalog', 'catalogApi'] })
    searchMocks.recordCatalogDemands.mockResolvedValue(undefined)
    searchMocks.searchRemoteCatalog.mockResolvedValue(undefined)
  })

  it('subscribes to the signed-in user item collection', () => {
    const unsubscribe = vi.fn()
    const onItems = vi.fn()
    mocks.onSnapshot.mockImplementation((_source, _options, onNext) => {
      onNext({ docs: [{ data: () => item }], metadata: { fromCache: false, hasPendingWrites: false } })
      return unsubscribe
    })

    const repository = createFirestoreRepository('user-1')
    const result = repository?.subscribeItems(onItems, vi.fn())

    expect(mocks.onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionRef: expect.objectContaining({ path: 'users/user-1/items' }),
      }),
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    )
    expect(onItems).toHaveBeenCalledWith([item], {
      fromCache: false,
      hasPendingWrites: false,
      pendingWriteCount: 0,
    })
    expect(result).toBe(unsubscribe)
  })

  it('reports Firestore snapshot metadata for offline and pending writes', () => {
    const onItems = vi.fn()
    mocks.onSnapshot.mockImplementation((_source, _options, onNext) => {
      onNext({
        docs: [
          {
            data: () => item,
            metadata: { hasPendingWrites: true },
          },
        ],
        metadata: { fromCache: true, hasPendingWrites: true },
      })
      return vi.fn()
    })

    const repository = createFirestoreRepository('user-1')
    repository?.subscribeItems(onItems, vi.fn())

    expect(onItems).toHaveBeenCalledWith(
      [item],
      {
        fromCache: true,
        hasPendingWrites: true,
        pendingWriteCount: 1,
      },
    )
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
    await repository?.deleteAllItems(DEFAULT_ROADMAP_PREFERENCES)

    expect(mocks.getDocs).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/user-1/items' }))
    expect(mocks.batchDelete).toHaveBeenCalledWith(docRef)
    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/userSettings/preferences' }),
      expect.objectContaining({ roadmap: { now: [], next: [], later: [], hidden: [] } }),
      { merge: true },
    )
    expect(mocks.batchCommit).toHaveBeenCalled()
  })

  it('reports the exact committed subset when a 1000-item delete fails between chunks', async () => {
    const docs = Array.from({ length: 1000 }, (_, index) => ({
      id: `item-${index}`,
      ref: { path: `users/user-1/items/item-${index}` },
    }))
    mocks.getDocs.mockResolvedValue({ docs })
    mocks.batchCommit.mockReset()
    mocks.batchCommit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'))

    const repository = createFirestoreRepository('user-1')
    const result = await repository?.deleteAllItems({
      hidden: ['item-448', 'item-449'],
      later: [],
      next: ['item-999'],
      now: ['item-0'],
    })

    expect(result).toEqual(expect.objectContaining({
      complete: false,
      total: 1000,
      error: expect.stringContaining('449 de 1000'),
    }))
    expect(result?.deletedItemIds).toHaveLength(449)
    expect(result?.deletedItemIds.at(-1)).toBe('item-448')
    expect(result?.roadmap).toEqual({ hidden: ['item-449'], later: [], next: ['item-999'], now: [] })
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2)
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

  it('restores exact recommendation cooldowns with a partial item update', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.setRecommendationCooldown(item.id, '2026-06-04T12:00:00.000Z')
    await repository?.setRecommendationCooldown(item.id)

    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({
        recommendationCooldownUntil: '2026-06-04T12:00:00.000Z',
        updatedAt: expect.any(String),
      }),
      { merge: true },
    )
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      2,
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
    mocks.onSnapshot.mockImplementation((_source, _options, onNext) => {
      onNext({
        exists: () => true,
        data: () => ({
          uid: 'user-1',
          role: 'admin',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        metadata: { fromCache: false, hasPendingWrites: false },
      })
      return unsubscribe
    })

    const repository = createFirestoreRepository('user-1')
    const result = repository?.subscribeUserProfile(onProfile, vi.fn())

    expect(mocks.onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1' }),
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    )
    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin', uid: 'user-1' }), {
      fromCache: false,
      hasPendingWrites: false,
      pendingWriteCount: 0,
    })
    expect(result).toBe(unsubscribe)
  })

  it('subscribes to user profiles and updates roles for admins', async () => {
    const unsubscribe = vi.fn()
    const onProfiles = vi.fn()
    mocks.onSnapshot.mockImplementation((_source, _options, onNext) => {
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
        metadata: { fromCache: false, hasPendingWrites: false },
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
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    )
    expect(onProfiles).toHaveBeenCalledWith(
      [expect.objectContaining({ email: 'user@example.com', role: 'user', uid: 'user-2' })],
      {
        fromCache: false,
        hasPendingWrites: false,
        pendingWriteCount: 0,
      },
    )
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
    mocks.onSnapshot.mockImplementation((_source, _options, onNext) => {
      onNext({
        docs: [
          {
            id: activityEntry.id,
            data: () => activityEntry,
          },
        ],
        metadata: { fromCache: false, hasPendingWrites: false },
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
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    )
    expect(onEntries).toHaveBeenCalledWith([activityEntry], {
      fromCache: false,
      hasPendingWrites: false,
      pendingWriteCount: 0,
    })
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
    const activePublicItem: PublicCatalogItem = {
      id: 'movie-arrival',
      title: 'Arrival',
      type: 'movie',
      genres: [],
      tags: [],
      moodTags: [],
      searchAliases: ['La llegada'],
      externalRefs: {},
      searchTokens: ['arrival'],
      canonicalKey: 'movie:arrival',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
    }
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => activePublicItem,
        },
      ],
    })
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({ ...activePublicItem, title: 'Archived Arrival', archivedAt: '2026-01-02T00:00:00.000Z' }),
        },
        {
          data: () => activePublicItem,
        },
      ],
    })
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => activePublicItem,
        },
      ],
    })

    const results = await repository?.searchPublicCatalog('', 'movie')
    const catalog = await repository?.listPublicCatalog()
    const aliasResults = await repository?.searchPublicCatalog('La llegada', 'movie')
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
    await repository?.replacePublicItem(activePublicItem)

    expect(results?.[0]?.title).toBe('Arrival')
    expect(catalog?.map((item) => item.title)).toEqual(['Arrival'])
    expect(aliasResults?.[0]?.title).toBe('Arrival')
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
    expect(mocks.setDoc).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ path: 'publicItems/movie-arrival' }),
      expect.objectContaining({ title: 'Arrival', updatedBy: 'user-1' }),
    )
  })

  it('commits roadmap and status changes in one atomic batch', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.applyRoadmapMutation({
      roadmap: { now: ['movie-arrival'], next: [], later: [], hidden: [] },
      item: { kind: 'status', itemId: 'movie-arrival', status: 'in_progress' },
    })

    expect(mocks.batchSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'users/user-1/userSettings/preferences' }),
      expect.objectContaining({
        roadmap: { now: ['movie-arrival'], next: [], later: [], hidden: [] },
        updatedAt: expect.any(String),
      }),
      { merge: true },
    )
    expect(mocks.batchSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({ status: 'in_progress', updatedAt: expect.any(String) }),
      { merge: true },
    )
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
  })

  it('commits up to 400 roadmap item changes with one settings write and one batch commit', async () => {
    const repository = createFirestoreRepository('user-1')
    const secondItem = { ...item, id: 'book-solaris', title: 'Solaris' }

    await repository?.applyRoadmapBatchMutation({
      roadmap: { now: ['movie-arrival'], next: ['book-solaris'], later: [], hidden: [] },
      items: [
        { kind: 'status', itemId: 'movie-arrival', status: 'in_progress' },
        { item: secondItem, kind: 'upsert' },
      ],
    })

    expect(mocks.batchSet).toHaveBeenCalledTimes(3)
    expect(mocks.batchSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: 'users/user-1/userSettings/preferences' }),
      expect.objectContaining({
        roadmap: { now: ['movie-arrival'], next: ['book-solaris'], later: [], hidden: [] },
      }),
      { merge: true },
    )
    expect(mocks.batchSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({ status: 'in_progress' }),
      { merge: true },
    )
    expect(mocks.batchSet).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ path: 'users/user-1/items/book-solaris' }),
      expect.objectContaining({ id: 'book-solaris', title: 'Solaris' }),
    )
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized roadmap batches before creating Firestore writes', async () => {
    const repository = createFirestoreRepository('user-1')

    await expect(repository?.applyRoadmapBatchMutation({
      roadmap: { now: [], next: [], later: [], hidden: [] },
      items: Array.from({ length: 401 }, (_, index) => ({
        kind: 'delete' as const,
        itemId: `item-${index}`,
      })),
    })).rejects.toThrow('hasta 400 cambios')

    expect(mocks.batchSet).not.toHaveBeenCalled()
    expect(mocks.batchCommit).not.toHaveBeenCalled()
  })

  it('commits a full edited item and its roadmap placement in one atomic batch', async () => {
    const repository = createFirestoreRepository('user-1')
    const item: ListItem = {
      id: 'movie-arrival',
      title: 'Arrival',
      type: 'movie',
      status: 'in_progress',
      progressCurrent: 42,
      progressTotal: 116,
      progressUnit: 'percent',
      genres: ['Ciencia ficcion'],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }

    await repository?.applyRoadmapMutation({
      roadmap: { now: ['movie-arrival'], next: [], later: [], hidden: [] },
      item: { item, kind: 'upsert' },
    })

    expect(mocks.batchSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({
        id: 'movie-arrival',
        progressCurrent: 42,
        status: 'in_progress',
        updatedAt: expect.any(String),
      }),
    )
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
  })

  it('commits roadmap cleanup and item deletion in one atomic batch', async () => {
    const repository = createFirestoreRepository('user-1')

    await repository?.applyRoadmapMutation({
      roadmap: { now: [], next: [], later: [], hidden: [] },
      item: { kind: 'delete', itemId: 'movie-arrival' },
    })

    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/userSettings/preferences' }),
      expect.objectContaining({ roadmap: { now: [], next: [], later: [], hidden: [] } }),
      { merge: true },
    )
    expect(mocks.batchDelete).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
    )
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })

  it('restores a deleted item and its roadmap placement in one atomic batch', async () => {
    const repository = createFirestoreRepository('user-1')
    const item: ListItem = {
      id: 'movie-arrival',
      title: 'Arrival',
      type: 'movie',
      status: 'paused',
      genres: ['Ciencia ficcion'],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }

    await repository?.applyRoadmapMutation({
      roadmap: { now: [], next: [], later: ['movie-arrival'], hidden: [] },
      item: { item, kind: 'restore' },
    })

    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1/items/movie-arrival' }),
      expect.objectContaining({ id: 'movie-arrival', status: 'paused', updatedAt: expect.any(String) }),
    )
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
  })

  it('returns signed-in public catalog searches without the old twelve item cutoff', async () => {
    const repository = createFirestoreRepository('user-1')
    const publicItems: PublicCatalogItem[] = Array.from({ length: 15 }, (_entry, index) => ({
      id: `anime-catalog-${index + 1}`,
      title: `Catalog Anime ${index + 1}`,
      type: 'anime',
      genres: ['Fantasy'],
      tags: ['anime'],
      moodTags: [],
      searchAliases: [],
      externalRefs: {
        anilistId: String(9000 + index),
      },
      searchTokens: ['catalog', 'anime', String(index + 1)],
      canonicalKey: `anime:catalog anime ${index + 1}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
    }))
    mocks.getDocs.mockResolvedValueOnce({
      docs: publicItems.map((publicItem) => ({
        data: () => publicItem,
      })),
    })

    const results = await repository?.searchPublicCatalog('Catalog', 'anime')

    expect(results).toHaveLength(15)
  })

  it('does not write public catalog items from signed-in searches', async () => {
    const repository = createFirestoreRepository('user-1')
    searchMocks.searchCatalogSources.mockResolvedValueOnce({
      candidates: [externalCandidateToDiscovery({
        id: 'anilist-154587',
        title: 'Frieren: Beyond Journey End',
        type: 'anime',
        source: 'anilist',
        sourceId: '154587',
        overview: 'A quiet fantasy journey.',
        posterUrl: 'https://img.anili.st/media/154587.jpg',
        releaseYear: 2023,
        progressTotal: 28,
        progressUnit: 'episodes',
        genres: ['Fantasy', 'Adventure'],
        searchAliases: ['Sousou no Frieren'],
        externalRefs: {
          anilistId: '154587',
          sourceUrl: 'https://anilist.co/anime/154587',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
      })],
      partial: false,
      sources: ['publicCatalog', 'catalogApi'],
    })

    const results = await repository?.searchCatalog('Frieren', 'anime')

    expect(searchMocks.searchCatalogSources).toHaveBeenCalledWith({ query: 'Frieren', type: 'anime' })
    expect(searchMocks.searchRemoteCatalog).not.toHaveBeenCalled()
    expect(searchMocks.searchExternalSources).not.toHaveBeenCalled()
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(results?.[0]).toEqual(
      expect.objectContaining({
        origin: 'externalSearch',
        source: 'anilist',
        title: 'Frieren: Beyond Journey End',
      }),
    )
  })

  it('dedupes external catalog matches when Nexo already has the same public item without bumping demand on search', async () => {
    const repository = createFirestoreRepository('user-1')
    const publicDune: PublicCatalogItem = {
      id: 'movie-dune-2021',
      title: 'Dune',
      type: 'movie',
      description: 'Ficha curada de Nexo.',
      releaseYear: 2021,
      genres: ['Ciencia ficcion'],
      tags: ['Aventura'],
      moodTags: [],
      externalRefs: {
        tmdbId: '438631',
      },
      posterUrl: 'https://image.tmdb.org/t/p/w342/dune.jpg',
      searchTokens: ['dune'],
      canonicalKey: 'movie:dune',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
    }
    searchMocks.searchCatalogSources.mockResolvedValueOnce({
      candidates: [publicItemToDiscovery(publicDune)],
      partial: false,
      sources: ['publicCatalog', 'catalogApi'],
    })

    const results = await repository?.searchCatalog('Dune', 'watch')

    expect(results).toHaveLength(1)
    expect(results?.[0]).toEqual(expect.objectContaining({ title: 'Dune' }))
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('uses external metadata to enrich stale remote catalog matches without catalog writes', async () => {
    const repository = createFirestoreRepository('user-1')
    searchMocks.searchCatalogSources.mockResolvedValueOnce({
      candidates: [externalCandidateToDiscovery({
        id: 'anilist-154587',
        title: 'Frieren: Beyond Journey End',
        type: 'anime',
        source: 'anilist',
        sourceId: '154587',
        overview: 'A quiet fantasy journey.',
        posterUrl: 'https://img.anili.st/media/154587.jpg',
        releaseYear: 2023,
        progressTotal: 28,
        progressUnit: 'episodes',
        genres: ['Fantasy', 'Adventure'],
        searchAliases: ['Sousou no Frieren'],
        externalRefs: {
          anilistId: '154587',
          sourceUrl: 'https://anilist.co/anime/154587',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
      })],
      partial: false,
      sources: ['publicCatalog', 'catalogApi'],
    })

    const results = await repository?.searchCatalog('Frieren', 'anime')

    expect(searchMocks.searchCatalogSources).toHaveBeenCalledWith({ query: 'Frieren', type: 'anime' })
    expect(searchMocks.searchExternalSources).not.toHaveBeenCalled()
    expect(searchMocks.searchRemoteCatalog).not.toHaveBeenCalled()
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          progressTotal: 28,
          progressUnit: 'episodes',
          title: 'Frieren: Beyond Journey End',
        }),
      ]),
    )
  })

  it('records saved external discovery candidates in the public catalog', async () => {
    const repository = createFirestoreRepository('user-1')
    const candidate: DiscoveryCandidate = {
      id: 'external-anilist-154587',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      status: 'queued',
      origin: 'externalSearch',
      source: 'anilist',
      sourceId: '154587',
      overview: 'A quiet fantasy journey.',
      posterUrl: 'https://img.anili.st/media/154587.jpg',
      releaseYear: 2023,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['Fantasy', 'Adventure'],
      tags: ['anime', 'anilist'],
      moodTags: [],
      externalRefs: {
        anilistId: '154587',
        sourceUrl: 'https://anilist.co/anime/154587',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    await repository?.recordDiscoverySaveToPublicCatalog(candidate)

    expect(searchMocks.recordCatalogDemands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'anime-anilist-154587',
        progressTotal: 28,
        progressUnit: 'episodes',
        title: 'Frieren: Beyond Journey End',
      }),
    ])
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('records imported external items in the public catalog without private fields', async () => {
    const repository = createFirestoreRepository('user-1')
    const importedItem: ListItem = {
      id: 'anime-frieren-anilist-154587',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      status: 'completed',
      rating: 5,
      progress: '28/28 episodios',
      progressCurrent: 28,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['Fantasy', 'Adventure'],
      tags: ['private-tag'],
      moodTags: ['private-mood'],
      weights: DEFAULT_WEIGHTS,
      notes: 'Mis notas privadas',
      source: 'external',
      rawText: 'Raw privado de importacion',
      importNotes: ['Importado desde AniList', 'Ano: 2023', 'Nota privada'],
      externalRefs: {
        anilistId: '154587',
        sourceUrl: 'https://anilist.co/anime/154587',
      },
      posterUrl: 'https://img.anili.st/media/154587.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    await repository?.recordImportedItemToPublicCatalog(importedItem)

    expect(searchMocks.recordCatalogDemands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'anime-anilist-154587',
        externalRefs: {
          anilistId: '154587',
          sourceUrl: 'https://anilist.co/anime/154587',
        },
        progressTotal: 28,
        progressUnit: 'episodes',
        releaseYear: 2023,
        tags: ['anime', 'AniList'],
        title: 'Frieren: Beyond Journey End',
      }),
    ])
    const payload = searchMocks.recordCatalogDemands.mock.calls[0][0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('rating')
    expect(payload).not.toHaveProperty('progress')
    expect(payload).not.toHaveProperty('progressCurrent')
    expect(payload).not.toHaveProperty('notes')
    expect(payload).not.toHaveProperty('rawText')
    expect(payload).not.toHaveProperty('importNotes')
    expect(payload).not.toHaveProperty('weights')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('delegates imported external-ref deduplication to the idempotent callable', async () => {
    const repository = createFirestoreRepository('user-1')
    const existing: PublicCatalogItem = {
      id: 'anime-frieren',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      genres: ['Fantasy'],
      tags: ['anime'],
      moodTags: [],
      externalRefs: {
        anilistId: '154587',
      },
      searchTokens: ['frieren'],
      canonicalKey: 'anime:frieren beyond journey end',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
    }
    const importedItem: ListItem = {
      id: 'anime-frieren-anilist-154587',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      status: 'completed',
      progressCurrent: 28,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['Fantasy', 'Adventure'],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'external',
      importNotes: ['Importado desde AniList', 'Ano: 2023'],
      externalRefs: {
        anilistId: '154587',
        sourceUrl: 'https://anilist.co/anime/154587',
      },
      posterUrl: 'https://img.anili.st/media/154587.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => existing,
          ref: { path: 'publicItems/anime-frieren' },
        },
      ],
    })

    await repository?.recordImportedItemToPublicCatalog(importedItem)

    expect(searchMocks.recordCatalogDemands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'anime-anilist-154587',
        externalRefs: {
          anilistId: '154587',
          sourceUrl: 'https://anilist.co/anime/154587',
        },
        posterUrl: 'https://img.anili.st/media/154587.jpg',
        progressTotal: 28,
        progressUnit: 'episodes',
        releaseYear: 2023,
      }),
    ])
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('sends a stable canonical fallback id for imports without an external ref', async () => {
    const repository = createFirestoreRepository('user-1')
    const existing: PublicCatalogItem = {
      id: 'book-the-left-hand-of-darkness',
      title: 'The Left Hand of Darkness',
      type: 'book',
      genres: ['Science fiction'],
      tags: ['book'],
      moodTags: [],
      externalRefs: {},
      searchTokens: ['left', 'hand', 'darkness'],
      canonicalKey: 'book:the left hand of darkness',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
    }
    const importedItem: ListItem = {
      id: 'book-the-left-hand-of-darkness-goodreads',
      title: 'The Left Hand of Darkness',
      type: 'book',
      status: 'wishlist',
      genres: ['Science fiction'],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'external',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          data: () => existing,
          ref: { path: 'publicItems/book-the-left-hand-of-darkness' },
        },
      ],
    })

    await repository?.recordImportedItemToPublicCatalog(importedItem)

    expect(searchMocks.recordCatalogDemands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'book-the-left-hand-of-darkness',
        title: 'The Left Hand of Darkness',
      }),
    ])
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('uses a stable external reference id and leaves canonical merging to the callable', async () => {
    const repository = createFirestoreRepository('user-1')
    const externalExisting: PublicCatalogItem = {
      id: 'anime-frieren-by-ref',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      genres: ['Fantasy'],
      tags: ['anime'],
      moodTags: [],
      externalRefs: {
        anilistId: '154587',
      },
      searchTokens: ['frieren'],
      canonicalKey: 'anime:frieren beyond journey end',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
    }
    const canonicalExisting: PublicCatalogItem = {
      ...externalExisting,
      id: 'anime-frieren-by-title',
      externalRefs: {},
    }
    const importedItem: ListItem = {
      id: 'anime-frieren-anilist-154587',
      title: 'Frieren: Beyond Journey End',
      type: 'anime',
      status: 'completed',
      progressCurrent: 28,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['Fantasy', 'Adventure'],
      tags: [],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'external',
      externalRefs: {
        anilistId: '154587',
      },
      posterUrl: 'https://img.anili.st/media/154587.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mocks.getDocs
      .mockResolvedValueOnce({
        docs: [
          {
            data: () => externalExisting,
            ref: { path: 'publicItems/anime-frieren-by-ref' },
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          {
            data: () => canonicalExisting,
            ref: { path: 'publicItems/anime-frieren-by-title' },
          },
        ],
      })

    await repository?.recordImportedItemToPublicCatalog(importedItem)

    expect(searchMocks.recordCatalogDemands).toHaveBeenCalledWith([
      expect.objectContaining({
        externalRefs: { anilistId: '154587' },
        id: 'anime-anilist-154587',
      }),
    ])
    expect(mocks.getDocs).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('records an existing Nexo candidate through the idempotent callable', async () => {
    const repository = createFirestoreRepository('user-1')
    const publicDune: PublicCatalogItem = {
      id: 'movie-dune-2021',
      title: 'Dune',
      type: 'movie',
      description: 'Ficha curada de Nexo.',
      releaseYear: 2021,
      genres: ['Ciencia ficcion'],
      tags: ['Aventura'],
      moodTags: [],
      externalRefs: {
        tmdbId: '438631',
      },
      posterUrl: 'https://image.tmdb.org/t/p/w342/dune.jpg',
      searchTokens: ['dune'],
      canonicalKey: 'movie:dune',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
    }
    const candidate: DiscoveryCandidate = {
      id: 'public-movie-dune-2021',
      title: 'Dune',
      type: 'movie',
      status: 'queued',
      origin: 'publicCatalog',
      source: 'nexo',
      sourceId: 'movie-dune-2021',
      overview: 'External runtime and poster from TMDB.',
      posterUrl: 'https://image.tmdb.org/t/p/w342/dune-new.jpg',
      releaseYear: 2021,
      progressTotal: 2.6,
      progressUnit: 'hours',
      genres: ['Ciencia ficcion'],
      tags: ['Aventura'],
      moodTags: [],
      externalRefs: {
        tmdbId: '438631',
        sourceUrl: 'https://www.themoviedb.org/movie/438631',
      },
      publicItemId: 'movie-dune-2021',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mocks.getDoc.mockResolvedValueOnce({
      data: () => publicDune,
      exists: () => true,
    })

    await repository?.recordDiscoverySaveToPublicCatalog(candidate)

    expect(searchMocks.recordCatalogDemands).toHaveBeenCalledWith([
      expect.objectContaining({
        externalRefs: {
          tmdbId: '438631',
          sourceUrl: 'https://www.themoviedb.org/movie/438631',
        },
        id: 'movie-dune-2021',
        progressTotal: 2.6,
        progressUnit: 'hours',
      }),
    ])
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('leaves archived-match revival to the callable when saving an external candidate', async () => {
    const repository = createFirestoreRepository('user-1')
    const archivedDune: PublicCatalogItem = {
      id: 'movie-tmdb-438631',
      title: 'Dune',
      type: 'movie',
      releaseYear: 2021,
      genres: ['Ciencia ficcion'],
      tags: ['Aventura'],
      moodTags: [],
      externalRefs: {
        tmdbId: '438631',
      },
      searchTokens: ['dune'],
      canonicalKey: 'movie:dune',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'moderator',
      updatedBy: 'moderator',
      archivedAt: '2026-06-20T00:00:00.000Z',
    }
    const candidate: DiscoveryCandidate = {
      id: 'external-tmdb-438631',
      title: 'Dune',
      type: 'movie',
      status: 'queued',
      origin: 'externalSearch',
      source: 'tmdb',
      sourceId: '438631',
      overview: 'A desert planet becomes the center of a galactic struggle.',
      releaseYear: 2021,
      progressTotal: 2.6,
      progressUnit: 'hours',
      genres: ['Ciencia ficcion', 'Aventura'],
      tags: ['movie', 'tmdb'],
      moodTags: [],
      externalRefs: {
        tmdbId: '438631',
        sourceUrl: 'https://www.themoviedb.org/movie/438631',
      },
      posterUrl: 'https://image.tmdb.org/t/p/w342/dune.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mocks.getDoc.mockResolvedValueOnce({
      data: () => archivedDune,
      exists: () => true,
    })

    await repository?.recordDiscoverySaveToPublicCatalog(candidate)

    expect(searchMocks.recordCatalogDemands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'movie-tmdb-438631',
        progressTotal: 2.6,
        progressUnit: 'hours',
      }),
    ])
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})
