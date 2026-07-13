import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from '../app/shared'
import { DEFAULT_SETTINGS, type PublicCatalogItem } from '../domain/types'
import { buildPublicCatalogItem, discoveryToListItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import CurationTab from './CurationTab'

function createPublicCatalogItem(): PublicCatalogItem {
  return buildPublicCatalogItem(
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
}

function createLibrarySurface(publicItems: PublicCatalogItem[]): LibrarySurface {
  return {
    items: [],
    settings: DEFAULT_SETTINGS,
    discoveryCandidates: [],
    activityEntries: [],
    userProfiles: [],
    userRole: 'moderator',
    isModerator: true,
    loading: false,
    syncState: {
      fromCache: false,
      hasPendingWrites: false,
      offlinePersistenceEnabled: false,
      pendingWriteCount: 0,
      remote: true,
    },
    saveItem: vi.fn(async () => undefined),
    deleteItem: vi.fn(async () => undefined),
    deleteAllItems: vi.fn(async () => ({ complete: true, deletedItemIds: [], roadmap: DEFAULT_SETTINGS.roadmap, total: 0 })),
    setStatus: vi.fn(async () => undefined),
    snoozeRecommendation: vi.fn(async () => undefined),
    reactivateRecommendation: vi.fn(async () => undefined),
    setRecommendationCooldown: vi.fn(async () => undefined),
    recordRecommendation: vi.fn(async () => undefined),
    searchExternal: vi.fn(async () => []),
    searchCatalog: vi.fn(async () => []),
    listPublicCatalog: vi.fn(async () => publicItems),
    searchPublicCatalog: vi.fn(async () => publicItems),
    saveSettings: vi.fn(async () => undefined),
    applyRoadmapMutation: vi.fn(async () => undefined),
    queueDiscoveryCandidates: vi.fn(async () => 0),
    dismissDiscoveryCandidate: vi.fn(async () => undefined),
    restoreDiscoveryCandidate: vi.fn(async () => undefined),
    saveDiscoveryToLibrary: vi.fn(async (candidate) => discoveryToListItem(candidate)),
    recordImportedItemToPublicCatalog: vi.fn(async () => undefined),
    upsertPublicItem: vi.fn(async (item) => buildPublicCatalogItem(item, 'test-moderator')),
    replacePublicItem: vi.fn(async (item) => item),
    archivePublicItem: vi.fn(async () => undefined),
    restorePublicItem: vi.fn(async () => undefined),
    updateUserRole: vi.fn(async () => undefined),
    recordActivity: vi.fn(),
    clearActivityEntries: vi.fn(async () => undefined),
    restoreActivityEntries: vi.fn(async () => undefined),
    publicItemToDiscovery,
    externalCandidateToDiscovery,
  }
}

describe('CurationTab', () => {
  it('keeps search, diagnostics and review visible while secondary tools stay collapsed', async () => {
    const user = userEvent.setup()
    const publicItem = createPublicCatalogItem()
    render(<CurationTab library={createLibrarySurface([publicItem])} onActivity={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Catalogo Nexo' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Nueva entrada' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Buscar en catalogo publico' })).toBeVisible()
    expect(screen.getByTestId('catalog-diagnostics')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Revision prioritaria' })).toBeVisible()

    const advancedLabel = screen.getByText('Opciones avanzadas')
    const drawer = advancedLabel.closest('details')
    expect(drawer).not.toHaveAttribute('open')

    await user.click(advancedLabel)

    expect(drawer).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Plantilla' })).toBeVisible()
  })

  it('labels archive confirmation close button with the entry title', async () => {
    const user = userEvent.setup()
    const publicItem = createPublicCatalogItem()
    render(<CurationTab library={createLibrarySurface([publicItem])} onActivity={vi.fn()} />)

    await screen.findByRole('heading', { name: publicItem.title })
    await user.click(screen.getByRole('button', { name: `Archivar ${publicItem.title}` }))

    const dialog = await screen.findByRole('dialog', { name: 'Archivar entrada publica' })
    expect(within(dialog).getByRole('button', { name: `Cerrar confirmacion de archivo de ${publicItem.title}` })).toBeVisible()
  })
})
