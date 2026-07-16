import { randomUUID } from 'node:crypto'
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { CALLABLE_OPTIONS } from './functionConfig.js'

type ItemType = 'anime' | 'manga' | 'manhwa'
type ItemStatus = 'wishlist' | 'in_progress' | 'paused' | 'completed' | 'dropped'
type ProgressUnit = 'episodes' | 'chapters'

interface AniListIntegration {
  enabled?: boolean
  username?: string
  state?: 'disabled' | 'idle' | 'syncing' | 'error'
  updatedAt?: string
  lastAttemptAt?: string
  lastSuccessAt?: string
  nextAutomaticSyncAt?: string
  retryAfter?: string
  leaseToken?: string
  leaseExpiresAt?: string
  lastResult?: {
    added: number
    updated: number
    unchanged: number
    totalRemote: number
  }
  lastError?: {
    code: string
    message: string
    at: string
  }
}

export interface AniListSyncEntry {
  id: string
  type?: ItemType
  countryOfOrigin?: string
  title: {
    userPreferred?: string
    english?: string
    romaji?: string
    native?: string
  }
  status?: string
  score?: number
  progress?: number
  notes?: string
  media: {
    id: number
    idMal?: number
    type?: string
    format?: string
    countryOfOrigin?: string
    siteUrl?: string
    episodes?: number
    chapters?: number
    title: {
      userPreferred?: string
      english?: string
      romaji?: string
      native?: string
    }
    startDate?: { year?: number }
    coverImage?: { large?: string }
    genres?: string[]
  }
}

interface AniListCollectionResponse {
  data?: {
    MediaListCollection?: {
      lists?: Array<{ entries?: AniListSyncEntry[] }>
    }
  }
  errors?: Array<{ message?: string; status?: number }>
}

interface SyncableItem {
  id: string
  title: string
  type: ItemType
  status: ItemStatus
  rating?: number
  progress?: string
  progressCurrent?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
  releaseYear?: number
  genres: string[]
  tags: string[]
  moodTags: string[]
  weights: { priority: number; surprise: number; challenge: number }
  source: 'external'
  importNotes: string[]
  externalRefs: Record<string, string>
  posterUrl?: string
  createdAt: string
  updatedAt: string
}

interface ExistingItem extends DocumentData {
  id: string
  title?: string
  type?: string
  status?: string
  rating?: number
  progress?: string
  progressCurrent?: number
  progressTotal?: number
  progressUnit?: string
  genres?: string[]
  tags?: string[]
  moodTags?: string[]
  weights?: { priority?: number; surprise?: number; challenge?: number }
  notes?: string
  source?: string
  importNotes?: string[]
  externalRefs?: Record<string, string>
  posterUrl?: string
  publicItemId?: string
  publicSnapshot?: { releaseYear?: number }
  createdAt?: string
  updatedAt?: string
  lastRecommendedAt?: string
  recommendationCooldownUntil?: string
}

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co'
const AUTOMATIC_INTERVAL_MS = 24 * 60 * 60 * 1000
const RETRY_INTERVAL_MS = 15 * 60 * 1000
const MANUAL_INTERVAL_MS = 60 * 1000
const LEASE_INTERVAL_MS = 10 * 60 * 1000
const MAX_ITEMS = 5000
const BATCH_SIZE = 400

const ANILIST_QUERY = `
  query NexoSyncAniList($userName: String, $type: MediaType) {
    MediaListCollection(userName: $userName, type: $type) {
      lists {
        entries {
          status
          score(format: POINT_10_DECIMAL)
          progress
          media {
            id
            idMal
            type
            format
            countryOfOrigin
            siteUrl
            episodes
            chapters
            title { userPreferred english romaji native }
            startDate { year }
            coverImage { large }
            genres
          }
        }
      }
    }
  }
`

export const configureAniListSync = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = await requireAdmin(request.auth?.uid)
  const input = request.data as { username?: unknown; enabled?: unknown } | undefined
  const username = parseAniListUsername(input?.username)
  const enabled = input?.enabled === true
  if (enabled && !username) throw new HttpsError('invalid-argument', 'Escribe un usuario o URL publica de AniList.')

  const db = getFirestore()
  const ref = integrationRef(uid)
  const now = new Date().toISOString()
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? snapshot.data() as AniListIntegration : {}
    const usernameChanged = Boolean(username && current.username && username !== current.username)
    const patch: Record<string, unknown> = {
      username: username ?? current.username ?? '',
      enabled,
      state: enabled ? 'idle' : 'disabled',
      updatedAt: now,
      ...(usernameChanged || !enabled
        ? {
            lastAttemptAt: FieldValue.delete(),
            lastSuccessAt: FieldValue.delete(),
            nextAutomaticSyncAt: FieldValue.delete(),
            retryAfter: FieldValue.delete(),
            lastResult: FieldValue.delete(),
            lastError: FieldValue.delete(),
          }
        : {}),
    }
    transaction.set(ref, patch, { merge: true })
    const result = { ...current, username: username ?? current.username ?? '', enabled, state: enabled ? 'idle' : 'disabled', updatedAt: now } as AniListIntegration
    if (usernameChanged || !enabled) {
      delete result.lastAttemptAt
      delete result.lastSuccessAt
      delete result.nextAutomaticSyncAt
      delete result.retryAfter
      delete result.lastResult
      delete result.lastError
    }
    return result
  })

  return { integration: publicIntegration(result) }
})

export const syncAniList = onCall(
  {
    ...CALLABLE_OPTIONS,
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (request) => {
    const uid = await requireAdmin(request.auth?.uid)
    const mode = request.data?.mode === 'manual' ? 'manual' : 'automatic'
    const db = getFirestore()
    const ref = integrationRef(uid)
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const leaseToken = randomUUID()
    const acquisition = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists) return { kind: 'disabled' as const }
      const current = snapshot.data() as AniListIntegration
      if (current.enabled !== true || !current.username) return { kind: 'disabled' as const }
      if (current.state === 'syncing' && isFuture(current.leaseExpiresAt, nowMs)) return { kind: 'busy' as const }
      if (mode === 'automatic' && (isFuture(current.nextAutomaticSyncAt, nowMs) || isFuture(current.retryAfter, nowMs))) {
        return { kind: 'cooldown' as const, integration: current }
      }
      if (mode === 'manual' && isRecent(current.lastAttemptAt, nowMs, MANUAL_INTERVAL_MS)) {
        return { kind: 'cooldown' as const, integration: current }
      }

      transaction.set(ref, {
        state: 'syncing',
        lastAttemptAt: now,
        leaseToken,
        leaseExpiresAt: new Date(nowMs + LEASE_INTERVAL_MS).toISOString(),
        updatedAt: now,
        lastError: FieldValue.delete(),
      }, { merge: true })
      return { kind: 'started' as const, username: current.username }
    })

    if (acquisition.kind !== 'started') {
      return {
        status: acquisition.kind,
        integration: 'integration' in acquisition && acquisition.integration ? publicIntegration(acquisition.integration) : undefined,
      }
    }

    const startedAt = Date.now()
    try {
      const [animeEntries, mangaEntries] = await Promise.all([
        fetchAniListCollection(acquisition.username, 'ANIME'),
        fetchAniListCollection(acquisition.username, 'MANGA'),
      ])
      const remoteEntries = dedupeEntries([...animeEntries, ...mangaEntries])
      if (remoteEntries.length > MAX_ITEMS) {
        throw new SyncError('limit', `AniList devolvio ${remoteEntries.length} entradas; el limite de Nexo es ${MAX_ITEMS}.`)
      }

      const itemSnapshot = await db.collection('users').doc(uid).collection('items').get()
      const existingItems = itemSnapshot.docs.map((item) => item.data() as ExistingItem)
      const plan = createSyncPlan(remoteEntries, existingItems)
      if (existingItems.length + plan.added.length > MAX_ITEMS) {
        throw new SyncError('limit', `La sincronizacion superaria el limite de ${MAX_ITEMS} entradas privadas.`)
      }

      const itemCollection = db.collection('users').doc(uid).collection('items')
      for (const chunk of chunkArray(plan.writes, BATCH_SIZE)) {
        const batch = db.batch()
        for (const write of chunk) {
          if (write.merge) batch.set(itemCollection.doc(write.id), write.data, { merge: true })
          else batch.set(itemCollection.doc(write.id), write.data)
        }
        await batch.commit()
      }

      const completedAt = new Date().toISOString()
      const result = {
        added: plan.added.length,
        updated: plan.updated.length,
        unchanged: plan.unchanged,
        totalRemote: remoteEntries.length,
      }
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref)
        const current = snapshot.exists ? snapshot.data() as AniListIntegration : {}
        if (current.leaseToken !== leaseToken) return
        transaction.set(ref, {
          state: 'idle',
          lastSuccessAt: completedAt,
          nextAutomaticSyncAt: new Date(Date.parse(completedAt) + AUTOMATIC_INTERVAL_MS).toISOString(),
          retryAfter: FieldValue.delete(),
          leaseToken: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
          lastResult: result,
          updatedAt: completedAt,
        }, { merge: true })
      })
      if (plan.added.length || plan.updated.length) {
        const activityId = `anilist-${Date.now()}-${randomUUID().slice(0, 8)}`
        await db.collection('users').doc(uid).collection('activityEntries').doc(activityId).set({
          id: activityId,
          label: 'AniList sincronizado',
          detail: `${plan.added.length} nuevas; ${plan.updated.length} actualizadas.`,
          tab: 'settings',
          tone: 'success',
          createdAt: completedAt,
        })
      }
      logger.info('anilist_sync_completed', { uid, added: result.added, updated: result.updated, unchanged: result.unchanged, durationMs: Date.now() - startedAt })
      return { status: 'synced', ...result, lastSuccessAt: completedAt }
    } catch (reason) {
      const error = reason instanceof SyncError ? reason : new SyncError('remote', readErrorMessage(reason))
      const failedAt = new Date().toISOString()
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref)
        const current = snapshot.exists ? snapshot.data() as AniListIntegration : {}
        if (current.leaseToken !== leaseToken) return
        transaction.set(ref, {
          state: 'error',
          retryAfter: new Date(Date.now() + RETRY_INTERVAL_MS).toISOString(),
          leaseToken: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
          lastError: { code: error.code, message: error.message, at: failedAt },
          updatedAt: failedAt,
        }, { merge: true })
      })
      logger.warn('anilist_sync_failed', { uid, code: error.code, durationMs: Date.now() - startedAt })
      throw new HttpsError(error.code === 'limit' ? 'failed-precondition' : 'unavailable', error.message)
    }
  },
)

export interface AniListSyncPlan {
  added: SyncableItem[]
  updated: string[]
  unchanged: number
  writes: Array<{ id: string; data: Record<string, unknown>; merge: boolean }>
}

export function createSyncPlan(entries: AniListSyncEntry[], existingItems: ExistingItem[], now = new Date().toISOString()): AniListSyncPlan {
  entries = dedupeEntries(entries)
  const byItemId = new Map<string, ExistingItem>()
  const byAniListId = new Map<string, ExistingItem>()
  const byLegacyId = new Map<string, ExistingItem>()
  const byTitle = new Map<string, ExistingItem[]>()
  for (const item of existingItems) {
    if (item.id) byItemId.set(item.id, item)
    const anilistId = item.externalRefs?.anilistId
    if (anilistId) byAniListId.set(String(anilistId), item)
    const legacyMatch = item.id?.match(/-anilist-(\d+)$/)
    if (legacyMatch) byLegacyId.set(legacyMatch[1], item)
    const titleKey = itemTitleKey(item.title, item.type, item.publicSnapshot?.releaseYear)
    if (titleKey) byTitle.set(titleKey, [...(byTitle.get(titleKey) ?? []), item])
  }

  const added: SyncableItem[] = []
  const updated: string[] = []
  const writes: AniListSyncPlan['writes'] = []
  let unchanged = 0
  for (const entry of entries) {
    const incoming = entryToItem(entry, now)
    const mediaId = String(entry.media.id)
    const existing = byAniListId.get(mediaId) ?? byLegacyId.get(mediaId) ?? byItemId.get(incoming.id) ?? uniqueTitleMatch(byTitle, incoming)
    if (!existing) {
      added.push(incoming)
      writes.push({ id: incoming.id, data: persistedItem(incoming), merge: false })
      continue
    }

    const patch = syncPatch(existing, incoming)
    if (Object.keys(patch).length === 0) {
      unchanged += 1
    } else {
      updated.push(existing.id)
      writes.push({ id: existing.id, data: patch, merge: true })
    }
  }
  return { added, updated, unchanged, writes }
}

async function requireAdmin(uid: string | undefined) {
  if (!uid) throw new HttpsError('permission-denied', 'Usuario no autorizado.')
  const snapshot = await getFirestore().collection('users').doc(uid).get()
  if (snapshot.data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Solo administradores pueden sincronizar AniList.')
  return uid
}

async function fetchAniListCollection(username: string, type: 'ANIME' | 'MANGA') {
  const response = await fetch(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { userName: username, type } }),
  })
  let body: AniListCollectionResponse
  try {
    body = await response.json() as AniListCollectionResponse
  } catch {
    throw new SyncError('remote', `AniList devolvio una respuesta invalida (${response.status}).`)
  }
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.[0]?.message ?? `AniList no respondio correctamente (${response.status}).`
    throw new SyncError(response.status === 429 ? 'rate-limit' : 'remote', message)
  }
  return body.data?.MediaListCollection?.lists?.flatMap((list) => list.entries ?? []) ?? []
}

function entryToItem(entry: AniListSyncEntry, now: string): SyncableItem {
  const title = firstString(entry.media.title.userPreferred, entry.media.title.english, entry.media.title.romaji, entry.media.title.native) ?? 'Sin titulo'
  const type = entry.media.type === 'ANIME' ? 'anime' : entry.media.countryOfOrigin === 'KR' ? 'manhwa' : 'manga'
  const progressCurrent = finiteNonNegative(entry.progress)
  const progressTotal = type === 'anime' ? finitePositive(entry.media.episodes) : finitePositive(entry.media.chapters)
  const progressUnit = type === 'anime' ? 'episodes' : 'chapters'
  const rating = finitePositive(entry.score) === undefined ? undefined : Math.max(0, Math.min(10, Math.round((entry.score ?? 0) * 10) / 10))
  const importNotes = ['Sincronizado desde AniList']
  if (entry.media.idMal) importNotes.push(`MAL: ${entry.media.idMal}`)
  return stripUndefined({
    id: `anilist-${entry.media.id}`,
    title,
    type,
    status: anilistStatusToItemStatus(entry.status),
    rating,
    progress: formatProgress(progressCurrent, progressTotal, progressUnit),
    progressCurrent,
    progressTotal,
    progressUnit: progressCurrent === undefined && progressTotal === undefined ? undefined : progressUnit,
    releaseYear: finitePositive(entry.media.startDate?.year),
    genres: uniqueStrings(entry.media.genres ?? []),
    tags: uniqueStrings(['AniList', entry.media.format, type]),
    moodTags: [],
    weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
    source: 'external',
    importNotes,
    externalRefs: {
      anilistId: String(entry.media.id),
      malId: entry.media.idMal ? String(entry.media.idMal) : undefined,
      sourceUrl: entry.media.siteUrl,
    },
    posterUrl: entry.media.coverImage?.large,
    createdAt: now,
    updatedAt: now,
  }) as SyncableItem
}

function syncPatch(existing: ExistingItem, incoming: SyncableItem) {
  const patch: Record<string, unknown> = {}
  if (existing.status !== incoming.status) patch.status = incoming.status
  if (existing.rating !== incoming.rating) patch.rating = incoming.rating === undefined ? FieldValue.delete() : incoming.rating
  for (const key of ['progress', 'progressCurrent', 'progressTotal', 'progressUnit'] as const) {
    if (existing[key] !== incoming[key]) patch[key] = incoming[key] === undefined ? FieldValue.delete() : incoming[key]
  }
  const refs = { ...(existing.externalRefs ?? {}), ...incoming.externalRefs }
  if (JSON.stringify(existing.externalRefs ?? {}) !== JSON.stringify(refs)) patch.externalRefs = refs
  if (Object.keys(patch).length) patch.updatedAt = new Date().toISOString()
  return patch
}

function uniqueTitleMatch(index: Map<string, ExistingItem[]>, incoming: SyncableItem) {
  const candidates = index.get(itemTitleKey(incoming.title, incoming.type, incoming.releaseYear) ?? '') ?? []
  return candidates.length === 1 ? candidates[0] : undefined
}

function persistedItem(item: SyncableItem) {
  return Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'releaseYear')) as Record<string, unknown>
}

function itemTitleKey(title: string | undefined, type: string | undefined, year: number | undefined) {
  if (!title || !type) return undefined
  return `${normalizeKey(title)}:${type}:${year ?? 'unknown'}`
}

function dedupeEntries(entries: AniListSyncEntry[]) {
  const byMediaId = new Map<string, AniListSyncEntry>()
  for (const entry of entries) {
    if (entry.media?.id !== undefined) byMediaId.set(String(entry.media.id), entry)
  }
  return [...byMediaId.values()]
}

function parseAniListUsername(value: unknown) {
  if (typeof value !== 'string') return ''
  const input = value.trim()
  if (!input) return ''
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`)
    const parts = url.pathname.split('/').filter(Boolean)
    const userIndex = parts.findIndex((part) => normalizeKey(part) === 'user')
    const candidate = parts[userIndex >= 0 ? userIndex + 1 : 0]
    return decodeURIComponent(candidate ?? '').trim().replace(/^@/, '').slice(0, 120)
  } catch {
    return input.replace(/^@/, '').split('/')[0].trim().slice(0, 120)
  }
}

function integrationRef(uid: string) {
  return getFirestore().collection('users').doc(uid).collection('integrations').doc('anilist')
}

function publicIntegration(value: AniListIntegration) {
  const publicValue = { ...value }
  delete publicValue.leaseToken
  delete publicValue.leaseExpiresAt
  return publicValue
}

function isFuture(value: string | undefined, nowMs: number) {
  return Boolean(value && Date.parse(value) > nowMs)
}

function isRecent(value: string | undefined, nowMs: number, intervalMs: number) {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) && nowMs - timestamp < intervalMs
}

function anilistStatusToItemStatus(status: string | undefined): ItemStatus {
  if (status === 'CURRENT' || status === 'REPEATING') return 'in_progress'
  if (status === 'COMPLETED') return 'completed'
  if (status === 'PAUSED') return 'paused'
  if (status === 'DROPPED') return 'dropped'
  return 'wishlist'
}

function formatProgress(current: number | undefined, total: number | undefined, unit: ProgressUnit) {
  if (current === undefined && total === undefined) return undefined
  if (current !== undefined && total !== undefined) return `${current}/${total} ${unit === 'episodes' ? 'episodios' : 'capitulos'}`
  if (current !== undefined) return `${current} ${unit === 'episodes' ? 'episodios' : 'capitulos'}`
  return `0/${total} ${unit === 'episodes' ? 'episodios' : 'capitulos'}`
}

function finiteNonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function finitePositive(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))]
}

function chunkArray<Value>(values: Value[], size: number) {
  const chunks: Value[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function readErrorMessage(reason: unknown) {
  return reason instanceof Error && reason.message ? reason.message : 'No se pudo sincronizar AniList.'
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => stripUndefined(entry)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => entry === undefined ? [] : [[key, stripUndefined(entry)]])) as T
  }
  return value
}

class SyncError extends Error {
  constructor(public readonly code: 'limit' | 'rate-limit' | 'remote', message: string) {
    super(message)
  }
}
