import { ITEM_TYPES, PROGRESS_UNITS, type ItemType, type ProgressUnit, type PublicCatalogItem } from '../domain/types'

export async function fetchPublicCatalog(query = '', type = 'any', limit = 24): Promise<PublicCatalogItem[] | undefined> {
  const endpoint = String(import.meta.env.VITE_PUBLIC_CATALOG_URL ?? '').trim()
  if (!endpoint) return undefined

  const url = new URL(endpoint)
  if (query.trim()) url.searchParams.set('q', query.trim())
  if (type) url.searchParams.set('type', type)
  url.searchParams.set('limit', String(limit))

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
  if (!item.id || !item.title || !type) return []

  const timestamp = new Date().toISOString()

  return [
    {
      id: String(item.id),
      title: String(item.title),
      type,
      description: optionalString(item.description),
      releaseYear: typeof item.releaseYear === 'number' ? item.releaseYear : undefined,
      progressTotal: typeof item.progressTotal === 'number' ? item.progressTotal : undefined,
      progressUnit: normalizeProgressUnit(item.progressUnit),
      genres: Array.isArray(item.genres) ? item.genres.map(String).filter(Boolean) : [],
      tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [],
      moodTags: Array.isArray(item.moodTags) ? item.moodTags.map(String).filter(Boolean) : [],
      searchAliases: Array.isArray(item.searchAliases) ? item.searchAliases.map(String).filter(Boolean) : [],
      externalRefs: readExternalRefs(item.externalRefs),
      posterUrl: optionalString(item.posterUrl),
      searchTokens: Array.isArray(item.searchTokens) ? item.searchTokens.map(String).filter(Boolean) : [],
      canonicalKey: optionalString(item.canonicalKey) ?? `${type}:${String(item.title).toLowerCase()}`,
      createdAt: optionalString(item.createdAt) ?? timestamp,
      updatedAt: optionalString(item.updatedAt) ?? timestamp,
      createdBy: optionalString(item.createdBy) ?? 'public-catalog',
      updatedBy: optionalString(item.updatedBy) ?? 'public-catalog',
      archivedAt: optionalString(item.archivedAt),
      autoIngestedAt: optionalString(item.autoIngestedAt),
      demandCount: typeof item.demandCount === 'number' ? item.demandCount : undefined,
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
