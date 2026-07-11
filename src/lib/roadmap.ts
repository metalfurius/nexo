import {
  DEFAULT_ROADMAP_PREFERENCES,
  type ItemStatus,
  type ListItem,
  type RoadmapLane,
  type RoadmapMutation,
  type RoadmapPreferences,
  type UserSettings,
} from '../domain/types'

export type RoadmapEntryPlacement = 'manual' | 'automatic'
export type RoadmapMoveDirection = 'up' | 'down'

export interface RoadmapEntry {
  item: ListItem
  lane: RoadmapLane
  placement: RoadmapEntryPlacement
}

export interface RoadmapView {
  now: RoadmapEntry[]
  next: RoadmapEntry[]
  later: RoadmapEntry[]
}

export interface RoadmapLibraryState {
  items: ListItem[]
  settings: UserSettings
}

const roadmapPreferenceKeys = ['hidden', 'now', 'next', 'later'] as const
const terminalStatuses = new Set<ItemStatus>(['completed', 'dropped'])

export function cloneRoadmapPreferences(preferences: RoadmapPreferences): RoadmapPreferences {
  return {
    now: [...preferences.now],
    next: [...preferences.next],
    later: [...preferences.later],
    hidden: [...preferences.hidden],
  }
}

export function normalizeRoadmapPreferences(
  value: unknown,
  validItemIds?: Iterable<string>,
): RoadmapPreferences {
  const source = asRecord(value)
  const validIds = validItemIds ? new Set(validItemIds) : undefined
  const seen = new Set<string>()
  const normalized: RoadmapPreferences = cloneRoadmapPreferences(DEFAULT_ROADMAP_PREFERENCES)

  for (const key of roadmapPreferenceKeys) {
    const values = Array.isArray(source?.[key]) ? source[key] : []
    for (const value of values) {
      if (typeof value !== 'string') continue
      const id = value.trim()
      if (!id || seen.has(id) || (validIds && !validIds.has(id))) continue
      normalized[key].push(id)
      seen.add(id)
    }
  }

  return normalized
}

export function cleanupRoadmapPreferences(
  preferences: RoadmapPreferences,
  items: readonly Pick<ListItem, 'id' | 'status'>[],
): RoadmapPreferences {
  return normalizeRoadmapPreferences(
    preferences,
    items.filter((item) => !terminalStatuses.has(item.status)).map((item) => item.id),
  )
}

export function deriveRoadmap(
  items: readonly ListItem[],
  preferences: RoadmapPreferences,
): RoadmapView {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const normalized = normalizeRoadmapPreferences(preferences, itemsById.keys())
  const hiddenIds = new Set(normalized.hidden)
  const manuallyPlacedIds = new Set([...normalized.now, ...normalized.next, ...normalized.later])
  const includedIds = new Set<string>()
  const view: RoadmapView = { now: [], next: [], later: [] }

  const append = (item: ListItem | undefined, lane: RoadmapLane, placement: RoadmapEntryPlacement) => {
    if (!item || includedIds.has(item.id) || hiddenIds.has(item.id) || terminalStatuses.has(item.status)) return
    view[lane].push({ item, lane, placement })
    includedIds.add(item.id)
  }

  for (const id of normalized.now) {
    append(itemsById.get(id), 'now', 'manual')
  }

  // An in-progress item always belongs to Ahora, even if an older client left a
  // manual placement in another lane.
  for (const lane of ['next', 'later'] as const) {
    for (const id of normalized[lane]) {
      const item = itemsById.get(id)
      if (item?.status === 'in_progress') append(item, 'now', 'manual')
    }
  }
  for (const item of items) {
    if (item.status === 'in_progress') append(item, 'now', manuallyPlacedIds.has(item.id) ? 'manual' : 'automatic')
  }

  for (const id of normalized.next) {
    const item = itemsById.get(id)
    if (item?.status !== 'in_progress') append(item, 'next', 'manual')
  }
  for (const id of normalized.later) {
    const item = itemsById.get(id)
    if (item?.status !== 'in_progress') append(item, 'later', 'manual')
  }

  const automaticWishlist = items
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => item.status === 'wishlist' && !includedIds.has(item.id) && !hiddenIds.has(item.id))
    .sort((left, right) => right.item.weights.priority - left.item.weights.priority || left.index - right.index)

  for (const { item } of automaticWishlist.slice(0, 3)) {
    append(item, 'next', 'automatic')
  }
  for (const { item } of automaticWishlist.slice(3)) {
    append(item, 'later', 'automatic')
  }
  for (const item of items) {
    if (item.status === 'paused') append(item, 'later', 'automatic')
  }

  return view
}

export function moveRoadmapItem(
  preferences: RoadmapPreferences,
  itemId: string,
  lane: RoadmapLane,
  index?: number,
): RoadmapPreferences {
  const id = itemId.trim()
  const next = removeRoadmapItem(preferences, id)
  if (!id) return next

  const targetIndex = index === undefined
    ? next[lane].length
    : Math.max(0, Math.min(Math.trunc(index), next[lane].length))
  next[lane].splice(targetIndex, 0, id)
  return next
}

export function reorderRoadmapItem(
  preferences: RoadmapPreferences,
  lane: RoadmapLane,
  itemId: string,
  direction: RoadmapMoveDirection,
): RoadmapPreferences {
  const normalized = normalizeRoadmapPreferences(preferences)
  const currentIndex = normalized[lane].indexOf(itemId.trim())
  if (currentIndex < 0) return normalized

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= normalized[lane].length) return normalized

  const next = cloneRoadmapPreferences(normalized)
  ;[next[lane][currentIndex], next[lane][targetIndex]] = [next[lane][targetIndex], next[lane][currentIndex]]
  return next
}

export function hideRoadmapItem(preferences: RoadmapPreferences, itemId: string): RoadmapPreferences {
  const id = itemId.trim()
  const next = removeRoadmapItem(preferences, id)
  if (id) next.hidden.push(id)
  return next
}

export function resetRoadmapItemToAutomatic(
  preferences: RoadmapPreferences,
  itemId: string,
): RoadmapPreferences {
  return removeRoadmapItem(preferences, itemId.trim())
}

export function transitionRoadmapItem(
  preferences: RoadmapPreferences,
  itemId: string,
  status: ItemStatus,
): RoadmapMutation {
  let roadmap: RoadmapPreferences
  if (status === 'in_progress') {
    roadmap = moveRoadmapItem(preferences, itemId, 'now')
  } else if (status === 'paused') {
    roadmap = moveRoadmapItem(preferences, itemId, 'later')
  } else if (status === 'wishlist') {
    roadmap = moveRoadmapItem(preferences, itemId, 'next')
  } else {
    roadmap = resetRoadmapItemToAutomatic(preferences, itemId)
  }

  return {
    roadmap,
    item: { kind: 'status', itemId, status },
  }
}

export function createRoadmapDeleteMutation(
  preferences: RoadmapPreferences,
  itemId: string,
): RoadmapMutation {
  return {
    roadmap: resetRoadmapItemToAutomatic(preferences, itemId),
    item: { kind: 'delete', itemId },
  }
}

export function createRoadmapUndoMutation(
  preferences: RoadmapPreferences,
  item: Pick<ListItem, 'id' | 'status'>,
): RoadmapMutation {
  return {
    roadmap: cloneRoadmapPreferences(preferences),
    item: { kind: 'status', itemId: item.id, status: item.status },
  }
}

export function createRoadmapRestoreMutation(
  preferences: RoadmapPreferences,
  item: ListItem,
): RoadmapMutation {
  return {
    roadmap: cloneRoadmapPreferences(preferences),
    item: { item: { ...item }, kind: 'restore' },
  }
}

export function applyRoadmapMutationToLibrary(
  items: readonly ListItem[],
  settings: UserSettings,
  mutation: RoadmapMutation,
  updatedAt: string,
): RoadmapLibraryState {
  let nextItems = [...items]
  if (mutation.item?.kind === 'delete') {
    const itemId = mutation.item.itemId
    nextItems = nextItems.filter((item) => item.id !== itemId)
  } else if (mutation.item?.kind === 'status') {
    const { itemId, status } = mutation.item
    nextItems = nextItems.map((item) => (item.id === itemId ? { ...item, status, updatedAt } : item))
  } else if (mutation.item?.kind === 'restore' || mutation.item?.kind === 'upsert') {
    const upsertedItem = { ...mutation.item.item, updatedAt }
    nextItems = [...nextItems.filter((item) => item.id !== upsertedItem.id), upsertedItem]
  }

  return {
    items: nextItems,
    settings: {
      ...settings,
      roadmap: cleanupRoadmapPreferences(mutation.roadmap, nextItems),
    },
  }
}

function removeRoadmapItem(preferences: RoadmapPreferences, itemId: string): RoadmapPreferences {
  const normalized = normalizeRoadmapPreferences(preferences)
  return {
    now: normalized.now.filter((id) => id !== itemId),
    next: normalized.next.filter((id) => id !== itemId),
    later: normalized.later.filter((id) => id !== itemId),
    hidden: normalized.hidden.filter((id) => id !== itemId),
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
