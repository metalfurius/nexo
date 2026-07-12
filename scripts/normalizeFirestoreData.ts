import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

const MAX_BATCH_SIZE = 400
const LEGACY_FIELDS = {
  publicItems: ['repairedAt', 'repairedBy'],
  items: ['genresText', 'moodText', 'tagsText'],
} as const

export interface NormalizationMutation {
  values: Record<string, unknown>
  deleteFields: string[]
}

interface PlannedMutation {
  collection: string
  pathHash: string
  document: QueryDocumentSnapshot
  mutation: NormalizationMutation
}

interface NormalizationReport {
  generatedAt: string
  projectId: string
  mode: 'dry-run' | 'write'
  scanned: Record<string, number>
  mutationCount: number
  mutations: Array<{
    collection: string
    pathHash: string
    setFields: string[]
    deletedFields: string[]
  }>
}

export function buildNormalizationMutation(
  collection: 'users' | 'publicItems' | 'items',
  data: DocumentData,
  createdAtFallback?: string,
): NormalizationMutation | undefined {
  const values: Record<string, unknown> = {}
  const deleteFields: string[] = []

  if (collection === 'users' && !Object.hasOwn(data, 'createdAt') && createdAtFallback) {
    values.createdAt = createdAtFallback
  }

  if (collection === 'publicItems' || collection === 'items') {
    for (const field of LEGACY_FIELDS[collection]) {
      if (Object.hasOwn(data, field)) deleteFields.push(field)
    }
  }

  if (!Object.keys(values).length && !deleteFields.length) return undefined
  return { values, deleteFields }
}

export function chunkMutations<T>(values: T[], maximum = MAX_BATCH_SIZE) {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > MAX_BATCH_SIZE) {
    throw new Error(`Batch size must be an integer between 1 and ${MAX_BATCH_SIZE}.`)
  }
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += maximum) {
    chunks.push(values.slice(index, index + maximum))
  }
  return chunks
}

export async function runFirestoreDataNormalization(cliArgs = process.argv.slice(2)) {
  const args = readArgs(cliArgs)
  const projectId = String(
    args.get('project')
      ?? process.env.GOOGLE_CLOUD_PROJECT
      ?? process.env.FIREBASE_PROJECT_ID
      ?? await readFirebaseProjectId()
      ?? '',
  )
  if (!projectId) {
    throw new Error('No Firebase project configured. Use --project <project-id> or configure ADC environment variables.')
  }

  const write = args.has('write')
  const outputPath = resolve(String(args.get('out') ?? '.firestore-audit/normalization.json'))
  const app = initializeApp({ credential: applicationDefault(), projectId }, `firestore-normalizer-${Date.now()}`)
  const db = getFirestore(app)
  const scanned: Record<string, number> = {}
  const planned: PlannedMutation[] = []

  const users = await db.collection('users').get()
  scanned.users = users.size
  planDocuments('users', users.docs, planned)

  const publicItems = await db.collection('publicItems').get()
  scanned.publicItems = publicItems.size
  planDocuments('publicItems', publicItems.docs, planned)

  const itemSnapshot = await db.collectionGroup('items').get()
  const privateItems = itemSnapshot.docs.filter((document) => {
    const parts = document.ref.path.split('/')
    return parts.length === 4 && parts[0] === 'users' && parts[2] === 'items'
  })
  scanned.items = privateItems.length
  planDocuments('items', privateItems, planned)

  if (write) {
    for (const group of chunkMutations(planned)) {
      const batch = db.batch()
      for (const entry of group) {
        const update: Record<string, unknown> = { ...entry.mutation.values }
        for (const field of entry.mutation.deleteFields) update[field] = FieldValue.delete()
        batch.update(entry.document.ref, update)
      }
      await batch.commit()
    }
  }

  const report: NormalizationReport = {
    generatedAt: new Date().toISOString(),
    projectId,
    mode: write ? 'write' : 'dry-run',
    scanned,
    mutationCount: planned.length,
    mutations: planned.map((entry) => ({
      collection: entry.collection,
      pathHash: entry.pathHash,
      setFields: Object.keys(entry.mutation.values).sort(),
      deletedFields: [...entry.mutation.deleteFields].sort(),
    })),
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const scannedCount = Object.values(scanned).reduce((sum, count) => sum + count, 0)
  console.log(`Firestore normalization scanned ${scannedCount} documents.`)
  console.log(`${write ? 'Applied' : 'Planned'} ${planned.length} conservative mutations. Report: ${outputPath}`)
  return report
}

function planDocuments(
  collection: 'users' | 'publicItems' | 'items',
  documents: QueryDocumentSnapshot[],
  planned: PlannedMutation[],
) {
  for (const document of documents) {
    const mutation = buildNormalizationMutation(
      collection,
      document.data(),
      document.createTime.toDate().toISOString(),
    )
    if (!mutation) continue
    planned.push({
      collection,
      pathHash: createHash('sha256').update(document.ref.path).digest('hex').slice(0, 20),
      document,
      mutation,
    })
  }
}

function readArgs(values: string[]) {
  const parsed = new Map<string, string | boolean>()
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--')) continue
    const key = value.slice(2)
    const next = values[index + 1]
    if (next && !next.startsWith('--')) {
      parsed.set(key, next)
      index += 1
    } else parsed.set(key, true)
  }
  return parsed
}

async function readFirebaseProjectId() {
  try {
    const firebaseRc = JSON.parse(await readFile(resolve('.firebaserc'), 'utf8')) as { projects?: { default?: string } }
    return firebaseRc.projects?.default
  } catch {
    return undefined
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runFirestoreDataNormalization()
}
