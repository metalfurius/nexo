import { describe, expect, it } from 'vitest'
import { buildNormalizationMutation, chunkMutations } from './normalizeFirestoreData.js'

describe('Firestore data normalization', () => {
  it('fills only a missing user creation timestamp', () => {
    expect(buildNormalizationMutation('users', {
      uid: 'account-a',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }, '2025-05-01T12:00:00.000Z')).toEqual({
      values: { createdAt: '2025-05-01T12:00:00.000Z' },
      deleteFields: [],
    })

    expect(buildNormalizationMutation('users', {
      createdAt: '2024-01-01T00:00:00.000Z',
    }, '2025-05-01T12:00:00.000Z')).toBeUndefined()
  })

  it('removes only known legacy repair fields from public items', () => {
    expect(buildNormalizationMutation('publicItems', {
      title: 'Dune',
      repairedAt: '2026-01-01T00:00:00.000Z',
      repairedBy: 'migration',
      futureField: 'preserved',
    })).toEqual({
      values: {},
      deleteFields: ['repairedAt', 'repairedBy'],
    })
  })

  it('removes only known legacy text projections from private items', () => {
    expect(buildNormalizationMutation('items', {
      genresText: 'science fiction',
      moodText: 'epic',
      tagsText: 'classic',
      notes: 'preserved',
    })).toEqual({
      values: {},
      deleteFields: ['genresText', 'moodText', 'tagsText'],
    })
  })

  it('is idempotent and enforces the 400-write batch ceiling', () => {
    expect(buildNormalizationMutation('publicItems', { title: 'Dune' })).toBeUndefined()
    expect(buildNormalizationMutation('items', { title: 'Dune' })).toBeUndefined()

    const chunks = chunkMutations(Array.from({ length: 801 }, (_, index) => index))
    expect(chunks.map((chunk) => chunk.length)).toEqual([400, 400, 1])
    expect(() => chunkMutations([1], 401)).toThrow(/between 1 and 400/)
  })
})
