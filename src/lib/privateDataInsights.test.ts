import { describe, expect, it } from 'vitest'
import type { DiscoveryCandidate, ListItem } from '../domain/types'
import {
  formatRecentRecommendationTime,
  getPrivateDataHealth,
  getPrivateTaxonomyRepairDraft,
  getRecentRecommendationItems,
} from './privateDataInsights'

const now = Date.parse('2026-06-03T12:00:00.000Z')

const baseItem: ListItem = {
  id: 'base',
  title: 'Base',
  type: 'book',
  status: 'wishlist',
  genres: ['Drama'],
  tags: ['lento'],
  moodTags: [],
  weights: { priority: 1, challenge: 0.5, surprise: 0.3 },
  notes: 'Contexto',
  source: 'manual',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

const baseCandidate: DiscoveryCandidate = {
  id: 'candidate',
  title: 'Candidate',
  type: 'book',
  status: 'queued',
  origin: 'prompt',
  source: 'prompt',
  sourceId: 'candidate',
  genres: [],
  tags: [],
  moodTags: [],
  externalRefs: {},
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

function item(overrides: Partial<ListItem>): ListItem {
  return { ...baseItem, ...overrides, weights: { ...baseItem.weights, ...overrides.weights } }
}

function candidate(overrides: Partial<DiscoveryCandidate>): DiscoveryCandidate {
  return { ...baseCandidate, ...overrides }
}

describe('private data insights', () => {
  it('summarizes an empty private library', () => {
    expect(getPrivateDataHealth([], [], now)).toMatchObject({
      contextualizedCount: 0,
      cooldownCount: 0,
      diceReadyCount: 0,
      missingTaxonomyCount: 0,
      needsAttention: true,
      publicCopyCount: 0,
      summaryCopy: 'Crea o importa entradas para activar recomendaciones y backup con contenido.',
      summaryLabel: 'Sin biblioteca todavia',
      taxonomyCoveragePercent: 0,
      taxonomyReadyCount: 0,
      tasteSuggestions: [],
      totalItems: 0,
    })
    expect(getPrivateDataHealth([], [], now).reviewItems).toEqual([
      {
        label: 'Primera entrada pendiente',
        detail: 'Importa markdown, busca en Explorador o crea una ficha manual.',
      },
    ])
  })

  it('prioritizes taxonomy, context and queued discovery issues', () => {
    const health = getPrivateDataHealth(
      [
        item({ id: 'missing-taxonomy', title: 'Missing taxonomy', genres: [], tags: [], moodTags: [], notes: undefined }),
        item({ id: 'ready-copy', title: 'Ready copy', publicItemId: 'public-1' }),
        item({
          id: 'cooldown',
          title: 'Cooldown',
          recommendationCooldownUntil: '2026-06-04T12:00:00.000Z',
        }),
      ],
      [candidate({ id: 'queued-1' }), candidate({ id: 'queued-2' }), candidate({ id: 'saved', status: 'saved' })],
      now,
    )

    expect(health).toMatchObject({
      contextualizedCount: 2,
      cooldownCount: 1,
      diceReadyCount: 2,
      missingTaxonomyCount: 1,
      needsAttention: true,
      publicCopyCount: 1,
      summaryCopy: 'Completa taxonomia o entradas vivas para que Dado y Explorador lean mejor tu biblioteca.',
      summaryLabel: 'Faltan senales privadas',
      taxonomyCoveragePercent: 67,
      taxonomyReadyCount: 2,
      totalItems: 3,
    })
    expect(health.reviewItems).toEqual([
      {
        label: '1 sin taxonomia',
        detail: 'Anade generos, tags o mood tags para que el dado razone mejor.',
      },
      {
        label: '1 sin rating ni notas',
        detail: 'No bloquea nada, pero baja la calidad de lectura personal.',
      },
      {
        label: '2 hallazgos pendientes',
        detail: 'Guarda o descarta la cola para mantener limpio el Explorador.',
      },
    ])
  })

  it('recognizes a prepared private library', () => {
    const health = getPrivateDataHealth(
      [
        item({ id: 'one', title: 'One', genres: ['Aventura'], notes: 'Notas' }),
        item({ id: 'two', title: 'Two', tags: ['corto'], rating: 8 }),
      ],
      [],
      now,
    )

    expect(health.needsAttention).toBe(false)
    expect(health.summaryLabel).toBe('Biblioteca preparada')
    expect(health.reviewItems).toEqual([
      {
        label: 'Sin pendientes criticos',
        detail: 'Tu biblioteca privada esta lista para backup y recomendaciones.',
        tone: 'good',
      },
    ])
  })

  it('suggests favorite tastes from highly rated completed entries', () => {
    const health = getPrivateDataHealth(
      [
        item({
          id: 'matrix',
          title: 'Matrix',
          status: 'completed',
          rating: 8.5,
          genres: ['Sci-Fi', 'Accion'],
          tags: ['pelicula', 'sci fi'],
        }),
        item({
          id: 'arrival',
          title: 'Arrival',
          status: 'completed',
          rating: 9,
          genres: ['sci fi'],
          tags: ['reflexivo'],
        }),
        item({
          id: 'flat',
          title: 'Flat',
          status: 'completed',
          rating: 6,
          genres: ['Drama'],
          tags: ['lento'],
        }),
        item({
          id: 'active',
          title: 'Active',
          status: 'in_progress',
          rating: 10,
          genres: ['Anime'],
          tags: ['actual'],
        }),
      ],
      [],
      now,
    )

    expect(health.tasteSuggestions).toEqual([
      { kind: 'genre', label: 'Sci-Fi', sourceCount: 2 },
      { kind: 'genre', label: 'Accion', sourceCount: 1 },
      { kind: 'tag', label: 'pelicula', sourceCount: 1 },
      { kind: 'tag', label: 'reflexivo', sourceCount: 1 },
      { kind: 'tag', label: 'sci fi', sourceCount: 1 },
    ])
  })

  it('does not suggest tastes that are blocked signals', () => {
    const health = getPrivateDataHealth(
      [
        item({
          id: 'horror',
          title: 'Horror',
          status: 'completed',
          rating: 9,
          genres: ['Terror', 'Drama'],
          tags: ['oscuro', 'autor'],
        }),
      ],
      [],
      now,
      ['terror', 'oscuro'],
    )

    expect(health.tasteSuggestions).toEqual([
      { kind: 'genre', label: 'Drama', sourceCount: 1 },
      { kind: 'tag', label: 'autor', sourceCount: 1 },
    ])
  })

  it('builds private taxonomy repairs only for entries without signals', () => {
    const template = {
      genres: ['Drama', 'Drama'],
      tags: ['autor'],
      moodTags: ['denso'],
    }
    const original = item({
      id: 'missing',
      title: 'Missing',
      genres: [],
      tags: [],
      moodTags: [],
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const repair = getPrivateTaxonomyRepairDraft(original, template, '2026-06-03T12:00:00.000Z')

    expect(repair).toMatchObject({
      signalCount: 3,
      item: {
        genres: ['Drama'],
        moodTags: ['denso'],
        tags: ['autor'],
        updatedAt: '2026-06-03T12:00:00.000Z',
      },
    })
    expect(original.genres).toEqual([])
    expect(repair?.item.genres).not.toBe(template.genres)
  })

  it('skips private taxonomy repairs when signals or templates already exist', () => {
    expect(getPrivateTaxonomyRepairDraft(item({ id: 'ready' }), { genres: ['Drama'], tags: [], moodTags: [] })).toBeUndefined()
    expect(getPrivateTaxonomyRepairDraft(item({ id: 'empty', genres: [], tags: [], moodTags: [] }))).toBeUndefined()
    expect(
      getPrivateTaxonomyRepairDraft(item({ id: 'empty-template', genres: [], tags: [], moodTags: [] }), {
        genres: [],
        tags: [],
        moodTags: [],
      }),
    ).toBeUndefined()
  })

  it('orders recent recommendations newest-first and limits the list', () => {
    const recommendations = getRecentRecommendationItems(
      [
        item({ id: 'old', title: 'Old', lastRecommendedAt: '2026-06-01T12:00:00.000Z' }),
        item({ id: 'none', title: 'None', lastRecommendedAt: undefined }),
        item({ id: 'new', title: 'New', lastRecommendedAt: '2026-06-03T10:00:00.000Z' }),
        item({ id: 'mid', title: 'Mid', lastRecommendedAt: '2026-06-02T12:00:00.000Z' }),
      ],
      2,
    )

    expect(recommendations.map((entry) => entry.id)).toEqual(['new', 'mid'])
  })

  it('formats recent recommendation timestamps against a deterministic clock', () => {
    expect(formatRecentRecommendationTime(undefined, now)).toBe('Sin fecha')
    expect(formatRecentRecommendationTime('not-a-date', now)).toBe('Fecha desconocida')
    expect(formatRecentRecommendationTime('2026-06-03T11:59:30.000Z', now)).toBe('Ahora mismo')
    expect(formatRecentRecommendationTime('2026-06-03T11:30:00.000Z', now)).toBe('Hace 30 min')
    expect(formatRecentRecommendationTime('2026-06-03T09:00:00.000Z', now)).toBe('Hace 3 h')
  })
})
