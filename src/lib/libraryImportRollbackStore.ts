import { nowIso } from '../domain/types'
import {
  parseLibraryImportRollbackPlan,
  type LibraryImportRollbackPlan,
} from './libraryBackup'

export type LibraryImportRollbackScope = 'backup' | 'service'

const rollbackSchemaVersion = 1
const activeOwnerStorageKey = 'nexo:library-import-rollback:active-owner:v1'
const rollbackStorageKeyPrefix = 'nexo:library-import-rollback:v1'
const rollbackScopes: LibraryImportRollbackScope[] = ['backup', 'service']
export const LIBRARY_IMPORT_ROLLBACK_MAX_BYTES = 4 * 1024 * 1024

interface StoredLibraryImportRollback {
  schemaVersion: typeof rollbackSchemaVersion
  ownerKey: string
  scope: LibraryImportRollbackScope
  createdAt: string
  plan: LibraryImportRollbackPlan
}

export function activateLibraryImportRollbackOwner(ownerKey?: string, storage = getSessionStorage()) {
  if (!storage) return

  const normalizedOwnerKey = normalizeOwnerKey(ownerKey)
  const previousOwnerKey = normalizeOwnerKey(storage.getItem(activeOwnerStorageKey) ?? undefined)
  if (previousOwnerKey && previousOwnerKey !== normalizedOwnerKey) {
    clearOwnerRollbackPlans(previousOwnerKey, storage)
  }

  if (normalizedOwnerKey) {
    storage.setItem(activeOwnerStorageKey, normalizedOwnerKey)
  } else {
    storage.removeItem(activeOwnerStorageKey)
  }
}

export function persistLibraryImportRollback(
  scope: LibraryImportRollbackScope,
  ownerKey: string | undefined,
  plan: LibraryImportRollbackPlan,
  storage = getSessionStorage(),
) {
  const normalizedOwnerKey = normalizeOwnerKey(ownerKey)
  if (!normalizedOwnerKey) return
  if (!storage) throw new Error('El navegador no permite guardar un plan seguro para deshacer la importacion.')

  activateLibraryImportRollbackOwner(normalizedOwnerKey, storage)
  const payload: StoredLibraryImportRollback = {
    schemaVersion: rollbackSchemaVersion,
    ownerKey: normalizedOwnerKey,
    scope,
    createdAt: nowIso(),
    plan: parseLibraryImportRollbackPlan(plan),
  }
  const serialized = JSON.stringify(payload)
  if (utf8ByteLength(serialized) > LIBRARY_IMPORT_ROLLBACK_MAX_BYTES) {
    throw new Error('El plan para deshacer es demasiado grande. Reduce la importacion y vuelve a intentarlo.')
  }

  try {
    storage.setItem(getRollbackStorageKey(scope, normalizedOwnerKey), serialized)
  } catch {
    throw new Error('No hay espacio local suficiente para guardar el plan de deshacer. Reduce la importacion.')
  }
}

export function readLibraryImportRollback(
  scope: LibraryImportRollbackScope,
  ownerKey?: string,
  storage = getSessionStorage(),
): LibraryImportRollbackPlan | undefined {
  const normalizedOwnerKey = normalizeOwnerKey(ownerKey)
  if (!normalizedOwnerKey || !storage) return undefined

  activateLibraryImportRollbackOwner(normalizedOwnerKey, storage)
  const storageKey = getRollbackStorageKey(scope, normalizedOwnerKey)
  const serialized = storage.getItem(storageKey)
  if (!serialized) return undefined

  try {
    if (utf8ByteLength(serialized) > LIBRARY_IMPORT_ROLLBACK_MAX_BYTES) throw new Error('oversized')
    const parsed = JSON.parse(serialized) as Partial<StoredLibraryImportRollback>
    if (
      parsed.schemaVersion !== rollbackSchemaVersion ||
      parsed.ownerKey !== normalizedOwnerKey ||
      parsed.scope !== scope ||
      typeof parsed.createdAt !== 'string'
    ) {
      throw new Error('invalid envelope')
    }
    return parseLibraryImportRollbackPlan(parsed.plan)
  } catch {
    storage.removeItem(storageKey)
    return undefined
  }
}

export function clearLibraryImportRollback(
  scope: LibraryImportRollbackScope,
  ownerKey?: string,
  storage = getSessionStorage(),
) {
  const normalizedOwnerKey = normalizeOwnerKey(ownerKey)
  if (!normalizedOwnerKey || !storage) return
  storage.removeItem(getRollbackStorageKey(scope, normalizedOwnerKey))
}

function clearOwnerRollbackPlans(ownerKey: string, storage: Storage) {
  for (const scope of rollbackScopes) {
    storage.removeItem(getRollbackStorageKey(scope, ownerKey))
  }
}

function getRollbackStorageKey(scope: LibraryImportRollbackScope, ownerKey: string) {
  return `${rollbackStorageKeyPrefix}:${scope}:${encodeURIComponent(ownerKey)}`
}

function normalizeOwnerKey(ownerKey?: string | null) {
  const normalized = ownerKey?.trim()
  return normalized && normalized.length <= 256 ? normalized : undefined
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function getSessionStorage() {
  if (typeof window === 'undefined') return undefined
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}
