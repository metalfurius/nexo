import type { ActivityEntry, ActivityTab } from '../domain/types'

export type ActivityDestinationTab = 'home' | 'discover' | 'library' | 'dice' | 'import' | 'settings' | 'curation'

export interface ActivityContinuityGroup {
  count: number
  entry: ActivityEntry
  tab: ActivityDestinationTab
}

export interface ActivityContinuitySummary {
  groups: ActivityContinuityGroup[]
  primaryEntry: ActivityEntry
  resumableCount: number
  totalCount: number
}

export function getActivityContinuitySummary(entries: ActivityEntry[], limit = 4): ActivityContinuitySummary | undefined {
  if (!entries.length) return undefined

  const primaryEntry = entries.find((entry) => entry.target?.kind === 'item') ?? entries[0]
  const groupsByTab = new Map<ActivityDestinationTab, ActivityContinuityGroup>()

  for (const entry of entries) {
    const tab = getActivityDestinationTab(entry)
    const current = groupsByTab.get(tab)
    if (current) {
      current.count += 1
    } else {
      groupsByTab.set(tab, { count: 1, entry, tab })
    }
  }

  return {
    groups: [...groupsByTab.values()]
      .sort((left, right) => right.entry.createdAt.localeCompare(left.entry.createdAt))
      .slice(0, limit),
    primaryEntry,
    resumableCount: entries.filter((entry) => Boolean(entry.target)).length,
    totalCount: entries.length,
  }
}

export function getActivityDestinationTab(entry: ActivityEntry): ActivityDestinationTab {
  if (entry.target?.kind === 'item') return 'library'
  if (entry.tab === 'catalog' || entry.tab === 'explorer') return 'discover'
  return entry.tab as Exclude<ActivityTab, 'catalog' | 'explorer'>
}
