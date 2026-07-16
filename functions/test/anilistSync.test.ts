import { describe, expect, it } from 'vitest'
import { createSyncPlan, type AniListSyncEntry } from '../src/anilistSync.js'

function entry(overrides: Partial<AniListSyncEntry> = {}): AniListSyncEntry {
  return {
    id: 'entry-1',
    status: 'CURRENT',
    score: 8.5,
    progress: 4,
    media: {
      id: 154587,
      type: 'ANIME',
      format: 'TV',
      siteUrl: 'https://anilist.co/anime/154587',
      episodes: 28,
      title: { userPreferred: 'Frieren' },
      genres: ['Fantasy'],
      ...overrides.media,
    },
    title: { userPreferred: 'Frieren' },
    ...overrides,
  }
}

describe('AniList sync merge', () => {
  it('creates stable new items and deduplicates repeated custom-list entries', () => {
    const plan = createSyncPlan([entry(), entry()], [], '2026-07-16T20:00:00.000Z')

    expect(plan.added).toHaveLength(1)
    expect(plan.writes).toHaveLength(1)
    expect(plan.writes[0]).toEqual(expect.objectContaining({ id: 'anilist-154587', merge: false }))
    expect(plan.writes[0].data).toEqual(expect.objectContaining({
      title: 'Frieren',
      status: 'in_progress',
      rating: 8.5,
      progressCurrent: 4,
      progressTotal: 28,
      progressUnit: 'episodes',
      externalRefs: expect.objectContaining({ anilistId: '154587' }),
    }))
  })

  it('updates only AniList-owned fields and preserves private Nexo data', () => {
    const existing = {
      id: 'anime-frieren-anilist-154587',
      title: 'Mi titulo local',
      type: 'anime',
      status: 'wishlist',
      rating: 6,
      progress: '0 episodios',
      progressCurrent: 0,
      progressTotal: 28,
      progressUnit: 'episodes',
      genres: ['local'],
      tags: ['favorito'],
      moodTags: ['calma'],
      weights: { priority: 4, surprise: 0.1, challenge: 0.2 },
      notes: 'No tocar',
      source: 'manual',
      externalRefs: { anilistId: '154587' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const plan = createSyncPlan([entry({ status: 'COMPLETED', progress: 28, score: 9.1 })], [existing], '2026-07-16T20:00:00.000Z')
    const patch = plan.writes[0].data

    expect(plan.updated).toEqual([existing.id])
    expect(patch).toEqual(expect.objectContaining({
      status: 'completed',
      rating: 9.1,
      progressCurrent: 28,
      updatedAt: expect.any(String),
    }))
    expect(patch).not.toHaveProperty('title')
    expect(patch).not.toHaveProperty('notes')
    expect(patch).not.toHaveProperty('tags')
    expect(patch).not.toHaveProperty('weights')
  })

  it('matches the legacy AniList id and clears a removed score', () => {
    const existing = {
      id: 'anime-frieren-anilist-154587',
      title: 'Frieren',
      type: 'anime',
      status: 'in_progress',
      rating: 8,
      externalRefs: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const plan = createSyncPlan([entry({ score: 0 })], [existing])

    expect(plan.added).toHaveLength(0)
    expect(plan.updated).toEqual([existing.id])
    expect(plan.writes[0].data.rating).toBeDefined()
    expect(plan.writes[0].data.externalRefs).toEqual(expect.objectContaining({ anilistId: '154587' }))
  })

  it('leaves unlinked ambiguous titles as new entries instead of overwriting local data', () => {
    const existing = [
      { id: 'one', title: 'Same', type: 'anime', publicSnapshot: { releaseYear: 2020 } },
      { id: 'two', title: 'Same', type: 'anime', publicSnapshot: { releaseYear: 2020 } },
    ]
    const plan = createSyncPlan([entry({ media: { ...entry().media, id: 99, title: { userPreferred: 'Same' } } })], existing)

    expect(plan.added).toHaveLength(1)
    expect(plan.updated).toHaveLength(0)
  })

  it('uses a unique title, type and release year fallback when ids are missing', () => {
    const existing = [{
      id: 'local-frieren',
      title: 'Frieren',
      type: 'anime',
      status: 'wishlist',
      publicSnapshot: { releaseYear: 2023 },
    }]
    const plan = createSyncPlan([entry({ media: { ...entry().media, startDate: { year: 2023 } } })], existing)

    expect(plan.added).toHaveLength(0)
    expect(plan.updated).toEqual(['local-frieren'])
  })

  it('does not overwrite an id collision when the existing item lacks AniList refs', () => {
    const existing = [{
      id: 'anilist-154587',
      title: 'Titulo local',
      type: 'anime',
      status: 'wishlist',
      notes: 'Conservar',
    }]
    const plan = createSyncPlan([entry()], existing)

    expect(plan.added).toHaveLength(0)
    expect(plan.updated).toEqual(['anilist-154587'])
    expect(plan.writes[0].data).not.toHaveProperty('title')
    expect(plan.writes[0].data).not.toHaveProperty('notes')
  })
})
