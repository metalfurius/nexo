import { describe, expect, it } from 'vitest'
import type { DiscoveryCandidate, PublicCatalogItem } from '../domain/types'
import {
  blankPublicCatalogItem,
  buildCatalogDescriptionDraft,
  catalogQualityIssueKeys,
  catalogQualityWarnings,
  draftCatalogQualityWarnings,
  getCatalogDiagnostics,
  getCatalogReviewQueue,
  publicCatalogDraftFromCandidate,
  publicCatalogDraftFromTemplate,
  publicCatalogTagsFromCandidate,
  sortCatalogItems,
  upsertVisibleCatalogItem,
} from './catalogInsights'

const baseCatalogItem: PublicCatalogItem = {
  id: 'base',
  title: 'Base',
  type: 'book',
  description: 'Descripcion',
  releaseYear: 2026,
  genres: ['Drama'],
  tags: ['Lento'],
  moodTags: [],
  externalRefs: {},
  posterUrl: 'https://example.com/poster.jpg',
  searchTokens: [],
  canonicalKey: 'book:base',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'tester',
  updatedBy: 'tester',
}

function catalogItem(overrides: Partial<PublicCatalogItem>): PublicCatalogItem {
  return { ...baseCatalogItem, ...overrides }
}

const baseCandidate: DiscoveryCandidate = {
  id: 'candidate',
  title: 'Candidate',
  type: 'movie',
  status: 'queued',
  origin: 'externalSearch',
  source: 'tmdb',
  sourceId: 'candidate',
  overview: 'Candidate overview',
  releaseYear: 2026,
  genres: ['Sci-Fi', 'Sci-Fi'],
  tags: ['movie', 'tmdb', 'Nexo', 'espacial'],
  moodTags: ['misterio', 'misterio'],
  externalRefs: { tmdbId: '550' },
  posterUrl: 'https://example.com/candidate.jpg',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
}

describe('catalog insights', () => {
  it('detects quality issues and maps them to user-facing warnings', () => {
    const item = catalogItem({
      description: ' ',
      genres: [],
      posterUrl: '',
      tags: [],
    })

    expect(catalogQualityIssueKeys(item)).toEqual(['description', 'genres', 'tags', 'poster'])
    expect(catalogQualityWarnings(item)).toEqual(['Sin descripcion', 'Sin generos', 'Sin tags', 'Sin portada'])
  })

  it('deduplicates comma-separated draft signals before checking warnings', () => {
    expect(
      draftCatalogQualityWarnings({
        description: 'Lista para publicar',
        genresText: 'Drama, Drama, ',
        posterUrl: 'https://example.com/poster.jpg',
        tagsText: 'Lento, premiada',
      }),
    ).toEqual([])

    expect(
      draftCatalogQualityWarnings({
        genresText: ', ,',
        tagsText: '',
      }),
    ).toEqual(['Sin descripcion', 'Sin generos', 'Sin tags', 'Sin portada'])
  })

  it('summarizes catalog readiness and issue pressure', () => {
    const diagnostics = getCatalogDiagnostics([
      catalogItem({ id: 'ready', title: 'Ready' }),
      catalogItem({ id: 'no-description', title: 'No description', description: undefined }),
      catalogItem({ id: 'no-taxonomy', title: 'No taxonomy', genres: [], tags: [] }),
      catalogItem({ id: 'no-poster', title: 'No poster', posterUrl: undefined }),
    ])

    expect(diagnostics.readyCount).toBe(1)
    expect(diagnostics.totalItems).toBe(4)
    expect(diagnostics.coveragePercent).toBe(25)
    expect(diagnostics.summaryLabel).toBe('3 fichas por pulir')
    expect(diagnostics.summaryCopy).toBe('Descripcion es el foco con mas trabajo ahora mismo.')
    expect(diagnostics.issueStats.map((issue) => [issue.id, issue.count, issue.detail])).toEqual([
      ['description', 1, '1 ficha pendiente'],
      ['genres', 1, '1 ficha pendiente'],
      ['tags', 1, '1 ficha pendiente'],
      ['poster', 1, '1 ficha pendiente'],
    ])
  })

  it('handles empty and fully ready catalogs with stable copy', () => {
    expect(getCatalogDiagnostics([])).toMatchObject({
      coveragePercent: 0,
      readyCount: 0,
      summaryCopy: 'Crea una ficha o importa un seed para empezar la curacion compartida.',
      summaryLabel: 'Catalogo por empezar',
      totalItems: 0,
    })

    expect(getCatalogDiagnostics([catalogItem({ id: 'ready' })])).toMatchObject({
      coveragePercent: 100,
      readyCount: 1,
      summaryCopy: 'Todas las entradas activas tienen descripcion, taxonomia y portada.',
      summaryLabel: 'Catalogo listo',
      totalItems: 1,
    })
  })

  it('prioritizes the review queue by warning count, recency and title', () => {
    const queue = getCatalogReviewQueue([
      catalogItem({ id: 'ready', title: 'Ready' }),
      catalogItem({
        id: 'many',
        title: 'Many',
        description: undefined,
        genres: [],
        posterUrl: undefined,
        tags: [],
        updatedAt: '2026-06-01T00:00:00.000Z',
      }),
      catalogItem({
        id: 'recent-two',
        title: 'Recent Two',
        genres: [],
        tags: [],
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
      catalogItem({
        id: 'older-two',
        title: 'Older Two',
        genres: [],
        tags: [],
        updatedAt: '2026-06-02T00:00:00.000Z',
      }),
      catalogItem({ id: 'one', title: 'One', posterUrl: undefined }),
    ])

    expect(queue.map((entry) => [entry.item.id, entry.warnings.length])).toEqual([
      ['many', 4],
      ['recent-two', 2],
      ['older-two', 2],
    ])
  })

  it('sorts catalog items by quality, title and update recency', () => {
    const ready = catalogItem({ id: 'ready', title: 'A Ready', updatedAt: '2026-06-01T00:00:00.000Z' })
    const weaker = catalogItem({
      id: 'weaker',
      title: 'B Weaker',
      genres: [],
      tags: [],
      updatedAt: '2026-06-02T00:00:00.000Z',
    })
    const weakest = catalogItem({
      id: 'weakest',
      title: 'C Weakest',
      description: undefined,
      genres: [],
      posterUrl: undefined,
      tags: [],
      updatedAt: '2026-06-03T00:00:00.000Z',
    })

    expect([ready, weakest, weaker].sort((left, right) => sortCatalogItems(left, right, 'quality')).map((item) => item.id)).toEqual([
      'weakest',
      'weaker',
      'ready',
    ])
    expect([weaker, ready, weakest].sort((left, right) => sortCatalogItems(left, right, 'title')).map((item) => item.id)).toEqual([
      'ready',
      'weaker',
      'weakest',
    ])
    expect([ready, weakest, weaker].sort((left, right) => sortCatalogItems(left, right, 'updated')).map((item) => item.id)).toEqual([
      'weakest',
      'weaker',
      'ready',
    ])
  })

  it('creates blank and template-based public catalog drafts with stable timestamps', () => {
    expect(blankPublicCatalogItem('game', '2026-06-03T12:00:00.000Z')).toMatchObject({
      canonicalKey: '',
      createdAt: '2026-06-03T12:00:00.000Z',
      createdBy: 'moderator',
      externalRefs: {},
      genres: [],
      id: '',
      moodTags: [],
      searchTokens: [],
      tags: [],
      title: '',
      type: 'game',
      updatedAt: '2026-06-03T12:00:00.000Z',
      updatedBy: 'moderator',
    })

    const template = { genres: ['JRPG'], moodTags: ['epico'], tags: ['turnos'] }
    const draft = publicCatalogDraftFromTemplate('game', template, '2026-06-03T12:00:00.000Z')

    expect(draft.genres).toEqual(['JRPG'])
    expect(draft.tags).toEqual(['turnos'])
    expect(draft.moodTags).toEqual(['epico'])
    expect(draft.genres).not.toBe(template.genres)
  })

  it('builds public catalog drafts from external candidates without technical tags', () => {
    expect(publicCatalogTagsFromCandidate(baseCandidate)).toEqual(['espacial'])

    expect(publicCatalogDraftFromCandidate(baseCandidate, '2026-06-03T12:00:00.000Z')).toMatchObject({
      canonicalKey: '',
      createdAt: '2026-06-01T00:00:00.000Z',
      description: 'Candidate overview',
      externalRefs: { tmdbId: '550' },
      genres: ['Sci-Fi'],
      id: '',
      moodTags: ['misterio'],
      posterUrl: 'https://example.com/candidate.jpg',
      releaseYear: 2026,
      tags: ['espacial'],
      title: 'Candidate',
      type: 'movie',
      updatedAt: '2026-06-03T12:00:00.000Z',
    })
  })

  it('prefers public snapshots when rebuilding a catalog draft from Nexo candidates', () => {
    const draft = publicCatalogDraftFromCandidate({
      ...baseCandidate,
      overview: 'Candidate overview',
      publicSnapshot: {
        canonicalKey: 'movie:snapshot',
        description: 'Snapshot overview',
        externalRefs: { tmdbId: '999' },
        genres: ['Drama'],
        id: 'public-1',
        moodTags: ['solemne'],
        posterUrl: 'https://example.com/snapshot.jpg',
        releaseYear: 1999,
        tags: ['canon'],
        title: 'Snapshot',
        type: 'movie',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      releaseYear: 2026,
    })

    expect(draft).toMatchObject({
      canonicalKey: 'movie:snapshot',
      createdAt: '2026-05-01T00:00:00.000Z',
      externalRefs: { tmdbId: '999' },
      genres: ['Drama'],
      id: 'public-1',
      moodTags: ['solemne'],
      posterUrl: 'https://example.com/candidate.jpg',
      releaseYear: 2026,
      tags: ['canon'],
      title: 'Candidate',
      updatedAt: '2026-05-01T00:00:00.000Z',
    })
  })

  it('upserts visible catalog items and builds moderation descriptions', () => {
    const items = [
      catalogItem({ id: 'b', title: 'Beta' }),
      catalogItem({ id: 'a', title: 'Alpha' }),
    ]
    const next = catalogItem({ id: 'b', title: 'Aardvark' })

    expect(upsertVisibleCatalogItem(items, next).map((item) => [item.id, item.title])).toEqual([
      ['b', 'Aardvark'],
      ['a', 'Alpha'],
    ])
    expect(buildCatalogDescriptionDraft('  ', 'book', [])).toBe(
      'Entrada pendiente combina libros en una ficha curada para el catalogo Nexo.',
    )
    expect(buildCatalogDescriptionDraft('Arrival', 'movie', ['sci-fi', 'duelo', 'lenguaje', 'calma', 'extra'])).toBe(
      'Arrival combina sci-fi, duelo, lenguaje, calma en una ficha curada para el catalogo Nexo.',
    )
  })
})
