import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from '../app/shared'
import { DEFAULT_SETTINGS } from '../domain/types'
import { buildPublicCatalogItem, discoveryToListItem, externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import SettingsTab from './SettingsTab'

function createLibrarySurface(): LibrarySurface {
  return {
    items: [],
    settings: DEFAULT_SETTINGS,
    discoveryCandidates: [],
    activityEntries: [],
    userProfiles: [],
    userRole: 'user',
    isModerator: false,
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
    deleteAllItems: vi.fn(async () => undefined),
    setStatus: vi.fn(async () => undefined),
    snoozeRecommendation: vi.fn(async () => undefined),
    reactivateRecommendation: vi.fn(async () => undefined),
    setRecommendationCooldown: vi.fn(async () => undefined),
    recordRecommendation: vi.fn(async () => undefined),
    searchExternal: vi.fn(async () => []),
    searchCatalog: vi.fn(async () => []),
    listPublicCatalog: vi.fn(async () => []),
    searchPublicCatalog: vi.fn(async () => []),
    saveSettings: vi.fn(async () => undefined),
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

function renderSettingsTab() {
  return render(
    <SettingsTab
      library={createLibrarySurface()}
      onActivity={vi.fn()}
      onNavigate={vi.fn()}
      onRollDice={vi.fn()}
      onSaveRequestHandled={vi.fn()}
      onTasteSuggestionsRequestHandled={vi.fn()}
      onTaxonomyRepairRequestHandled={vi.fn()}
      onUnsavedChange={vi.fn()}
      setTheme={vi.fn()}
      theme={DEFAULT_SETTINGS.theme}
      user={{ displayName: 'Fran', email: 'fran@example.test', uid: 'user-123' }}
    />,
  )
}

describe('SettingsTab', () => {
  it('labels the UID copy icon button with account context', () => {
    renderSettingsTab()

    const accountDrawer = screen.getByTestId('settings-account-drawer')
    expect(within(accountDrawer).getByRole('button', { name: 'Copiar UID de usuario' })).toBeEnabled()
  })
})
