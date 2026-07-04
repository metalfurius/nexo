import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { buildPublicCatalogItem } from '../src/lib/catalog'

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'recomendaciones-78eb7'
const moderatorUid = process.env.E2E_FIREBASE_MOD_UID || 'e2e-moderator'
const moderatorEmail = process.env.E2E_FIREBASE_MOD_EMAIL || 'moderator@nexo.local'
const moderatorPassword = process.env.E2E_FIREBASE_MOD_PASSWORD || 'nexo-moderator-password'
const timestamp = '2026-07-04T00:00:00.000Z'

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('seedFirebaseE2e must run inside Firebase emulators.')
}

initializeApp({ projectId })

const auth = getAuth()
const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

await upsertModeratorUser()
await seedPublicCatalog()

console.log(`Seeded Firebase E2E data in ${projectId}`)

async function upsertModeratorUser() {
  try {
    await auth.getUser(moderatorUid)
    await auth.updateUser(moderatorUid, {
      displayName: 'Moderador E2E',
      email: moderatorEmail,
      emailVerified: true,
      password: moderatorPassword,
    })
  } catch {
    await auth.createUser({
      uid: moderatorUid,
      displayName: 'Moderador E2E',
      email: moderatorEmail,
      emailVerified: true,
      password: moderatorPassword,
    })
  }

  await db.collection('users').doc(moderatorUid).set({
    uid: moderatorUid,
    role: 'moderator',
    email: moderatorEmail,
    displayName: 'Moderador E2E',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSeenAt: timestamp,
  })
}

async function seedPublicCatalog() {
  const items = [
    buildPublicCatalogItem(
      {
        id: 'book-dune',
        title: 'Dune',
        type: 'book',
        description: 'Politica, ecologia, mesianismo y poder en una de las sagas clave de la ciencia ficcion.',
        releaseYear: 1965,
        genres: ['sci-fi', 'politica', 'aventura'],
        tags: ['novela', 'desierto', 'saga'],
        moodTags: ['denso', 'epico'],
        externalRefs: {
          sourceUrl: 'https://openlibrary.org/search?q=Dune+Frank+Herbert',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: 'e2e-seed',
        updatedBy: 'e2e-seed',
      },
      'e2e-seed',
    ),
    buildPublicCatalogItem(
      {
        id: 'movie-dune',
        title: 'Dune',
        type: 'movie',
        description: 'Politica, profecia y poder en Arrakis, con escala de epopeya espacial.',
        releaseYear: 2021,
        genres: ['sci-fi', 'aventura', 'drama'],
        tags: ['pelicula', 'desierto', 'saga'],
        moodTags: ['epico', 'solemne'],
        searchAliases: ['Dune 2021', 'Dune Part One'],
        externalRefs: {
          tmdbId: '438631',
          sourceUrl: 'https://www.themoviedb.org/movie/438631-dune',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: 'e2e-seed',
        updatedBy: 'e2e-seed',
      },
      'e2e-seed',
    ),
  ]

  for (const item of items) {
    await db.collection('publicItems').doc(item.id).set(item)
  }
}
