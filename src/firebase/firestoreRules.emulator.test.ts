import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteField, doc, getDoc, increment, setDoc } from 'firebase/firestore'

const maybeDescribe = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

function validPrivateItem(id: string) {
  const timestamp = '2026-01-01T00:00:00.000Z'
  return {
    id,
    title: 'Outer Wilds',
    type: 'game',
    status: 'wishlist',
    genres: [],
    tags: [],
    moodTags: [],
    weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function validDiscoveryCandidate(id: string) {
  const timestamp = '2026-01-01T00:00:00.000Z'
  return {
    id,
    title: 'Dune',
    type: 'book',
    status: 'queued',
    origin: 'externalSearch',
    source: 'openLibrary',
    sourceId: 'OL893415W',
    genres: [],
    tags: [],
    moodTags: [],
    externalRefs: { openLibraryKey: '/works/OL893415W' },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

maybeDescribe('firestore.rules emulator', () => {
  let env: RulesTestEnvironment

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'nexo-test',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    })
  })

  afterAll(async () => {
    await env?.cleanup()
  })

  beforeEach(async () => {
    await env.clearFirestore()
  })

  it('allows signed-in users to read and write their own library', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const itemRef = doc(ownerDb, 'users', 'owner', 'items', 'outer-wilds')
    const activityRef = doc(ownerDb, 'users', 'owner', 'activityEntries', 'activity-1')

    await expect(setDoc(itemRef, validPrivateItem('outer-wilds'))).resolves.toBeUndefined()
    await expect(getDoc(itemRef)).resolves.toBeTruthy()
    await expect(setDoc(itemRef, { status: 'completed', updatedAt: '2026-01-02T00:00:00.000Z' }, { merge: true }))
      .resolves.toBeUndefined()
    await expect(setDoc(activityRef, { label: 'Ficha guardada', createdAt: '2026-01-01T00:00:00.000Z' })).resolves.toBeUndefined()
    await expect(getDoc(activityRef)).resolves.toBeTruthy()
  })

  it('rejects a partial status mutation when the private item no longer exists', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const ghostRef = doc(ownerDb, 'users', 'owner', 'items', 'deleted-concurrently')

    await expect(
      setDoc(ghostRef, { status: 'completed', updatedAt: '2026-01-02T00:00:00.000Z' }, { merge: true }),
    ).rejects.toThrow()
  })

  it('allows complete discovery candidates but rejects decision merges that would create ghosts', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const candidateRef = doc(ownerDb, 'users', 'owner', 'externalCandidates', 'book-dune')
    const publicCandidateRef = doc(ownerDb, 'users', 'owner', 'externalCandidates', 'public-book-dune')
    const ghostRef = doc(ownerDb, 'users', 'owner', 'externalCandidates', 'deleted-concurrently')

    await expect(setDoc(candidateRef, validDiscoveryCandidate('book-dune'))).resolves.toBeUndefined()
    await expect(setDoc(publicCandidateRef, {
      id: 'public-book-dune',
      title: 'Dune',
      type: 'book',
      status: 'queued',
      origin: 'publicCatalog',
      source: 'nexo',
      sourceId: 'book-dune',
      overview: 'Politica, ecologia, mesianismo y poder.',
      releaseYear: 1965,
      genres: ['sci-fi', 'politica', 'aventura'],
      tags: ['novela', 'desierto', 'saga'],
      moodTags: ['denso', 'epico'],
      searchAliases: [],
      externalRefs: { sourceUrl: 'https://openlibrary.org/search?q=Dune+Frank+Herbert' },
      publicItemId: 'book-dune',
      publicSnapshot: {
        id: 'book-dune',
        title: 'Dune',
        type: 'book',
        description: 'Politica, ecologia, mesianismo y poder.',
        releaseYear: 1965,
        genres: ['sci-fi', 'politica', 'aventura'],
        tags: ['novela', 'desierto', 'saga'],
        moodTags: ['denso', 'epico'],
        searchAliases: [],
        externalRefs: { sourceUrl: 'https://openlibrary.org/search?q=Dune+Frank+Herbert' },
        canonicalKey: 'book:dune',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).resolves.toBeUndefined()
    await expect(setDoc(candidateRef, {
      id: 'book-dune',
      status: 'dismissed',
      dismissedAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }, { merge: true })).resolves.toBeUndefined()
    await expect(setDoc(ghostRef, {
      id: 'deleted-concurrently',
      status: 'dismissed',
      dismissedAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }, { merge: true })).rejects.toThrow()
  })

  it('rejects oversized private fields and roadmap payloads', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()

    await expect(
      setDoc(doc(ownerDb, 'users', 'owner', 'items', 'oversized'), {
        title: 'x'.repeat(201),
      }),
    ).rejects.toThrow()
    await expect(
      setDoc(doc(ownerDb, 'users', 'owner', 'items', 'too-many-tags'), {
        title: 'Valid title',
        tags: Array.from({ length: 65 }, (_, index) => `tag-${index}`),
      }),
    ).rejects.toThrow()
    await expect(
      setDoc(doc(ownerDb, 'users', 'owner', 'userSettings', 'preferences'), {
        roadmap: {
          now: Array.from({ length: 5001 }, () => 'item'),
          next: [],
          later: [],
          hidden: [],
        },
      }),
    ).rejects.toThrow()
    await expect(
      setDoc(doc(ownerDb, 'users', 'owner', 'items', 'invalid-external-ref'), {
        title: 'Invalid reference',
        externalRefs: { tmdbId: 42 },
      }),
    ).rejects.toThrow()
    await expect(
      setDoc(doc(ownerDb, 'users', 'owner', 'items', 'oversized-external-ref'), {
        title: 'Oversized reference',
        externalRefs: { tmdbId: 'x'.repeat(121) },
      }),
    ).rejects.toThrow()
  })

  it('rejects unknown fields in every private collection', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const writes = [
      () => setDoc(doc(ownerDb, 'users', 'owner', 'items', 'unknown'), { title: 'Item', privateToken: 'nope' }),
      () => setDoc(doc(ownerDb, 'users', 'owner', 'userSettings', 'preferences'), { unknownSetting: true }),
      () => setDoc(doc(ownerDb, 'users', 'owner', 'externalCandidates', 'unknown'), { id: 'unknown', secret: 'nope' }),
      () => setDoc(doc(ownerDb, 'users', 'owner', 'activityEntries', 'unknown'), { label: 'Activity', payload: 'nope' }),
      () => setDoc(doc(ownerDb, 'users', 'owner', 'recommendationRuns', 'unknown'), { itemId: 'item', debug: true }),
      () => setDoc(doc(ownerDb, 'users', 'owner', 'tags', 'unknown'), { name: 'Tag', ownerEmail: 'nope@example.com' }),
    ]

    for (const write of writes) await expect(write()).rejects.toThrow()
  })

  it('blocks signed-in users from another user library', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner', 'items', 'outer-wilds'), {
        title: 'Outer Wilds',
      })
    })

    const otherDb = env.authenticatedContext('other').firestore()

    await expect(getDoc(doc(otherDb, 'users', 'owner', 'items', 'outer-wilds'))).rejects.toThrow()
    await expect(setDoc(doc(otherDb, 'users', 'owner', 'items', 'new-item'), { title: 'Nope' })).rejects.toThrow()
  })

  it('blocks anonymous users from user libraries', async () => {
    const anonymousDb = env.unauthenticatedContext().firestore()

    await expect(getDoc(doc(anonymousDb, 'users', 'owner', 'items', 'outer-wilds'))).rejects.toThrow()
    await expect(setDoc(doc(anonymousDb, 'users', 'owner', 'items', 'new-item'), { title: 'Nope' })).rejects.toThrow()
  })

  it('blocks legacy root collections', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()

    await expect(setDoc(doc(ownerDb, 'items', 'outer-wilds'), { title: 'Outer Wilds' })).rejects.toThrow()
    await expect(getDoc(doc(ownerDb, 'items', 'outer-wilds'))).rejects.toThrow()
  })

  it('lets signed-in users read active public catalog items but not write them', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicItems', 'book-odisea'), {
        title: 'Odisea',
        type: 'book',
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()

    await expect(getDoc(doc(ownerDb, 'publicItems', 'book-odisea'))).resolves.toBeTruthy()
    await expect(setDoc(doc(ownerDb, 'publicItems', 'book-odisea'), { title: 'Nope' })).rejects.toThrow()
  })

  it('blocks direct catalog ingestion and demand updates from signed-in clients', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const itemRef = doc(ownerDb, 'publicItems', 'anime-anilist-154587')
    const timestamp = '2026-06-20T12:00:00.000Z'

    await expect(
      setDoc(itemRef, {
        id: 'anime-anilist-154587',
        title: 'Frieren: Beyond Journey End',
        type: 'anime',
        description: 'A quiet fantasy journey.',
        releaseYear: 2023,
        progressTotal: 28,
        progressUnit: 'episodes',
        genres: ['Fantasy'],
        tags: ['anime', 'AniList'],
        moodTags: [],
        searchAliases: ['Frieren'],
        externalRefs: {
          anilistId: '154587',
          sourceUrl: 'https://anilist.co/anime/154587',
        },
        posterUrl: 'https://img.anili.st/media/154587.jpg',
        searchTokens: ['frieren', 'anime'],
        canonicalKey: 'anime:frieren beyond journey end',
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: 'owner',
        updatedBy: 'owner',
        autoIngestedAt: timestamp,
        demandCount: 1,
        lastDemandAt: timestamp,
      }),
    ).rejects.toThrow()

    await expect(
      setDoc(itemRef, { demandCount: increment(1), lastDemandAt: '2026-06-20T12:01:00.000Z' }, { merge: true }),
    ).rejects.toThrow()
    await expect(setDoc(itemRef, { title: 'Nope' }, { merge: true })).rejects.toThrow()
  })

  it('blocks private fields on user auto-ingested public catalog items', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const itemRef = doc(ownerDb, 'publicItems', 'anime-anilist-private')
    const timestamp = '2026-06-20T12:00:00.000Z'

    await expect(
      setDoc(itemRef, {
        id: 'anime-anilist-private',
        title: 'Private Anime',
        type: 'anime',
        releaseYear: 2023,
        progressTotal: 12,
        progressUnit: 'episodes',
        genres: ['Fantasy'],
        tags: ['anime', 'AniList'],
        moodTags: [],
        searchAliases: [],
        externalRefs: {
          anilistId: 'private',
        },
        searchTokens: ['private', 'anime'],
        canonicalKey: 'anime:private anime',
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: 'owner',
        updatedBy: 'owner',
        autoIngestedAt: timestamp,
        demandCount: 1,
        lastDemandAt: timestamp,
        status: 'completed',
        rating: 5,
        progressCurrent: 12,
        notes: 'No publicar',
        rawText: 'Raw privado',
        importNotes: ['Nota privada'],
        weights: { priority: 1 },
      }),
    ).rejects.toThrow()
  })

  it('rejects oversized or unknown public catalog metadata', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const timestamp = '2026-06-20T12:00:00.000Z'
    const item = {
      id: 'book-unsafe',
      title: 'Unsafe book',
      type: 'book',
      genres: [],
      tags: [],
      moodTags: [],
      externalRefs: { privateToken: 'never' },
      searchTokens: ['unsafe'],
      canonicalKey: 'book:unsafe book',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: 'owner',
      updatedBy: 'owner',
      autoIngestedAt: timestamp,
      demandCount: 1,
      lastDemandAt: timestamp,
    }

    await expect(setDoc(doc(ownerDb, 'publicItems', item.id), item)).rejects.toThrow()
    await expect(
      setDoc(doc(ownerDb, 'publicItems', item.id), {
        ...item,
        externalRefs: {},
        description: 'x'.repeat(20001),
      }),
    ).rejects.toThrow()
  })

  it('keeps catalog demand receipts private to trusted server code', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const receiptRef = doc(ownerDb, 'publicItems', 'book-dune', 'demands', 'owner')

    await expect(setDoc(receiptRef, { itemId: 'book-dune', userId: 'owner' })).rejects.toThrow()
    await expect(getDoc(receiptRef)).rejects.toThrow()
  })

  it('blocks direct demand updates on legacy public catalog items', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicItems', 'game-hollow-knight'), {
        id: 'game-hollow-knight',
        title: 'Hollow Knight',
        type: 'game',
        genres: ['Metroidvania'],
        tags: ['Aventura'],
        moodTags: [],
        externalRefs: {},
        searchTokens: ['hollow', 'knight'],
        canonicalKey: 'game:hollow knight',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'moderator',
        updatedBy: 'moderator',
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const itemRef = doc(ownerDb, 'publicItems', 'game-hollow-knight')

    await expect(
      setDoc(itemRef, { demandCount: increment(1), lastDemandAt: '2026-06-20T12:01:00.000Z' }, { merge: true }),
    ).rejects.toThrow()
  })

  it('blocks direct metadata enrichment while bumping demand', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicItems', 'movie-dune-2021'), {
        id: 'movie-dune-2021',
        title: 'Dune',
        type: 'movie',
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
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const itemRef = doc(ownerDb, 'publicItems', 'movie-dune-2021')

    await expect(
      setDoc(
        itemRef,
        {
          demandCount: increment(1),
          description: 'External runtime and poster from TMDB.',
          externalRefs: {
            tmdbId: '438631',
            sourceUrl: 'https://www.themoviedb.org/movie/438631',
          },
          lastDemandAt: '2026-06-20T12:01:00.000Z',
          posterUrl: 'https://image.tmdb.org/t/p/w342/dune-new.jpg',
          progressTotal: 2.6,
          progressUnit: 'hours',
          releaseYear: 2021,
          updatedAt: '2026-06-20T12:01:00.000Z',
          updatedBy: 'owner',
        },
        { merge: true },
      ),
    ).rejects.toThrow()

    await expect(
      setDoc(
        itemRef,
        {
          demandCount: increment(1),
          lastDemandAt: '2026-06-20T12:02:00.000Z',
          progressTotal: 3,
          updatedAt: '2026-06-20T12:02:00.000Z',
          updatedBy: 'owner',
        },
        { merge: true },
      ),
    ).rejects.toThrow()
  })

  it('blocks direct revival of archived public catalog items', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicItems', 'movie-tmdb-438631'), {
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
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const itemRef = doc(ownerDb, 'publicItems', 'movie-tmdb-438631')
    const timestamp = '2026-06-20T12:01:00.000Z'

    await expect(
      setDoc(
        itemRef,
        {
          id: 'movie-tmdb-438631',
          title: 'Dune',
          type: 'movie',
          description: 'A desert planet becomes the center of a galactic struggle.',
          releaseYear: 2021,
          progressTotal: 2.6,
          progressUnit: 'hours',
          genres: ['Ciencia ficcion', 'Aventura'],
          tags: ['movie', 'TMDB', 'Ciencia ficcion', 'Aventura'],
          moodTags: [],
          searchAliases: [],
          externalRefs: {
            tmdbId: '438631',
            sourceUrl: 'https://www.themoviedb.org/movie/438631',
          },
          posterUrl: 'https://image.tmdb.org/t/p/w342/dune.jpg',
          searchTokens: ['dune', 'movie', 'tmdb', '2021'],
          canonicalKey: 'movie:dune',
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: 'owner',
          updatedBy: 'owner',
          autoIngestedAt: timestamp,
          demandCount: 1,
          lastDemandAt: timestamp,
          archivedAt: deleteField(),
        },
        { merge: true },
      ),
    ).rejects.toThrow()
  })

  it('blocks anonymous public catalog reads', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicItems', 'archived'), {
        title: 'Archived',
        archivedAt: '2026-01-01T00:00:00.000Z',
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const anonymousDb = env.unauthenticatedContext().firestore()

    await expect(getDoc(doc(ownerDb, 'publicItems', 'archived'))).resolves.toBeTruthy()
    await expect(getDoc(doc(anonymousDb, 'publicItems', 'archived'))).rejects.toThrow()
  })

  it('allows moderators to write public catalog items directly', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner'), {
        uid: 'owner',
        role: 'moderator',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      await setDoc(doc(context.firestore(), 'users', 'other'), {
        uid: 'other',
        role: 'user',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const otherDb = env.authenticatedContext('other').firestore()

    await expect(setDoc(doc(ownerDb, 'publicItems', 'book-odisea'), { title: 'Odisea' })).resolves.toBeUndefined()
    await expect(
      setDoc(
        doc(ownerDb, 'publicItems', 'book-odisea'),
        { externalRefs: { sourceUrl: 42 } },
        { merge: true },
      ),
    ).rejects.toThrow()
    await expect(
      setDoc(
        doc(ownerDb, 'publicItems', 'book-odisea'),
        { externalRefs: { sourceUrl: `https://example.com/${'x'.repeat(2_001)}` } },
        { merge: true },
      ),
    ).rejects.toThrow()
    await expect(
      setDoc(
        doc(ownerDb, 'publicItems', 'book-odisea'),
        { tags: Array.from({ length: 65 }, (_, index) => `tag-${index}`) },
        { merge: true },
      ),
    ).rejects.toThrow()
    await expect(setDoc(doc(otherDb, 'publicItems', 'book-odisea'), { title: 'Nope' })).rejects.toThrow()
  })

  it('allows users to create their profile as user but not promote themselves', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const profileRef = doc(ownerDb, 'users', 'owner')

    await expect(
      setDoc(profileRef, {
        uid: 'owner',
        role: 'user',
        email: 'owner@example.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).resolves.toBeUndefined()
    await expect(setDoc(profileRef, { role: 'admin', updatedAt: '2026-01-02T00:00:00.000Z' }, { merge: true })).rejects.toThrow()
    await expect(setDoc(profileRef, { displayName: 'Owner', updatedAt: '2026-01-02T00:00:00.000Z' }, { merge: true })).resolves.toBeUndefined()
    await expect(setDoc(profileRef, { displayName: 42, updatedAt: '2026-01-02T00:00:00.000Z' }, { merge: true })).rejects.toThrow()
  })

  it('allows admins to change user roles', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'admin'), {
        uid: 'admin',
        role: 'admin',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      await setDoc(doc(context.firestore(), 'users', 'owner'), {
        uid: 'owner',
        role: 'user',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    })

    const adminDb = env.authenticatedContext('admin').firestore()
    const ownerDb = env.authenticatedContext('owner').firestore()

    await expect(getDoc(doc(ownerDb, 'users', 'owner'))).resolves.toBeTruthy()
    await expect(getDoc(doc(ownerDb, 'users', 'admin'))).rejects.toThrow()
    await expect(setDoc(doc(adminDb, 'users', 'owner'), { role: 'moderator', updatedAt: '2026-01-02T00:00:00.000Z' }, { merge: true })).resolves.toBeUndefined()
  })
})
