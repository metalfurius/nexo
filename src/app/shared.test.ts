import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEIGHTS, type DiscoveryCandidate, type ListItem } from '../domain/types'
import { buildPublicCatalogItem } from '../lib/catalog'
import {
  CandidateDialog,
  CoverArt,
  ItemEditor,
  PublicItemEditor,
  QuickSearchDialog,
  SourceCreditsDialog,
  canonicalizeLegacyAppRoute,
  hasCatalogRouteState,
  hasExplicitAppRoute,
  readCatalogRouteState,
  readDiscoverMode,
  readInitialAppTab,
  writeAppTabToUrl,
  writeCatalogRouteState,
} from './shared'

describe('CoverArt', () => {
  it('keeps decorative posters lazy by default', () => {
    const { container } = render(createElement(CoverArt, {
      posterUrl: 'https://images.example.test/dune.jpg',
      title: 'Dune',
      type: 'book',
    }))

    const image = container.querySelector('img')
    expect(container.querySelector('.cover-art')).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).not.toHaveAttribute('fetchpriority')
  })

  it('only raises loading priority when explicitly requested for a hero presentation', () => {
    const { container } = render(createElement(CoverArt, {
      posterUrl: 'https://images.example.test/dune.jpg',
      presentation: 'hero',
      priority: true,
      title: 'Dune',
      type: 'book',
    }))

    const cover = container.querySelector('.cover-art')
    const image = container.querySelector('img')
    expect(cover).toHaveClass('cover-art-hero')
    expect(cover).toHaveAttribute('data-presentation', 'hero')
    expect(image).toHaveAttribute('loading', 'eager')
    expect(image).toHaveAttribute('fetchpriority', 'high')
  })

  it('switches a failed poster to the deterministic fallback', () => {
    const { container } = render(createElement(CoverArt, {
      posterUrl: 'https://images.example.test/broken.jpg',
      title: 'The Left Hand of Darkness',
      type: 'book',
    }))
    const image = container.querySelector('img')
    expect(image).not.toBeNull()

    fireEvent.error(image as HTMLImageElement)

    const cover = container.querySelector('.cover-art')
    expect(container.querySelector('img')).toBeNull()
    expect(cover).toHaveClass('fallback-cover')
    expect(cover).toHaveStyle({
      '--cover-accent-a': '#fbbf24',
      '--cover-accent-b': '#7c3aed',
      '--cover-ink': '#1c1917',
    })
    expect(screen.getByText('The Left Hand')).toBeVisible()
  })

  it('bounds very long fallback titles without exposing the full value', () => {
    const longTitle = 'A'.repeat(500)
    const { container } = render(createElement(CoverArt, { title: longTitle, type: 'other' }))
    const renderedTitle = container.querySelector('.cover-art-title')?.textContent ?? ''

    expect(renderedTitle).toHaveLength(48)
    expect(renderedTitle).toBe('A'.repeat(48))
    expect(container.textContent).not.toContain(longTitle)
  })
})

describe('app tab routing', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('opens Discover at the clean public root', () => {
    expect(readInitialAppTab()).toBe('discover')
    expect(readDiscoverMode()).toBe('search')
    expect(hasExplicitAppRoute()).toBe(false)
  })

  it.each(['home', 'library', 'dice', 'import', 'settings', 'curation'] as const)(
    'keeps %s URL-addressable',
    (tab) => {
      window.history.replaceState(null, '', `/?tab=${tab}`)

      expect(readInitialAppTab()).toBe(tab)
      expect(hasExplicitAppRoute()).toBe(true)
    },
  )

  it('keeps item deep links on Library', () => {
    window.history.replaceState(null, '', '/?item=movie-dune')

    expect(readInitialAppTab()).toBe('library')

    writeAppTabToUrl('library', 'replace', { kind: 'item', id: 'movie-dune' })
    expect(window.location.search).toBe('?item=movie-dune&tab=library')
  })

  it.each([
    ['catalog', 'search'],
    ['explorer', 'surprise'],
  ] as const)('maps the legacy %s tab to Discover/%s', (legacyTab, mode) => {
    window.history.replaceState(null, '', `/?tab=${legacyTab}`)

    expect(readInitialAppTab()).toBe('discover')
    expect(readDiscoverMode()).toBe(mode)
  })

  it('reads legacy catalog query and type before canonicalization', () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune&catalogType=watch')

    expect(readInitialAppTab()).toBe('discover')
    expect(readDiscoverMode()).toBe('search')
    expect(readCatalogRouteState()).toEqual({ query: 'Dune', type: 'watch' })
    expect(hasCatalogRouteState()).toBe(true)
  })

  it('canonicalizes legacy Catalog state with replaceState while preserving hash and unrelated state', () => {
    window.history.replaceState(null, '', '/?tab=catalog&catalogQ=%20Dune%20&catalogType=book&ref=activity#catalog')

    expect(canonicalizeLegacyAppRoute()).toBe(true)
    expect(window.location.search).toBe('?tab=discover&ref=activity&mode=search&q=Dune&type=book')
    expect(window.location.hash).toBe('#catalog')
    expect(readCatalogRouteState()).toEqual({ query: 'Dune', type: 'book' })
  })

  it('canonicalizes legacy Explorer state to Surprise', () => {
    window.history.replaceState(null, '', '/?tab=explorer&catalogQ=ignored')

    expect(canonicalizeLegacyAppRoute()).toBe(true)
    expect(window.location.search).toBe('?tab=discover&mode=surprise&q=ignored')
    expect(readDiscoverMode()).toBe('surprise')
  })

  it('leaves already canonical routes untouched', () => {
    window.history.replaceState(null, '', '/?tab=discover&mode=queue')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    expect(canonicalizeLegacyAppRoute()).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('normalizes invalid catalog route types to Todo', () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune&catalogType=invalid')

    expect(readCatalogRouteState()).toEqual({ query: 'Dune', type: 'any' })
  })

  it('limits catalog queries read from and written to the URL', () => {
    const longQuery = 'd'.repeat(180)
    window.history.replaceState(null, '', `/?tab=discover&mode=search&q=${longQuery}`)

    expect(readCatalogRouteState().query).toHaveLength(120)
    writeCatalogRouteState({ query: longQuery, type: 'any' }, 'replace')
    expect(new URLSearchParams(window.location.search).get('q')).toHaveLength(120)
  })

  it('writes clean shareable catalog state while omitting defaults', () => {
    window.history.replaceState(null, '', '/?tab=library&item=movie-dune#catalog')

    writeCatalogRouteState({ query: 'Dune', type: 'any' }, 'replace')

    expect(window.location.search).toBe('?tab=discover&mode=search&q=Dune')
    expect(window.location.hash).toBe('#catalog')
  })

  it('writes catalog type when filtering without a query', () => {
    writeCatalogRouteState({ query: '', type: 'book' }, 'replace')

    expect(window.location.search).toBe('?tab=discover&mode=search&type=book')
  })

  it('clears catalog URL state when navigating away from catalog', () => {
    window.history.replaceState(null, '', '/?catalogQ=Dune&catalogType=watch')

    writeAppTabToUrl('library', 'replace')

    expect(window.location.search).toBe('?tab=library')
  })

  it('writes Home and Discover as first-class routes', () => {
    writeAppTabToUrl('home', 'replace')
    expect(window.location.search).toBe('?tab=home')

    writeAppTabToUrl('discover', 'replace')
    expect(window.location.search).toBe('?tab=discover')
  })
})

describe('shared dialogs', () => {
  const candidate: DiscoveryCandidate = {
    id: 'external-anilist-frieren',
    title: 'Frieren: Beyond Journey End',
    type: 'anime',
    status: 'queued',
    origin: 'externalSearch',
    source: 'anilist',
    sourceId: '154587',
    genres: ['Fantasy'],
    tags: ['anime'],
    moodTags: [],
    externalRefs: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('labels candidate dialog close buttons with the candidate title', () => {
    render(
      createElement(CandidateDialog, {
        candidate,
        onClose: vi.fn(),
        onDismiss: vi.fn(),
        onRestore: vi.fn(),
        onSave: vi.fn(),
      }),
    )

    expect(screen.getByRole('button', { name: `Cerrar detalle de ${candidate.title}` })).toBeVisible()
  })

  it('labels source credits close button with its dialog context', () => {
    render(createElement(SourceCreditsDialog, { onClose: vi.fn() }))

    expect(screen.getByRole('button', { name: 'Cerrar creditos de fuentes' })).toBeVisible()
  })

  it('labels quick search close button with its dialog context', () => {
    render(
      createElement(QuickSearchDialog, {
        commands: [],
        candidates: [],
        items: [],
        navItems: [],
        onClose: vi.fn(),
        onCreateItem: vi.fn(),
        onExploreQuery: vi.fn(),
        onOpenCandidate: vi.fn(),
        onOpenItem: vi.fn(),
        onOpenTab: vi.fn(),
      }),
    )

    expect(screen.getByRole('button', { name: 'Cerrar busqueda rapida' })).toBeVisible()
  })

  it('labels private editor icon close button with the edited title', () => {
    const item: ListItem = {
      id: 'manual-frieren',
      title: 'Frieren',
      type: 'anime',
      status: 'in_progress',
      genres: ['fantasia'],
      tags: ['anime'],
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    render(createElement(ItemEditor, { item, onClose: vi.fn(), onSave: vi.fn() }))

    expect(screen.getByRole('dialog', { name: item.title })).toBeVisible()
    expect(screen.getByRole('button', { name: `Cerrar y guardar ${item.title}` })).toBeVisible()
  })

  it('labels public editor icon close button with the edited title', () => {
    const item = buildPublicCatalogItem(
      {
        id: 'anime-frieren',
        title: 'Frieren',
        type: 'anime',
        description: 'Fantasia contemplativa.',
        genres: ['fantasia'],
        tags: ['anime'],
        moodTags: [],
      },
      'test-moderator',
    )

    render(createElement(PublicItemEditor, { item, onClose: vi.fn(), onSave: vi.fn() }))

    expect(screen.getByRole('button', { name: `Cerrar editor de ${item.title}` })).toBeVisible()
  })
})
