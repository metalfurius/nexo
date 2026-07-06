import { strFromU8, unzipSync } from 'fflate'
import Papa from 'papaparse'
import {
  DEFAULT_WEIGHTS,
  ITEM_STATUSES,
  ITEM_TYPES,
  type ExternalRefs,
  type ImportedLibraryItemDraft,
  type ImportPreview,
  type ImportPreviewItem,
  type ImportSourceId,
  type ImportWarning,
  type ItemStatus,
  type ItemType,
  type ListItem,
  type ProgressUnit,
  nowIso,
} from '../domain/types'
import { normalizeKey, slugify, uniqueValues } from '../lib/strings'

export interface LibraryImportProviderResult {
  sourceId: ImportSourceId
  drafts: ImportedLibraryItemDraft[]
  warnings: ImportWarning[]
}

type CsvRow = Record<string, string | undefined>
type UnknownRecord = Record<string, unknown>

const anilistGraphqlUrl = 'https://graphql.anilist.co'
const jikanBaseUrl = 'https://api.jikan.moe/v4'
const maxJikanPages = 20
const letterboxdMaxZipBytes = 10 * 1024 * 1024
const letterboxdMaxCsvBytes = 4 * 1024 * 1024
const letterboxdMaxTotalCsvBytes = 12 * 1024 * 1024
const goodreadsMaxCsvBytes = 10 * 1024 * 1024
const letterboxdCsvSourcePriority: Record<LetterboxdCsvSource, number> = {
  reviews: 0,
  ratings: 1,
  diary: 2,
  watched: 3,
  watchlist: 4,
}

export const importSourceLabels: Record<ImportSourceId, string> = {
  anilist: 'AniList',
  myanimelist: 'MyAnimeList',
  letterboxd: 'Letterboxd',
  goodreads: 'Goodreads',
}

const externalDuplicateKeys: Array<keyof ExternalRefs> = [
  'anilistId',
  'malId',
  'goodreadsBookId',
  'isbn',
  'letterboxdSlug',
  'tmdbId',
  'openLibraryKey',
  'googleBooksId',
  'mangaDexId',
  'kitsuId',
  'rawgId',
  'wikidataId',
]

export async function importAniListLibrary(input: string): Promise<LibraryImportProviderResult> {
  const username = readPublicProfileUsername(input, 'anilist')
  const [animeResult, mangaResult] = await Promise.all([
    fetchAniListCollection(username, 'ANIME'),
    fetchAniListCollection(username, 'MANGA'),
  ])

  return {
    sourceId: 'anilist',
    drafts: [...animeResult.drafts, ...mangaResult.drafts],
    warnings: [...animeResult.warnings, ...mangaResult.warnings],
  }
}

export async function importMyAnimeListLibrary(input: string): Promise<LibraryImportProviderResult> {
  const username = readPublicProfileUsername(input, 'myanimelist')
  const [animeResult, mangaResult] = await Promise.all([
    fetchJikanList(username, 'animelist'),
    fetchJikanList(username, 'mangalist'),
  ])

  return {
    sourceId: 'myanimelist',
    drafts: [...animeResult.drafts, ...mangaResult.drafts],
    warnings: [
      {
        code: 'partial',
        message: 'Importacion experimental via Jikan: MyAnimeList puede omitir listas privadas o limitar paginas.',
        sourceId: 'myanimelist',
      },
      ...animeResult.warnings,
      ...mangaResult.warnings,
    ],
  }
}

export async function importLetterboxdZip(file: File): Promise<LibraryImportProviderResult> {
  if (file.size > letterboxdMaxZipBytes) {
    throw new Error('El ZIP de Letterboxd supera el limite de 10 MB.')
  }
  return parseLetterboxdZipBytes(new Uint8Array(await file.arrayBuffer()))
}

export async function importGoodreadsCsv(file: File): Promise<LibraryImportProviderResult> {
  if (file.size > goodreadsMaxCsvBytes) {
    throw new Error('El CSV de Goodreads supera el limite de 10 MB.')
  }
  return parseGoodreadsCsv(await file.text())
}

export function parseGoodreadsCsv(csvText: string): LibraryImportProviderResult {
  const rows = parseCsv(csvText)
  const warnings: ImportWarning[] = []
  const drafts = rows.flatMap((row, index) => {
    const title = readRowValue(row, ['Title'])
    const bookId = readRowValue(row, ['Book Id', 'BookID'])
    const author = readRowValue(row, ['Author', 'Authors'])
    const isbn = cleanIsbn(readRowValue(row, ['ISBN13', 'ISBN']))

    if (!title) {
      warnings.push({
        code: 'invalid-entry',
        message: `Fila ${index + 2} de Goodreads sin titulo.`,
        sourceId: 'goodreads',
      })
      return []
    }

    const rating = parseGoodreadsRating(readRowValue(row, ['My Rating']))
    const shelves = splitCsvList(readRowValue(row, ['Bookshelves', 'Bookshelves with positions']))
    const exclusiveShelf = readRowValue(row, ['Exclusive Shelf'])
    const year = parseYear(readRowValue(row, ['Original Publication Year', 'Year Published']))
    const review = readRowValue(row, ['My Review'])
    const publisher = readRowValue(row, ['Publisher'])
    const sourceItemId = bookId || isbn || `${slugify(title)}-${slugify(author ?? '')}`

    return [
      {
        sourceId: 'goodreads',
        sourceItemId,
        title,
        type: 'book',
        status: goodreadsShelfToStatus(exclusiveShelf),
        rating,
        genres: [],
        tags: uniqueValues(['Goodreads', ...shelves.filter((shelf) => !isGoodreadsStatusShelf(shelf))]),
        moodTags: [],
        notes: review,
        rawText: author ? `${title} - ${author}` : title,
        importNotes: uniqueValues([
          author ? `Autor: ${author}` : undefined,
          publisher ? `Editorial: ${publisher}` : undefined,
          year ? `Ano: ${year}` : undefined,
        ]),
        externalRefs: {
          goodreadsBookId: bookId,
          isbn,
          sourceUrl: bookId ? `https://www.goodreads.com/book/show/${bookId}` : undefined,
        },
        releaseYear: year,
      } satisfies ImportedLibraryItemDraft,
    ]
  })

  return { sourceId: 'goodreads', drafts, warnings }
}

export function parseLetterboxdZipBytes(bytes: Uint8Array): LibraryImportProviderResult {
  if (bytes.byteLength > letterboxdMaxZipBytes) {
    throw new Error('El ZIP de Letterboxd supera el limite de 10 MB.')
  }

  let selectedCsvBytes = 0
  const files = unzipSync(bytes, {
    filter(file) {
      if (!readLetterboxdCsvSource(file.name.toLowerCase())) return false
      if (file.originalSize > letterboxdMaxCsvBytes) {
        throw new Error(`El CSV ${file.name} supera el limite de 4 MB.`)
      }
      selectedCsvBytes += file.originalSize
      if (selectedCsvBytes > letterboxdMaxTotalCsvBytes) {
        throw new Error('El ZIP de Letterboxd supera el limite total de CSV permitido.')
      }
      return true
    },
  })
  const warnings: ImportWarning[] = []
  const byKey = new Map<string, ImportedLibraryItemDraft>()
  let parsedFiles = 0
  let inflatedCsvBytes = 0
  const fileEntries = Object.entries(files)
    .flatMap(([path, fileBytes]) => {
      const source = readLetterboxdCsvSource(path.toLowerCase())
      return source ? [{ fileBytes, path, source }] : []
    })
    .sort(
      (left, right) =>
        letterboxdCsvSourcePriority[left.source] - letterboxdCsvSourcePriority[right.source] ||
        left.path.localeCompare(right.path),
    )

  for (const { fileBytes, path, source } of fileEntries) {
    inflatedCsvBytes += fileBytes.byteLength
    if (fileBytes.byteLength > letterboxdMaxCsvBytes || inflatedCsvBytes > letterboxdMaxTotalCsvBytes) {
      throw new Error('El ZIP de Letterboxd contiene CSVs demasiado grandes para importar en navegador.')
    }

    parsedFiles += 1
    const csvText = strFromU8(fileBytes)
    const rows = parseCsv(csvText)
    for (const row of rows) {
      const draft = letterboxdRowToDraft(row, source)
      if (!draft) {
        const label = readRowValue(row, ['Name', 'Title']) ?? path
        warnings.push({
          code: 'invalid-entry',
          entryLabel: label,
          message: `Entrada de Letterboxd sin titulo reconocible en ${path}.`,
          sourceId: 'letterboxd',
        })
        continue
      }

      const key = draft.externalRefs?.letterboxdSlug
        ? `slug:${draft.externalRefs.letterboxdSlug}`
        : `title:${normalizeKey(draft.title)}:${draft.releaseYear ?? ''}`
      const existing = byKey.get(key)
      byKey.set(key, existing ? mergeLetterboxdDraft(existing, draft) : draft)
    }
  }

  if (!parsedFiles) {
    warnings.push({
      code: 'parse',
      message: 'No encontre watched.csv, ratings.csv, diary.csv, reviews.csv ni watchlist.csv en el ZIP oficial.',
      sourceId: 'letterboxd',
    })
  }

  return { sourceId: 'letterboxd', drafts: [...byKey.values()], warnings }
}

export function buildImportPreview(result: LibraryImportProviderResult, currentItems: ListItem[]): ImportPreview {
  const warnings: ImportWarning[] = [...result.warnings]
  const currentExternalIndex = buildExternalIndex(currentItems)
  const currentTitleIndex = buildTitleIndex(currentItems)
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  const items: ImportPreviewItem[] = []
  const usedPreviewIds = new Set<string>()
  const seenDraftIds = new Map<string, string>()
  const seenDraftExternalIndex = new Map<string, string>()
  const seenDraftTitleIndex = new Map<string, string>()

  for (const draft of result.drafts) {
    const validationWarning = validateDraft(draft)
    if (validationWarning) {
      warnings.push(validationWarning)
      continue
    }

    const duplicateByExternal = findExternalDuplicate(draft.externalRefs, currentExternalIndex)
    const duplicateByTitle = duplicateByExternal ? undefined : findTitleDuplicate(draft, currentTitleIndex)
    const baseId = createImportedItemId(draft)
    const duplicateById = duplicateByExternal || duplicateByTitle ? undefined : currentById.get(baseId)
    const previewId = ensureUniquePreviewId(baseId, usedPreviewIds)
    const draftExternalKeys = externalRefKeys(draft.externalRefs)
    const duplicateDraftExternalId = draftExternalKeys
      .map((key) => seenDraftExternalIndex.get(key))
      .find((id): id is string => Boolean(id))
    const draftTitleKey = titleDuplicateKey(draft.title, draft.type, draft.releaseYear)
    const duplicateDraftTitleId =
      duplicateByExternal || duplicateDraftExternalId ? undefined : seenDraftTitleIndex.get(draftTitleKey)
    const previousDraftId = seenDraftIds.get(baseId)
    const duplicateOfId =
      duplicateByExternal?.id ??
      duplicateDraftExternalId ??
      duplicateByTitle?.id ??
      duplicateDraftTitleId ??
      duplicateById?.id ??
      previousDraftId
    const duplicateReason = duplicateByExternal || duplicateDraftExternalId
      ? 'externalRefs'
      : duplicateByTitle || duplicateDraftTitleId || duplicateById || previousDraftId
        ? 'titleTypeYear'
        : undefined

    if (!seenDraftIds.has(baseId)) {
      seenDraftIds.set(baseId, previewId)
    }
    for (const key of draftExternalKeys) {
      if (!seenDraftExternalIndex.has(key)) {
        seenDraftExternalIndex.set(key, previewId)
      }
    }
    if (!seenDraftTitleIndex.has(draftTitleKey)) {
      seenDraftTitleIndex.set(draftTitleKey, previewId)
    }
    items.push({
      id: previewId,
      draft,
      duplicateOfId,
      duplicateReason,
    })

    if (duplicateOfId) {
      warnings.push({
        code: 'duplicate',
        entryLabel: draft.title,
        message: `${draft.title} parece duplicada; no se selecciona por defecto para proteger notas y progreso.`,
        sourceId: result.sourceId,
      })
    }
  }

  const newItems = items.filter((item) => !item.duplicateOfId).length
  const statusCounts = countBy(items.map((item) => item.draft.status))
  const typeCounts = countBy(items.map((item) => item.draft.type))
  const invalidItems = warnings.filter((warning) => warning.code === 'invalid-entry').length

  return {
    sourceId: result.sourceId,
    sourceLabel: importSourceLabels[result.sourceId],
    createdAt: nowIso(),
    totalEntries: items.length + invalidItems,
    newItems,
    duplicateItems: items.length - newItems,
    invalidItems,
    statusCounts,
    typeCounts,
    items,
    warnings,
  }
}

export function importPreviewItemsToListItems(items: ImportPreviewItem[], importedAt = nowIso()): ListItem[] {
  return items.map((item) => importedDraftToListItem(item.draft, importedAt))
}

export function getImportPreviewNewItems(preview: ImportPreview): ImportPreviewItem[] {
  return preview.items.filter((item) => !item.duplicateOfId)
}

function importedDraftToListItem(draft: ImportedLibraryItemDraft, importedAt: string): ListItem {
  const importNotes = uniqueValues([
    `Importado desde ${importSourceLabels[draft.sourceId]}`,
    draft.releaseYear ? `Ano: ${draft.releaseYear}` : undefined,
    ...(draft.importNotes ?? []),
  ])

  return {
    id: createImportedItemId(draft),
    title: draft.title.trim(),
    type: draft.type,
    status: draft.status,
    rating: draft.rating,
    progress: draft.progress,
    progressCurrent: draft.progressCurrent,
    progressTotal: draft.progressTotal,
    progressUnit: draft.progressUnit,
    genres: uniqueValues(draft.genres),
    tags: uniqueValues(draft.tags.length ? draft.tags : [importSourceLabels[draft.sourceId]]),
    moodTags: uniqueValues(draft.moodTags),
    weights: { ...DEFAULT_WEIGHTS },
    notes: draft.notes,
    source: 'external',
    rawText: draft.rawText,
    importNotes,
    externalRefs: compactRefs(draft.externalRefs),
    posterUrl: draft.posterUrl,
    createdAt: importedAt,
    updatedAt: importedAt,
  }
}

function createImportedItemId(draft: ImportedLibraryItemDraft) {
  const sourceKey = slugify(draft.sourceItemId) || slugify(draft.title) || 'item'
  return `${draft.type}-${slugify(draft.title)}-${draft.sourceId}-${sourceKey}`.slice(0, 120)
}

async function fetchAniListCollection(
  username: string,
  mediaType: 'ANIME' | 'MANGA',
): Promise<Pick<LibraryImportProviderResult, 'drafts' | 'warnings'>> {
  const query = `
    query NexoImportAniList($userName: String, $type: MediaType) {
      MediaListCollection(userName: $userName, type: $type) {
        lists {
          entries {
            status
            score
            progress
            notes
            media {
              id
              idMal
              type
              format
              countryOfOrigin
              siteUrl
              episodes
              chapters
              volumes
              title {
                romaji
                english
                native
                userPreferred
              }
              startDate {
                year
              }
              coverImage {
                large
              }
              genres
            }
          }
        }
      }
    }
  `

  const response = await fetch(anilistGraphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { userName: username, type: mediaType } }),
  })

  if (!response.ok) {
    throw new Error(`AniList no respondio correctamente (${response.status}).`)
  }

  const body = (await response.json()) as UnknownRecord
  const errors = Array.isArray(body.errors) ? body.errors : []
  if (errors.length) {
    throw new Error(readGraphqlError(errors[0]) ?? 'AniList no pudo leer ese perfil publico.')
  }

  const collection = asRecord(asRecord(body.data)?.MediaListCollection)
  const lists = Array.isArray(collection?.lists) ? collection.lists : []
  const warnings: ImportWarning[] = []
  const drafts = lists.flatMap((list) => {
    const listRecord = asRecord(list)
    const entries = Array.isArray(listRecord?.entries) ? listRecord.entries : []
    return entries.flatMap((entry) => {
      const draft = anilistEntryToDraft(asRecord(entry))
      if (draft) return [draft]
      warnings.push({
        code: 'invalid-entry',
        message: `AniList devolvio una entrada ${mediaType} sin titulo o tipo compatible.`,
        sourceId: 'anilist',
      })
      return []
    })
  })

  return { drafts, warnings }
}

function anilistEntryToDraft(entry?: UnknownRecord): ImportedLibraryItemDraft | undefined {
  const media = asRecord(entry?.media)
  const titleRecord = asRecord(media?.title)
  const title = firstString(titleRecord?.userPreferred, titleRecord?.english, titleRecord?.romaji, titleRecord?.native)
  const sourceItemId = readString(media?.id)
  const type = anilistMediaTypeToItemType(readString(media?.type), readString(media?.countryOfOrigin))

  if (!title || !sourceItemId || !type) return undefined

  const malId = readString(media?.idMal)
  const format = readString(media?.format)
  const releaseYear = readNumber(asRecord(media?.startDate)?.year)
  const progressMeta = anilistProgressMeta(entry?.progress, media, type)

  return {
    sourceId: 'anilist',
    sourceItemId,
    title,
    type,
    status: anilistStatusToItemStatus(readString(entry?.status)),
    rating: normalizeTenPointRating(readNumber(entry?.score), 100),
    progress: readProgress(entry?.progress, type),
    progressCurrent: progressMeta?.current,
    progressTotal: progressMeta?.total,
    progressUnit: progressMeta?.unit,
    genres: stringList(media?.genres),
    tags: uniqueValues(['AniList', format, type]),
    moodTags: [],
    notes: readString(entry?.notes),
    importNotes: malId ? [`MAL: ${malId}`] : undefined,
    externalRefs: {
      anilistId: sourceItemId,
      malId,
      sourceUrl: readString(media?.siteUrl),
    },
    posterUrl: readString(asRecord(media?.coverImage)?.large),
    releaseYear,
  }
}

async function fetchJikanList(
  username: string,
  listKind: 'animelist' | 'mangalist',
): Promise<Pick<LibraryImportProviderResult, 'drafts' | 'warnings'>> {
  const drafts: ImportedLibraryItemDraft[] = []
  const warnings: ImportWarning[] = []

  for (let page = 1; page <= maxJikanPages; page += 1) {
    const url = `${jikanBaseUrl}/users/${encodeURIComponent(username)}/${listKind}?page=${page}&limit=25`
    const response = await fetch(url)
    if (!response.ok) {
      warnings.push({
        code: page === 1 ? 'network' : 'partial',
        message:
          page === 1
            ? `Jikan no pudo leer ${listKind} para ese perfil (${response.status}).`
            : `Jikan corto ${listKind} en la pagina ${page}; se usara lo recuperado.`,
        sourceId: 'myanimelist',
      })
      break
    }

    const body = (await response.json()) as UnknownRecord
    const data = Array.isArray(body.data) ? body.data : []
    for (const entry of data) {
      const draft = jikanEntryToDraft(asRecord(entry), listKind)
      if (draft) {
        drafts.push(draft)
      } else {
        warnings.push({
          code: 'invalid-entry',
          message: `Jikan devolvio una entrada sin titulo o tipo valido en ${listKind}.`,
          sourceId: 'myanimelist',
        })
      }
    }

    const pagination = asRecord(body.pagination)
    if (page === maxJikanPages && pagination?.has_next_page === true) {
      warnings.push({
        code: 'partial',
        message: `Jikan tiene mas de ${maxJikanPages} paginas en ${listKind}; se importaron solo las primeras ${maxJikanPages}.`,
        sourceId: 'myanimelist',
      })
      break
    }
    if (pagination?.has_next_page !== true) break
  }

  return { drafts, warnings }
}

function jikanEntryToDraft(entry: UnknownRecord | undefined, listKind: 'animelist' | 'mangalist'): ImportedLibraryItemDraft | undefined {
  const media = asRecord(entry?.[listKind === 'animelist' ? 'anime' : 'manga'])
  const title = firstString(media?.title, media?.title_english, media?.title_japanese)
  const malId = readString(media?.mal_id)
  const type = listKind === 'animelist' ? 'anime' : jikanMangaTypeToItemType(readString(media?.type))

  if (!title || !malId || !type) return undefined

  const genres = readJikanNamedList(media?.genres)
  const themes = readJikanNamedList(media?.themes)
  const demographics = readJikanNamedList(media?.demographics)
  const published = asRecord(media?.published)
  const progressMeta = jikanStructuredProgress(entry, media, listKind)

  return {
    sourceId: 'myanimelist',
    sourceItemId: malId,
    title,
    type,
    status: malStatusToItemStatus(readString(entry?.status), listKind),
    rating: normalizeTenPointRating(readNumber(entry?.score), 10),
    progress: jikanProgress(entry, media, listKind),
    progressCurrent: progressMeta?.current,
    progressTotal: progressMeta?.total,
    progressUnit: progressMeta?.unit,
    genres: uniqueValues([...genres, ...demographics]),
    tags: uniqueValues(['MyAnimeList', ...themes, type]),
    moodTags: [],
    importNotes: ['Importacion experimental via Jikan'],
    externalRefs: {
      malId,
      sourceUrl: readString(media?.url),
    },
    posterUrl: readString(asRecord(asRecord(media?.images)?.jpg)?.image_url),
    releaseYear: readNumber(media?.year) ?? parseYear(readString(published?.from)),
  }
}

function letterboxdRowToDraft(row: CsvRow, source: LetterboxdCsvSource): ImportedLibraryItemDraft | undefined {
  const title = readRowValue(row, ['Name', 'Title'])
  if (!title) return undefined

  const year = parseYear(readRowValue(row, ['Year']))
  const url = readRowValue(row, ['Letterboxd URI', 'Letterboxd URL', 'URL'])
  const slug = letterboxdSlugFromUrl(url)
  const rating = parseLetterboxdRating(readRowValue(row, ['Rating']))
  const tags = splitCsvList(readRowValue(row, ['Tags']))
  const review = readRowValue(row, ['Review'])
  const watchedDate = readRowValue(row, ['Watched Date', 'Date'])
  const sourceItemId = slug || `${slugify(title)}-${year ?? 'unknown'}`

  return {
    sourceId: 'letterboxd',
    sourceItemId,
    title,
    type: 'movie',
    status: source === 'watchlist' ? 'wishlist' : 'completed',
    rating,
    progress: watchedDate && source !== 'watchlist' ? `Vista el ${watchedDate}` : undefined,
    genres: [],
    tags: uniqueValues(['Letterboxd', ...tags]),
    moodTags: [],
    notes: review,
    importNotes: year ? [`Ano: ${year}`] : undefined,
    externalRefs: {
      letterboxdSlug: slug,
      sourceUrl: url,
    },
    releaseYear: year,
  }
}

type LetterboxdCsvSource = 'diary' | 'ratings' | 'reviews' | 'watched' | 'watchlist'

function readLetterboxdCsvSource(path: string): LetterboxdCsvSource | undefined {
  const fileName = path.split(/[\\/]/).pop()
  if (fileName === 'diary.csv') return 'diary'
  if (fileName === 'ratings.csv') return 'ratings'
  if (fileName === 'reviews.csv') return 'reviews'
  if (fileName === 'watched.csv') return 'watched'
  if (fileName === 'watchlist.csv') return 'watchlist'
  return undefined
}

function mergeLetterboxdDraft(left: ImportedLibraryItemDraft, right: ImportedLibraryItemDraft): ImportedLibraryItemDraft {
  const completed = left.status === 'completed' || right.status === 'completed'
  return {
    ...left,
    status: completed ? 'completed' : left.status,
    rating: left.rating ?? right.rating,
    progress: left.progress ?? right.progress,
    tags: uniqueValues([...left.tags, ...right.tags]),
    notes: left.notes ?? right.notes,
    importNotes: uniqueValues([...(left.importNotes ?? []), ...(right.importNotes ?? [])]),
    externalRefs: compactRefs({ ...right.externalRefs, ...left.externalRefs }),
    releaseYear: left.releaseYear ?? right.releaseYear,
  }
}

function readPublicProfileUsername(input: string, sourceId: ImportSourceId) {
  const value = input.trim()
  if (!value) throw new Error(`Escribe un usuario o URL publica de ${importSourceLabels[sourceId]}.`)

  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (sourceId === 'anilist') {
      const userIndex = parts.findIndex((part) => normalizeKey(part) === 'user')
      const username = decodeURIComponent(parts[userIndex >= 0 ? userIndex + 1 : 0] ?? '').trim()
      if (username) return username
    }
    if (sourceId === 'myanimelist') {
      const profileIndex = parts.findIndex((part) => ['profile', 'animelist', 'mangalist'].includes(normalizeKey(part)))
      const username = decodeURIComponent(parts[profileIndex >= 0 ? profileIndex + 1 : 0] ?? '').trim()
      if (username) return username
    }
  } catch {
    const username = value.replace(/^@/, '')
    if (username) return username
  }

  throw new Error(`No encontre usuario en esa URL de ${importSourceLabels[sourceId]}.`)
}

function parseCsv(csvText: string): CsvRow[] {
  const result = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })

  if (result.errors.length) {
    const firstError = result.errors[0]
    throw new Error(`No se pudo leer el CSV: ${firstError.message}`)
  }

  return result.data
}

function buildExternalIndex(items: ListItem[]) {
  const index = new Map<string, ListItem>()
  for (const item of items) {
    for (const key of externalRefKeys(item.externalRefs)) {
      index.set(key, item)
    }
  }
  return index
}

function buildTitleIndex(items: ListItem[]) {
  const index = new Map<string, ListItem>()
  for (const item of items) {
    const year = item.publicSnapshot?.releaseYear
    index.set(titleDuplicateKey(item.title, item.type, year), item)
  }
  return index
}

function findExternalDuplicate(refs: ExternalRefs | undefined, index: Map<string, ListItem>) {
  for (const key of externalRefKeys(refs)) {
    const item = index.get(key)
    if (item) return item
  }
  return undefined
}

function findTitleDuplicate(draft: ImportedLibraryItemDraft, index: Map<string, ListItem>) {
  const exactMatch = index.get(titleDuplicateKey(draft.title, draft.type, draft.releaseYear))
  if (exactMatch || draft.releaseYear === undefined) return exactMatch
  return index.get(titleDuplicateKey(draft.title, draft.type))
}

function externalRefKeys(refs: ExternalRefs | undefined) {
  if (!refs) return []

  return externalDuplicateKeys.flatMap((key) => {
    const value = refs[key]
    const normalizedValue = normalizeExternalRefIdentity(key, value)
    return normalizedValue ? [`${key}:${normalizedValue}`] : []
  })
}

function normalizeExternalRefIdentity(key: keyof ExternalRefs, value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return ''
  return key === 'isbn' ? normalized.replace(/[^0-9x]/g, '') : normalized
}

function titleDuplicateKey(title: string, type: ItemType, year?: number) {
  return `${type}:${normalizeKey(title)}:${year ?? 'unknown'}`
}

function ensureUniquePreviewId(baseId: string, usedIds: Set<string>) {
  let id = baseId.slice(0, 120)
  let suffix = 2
  while (usedIds.has(id)) {
    const suffixText = `-${suffix}`
    id = `${baseId.slice(0, Math.max(1, 120 - suffixText.length))}${suffixText}`
    suffix += 1
  }
  usedIds.add(id)
  return id
}

function validateDraft(draft: ImportedLibraryItemDraft): ImportWarning | undefined {
  if (!draft.title.trim()) {
    return {
      code: 'invalid-entry',
      message: 'Entrada importada sin titulo.',
      sourceId: draft.sourceId,
    }
  }
  if (!ITEM_TYPES.includes(draft.type) || !ITEM_STATUSES.includes(draft.status)) {
    return {
      code: 'invalid-entry',
      entryLabel: draft.title,
      message: `${draft.title} no tiene tipo o estado valido para Nexo.`,
      sourceId: draft.sourceId,
    }
  }
  return undefined
}

function countBy<Value extends string>(values: Value[]) {
  return values.reduce<Partial<Record<Value, number>>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1
    return counts
  }, {})
}

function anilistMediaTypeToItemType(type: string | undefined, countryOfOrigin: string | undefined): ItemType | undefined {
  if (type === 'ANIME') return 'anime'
  if (type === 'MANGA') return countryOfOrigin === 'KR' ? 'manhwa' : 'manga'
  return undefined
}

function anilistStatusToItemStatus(status: string | undefined): ItemStatus {
  if (status === 'CURRENT' || status === 'REPEATING') return 'in_progress'
  if (status === 'COMPLETED') return 'completed'
  if (status === 'PAUSED') return 'paused'
  if (status === 'DROPPED') return 'dropped'
  return 'wishlist'
}

function malStatusToItemStatus(status: string | undefined, listKind: 'animelist' | 'mangalist'): ItemStatus {
  const key = normalizeKey(status ?? '')
  if (key.includes('completed')) return 'completed'
  if (key.includes('hold')) return 'paused'
  if (key.includes('dropped')) return 'dropped'
  if (key.includes('watching') || key.includes('reading')) return 'in_progress'
  if (key.includes(listKind === 'animelist' ? 'plan to watch' : 'plan to read')) return 'wishlist'
  return 'wishlist'
}

function goodreadsShelfToStatus(shelf: string | undefined): ItemStatus {
  const key = normalizeKey(shelf ?? '')
  if (key === 'read') return 'completed'
  if (key === 'currently reading' || key === 'currently-reading') return 'in_progress'
  if (key.includes('abandoned') || key.includes('dnf') || key.includes('dropped')) return 'dropped'
  return 'wishlist'
}

function isGoodreadsStatusShelf(shelf: string) {
  const key = normalizeKey(shelf)
  return key === 'read' || key === 'currently reading' || key === 'currently-reading' || key === 'to read' || key === 'to-read'
}

function jikanMangaTypeToItemType(type: string | undefined): ItemType {
  return normalizeKey(type ?? '') === 'manhwa' ? 'manhwa' : 'manga'
}

function jikanProgress(entry: UnknownRecord | undefined, media: UnknownRecord | undefined, listKind: 'animelist' | 'mangalist') {
  const current = readNumber(entry?.episodes_watched) ?? readNumber(entry?.chapters_read) ?? readNumber(entry?.volumes_read)
  const total = readNumber(media?.episodes) ?? readNumber(media?.chapters) ?? readNumber(media?.volumes)
  if (!current) return undefined

  const unit = listKind === 'animelist' ? 'episodios' : 'capitulos'
  return total ? `${current}/${total} ${unit}` : `${current} ${unit}`
}

function jikanStructuredProgress(entry: UnknownRecord | undefined, media: UnknownRecord | undefined, listKind: 'animelist' | 'mangalist') {
  const current = readNumber(entry?.episodes_watched) ?? readNumber(entry?.chapters_read) ?? readNumber(entry?.volumes_read)
  const unit: ProgressUnit = listKind === 'animelist' ? 'episodes' : readNumber(entry?.volumes_read) && !readNumber(entry?.chapters_read) ? 'volumes' : 'chapters'
  const total = unit === 'episodes'
    ? readNumber(media?.episodes)
    : unit === 'volumes'
      ? readNumber(media?.volumes)
      : readNumber(media?.chapters) ?? readNumber(media?.volumes)

  if (!current && !total) return undefined
  return { current, total, unit }
}

function readProgress(value: unknown, type: ItemType) {
  const progress = readNumber(value)
  if (!progress) return undefined
  const unit = type === 'anime' ? 'episodios' : 'capitulos'
  return `${progress} ${unit}`
}

function anilistProgressMeta(value: unknown, media: UnknownRecord | undefined, type: ItemType) {
  const current = readNumber(value)
  const unit: ProgressUnit =
    type === 'anime'
      ? 'episodes'
      : readNumber(media?.volumes) && !readNumber(media?.chapters)
        ? 'volumes'
        : 'chapters'
  const total = unit === 'episodes'
    ? readNumber(media?.episodes)
    : unit === 'volumes'
      ? readNumber(media?.volumes)
      : readNumber(media?.chapters) ?? readNumber(media?.volumes)

  if (!current && !total) return undefined
  return { current, total, unit }
}

function readJikanNamedList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const name = readString(asRecord(entry)?.name)
    return name ? [name] : []
  })
}

function readGraphqlError(error: unknown) {
  return readString(asRecord(error)?.message)
}

function normalizeTenPointRating(value: number | undefined, scale: 10 | 100) {
  if (typeof value !== 'number' || value <= 0) return undefined
  const normalized = scale === 100 ? value / 10 : value
  return Math.max(0, Math.min(10, Math.round(normalized * 10) / 10))
}

function parseGoodreadsRating(value: string | undefined) {
  const parsed = parseNumber(value)
  if (!parsed || parsed <= 0) return undefined
  return Math.max(0, Math.min(10, parsed * 2))
}

function parseLetterboxdRating(value: string | undefined) {
  const parsed = parseNumber(value)
  if (!parsed || parsed <= 0) return undefined
  return Math.max(0, Math.min(10, parsed * 2))
}

function parseYear(value: string | undefined) {
  if (!value) return undefined
  const match = value.match(/\b(18|19|20)\d{2}\b/)
  if (!match) return undefined
  const year = Number(match[0])
  return Number.isFinite(year) ? year : undefined
}

function parseNumber(value: string | undefined) {
  if (!value) return undefined
  const normalized = value.replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') return parseNumber(value)
  return undefined
}

function cleanIsbn(value: string | undefined) {
  if (!value) return undefined
  const cleaned = value.replace(/[="']/g, '').replace(/\s+/g, '').trim()
  return cleaned || undefined
}

function splitCsvList(value: string | undefined) {
  if (!value) return []
  return uniqueValues(value.split(',').map((entry) => entry.trim()).filter(Boolean))
}

function readRowValue(row: CsvRow, fields: string[]) {
  for (const field of fields) {
    const value = row[field]?.trim()
    if (value) return value
  }
  return undefined
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = readString(value)
    if (text) return text
  }
  return undefined
}

function readString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return uniqueValues(value.flatMap((entry) => (typeof entry === 'string' && entry.trim() ? [entry.trim()] : [])))
}

function asRecord(value: unknown): UnknownRecord | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as UnknownRecord
  return undefined
}

function compactRefs(refs: ExternalRefs | undefined): ExternalRefs | undefined {
  if (!refs) return undefined
  return Object.fromEntries(Object.entries(refs).filter(([, value]) => Boolean(value))) as ExternalRefs
}

function letterboxdSlugFromUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    const filmIndex = parts.findIndex((part) => normalizeKey(part) === 'film')
    return parts[filmIndex >= 0 ? filmIndex + 1 : parts.length - 1]
  } catch {
    const match = value.match(/\/film\/([^/]+)/)
    return match?.[1]
  }
}
