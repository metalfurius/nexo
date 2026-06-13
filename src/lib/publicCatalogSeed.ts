import { ITEM_TYPES, type ExternalRefs, type ItemType, type PublicCatalogItem } from '../domain/types'
import { buildPublicCatalogItem, createCanonicalKey } from './catalog'
import { uniqueValues } from './strings'

export interface PublicCatalogSeedFile {
  generatedAt?: string
  sourceName?: string
  license?: string
  notes?: string[]
  items: PublicCatalogSeedEntry[]
}

export interface PublicCatalogSeedEntry {
  id?: string
  title: string
  type: ItemType
  description?: string
  releaseYear?: number
  genres?: string[]
  tags?: string[]
  moodTags?: string[]
  externalRefs?: ExternalRefs
  posterUrl?: string
  archivedAt?: string
}

export interface PublicCatalogSeedResult {
  items: PublicCatalogItem[]
  errors: string[]
}

export interface PublicCatalogSeedSummary {
  totalItems: number
  newItems: number
  updatedItems: number
}

export interface PublicCatalogSeedRollbackPlan {
  newItemIds: string[]
  previousItems: PublicCatalogItem[]
}

export function createPublicCatalogSeedTemplate(): PublicCatalogSeedFile {
  return {
    sourceName: 'Nexo curated batch',
    license: 'Describe aqui la fuente/licencia revisada antes de importar.',
    notes: [
      'Edita items y elimina los ejemplos que no quieras importar.',
      'El importador rechaza tipos desconocidos y duplicados por type:title.',
    ],
    items: [
      {
        title: 'Moon',
        type: 'movie',
        description: 'Ciencia ficcion contenida y solitaria.',
        releaseYear: 2009,
        genres: ['Ciencia ficcion', 'Drama'],
        tags: ['culto', 'introspectivo'],
        moodTags: ['melancolico'],
        externalRefs: {
          sourceUrl: 'https://www.wikidata.org/w/index.php?search=Moon+2009+film',
        },
      },
      {
        title: 'Outer Wilds',
        type: 'game',
        description: 'Exploracion espacial de misterio, tiempo y descubrimiento.',
        releaseYear: 2019,
        genres: ['Exploracion', 'Misterio'],
        tags: ['indie', 'sin spoilers'],
        moodTags: ['sorpresa'],
        externalRefs: {
          sourceUrl: 'https://www.wikidata.org/w/index.php?search=Outer+Wilds',
        },
      },
    ],
  }
}

export function parsePublicCatalogSeed(value: unknown, actorId: string): PublicCatalogSeedResult {
  const errors: string[] = []
  if (!isRecord(value)) {
    return { items: [], errors: ['Seed must be a JSON object.'] }
  }

  if (!Array.isArray(value.items)) {
    return { items: [], errors: ['Seed must contain an items array.'] }
  }

  const seenCanonicalKeys = new Set<string>()
  const items: PublicCatalogItem[] = []

  value.items.forEach((entry, index) => {
    const normalized = normalizeSeedEntry(entry, index, errors)
    if (!normalized) return

    const canonicalKey = createCanonicalKey(normalized.title, normalized.type)
    if (seenCanonicalKeys.has(canonicalKey)) {
      errors.push(`items[${index}] duplicates canonical key ${canonicalKey}.`)
      return
    }

    seenCanonicalKeys.add(canonicalKey)
    items.push(buildPublicCatalogItem(normalized, actorId))
  })

  return { items, errors }
}

export function getPublicCatalogSeedSummary(
  result: Pick<PublicCatalogSeedResult, 'items'>,
  currentItems: Pick<PublicCatalogItem, 'id'>[],
): PublicCatalogSeedSummary {
  const currentIds = new Set(currentItems.map((item) => item.id))
  let updatedItems = 0
  let newItems = 0

  for (const item of result.items) {
    if (currentIds.has(item.id)) {
      updatedItems += 1
    } else {
      newItems += 1
    }
  }

  return {
    totalItems: result.items.length,
    newItems,
    updatedItems,
  }
}

export function getPublicCatalogSeedRollbackPlan(
  result: Pick<PublicCatalogSeedResult, 'items'>,
  currentItems: PublicCatalogItem[],
): PublicCatalogSeedRollbackPlan {
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  const importedIds = uniqueValues(result.items.map((item) => item.id))

  return {
    newItemIds: importedIds.filter((id) => !currentById.has(id)),
    previousItems: importedIds.flatMap((id) => {
      const currentItem = currentById.get(id)
      return currentItem ? [clonePublicCatalogItem(currentItem)] : []
    }),
  }
}

function normalizeSeedEntry(value: unknown, index: number, errors: string[]): PublicCatalogSeedEntry | undefined {
  if (!isRecord(value)) {
    errors.push(`items[${index}] must be an object.`)
    return undefined
  }

  const title = readString(value.title)
  const type = readItemType(value.type)
  if (!title) errors.push(`items[${index}].title is required.`)
  if (!type) errors.push(`items[${index}].type must be one of: ${ITEM_TYPES.join(', ')}.`)
  if (!title || !type) return undefined

  const releaseYear = readOptionalNumber(value.releaseYear)
  if (value.releaseYear !== undefined && releaseYear === undefined) {
    errors.push(`items[${index}].releaseYear must be a number.`)
  }

  return {
    id: readString(value.id),
    title,
    type,
    description: readString(value.description),
    releaseYear,
    genres: readStringArray(value.genres, `items[${index}].genres`, errors),
    tags: readStringArray(value.tags, `items[${index}].tags`, errors),
    moodTags: readStringArray(value.moodTags, `items[${index}].moodTags`, errors),
    externalRefs: readExternalRefs(value.externalRefs, `items[${index}].externalRefs`, errors),
    posterUrl: readString(value.posterUrl),
    archivedAt: readString(value.archivedAt),
  }
}

function readExternalRefs(value: unknown, path: string, errors: string[]): ExternalRefs {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`)
    return {}
  }

  return {
    tmdbId: readString(value.tmdbId),
    rawgId: readString(value.rawgId),
    openLibraryKey: readString(value.openLibraryKey),
    anilistId: readString(value.anilistId),
    malId: readString(value.malId),
    wikidataId: readString(value.wikidataId),
    sourceUrl: readString(value.sourceUrl),
  }
}

function readStringArray(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`)
    return []
  }
  return value.map(String).map((entry) => entry.trim()).filter(Boolean)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readItemType(value: unknown): ItemType | undefined {
  return typeof value === 'string' && ITEM_TYPES.includes(value as ItemType) ? (value as ItemType) : undefined
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function clonePublicCatalogItem(item: PublicCatalogItem): PublicCatalogItem {
  return {
    ...item,
    externalRefs: { ...item.externalRefs },
    genres: [...item.genres],
    moodTags: [...item.moodTags],
    searchTokens: [...item.searchTokens],
    tags: [...item.tags],
  }
}
