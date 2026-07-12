import { describe, expect, it } from 'vitest'
import { validateCommon, validatePrivateDocument, validatePublicItem, validateUserProfile } from './auditFirestoreData.js'

describe('Firestore data audit parity', () => {
  it('rejects present non-list values and oversized lists', () => {
    expect(validateCommon({ genres: 'not-a-list', tags: Array(65).fill('tag') })).toEqual([
      'invalid_list:genres',
      'list_too_long:tags',
    ])
  })

  it('mirrors item enums, numeric fields and weights validation', () => {
    const issues = validatePrivateDocument('items', {
      type: 'podcast',
      status: 'unknown',
      progressUnit: 'seasons',
      source: 'scrape',
      rating: 'five',
      genres: [],
      tags: [],
      moodTags: [],
      weights: { priority: 'high', secret: 1 },
    })

    expect(issues).toEqual(expect.arrayContaining([
      'invalid_enum:type',
      'invalid_enum:status',
      'invalid_enum:progressUnit',
      'invalid_enum:source',
      'invalid_number:rating',
      'invalid_number:weights.priority',
      'unknown_field:weights.secret',
    ]))
  })

  it('mirrors candidate and nested public snapshot validation', () => {
    const issues = validatePrivateDocument('externalCandidates', {
      type: 'podcast',
      status: 'hidden',
      progressUnit: 'seasons',
      genres: [],
      tags: [],
      moodTags: [],
      searchAliases: [],
      publicSnapshot: {
        genres: 'not-a-list',
        type: 'podcast',
        externalRefs: { tmdbId: 42 },
      },
    })

    expect(issues).toEqual(expect.arrayContaining([
      'invalid_enum:type',
      'invalid_enum:status',
      'invalid_enum:progressUnit',
      'invalid_list:publicSnapshot.genres',
      'invalid_enum:publicSnapshot.type',
      'invalid_external_ref:tmdbId',
    ]))
  })

  it('mirrors settings lists, theme, roadmap and preference maps', () => {
    const issues = validatePrivateDocument('userSettings', {
      favoriteTags: 'not-a-list',
      theme: 'neon',
      libraryCardsPerRow: 7,
      roadmap: { now: 'not-a-list', next: [], later: [], hidden: [] },
      recommendationPreferences: {
        medium: 'podcast',
        includePaused: 'yes',
      },
    })

    expect(issues).toEqual(expect.arrayContaining([
      'invalid_list:favoriteTags',
      'invalid_enum:theme',
      'invalid_enum:libraryCardsPerRow',
      'invalid_list:roadmap.now',
      'invalid_enum:recommendationPreferences.medium',
      'invalid_boolean:recommendationPreferences.includePaused',
    ]))
  })

  it('accepts a rule-compatible item and rejects malformed public lists', () => {
    expect(validatePrivateDocument('items', {
      id: 'book-dune',
      title: 'Dune',
      type: 'book',
      status: 'wishlist',
      source: 'manual',
      progressUnit: 'pages',
      genres: [],
      tags: [],
      moodTags: [],
      importNotes: [],
      weights: { priority: 1, surprise: 0.35, challenge: 0.5 },
      externalRefs: { openLibraryKey: '/works/OL893415W' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toEqual([])

    expect(validatePublicItem({ searchTokens: 'dune' })).toContain('invalid_list:searchTokens')
  })

  it('rejects ghost items, invalid profile ownership and malformed roadmap ids', () => {
    expect(validatePrivateDocument('items', { status: 'completed', updatedAt: '2026-01-01T00:00:00.000Z' }))
      .toEqual(expect.arrayContaining(['missing_field:id', 'missing_field:title', 'missing_field:createdAt']))

    expect(validateUserProfile({
      uid: 'account-a',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, 'account-b')).toContain('invalid_uid')

    expect(validatePrivateDocument('userSettings', {
      roadmap: { now: [42], next: ['x'.repeat(121)], later: [], hidden: [] },
    })).toEqual(expect.arrayContaining([
      'invalid_roadmap_id:roadmap.now',
      'roadmap_id_too_long:roadmap.next',
    ]))

    expect(validatePrivateDocument('externalCandidates', {
      id: 'candidate',
      title: 'Dune',
      type: 'book',
      status: 'queued',
      origin: 'externalSearch',
      source: 'openLibrary',
      sourceId: 'OL893415W',
      genres: [],
      tags: [],
      moodTags: [],
      externalRefs: {},
      createdAt: 42,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toContain('invalid_string:createdAt')
  })
})
