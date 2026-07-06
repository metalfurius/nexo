import type { ExternalRefs, ItemType, ProgressUnit, PublicCatalogSnapshot } from '../domain/types'

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
  'mas',
  'mi',
  'mia',
  'mio',
  'mis',
  'no',
  'of',
  'on',
  'para',
  'por',
  'princess',
  'que',
  'se',
  'sin',
  'star',
  'su',
  'sus',
  'te',
  'the',
  'to',
  'tu',
  'un',
  'una',
  'uno',
  'upon',
  'wa',
  'wish',
  'with',
  'y',
])

const SOURCE_PRIORITY: Record<string, number> = {
  nexo: 0,
  anilist: 1,
  jikan: 2,
  kitsu: 3,
  mangaDex: 4,
  tmdb: 5,
  googleBooks: 6,
  openLibrary: 7,
  rawg: 8,
  wikidata: 9,
}

const EXTERNAL_REF_IDENTITY_KEYS: Array<keyof ExternalRefs> = [
  'tmdbId',
  'rawgId',
  'openLibraryKey',
  'googleBooksId',
  'anilistId',
  'mangaDexId',
  'kitsuId',
  'malId',
  'goodreadsBookId',
  'isbn',
  'letterboxdSlug',
  'wikidataId',
]

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
  posterUrl?: string
  progressTotal?: number
  progressUnit?: ProgressUnit
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
  const normalizedTitleTokenFields = new Set(normalizedTitleFields.flatMap(tokenizeCatalogText))
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
    if (queryText.includes(titleText) && compactTitle.length >= 4) {
      phraseScore = Math.max(phraseScore, isPrimaryTitle ? 620 : 580)
    }
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
  let titleHighSignalHits = 0
  let titleLowSignalHits = 0
  let highSignalQueryTokens = 0
  for (const token of queryTokens) {
    if (!LOW_SIGNAL_TOKENS.has(token)) highSignalQueryTokens += 1
    const hasTitleToken = normalizedTitleTokenFields.has(token) || normalizedTitleFields.some((field) => isSearchTokenSubstringHit(token, field))
    const hasToken = hasTitleToken || normalizedTokenFields.has(token) || normalizedAllFields.some((field) => isSearchTokenSubstringHit(token, field))
    if (!hasToken) continue
    if (LOW_SIGNAL_TOKENS.has(token)) {
      lowSignalHits += 1
      if (hasTitleToken) titleLowSignalHits += 1
    } else {
      highSignalHits += 1
      if (hasTitleToken) titleHighSignalHits += 1
    }
  }

  const titleTokenHits = titleHighSignalHits + titleLowSignalHits
  if (!phraseScore) {
    if (titleTokenHits === 0) return 0
    if (queryTokens.length > 1) {
      const titleCoverage = titleTokenHits / queryTokens.length
      const titleHighCoverage = highSignalQueryTokens ? titleHighSignalHits / highSignalQueryTokens : 0
      if (highSignalQueryTokens > 0 && titleHighCoverage < 0.67) return 0
      if (titleCoverage < 0.5) return 0
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
    .filter((entry) => entry.score > 0)
    .sort(compareScoredCandidates)
    .map((entry) => entry.candidate)
}

export function dedupeCatalogSearchCandidates<Candidate extends CatalogSearchCandidate>(candidates: Candidate[]) {
  const deduped: Candidate[] = []
  for (const candidate of candidates) {
    const duplicateIndex = deduped.findIndex((existing) => areCatalogSearchCandidatesDuplicates(existing, candidate))
    if (duplicateIndex === -1) {
      deduped.push(candidate)
      continue
    }

    deduped[duplicateIndex] = mergeDuplicateCatalogCandidate(deduped[duplicateIndex], candidate)
  }
  return deduped
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

function areCatalogSearchCandidatesDuplicates(left: CatalogSearchCandidate, right: CatalogSearchCandidate) {
  if (left.source && right.source && left.source === right.source && left.sourceId && left.sourceId === right.sourceId) return true
  if (hasSharedExternalIdentity(left.externalRefs, right.externalRefs)) return true
  if (left.type !== right.type) return false
  if (normalizeCatalogSearchText(left.title) !== normalizeCatalogSearchText(right.title)) return false
  return areReleaseYearsCompatible(left.releaseYear, right.releaseYear)
}

function hasSharedExternalIdentity(leftRefs?: ExternalRefs, rightRefs?: ExternalRefs) {
  if (!leftRefs || !rightRefs) return false
  return EXTERNAL_REF_IDENTITY_KEYS.some((key) => {
    const leftValue = normalizeExternalIdentityValue(key, leftRefs[key])
    const rightValue = normalizeExternalIdentityValue(key, rightRefs[key])
    return Boolean(leftValue && rightValue && leftValue === rightValue)
  })
}

function normalizeExternalIdentityValue(key: keyof ExternalRefs, value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return ''
  return key === 'isbn' ? normalized.replace(/[^0-9x]/g, '') : normalized
}

function areReleaseYearsCompatible(leftYear?: number, rightYear?: number) {
  if (typeof leftYear === 'number' && typeof rightYear === 'number') return leftYear === rightYear
  return leftYear === undefined && rightYear === undefined
}

function mergeDuplicateCatalogCandidate<Candidate extends CatalogSearchCandidate>(left: Candidate, right: Candidate): Candidate {
  const primary = compareCatalogCandidatePreference(left, right) <= 0 ? left : right
  const secondary = primary === left ? right : left
  return {
    ...primary,
    overview: primary.overview || secondary.overview,
    releaseYear: primary.releaseYear ?? secondary.releaseYear,
    posterUrl: primary.posterUrl || secondary.posterUrl,
    progressTotal: primary.progressTotal ?? secondary.progressTotal,
    progressUnit: primary.progressUnit ?? secondary.progressUnit,
    genres: mergeStringLists(primary.genres, secondary.genres),
    tags: mergeStringLists(primary.tags, secondary.tags),
    moodTags: mergeStringLists(primary.moodTags, secondary.moodTags),
    searchAliases: mergeStringLists(primary.searchAliases, secondary.searchAliases),
    externalRefs: {
      ...(secondary.externalRefs ?? {}),
      ...(primary.externalRefs ?? {}),
    },
  } as Candidate
}

function compareCatalogCandidatePreference(left: CatalogSearchCandidate, right: CatalogSearchCandidate) {
  const sourceDelta = (SOURCE_PRIORITY[left.source ?? ''] ?? 99) - (SOURCE_PRIORITY[right.source ?? ''] ?? 99)
  if (sourceDelta !== 0) return sourceDelta

  const leftCompleteness = getCatalogCandidateCompleteness(left)
  const rightCompleteness = getCatalogCandidateCompleteness(right)
  if (leftCompleteness !== rightCompleteness) return rightCompleteness - leftCompleteness

  return 0
}

function getCatalogCandidateCompleteness(candidate: CatalogSearchCandidate) {
  return [
    candidate.overview,
    candidate.posterUrl,
    candidate.releaseYear,
    candidate.progressTotal,
    candidate.progressUnit,
    candidate.genres?.length,
    candidate.tags?.length,
    candidate.searchAliases?.length,
    candidate.externalRefs && Object.keys(candidate.externalRefs).length,
  ].filter(Boolean).length
}

function mergeStringLists(left: string[] | undefined, right: string[] | undefined) {
  return [...new Set([...(left ?? []), ...(right ?? [])].map((value) => value.trim()).filter(Boolean))]
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

function isSearchTokenSubstringHit(token: string, field: string) {
  return token.length >= 4 && !LOW_SIGNAL_TOKENS.has(token) && field.includes(token)
}

function matchesCatalogSearchType(itemType: ItemType, requestedType: string) {
  if (!requestedType || requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
}
