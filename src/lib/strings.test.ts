import { describe, expect, it } from 'vitest'
import {
  mergeListText,
  normalizeKey,
  slugify,
  splitList,
  toggleListTextValue,
  uniqueNormalizedValues,
  uniqueValues,
} from './strings'

describe('string helpers', () => {
  it('normalizes and slugifies accented text', () => {
    expect(normalizeKey('  Ciencia-ficcion: Épica!  ')).toBe('ciencia ficcion epica')
    expect(slugify('Ciencia ficción épica')).toBe('ciencia-ficcion-epica')
  })

  it('deduplicates exact trimmed values while preserving order', () => {
    expect(uniqueValues([' Drama ', undefined, '', 'Drama', 'Comedia'])).toEqual(['Drama', 'Comedia'])
  })

  it('deduplicates by normalized keys while preserving display text', () => {
    expect(uniqueNormalizedValues(['Drama', 'drama ', 'Ciencia ficción', 'ciencia ficcion', ''])).toEqual([
      'Drama',
      'Ciencia ficción',
    ])
  })

  it('splits, merges and toggles comma-separated list text', () => {
    expect(splitList('Drama, , lento, Drama')).toEqual(['Drama', 'lento'])
    expect(mergeListText('Drama, lento', ['lento', 'Calma'])).toBe('Drama, lento, Calma')
    expect(toggleListTextValue('Drama, lento', 'drama')).toBe('lento')
    expect(toggleListTextValue('Drama, lento', 'Calma')).toBe('Drama, lento, Calma')
  })
})
