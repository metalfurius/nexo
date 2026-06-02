import { describe, expect, it } from 'vitest'
import { ITEM_TYPES } from '../domain/types'
import {
  catalogGenrePresets,
  catalogMoodPresets,
  catalogTagPresets,
  catalogTaxonomyTemplates,
} from './catalogPresets'

const hasBlankValues = (values: string[]) => values.some((value) => value.trim().length === 0)

describe('catalog curation presets', () => {
  it('keeps useful shortcuts available for every item type', () => {
    for (const type of ITEM_TYPES) {
      expect(catalogGenrePresets[type].length, `${type} genres`).toBeGreaterThanOrEqual(8)
      expect(catalogTagPresets[type].length, `${type} tags`).toBeGreaterThanOrEqual(8)
      expect(catalogTaxonomyTemplates[type].length, `${type} taxonomy templates`).toBeGreaterThanOrEqual(3)
    }
  })

  it('does not expose empty labels or duplicate mood shortcuts', () => {
    expect(hasBlankValues(catalogMoodPresets)).toBe(false)
    expect(new Set(catalogMoodPresets).size).toBe(catalogMoodPresets.length)

    for (const type of ITEM_TYPES) {
      expect(hasBlankValues(catalogGenrePresets[type]), `${type} genres`).toBe(false)
      expect(hasBlankValues(catalogTagPresets[type]), `${type} tags`).toBe(false)

      for (const template of catalogTaxonomyTemplates[type]) {
        expect(template.label.trim(), `${type} template label`).not.toBe('')
        expect(template.detail.trim(), `${type} template detail`).not.toBe('')
        expect(template.genres.length + template.tags.length + template.moodTags.length, template.label).toBeGreaterThan(0)
      }
    }
  })
})
