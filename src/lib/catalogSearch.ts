import type { ExternalRefs, ItemType, PublicCatalogSnapshot } from '../domain/types'

export const CATALOG_RESULTS_PAGE_SIZE = 8

const LOW_SIGNAL_TOKENS = new Set([
  'a',
  'an',
  'and',
  'de',
  'del',
  'el',
  'en',
  'for',
  'girl',
  'la',
  'las',
  'los',
  'no',
  'of',
  'on',
  'princess',
  'star',
  'the',
  'to',
  'upon',
  'wa',
  'wish',
  'with',
])

const SOURCE_PRIORITY: Record<string, number> = {
  nexo: 0,
  anilist: 1,
  jikan: 2,
  tmdb: 3,
  openLibrary: 4,
  rawg: 5,
  wikidata: 6,
}

export interface CatalogSearchCandidate {
  title: string
  type: ItemType
  source?: string
  sourceId?: string
  overview?: string
  genres?: string[]
  tags?: string[]
  moodTags?: string[]
  searchTokens?: string[]
  searchAliases?: string[]
  publicSnapshot?: PublicCatalogSnapshot
  externalRefs?: ExternalRefs
  releaseYear?: number
}

interface ScoredCatalogCandidate<Candidate> {
  candidate: Candidate
  index: number
  score: number
}

export function normalizeCatalogSearchText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['`\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compactCatalogSearchText(value: unknown) {
  return normalizeCatalogSearchText(value).replace(/\s+/g, '')
}

export function scoreCatalogSearchCandidate(
  query: string,
  candidate: CatalogSearchCandidate,
  requestedType: string = 'any',
) {
  const queryText = normalizeCatalogSearchText(query)
  if (!queryText) return matchesCatalogSearchType(candidate.type, requestedType) ? 1 : 0

  const queryCompact = compactCatalogSearchText(queryText)
  const queryTokens = tokenizeCatalogText(queryText)
  const titleFields = getCandidateTitleFields(candidate)
  const allFields = getCandidateSearchFields(candidate)
  const normalizedTitleFields = titleFields.map(normalizeCatalogSearchText).filter(Boolean)
  const compactTitleFields = titleFields.map(compactCatalogSearchText).filter(Boolean)
  const normalizedAllFields = allFields.map(normalizeCatalogSearchText).filter(Boolean)
  const normalizedTokenFields = new Set(normalizedAllFields.flatMap(tokenizeCatalogText))

  let score = 0
  let phraseScore = 0

  for (let index = 0; index < normalizedTitleFields.length; index += 1) {
    const titleText = normalizedTitleFields[index]
    const compactTitle = compactTitleFields[index] ?? ''
    const isPrimaryTitle = index === 0
    if (titleText === queryText) phraseScore = Math.max(phraseScore, isPrimaryTitle ? 1120 : 1080)
    if (compactTitle === queryCompact) phraseScore = Math.max(phraseScore, isPrimaryTitle ? 1060 : 1020)
    if (titleText.includes(queryText)) phraseScore = Math.max(phraseScore, isPrimaryTitle ? 840 : 800)
    if (compactTitle.includes(queryCompact)) phraseScore = Math.max(phraseScore, isPrimaryTitle ? 800 : 760)
    if (queryText.includes(titleText) && titleText.length >= 4) phraseScore = Math.max(phraseScore, isPrimaryTitle ? 620 : 580)
  }

  const sourceFields = getCandidateSourceFields(candidate)
  for (const field of sourceFields) {
    const normalizedField = normalizeCatalogSearchText(field)
    const compactField = compactCatalogSearchText(field)
    if (normalizedField.includes(queryText)) phraseScore = Math.max(phraseScore, 720)
    if (compactField.includes(queryCompact)) phraseScore = Math.max(phraseScore, 700)
  }

  score += phraseScore

  let highSignalHits = 0
  let lowSignalHits = 0
  for (const token of queryTokens) {
    const hasToken = normalizedTokenFields.has(token) || normalizedAllFields.some((field) => field.includes(token))
    if (!hasToken) continue
    if (LOW_SIGNAL_TOKENS.has(token)) {
      lowSignalHits += 1
    } else {
      highSignalHits += 1
    }
  }

  score += highSignalHits * 74
  score += lowSignalHits * 10

  const tokenHits = highSignalHits + lowSignalHits
  if (queryTokens.length) {
    const coverage = tokenHits / queryTokens.length
    score += Math.round(coverage * (highSignalHits ? 160 : 44))
  }

  if (!phraseScore && lowSignalHits > 0 && highSignalHits === 0) {
    score -= 90
  }

  if (candidate.releaseYear && queryTokens.includes(String(candidate.releaseYear))) score += 40
  if (score <= 0) return 0

  if (matchesCatalogSearchType(candidate.type, requestedType)) {
    if (requestedType !== 'any') score += requestedType === 'watch' ? 28 : 90
  } else if (requestedType !== 'any') {
    score -= 220
  }

  if (candidate.source === 'nexo' && score > 0) score += 36

  return Math.max(0, score)
}

export function rankCatalogSearchCandidates<Candidate extends CatalogSearchCandidate>(
  candidates: Candidate[],
  query: string,
  requestedType: string = 'any',
) {
  return candidates
    .map(
      (candidate, index): ScoredCatalogCandidate<Candidate> => ({
        candidate,
        index,
        score: scoreCatalogSearchCandidate(query, candidate, requestedType),
      }),
    )
    .sort(compareScoredCandidates)
    .map((entry) => entry.candidate)
}

function compareScoredCandidates<Candidate extends CatalogSearchCandidate>(
  left: ScoredCatalogCandidate<Candidate>,
  right: ScoredCatalogCandidate<Candidate>,
) {
  const scoreDelta = right.score - left.score
  if (scoreDelta !== 0) return scoreDelta

  const leftSource = SOURCE_PRIORITY[left.candidate.source ?? ''] ?? 99
  const rightSource = SOURCE_PRIORITY[right.candidate.source ?? ''] ?? 99
  if (leftSource !== rightSource) return leftSource - rightSource

  return left.candidate.title.localeCompare(right.candidate.title, 'es') || left.index - right.index
}

function getCandidateTitleFields(candidate: CatalogSearchCandidate) {
  return [
    candidate.title,
    ...(candidate.searchAliases ?? []),
    ...(candidate.publicSnapshot?.searchAliases ?? []),
  ].filter(Boolean)
}

function getCandidateSearchFields(candidate: CatalogSearchCandidate) {
  return [
    ...getCandidateTitleFields(candidate),
    candidate.overview,
    candidate.type,
    candidate.source,
    candidate.sourceId,
    candidate.releaseYear ? String(candidate.releaseYear) : undefined,
    ...(candidate.genres ?? []),
    ...(candidate.tags ?? []),
    ...(candidate.moodTags ?? []),
    ...(candidate.searchTokens ?? []),
    ...getCandidateSourceFields(candidate),
  ].filter(Boolean)
}

function getCandidateSourceFields(candidate: CatalogSearchCandidate) {
  const refs = candidate.externalRefs
  if (!refs) return []
  return Object.values(refs).filter((value): value is string => Boolean(value))
}

function tokenizeCatalogText(value: string) {
  return normalizeCatalogSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function matchesCatalogSearchType(itemType: ItemType, requestedType: string) {
  if (!requestedType || requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
}
