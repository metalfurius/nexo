import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { mergeParsedItems, parseMarkdownFile } from '../src/lib/markdownParser'

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

const sourceDir = resolve(String(args.get('source') ?? '../Listas'))
const outPath = resolve(String(args.get('out') ?? 'seed/listas-import.json'))
const writeToFirestore = args.has('write')
const files = ['Juegos.md', 'Libros.md', 'Ver.md', 'Recomendaciones.md']

const parsed = await Promise.all(
  files.map(async (fileName) => {
    const content = await readFile(resolve(sourceDir, fileName), 'utf8')
    return parseMarkdownFile(fileName, content)
  }),
)

const merged = mergeParsedItems(parsed)
const payload = {
  generatedAt: new Date().toISOString(),
  sourceDir,
  itemCount: merged.items.length,
  notes: merged.notes,
  items: merged.items,
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Imported ${payload.itemCount} items into ${outPath}`)

if (writeToFirestore) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  })
  const db = getFirestore()
  let batch = db.batch()
  let batchSize = 0

  for (const item of merged.items) {
    batch.set(db.collection('items').doc(item.id), item, { merge: true })
    batchSize += 1
    if (batchSize >= 400) {
      await batch.commit()
      batch = db.batch()
      batchSize = 0
    }
  }
  if (batchSize > 0) await batch.commit()
  console.log(`Wrote ${merged.items.length} items to Firestore`)
}

