import { httpsCallable } from 'firebase/functions'
import type { DiscoveryCandidate, ExternalCandidate, ExternalSource, ItemType, ProgressUnit } from '../domain/types'
import { externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import { rankCatalogSearchCandidates } from '../lib/catalogSearch'
import { getFirebaseFunctionsClient } from './firebaseFunctions'
import { normalizePublicCatalogItems } from './publicCatalog'

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
      releaseYear: typeof candidate.releaseYear === 'number' ? candidate.releaseYear : undefined,
      progressTotal: typeof candidate.progressTotal === 'number' ? candidate.progressTotal : undefined,
      progressUnit: normalizeProgressUnit(candidate.progressUnit),
      genres: Array.isArray(candidate.genres) ? candidate.genres.map(String).filter(Boolean).slice(0, 8) : [],
      searchAliases: Array.isArray(candidate.searchAliases) ? candidate.searchAliases.map(String).filter(Boolean).slice(0, 24) : undefined,
      externalRefs: readExternalRefs(candidate.externalRefs),
      createdAt: optionalString(candidate.createdAt) ?? new Date().toISOString(),
    },
  ]
}

function uniqueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  const byId = new Map<string, DiscoveryCandidate>()
  for (const candidate of candidates) {
    byId.set(`${candidate.source}:${candidate.sourceId}`, candidate)
  }
  return [...byId.values()]
}

function readExternalRefs(value: unknown) {
  const record = readRecord(value)
  return Object.fromEntries(Object.entries(record).filter(([, entry]) => typeof entry === 'string' && entry.trim()))
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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}
