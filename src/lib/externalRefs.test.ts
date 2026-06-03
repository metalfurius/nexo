import { describe, expect, it } from 'vitest'
import { compactExternalRefValue, externalRefLabels, getExternalRefEntries } from './externalRefs'

describe('external refs', () => {
  it('labels known external reference keys', () => {
    expect(externalRefLabels).toMatchObject({
      anilistId: 'AniList',
      openLibraryKey: 'Open Library',
      rawgId: 'RAWG',
      sourceUrl: 'URL',
      tmdbId: 'TMDB',
      wikidataId: 'Wikidata',
    })
  })

  it('returns compact display entries for present refs only', () => {
    expect(
      getExternalRefEntries({
        anilistId: '123',
        rawgId: '',
        sourceUrl: 'https://example.com/really/long/path/with/detail',
        tmdbId: '550',
      }),
    ).toEqual([
      { label: 'AniList', value: '123' },
      { label: 'URL', value: 'https://example.com/really/long...' },
      { label: 'TMDB', value: '550' },
    ])
  })

  it('handles empty refs and preserves short values', () => {
    expect(getExternalRefEntries()).toEqual([])
    expect(compactExternalRefValue('short-value')).toBe('short-value')
  })
})
