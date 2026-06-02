import type { ItemStatus, ListItem } from '../domain/types'

export type LibrarySortMode = 'focus' | 'updated' | 'title' | 'priority' | 'rating'

const statusRank: Record<ItemStatus, number> = {
  in_progress: 0,
  wishlist: 1,
  paused: 2,
  completed: 3,
  dropped: 4,
}

const titleCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

export function sortLibraryItems(items: ListItem[], mode: LibrarySortMode) {
  return [...items].sort((left, right) => compareLibraryItems(left, right, mode))
}

function compareLibraryItems(left: ListItem, right: ListItem, mode: LibrarySortMode) {
  if (mode === 'title') {
    return compareTitle(left, right) || compareUpdated(left, right)
  }

  if (mode === 'updated') {
    return compareUpdated(left, right) || compareTitle(left, right)
  }

  if (mode === 'priority') {
    return compareNumber(getPriorityScore(right), getPriorityScore(left)) || compareFocus(left, right)
  }

  if (mode === 'rating') {
    return compareRating(left, right) || compareFocus(left, right)
  }

  return compareFocus(left, right)
}

function compareFocus(left: ListItem, right: ListItem) {
  return (
    compareNumber(statusRank[left.status], statusRank[right.status]) ||
    compareNumber(getPriorityScore(right), getPriorityScore(left)) ||
    compareUpdated(left, right) ||
    compareTitle(left, right)
  )
}

function compareUpdated(left: ListItem, right: ListItem) {
  return right.updatedAt.localeCompare(left.updatedAt)
}

function compareTitle(left: ListItem, right: ListItem) {
  return titleCollator.compare(left.title, right.title)
}

function compareNumber(left: number, right: number) {
  return left === right ? 0 : left < right ? -1 : 1
}

function compareRating(left: ListItem, right: ListItem) {
  if (typeof left.rating === 'number' && typeof right.rating === 'number') {
    return compareNumber(right.rating, left.rating)
  }
  if (typeof left.rating === 'number') return -1
  if (typeof right.rating === 'number') return 1
  return 0
}

function getPriorityScore(item: ListItem) {
  return item.weights.priority + item.weights.challenge * 0.4 + item.weights.surprise * 0.25
}
