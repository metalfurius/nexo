import type { ExternalRefs } from '../domain/types'

export interface ExternalRefEntry {
  label: string
  value: string
}

export const externalRefLabels: Record<keyof ExternalRefs, string> = {
  tmdbId: 'TMDB',
  rawgId: 'RAWG',
  openLibraryKey: 'Open Library',
  googleBooksId: 'Google Books',
  anilistId: 'AniList',
  mangaDexId: 'MangaDex',
  kitsuId: 'Kitsu',
  malId: 'MyAnimeList',
  goodreadsBookId: 'Goodreads',
  isbn: 'ISBN',
  letterboxdSlug: 'Letterboxd',
  wikidataId: 'Wikidata',
  sourceUrl: 'URL',
}

export function getExternalRefEntries(refs?: ExternalRefs): ExternalRefEntry[] {
  if (!isRecord(refs)) return []

  return Object.entries(refs as Record<string, unknown>).flatMap(([key, value]) => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text
      ? [
          {
            label: getExternalRefLabel(key),
            value: compactExternalRefValue(text),
          },
        ]
      : []
  })
}

export function compactExternalRefValue(value: string) {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getExternalRefLabel(key: string) {
  return externalRefLabels[key as keyof ExternalRefs] ?? humanizeExternalRefKey(key)
}

function humanizeExternalRefKey(key: string) {
  const text = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b(?:id|url|isbn)\b/gi, (match) => match.toUpperCase())
    .replace(/\b\p{Letter}/gu, (match) => match.toUpperCase())

  return text || 'Referencia externa'
}
