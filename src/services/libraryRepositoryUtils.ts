import type { RoadmapPreferences } from '../domain/types'
import { normalizeRoadmapPreferences } from '../lib/roadmap'

export function getSnapshotDocumentId(documentSnapshot: { id?: unknown; ref?: { path?: unknown } }) {
  if (typeof documentSnapshot.id === 'string' && documentSnapshot.id) return documentSnapshot.id
  const path = documentSnapshot.ref?.path
  if (typeof path !== 'string') throw new Error('No se pudo identificar una entrada durante el borrado masivo.')
  return path.split('/').filter(Boolean).at(-1) ?? path
}

export function removeRoadmapIds(roadmap: RoadmapPreferences, itemIds: readonly string[]): RoadmapPreferences {
  const deletedIds = new Set(itemIds)
  const normalized = normalizeRoadmapPreferences(roadmap)
  return {
    hidden: normalized.hidden.filter((id) => !deletedIds.has(id)),
    later: normalized.later.filter((id) => !deletedIds.has(id)),
    next: normalized.next.filter((id) => !deletedIds.has(id)),
    now: normalized.now.filter((id) => !deletedIds.has(id)),
  }
}

export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => withoutUndefined(entry)) as T
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return value
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => entry === undefined ? [] : [[key, withoutUndefined(entry)]]),
    ) as T
  }
  return value
}
