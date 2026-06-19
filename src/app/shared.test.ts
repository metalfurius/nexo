import { beforeEach, describe, expect, it } from 'vitest'
import { readInitialAppTab, writeAppTabToUrl } from './shared'

describe('app tab routing', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('opens the public catalog by default', () => {
    expect(readInitialAppTab()).toBe('catalog')
  })

  it('keeps private tabs URL-addressable', () => {
    window.history.replaceState(null, '', '/?tab=library')

    expect(readInitialAppTab()).toBe('library')
  })

  it('uses the clean root URL for the catalog tab', () => {
    window.history.replaceState(null, '', '/?tab=library')

    writeAppTabToUrl('catalog', 'replace')

    expect(window.location.search).toBe('')
  })

  it('writes non-default tabs into the URL', () => {
    writeAppTabToUrl('explorer', 'replace')

    expect(window.location.search).toBe('?tab=explorer')
  })
})
