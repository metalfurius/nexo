import { describe, expect, it } from 'vitest'
import { isChunkLoadError } from './chunkErrors'

describe('FeatureErrorBoundary chunk recovery', () => {
  it.each([
    new Error('Failed to fetch dynamically imported module: /assets/HomeTab.js'),
    Object.assign(new Error('Loading chunk 42 failed'), { name: 'ChunkLoadError' }),
    new Error('Importing a module script failed'),
  ])('recognizes stale deployment chunk failures', (error) => {
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('keeps ordinary rendering errors on the in-place retry path', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError('ChunkLoadError')).toBe(false)
  })
})
