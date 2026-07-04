import { beforeEach, describe, expect, it } from 'vitest'
import { hasCatalogRouteState, readCatalogRouteState, readInitialAppTab, writeAppTabToUrl, writeCatalogRouteState } from './shared'

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

  it('reads catalog query and type from URL state', () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune&catalogType=watch')

    expect(readInitialAppTab()).toBe('catalog')
    expect(readCatalogRouteState()).toEqual({ query: 'Dune', type: 'watch' })
    expect(hasCatalogRouteState()).toBe(true)
  })

  it('normalizes invalid catalog route types to Todo', () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune&catalogType=invalid')

    expect(readCatalogRouteState()).toEqual({ query: 'Dune', type: 'any' })
  })

  it('writes clean shareable catalog state while omitting defaults', () => {
    window.history.replaceState(null, '', '/?tab=library&item=movie-dune#catalog')

    writeCatalogRouteState({ query: 'Dune', type: 'any' }, 'replace')

    expect(window.location.search).toBe('?catalogQ=Dune')
    expect(window.location.hash).toBe('#catalog')
  })

  it('writes catalog type when filtering without a query', () => {
    writeCatalogRouteState({ query: '', type: 'book' }, 'replace')

    expect(window.location.search).toBe('?catalogType=book')
  })

  it('clears catalog URL state when navigating away from catalog', () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune&catalogType=watch')

    writeAppTabToUrl('library', 'replace')

    expect(window.location.search).toBe('?tab=library')
  })
})
