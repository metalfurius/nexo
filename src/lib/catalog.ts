import {
  DEFAULT_WEIGHTS,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ItemType,
  type ListItem,
  type PublicCatalogItem,
  type PublicCatalogSnapshot,
  nowIso,
} from '../domain/types'
import { normalizeKey, slugify, uniqueValues } from './strings'

export function createSearchTokens(value: {
  title: string
  type?: ItemType
  genres?: string[]
  tags?: string[]
  releaseYear?: number
}) {
  const words = [
    value.title,
    value.type,
    value.releaseYear ? String(value.releaseYear) : undefined,
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
    genres: item.genres,
    tags: item.tags,
    moodTags: item.moodTags,
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
    genres: item.genres,
    tags: item.tags,
    moodTags: item.moodTags,
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
    genres: candidate.genres,
    tags: uniqueValues([candidate.type, candidate.source, ...candidate.genres]),
    moodTags: [],
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
  return {
    id: `${candidate.type}-${slugify(candidate.title)}-${candidate.sourceId}`.slice(0, 120),
    title: candidate.title,
    type: candidate.type,
    status: 'wishlist',
    genres: uniqueValues(candidate.genres),
    tags: uniqueValues(candidate.tags.length ? candidate.tags : [candidate.type, candidate.source]),
    moodTags: uniqueValues(candidate.moodTags),
    weights: DEFAULT_WEIGHTS,
    notes: candidate.overview,
    source: candidate.source === 'nexo' ? 'public' : 'external',
    externalRefs: candidate.externalRefs,
    posterUrl: candidate.posterUrl,
    publicItemId: candidate.publicItemId,
    publicSnapshot: candidate.publicSnapshot,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
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

  return {
    id,
    title: draft.title.trim(),
    type: draft.type,
    description: draft.description?.trim() || undefined,
    releaseYear: draft.releaseYear,
    genres,
    tags,
    moodTags: uniqueValues(draft.moodTags ?? []),
    externalRefs: draft.externalRefs ?? {},
    posterUrl: draft.posterUrl?.trim() || undefined,
    searchTokens: createSearchTokens({ title: draft.title, type: draft.type, genres, tags, releaseYear: draft.releaseYear }),
    canonicalKey: createCanonicalKey(draft.title, draft.type),
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
    createdBy: draft.createdBy ?? actorId,
    updatedBy: actorId,
    archivedAt: draft.archivedAt,
  }
}
