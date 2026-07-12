export const SEARCH_TYPES = [
  'watch',
  'game',
  'book',
  'movie',
  'series',
  'anime',
  'manga',
  'manhwa',
  'comic',
  'other',
  'animeManga',
  'any',
] as const

export type SearchType = (typeof SEARCH_TYPES)[number]

export const CATALOG_ITEM_TYPES = [
  'game',
  'book',
  'movie',
  'series',
  'anime',
  'manga',
  'manhwa',
  'comic',
  'other',
] as const

export type CatalogItemType = (typeof CATALOG_ITEM_TYPES)[number]

export const CATALOG_PROGRESS_UNITS = [
  'episodes',
  'chapters',
  'pages',
  'hours',
  'volumes',
  'percent',
  'items',
] as const

export type CatalogProgressUnit = (typeof CATALOG_PROGRESS_UNITS)[number]

const EXTERNAL_REF_LIMITS = {
  tmdbId: 120,
  rawgId: 120,
  openLibraryKey: 120,
  googleBooksId: 120,
  anilistId: 120,
  mangaDexId: 120,
  kitsuId: 120,
  malId: 120,
  goodreadsBookId: 120,
  isbn: 120,
  letterboxdSlug: 120,
  wikidataId: 120,
  sourceUrl: 2_000,
} as const

export interface CatalogDemandItem {
  id: string
  title: string
  type: CatalogItemType
  description?: string
  releaseYear?: number
  progressTotal?: number
  progressUnit?: CatalogProgressUnit
  genres: string[]
  tags: string[]
  moodTags: string[]
  searchAliases: string[]
  externalRefs: Partial<Record<keyof typeof EXTERNAL_REF_LIMITS, string>>
  posterUrl?: string
}

export interface CatalogSearchInput {
  query: string
  type: SearchType
  limit: number
}

export interface CatalogSearchDefaults {
  defaultLimit: number
  maxLimit?: number
  minQueryLength?: number
}

export class CatalogInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogInputError'
  }
}

export function parseCatalogSearchInput(
  value: { query?: unknown; q?: unknown; type?: unknown; limit?: unknown } | undefined,
  defaults: CatalogSearchDefaults,
): CatalogSearchInput {
  const rawQuery = value?.query ?? value?.q ?? ''
  if (typeof rawQuery !== 'string') {
    throw new CatalogInputError('La busqueda debe ser texto.')
  }
  const query = rawQuery.trim()
  if (query.length > 120) {
    throw new CatalogInputError('La busqueda no puede superar 120 caracteres.')
  }

  const minimum = defaults.minQueryLength ?? 0
  if (minimum > 0 && query.length < minimum) {
    throw new CatalogInputError(`La busqueda necesita al menos ${minimum} caracteres.`)
  }

  const rawType = value?.type ?? 'any'
  if (typeof rawType !== 'string') {
    throw new CatalogInputError('El tipo de busqueda no es valido.')
  }
  if (!isSearchType(rawType)) {
    throw new CatalogInputError('El tipo de busqueda no es valido.')
  }

  const maxLimit = defaults.maxLimit ?? 48
  const rawLimit = value?.limit ?? defaults.defaultLimit
  const limit = typeof rawLimit === 'string' && rawLimit.trim() !== '' ? Number(rawLimit) : rawLimit
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new CatalogInputError(`El limite debe ser un entero entre 1 y ${maxLimit}.`)
  }

  return { query, type: rawType, limit }
}

export function isSearchType(value: string): value is SearchType {
  return SEARCH_TYPES.includes(value as SearchType)
}

export function createCatalogQueryPlan(queryKey: string, tokens: string[], itemTypes: string[]) {
  return {
    canonicalKeys: [...new Set(itemTypes.map((itemType) => `${itemType}:${queryKey}`))].slice(0, 10),
    tokens: [...new Set(tokens)].slice(0, 10),
  }
}

export function createCatalogSearchMetric(type: SearchType, resultCount: number, now = new Date()) {
  const date = now.toISOString().slice(0, 10)
  return {
    id: `${date}-${type}`,
    data: {
      date,
      type,
      count: 1,
      resultCount: Math.max(0, Math.trunc(resultCount)),
      zeroResultCount: resultCount > 0 ? 0 : 1,
      updatedAt: now.toISOString(),
    },
  }
}

export function parseCatalogDemandItems(value: unknown): CatalogDemandItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new CatalogInputError('Debes enviar entre 1 y 100 entradas de catalogo.')
  }

  const byId = new Map<string, CatalogDemandItem>()
  value.forEach((entry, index) => {
    const item = parseCatalogDemandItem(entry, index)
    if (!byId.has(item.id)) byId.set(item.id, item)
  })
  return [...byId.values()]
}

function parseCatalogDemandItem(value: unknown, index: number): CatalogDemandItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogInputError(`items[${index}] debe ser un objeto.`)
  }
  const input = value as Record<string, unknown>
  const id = readRequiredString(input.id, `items[${index}].id`, 120)
  if (id.includes('/')) throw new CatalogInputError(`items[${index}].id no puede contener barras.`)

  const title = readRequiredString(input.title, `items[${index}].title`, 200)
  if (typeof input.type !== 'string' || !CATALOG_ITEM_TYPES.includes(input.type as CatalogItemType)) {
    throw new CatalogInputError(`items[${index}].type no es valido.`)
  }

  const description = readOptionalString(input.description ?? input.overview, `items[${index}].description`, 20_000)
  const posterUrl = readOptionalString(input.posterUrl, `items[${index}].posterUrl`, 2_000)
  const releaseYear = readOptionalFiniteNumber(input.releaseYear, `items[${index}].releaseYear`)
  if (releaseYear !== undefined && (!Number.isInteger(releaseYear) || releaseYear < 0 || releaseYear > 9_999)) {
    throw new CatalogInputError(`items[${index}].releaseYear no es valido.`)
  }
  const progressTotal = readOptionalFiniteNumber(input.progressTotal, `items[${index}].progressTotal`)
  if (progressTotal !== undefined && progressTotal < 0) {
    throw new CatalogInputError(`items[${index}].progressTotal no es valido.`)
  }
  const progressUnit = input.progressUnit === undefined
    ? undefined
    : CATALOG_PROGRESS_UNITS.includes(input.progressUnit as CatalogProgressUnit)
      ? input.progressUnit as CatalogProgressUnit
      : undefined
  if (input.progressUnit !== undefined && progressUnit === undefined) {
    throw new CatalogInputError(`items[${index}].progressUnit no es valido.`)
  }

  return {
    id,
    title,
    type: input.type as CatalogItemType,
    description,
    releaseYear,
    progressTotal,
    progressUnit,
    genres: readStringList(input.genres, `items[${index}].genres`),
    tags: readStringList(input.tags, `items[${index}].tags`),
    moodTags: readStringList(input.moodTags, `items[${index}].moodTags`),
    searchAliases: readStringList(input.searchAliases, `items[${index}].searchAliases`),
    externalRefs: readExternalRefs(input.externalRefs, `items[${index}].externalRefs`),
    posterUrl,
  }
}

function readRequiredString(value: unknown, path: string, maximum: number) {
  const text = readOptionalString(value, path, maximum)
  if (!text) throw new CatalogInputError(`${path} es obligatorio.`)
  return text
}

function readOptionalString(value: unknown, path: string, maximum: number) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new CatalogInputError(`${path} debe ser texto.`)
  const text = value.trim()
  if (!text) return undefined
  if (text.length > maximum) throw new CatalogInputError(`${path} supera ${maximum} caracteres.`)
  return text
}

function readOptionalFiniteNumber(value: unknown, path: string) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CatalogInputError(`${path} debe ser un numero finito.`)
  }
  return value
}

function readStringList(value: unknown, path: string) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 64) {
    throw new CatalogInputError(`${path} debe ser una lista de hasta 64 textos.`)
  }
  const strings = value.map((entry, index) => readRequiredString(entry, `${path}[${index}]`, 200))
  return [...new Set(strings)]
}

function readExternalRefs(value: unknown, path: string): CatalogDemandItem['externalRefs'] {
  if (value === undefined || value === null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogInputError(`${path} debe ser un objeto.`)
  }
  const refs = value as Record<string, unknown>
  const unknownKeys = Object.keys(refs).filter((key) => !(key in EXTERNAL_REF_LIMITS))
  if (unknownKeys.length) throw new CatalogInputError(`${path} contiene claves no permitidas.`)

  return Object.fromEntries(
    Object.entries(refs).flatMap(([key, entry]) => {
      const maximum = EXTERNAL_REF_LIMITS[key as keyof typeof EXTERNAL_REF_LIMITS]
      const text = readOptionalString(entry, `${path}.${key}`, maximum)
      return text ? [[key, text]] : []
    }),
  )
}
