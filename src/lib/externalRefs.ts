import type { ExternalRefs } from '../domain/types'

export interface ExternalRefEntry {
  label: string
  value: string
}

export const externalRefLabels: Record<keyof ExternalRefs, string> = {
  tmdbId: 'TMDB',
  rawgId: 'RAWG',
  openLibraryKey: 'Open Library',
  anilistId: 'AniList',
  wikidataId: 'Wikidata',
  sourceUrl: 'URL',
}

export function getExternalRefEntries(refs?: ExternalRefs): ExternalRefEntry[] {
  if (!refs) return []

  return (Object.entries(refs) as Array<[keyof ExternalRefs, string | undefined]>)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({
      label: externalRefLabels[key],
      value: compactExternalRefValue(value ?? ''),
    }))
}

export function compactExternalRefValue(value: string) {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}
