import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEIGHTS, type DiscoveryCandidate, type ListItem } from '../domain/types'
import { buildPublicCatalogItem } from '../lib/catalog'
import {
  CandidateDialog,
  ItemEditor,
  PublicItemEditor,
  QuickSearchDialog,
  SourceCreditsDialog,
  hasCatalogRouteState,
  readCatalogRouteState,
  readInitialAppTab,
  writeAppTabToUrl,
  writeCatalogRouteState,
} from './shared'

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
