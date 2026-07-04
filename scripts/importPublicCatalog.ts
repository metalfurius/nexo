import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { parsePublicCatalogSeed } from '../src/lib/publicCatalogSeed'

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

const sourcePath = resolve(String(args.get('source') ?? 'seed/public-catalog.seed.json'))
const outPath = resolve(String(args.get('out') ?? 'seed/public-catalog.normalized.json'))
const actorId = String(args.get('actor') ?? process.env.NEXO_CATALOG_ACTOR_ID ?? 'catalog-import')
const writeToFirestore = args.has('write')

const seed = JSON.parse(await readFile(sourcePath, 'utf8')) as unknown
const result = parsePublicCatalogSeed(seed, actorId)
if (result.errors.length) {
  throw new Error(`Public catalog seed has ${result.errors.length} error(s):\n${result.errors.join('\n')}`)
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourcePath,
  actorId,
  itemCount: result.items.length,
  items: result.items,
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Normalized ${result.items.length} public catalog items into ${outPath}`)

if (writeToFirestore) {
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
  db.settings({ ignoreUndefinedProperties: true })

  let batch = db.batch()
  let batchSize = 0
  for (const item of result.items) {
    const payload = withoutUndefined(item) as Record<string, unknown>
    if (!item.archivedAt) payload.archivedAt = FieldValue.delete()
    batch.set(db.collection('publicItems').doc(item.id), payload, { merge: true })
    batchSize += 1
    if (batchSize >= 400) {
      await batch.commit()
      batch = db.batch()
      batchSize = 0
    }
  }
  if (batchSize > 0) await batch.commit()
  console.log(`Wrote ${result.items.length} items to publicItems in project ${projectId}`)
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutUndefined(entry)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, withoutUndefined(entry)]],
      ),
    ) as T
  }

  return value
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
