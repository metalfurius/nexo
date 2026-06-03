import type { PublicCatalogItem } from '../domain/types'
import { uniqueValues } from './strings'

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

function splitCatalogDraftList(value: string) {
  return uniqueValues(value.split(',').map((entry) => entry.trim()))
}
