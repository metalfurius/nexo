import { httpsCallable } from 'firebase/functions'
import type {
  DiscoveryCandidate,
  ExternalCandidate,
  ExternalRefs,
  ExternalSource,
  ItemType,
  ProgressUnit,
} from '../domain/types'
import { externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import { dedupeCatalogSearchCandidates, rankCatalogSearchCandidates } from '../lib/catalogSearch'
import { getFirebaseFunctionsClient } from './firebaseFunctions'
import { normalizeCatalogStringList, normalizePublicCatalogItems } from './publicCatalog'

export interface CatalogDemandItem {
  id: string
  title: string
  type: ItemType
  description?: string
  releaseYear?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
  genres?: string[]
  tags?: string[]
  moodTags?: string[]
  searchAliases?: string[]
  externalRefs?: ExternalRefs
  posterUrl?: string
}

const catalogDemandChunkSize = 100

export async function recordCatalogDemands(items: CatalogDemandItem[]) {
  if (!items.length) return
  const functionsClient = getFirebaseFunctionsClient()
  if (!functionsClient) throw new Error('Firebase Functions no está disponible para registrar el catálogo.')

  const recordDemands = httpsCallable<{ items: CatalogDemandItem[] }, unknown>(
    functionsClient,
    'recordCatalogDemands',
  )
  for (let index = 0; index < items.length; index += catalogDemandChunkSize) {
    await recordDemands({ items: items.slice(index, index + catalogDemandChunkSize) })
  }
}

export async function searchRemoteCatalog(query: string, type = 'any'): Promise<DiscoveryCandidate[] | undefined> {
  const functionsClient = getFirebaseFunctionsClient()
  if (!functionsClient) return undefined

  const searchCatalog = httpsCallable(functionsClient, 'searchCatalog')
  const result = await searchCatalog({ query, type })
  const payload = readRecord(result.data)
  const publicItems = [
    ...normalizePublicCatalogItems(payload.items),
    ...normalizePublicCatalogItems(payload.ingestedItems),
  ]
  const externalCandidates = normalizeExternalCandidates(payload.candidates)

  return rankCatalogSearchCandidates(
    uniqueDiscoveryCandidates([
      ...publicItems.map(publicItemToDiscovery),
      ...externalCandidates.map(externalCandidateToDiscovery),
    ]),
    query,
    type,
  ).slice(0, 24)
}

function normalizeExternalCandidates(value: unknown): ExternalCandidate[] {
  return Array.isArray(value) ? value.flatMap(normalizeExternalCandidate) : []
}

function normalizeExternalCandidate(value: unknown): ExternalCandidate[] {
  const candidate = readRecord(value)
  const title = optionalString(candidate.title)
  const source = normalizeSource(candidate.source)
  const sourceId = optionalString(candidate.sourceId)
  if (!title || !source || !sourceId) return []

  return [
    {
      id: optionalString(candidate.id) ?? `${source}-${sourceId}`,
      title,
      type: normalizeType(candidate.type),
      source,
      sourceId,
      overview: optionalString(candidate.overview),
      posterUrl: optionalString(candidate.posterUrl),
      releaseYear: finiteNumber(candidate.releaseYear),
      progressTotal: positiveNumber(candidate.progressTotal),
      progressUnit: normalizeProgressUnit(candidate.progressUnit),
      genres: normalizeCatalogStringList(candidate.genres).slice(0, 8),
      searchAliases: normalizeCatalogStringList(candidate.searchAliases).slice(0, 24),
      externalRefs: readExternalRefs(candidate.externalRefs),
      createdAt: optionalString(candidate.createdAt) ?? new Date().toISOString(),
    },
  ]
}

function uniqueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  return dedupeCatalogSearchCandidates(candidates)
}

function readExternalRefs(value: unknown) {
  const record = readRecord(value)
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, entry]) => {
      if (typeof entry !== 'string') return []
      const text = entry.trim()
      return text ? [[key, text]] : []
    }),
  )
}

function normalizeType(type: unknown): ItemType {
  return type === 'game' ||
    type === 'book' ||
    type === 'movie' ||
    type === 'series' ||
    type === 'anime' ||
    type === 'manga' ||
    type === 'manhwa' ||
    type === 'comic' ||
    type === 'other'
    ? type
    : 'other'
}

function normalizeSource(source: unknown): ExternalSource | undefined {
  return source === 'tmdb' ||
    source === 'rawg' ||
    source === 'openLibrary' ||
    source === 'googleBooks' ||
    source === 'anilist' ||
    source === 'mangaDex' ||
    source === 'kitsu' ||
    source === 'jikan' ||
    source === 'wikidata'
    ? source
    : undefined
}

function normalizeProgressUnit(unit: unknown): ProgressUnit | undefined {
  return unit === 'episodes' ||
    unit === 'chapters' ||
    unit === 'pages' ||
    unit === 'hours' ||
    unit === 'volumes' ||
    unit === 'percent' ||
    unit === 'items'
    ? unit
    : undefined
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value)
  return number !== undefined && number > 0 ? number : undefined
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}
