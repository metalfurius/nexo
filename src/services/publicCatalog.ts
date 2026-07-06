import { ITEM_TYPES, PROGRESS_UNITS, type ItemType, type ProgressUnit, type PublicCatalogItem } from '../domain/types'

const defaultPublicCatalogLimit = 24
const maxPublicCatalogLimit = 100

export async function fetchPublicCatalog(query = '', type = 'any', limit = 24): Promise<PublicCatalogItem[] | undefined> {
  const endpoint = String(import.meta.env.VITE_PUBLIC_CATALOG_URL ?? '').trim()
  if (!endpoint) return undefined

  const url = new URL(endpoint)
  if (query.trim()) url.searchParams.set('q', query.trim())
  if (type) url.searchParams.set('type', type)
  url.searchParams.set('limit', String(normalizePublicCatalogLimit(limit)))

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return undefined

  const payload = (await response.json()) as { items?: unknown }
  if (!Array.isArray(payload.items)) return undefined

  return normalizePublicCatalogItems(payload.items)
}

export function normalizePublicCatalogItems(value: unknown): PublicCatalogItem[] {
  return Array.isArray(value) ? value.flatMap(normalizePublicCatalogItem) : []
}

function normalizePublicCatalogItem(value: unknown): PublicCatalogItem[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const item = value as Partial<PublicCatalogItem>
  const type = normalizeItemType(item.type)
  const id = optionalString(item.id)
  const title = optionalString(item.title)
  if (!id || !title || !type) return []

  const timestamp = new Date().toISOString()

  return [
    {
      id,
      title,
      type,
      description: optionalString(item.description),
      releaseYear: finiteNumber(item.releaseYear),
      progressTotal: positiveNumber(item.progressTotal),
      progressUnit: normalizeProgressUnit(item.progressUnit),
      genres: normalizeCatalogStringList(item.genres),
      tags: normalizeCatalogStringList(item.tags),
      moodTags: normalizeCatalogStringList(item.moodTags),
      searchAliases: normalizeCatalogStringList(item.searchAliases),
      externalRefs: readExternalRefs(item.externalRefs),
      posterUrl: optionalString(item.posterUrl),
      searchTokens: normalizeCatalogStringList(item.searchTokens),
      canonicalKey: optionalString(item.canonicalKey) ?? `${type}:${String(item.title).toLowerCase()}`,
      createdAt: optionalString(item.createdAt) ?? timestamp,
      updatedAt: optionalString(item.updatedAt) ?? timestamp,
      createdBy: optionalString(item.createdBy) ?? 'public-catalog',
      updatedBy: optionalString(item.updatedBy) ?? 'public-catalog',
      archivedAt: optionalString(item.archivedAt),
      autoIngestedAt: optionalString(item.autoIngestedAt),
      demandCount: nonNegativeNumber(item.demandCount),
      lastDemandAt: optionalString(item.lastDemandAt),
    },
  ]
}

function normalizeItemType(type: unknown): ItemType | undefined {
  return ITEM_TYPES.includes(type as ItemType) ? (type as ItemType) : undefined
}

function normalizeProgressUnit(unit: unknown): ProgressUnit | undefined {
  return PROGRESS_UNITS.includes(unit as ProgressUnit) ? (unit as ProgressUnit) : undefined
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value)
  return number !== undefined && number > 0 ? number : undefined
}

function nonNegativeNumber(value: unknown) {
  const number = finiteNumber(value)
  return number !== undefined && number >= 0 ? number : undefined
}

function normalizePublicCatalogLimit(value: number) {
  if (!Number.isFinite(value)) return defaultPublicCatalogLimit
  return Math.min(maxPublicCatalogLimit, Math.max(1, Math.trunc(value)))
}

function readExternalRefs(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, String(entry ?? '').trim()])
      .filter(([, entry]) => entry),
  )
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

export function normalizeCatalogStringList(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const text = entry.trim()
      return text ? [text] : []
    }
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      return [String(entry)]
    }
    return []
  })
}
