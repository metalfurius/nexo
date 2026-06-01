import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

const legacyCollections = [
  'items',
  'recommendationRuns',
  'tags',
  'externalCandidates',
  'userSettings',
]

const args = new Map<string, string | boolean>()
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  if (!arg.startsWith('--')) continue
  const key = arg.slice(2)
  const next = process.argv[index + 1]
  if (next && !next.startsWith('--')) {
    args.set(key, next)
    index += 1
  } else {
    args.set(key, true)
  }
}

if (args.get('confirm') !== 'BORRAR_LEGACY') {
  throw new Error('Refusing to delete legacy data. Run with --confirm BORRAR_LEGACY.')
}

const projectId = String(
  args.get('project') ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    (await readFirebaseProjectId()) ??
    '',
)

if (!projectId) {
  throw new Error('No Firebase project configured. Use --project <project-id> or add .firebaserc.')
}

initializeApp({
  credential: applicationDefault(),
  projectId,
})

const db = getFirestore()
let deletedTotal = 0

for (const collectionName of legacyCollections) {
  const deletedCount = await deleteRootCollection(db, collectionName)
  deletedTotal += deletedCount
  console.log(`${collectionName}: deleted ${deletedCount} legacy documents`)
}

console.log(`Deleted ${deletedTotal} legacy root documents from project ${projectId}`)

async function deleteRootCollection(db: Firestore, collectionName: string) {
  let deletedCount = 0

  for (;;) {
    const snapshot = await db.collection(collectionName).limit(400).get()
    if (snapshot.empty) return deletedCount

    const batch = db.batch()
    for (const docSnapshot of snapshot.docs) {
      batch.delete(docSnapshot.ref)
    }
    await batch.commit()
    deletedCount += snapshot.size
  }
}

async function readFirebaseProjectId() {
  try {
    const firebaseRc = JSON.parse(await readFile(resolve('.firebaserc'), 'utf8')) as {
      projects?: { default?: string }
    }
    return firebaseRc.projects?.default
  } catch {
    return undefined
  }
}
