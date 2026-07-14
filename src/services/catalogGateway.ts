import {
  ITEM_TYPES,
  PROGRESS_UNITS,
  type ExternalCandidate,
  type ExternalSource,
  type ItemType,
  type ProgressUnit,
  nowIso,
} from '../domain/types'
import { normalizeCatalogStringList } from './publicCatalog'

const externalSources: ExternalSource[] = [
  'tmdb',
  'rawg',
  'openLibrary',
  'googleBooks',
  'anilist',
  'mangaDex',
  'kitsu',
  'jikan',
  'wikidata',
]

export interface CatalogGatewaySearchResult {
  candidates: ExternalCandidate[]
  partial: boolean
}

export async function fetchCatalogGatewaySearch(
  query: string,
  type: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CatalogGatewaySearchResult | undefined> {
  const catalogApiUrl = String(import.meta.env.VITE_CATALOG_API_URL ?? '').trim()
  const url = createCatalogGatewayUrl(catalogApiUrl)
  if (!url) return undefined

  url.searchParams.set('q', query)
  url.searchParams.set('type', type)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url, { headers: { accept: 'application/json' }, signal })
  if (!response.ok) return undefined

  const payload = (await response.json()) as { results?: unknown }
  if (!Array.isArray(payload.results)) return undefined
  return {
    candidates: payload.results.flatMap(normalizeCatalogGatewayCandidate),
    partial: response.headers.get('x-nexo-partial') === 'true',
  }
}

function createCatalogGatewayUrl(base: string) {
  if (!base) return undefined
  try {
    return new URL('v1/catalog/search', base.endsWith('/') ? base : `${base}/`)
  } catch {
    return undefined
  }
}

function normalizeCatalogGatewayCandidate(value: unknown): ExternalCandidate[] {
  const candidate = readRecord(value)
  const title = optionalString(candidate.title)
  const source = externalSources.includes(candidate.source as ExternalSource)
    ? candidate.source as ExternalSource
    : undefined
  const sourceId = optionalString(candidate.sourceId)
  if (!title || !source || !sourceId) return []

  return [{
    id: optionalString(candidate.id) ?? `${source}-${sourceId}`,
    title,
    type: ITEM_TYPES.includes(candidate.type as ItemType) ? candidate.type as ItemType : 'other',
    source,
    sourceId,
    overview: optionalString(candidate.overview),
    posterUrl: optionalString(candidate.posterUrl),
    releaseYear: finiteNumber(candidate.releaseYear),
    progressTotal: positiveNumber(candidate.progressTotal),
    progressUnit: PROGRESS_UNITS.includes(candidate.progressUnit as ProgressUnit)
      ? candidate.progressUnit as ProgressUnit
      : undefined,
    genres: normalizeCatalogStringList(candidate.genres).slice(0, 8),
    searchAliases: Array.isArray(candidate.searchAliases)
      ? normalizeCatalogStringList(candidate.searchAliases).slice(0, 24)
      : undefined,
    externalRefs: readExternalRefs(candidate.externalRefs),
    createdAt: optionalString(candidate.createdAt) ?? nowIso(),
  }]
}

function readExternalRefs(value: unknown) {
  return Object.fromEntries(
    Object.entries(readRecord(value)).flatMap(([key, entry]) => {
      const text = optionalString(entry)
      return text ? [[key, text]] : []
    }),
  )
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value)
  return number !== undefined && number > 0 ? number : undefined
}
