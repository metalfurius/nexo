import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore'

const PRIVATE_COLLECTION_FIELDS = {
  items: [
    'id', 'title', 'type', 'status', 'rating', 'durationMinHours', 'durationMaxHours', 'progress',
    'progressCurrent', 'progressTotal', 'progressUnit', 'genres', 'tags', 'moodTags', 'weights', 'notes',
    'source', 'rawText', 'importNotes', 'externalRefs', 'posterUrl', 'publicItemId', 'publicSnapshot',
    'createdAt', 'updatedAt', 'lastRecommendedAt', 'recommendationCooldownUntil',
  ],
  userSettings: [
    'surprisePercent', 'favoriteTags', 'favoriteGenres', 'blockedTags', 'allowPausedByDefault', 'theme',
    'recommendationPreferences', 'explorerDefaultType', 'libraryViewMode', 'libraryCardsPerRow', 'roadmap', 'updatedAt',
  ],
  externalCandidates: [
    'id', 'title', 'type', 'status', 'origin', 'source', 'sourceId', 'overview', 'posterUrl', 'releaseYear',
    'progressTotal', 'progressUnit', 'genres', 'tags', 'moodTags', 'searchAliases', 'externalRefs',
    'publicItemId', 'publicSnapshot', 'savedItemId', 'dismissedAt', 'createdAt', 'updatedAt',
  ],
  activityEntries: ['id', 'label', 'detail', 'tab', 'tone', 'createdAt', 'target'],
  recommendationRuns: ['itemId', 'reasons', 'createdAt'],
  tags: ['id', 'name', 'label', 'color', 'createdAt', 'updatedAt'],
} as const

const PUBLIC_ITEM_FIELDS = [
  'id', 'title', 'type', 'description', 'releaseYear', 'progressTotal', 'progressUnit', 'genres', 'tags',
  'moodTags', 'searchAliases', 'externalRefs', 'posterUrl', 'searchTokens', 'canonicalKey', 'createdAt',
  'updatedAt', 'createdBy', 'updatedBy', 'archivedAt', 'autoIngestedAt', 'demandCount', 'lastDemandAt',
] as const

const USER_PROFILE_FIELDS = ['uid', 'role', 'email', 'displayName', 'photoURL', 'createdAt', 'updatedAt', 'lastSeenAt'] as const
const EXTERNAL_REF_FIELDS = [
  'tmdbId', 'rawgId', 'openLibraryKey', 'googleBooksId', 'anilistId', 'mangaDexId', 'kitsuId', 'malId',
  'goodreadsBookId', 'isbn', 'letterboxdSlug', 'wikidataId', 'sourceUrl',
] as const
const PUBLIC_SNAPSHOT_FIELDS = [
  'id', 'title', 'type', 'description', 'releaseYear', 'progressTotal', 'progressUnit', 'genres', 'tags',
  'moodTags', 'searchAliases', 'externalRefs', 'posterUrl', 'canonicalKey', 'updatedAt',
] as const
const ITEM_TYPES = new Set(['game', 'book', 'movie', 'series', 'anime', 'manga', 'manhwa', 'comic', 'other'])
const LIST_FIELDS = new Set(['genres', 'tags', 'moodTags', 'searchAliases', 'searchTokens', 'importNotes', 'reasons', 'favoriteTags', 'favoriteGenres', 'blockedTags'])
const ITEM_STATUSES = new Set(['wishlist', 'in_progress', 'paused', 'completed', 'dropped'])
const PROGRESS_UNITS = new Set(['episodes', 'chapters', 'pages', 'hours', 'volumes', 'percent', 'items'])
const EXPLORER_TYPES = new Set([...ITEM_TYPES, 'watch', 'animeManga', 'any'])
const REQUIRED_PRIVATE_FIELDS: Partial<Record<keyof typeof PRIVATE_COLLECTION_FIELDS, readonly string[]>> = {
  items: [
    'id', 'title', 'type', 'status', 'genres', 'tags', 'moodTags', 'weights', 'source', 'createdAt', 'updatedAt',
  ],
  externalCandidates: [
    'id', 'title', 'type', 'status', 'origin', 'source', 'sourceId', 'genres', 'tags', 'moodTags', 'externalRefs',
    'createdAt', 'updatedAt',
  ],
}

interface AuditFinding {
  collection: string
  pathHash: string
  issues: string[]
}

interface AuditReport {
  generatedAt: string
  projectId: string
  readOnly: true
  scanned: Record<string, number>
  violationCount: number
  findings: AuditFinding[]
}

const findings: AuditFinding[] = []
const scanned: Record<string, number> = {}

export async function runFirestoreDataAudit(cliArgs = process.argv.slice(2)) {
  findings.length = 0
  for (const key of Object.keys(scanned)) delete scanned[key]

  const args = readArgs(cliArgs)
  const projectId = String(args.get('project') ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? await readFirebaseProjectId() ?? '')
  if (!projectId) throw new Error('No Firebase project configured. Use --project <project-id> or configure ADC environment variables.')

  const outputPath = resolve(String(args.get('out') ?? '.firestore-audit/report.json'))
  initializeApp({ credential: applicationDefault(), projectId })
  const db = getFirestore()

  await auditSnapshot('users', await db.collection('users').get(), USER_PROFILE_FIELDS, validateUserProfile)
  await auditSnapshot('publicItems', await db.collection('publicItems').get(), PUBLIC_ITEM_FIELDS, validatePublicItem)

  for (const [collectionName, fields] of Object.entries(PRIVATE_COLLECTION_FIELDS)) {
    const snapshot = await db.collectionGroup(collectionName).get()
    const userDocuments = snapshot.docs.filter((document) => {
      const parts = document.ref.path.split('/')
      return parts.length === 4 && parts[0] === 'users' && parts[2] === collectionName
    })
    await auditDocuments(collectionName, userDocuments, fields, (data) => validatePrivateDocument(collectionName, data))
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    projectId,
    readOnly: true,
    scanned,
    violationCount: findings.length,
    findings,
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`Firestore audit scanned ${Object.values(scanned).reduce((sum, count) => sum + count, 0)} documents.`)
  console.log(`Found ${findings.length} incompatible documents. Report: ${outputPath}`)
  if (findings.length && !args.has('allow-violations')) process.exitCode = 2
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runFirestoreDataAudit()
}

async function auditSnapshot(
  collectionName: string,
  snapshot: { docs: QueryDocumentSnapshot[] },
  allowedFields: readonly string[],
  validate: (data: DocumentData, documentId: string) => string[],
) {
  await auditDocuments(collectionName, snapshot.docs, allowedFields, validate)
}

async function auditDocuments(
  collectionName: string,
  documents: QueryDocumentSnapshot[],
  allowedFields: readonly string[],
  validate: (data: DocumentData, documentId: string) => string[],
) {
  scanned[collectionName] = documents.length
  const allowed = new Set(allowedFields)
  for (const document of documents) {
    const data = document.data()
    const issues = [
      ...Object.keys(data).filter((key) => !allowed.has(key)).map((key) => `unknown_field:${key}`),
      ...(document.id.length > 120 ? ['document_id_too_long'] : []),
      ...('id' in data && (typeof data.id !== 'string' || data.id !== document.id) ? ['invalid_document_id_field'] : []),
      ...(collectionName === 'userSettings' && document.id !== 'preferences' ? ['invalid_settings_document_id'] : []),
      ...validate(data, document.id),
    ]
    if (issues.length) {
      findings.push({
        collection: collectionName,
        pathHash: createHash('sha256').update(document.ref.path).digest('hex').slice(0, 20),
        issues: [...new Set(issues)].sort(),
      })
    }
  }
}

export function validatePrivateDocument(collectionName: string, data: DocumentData) {
  const issues = validateCommon(data)
  validateRequiredFields(data, REQUIRED_PRIVATE_FIELDS[collectionName as keyof typeof PRIVATE_COLLECTION_FIELDS] ?? [], issues)
  if (collectionName === 'items' || collectionName === 'externalCandidates') {
    validateText(data, 'title', 200, issues)
    validateText(data, 'posterUrl', 2_000, issues)
    validateExternalRefs(data.externalRefs, issues)
    validatePublicSnapshot(data.publicSnapshot, issues)
  }
  if (collectionName === 'items') {
    validateEnum(data, 'type', ITEM_TYPES, issues)
    validateEnum(data, 'status', ITEM_STATUSES, issues)
    validateEnum(data, 'progressUnit', PROGRESS_UNITS, issues)
    validateEnum(data, 'source', new Set(['manual', 'markdown', 'external', 'public']), issues)
    for (const field of ['rating', 'durationMinHours', 'durationMaxHours', 'progressCurrent', 'progressTotal']) {
      validateNumber(data, field, issues)
    }
    validateText(data, 'notes', 20_000, issues)
    validateText(data, 'rawText', 20_000, issues)
    validateText(data, 'progress', 1_000, issues)
    validateText(data, 'posterUrl', 2_000, issues)
    validateText(data, 'publicItemId', 120, issues)
    for (const field of ['createdAt', 'updatedAt', 'lastRecommendedAt', 'recommendationCooldownUntil']) {
      validateText(data, field, 64, issues)
    }
    validateMapKeys(data.weights, ['priority', 'surprise', 'challenge'], 'weights', issues)
    validateMapNumbers(data.weights, ['priority', 'surprise', 'challenge'], 'weights', issues)
  }
  if (collectionName === 'externalCandidates') {
    validateEnum(data, 'type', ITEM_TYPES, issues)
    validateEnum(data, 'status', new Set(['queued', 'saved', 'dismissed']), issues)
    validateEnum(data, 'origin', new Set(['publicCatalog', 'externalSearch', 'prompt', 'roll']), issues)
    validateEnum(data, 'source', new Set(['nexo', 'prompt', 'tmdb', 'rawg', 'openLibrary', 'googleBooks', 'anilist', 'mangaDex', 'kitsu', 'jikan', 'wikidata']), issues)
    validateEnum(data, 'progressUnit', PROGRESS_UNITS, issues)
    validateNumber(data, 'releaseYear', issues)
    validateNumber(data, 'progressTotal', issues)
    for (const field of ['sourceId', 'publicItemId', 'savedItemId']) validateText(data, field, 120, issues)
    validateText(data, 'overview', 20_000, issues)
    for (const field of ['dismissedAt', 'createdAt', 'updatedAt']) validateText(data, field, 64, issues)
  }
  if (collectionName === 'userSettings') {
    validateEnum(data, 'theme', new Set(['dark', 'light', 'rose', 'forest', 'ocean', 'mint', 'aurora']), issues)
    validateEnum(data, 'explorerDefaultType', EXPLORER_TYPES, issues)
    validateEnum(data, 'libraryViewMode', new Set(['mosaic', 'cards', 'list']), issues)
    validateEnum(data, 'libraryCardsPerRow', new Set([4, 5, 6]), issues)
    validateNumber(data, 'surprisePercent', issues)
    validateBoolean(data, 'allowPausedByDefault', issues)
    validateText(data, 'updatedAt', 64, issues)
    validateRoadmap(data.roadmap, issues)
    validateMapKeys(
      data.recommendationPreferences,
      ['medium', 'timeBudgetHours', 'energy', 'intensity', 'novelty', 'includePaused', 'surprisePercent', 'seed'],
      'recommendationPreferences',
      issues,
    )
    validateRecommendationPreferences(data.recommendationPreferences, issues)
  }
  if (collectionName === 'activityEntries') {
    validateText(data, 'label', 200, issues)
    validateText(data, 'detail', 2_000, issues)
    validateEnum(data, 'tab', new Set(['home', 'discover', 'catalog', 'library', 'dice', 'explorer', 'import', 'settings', 'curation']), issues)
    validateEnum(data, 'tone', new Set(['info', 'success', 'danger', 'loading']), issues)
    validateText(data, 'createdAt', 64, issues)
    validateMapKeys(data.target, ['kind', 'id'], 'target', issues)
    if (isRecord(data.target)) {
      if (data.target.kind !== 'item') issues.push('invalid_enum:target.kind')
      validateText(data.target, 'id', 120, issues, 'target.id')
    }
  }
  if (collectionName === 'recommendationRuns') {
    validateText(data, 'itemId', 120, issues)
    validateText(data, 'createdAt', 64, issues)
  }
  if (collectionName === 'tags') {
    validateText(data, 'name', 120, issues)
    validateText(data, 'label', 120, issues)
    validateText(data, 'color', 64, issues)
    validateText(data, 'createdAt', 64, issues)
    validateText(data, 'updatedAt', 64, issues)
  }
  return issues
}

export function validatePublicItem(data: DocumentData) {
  const issues = validateCommon(data)
  validateText(data, 'title', 200, issues)
  validateText(data, 'description', 20_000, issues)
  validateText(data, 'posterUrl', 2_000, issues)
  validateText(data, 'canonicalKey', 240, issues)
  for (const field of ['createdAt', 'updatedAt', 'archivedAt', 'autoIngestedAt', 'lastDemandAt']) validateText(data, field, 64, issues)
  for (const field of ['createdBy', 'updatedBy']) validateText(data, field, 120, issues)
  validateExternalRefs(data.externalRefs, issues)
  validateEnum(data, 'type', ITEM_TYPES, issues)
  validateEnum(data, 'progressUnit', PROGRESS_UNITS, issues)
  validateNumber(data, 'releaseYear', issues)
  validateNumber(data, 'progressTotal', issues)
  validateNumber(data, 'demandCount', issues)
  if (Array.isArray(data.searchTokens) && data.searchTokens.length > 30) issues.push('list_too_long:searchTokens')
  return issues
}

export function validateUserProfile(data: DocumentData, documentId?: string) {
  const issues = validateCommon(data)
  validateRequiredFields(data, ['uid', 'role', 'createdAt', 'updatedAt'], issues)
  if (documentId && data.uid !== documentId) issues.push('invalid_uid')
  validateText(data, 'email', 320, issues)
  validateText(data, 'displayName', 200, issues)
  validateText(data, 'photoURL', 2_000, issues)
  validateEnum(data, 'role', new Set(['user', 'moderator', 'admin']), issues)
  validateText(data, 'createdAt', 64, issues)
  validateText(data, 'updatedAt', 64, issues)
  validateText(data, 'lastSeenAt', 64, issues)
  return issues
}

export function validateCommon(data: DocumentData) {
  const issues: string[] = []
  for (const field of LIST_FIELDS) {
    if (!(field in data)) continue
    if (!Array.isArray(data[field])) issues.push(`invalid_list:${field}`)
    else if (data[field].length > 64) issues.push(`list_too_long:${field}`)
  }
  return issues
}

function validateText(data: DocumentData, field: string, maximum: number, issues: string[], path = field) {
  if (!(field in data)) return
  if (typeof data[field] !== 'string') issues.push(`invalid_string:${path}`)
  else if (data[field].length > maximum) issues.push(`string_too_long:${path}`)
}

function validateNumber(data: DocumentData, field: string, issues: string[], path = field) {
  if (field in data && typeof data[field] !== 'number') issues.push(`invalid_number:${path}`)
}

function validateBoolean(data: DocumentData, field: string, issues: string[], path = field) {
  if (field in data && typeof data[field] !== 'boolean') issues.push(`invalid_boolean:${path}`)
}

function validateEnum(data: DocumentData, field: string, allowed: ReadonlySet<unknown>, issues: string[], path = field) {
  if (field in data && !allowed.has(data[field])) issues.push(`invalid_enum:${path}`)
}

function validateMapNumbers(value: unknown, fields: readonly string[], path: string, issues: string[]) {
  if (!isRecord(value)) return
  for (const field of fields) validateNumber(value, field, issues, `${path}.${field}`)
}

function validateRecommendationPreferences(value: unknown, issues: string[]) {
  if (!isRecord(value)) return
  validateEnum(value, 'medium', EXPLORER_TYPES, issues, 'recommendationPreferences.medium')
  validateEnum(value, 'energy', new Set(['low', 'medium', 'high']), issues, 'recommendationPreferences.energy')
  validateEnum(value, 'intensity', new Set(['soft', 'balanced', 'intense']), issues, 'recommendationPreferences.intensity')
  validateEnum(value, 'novelty', new Set(['comfort', 'balanced', 'surprise']), issues, 'recommendationPreferences.novelty')
  validateNumber(value, 'timeBudgetHours', issues, 'recommendationPreferences.timeBudgetHours')
  validateNumber(value, 'surprisePercent', issues, 'recommendationPreferences.surprisePercent')
  validateBoolean(value, 'includePaused', issues, 'recommendationPreferences.includePaused')
  validateText(value, 'seed', 200, issues, 'recommendationPreferences.seed')
}

function validateExternalRefs(value: unknown, issues: string[]) {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push('invalid_map:externalRefs')
    return
  }
  const allowed = new Set(EXTERNAL_REF_FIELDS)
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key as (typeof EXTERNAL_REF_FIELDS)[number])) issues.push(`unknown_external_ref:${key}`)
    if (typeof entry !== 'string') issues.push(`invalid_external_ref:${key}`)
    else if (entry.length > (key === 'sourceUrl' ? 2_000 : 120)) issues.push(`external_ref_too_long:${key}`)
  }
}

function validatePublicSnapshot(value: unknown, issues: string[]) {
  if (value === undefined) return
  validateMapKeys(value, PUBLIC_SNAPSHOT_FIELDS, 'publicSnapshot', issues)
  if (!isRecord(value)) return
  issues.push(...validateCommon(value).map((issue) => issue.replace(':', ':publicSnapshot.')))
  validateText(value, 'id', 120, issues, 'publicSnapshot.id')
  validateText(value, 'title', 200, issues, 'publicSnapshot.title')
  validateText(value, 'description', 20_000, issues, 'publicSnapshot.description')
  validateText(value, 'posterUrl', 2_000, issues, 'publicSnapshot.posterUrl')
  validateText(value, 'canonicalKey', 240, issues, 'publicSnapshot.canonicalKey')
  validateText(value, 'updatedAt', 64, issues, 'publicSnapshot.updatedAt')
  validateEnum(value, 'type', ITEM_TYPES, issues, 'publicSnapshot.type')
  validateEnum(value, 'progressUnit', PROGRESS_UNITS, issues, 'publicSnapshot.progressUnit')
  validateNumber(value, 'releaseYear', issues, 'publicSnapshot.releaseYear')
  validateNumber(value, 'progressTotal', issues, 'publicSnapshot.progressTotal')
  validateExternalRefs(value.externalRefs, issues)
}

function validateRoadmap(value: unknown, issues: string[]) {
  if (value === undefined) return
  validateMapKeys(value, ['now', 'next', 'later', 'hidden'], 'roadmap', issues)
  if (!isRecord(value)) return
  let total = 0
  for (const lane of ['now', 'next', 'later', 'hidden']) {
    const ids = value[lane]
    if (ids === undefined) continue
    if (!Array.isArray(ids)) {
      issues.push(`invalid_list:roadmap.${lane}`)
      continue
    }
    total += ids.length
    if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      issues.push(`invalid_roadmap_id:roadmap.${lane}`)
    }
    if (ids.some((id) => typeof id === 'string' && id.length > 120)) {
      issues.push(`roadmap_id_too_long:roadmap.${lane}`)
    }
  }
  if (total > 5_000) issues.push('roadmap_too_large')
}

function validateRequiredFields(data: DocumentData, fields: readonly string[], issues: string[]) {
  for (const field of fields) if (!(field in data)) issues.push(`missing_field:${field}`)
}

function validateMapKeys(value: unknown, fields: readonly string[], path: string, issues: string[]) {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push(`invalid_map:${path}`)
    return
  }
  const allowed = new Set(fields)
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`unknown_field:${path}.${key}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
