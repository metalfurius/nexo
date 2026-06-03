import type { DiscoveryCandidate, ItemType, PublicCatalogItem } from '../domain/types'
import { nowIso } from '../domain/types'
import { itemTypeLabels } from './libraryItemInsights'
import { normalizeKey, uniqueValues } from './strings'

export type CatalogQualityFilter = 'all' | 'needs-work' | 'ready'
export type CatalogIssueFilter = 'all' | 'description' | 'genres' | 'tags' | 'poster'
export type CatalogIssueKey = Exclude<CatalogIssueFilter, 'all'>
export type CatalogSortMode = 'quality' | 'title' | 'updated'

export interface CatalogIssueStat {
  count: number
  detail: string
  id: CatalogIssueKey
  label: string
}

export interface CatalogDiagnostics {
  coveragePercent: number
  issueStats: CatalogIssueStat[]
  readyCount: number
  summaryCopy: string
  summaryLabel: string
  totalItems: number
}

export interface CatalogReviewQueueEntry {
  item: PublicCatalogItem
  warnings: string[]
}

export interface CatalogDraftTemplate {
  genres: string[]
  moodTags: string[]
  tags: string[]
}

export const catalogSortLabels: Record<CatalogSortMode, string> = {
  quality: 'Prioridad',
  title: 'Titulo',
  updated: 'Recientes',
}

export const catalogIssueLabels: Record<CatalogIssueKey, string> = {
  description: 'Sin descripcion',
  genres: 'Sin generos',
  tags: 'Sin tags',
  poster: 'Sin portada',
}

export const catalogIssueShortLabels: Record<CatalogIssueKey, string> = {
  description: 'Descripcion',
  genres: 'Generos',
  tags: 'Tags',
  poster: 'Portada',
}

export function catalogQualityIssueKeys(
  item: Pick<PublicCatalogItem, 'description' | 'genres' | 'posterUrl' | 'tags'>,
): CatalogIssueKey[] {
  const issues: CatalogIssueKey[] = []
  if (!item.description?.trim()) issues.push('description')
  if (!item.genres.length) issues.push('genres')
  if (!item.tags.length) issues.push('tags')
  if (!item.posterUrl?.trim()) issues.push('poster')
  return issues
}

export function catalogQualityWarnings(item: Pick<PublicCatalogItem, 'description' | 'genres' | 'posterUrl' | 'tags'>) {
  return catalogQualityIssueKeys(item).map((issue) => catalogIssueLabels[issue])
}

export function draftCatalogQualityWarnings(draft: {
  description?: string
  genresText: string
  posterUrl?: string
  tagsText: string
}) {
  return catalogQualityWarnings({
    description: draft.description,
    genres: splitCatalogDraftList(draft.genresText),
    posterUrl: draft.posterUrl,
    tags: splitCatalogDraftList(draft.tagsText),
  })
}

export function getCatalogReviewQueue(items: PublicCatalogItem[]): CatalogReviewQueueEntry[] {
  return items
    .map((item) => ({ item, warnings: catalogQualityWarnings(item) }))
    .filter((entry) => entry.warnings.length > 0)
    .sort((left, right) => {
      const warningDelta = right.warnings.length - left.warnings.length
      if (warningDelta !== 0) return warningDelta
      return right.item.updatedAt.localeCompare(left.item.updatedAt) || left.item.title.localeCompare(right.item.title, 'es')
    })
    .slice(0, 3)
}

export function getCatalogDiagnostics(items: PublicCatalogItem[]): CatalogDiagnostics {
  const issueStats = (Object.keys(catalogIssueLabels) as CatalogIssueKey[]).map((issue) => {
    const count = items.filter((item) => catalogQualityIssueKeys(item).includes(issue)).length

    return {
      count,
      detail: count === 1 ? '1 ficha pendiente' : `${count} fichas pendientes`,
      id: issue,
      label: catalogIssueShortLabels[issue],
    }
  })
  const readyCount = items.filter((item) => catalogQualityIssueKeys(item).length === 0).length
  const coveragePercent = items.length ? Math.round((readyCount / items.length) * 100) : 0
  const strongestIssue = [...issueStats].sort((left, right) => right.count - left.count)[0]
  const summaryLabel =
    items.length === 0
      ? 'Catalogo por empezar'
      : readyCount === items.length
        ? 'Catalogo listo'
        : `${items.length - readyCount} fichas por pulir`
  const summaryCopy =
    items.length === 0
      ? 'Crea una ficha o importa un seed para empezar la curacion compartida.'
      : readyCount === items.length
        ? 'Todas las entradas activas tienen descripcion, taxonomia y portada.'
        : strongestIssue && strongestIssue.count > 0
          ? `${strongestIssue.label} es el foco con mas trabajo ahora mismo.`
          : 'Revisa las senales pendientes antes de la beta.'

  return {
    coveragePercent,
    issueStats,
    readyCount,
    summaryCopy,
    summaryLabel,
    totalItems: items.length,
  }
}

export function sortCatalogItems(left: PublicCatalogItem, right: PublicCatalogItem, mode: CatalogSortMode) {
  if (mode === 'updated') return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'es')
  if (mode === 'title') return left.title.localeCompare(right.title, 'es')

  const leftWarnings = catalogQualityWarnings(left).length
  const rightWarnings = catalogQualityWarnings(right).length
  return rightWarnings - leftWarnings || right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'es')
}

export function blankPublicCatalogItem(type: ItemType = 'book', timestamp = nowIso()): PublicCatalogItem {
  return {
    id: '',
    title: '',
    type,
    genres: [],
    tags: [],
    moodTags: [],
    externalRefs: {},
    searchTokens: [],
    canonicalKey: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: 'moderator',
    updatedBy: 'moderator',
  }
}

export function publicCatalogDraftFromTemplate(type: ItemType, template: CatalogDraftTemplate, timestamp = nowIso()): PublicCatalogItem {
  return {
    ...blankPublicCatalogItem(type, timestamp),
    genres: [...template.genres],
    tags: [...template.tags],
    moodTags: [...template.moodTags],
  }
}

export function publicCatalogDraftFromCandidate(candidate: DiscoveryCandidate, timestamp = nowIso()): PublicCatalogItem {
  const draft = blankPublicCatalogItem(candidate.type, timestamp)
  const snapshot = candidate.publicSnapshot

  return {
    ...draft,
    id: snapshot?.id ?? '',
    title: candidate.title,
    type: candidate.type,
    description: candidate.overview ?? snapshot?.description,
    releaseYear: candidate.releaseYear ?? snapshot?.releaseYear,
    genres: uniqueValues(snapshot?.genres ?? candidate.genres),
    tags: snapshot?.tags ?? publicCatalogTagsFromCandidate(candidate),
    moodTags: uniqueValues(snapshot?.moodTags ?? candidate.moodTags),
    externalRefs: snapshot?.externalRefs ?? candidate.externalRefs,
    posterUrl: candidate.posterUrl ?? snapshot?.posterUrl,
    canonicalKey: snapshot?.canonicalKey ?? '',
    createdAt: snapshot?.updatedAt ?? candidate.createdAt,
    updatedAt: snapshot?.updatedAt ?? draft.updatedAt,
  }
}

export function publicCatalogTagsFromCandidate(candidate: Pick<DiscoveryCandidate, 'source' | 'tags' | 'type'>) {
  const technicalTags = new Set([candidate.type, candidate.source, 'nexo', 'prompt'].map(normalizeKey))
  return uniqueValues(candidate.tags.filter((tag) => !technicalTags.has(normalizeKey(tag))))
}

export function upsertVisibleCatalogItem(items: PublicCatalogItem[], nextItem: PublicCatalogItem) {
  return [nextItem, ...items.filter((item) => item.id !== nextItem.id)].sort((left, right) => left.title.localeCompare(right.title, 'es'))
}

export function buildCatalogDescriptionDraft(title: string, type: ItemType, signals: string[]) {
  const displayTitle = title.trim() || 'Entrada pendiente'
  const signalText = signals.length ? signals.slice(0, 4).join(', ') : itemTypeLabels[type].toLowerCase()
  return `${displayTitle} combina ${signalText} en una ficha curada para el catalogo Nexo.`
}

function splitCatalogDraftList(value: string) {
  return uniqueValues(value.split(',').map((entry) => entry.trim()))
}
