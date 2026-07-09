import {
  DEFAULT_WEIGHTS,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ItemType,
  type ListItem,
  type ProgressUnit,
  type PublicCatalogItem,
  type PublicCatalogSnapshot,
  nowIso,
} from '../domain/types'
import { normalizeKey, slugify, uniqueNormalizedValues, uniqueValues } from './strings'

export function createSearchTokens(value: {
  title: string
  type?: ItemType
  genres?: string[]
  tags?: string[]
  searchAliases?: string[]
  releaseYear?: number
}) {
  const words = [
    value.title,
    value.type,
    value.releaseYear ? String(value.releaseYear) : undefined,
    ...(value.searchAliases ?? []),
    ...(value.genres ?? []),
    ...(value.tags ?? []),
  ]
    .filter(Boolean)
    .flatMap((entry) => normalizeKey(String(entry)).split(/\s+/))
    .filter((entry) => entry.length >= 2)

  return uniqueValues(words).slice(0, 30)
}

export function createCanonicalKey(title: string, type: ItemType) {
  return `${type}:${normalizeKey(title)}`
}

export function snapshotPublicItem(item: PublicCatalogItem): PublicCatalogSnapshot {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    releaseYear: item.releaseYear,
    progressTotal: item.progressTotal,
    progressUnit: item.progressUnit,
    genres: item.genres,
    tags: item.tags,
    moodTags: item.moodTags,
    searchAliases: item.searchAliases ?? [],
    externalRefs: item.externalRefs,
    posterUrl: item.posterUrl,
    canonicalKey: item.canonicalKey,
    updatedAt: item.updatedAt,
  }
}

export function publicItemToDiscovery(item: PublicCatalogItem): DiscoveryCandidate {
  const timestamp = nowIso()
  return {
    id: `public-${item.id}`,
    title: item.title,
    type: item.type,
    status: 'queued',
    origin: 'publicCatalog',
    source: 'nexo',
    sourceId: item.id,
    overview: item.description,
    posterUrl: item.posterUrl,
    releaseYear: item.releaseYear,
    progressTotal: item.progressTotal,
    progressUnit: item.progressUnit,
    genres: item.genres,
    tags: item.tags,
    moodTags: item.moodTags,
    searchAliases: item.searchAliases ?? [],
    externalRefs: item.externalRefs,
    publicItemId: item.id,
    publicSnapshot: snapshotPublicItem(item),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function externalCandidateToDiscovery(candidate: ExternalCandidate): DiscoveryCandidate {
  const timestamp = nowIso()
  return {
    id: `external-${candidate.source}-${candidate.sourceId}`,
    title: candidate.title,
    type: candidate.type,
    status: 'queued',
    origin: 'externalSearch',
    source: candidate.source,
    sourceId: candidate.sourceId,
    overview: candidate.overview,
    posterUrl: candidate.posterUrl,
    releaseYear: candidate.releaseYear,
    progressTotal: candidate.progressTotal,
    progressUnit: candidate.progressUnit,
    genres: candidate.genres,
    tags: uniqueValues([candidate.type, candidate.source, ...candidate.genres]),
    moodTags: [],
    searchAliases: candidate.searchAliases ?? [],
    externalRefs: candidate.externalRefs,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function promptToDiscovery(title: string, type: ItemType = 'other'): DiscoveryCandidate {
  const timestamp = nowIso()
  return {
    id: `prompt-${slugify(title)}-${Date.now()}`,
    title,
    type,
    status: 'queued',
    origin: 'prompt',
    source: 'prompt',
    sourceId: slugify(title),
    genres: [],
    tags: ['explorar'],
    moodTags: ['sorpresa'],
    externalRefs: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function discoveryToListItem(candidate: DiscoveryCandidate): ListItem {
  const timestamp = nowIso()
  const progressDefaults = getListItemProgressDefaults(candidate)
  const durationMaxHours = estimateDurationMaxHours(candidate)

  return {
    id: `${candidate.type}-${slugify(candidate.title)}-${candidate.sourceId}`.slice(0, 120),
    title: candidate.title,
    type: candidate.type,
    status: 'wishlist',
    durationMaxHours,
    progressCurrent: progressDefaults.progressCurrent,
    progressTotal: progressDefaults.progressTotal,
    progressUnit: progressDefaults.progressUnit,
    genres: uniqueValues(candidate.genres),
    tags: uniqueValues(candidate.tags.length ? candidate.tags : [candidate.type, candidate.source]),
    moodTags: uniqueValues(candidate.moodTags),
    weights: DEFAULT_WEIGHTS,
    source: candidate.source === 'nexo' ? 'public' : 'external',
    externalRefs: candidate.externalRefs,
    posterUrl: candidate.posterUrl,
    publicItemId: candidate.publicItemId,
    publicSnapshot: candidate.publicSnapshot,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function shouldPreserveDiscoveryDecision(
  existing: DiscoveryCandidate | undefined,
  incoming: Pick<DiscoveryCandidate, 'status'>,
) {
  return Boolean(existing && incoming.status === 'queued' && (existing.status === 'saved' || existing.status === 'dismissed'))
}

export function mergeDiscoveryCandidate(existing: DiscoveryCandidate | undefined, incoming: DiscoveryCandidate) {
  if (!existing) return incoming
  if (shouldPreserveDiscoveryDecision(existing, incoming)) return existing
  return incoming.updatedAt.localeCompare(existing.updatedAt) > 0 ? incoming : existing
}

export function publicItemToListItem(item: PublicCatalogItem): ListItem {
  return discoveryToListItem(publicItemToDiscovery(item))
}

export function buildPublicCatalogItem(
  draft: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>,
  actorId: string,
): PublicCatalogItem {
  const timestamp = nowIso()
  const id = draft.id || `${draft.type}-${slugify(draft.title)}`.slice(0, 120)
  const genres = uniqueValues(draft.genres ?? [])
  const tags = uniqueValues(draft.tags ?? [])
  const searchAliases = uniqueNormalizedValues((draft.searchAliases ?? []).map((entry) => entry.trim()))

  return {
    id,
    title: draft.title.trim(),
    type: draft.type,
    description: draft.description?.trim() || undefined,
    releaseYear: draft.releaseYear,
    progressTotal: draft.progressTotal,
    progressUnit: draft.progressUnit,
    genres,
    tags,
    moodTags: uniqueValues(draft.moodTags ?? []),
    searchAliases,
    externalRefs: draft.externalRefs ?? {},
    posterUrl: draft.posterUrl?.trim() || undefined,
    searchTokens: createSearchTokens({
      title: draft.title,
      type: draft.type,
      genres,
      tags,
      searchAliases,
      releaseYear: draft.releaseYear,
    }),
    canonicalKey: createCanonicalKey(draft.title, draft.type),
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
    createdBy: draft.createdBy ?? actorId,
    updatedBy: actorId,
    archivedAt: draft.archivedAt,
    autoIngestedAt: draft.autoIngestedAt,
    demandCount: draft.demandCount,
    lastDemandAt: draft.lastDemandAt,
  }
}

export function estimateDurationMaxHours(value: {
  progressTotal?: number
  progressUnit?: ProgressUnit
  type: ItemType
}) {
  const total = readPositiveNumber(value.progressTotal)
  if (total === undefined) return undefined

  if (value.progressUnit === 'hours') return roundDurationHours(total)
  if (value.progressUnit === 'episodes') return roundDurationHours(total * (value.type === 'anime' ? 0.4 : 0.75))
  if (value.progressUnit === 'pages') return roundDurationHours(total / 45)
  if (value.progressUnit === 'chapters') return roundDurationHours(total * 0.15)
  if (value.progressUnit === 'volumes') return roundDurationHours(total * 1.5)
  return undefined
}

function getListItemProgressDefaults(candidate: Pick<DiscoveryCandidate, 'progressTotal' | 'progressUnit' | 'type'>): {
  progressCurrent?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
} {
  if (candidate.type === 'game' || candidate.type === 'movie' || candidate.type === 'other') return {}

  const progressTotal = readPositiveNumber(candidate.progressTotal)
  const progressUnit = candidate.progressUnit ?? getDefaultCatalogProgressUnit(candidate.type)

  return {
    progressCurrent: 0,
    progressTotal,
    progressUnit,
  }
}

function getDefaultCatalogProgressUnit(type: ItemType): ProgressUnit {
  if (type === 'anime' || type === 'series') return 'episodes'
  if (type === 'book') return 'pages'
  if (type === 'manga' || type === 'manhwa' || type === 'comic') return 'chapters'
  return 'hours'
}

function readPositiveNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function roundDurationHours(value: number) {
  return Math.max(0.5, Math.round(value * 2) / 2)
}
