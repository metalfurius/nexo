import type { ExternalCandidate } from '../domain/types'
import { normalizeKey } from '../lib/strings'

const databaseName = 'nexo-external-search'
const databaseVersion = 1
const cacheSchemaVersion = 'v2'
const searchStoreName = 'searches'
const cacheTtlMs = 7 * 24 * 60 * 60 * 1000

export interface ExternalSearchCacheEntry {
  createdAt: number
  expiresAt: number
  key: string
  query: string
  results: ExternalCandidate[]
  type: string
  updatedAt: number
}

export interface ExternalSearchCacheHit {
  entry: ExternalSearchCacheEntry
  state: 'fresh' | 'stale'
}

let databasePromise: Promise<IDBDatabase | undefined> | undefined

export function createExternalSearchCacheKey(query: string, type: string) {
  return `${cacheSchemaVersion}:${type || 'any'}:${normalizeKey(query)}`
}

export function createExternalSearchCacheEntry(
  query: string,
  type: string,
  results: ExternalCandidate[],
  now = Date.now(),
): ExternalSearchCacheEntry {
  return {
    createdAt: now,
    expiresAt: now + cacheTtlMs,
    key: createExternalSearchCacheKey(query, type),
    query: query.trim(),
    results,
    type,
    updatedAt: now,
  }
}

export function isExternalSearchCacheFresh(entry: Pick<ExternalSearchCacheEntry, 'expiresAt'>, now = Date.now()) {
  return entry.expiresAt > now
}

export async function readExternalSearchCache(query: string, type: string, now = Date.now()): Promise<ExternalSearchCacheHit | undefined> {
  const database = await openDatabase()
  if (!database) return undefined

  const entry = await requestToPromise<ExternalSearchCacheEntry | undefined>(
    database.transaction(searchStoreName, 'readonly').objectStore(searchStoreName).get(createExternalSearchCacheKey(query, type)),
  )
  if (!entry) return undefined

  return {
    entry,
    state: isExternalSearchCacheFresh(entry, now) ? 'fresh' : 'stale',
  }
}

export async function writeExternalSearchCache(query: string, type: string, results: ExternalCandidate[]) {
  if (!results.length) return

  const database = await openDatabase()
  if (!database) return

  const transaction = database.transaction(searchStoreName, 'readwrite')
  transaction.objectStore(searchStoreName).put(createExternalSearchCacheEntry(query, type, results))
  await transactionToPromise(transaction)
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  databasePromise ??= new Promise<IDBDatabase | undefined>((resolve) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onerror = () => resolve(undefined)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(searchStoreName)) {
        database.createObjectStore(searchStoreName, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
  return databasePromise
}

function requestToPromise<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()
  })
}
