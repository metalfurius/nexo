import type { ListItem } from '../domain/types'
import type { RoadmapEntry, RoadmapView } from '../lib/roadmap'

export type HomeJourneyViewport = 'desktop' | 'compact'
export type HomeJourneyExpandableLane = 'next' | 'later'

export const HOME_JOURNEY_VISIBLE_LIMITS = {
  desktop: { next: 4, later: 5 },
  compact: { next: 3, later: 3 },
} as const satisfies Record<HomeJourneyViewport, Record<HomeJourneyExpandableLane, number>>

export type HomeJourneyHero =
  | { kind: 'loading' }
  | { kind: 'current'; entry: RoadmapEntry }
  | { kind: 'next-chapter'; entry: RoadmapEntry }
  | { kind: 'invitation' }

export interface HomeJourneyLaneModel {
  entries: RoadmapEntry[]
  visibleEntries: RoadmapEntry[]
  total: number
  visibleLimit: number
  hiddenCount: number
  canExpand: boolean
  expanded: boolean
}

export interface HomeJourneyModel {
  status: 'loading' | 'ready'
  hero: HomeJourneyHero
  additionalNow: RoadmapEntry[]
  next: HomeJourneyLaneModel
  later: HomeJourneyLaneModel
  recentCompleted: ListItem[]
}

export interface BuildHomeJourneyModelInput {
  roadmap: RoadmapView
  items: readonly ListItem[]
  loading: boolean
  viewport?: HomeJourneyViewport
  expanded?: Partial<Record<HomeJourneyExpandableLane, boolean>>
}

/**
 * Builds the read-only projection consumed by Inicio. Promotion and expansion
 * only affect this returned model; roadmap preferences and library items are
 * never persisted or mutated here.
 */
export function buildHomeJourneyModel({
  roadmap,
  items,
  loading,
  viewport = 'desktop',
  expanded = {},
}: BuildHomeJourneyModelInput): HomeJourneyModel {
  const limits = HOME_JOURNEY_VISIBLE_LIMITS[viewport]

  if (loading) {
    return {
      status: 'loading',
      hero: { kind: 'loading' },
      additionalNow: [],
      next: buildLaneModel([], limits.next, false),
      later: buildLaneModel([], limits.later, false),
      recentCompleted: [],
    }
  }

  const currentEntry = roadmap.now[0]
  const promotedNextEntry = currentEntry ? undefined : roadmap.next[0]
  const nextEntries = promotedNextEntry ? roadmap.next.slice(1) : [...roadmap.next]
  const hero: HomeJourneyHero = currentEntry
    ? { kind: 'current', entry: currentEntry }
    : promotedNextEntry
      ? { kind: 'next-chapter', entry: promotedNextEntry }
      : { kind: 'invitation' }

  return {
    status: 'ready',
    hero,
    additionalNow: roadmap.now.slice(1),
    next: buildLaneModel(nextEntries, limits.next, expanded.next === true),
    later: buildLaneModel(roadmap.later, limits.later, expanded.later === true),
    recentCompleted: items
      .filter((item) => item.status === 'completed')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 3),
  }
}

function buildLaneModel(
  sourceEntries: readonly RoadmapEntry[],
  visibleLimit: number,
  expanded: boolean,
): HomeJourneyLaneModel {
  const entries = [...sourceEntries]
  const canExpand = entries.length > visibleLimit
  const isExpanded = canExpand && expanded
  const visibleEntries = isExpanded ? [...entries] : entries.slice(0, visibleLimit)

  return {
    entries,
    visibleEntries,
    total: entries.length,
    visibleLimit,
    hiddenCount: entries.length - visibleEntries.length,
    canExpand,
    expanded: isExpanded,
  }
}
