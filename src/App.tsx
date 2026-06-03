import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Dice5,
  Download,
  Eye,
  Film,
  Gamepad2,
  LayoutGrid,
  Library,
  List,
  LogIn,
  LogOut,
  MoreHorizontal,
  Moon,
  Pause,
  Play,
  Info,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import './App.css'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  type ExternalCandidate,
  ITEM_STATUSES,
  ITEM_TYPES,
  USER_ROLES,
  type DiscoveryCandidate,
  type DiscoveryStatus,
  type EnergyLevel,
  type ExternalRefs,
  type ExplorerSearchType,
  type IntensityLevel,
  type ItemStatus,
  type ItemType,
  type LibraryViewMode,
  type ListItem,
  type NoveltyLevel,
  type PublicCatalogItem,
  type RecommendationPreferences,
  type RecommendationResult,
  type ThemeMode,
  type UserProfile,
  type UserRole,
  type UserSettings,
  nowIso,
} from './domain/types'
import { useAuth } from './hooks/useAuth'
import { useLibrary } from './hooks/useLibrary'
import {
  catalogGenrePresets,
  catalogMoodPresets,
  catalogTagPresets,
  catalogTaxonomyTemplates,
  type CatalogTaxonomyTemplate,
} from './data/catalogPresets'
import { buildPublicCatalogItem, promptToDiscovery } from './lib/catalog'
import {
  catalogIssueLabels,
  catalogQualityIssueKeys,
  catalogQualityWarnings,
  catalogSortLabels,
  draftCatalogQualityWarnings,
  getCatalogDiagnostics,
  getCatalogReviewQueue,
  sortCatalogItems,
  type CatalogIssueFilter,
  type CatalogIssueKey,
  type CatalogQualityFilter,
  type CatalogSortMode,
} from './lib/catalogInsights'
import {
  getActiveDiceFilters,
  getDiceEligibilityBreakdown,
  type DiceEligibilityBreakdown,
} from './lib/diceInsights'
import {
  discoveryEmptyCopy,
  discoverySourceLabels as sourceLabels,
  discoveryStatusLabels,
  explorerSourceFilters,
  getCandidateDecisionBrief,
  getExplorerDecisionState,
  type CandidateDecisionBrief,
  type ExplorerSourceFilter,
} from './lib/explorerInsights'
import {
  getLibraryLaunchGuide,
  getLibrarySmartViewOptions,
  hasItemTaxonomy,
  isItemReadyForDicePulse,
  matchesLibrarySmartView,
  type LibraryLaunchGuide,
  type LibraryLaunchStep,
  type LibrarySmartView,
} from './lib/libraryInsights'
import {
  formatDateLabel,
  formatDuration,
  getItemPulse,
  getItemSignals,
  getItemSubtitle,
  getPersonalEditorReadiness,
  getVisibleItemChips,
  itemSourceLabels,
  itemStatusLabels as statusLabels,
  itemTypeLabels as typeLabels,
} from './lib/libraryItemInsights'
import {
  formatRecentRecommendationTime,
  getPrivateDataHealth,
  getRecentRecommendationItems,
} from './lib/privateDataInsights'
import { createLibraryExportPayload, parseLibraryImportPayload } from './lib/libraryBackup'
import { sortLibraryItems, type LibrarySortMode } from './lib/librarySorting'
import { createPublicCatalogSeedTemplate, parsePublicCatalogSeed } from './lib/publicCatalogSeed'
import { recommendItem, scoreCandidates } from './lib/recommendations'
import { normalizeKey, slugify, uniqueValues } from './lib/strings'

const energyLabels: Record<EnergyLevel, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

const intensityLabels: Record<IntensityLevel, string> = {
  soft: 'Suave',
  balanced: 'Equilibrada',
  intense: 'Intensa',
}

const noveltyLabels: Record<NoveltyLevel, string> = {
  comfort: 'Confort',
  balanced: 'Balance',
  surprise: 'Sorpresa',
}

const librarySortLabels: Record<LibrarySortMode, string> = {
  focus: 'Foco',
  updated: 'Recientes',
  title: 'Titulo',
  priority: 'Prioridad',
  rating: 'Rating',
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  moderator: 'Moderador',
  user: 'Usuario',
}

const rolePermissionSummaries: Array<{ role: UserRole; detail: string; permissions: string[] }> = [
  {
    role: 'user',
    detail: 'Uso privado de Biblioteca, Dado y Explorador.',
    permissions: ['Biblioteca privada', 'Guardar hallazgos', 'Exportar backup'],
  },
  {
    role: 'moderator',
    detail: 'Puede mantener el catalogo compartido sin tocar roles.',
    permissions: ['Curar catalogo', 'Importar seed', 'Archivar publicas'],
  },
  {
    role: 'admin',
    detail: 'Gestiona roles y conserva todos los permisos de moderacion.',
    permissions: ['Cambiar roles', 'Curar catalogo', 'Ver perfiles'],
  },
]

const externalRefLabels: Record<keyof ExternalRefs, string> = {
  tmdbId: 'TMDB',
  rawgId: 'RAWG',
  openLibraryKey: 'Open Library',
  anilistId: 'AniList',
  wikidataId: 'Wikidata',
  sourceUrl: 'URL',
}

const typeIcons: Record<ItemType, typeof Film> = {
  game: Gamepad2,
  book: BookOpen,
  movie: Film,
  series: Film,
  anime: Film,
  manga: BookOpen,
  manhwa: BookOpen,
  comic: BookOpen,
  other: Library,
}

type FeedbackTone = 'info' | 'success' | 'danger' | 'loading'

function feedbackToneFromText(message: string): FeedbackTone {
  const normalized = message.toLowerCase()
  if (normalized.includes('no se pudo') || normalized.includes('error') || normalized.includes('invalido')) return 'danger'
  if (normalized.startsWith('buscando') || normalized.startsWith('borrando') || normalized.startsWith('importando')) {
    return 'loading'
  }
  if (
    normalized.includes('guardado') ||
    normalized.includes('borrado') ||
    normalized.includes('archivado') ||
    normalized.includes('importadas') ||
    normalized.includes('copiado') ||
    normalized.includes('anadida') ||
    normalized.includes('enviados') ||
    normalized.includes('marcado') ||
    normalized.includes('descartado') ||
    normalized.includes('ahora es')
  ) {
    return 'success'
  }
  return 'info'
}

type AppTab = 'library' | 'dice' | 'explorer' | 'settings' | 'curation'

interface RecommendationSessionPlan {
  detail: string
  facts: Array<{ detail: string; label: string; value: string }>
  signals: string[]
  title: string
}

interface PrivateDataAction {
  detail: string
  Icon: typeof Download
  id: string
  label: string
  onClick: () => void
  primary?: boolean
}

interface DiceRecoveryAction {
  detail: string
  Icon: typeof Download
  id: string
  label: string
  onClick: () => void
}

interface AuthUserSummary {
  uid: string
  email: string | null
  displayName: string | null
  photoURL?: string | null
}

const themeStorageKey = 'nexo-theme'
const promptDeck = [
  'Un clasico que aun no has tocado',
  'Algo corto para una noche rara',
  'Una obra que cambie de textura a mitad',
  'Un pendiente que merezca segunda oportunidad',
]

const curationStarterTypes: ItemType[] = ['book', 'game', 'movie', 'series', 'anime', 'manga']
const urlAddressableTabs: AppTab[] = ['library', 'dice', 'explorer', 'settings']

function readInitialAppTab(): AppTab {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return urlAddressableTabs.includes(tab as AppTab) ? (tab as AppTab) : 'library'
}

function writeAppTabToUrl(tab: AppTab) {
  const url = new URL(window.location.href)
  if (tab === 'library' || !urlAddressableTabs.includes(tab)) {
    url.searchParams.delete('tab')
  } else {
    url.searchParams.set('tab', tab)
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

const dicePreferencePresets: Array<{
  id: string
  label: string
  detail: string
  Icon: typeof Sparkles
  preferences: RecommendationPreferences
}> = [
  {
    id: 'light-night',
    label: 'Noche ligera',
    detail: 'Poco tiempo, baja energia y confort.',
    Icon: Moon,
    preferences: {
      medium: 'any',
      timeBudgetHours: 8,
      energy: 'low',
      intensity: 'soft',
      novelty: 'comfort',
      includePaused: false,
      surprisePercent: 15,
      seed: 'nexo-light-night',
    },
  },
  {
    id: 'weird-surprise',
    label: 'Sorpresa rara',
    detail: 'Abre pausados y sube la novedad.',
    Icon: Sparkles,
    preferences: {
      medium: 'any',
      timeBudgetHours: undefined,
      energy: 'medium',
      intensity: 'balanced',
      novelty: 'surprise',
      includePaused: true,
      surprisePercent: 75,
      seed: 'nexo-weird-surprise',
    },
  },
  {
    id: 'heavy-challenge',
    label: 'Reto con peso',
    detail: 'Mas energia, mas intensidad, menos ruido.',
    Icon: Dice5,
    preferences: {
      medium: 'any',
      timeBudgetHours: 30,
      energy: 'high',
      intensity: 'intense',
      novelty: 'balanced',
      includePaused: false,
      surprisePercent: 25,
      seed: 'nexo-heavy-challenge',
    },
  },
  {
    id: 'watch-today',
    label: 'Ver hoy',
    detail: 'Solo pantalla y una sesion corta.',
    Icon: Play,
    preferences: {
      medium: 'watch',
      timeBudgetHours: 2,
      energy: 'low',
      intensity: 'soft',
      novelty: 'balanced',
      includePaused: false,
      surprisePercent: 20,
      seed: 'nexo-watch-today',
    },
  },
]

const blankItem = (): ListItem => ({
  id: `manual-${Date.now()}`,
  title: '',
  type: 'movie',
  status: 'wishlist',
  genres: [],
  tags: [],
  moodTags: [],
  weights: DEFAULT_WEIGHTS,
  source: 'manual',
  createdAt: nowIso(),
  updatedAt: nowIso(),
})

function App() {
  const auth = useAuth()
  const library = useLibrary(auth.user)
  const [activeTab, setActiveTabState] = useState<AppTab>(() => readInitialAppTab())
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(themeStorageKey)
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_SETTINGS.theme
  })

  useEffect(() => {
    if (!auth.isFirebaseConfigured) return
    void import('./services/firebaseAnalytics')
      .then(({ initializeAnalytics }) => initializeAnalytics())
      .catch(() => undefined)
  }, [auth.isFirebaseConfigured])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  useEffect(() => {
    function syncTabFromUrl() {
      setActiveTabState(readInitialAppTab())
    }

    window.addEventListener('popstate', syncTabFromUrl)
    return () => window.removeEventListener('popstate', syncTabFromUrl)
  }, [])

  if (auth.loading) {
    return <ShellState title="Cargando acceso" />
  }

  if (auth.isFirebaseConfigured && !auth.user) {
    return (
      <ShellState
        title="Nexo privado"
        detail={auth.error}
        action={
          <button className="primary-button" type="button" onClick={auth.signIn}>
            <LogIn size={18} />
            Entrar con Google
          </button>
        }
      />
    )
  }

  const navItems: Array<{ id: AppTab; label: string; description: string; icon: typeof Library; hidden?: boolean }> = [
    { id: 'library', label: 'Biblioteca', description: 'Tus pendientes privados', icon: Library },
    { id: 'dice', label: 'Dado', description: 'Decision ponderada', icon: Dice5 },
    { id: 'explorer', label: 'Explorador', description: 'Catalogo y hallazgos', icon: Sparkles },
    { id: 'settings', label: 'Ajustes', description: 'Preferencias y cuenta', icon: Sun },
    { id: 'curation', label: 'Curacion', description: 'Catalogo Nexo', icon: ShieldCheck, hidden: !library.isModerator },
  ]
  const activeNavItem = navItems.find((item) => item.id === activeTab) ?? navItems[0]
  const shellTitle = activeTab === 'library' ? 'Biblioteca privada' : activeNavItem.label

  function changeActiveTab(nextTab: AppTab) {
    setActiveTabState(nextTab)
    writeAppTabToUrl(nextTab)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <div>
            <span className="eyebrow">Nexo 1.0 beta</span>
            <h1>{shellTitle}</h1>
            <p className="topbar-subtitle">{activeNavItem.description}</p>
          </div>
          <ShellPulse library={library} isFirebaseConfigured={auth.isFirebaseConfigured} />
        </div>
        <div className="topbar-actions">
          {!auth.isFirebaseConfigured && <span className="mode-pill">Demo local</span>}
          {library.isModerator && <span className="mode-pill moderator">{roleLabels[library.userRole]}</span>}
          <button
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="icon-button"
            type="button"
            onClick={() => {
              const nextTheme = theme === 'dark' ? 'light' : 'dark'
              setTheme(nextTheme)
              void library.saveSettings({ theme: nextTheme })
            }}
            title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {auth.user && (
            <button className="icon-button" type="button" onClick={auth.signOut} title="Salir">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      <nav className="tabbar" aria-label="Secciones de Nexo">
        {navItems
          .filter((item) => !item.hidden)
          .map((item) => {
            const Icon = item.icon
            return (
              <button
                aria-current={activeTab === item.id ? 'page' : undefined}
                aria-label={item.label}
                className={activeTab === item.id ? 'tab-button active' : 'tab-button'}
                key={item.id}
                type="button"
                onClick={() => changeActiveTab(item.id)}
              >
                <Icon size={17} />
                <span className="tab-label">
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </span>
              </button>
            )
          })}
      </nav>

      <section className="tab-stage">
        {activeTab === 'library' && <LibraryTab library={library} onNavigate={changeActiveTab} setTheme={setTheme} />}
        {activeTab === 'dice' && <DiceTab library={library} />}
        {activeTab === 'explorer' && <ExplorerTab library={library} />}
        {activeTab === 'settings' && (
          <SettingsTab library={library} onNavigate={changeActiveTab} setTheme={setTheme} theme={theme} user={auth.user} />
        )}
        {activeTab === 'curation' && library.isModerator && <CurationTab library={library} />}
      </section>
    </main>
  )
}

function ShellPulse({
  isFirebaseConfigured,
  library,
}: {
  isFirebaseConfigured: boolean
  library: Pick<LibrarySurface, 'discoveryCandidates' | 'isModerator' | 'items' | 'userRole'>
}) {
  const pulseItems = getShellPulseItems(library, isFirebaseConfigured)

  return (
    <div className="topbar-pulse" aria-label="Pulso de Nexo" data-testid="shell-pulse">
      {pulseItems.map(({ Icon, detail, label, tone, value }) => (
        <div className={`pulse-chip ${tone}`} key={label}>
          <Icon size={15} />
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </div>
  )
}

interface LibrarySurface {
  items: ListItem[]
  settings: UserSettings
  discoveryCandidates: DiscoveryCandidate[]
  userProfiles: UserProfile[]
  userRole: UserRole
  isModerator: boolean
  loading: boolean
  error?: string
  saveItem: (item: ListItem) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  deleteAllItems: () => Promise<void>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  snoozeRecommendation: (id: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
  searchPublicCatalog: (query: string, type?: string) => Promise<PublicCatalogItem[]>
  saveSettings: (settings: Partial<UserSettings>) => Promise<void>
  queueDiscoveryCandidates: (candidates: DiscoveryCandidate[]) => Promise<number>
  dismissDiscoveryCandidate: (candidateId: string) => Promise<void>
  restoreDiscoveryCandidate: (candidateId: string) => Promise<void>
  saveDiscoveryToLibrary: (candidate: DiscoveryCandidate) => Promise<ListItem>
  upsertPublicItem: (item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) => Promise<PublicCatalogItem>
  archivePublicItem: (id: string) => Promise<void>
  updateUserRole: (targetUserId: string, role: UserRole) => Promise<void>
  publicItemToDiscovery: (item: PublicCatalogItem) => DiscoveryCandidate
  externalCandidateToDiscovery: (candidate: ExternalCandidate) => DiscoveryCandidate
}

function LibraryTab({
  library,
  onNavigate,
  setTheme,
}: {
  library: LibrarySurface
  onNavigate: (tab: AppTab) => void
  setTheme: (theme: ThemeMode) => void
}) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [smartView, setSmartView] = useState<LibrarySmartView>('all')
  const [sortMode, setSortMode] = useState<LibrarySortMode>('focus')
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<ListItem | undefined>()
  const [importStatus, setImportStatus] = useState<string | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const viewMode = library.settings.libraryViewMode
  const trimmedQuery = query.trim()
  const hasActiveLibraryFilters = Boolean(trimmedQuery) || typeFilter !== 'all' || statusFilter !== 'all' || smartView !== 'all'
  const hasActiveLibraryControls = hasActiveLibraryFilters || sortMode !== 'focus'
  const smartViewOptions = useMemo(() => getLibrarySmartViewOptions(library.items), [library.items])
  const activeSmartViewLabel = smartViewOptions.find((option) => option.id === smartView)?.label
  const activeLibraryControls = [
    trimmedQuery ? `Busqueda: ${trimmedQuery}` : undefined,
    typeFilter !== 'all' ? `Tipo: ${typeLabels[typeFilter]}` : undefined,
    statusFilter !== 'all' ? `Estado: ${statusLabels[statusFilter]}` : undefined,
    smartView !== 'all' && activeSmartViewLabel ? `Vista: ${activeSmartViewLabel}` : undefined,
    sortMode !== 'focus' ? `Orden: ${librarySortLabels[sortMode]}` : undefined,
  ].filter((control): control is string => Boolean(control))
  const focusItems = useMemo(() => getLibraryFocusItems(library.items), [library.items])
  const nextFocusItem = focusItems[0]
  const nextFocusAction = nextFocusItem ? getPrimaryItemAction(nextFocusItem.status) : undefined
  const secondaryFocusItems = focusItems.slice(1)
  const showFocusShelf = !hasActiveLibraryFilters && secondaryFocusItems.length > 0

  const filteredItems = useMemo(() => {
    const matchingItems = library.items
      .filter((item) => {
        const text = `${item.title} ${item.tags.join(' ')} ${item.genres.join(' ')}`.toLowerCase()
        return text.includes(query.toLowerCase())
      })
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => matchesLibrarySmartView(item, smartView))

    return sortLibraryItems(matchingItems, sortMode)
  }, [library.items, query, smartView, sortMode, statusFilter, typeFilter])

  const stats = useMemo(() => {
    return ITEM_STATUSES.map((status) => ({
      status,
      count: library.items.filter((item) => item.status === status).length,
    }))
  }, [library.items])
  const inProgressCount = stats.find((stat) => stat.status === 'in_progress')?.count ?? 0
  const wishlistCount = stats.find((stat) => stat.status === 'wishlist')?.count ?? 0
  const queuedDiscoveryCount = library.discoveryCandidates.filter((candidate) => candidate.status === 'queued').length
  const publicCatalogCopyCount = library.items.filter((item) => Boolean(item.publicItemId)).length
  const launchGuide = useMemo(
    () => getLibraryLaunchGuide(library.items, library.discoveryCandidates),
    [library.discoveryCandidates, library.items],
  )

  async function importLibraryFile(file?: File) {
    if (!file) return

    setImportStatus('Importando biblioteca...')
    try {
      const payload = parseLibraryImportPayload(JSON.parse(await file.text()))

      for (const item of payload.items) {
        await library.saveItem(item)
      }
      if (payload.settings) {
        await library.saveSettings(payload.settings)
        setTheme(payload.settings.theme)
      }
      setImportStatus(
        payload.settings
          ? `Importadas ${payload.items.length} entradas y ajustes`
          : `Importadas ${payload.items.length} entradas`,
      )
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo importar el archivo')
    }
  }

  async function deleteEntireLibrary() {
    setImportStatus('Borrando tu biblioteca...')
    await library.deleteAllItems()
    setDeleteDialogOpen(false)
    setDeleteConfirmText('')
    setImportStatus('Tu biblioteca ha sido borrada')
  }

  async function deleteSingleItem() {
    if (!deleteTarget) return

    const deletedTitle = deleteTarget.title
    setImportStatus(`Borrando ${deletedTitle}...`)
    await library.deleteItem(deleteTarget.id)
    setDeleteTarget(undefined)
    setImportStatus(`${deletedTitle} borrado`)
  }

  function exportLibrary() {
    downloadLibraryBackup(library.items, library.settings, 'nexo-export')
  }

  async function changeViewMode(nextViewMode: LibraryViewMode) {
    if (viewMode === nextViewMode) return
    await library.saveSettings({ libraryViewMode: nextViewMode })
  }

  function resetLibraryFilters() {
    setQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setSmartView('all')
    setSortMode('focus')
  }

  return (
    <section className="content-grid">
      <section className="workspace-panel wide" aria-label="Biblioteca">
        <div className="panel-heading">
          <div>
            <h2>Biblioteca</h2>
            <p>{library.items.length} entradas privadas</p>
          </div>
          <div className="panel-actions">
            <button className="primary-button" type="button" onClick={() => setEditingItem(blankItem())}>
              <Plus size={18} />
              Anadir
            </button>
            <div className="view-switch" role="group" aria-label="Vista de biblioteca">
              <button
                aria-pressed={viewMode === 'cards'}
                className={viewMode === 'cards' ? 'segment-option active' : 'segment-option'}
                type="button"
                onClick={() => void changeViewMode('cards')}
              >
                <LayoutGrid size={16} />
                <span>Tarjetas</span>
              </button>
              <button
                aria-pressed={viewMode === 'list'}
                className={viewMode === 'list' ? 'segment-option active' : 'segment-option'}
                type="button"
                onClick={() => void changeViewMode('list')}
              >
                <List size={16} />
                <span>Lista</span>
              </button>
            </div>
            <div className="utility-actions" aria-label="Herramientas de biblioteca">
              <label className="icon-button file-button" title="Importar">
                <Upload size={18} />
                <span className="sr-only">Importar</span>
                <input
                  accept="application/json,.json"
                  aria-label="Importar biblioteca desde JSON"
                  type="file"
                  onChange={(event) => {
                    void importLibraryFile(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
              <button className="icon-button" type="button" onClick={exportLibrary} title="Exportar">
                <Archive size={18} />
                <span className="sr-only">Exportar</span>
              </button>
              <button
                className="icon-button danger-icon"
                disabled={library.items.length === 0}
                type="button"
                onClick={() => setDeleteDialogOpen(true)}
                title="Borrar todo"
              >
                <Trash2 size={18} />
                <span className="sr-only">Borrar todo</span>
              </button>
            </div>
          </div>
        </div>

        <LaunchGuideCard
          guide={launchGuide}
          onAdd={() => setEditingItem(blankItem())}
          onEditItem={(item) => setEditingItem(item)}
          onNavigate={onNavigate}
        />

        <section className="library-overview" aria-label="Resumen de biblioteca" data-testid="library-overview">
          <article className="library-next-card">
            <span className="eyebrow">Siguiente accion</span>
            {nextFocusItem && nextFocusAction ? (
              <>
                <div>
                  <strong>{nextFocusItem.title}</strong>
                  <p>{getLibraryFocusReason(nextFocusItem)}</p>
                </div>
                <LibraryNextPlan item={nextFocusItem} />
                <div className="library-next-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void library.setStatus(nextFocusItem.id, nextFocusAction.nextStatus)}
                  >
                    <nextFocusAction.Icon size={16} />
                    {nextFocusAction.label}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setEditingItem(nextFocusItem)}>
                    <Info size={16} />
                    Afinar ficha
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <strong>Biblioteca lista</strong>
                  <p>Anade algo o guarda hallazgos desde Explorador para alimentar el dado.</p>
                </div>
                <button className="primary-button" type="button" onClick={() => setEditingItem(blankItem())}>
                  <Plus size={16} />
                  Anadir entrada
                </button>
              </>
            )}
          </article>
          <div className="library-overview-metrics">
            <div>
              <span>En curso</span>
              <strong>{inProgressCount}</strong>
              <small>para continuar</small>
            </div>
            <div>
              <span>Pendientes</span>
              <strong>{wishlistCount}</strong>
              <small>en la lista</small>
            </div>
            <div>
              <span>Explorador</span>
              <strong>{queuedDiscoveryCount}</strong>
              <small>en cola</small>
            </div>
            <div>
              <span>Nexo</span>
              <strong>{publicCatalogCopyCount}</strong>
              <small>copias publicas</small>
            </div>
          </div>
        </section>

        <div className="stats-row">
          <button
            className={statusFilter === 'all' ? 'stat-chip active' : 'stat-chip'}
            data-status="all"
            type="button"
            onClick={() => setStatusFilter('all')}
          >
            <span>Todo</span>
            <strong>{library.items.length}</strong>
          </button>
          {stats.map((stat) => (
            <button
              className={statusFilter === stat.status ? 'stat-chip active' : 'stat-chip'}
              data-status={stat.status}
              key={stat.status}
              type="button"
              onClick={() => setStatusFilter(stat.status)}
            >
              <span>{statusLabels[stat.status]}</span>
              <strong>{stat.count}</strong>
            </button>
          ))}
        </div>

        <section className="library-smart-views" aria-label="Vistas inteligentes de biblioteca" data-testid="library-smart-views">
          {smartViewOptions.map((option) => (
            <button
              aria-pressed={smartView === option.id}
              className={smartView === option.id ? 'library-smart-view active' : 'library-smart-view'}
              key={option.id}
              type="button"
              onClick={() => setSmartView(option.id)}
            >
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
              <em>{option.count}</em>
            </button>
          ))}
        </section>

        <div className="toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar en biblioteca"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar titulo, genero o tag"
            />
          </label>
          <select
            aria-label="Filtrar por tipo"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ItemType | 'all')}
          >
            <option value="all">Todos los tipos</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
          <select
            aria-label="Ordenar biblioteca"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as LibrarySortMode)}
          >
            {(Object.keys(librarySortLabels) as LibrarySortMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {librarySortLabels[mode]}
              </option>
            ))}
          </select>
        </div>

        {hasActiveLibraryControls && (
          <div className="filter-summary" aria-live="polite">
            <div>
              <strong>
                {filteredItems.length} de {library.items.length} entradas
              </strong>
              <span>{activeLibraryControls.join(' / ')}</span>
            </div>
            <button className="ghost-button" type="button" onClick={resetLibraryFilters}>
              <X size={16} />
              Restablecer vista
            </button>
          </div>
        )}

        {library.loading && <FeedbackMessage tone="loading">Cargando biblioteca...</FeedbackMessage>}
        {library.error && <FeedbackMessage tone="danger">{library.error}</FeedbackMessage>}
        {importStatus && <FeedbackMessage tone={feedbackToneFromText(importStatus)}>{importStatus}</FeedbackMessage>}

        {showFocusShelf && (
          <section className="library-focus-shelf" aria-label="Foco de biblioteca" data-testid="library-focus-shelf">
            <div className="focus-shelf-heading">
              <div>
                <h3>En foco</h3>
                <p>Mas entradas listas sin abrir toda la parrilla.</p>
              </div>
              <span>{secondaryFocusItems.length} sugeridas</span>
            </div>
            <div className="focus-shelf-grid">
              {secondaryFocusItems.map((item) => {
                const primaryAction = getPrimaryItemAction(item.status)
                const Icon = typeIcons[item.type]

                return (
                  <article className="focus-item" key={item.id}>
                    <button className="focus-item-main" type="button" onClick={() => setEditingItem(item)}>
                      <span className={`focus-type-dot ${item.type}`} aria-hidden="true">
                        <Icon size={15} />
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{getLibraryFocusReason(item)}</small>
                      </span>
                    </button>
                    <button
                      className="focus-item-action"
                      type="button"
                      aria-label={`Accion de foco para ${item.title}: ${primaryAction.label}`}
                      onClick={() => void library.setStatus(item.id, primaryAction.nextStatus)}
                    >
                      <primaryAction.Icon size={15} />
                      {primaryAction.label}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {filteredItems.length ? (
          <div className={viewMode === 'list' ? 'item-grid list-view' : 'item-grid'} data-testid="library-grid">
            {filteredItems.map((item) => (
              <ItemCard
                item={item}
                key={item.id}
                layout={viewMode}
                onEdit={() => setEditingItem(item)}
                onStatus={library.setStatus}
                onDelete={() => setDeleteTarget(item)}
              />
            ))}
          </div>
        ) : library.loading ? null : (
          <EmptyState
            icon={hasActiveLibraryFilters ? Search : Library}
            title={hasActiveLibraryFilters ? 'Sin resultados' : 'Nada por aqui'}
            detail={
              hasActiveLibraryFilters
                ? 'Limpia filtros o prueba una busqueda menos concreta para volver a ver tu biblioteca.'
                : 'Importa tu biblioteca, guarda algo desde Explorador o anade una entrada manual.'
            }
            action={
              hasActiveLibraryFilters ? (
                <button className="secondary-button" type="button" onClick={resetLibraryFilters}>
                  <X size={16} />
                  Quitar filtros
                </button>
              ) : (
                <button className="primary-button" type="button" onClick={() => setEditingItem(blankItem())}>
                  <Plus size={16} />
                  Crear primera entrada
                </button>
              )
            }
          />
        )}
      </section>

      <aside className="insight-rail">
        <MetricCard label="Pendientes" value={stats.find((stat) => stat.status === 'wishlist')?.count ?? 0} />
        <MetricCard label="En progreso" value={stats.find((stat) => stat.status === 'in_progress')?.count ?? 0} />
        <MetricCard label="Explorador" value={library.discoveryCandidates.filter((candidate) => candidate.status === 'queued').length} />
      </aside>

      {editingItem && (
        <ItemEditor
          item={editingItem}
          onClose={() => setEditingItem(undefined)}
          onSave={async (item) => {
            await library.saveItem(item)
            setEditingItem(undefined)
          }}
        />
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <form
            aria-labelledby="delete-item-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onSubmit={(event) => {
              event.preventDefault()
              void deleteSingleItem()
            }}
          >
            <div>
              <h2 id="delete-item-title">Borrar entrada</h2>
              <p>Vas a eliminar {deleteTarget.title} de tu biblioteca privada. El catalogo publico no cambia.</p>
            </div>
            <div className="action-row end">
              <button className="ghost-button" type="button" onClick={() => setDeleteTarget(undefined)}>
                Cancelar
              </button>
              <button className="danger-button" type="submit">
                <Trash2 size={16} />
                Borrar entrada
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            aria-labelledby="delete-all-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onSubmit={(event) => {
              event.preventDefault()
              if (deleteConfirmText === 'BORRAR') void deleteEntireLibrary()
            }}
          >
            <div>
              <h2 id="delete-all-title">Borrar toda la biblioteca</h2>
              <p>Esto elimina tus entradas privadas. Escribe BORRAR para confirmar.</p>
            </div>
            <label>
              Confirmacion
              <input
                autoFocus
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="BORRAR"
              />
            </label>
            <div className="action-row end">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setDeleteConfirmText('')
                }}
              >
                Cancelar
              </button>
              <button className="danger-button" disabled={deleteConfirmText !== 'BORRAR'} type="submit">
                <Trash2 size={16} />
                Borrar todo
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function DiceTab({ library }: { library: LibrarySurface }) {
  const [draftPreferences, setDraftPreferences] = useState<RecommendationPreferences | undefined>()
  const [recommendation, setRecommendation] = useState<RecommendationResult | undefined>()
  const [isRolling, setIsRolling] = useState(false)
  const [showFullDicePool, setShowFullDicePool] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const persistedPreferences = library.settings.recommendationPreferences ?? DEFAULT_RECOMMENDATION_PREFERENCES
  const preferences = draftPreferences ?? persistedPreferences
  const hasUnsavedDicePreferences = !sameRecommendationPreferences(preferences, persistedPreferences)
  const scoredCandidates = useMemo(
    () => scoreCandidates(library.items, preferences, library.settings),
    [library.items, library.settings, preferences],
  )
  const eligibilityBreakdown = useMemo(
    () => getDiceEligibilityBreakdown(library.items, preferences, library.settings),
    [library.items, library.settings, preferences],
  )
  const candidatePreview = showFullDicePool ? scoredCandidates : scoredCandidates.slice(0, 4)
  const hiddenCandidateCount = Math.max(0, scoredCandidates.length - candidatePreview.length)
  const maxCandidateScore = scoredCandidates[0]?.score ?? 1
  const topCandidate = scoredCandidates[0]
  const unavailableCount = Math.max(0, library.items.length - scoredCandidates.length)
  const poolSize = Math.min(scoredCandidates.length, Math.max(3, Math.ceil(3 + preferences.surprisePercent / 8)))
  const activeDiceFilters = getActiveDiceFilters(preferences, library.settings)
  const recentRecommendations = useMemo(() => getRecentRecommendationItems(library.items), [library.items])
  const hasCandidates = scoredCandidates.length > 0
  const diceRecoveryActions: DiceRecoveryAction[] = [
    {
      detail: 'Todo + pausados',
      Icon: RotateCcw,
      id: 'open-pool',
      label: 'Abrir abanico',
      onClick: () => setPreferences((current) => ({ ...current, includePaused: true, medium: 'any' })),
    },
    {
      detail: 'Sin limite de horas',
      Icon: X,
      id: 'clear-time',
      label: 'Quitar tiempo',
      onClick: () => setPreferences((current) => ({ ...current, timeBudgetHours: undefined })),
    },
    {
      detail: 'Preset raro',
      Icon: Sparkles,
      id: 'surprise',
      label: 'Sorpresa amplia',
      onClick: () => applyDicePreset(dicePreferencePresets.find((preset) => preset.id === 'weird-surprise')?.preferences ?? preferences),
    },
  ]
  const setPreferences = (
    update: RecommendationPreferences | ((current: RecommendationPreferences) => RecommendationPreferences),
  ) => {
    setStatus(undefined)
    setDraftPreferences((current) => (typeof update === 'function' ? update(current ?? preferences) : update))
  }

  async function rollRecommendation() {
    if (!hasCandidates) {
      setRecommendation(undefined)
      setStatus('No hay candidatas disponibles con estos filtros.')
      return
    }

    setIsRolling(true)
    setStatus(undefined)
    setRecommendation(undefined)
    const next = recommendItem(
      library.items,
      {
        ...preferences,
        seed: `${preferences.seed}-${Date.now()}`,
      },
      library.settings,
    )
    window.setTimeout(() => {
      setIsRolling(false)
      setRecommendation(next)
    }, 420)
    if (next) await library.recordRecommendation(next.item.id, next.reasons)
  }

  async function savePreferences() {
    if (!hasUnsavedDicePreferences) return
    await library.saveSettings({
      recommendationPreferences: preferences,
      surprisePercent: preferences.surprisePercent,
      allowPausedByDefault: preferences.includePaused,
    })
    setDraftPreferences(undefined)
    setStatus('Ajustes del dado guardados')
  }

  async function startRecommendation() {
    if (!recommendation) return
    try {
      await library.setStatus(recommendation.item.id, 'in_progress')
      setStatus(`${recommendation.item.title} marcado como en progreso.`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el estado.')
    }
  }

  async function skipRecommendation() {
    if (!recommendation) return
    try {
      await library.snoozeRecommendation(recommendation.item.id)
      setStatus(`${recommendation.item.title} queda fuera hasta manana.`)
      setRecommendation(undefined)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo apartar la recomendacion.')
    }
  }

  function applyDicePreset(preferencesPreset: RecommendationPreferences) {
    setPreferences(preferencesPreset)
  }

  return (
    <section className="dice-layout">
      <section className="workspace-panel dice-hero" aria-label="Dado ponderado">
        <div>
          <span className="eyebrow">Dado ponderado</span>
          <h2>Elige el siguiente hilo</h2>
          <p className="hero-copy">Una tirada con memoria: filtra por tiempo, energia y novedad sin perder sorpresa.</p>
          <div className="dice-context">
            <span>{typeLabels[preferences.medium]}</span>
            <span>{preferences.timeBudgetHours ? `${preferences.timeBudgetHours}h` : 'Sin limite'}</span>
            <span>Energia {energyLabels[preferences.energy]}</span>
            <span>{noveltyLabels[preferences.novelty]}</span>
          </div>
          <div className="dice-readiness" aria-label="Resumen del dado" data-testid="dice-readiness">
            <div className={hasCandidates ? 'dice-readiness-card ready' : 'dice-readiness-card warning'}>
              <span>{hasCandidates ? 'Listo para tirar' : 'Sin tirada posible'}</span>
              <strong>{topCandidate ? topCandidate.item.title : 'Ajusta filtros'}</strong>
              <small>
                {topCandidate
                  ? `${topCandidate.score} score / ${topCandidate.reasons[0] ?? 'mejor candidata'}`
                  : 'Afloja medio, tiempo, tags o pausados.'}
              </small>
            </div>
            <div className="dice-readiness-metrics">
              <span>
                <strong>{scoredCandidates.length}</strong>
                Candidatas
              </span>
              <span>
                <strong>{poolSize}</strong>
                Pool
              </span>
              <span>
                <strong>{activeDiceFilters.length}</strong>
                Filtros
              </span>
              <span>
                <strong>{hasUnsavedDicePreferences ? '!' : 'OK'}</strong>
                Ajustes
              </span>
            </div>
          </div>
        </div>
        <button
          className={isRolling ? 'dice-orb rolling' : 'dice-orb'}
          disabled={isRolling || !hasCandidates}
          type="button"
          onClick={rollRecommendation}
          data-testid="roll-button"
          aria-label="Tirar dado ponderado"
        >
          <Dice5 size={42} />
        </button>
      </section>

      <section className="workspace-panel dice-queue">
        <div className="panel-heading compact">
          <div>
            <h2>En la mesa</h2>
            <p>{scoredCandidates.length ? `${scoredCandidates.length} opciones pueden salir` : 'Sin candidatas con estos filtros'}</p>
          </div>
        </div>
        {candidatePreview.length ? (
          <ol className="dice-candidate-list" aria-label="Candidatas del dado" data-testid="dice-candidate-list">
            {candidatePreview.map((candidate, index) => {
              const Icon = typeIcons[candidate.item.type]

              return (
              <li key={candidate.item.id}>
                <span className="dice-candidate-rank">#{index + 1}</span>
                <span className={`dice-candidate-type ${candidate.item.type}`} aria-hidden="true">
                  <Icon size={14} />
                </span>
                <span className="dice-candidate-main">
                  <strong>{candidate.item.title}</strong>
                  <small>
                    {statusLabels[candidate.item.status]} / {typeLabels[candidate.item.type]}
                  </small>
                  <span className="dice-candidate-reasons">
                    {candidate.reasons.slice(0, 2).map((reason) => (
                      <em key={reason}>{reason}</em>
                    ))}
                  </span>
                </span>
                <span className="dice-candidate-score" aria-label={`Score ${candidate.score} de ${candidate.item.title}`}>
                  <span>Score</span>
                  <strong>{candidate.score}</strong>
                  <span className="dice-score-meter" aria-hidden="true">
                    <span style={{ width: getDiceScoreMeterWidth(candidate.score, maxCandidateScore) }} />
                  </span>
                </span>
              </li>
              )
            })}
          </ol>
        ) : (
          <EmptyState
            icon={Dice5}
            title="Sin candidatas"
            detail="Afloja filtros, incluye pausados o anade pendientes desde Biblioteca y Explorador."
          />
        )}
        {scoredCandidates.length > 4 && (
          <button className="ghost-button dice-expand-button" type="button" onClick={() => setShowFullDicePool((current) => !current)}>
            {showFullDicePool ? 'Ver menos candidatas' : `Ver ${hiddenCandidateCount} mas`}
          </button>
        )}
        <div className="dice-footnotes">
          <span>{unavailableCount} fuera por estado, cooldown o filtros</span>
          <span>Pool maximo {poolSize}</span>
        </div>
        <DiceEligibilityPanel
          activeFilters={activeDiceFilters}
          breakdown={eligibilityBreakdown}
          recoveryActions={diceRecoveryActions}
        />
      </section>

      <section className="workspace-panel dice-settings">
        <div className="panel-heading">
          <div>
            <h2>Preferencias</h2>
            <p>{preferences.surprisePercent}% sorpresa / {intensityLabels[preferences.intensity]}</p>
          </div>
          <button className="secondary-button" disabled={!hasUnsavedDicePreferences} type="button" onClick={savePreferences}>
            <Save size={17} />
            {hasUnsavedDicePreferences ? 'Guardar ajustes' : 'Ajustes guardados'}
          </button>
        </div>
        <div className={hasUnsavedDicePreferences ? 'settings-status pending' : 'settings-status'}>
          <span>{hasUnsavedDicePreferences ? 'Cambios pendientes' : 'Sin cambios pendientes'}</span>
          <strong>{scoredCandidates.length} candidatas</strong>
        </div>
        <div className="dice-preset-grid" aria-label="Presets rapidos del dado">
          {dicePreferencePresets.map((preset) => {
            const isActive = sameRecommendationPreferences(preferences, preset.preferences)

            return (
              <button
                aria-label={`Aplicar preset ${preset.label}`}
                aria-pressed={isActive}
                className={isActive ? 'dice-preset-card active' : 'dice-preset-card'}
                key={preset.id}
                type="button"
                onClick={() => applyDicePreset(preset.preferences)}
              >
                <preset.Icon size={16} />
                <span>
                  <strong>{preset.label}</strong>
                  <small>{preset.detail}</small>
                </span>
              </button>
            )
          })}
        </div>
        <PreferenceControls preferences={preferences} setPreferences={setPreferences} />
        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
      </section>

      <section className="workspace-panel result-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Resultado</h2>
            <p>{recommendation ? `Score ${recommendation.score}` : isRolling ? 'Tirada en curso' : 'Sin tirada todavia'}</p>
          </div>
        </div>

        {isRolling ? (
          <div className="recommendation-result rolling-result" data-testid="recommendation-result">
            <Dice5 size={30} />
            <strong>El dado esta eligiendo...</strong>
            <div className="dice-roll-track" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <FeedbackMessage>Barajando {scoredCandidates.length} opciones disponibles.</FeedbackMessage>
          </div>
        ) : recommendation ? (
          <div className="recommendation-result revealed-result" data-testid="recommendation-result">
            <div className="recommendation-head">
              <CoverArt title={recommendation.item.title} type={recommendation.item.type} posterUrl={recommendation.item.posterUrl} />
              <div className="recommendation-summary">
                <ItemIdentity item={recommendation.item} />
                <div className="recommendation-scoreboard" aria-label="Detalle de tirada">
                  <div className="score-card primary">
                    <span>Score</span>
                    <strong>{recommendation.score}</strong>
                  </div>
                  <div className="score-card">
                    <span>Pool</span>
                    <strong>{recommendation.poolSize}</strong>
                  </div>
                  <div className="score-card">
                    <span>Roll</span>
                    <strong>{Math.round(recommendation.roll * 100)}%</strong>
                  </div>
                </div>
              </div>
            </div>
            <RecommendationSessionPlanView plan={getRecommendationSessionPlan(recommendation, preferences)} />
            <section className="reason-stack" aria-label="Razones de la recomendacion">
              <h3>Por que sale</h3>
              <ul>
                {recommendation.reasons.map((reason) => (
                  <li key={reason}>
                    <CheckCircle2 size={15} />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="recommendation-decision" aria-label="Decision de la tirada">
              <div>
                <span className="eyebrow">Decision</span>
                <strong>Te lo llevas ahora?</strong>
                <p>Empezar lo marca en curso. No hoy lo aparta hasta manana para que el dado no insista.</p>
              </div>
              <div className="action-row recommendation-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={startRecommendation}
                >
                  <Play size={16} />
                  Empezar
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={skipRecommendation}
                >
                  <X size={16} />
                  No hoy
                </button>
              </div>
            </section>
          </div>
        ) : !hasCandidates ? (
          <EmptyState
            icon={AlertTriangle}
            tone="warning"
            title="No hay tirada posible"
            detail="Cambia medio, tiempo, tags bloqueados o incluye pausados para abrir el abanico."
          />
        ) : (
          <EmptyState icon={Dice5} title="El dado espera" detail="Ajusta el clima de la sesion y tira cuando quieras una recomendacion." />
        )}

        <section className="recent-rolls" aria-label="Tiradas recientes" data-testid="recent-rolls">
          <div className="recent-rolls-heading">
            <h3>Tiradas recientes</h3>
            <span>{recentRecommendations.length ? `${recentRecommendations.length} ultimas` : 'Sin memoria aun'}</span>
          </div>
          {recentRecommendations.length ? (
            <ol className="recent-roll-list">
              {recentRecommendations.map((item) => {
                const Icon = typeIcons[item.type]

                return (
                  <li key={item.id}>
                    <span className={`recent-roll-icon ${item.type}`}>
                      <Icon size={14} />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{formatRecentRecommendationTime(item.lastRecommendedAt)}</small>
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="muted-line">Las tiradas guardadas apareceran aqui despues de usar el dado.</p>
          )}
        </section>
      </section>
    </section>
  )
}

function ExplorerTab({ library }: { library: LibrarySurface }) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DiscoveryStatus>('queued')
  const [sourceFilter, setSourceFilter] = useState<ExplorerSourceFilter>('all')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [selected, setSelected] = useState<DiscoveryCandidate | undefined>()
  const [catalogDraft, setCatalogDraft] = useState<PublicCatalogItem | undefined>()
  const type = library.settings.explorerDefaultType
  const explorerDecision = useMemo(
    () => getExplorerDecisionState(library.discoveryCandidates, view, sourceFilter),
    [library.discoveryCandidates, sourceFilter, view],
  )
  const {
    activeSourceLabel,
    canDismissVisibleQueue,
    candidatesInView,
    decisionProgressPercent,
    decisionSummaryDetail,
    decisionSummaryTitle,
    discoveryCounts,
    dominantSourceLabel,
    feedCandidates,
    isSourceFilteredEmpty,
    queuedSourceCounts,
    sourceCounts,
    spotlightCandidate,
    totalDiscoveryCount,
    visibleCandidates,
  } = explorerDecision
  const queuedNexoCount = queuedSourceCounts.nexo
  const queuedExternalCount = queuedSourceCounts.external
  const queuedPromptCount = queuedSourceCounts.prompt

  async function changeSearchType(nextType: ExplorerSearchType) {
    setMessage(undefined)
    try {
      await library.saveSettings({ explorerDefaultType: nextType })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar el tipo de busqueda.')
    }
  }

  async function runDiscoverySearch() {
    const cleanedQuery = query.trim()
    setMessage(undefined)
    if (cleanedQuery.length < 2) {
      setMessage('Escribe al menos 2 caracteres para buscar.')
      return
    }

    setLoading(true)
    try {
      const [publicItems, externalCandidates] = await Promise.all([
        library.searchPublicCatalog(cleanedQuery, type),
        library.searchExternal(cleanedQuery, type),
      ])
      const candidates = [
        ...publicItems.map(library.publicItemToDiscovery),
        ...externalCandidates.map(library.externalCandidateToDiscovery),
      ]
      const queuedCount = await library.queueDiscoveryCandidates(candidates)
      setView('queued')
      setMessage(
        !candidates.length
          ? 'Sin resultados para esa busqueda.'
          : queuedCount
            ? `${queuedCount} hallazgos enviados a la cola.`
            : 'No hay hallazgos nuevos para esa busqueda.',
      )
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo completar la busqueda.')
    } finally {
      setLoading(false)
    }
  }

  async function addPromptCard() {
    try {
      const title = promptDeck[Math.floor(Math.random() * promptDeck.length)]
      await library.queueDiscoveryCandidates([promptToDiscovery(title)])
      setView('queued')
      setMessage('Carta de exploracion anadida.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo anadir la carta.')
    }
  }

  async function saveCandidate(candidate: DiscoveryCandidate) {
    try {
      const item = await library.saveDiscoveryToLibrary(candidate)
      setMessage(`${item.title} guardado en Biblioteca.`)
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar el hallazgo.')
      return false
    }
  }

  async function dismissCandidate(candidate: DiscoveryCandidate) {
    try {
      await library.dismissDiscoveryCandidate(candidate.id)
      setMessage(`${candidate.title} descartado de la cola.`)
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo descartar el hallazgo.')
      return false
    }
  }

  async function restoreCandidate(candidate: DiscoveryCandidate) {
    try {
      await library.restoreDiscoveryCandidate(candidate.id)
      setView('queued')
      setMessage(`${candidate.title} recuperado a la cola.`)
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo recuperar el hallazgo.')
      return false
    }
  }

  async function dismissVisibleQueue() {
    const candidatesToDismiss = view === 'queued' ? visibleCandidates : []
    if (!candidatesToDismiss.length) return

    try {
      await Promise.all(candidatesToDismiss.map((candidate) => library.dismissDiscoveryCandidate(candidate.id)))
      setMessage(
        candidatesToDismiss.length === 1
          ? `${candidatesToDismiss[0].title} descartado de la vista ${activeSourceLabel}.`
          : `${candidatesToDismiss.length} hallazgos descartados de la vista ${activeSourceLabel}.`,
      )
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo limpiar la vista.')
    }
  }

  async function saveSelectedCandidate(candidate: DiscoveryCandidate) {
    if (await saveCandidate(candidate)) setSelected(undefined)
  }

  async function dismissSelectedCandidate(candidate: DiscoveryCandidate) {
    if (await dismissCandidate(candidate)) setSelected(undefined)
  }

  async function restoreSelectedCandidate(candidate: DiscoveryCandidate) {
    if (await restoreCandidate(candidate)) setSelected(undefined)
  }

  function openCatalogDraft(candidate: DiscoveryCandidate) {
    setSelected(undefined)
    setCatalogDraft(publicCatalogDraftFromCandidate(candidate))
  }

  async function saveCatalogDraft(item: PublicCatalogItem, options?: { createAnother?: boolean }) {
    try {
      const savedItem = await library.upsertPublicItem(item)
      setCatalogDraft(options?.createAnother ? blankPublicCatalogItem(savedItem.type) : undefined)
      setMessage(`${savedItem.title} guardado en catalogo Nexo.`)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar en el catalogo publico.')
    }
  }

  const emptyExplorerAction = isSourceFilteredEmpty ? undefined : view === 'queued' ? (
    <button className="secondary-button" type="button" onClick={addPromptCard}>
      <Sparkles size={16} />
      Anadir carta sorpresa
    </button>
  ) : undefined

  return (
    <section className="content-grid">
      <section className="workspace-panel wide">
        <div className="explorer-command">
          <div className="explorer-command-heading">
            <div>
              <span className="eyebrow">Explorador</span>
              <h2>Encuentra la proxima entrada</h2>
              <p>Busca en Nexo y APIs publicas, manda resultados a una cola y decide sin ensuciar tu biblioteca.</p>
            </div>
            <button className="secondary-button" type="button" onClick={addPromptCard}>
              <Sparkles size={17} />
              Carta sorpresa
            </button>
          </div>

          <form
            className="explorer-search explorer-command-search"
            onSubmit={(event) => {
              event.preventDefault()
              void runDiscoverySearch()
            }}
          >
            <label className="search-field explorer-query-field">
              <Search size={18} />
              <input
                aria-label="Buscar en explorador"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Odisea, Arrival, metroidvania raro..."
              />
            </label>
            <select
              aria-label="Tipo de busqueda en explorador"
              value={type}
              onChange={(event) => void changeSearchType(event.target.value as ExplorerSearchType)}
            >
              <option value="any">Todo</option>
              <option value="watch">Ver</option>
              <option value="game">Juego</option>
              <option value="book">Libro</option>
              <option value="anime">Anime</option>
              <option value="manga">Manga</option>
              <option value="manhwa">Manhwa</option>
            </select>
            <button className="primary-button" disabled={loading} type="submit">
              <Search size={18} />
              {loading ? 'Buscando' : 'Buscar'}
            </button>
          </form>

          <div className="explorer-command-summary" aria-label="Resumen del explorador">
            <span>
              <strong>{discoveryCounts.queued}</strong>
              Cola
            </span>
            <span>
              <strong>{discoveryCounts.saved}</strong>
              Guardados
            </span>
            <span>
              <strong>{discoveryCounts.dismissed}</strong>
              Descartes
            </span>
            <span>
              <strong>{totalDiscoveryCount}</strong>
              Historial
            </span>
          </div>
        </div>

        {loading && <FeedbackMessage tone="loading">Buscando en Nexo y fuera...</FeedbackMessage>}
        {message && <FeedbackMessage tone={feedbackToneFromText(message)}>{message}</FeedbackMessage>}

        <div className="explorer-control-deck">
          <div className="explorer-status-strip" role="tablist" aria-label="Estado de descubrimiento">
            {(['queued', 'saved', 'dismissed'] as const).map((status) => (
              <button
                aria-selected={view === status}
                className={view === status ? 'stat-chip active' : 'stat-chip'}
                data-status={status}
                key={status}
                role="tab"
                type="button"
                onClick={() => setView(status)}
              >
                <span>{discoveryStatusLabels[status]}</span>
                <strong>{discoveryCounts[status]}</strong>
              </button>
            ))}
          </div>

          <div className="explorer-source-strip" role="group" aria-label="Filtrar descubrimientos por origen">
            {explorerSourceFilters.map((filter) => (
              <button
                aria-pressed={sourceFilter === filter.id}
                className={sourceFilter === filter.id ? 'source-filter-chip active' : 'source-filter-chip'}
                key={filter.id}
                type="button"
                onClick={() => setSourceFilter(filter.id)}
              >
                <span>{filter.label}</span>
                <small>{filter.detail}</small>
                <strong>{sourceCounts[filter.id]}</strong>
              </button>
            ))}
          </div>
        </div>

        <section className="explorer-decision-panel" aria-label="Estado de decision del explorador" data-testid="explorer-decision-panel">
          <div className="explorer-decision-main">
            <div>
              <span className="eyebrow">Bandeja activa</span>
              <strong>{decisionSummaryTitle}</strong>
              <p>{decisionSummaryDetail}</p>
            </div>
            <div className="explorer-progress-badge">
              <strong>{decisionProgressPercent}%</strong>
              <span>historial decidido</span>
            </div>
          </div>
          <div
            aria-label={`Progreso de decision ${decisionProgressPercent}%`}
            className="explorer-decision-meter"
            role="meter"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={decisionProgressPercent}
          >
            <span style={{ width: `${decisionProgressPercent}%` }} />
          </div>
          <div className="explorer-decision-facts">
            <span>
              <strong>{spotlightCandidate?.title ?? 'Sin siguiente'}</strong>
              Siguiente
            </span>
            <span>
              <strong>{dominantSourceLabel}</strong>
              Origen fuerte
            </span>
            <span>
              <strong>{activeSourceLabel}</strong>
              Filtro
            </span>
          </div>
          <div className="explorer-decision-actions">
            {sourceFilter !== 'all' && (
              <button className="secondary-button" type="button" onClick={() => setSourceFilter('all')}>
                Ver todos los origenes
              </button>
            )}
            {canDismissVisibleQueue && (
              <button className="ghost-button danger-ghost" type="button" onClick={() => void dismissVisibleQueue()}>
                <X size={16} />
                Descartar vista
              </button>
            )}
          </div>
        </section>

        <div className="candidate-feed-header">
          <div>
            <h3>{spotlightCandidate ? 'Bandeja de decision' : discoveryStatusLabels[view]}</h3>
            <p>
              {spotlightCandidate
                ? 'Decide primero el hallazgo superior; el resto espera debajo.'
                : view === 'queued'
                ? 'Revisa, guarda o descarta sin mezclarlo con tu biblioteca privada.'
                : 'Historial ligero de decisiones del explorador.'}
            </p>
          </div>
          <span className="feed-count-pill">
            {visibleCandidates.length} / {candidatesInView.length} {activeSourceLabel}
          </span>
        </div>

        {spotlightCandidate && (
          <section className="candidate-spotlight" aria-label="Hallazgo destacado" data-testid="candidate-spotlight">
            <div className="candidate-spotlight-media">
              <CoverArt title={spotlightCandidate.title} type={spotlightCandidate.type} posterUrl={spotlightCandidate.posterUrl} />
            </div>
            <div className="candidate-spotlight-body">
              <div className="candidate-meta">
                <span className="source-pill">{sourceLabels[spotlightCandidate.source]}</span>
                <span>{typeLabels[spotlightCandidate.type]}</span>
                {spotlightCandidate.releaseYear && <span>{spotlightCandidate.releaseYear}</span>}
              </div>
              <span className="eyebrow">Siguiente hallazgo</span>
              <h3>{spotlightCandidate.title}</h3>
              <p>{spotlightCandidate.overview || `${typeLabels[spotlightCandidate.type]} para explorar`}</p>
              <div className="tag-row">
                {spotlightCandidate.genres.slice(0, 4).map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
              <CandidateDecisionBriefView brief={getCandidateDecisionBrief(spotlightCandidate, library.isModerator)} />
            </div>
            <div className="candidate-spotlight-actions" aria-label={`Decidir ${spotlightCandidate.title}`}>
              <button className="primary-button" type="button" onClick={() => void saveCandidate(spotlightCandidate)} aria-label={`Guardar ${spotlightCandidate.title}`}>
                <Plus size={17} />
                Guardar
              </button>
              <button className="secondary-button" type="button" onClick={() => setSelected(spotlightCandidate)} aria-label={`Abrir ficha ${spotlightCandidate.title}`}>
                <Eye size={17} />
                Detalles
              </button>
              <button className="ghost-button danger-ghost" type="button" onClick={() => void dismissCandidate(spotlightCandidate)} aria-label={`Descartar ${spotlightCandidate.title}`}>
                <X size={17} />
                Descartar
              </button>
              {library.isModerator && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => openCatalogDraft(spotlightCandidate)}
                  aria-label={`${spotlightCandidate.source === 'nexo' ? 'Editar catalogo' : 'Crear catalogo'} ${spotlightCandidate.title}`}
                >
                  <ShieldCheck size={17} />
                  Catalogo
                </button>
              )}
            </div>
          </section>
        )}

        {visibleCandidates.length ? (
          <div className="candidate-grid">
            {feedCandidates.map((candidate) => (
              <DiscoveryCard
                candidate={candidate}
                key={candidate.id}
                onDetails={() => setSelected(candidate)}
                onDismiss={() => dismissCandidate(candidate)}
                onRestore={() => restoreCandidate(candidate)}
                onSave={() => saveCandidate(candidate)}
                onCurate={library.isModerator ? () => openCatalogDraft(candidate) : undefined}
              />
            ))}
            {!feedCandidates.length && spotlightCandidate && (
              <p className="candidate-feed-note">No hay mas hallazgos en esta vista.</p>
            )}
          </div>
        ) : (
          <EmptyState
            icon={view === 'queued' ? Sparkles : view === 'saved' ? CheckCircle2 : X}
            tone={view === 'dismissed' ? 'muted' : 'neutral'}
            title={isSourceFilteredEmpty ? `Sin resultados ${activeSourceLabel}` : discoveryEmptyCopy[view].title}
            detail={
              isSourceFilteredEmpty
                ? 'Este estado tiene hallazgos, pero ninguno coincide con el origen seleccionado.'
                : discoveryEmptyCopy[view].detail
            }
            action={emptyExplorerAction}
          />
        )}
      </section>

      <aside className="insight-rail">
        <MetricCard label="Nexo en cola" value={queuedNexoCount} />
        <MetricCard label="APIs en cola" value={queuedExternalCount} />
        <MetricCard label="Ideas" value={queuedPromptCount} />
      </aside>

      {selected && (
        <CandidateDialog
          candidate={selected}
          onClose={() => setSelected(undefined)}
          onDismiss={() => dismissSelectedCandidate(selected)}
          onRestore={() => restoreSelectedCandidate(selected)}
          onSave={() => saveSelectedCandidate(selected)}
          onCurate={library.isModerator ? () => openCatalogDraft(selected) : undefined}
        />
      )}

      {catalogDraft && (
        <PublicItemEditor
          key={`${catalogDraft.id || 'candidate-draft'}-${catalogDraft.createdAt}-${catalogDraft.type}`}
          item={catalogDraft}
          onClose={() => setCatalogDraft(undefined)}
          onSave={saveCatalogDraft}
        />
      )}
    </section>
  )
}

function SettingsTab({
  library,
  onNavigate,
  setTheme,
  theme,
  user,
}: {
  library: LibrarySurface
  onNavigate: (tab: AppTab) => void
  setTheme: (theme: ThemeMode) => void
  theme: ThemeMode
  user: AuthUserSummary | null
}) {
  const [draft, setDraft] = useState({
    theme,
    favoriteTags: library.settings.favoriteTags.join(', '),
    favoriteGenres: library.settings.favoriteGenres.join(', '),
    blockedTags: library.settings.blockedTags.join(', '),
    explorerDefaultType: library.settings.explorerDefaultType,
  })
  const [status, setStatus] = useState<string | undefined>()
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const draftFavoriteTags = splitList(draft.favoriteTags)
  const draftFavoriteGenres = splitList(draft.favoriteGenres)
  const draftBlockedTags = splitList(draft.blockedTags)
  const accountLabel = user?.displayName ?? user?.email ?? 'Sesion demo'
  const accountInitial = accountLabel.slice(0, 1).toUpperCase()
  const queuedDiscoveryCount = library.discoveryCandidates.filter((candidate) => candidate.status === 'queued').length
  const resolvedDiscoveryCount = library.discoveryCandidates.length - queuedDiscoveryCount
  const firstMissingTaxonomyItem = library.items.find((item) => !hasItemTaxonomy(item))
  const privateDataHealth = useMemo(
    () => getPrivateDataHealth(library.items, library.discoveryCandidates),
    [library.items, library.discoveryCandidates],
  )
  const hasUnsavedChanges =
    draft.theme !== theme ||
    draft.explorerDefaultType !== library.settings.explorerDefaultType ||
    !sameList(draftFavoriteTags, library.settings.favoriteTags) ||
    !sameList(draftFavoriteGenres, library.settings.favoriteGenres) ||
    !sameList(draftBlockedTags, library.settings.blockedTags)

  async function saveSettings() {
    const nextSettings: Partial<UserSettings> = {
      theme: draft.theme,
      favoriteTags: draftFavoriteTags,
      favoriteGenres: draftFavoriteGenres,
      blockedTags: draftBlockedTags,
      explorerDefaultType: draft.explorerDefaultType,
    }
    setTheme(draft.theme)
    await library.saveSettings(nextSettings)
    setStatus('Ajustes guardados')
  }

  async function copyUserId() {
    if (!user) return
    await navigator.clipboard?.writeText(user.uid)
    setStatus('UID copiado')
  }

  function exportPrivateBackup() {
    downloadLibraryBackup(library.items, library.settings, 'nexo-backup')
    setStatus('Backup JSON descargado')
  }

  async function savePrivateItemFromSettings(item: ListItem) {
    await library.saveItem(item)
    setEditingItem(undefined)
    setStatus(`${item.title || 'Entrada'} guardada`)
  }

  const privateDataActions: PrivateDataAction[] = [
    firstMissingTaxonomyItem
      ? {
          detail: firstMissingTaxonomyItem.title,
          Icon: Info,
          id: 'taxonomy',
          label: 'Afinar ficha',
          onClick: () => setEditingItem(firstMissingTaxonomyItem),
          primary: true,
        }
      : library.items.length === 0
        ? {
            detail: 'Abrir Biblioteca',
            Icon: Plus,
            id: 'library',
            label: 'Crear entrada',
            onClick: () => onNavigate('library'),
            primary: true,
          }
        : {
            detail: privateDataHealth.diceReadyCount
              ? `${privateDataHealth.diceReadyCount} candidatas disponibles`
              : 'Sin candidatas listas',
            Icon: Dice5,
            id: 'dice',
            label: privateDataHealth.diceReadyCount ? 'Tirar dado' : 'Revisar dado',
            onClick: () => onNavigate('dice'),
            primary: true,
          },
    queuedDiscoveryCount
      ? {
          detail: `${queuedDiscoveryCount} hallazgos pendientes`,
          Icon: Sparkles,
          id: 'explorer',
          label: 'Decidir cola',
          onClick: () => onNavigate('explorer'),
        }
      : {
          detail: 'Buscar en Nexo y APIs',
          Icon: Search,
          id: 'explorer',
          label: 'Explorar catalogo',
          onClick: () => onNavigate('explorer'),
        },
    {
      detail: 'Descargar copia privada',
      Icon: Download,
      id: 'backup',
      label: 'Backup JSON',
      onClick: exportPrivateBackup,
    },
  ]

  return (
    <section className="settings-grid">
      <form
        className="workspace-panel settings-panel"
        onSubmit={(event) => {
          event.preventDefault()
          void saveSettings()
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>Ajustes</h2>
            <p>Preferencias privadas para el dado y el explorador</p>
          </div>
          <button className="primary-button" disabled={!hasUnsavedChanges} type="submit">
            <Save size={17} />
            {hasUnsavedChanges ? 'Guardar cambios' : 'Guardado'}
          </button>
        </div>

        <div className={hasUnsavedChanges ? 'settings-status pending' : 'settings-status'}>
          <span>{hasUnsavedChanges ? 'Cambios pendientes' : 'Sin cambios pendientes'}</span>
          <strong>{typeLabels[draft.explorerDefaultType]}</strong>
        </div>

        <section className="settings-confidence-panel" aria-label="Estado de cuenta y datos" data-testid="settings-confidence">
          <div className="settings-confidence-main">
            <span className="account-avatar small">{accountInitial}</span>
            <div>
              <span className="eyebrow">Estado de cuenta</span>
              <strong>{hasUnsavedChanges ? 'Ajustes pendientes' : 'Cuenta lista'}</strong>
              <p>{hasUnsavedChanges ? 'Guarda los cambios para que Dado y Explorador usen esta configuracion.' : 'Preferencias, rol y biblioteca privada estan sincronizados.'}</p>
            </div>
          </div>
          <div className="settings-confidence-facts">
            <span>
              <strong>{roleLabels[library.userRole]}</strong>
              Rol
            </span>
            <span>
              <strong>{draft.theme === 'dark' ? 'Oscuro' : 'Claro'}</strong>
              Tema
            </span>
            <span>
              <strong>{library.items.length}</strong>
              Entradas
            </span>
            <span>
              <strong>{queuedDiscoveryCount}</strong>
              Cola
            </span>
          </div>
          {hasUnsavedChanges ? (
            <button className="secondary-button" type="submit">
              <Save size={16} />
              Aplicar ajustes pendientes
            </button>
          ) : (
            <button className="secondary-button" type="button" onClick={exportPrivateBackup}>
              <Download size={16} />
              Exportar backup rapido
            </button>
          )}
        </section>

        <div className="settings-overview" aria-label="Resumen de ajustes">
          <MetricCard label="Favoritos" value={draftFavoriteGenres.length + draftFavoriteTags.length} />
          <MetricCard label="Bloqueados" value={draftBlockedTags.length} />
          <MetricCard label="Explorador" value={typeLabels[draft.explorerDefaultType]} />
        </div>

        <div className="settings-section">
          <h3>Apariencia</h3>
          <div className="segmented-options" role="group" aria-label="Tema">
            {(['dark', 'light'] as const).map((mode) => (
              <button
                className={draft.theme === mode ? 'segment-option active' : 'segment-option'}
                key={mode}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, theme: mode }))}
              >
                {mode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                <span>{mode === 'dark' ? 'Oscuro' : 'Claro'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Explorador</h3>
          <label>
            Tipo por defecto
            <select
              value={draft.explorerDefaultType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  explorerDefaultType: event.target.value as ExplorerSearchType,
                }))
              }
            >
              <option value="watch">Ver</option>
              <option value="any">Todo</option>
              <option value="game">Juego</option>
              <option value="book">Libro</option>
              <option value="anime">Anime</option>
              <option value="manga">Manga</option>
              <option value="manhwa">Manhwa</option>
            </select>
          </label>
        </div>

        <div className="settings-section">
          <h3>Preferencias del dado</h3>
          <label>
            Tags favoritos
            <input value={draft.favoriteTags} onChange={(event) => setDraft((current) => ({ ...current, favoriteTags: event.target.value }))} />
          </label>
          <label>
            Generos favoritos
            <input value={draft.favoriteGenres} onChange={(event) => setDraft((current) => ({ ...current, favoriteGenres: event.target.value }))} />
          </label>
          <label>
            Tags bloqueados
            <input value={draft.blockedTags} onChange={(event) => setDraft((current) => ({ ...current, blockedTags: event.target.value }))} />
          </label>
        </div>

        <div className="preference-preview" aria-label="Resumen de preferencias">
          <PreferencePreview label="Favoritos" values={[...draftFavoriteGenres, ...draftFavoriteTags]} />
          <PreferencePreview label="Bloqueados" values={draftBlockedTags} tone="danger" />
        </div>

        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
      </form>

      <div className="settings-side">
        <section className="workspace-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Cuenta</h2>
              <p className="muted-line">{user?.email ?? 'Sesion activa'}</p>
            </div>
            <span className={library.isModerator ? 'mode-pill moderator' : 'mode-pill'}>
              {roleLabels[library.userRole]}
            </span>
          </div>
          <div className="account-card">
            <span className="account-avatar">{accountInitial}</span>
            <div>
              <strong>{accountLabel}</strong>
              <span>{library.isModerator ? 'Puede curar catalogo publico' : 'Biblioteca privada activa'}</span>
            </div>
          </div>
          <div className="account-panel">
            <label>
              Email
              <input readOnly value={user?.email ?? 'Sin email'} />
            </label>
            <label>
              UID
              <div className="inline-control">
                <input readOnly value={user?.uid ?? 'Demo local'} />
                <button className="icon-button" disabled={!user} type="button" onClick={copyUserId} title="Copiar UID">
                  <Copy size={17} />
                </button>
              </div>
            </label>
          </div>
        </section>

        {library.userRole === 'admin' && (
          <AdminRolesPanel
            currentUserId={user?.uid}
            onRoleChange={library.updateUserRole}
            profiles={library.userProfiles}
          />
        )}

        <section className="workspace-panel private-data-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Datos privados</h2>
              <p className="muted-line">Backup y estado de tu biblioteca personal.</p>
            </div>
            <span className="mode-pill">JSON v1</span>
          </div>
          <div className="data-health-grid" aria-label="Estado de datos privados">
            <div>
              <span>Biblioteca</span>
              <strong>{library.items.length}</strong>
              <small>entradas privadas</small>
            </div>
            <div>
              <span>Cola</span>
              <strong>{queuedDiscoveryCount}</strong>
              <small>hallazgos pendientes</small>
            </div>
            <div>
              <span>Historial</span>
              <strong>{resolvedDiscoveryCount}</strong>
              <small>guardados o descartados</small>
            </div>
          </div>
          <section className="private-health-card" aria-label="Salud de datos privados" data-testid="private-data-health">
            <div className="private-health-header">
              <div>
                <span className="eyebrow">Salud de datos</span>
                <strong>{privateDataHealth.summaryLabel}</strong>
                <p>{privateDataHealth.summaryCopy}</p>
              </div>
              <span className={privateDataHealth.needsAttention ? 'mode-pill warning' : 'mode-pill moderator'}>
                {privateDataHealth.needsAttention ? 'Revisar' : 'Lista'}
              </span>
            </div>
            <div
              aria-label={`Cobertura de taxonomia ${privateDataHealth.taxonomyCoveragePercent}%`}
              className="private-health-meter"
              role="meter"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={privateDataHealth.taxonomyCoveragePercent}
            >
              <span style={{ width: `${privateDataHealth.taxonomyCoveragePercent}%` }} />
            </div>
            <div className="private-health-signals">
              <div>
                <span>Taxonomia</span>
                <strong>
                  {privateDataHealth.taxonomyReadyCount}/{privateDataHealth.totalItems}
                </strong>
                <small>
                  {privateDataHealth.missingTaxonomyCount
                    ? `${privateDataHealth.missingTaxonomyCount} sin generos/tags`
                    : 'Dado entiende el tono'}
                </small>
              </div>
              <div>
                <span>Catalogo Nexo</span>
                <strong>{privateDataHealth.publicCopyCount}</strong>
                <small>copias con snapshot publico</small>
              </div>
              <div>
                <span>Dado</span>
                <strong>{privateDataHealth.diceReadyCount}</strong>
                <small>{privateDataHealth.cooldownCount ? `${privateDataHealth.cooldownCount} en cooldown` : 'candidatos disponibles'}</small>
              </div>
            </div>
            <div className="private-health-review" aria-label="Revisiones sugeridas">
              {privateDataHealth.reviewItems.map((item) => (
                <div className={item.tone === 'good' ? 'private-health-review-item good' : 'private-health-review-item'} key={item.label}>
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="private-action-plan" aria-label="Plan de mantenimiento privado" data-testid="private-action-plan">
            <div className="private-action-plan-heading">
              <div>
                <span className="eyebrow">Plan de mantenimiento</span>
                <strong>{privateDataHealth.needsAttention ? 'Resolver pendientes privados' : 'Mantener Nexo listo'}</strong>
                <p>
                  {privateDataHealth.needsAttention
                    ? 'Ataja la primera mejora util sin salir de tus datos privados.'
                    : 'Accesos directos para decidir, explorar y guardar copia.'}
                </p>
              </div>
            </div>
            <div className="private-action-list">
              {privateDataActions.map((action) => {
                const Icon = action.Icon
                return (
                  <button
                    className={action.primary ? 'private-action-item primary' : 'private-action-item'}
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{action.label}</strong>
                      <small>{action.detail}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
          <div className="data-safety-note">
            <ShieldCheck size={17} />
            <span>Tus notas, ratings, progreso y pesos viven bajo tu usuario. El catalogo Nexo no recibe esos cambios privados.</span>
          </div>
          <button className="secondary-button data-backup-button" type="button" onClick={exportPrivateBackup}>
            <Archive size={17} />
            Exportar backup JSON
          </button>
        </section>

        <section className="workspace-panel">
          <h2>Beta suave</h2>
          <p className="muted-line">Google login abre una biblioteca privada por usuario. El catalogo Nexo es comun, pero solo moderadores lo editan.</p>
          <div className="release-list">
            <span>Firestore privado por usuario</span>
            <span>Catalogo publico curado</span>
            <span>Export JSON schemaVersion 1</span>
          </div>
        </section>
      </div>

      {editingItem && (
        <ItemEditor
          item={editingItem}
          onClose={() => setEditingItem(undefined)}
          onSave={(item) => void savePrivateItemFromSettings(item)}
        />
      )}
    </section>
  )
}

function AdminRolesPanel({
  currentUserId,
  onRoleChange,
  profiles,
}: {
  currentUserId?: string
  onRoleChange: (targetUserId: string, role: UserRole) => Promise<void>
  profiles: UserProfile[]
}) {
  const [status, setStatus] = useState<string | undefined>()
  const roleCounts = USER_ROLES.map((role) => ({
    role,
    count: profiles.filter((profile) => profile.role === role).length,
  }))

  async function changeRole(profile: UserProfile, role: UserRole) {
    if (profile.role === role) return

    setStatus(undefined)
    try {
      await onRoleChange(profile.uid, role)
      setStatus(`${profile.displayName || profile.email || profile.uid} ahora es ${roleLabels[role]}`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el rol.')
    }
  }

  return (
    <section className="workspace-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Roles</h2>
          <p className="muted-line">
            {profiles.length ? `${profiles.length} perfiles con acceso` : 'Sin perfiles cargados'}
          </p>
        </div>
        <span className="mode-pill moderator">Admin</span>
      </div>

      <div className="role-summary-grid" aria-label="Resumen de roles">
        {roleCounts.map(({ count, role }) => (
          <div className={role === 'user' ? 'role-summary-card' : 'role-summary-card elevated'} key={role}>
            <span>{roleLabels[role]}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>

      <div className="role-permission-grid" aria-label="Permisos de roles">
        {rolePermissionSummaries.map((summary) => (
          <article className={summary.role === 'user' ? 'role-permission-card' : 'role-permission-card elevated'} key={summary.role}>
            <div>
              <span className={summary.role === 'user' ? 'role-badge' : 'role-badge elevated'}>
                {roleLabels[summary.role]}
              </span>
              <p>{summary.detail}</p>
            </div>
            <ul>
              {summary.permissions.map((permission) => (
                <li key={permission}>
                  <Check size={13} />
                  <span>{permission}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {profiles.length ? (
        <div className="role-list">
          {profiles.map((profile) => {
            const label = profile.displayName || profile.email || profile.uid
            const isCurrentUser = profile.uid === currentUserId
            return (
              <div className="role-row" key={profile.uid}>
                <div className="role-person">
                  <span className="account-avatar small">{label.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{label}</strong>
                    <span>{profile.email || profile.uid}</span>
                  </div>
                </div>
                <div className="role-control">
                  <span className={profile.role === 'user' ? 'role-badge' : 'role-badge elevated'}>
                    {roleLabels[profile.role]}
                  </span>
                  <select
                    aria-label={`Rol de ${label}`}
                    disabled={isCurrentUser}
                    value={profile.role}
                    onChange={(event) => void changeRole(profile, event.target.value as UserRole)}
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="Sin usuarios"
          detail="Los perfiles apareceran aqui cuando inicien sesion por primera vez."
        />
      )}

      {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
    </section>
  )
}

function CurationTab({ library }: { library: LibrarySurface }) {
  const [query, setQuery] = useState('')
  const [qualityFilter, setQualityFilter] = useState<CatalogQualityFilter>('all')
  const [issueFilter, setIssueFilter] = useState<CatalogIssueFilter>('all')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [sortMode, setSortMode] = useState<CatalogSortMode>('quality')
  const [items, setItems] = useState<PublicCatalogItem[]>([])
  const [editingItem, setEditingItem] = useState<PublicCatalogItem | undefined>()
  const [archiveTarget, setArchiveTarget] = useState<PublicCatalogItem | undefined>()
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [starterTemplateType, setStarterTemplateType] = useState<ItemType>('book')
  const [status, setStatus] = useState<string | undefined>()
  const [initialLibrary] = useState(() => library)
  const incompleteCount = items.filter((item) => catalogQualityWarnings(item).length > 0).length
  const completeCount = items.length - incompleteCount
  const typeCount = new Set(items.map((item) => item.type)).size
  const reviewQueue = useMemo(() => getCatalogReviewQueue(items), [items])
  const catalogDiagnostics = useMemo(() => getCatalogDiagnostics(items), [items])
  const starterTemplates = catalogTaxonomyTemplates[starterTemplateType]
  const hasActiveCatalogFilters = qualityFilter !== 'all' || issueFilter !== 'all' || typeFilter !== 'all' || sortMode !== 'quality'
  const visibleCatalogItems = useMemo(() => {
    return items
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => issueFilter === 'all' || catalogQualityIssueKeys(item).includes(issueFilter))
      .filter((item) => {
        const warningCount = catalogQualityWarnings(item).length
        if (qualityFilter === 'needs-work') return warningCount > 0
        if (qualityFilter === 'ready') return warningCount === 0
        return true
      })
      .sort((left, right) => sortCatalogItems(left, right, sortMode))
  }, [issueFilter, items, qualityFilter, sortMode, typeFilter])
  const qualityFilters: Array<{ id: CatalogQualityFilter; label: string; value: number }> = [
    { id: 'all', label: 'Todo', value: items.length },
    { id: 'needs-work', label: 'Pendientes', value: incompleteCount },
    { id: 'ready', label: 'Completas', value: completeCount },
  ]

  useEffect(() => {
    let isAlive = true

    void Promise.resolve().then(async () => {
      if (!isAlive) return
      setIsLoading(true)
      try {
        const nextItems = await initialLibrary.searchPublicCatalog('', 'any')
        if (!isAlive) return
        setItems(nextItems)
        setHasLoaded(true)
      } catch (reason) {
        if (!isAlive) return
        setStatus(reason instanceof Error ? reason.message : 'No se pudo cargar el catalogo.')
      } finally {
        if (isAlive) setIsLoading(false)
      }
    })

    return () => {
      isAlive = false
    }
  }, [initialLibrary])

  async function refreshCatalog(searchQuery = query) {
    setIsLoading(true)
    try {
      const nextItems = await library.searchPublicCatalog(searchQuery, 'any')
      setItems(nextItems)
      setHasLoaded(true)
      if (!nextItems.length) {
        setStatus(searchQuery.trim() ? 'No hay entradas con ese filtro.' : 'El catalogo publico esta vacio.')
      }
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el catalogo.')
    } finally {
      setIsLoading(false)
    }
  }

  async function archiveSelectedItem() {
    if (!archiveTarget) return
    const archivedTitle = archiveTarget.title
    await library.archivePublicItem(archiveTarget.id)
    setItems((current) => current.filter((item) => item.id !== archiveTarget.id))
    setStatus(`${archivedTitle} archivado`)
    setArchiveTarget(undefined)
  }

  function resetCatalogFilters() {
    setQualityFilter('all')
    setIssueFilter('all')
    setTypeFilter('all')
    setSortMode('quality')
  }

  function focusCatalogIssue(issue: CatalogIssueKey) {
    setIssueFilter(issue)
    setQualityFilter('needs-work')
    setSortMode('quality')
  }

  function startNewCatalogItem(type: ItemType = 'book', template?: CatalogTaxonomyTemplate) {
    setEditingItem(template ? publicCatalogDraftFromTemplate(type, template) : blankPublicCatalogItem(type))
  }

  function downloadCatalogSeedTemplate() {
    downloadJsonFile(createPublicCatalogSeedTemplate(), 'nexo-catalog-seed-template.json')
    setStatus('Plantilla de catalogo descargada')
  }

  async function importCatalogSeed(file?: File) {
    if (!file) return

    setIsImporting(true)
    setStatus('Importando lote de catalogo...')
    try {
      const parsed = parsePublicCatalogSeed(JSON.parse(await file.text()), 'curation-import')
      if (parsed.errors.length) {
        setStatus(`Seed invalido: ${parsed.errors[0]}${parsed.errors.length > 1 ? ` (+${parsed.errors.length - 1})` : ''}`)
        return
      }
      if (!parsed.items.length) {
        setStatus('El seed no contiene entradas para importar.')
        return
      }

      const savedItems: PublicCatalogItem[] = []
      for (const item of parsed.items) {
        savedItems.push(await library.upsertPublicItem(item))
      }

      setItems((current) => savedItems.reduce((nextItems, item) => upsertVisibleCatalogItem(nextItems, item), current))
      setHasLoaded(true)
      setQualityFilter('all')
      setIssueFilter('all')
      setSortMode('updated')
      setStatus(`Importadas ${savedItems.length} entradas al catalogo`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo importar el lote de catalogo.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <section className="content-grid">
      <section className="workspace-panel wide">
        <div className="panel-heading">
          <div>
            <h2>Catalogo Nexo</h2>
            <p>Catalogo compartido visible para usuarios logueados</p>
          </div>
          <div className="panel-actions">
            <button className="secondary-button catalog-import-button" type="button" onClick={downloadCatalogSeedTemplate}>
              <Download size={17} />
              Plantilla
            </button>
            <label
              className={
                isImporting
                  ? 'secondary-button file-button catalog-import-button disabled'
                  : 'secondary-button file-button catalog-import-button'
              }
              title="Importar lote JSON"
            >
              <Upload size={17} />
              {isImporting ? 'Importando' : 'Importar lote'}
              <input
                accept="application/json,.json"
                aria-label="Importar lote de catalogo JSON"
                disabled={isImporting}
                type="file"
                onChange={(event) => {
                  void importCatalogSeed(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
            <button className="primary-button" type="button" onClick={() => startNewCatalogItem()}>
              <Plus size={18} />
              Nueva entrada
            </button>
          </div>
        </div>
        <div className="curation-starter-strip" aria-label="Crear entrada por tipo">
          <span>Crear como</span>
          <div>
            {curationStarterTypes.map((type) => {
              const Icon = typeIcons[type]

              return (
                <button key={type} type="button" onClick={() => startNewCatalogItem(type)} aria-label={`Crear ${typeLabels[type]}`}>
                  <Icon size={15} />
                  {typeLabels[type]}
                </button>
              )
            })}
          </div>
        </div>
        <section className="curation-template-launcher" aria-label="Plantillas de curacion">
          <div className="curation-template-heading">
            <div>
              <span className="eyebrow">Presets</span>
              <strong>Empieza con generos predefinidos</strong>
              <p>Elige una receta y se abre una ficha con generos, tags y tono ya cargados.</p>
            </div>
            <label>
              Medio
              <select
                aria-label="Medio de plantillas de curacion"
                value={starterTemplateType}
                onChange={(event) => setStarterTemplateType(event.target.value as ItemType)}
              >
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="curation-template-grid">
            {starterTemplates.map((template) => (
              <button
                aria-label={`Usar plantilla ${template.label} para ${typeLabels[starterTemplateType]}`}
                className="curation-template-card"
                key={template.label}
                type="button"
                onClick={() => startNewCatalogItem(starterTemplateType, template)}
              >
                <span>
                  <Sparkles size={15} />
                  <strong>{template.label}</strong>
                </span>
                <small>{template.detail}</small>
                <div className="curation-template-taxonomy">
                  {template.genres.slice(0, 3).map((genre) => (
                    <em key={genre}>{genre}</em>
                  ))}
                  {template.tags.slice(0, 2).map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>
        <form
          className="explorer-search two"
          onSubmit={(event) => {
            event.preventDefault()
            void refreshCatalog()
          }}
        >
          <input
            aria-label="Buscar en catalogo publico"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar entrada publica"
          />
          <button className="secondary-button" disabled={isLoading} type="submit">
            <Search size={18} />
            {isLoading ? 'Buscando' : 'Buscar'}
          </button>
        </form>
        <section className="catalog-diagnostics-panel" aria-label="Diagnostico del catalogo publico" data-testid="catalog-diagnostics">
          <div className="catalog-diagnostics-main">
            <div>
              <span className="eyebrow">Diagnostico</span>
              <strong>{catalogDiagnostics.summaryLabel}</strong>
              <p>{catalogDiagnostics.summaryCopy}</p>
            </div>
            <div className="catalog-diagnostics-score">
              <strong>{catalogDiagnostics.coveragePercent}%</strong>
              <span>
                {catalogDiagnostics.readyCount}/{catalogDiagnostics.totalItems} completas
              </span>
            </div>
          </div>
          <div
            aria-label={`Cobertura del catalogo ${catalogDiagnostics.coveragePercent}%`}
            className="catalog-diagnostics-meter"
            role="meter"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={catalogDiagnostics.coveragePercent}
          >
            <span style={{ width: `${catalogDiagnostics.coveragePercent}%` }} />
          </div>
          <div className="catalog-issue-grid" aria-label="Pendientes por tipo de dato">
            {catalogDiagnostics.issueStats.map((issue) => (
              <button
                aria-pressed={issueFilter === issue.id}
                className={issueFilter === issue.id ? 'catalog-issue-card active' : 'catalog-issue-card'}
                disabled={issue.count === 0}
                key={issue.id}
                type="button"
                onClick={() => focusCatalogIssue(issue.id)}
              >
                <span>{issue.label}</span>
                <strong>{issue.count}</strong>
                <small>{issue.detail}</small>
              </button>
            ))}
          </div>
          {issueFilter !== 'all' && (
            <div className="catalog-active-issue">
              <span>Viendo {catalogIssueLabels[issueFilter].toLowerCase()}</span>
              <button className="ghost-button" type="button" onClick={() => setIssueFilter('all')}>
                Quitar foco
              </button>
            </div>
          )}
        </section>
        {reviewQueue.length > 0 && (
          <section className="catalog-review-panel" aria-label="Revision prioritaria del catalogo">
            <div className="catalog-review-heading">
              <div>
                <h3>Revision prioritaria</h3>
                <p>Fichas publicas con senales pendientes antes de compartir beta.</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setQualityFilter('needs-work')
                  setSortMode('quality')
                }}
              >
                Ver pendientes
              </button>
            </div>
            <div className="catalog-review-list">
              {reviewQueue.map(({ item, warnings }) => (
                <article className="catalog-review-item" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {typeLabels[item.type]} / {warnings.length} pendiente{warnings.length === 1 ? '' : 's'}
                    </span>
                    <div className="catalog-review-tags">
                      {warnings.slice(0, 3).map((warning) => (
                        <small key={warning}>{warning}</small>
                      ))}
                    </div>
                  </div>
                  <button className="small-button" type="button" onClick={() => setEditingItem(item)} aria-label={`Revisar ${item.title}`}>
                    Revisar
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="catalog-curation-toolbar">
          <div className="catalog-filter-tabs" role="group" aria-label="Calidad del catalogo">
            {qualityFilters.map((filter) => (
              <button
                aria-pressed={qualityFilter === filter.id}
                className={qualityFilter === filter.id ? 'catalog-filter-chip active' : 'catalog-filter-chip'}
                key={filter.id}
                type="button"
                onClick={() => {
                  setQualityFilter(filter.id)
                  if (filter.id !== 'needs-work') setIssueFilter('all')
                }}
              >
                <span>{filter.label}</span>
                <strong>{filter.value}</strong>
              </button>
            ))}
          </div>
          <div className="catalog-curation-tools">
            <label>
              Tipo
              <select
                aria-label="Filtrar catalogo por tipo"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as ItemType | 'all')}
              >
                <option value="all">Todos</option>
                {ITEM_TYPES.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {typeLabels[itemType]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Orden
              <select
                aria-label="Ordenar catalogo"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as CatalogSortMode)}
              >
                {(Object.keys(catalogSortLabels) as CatalogSortMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {catalogSortLabels[mode]}
                  </option>
                ))}
              </select>
            </label>
            {hasActiveCatalogFilters && (
              <button className="ghost-button" type="button" onClick={resetCatalogFilters}>
                Quitar filtros
              </button>
            )}
          </div>
        </div>
        <p className="catalog-count-line" aria-live="polite">
          {visibleCatalogItems.length} de {items.length} entradas visibles
        </p>
        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}

        {isLoading && items.length === 0 ? (
          <EmptyState
            icon={LoaderCircle}
            tone="loading"
            title="Cargando catalogo"
            detail="Recuperando las entradas publicas curadas."
          />
        ) : hasLoaded && items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Sin entradas publicas"
            detail="Crea la primera ficha curada o prueba otra busqueda."
            action={
              <button className="primary-button" type="button" onClick={() => startNewCatalogItem()}>
                <Plus size={16} />
                Crear ficha publica
              </button>
            }
          />
        ) : hasLoaded && visibleCatalogItems.length === 0 ? (
          <EmptyState
            icon={Search}
            tone="muted"
            title="Sin entradas con esos filtros"
            detail="Cambia calidad, tipo u orden para volver a la cola completa."
            action={
              <button className="secondary-button" type="button" onClick={resetCatalogFilters}>
                Ver todo el catalogo
              </button>
            }
          />
        ) : (
          <div className="candidate-grid">
            {visibleCatalogItems.map((item) => {
              const warnings = catalogQualityWarnings(item)
              const qualityLabel = warnings.length ? `${warnings.length} pendiente${warnings.length === 1 ? '' : 's'}` : 'Completa'

              return (
                <article className="catalog-card" key={item.id}>
                  <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
                  <div className="catalog-body">
                    <div className="catalog-meta">
                      <span className="source-pill">Nexo</span>
                      <span>{typeLabels[item.type]}</span>
                      {item.releaseYear && <span>{item.releaseYear}</span>}
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.description || `${typeLabels[item.type]} publico`}</p>
                    <div className="tag-row">
                      {item.genres.slice(0, 3).map((genre) => (
                        <span key={genre}>{genre}</span>
                      ))}
                    </div>
                    <div className={warnings.length ? 'catalog-quality warning' : 'catalog-quality'}>
                      <span>{qualityLabel}</span>
                      {warnings.length > 0 && <small>{warnings.slice(0, 2).join(' / ')}</small>}
                    </div>
                  </div>
                  <div className="candidate-card-actions">
                    <button className="small-button" type="button" onClick={() => setEditingItem(item)} aria-label={`Editar ${item.title}`}>
                      Editar
                    </button>
                    <button className="small-button danger-text" type="button" onClick={() => setArchiveTarget(item)} aria-label={`Archivar ${item.title}`}>
                      Archivar
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <aside className="insight-rail">
        <MetricCard label="Catalogo" value={items.length} />
        <MetricCard label="Incompletas" value={incompleteCount} />
        <MetricCard label="Tipos" value={typeCount} />
        <MetricCard label="Rol" value={roleLabels[library.userRole]} />
      </aside>

      {archiveTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-title">
            <div className="panel-heading compact">
              <div>
                <h2 id="archive-title">Archivar entrada publica</h2>
                <p>{archiveTarget.title} dejara de aparecer en Explorador y busquedas del catalogo.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setArchiveTarget(undefined)} title="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="action-row end">
              <button className="ghost-button" type="button" onClick={() => setArchiveTarget(undefined)}>
                Cancelar
              </button>
              <button className="danger-button" type="button" onClick={() => void archiveSelectedItem()}>
                Archivar entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <PublicItemEditor
          key={`${editingItem.id || 'draft'}-${editingItem.createdAt}-${editingItem.type}`}
          item={editingItem}
          onClose={() => setEditingItem(undefined)}
          onSave={async (item, options) => {
            const savedItem = await library.upsertPublicItem(item)
            setItems((current) => upsertVisibleCatalogItem(current, savedItem))
            setHasLoaded(true)
            setEditingItem(options?.createAnother ? blankPublicCatalogItem(savedItem.type) : undefined)
            setStatus(`${savedItem.title} guardado en catalogo`)
          }}
        />
      )}
    </section>
  )
}

function PreferenceControls({
  preferences,
  setPreferences,
}: {
  preferences: RecommendationPreferences
  setPreferences: (update: RecommendationPreferences | ((current: RecommendationPreferences) => RecommendationPreferences)) => void
}) {
  return (
    <>
      <div className="controls-grid">
        <label>
          Medio
          <select
            value={preferences.medium}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                medium: event.target.value as RecommendationPreferences['medium'],
              }))
            }
          >
            <option value="any">Todo</option>
            <option value="watch">Ver</option>
            <option value="game">Juegos</option>
            <option value="book">Libros</option>
            <option value="anime">Anime</option>
            <option value="manga">Manga</option>
            <option value="manhwa">Manhwa</option>
          </select>
        </label>
        <label>
          Tiempo
          <select
            value={preferences.timeBudgetHours ?? 0}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                timeBudgetHours: Number(event.target.value) || undefined,
              }))
            }
          >
            <option value="0">Libre</option>
            <option value="2">2h</option>
            <option value="8">8h</option>
            <option value="15">15h</option>
            <option value="30">30h</option>
            <option value="60">60h</option>
          </select>
        </label>
        <label>
          Energia
          <select
            value={preferences.energy}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                energy: event.target.value as RecommendationPreferences['energy'],
              }))
            }
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label>
          Novedad
          <select
            value={preferences.novelty}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                novelty: event.target.value as RecommendationPreferences['novelty'],
              }))
            }
          >
            <option value="comfort">Confort</option>
            <option value="balanced">Balance</option>
            <option value="surprise">Sorpresa</option>
          </select>
        </label>
      </div>

      <label className="range-field">
        <span>Sorpresa</span>
        <input
          aria-label="Porcentaje de sorpresa"
          max="100"
          min="0"
          type="range"
          value={preferences.surprisePercent}
          onChange={(event) =>
            setPreferences((current) => ({
              ...current,
              surprisePercent: Number(event.target.value),
            }))
          }
        />
      </label>

      <label className="check-row">
        <input
          checked={preferences.includePaused}
          type="checkbox"
          onChange={(event) => setPreferences((current) => ({ ...current, includePaused: event.target.checked }))}
        />
        Incluir pausados
      </label>
    </>
  )
}

function DiscoveryCard({
  candidate,
  onDetails,
  onCurate,
  onDismiss,
  onRestore,
  onSave,
}: {
  candidate: DiscoveryCandidate
  onDetails: () => void
  onCurate?: () => void
  onDismiss: () => void
  onRestore: () => void
  onSave: () => void
}) {
  const isQueued = candidate.status === 'queued'
  const isDismissed = candidate.status === 'dismissed'
  const catalogActionLabel = candidate.source === 'nexo' ? 'Editar catalogo' : 'Crear catalogo'

  function openDetailsFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    onDetails()
  }

  return (
    <article className={`discovery-card ${candidate.status}`}>
      <div
        aria-label={`Ver detalles ${candidate.title}`}
        className="candidate-main"
        role="button"
        tabIndex={0}
        onClick={onDetails}
        onKeyDown={openDetailsFromKeyboard}
      >
        <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
        <div className="discovery-body">
          <div className="candidate-meta">
            <span className="source-pill">{sourceLabels[candidate.source]}</span>
            {!isQueued && <span className={`candidate-status ${candidate.status}`}>{discoveryStatusLabels[candidate.status]}</span>}
          </div>
          <h3>{candidate.title}</h3>
          <p>{candidate.overview || `${typeLabels[candidate.type]} para explorar`}</p>
          <div className="tag-row">
            {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
            {candidate.genres.slice(0, 2).map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
        </div>
      </div>
      <div className={isQueued ? 'candidate-card-actions' : 'candidate-card-actions resolved'}>
        {isQueued ? (
          <div className="candidate-action-rail" aria-label={`Acciones rapidas ${candidate.title}`}>
            <span className="candidate-action-kicker">Decidir</span>
            <button className="candidate-save-action" type="button" onClick={onSave} aria-label={`Guardar ${candidate.title}`}>
              <Plus size={17} />
              <span>
                <strong>Guardar</strong>
                <small>Biblioteca</small>
              </span>
            </button>
            <div className="candidate-secondary-strip">
              {onCurate && (
                <button className="candidate-icon-action" type="button" onClick={onCurate} aria-label={`${catalogActionLabel} ${candidate.title}`} title={catalogActionLabel}>
                  <ShieldCheck size={16} />
                </button>
              )}
              <button className="candidate-icon-action" type="button" onClick={onDetails} aria-label={`Abrir ficha ${candidate.title}`} title="Detalles">
                <Eye size={16} />
              </button>
              <button className="candidate-icon-action danger" type="button" onClick={onDismiss} aria-label={`Descartar ${candidate.title}`} title="Descartar">
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <span className="candidate-footnote">
              {candidate.status === 'saved' ? 'Ya esta en tu biblioteca' : 'Apartado de tus pendientes'}
            </span>
            {isDismissed && (
              <button className="candidate-primary-action secondary" type="button" onClick={onRestore} aria-label={`Recuperar ${candidate.title}`}>
                <RotateCcw size={16} />
                <span>Recuperar</span>
              </button>
            )}
          </>
        )}
      </div>
    </article>
  )
}

function CandidateDecisionBriefView({ brief }: { brief: CandidateDecisionBrief }) {
  return (
    <section className="candidate-decision-brief" aria-label="Guia de decision del hallazgo">
      <div>
        <span className="eyebrow">Que hacer ahora</span>
        <strong>{brief.title}</strong>
        <p>{brief.detail}</p>
      </div>
      <div className="candidate-decision-facts">
        <span>
          <small>Accion</small>
          <strong>{brief.action}</strong>
        </span>
        {brief.facts.map((fact) => (
          <span key={fact.label}>
            <small>{fact.label}</small>
            <strong>{fact.value}</strong>
          </span>
        ))}
      </div>
    </section>
  )
}

function getLibraryFocusItems(items: ListItem[]) {
  const statusRank: Record<ItemStatus, number> = {
    in_progress: 0,
    wishlist: 1,
    paused: 2,
    completed: 3,
    dropped: 4,
  }

  return items
    .filter((item) => item.status === 'in_progress' || item.status === 'wishlist' || item.status === 'paused')
    .sort((left, right) => {
      const statusDelta = statusRank[left.status] - statusRank[right.status]
      if (statusDelta !== 0) return statusDelta

      const leftWeight = left.weights.priority + left.weights.challenge * 0.4 + left.weights.surprise * 0.25
      const rightWeight = right.weights.priority + right.weights.challenge * 0.4 + right.weights.surprise * 0.25
      if (leftWeight !== rightWeight) return rightWeight - leftWeight

      return right.updatedAt.localeCompare(left.updatedAt)
    })
    .slice(0, 3)
}

function getLibraryFocusReason(item: ListItem) {
  if (item.status === 'in_progress') return item.progress || 'Ya empezada, pide cierre'
  if (item.status === 'paused') return 'Pausada, lista para retomar'
  if (item.weights.priority >= 1.15) return 'Alta prioridad'
  if (item.weights.surprise >= 0.75) return 'Buena candidata sorpresa'
  if (item.weights.challenge >= 0.7) return 'Reto interesante'
  return `${typeLabels[item.type]} pendiente`
}

function getLibraryNextPlanTitle(item: ListItem) {
  if (item.status === 'in_progress') return 'Continuar sin perder contexto'
  if (item.status === 'paused') return 'Retomar con una sesion corta'
  if (item.status === 'wishlist') return 'Listo para empezar'
  if (item.status === 'completed') return 'Reabrir si vuelve a apetecer'
  return 'Revisar antes de descartar'
}

function getLibraryNextPlanFacts(item: ListItem, signalCount: number) {
  return [
    {
      label: 'Tiempo',
      value: item.durationMinHours || item.durationMaxHours ? formatDuration(item) : 'Sin duracion',
    },
    {
      label: 'Origen',
      value: item.publicItemId ? 'Nexo' : itemSourceLabels[item.source],
    },
    {
      label: 'Senales',
      value: signalCount ? `${signalCount}` : '0',
    },
  ]
}

function downloadLibraryBackup(items: ListItem[], settings: UserSettings, prefix: string) {
  downloadJsonFile(createLibraryExportPayload(items, settings), `${prefix}-${new Date().toISOString().slice(0, 10)}.json`)
}

function downloadJsonFile(payload: unknown, filename: string) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

function ItemCard({
  item,
  layout = 'cards',
  onDelete,
  onEdit,
  onStatus,
}: {
  item: ListItem
  layout?: 'cards' | 'list'
  onEdit: () => void
  onDelete: () => void
  onStatus: (id: string, status: ItemStatus) => void
}) {
  const primaryAction = getPrimaryItemAction(item.status)
  const secondaryAction = getSecondaryItemAction(item.status)
  const visibleChips = getVisibleItemChips(item)

  function applyStatus(status: ItemStatus) {
    onStatus(item.id, status)
  }

  function deleteItem() {
    onDelete()
  }

  return (
    <article className={layout === 'list' ? 'item-card list-card' : 'item-card'} data-status={item.status}>
      <button className="item-main" type="button" onClick={onEdit}>
        <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
        <div className="item-body">
          <ItemIdentity item={item} />
          <ItemSignalStrip item={item} />
          <ItemPulsePanel item={item} />
          {visibleChips.length ? (
            <div className="tag-row item-tag-row">
              {visibleChips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          ) : (
            <p className="item-empty-meta">Sin etiquetas todavia</p>
          )}
        </div>
      </button>
      <div className="card-actions">
        <button
          className="card-primary-action"
          type="button"
          aria-label={`${primaryAction.label} ${item.title}`}
          title={primaryAction.label}
          onClick={() => applyStatus(primaryAction.nextStatus)}
        >
          <primaryAction.Icon size={16} />
          <span>{primaryAction.label}</span>
        </button>
        <ActionMenu
          label={item.title}
          items={[
            {
              Icon: secondaryAction.Icon,
              label: secondaryAction.label,
              onSelect: () => applyStatus(secondaryAction.nextStatus),
            },
            { Icon: Trash2, label: 'Borrar', onSelect: deleteItem, tone: 'danger' },
          ]}
        />
      </div>
    </article>
  )
}

function ItemPulsePanel({ item }: { item: ListItem }) {
  const pulse = getItemPulse(item)

  return (
    <div className="item-pulse-panel" aria-label={`Pulso de ${item.title}`}>
      <div className="item-pulse-summary">
        <span>{pulse.label}</span>
        <strong>{pulse.value}</strong>
      </div>
      <div className="item-pulse-meters">
        {pulse.metrics.map((metric) => (
          <div className="item-pulse-meter" key={metric.label}>
            <span>{metric.label}</span>
            <div
              className="item-pulse-track"
              role="meter"
              aria-label="Medidor de tarjeta"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={metric.value}
              aria-valuetext={`${metric.label} ${metric.value}%`}
            >
              <span style={{ width: `${metric.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ItemSignalStrip({ item }: { item: ListItem }) {
  const signals = getItemSignals(item)

  return (
    <div className="item-signal-strip" aria-label={`Senales rapidas de ${item.title}`}>
      {signals.map((signal) => (
        <span className={signal.tone === 'strong' ? 'strong' : undefined} key={signal.label}>
          {signal.label}
        </span>
      ))}
    </div>
  )
}

function ActionMenu({
  items,
  label,
  triggerClassName = 'card-menu-trigger',
}: {
  items: Array<{
    ariaLabel?: string
    Icon: typeof MoreHorizontal
    label: string
    onSelect: () => void
    tone?: 'danger'
  }>
  label: string
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)

  function selectItem(onSelect: () => void) {
    setOpen(false)
    onSelect()
  }

  return (
    <div
      className="card-menu-wrap"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Mas acciones ${label}`}
        className={triggerClassName}
        title="Mas acciones"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div aria-label={`Acciones ${label}`} className="card-menu" role="menu">
          {items.map((item) => (
            <button
              aria-label={item.ariaLabel ?? `${item.label} ${label}`}
              className={item.tone === 'danger' ? 'card-menu-item danger' : 'card-menu-item'}
              key={`${label}-${item.label}`}
              role="menuitem"
              type="button"
              onClick={() => selectItem(item.onSelect)}
            >
              <item.Icon size={15} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getPrimaryItemAction(status: ItemStatus): { Icon: typeof Play; label: string; nextStatus: ItemStatus } {
  switch (status) {
    case 'in_progress':
      return { Icon: Check, label: 'Completar', nextStatus: 'completed' }
    case 'paused':
      return { Icon: Play, label: 'Retomar', nextStatus: 'in_progress' }
    case 'completed':
      return { Icon: RotateCcw, label: 'Reabrir', nextStatus: 'in_progress' }
    case 'dropped':
      return { Icon: RotateCcw, label: 'Recuperar', nextStatus: 'wishlist' }
    case 'wishlist':
    default:
      return { Icon: Play, label: 'Empezar', nextStatus: 'in_progress' }
  }
}

function getSecondaryItemAction(status: ItemStatus): { Icon: typeof Play; label: string; nextStatus: ItemStatus } {
  switch (status) {
    case 'in_progress':
      return { Icon: Pause, label: 'Pausar', nextStatus: 'paused' }
    case 'completed':
      return { Icon: RotateCcw, label: 'Pendiente', nextStatus: 'wishlist' }
    case 'dropped':
      return { Icon: Play, label: 'Empezar', nextStatus: 'in_progress' }
    case 'paused':
    case 'wishlist':
    default:
      return { Icon: Check, label: 'Completar', nextStatus: 'completed' }
  }
}

function CoverArt({ posterUrl, title, type }: { posterUrl?: string; title: string; type: ItemType }) {
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | undefined>()
  const Icon = typeIcons[type]
  const shouldShowPoster = Boolean(posterUrl && failedPosterUrl !== posterUrl)

  return (
    <div className={`cover-art ${type}`}>
      {shouldShowPoster && <img alt="" loading="lazy" src={posterUrl} onError={() => setFailedPosterUrl(posterUrl)} />}
      {!shouldShowPoster && <Icon size={24} aria-hidden="true" />}
      {!shouldShowPoster && <span>{title.slice(0, 1).toUpperCase()}</span>}
    </div>
  )
}

function ItemIdentity({ item }: { item: ListItem }) {
  return (
    <div className="item-identity">
      <div>
        <h3>{item.title}</h3>
        <p>{getItemSubtitle(item)}</p>
      </div>
      <span className={`item-status ${item.status}`}>{statusLabels[item.status]}</span>
    </div>
  )
}

function CandidateDialog({
  candidate,
  onClose,
  onCurate,
  onDismiss,
  onRestore,
  onSave,
}: {
  candidate: DiscoveryCandidate
  onClose: () => void
  onCurate?: () => void
  onDismiss: () => void
  onRestore: () => void
  onSave: () => void
}) {
  const isQueued = candidate.status === 'queued'
  const isDismissed = candidate.status === 'dismissed'
  const catalogActionLabel = candidate.source === 'nexo' ? 'Editar catalogo' : 'Crear ficha publica'

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="candidate-detail-title">
        <button className="icon-button dialog-close" type="button" onClick={onClose} title="Cerrar">
          <X size={18} />
        </button>
        <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
        <div className="detail-body">
          <div className="detail-meta">
            <span className="source-pill">{sourceLabels[candidate.source]}</span>
            <span className={`candidate-status ${candidate.status}`}>{discoveryStatusLabels[candidate.status]}</span>
            <span>{typeLabels[candidate.type]}</span>
            {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
          </div>
          <h2 id="candidate-detail-title">{candidate.title}</h2>
          <p>{candidate.overview || 'Sin descripcion todavia.'}</p>
          <div className="tag-row">
            {candidate.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          {isDismissed && (
            <div className="action-row detail-actions">
              <button className="primary-button" type="button" onClick={onRestore}>
                <RotateCcw size={16} />
                Recuperar a cola
              </button>
            </div>
          )}
          {isQueued && (
            <div className="action-row detail-actions">
              <button className="primary-button" type="button" onClick={onSave}>
                <Plus size={16} />
                Guardar en Biblioteca
              </button>
              {onCurate && (
                <button className="secondary-button" type="button" onClick={onCurate}>
                  <ShieldCheck size={16} />
                  {catalogActionLabel}
                </button>
              )}
              <button className="ghost-button danger-text" type="button" onClick={onDismiss}>
                <X size={16} />
                Descartar
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ItemEditor({
  item,
  onClose,
  onSave,
}: {
  item: ListItem
  onClose: () => void
  onSave: (item: ListItem) => void
}) {
  const [draft, setDraft] = useState({
    ...item,
    tagsText: item.tags.join(', '),
    genresText: item.genres.join(', '),
    moodText: item.moodTags.join(', '),
  })

  const update = <Key extends keyof typeof draft>(key: Key, value: (typeof draft)[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const editorTitle = draft.title.trim() || 'Nueva entrada'
  const selectedGenres = splitList(draft.genresText)
  const selectedTags = splitList(draft.tagsText)
  const selectedMoodTags = splitList(draft.moodText)
  const selectedGenreKeys = new Set(selectedGenres.map(normalizeKey))
  const selectedTagKeys = new Set(selectedTags.map(normalizeKey))
  const selectedMoodKeys = new Set(selectedMoodTags.map(normalizeKey))
  const genrePresets = catalogGenrePresets[draft.type].slice(0, 10)
  const tagPresets = catalogTagPresets[draft.type].slice(0, 8)
  const moodPresets = catalogMoodPresets.slice(0, 9)
  const taxonomyTemplates = catalogTaxonomyTemplates[draft.type].slice(0, 3)
  const starterTemplates = catalogTaxonomyTemplates[draft.type].slice(0, 4)
  const readiness = getPersonalEditorReadiness({
    ...draft,
    genres: selectedGenres,
    tags: selectedTags,
    moodTags: selectedMoodTags,
  })

  function toggleDraftTextPreset(field: 'genresText' | 'tagsText' | 'moodText', value: string) {
    setDraft((current) => ({
      ...current,
      [field]: toggleListTextValue(current[field], value),
    }))
  }

  function applyDraftTaxonomyTemplate(template: CatalogTaxonomyTemplate) {
    setDraft((current) => ({
      ...current,
      genresText: mergeListText(current.genresText, template.genres),
      tagsText: mergeListText(current.tagsText, template.tags),
      moodText: mergeListText(current.moodText, template.moodTags),
    }))
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="item-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
        onSubmit={(event) => {
          event.preventDefault()
          const priorityWeight = Number(draft.weights.priority)
          const surpriseWeight = Number(draft.weights.surprise)
          const challengeWeight = Number(draft.weights.challenge)
          const saved: ListItem = {
            ...draft,
            id: draft.id.startsWith('manual-') && draft.title ? `${draft.type}-${slugify(draft.title)}` : draft.id,
            tags: splitList(draft.tagsText),
            genres: splitList(draft.genresText),
            moodTags: splitList(draft.moodText),
            weights: {
              priority: Number.isFinite(priorityWeight) ? priorityWeight : 1,
              surprise: Number.isFinite(surpriseWeight) ? surpriseWeight : 0,
              challenge: Number.isFinite(challengeWeight) ? challengeWeight : 0,
            },
            updatedAt: nowIso(),
          }
          onSave(saved)
        }}
      >
        <div className="panel-heading">
          <div>
            <h2 id="item-editor-title">Entrada</h2>
            <p>
              {typeLabels[draft.type]} / {statusLabels[draft.status]}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="editor-hero">
          <CoverArt title={editorTitle} type={draft.type} posterUrl={draft.posterUrl} />
          <div className="editor-summary">
            <div className="detail-meta">
              <span>{itemSourceLabels[draft.source]}</span>
              <span>{statusLabels[draft.status]}</span>
              {draft.rating && <span>{draft.rating}/10</span>}
              {draft.publicItemId && <span>Nexo</span>}
            </div>
            <h3>{editorTitle}</h3>
            <p>{draft.notes || 'Sin notas todavia.'}</p>
          </div>
        </div>

        <section className="personal-readiness-panel" aria-label="Preparacion de entrada" data-testid="personal-readiness">
          <div className="personal-readiness-main">
            <div>
              <span className="eyebrow">Preparacion</span>
              <strong>{readiness.title}</strong>
              <p>{readiness.detail}</p>
            </div>
            <div className="personal-readiness-score">
              <strong>{readiness.score}/4</strong>
              <span>lista para Dado</span>
            </div>
          </div>
          <div
            aria-label={`Preparacion de entrada ${readiness.percent}%`}
            className="personal-readiness-meter"
            role="meter"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={readiness.percent}
          >
            <span style={{ width: `${readiness.percent}%` }} />
          </div>
          <div className="personal-readiness-checks" aria-label="Checklist de preparacion">
            {readiness.checks.map((check) => (
              <span className={check.done ? 'done' : undefined} key={check.label}>
                {check.done ? <Check size={13} /> : <X size={13} />}
                {check.label}
              </span>
            ))}
          </div>
        </section>

        <section className="personal-template-panel" aria-label="Inicio rapido de entrada">
          <div className="personal-template-heading">
            <div>
              <span className="eyebrow">Inicio rapido</span>
              <strong>Parte de una receta</strong>
              <p>Elige medio y aplica una base de generos, tags y tono antes de ajustar detalles.</p>
            </div>
            <label>
              Medio
              <select
                aria-label="Medio de inicio rapido"
                value={draft.type}
                onChange={(event) => update('type', event.target.value as ItemType)}
              >
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="personal-template-grid">
            {starterTemplates.map((template) => (
              <button
                aria-label={`Aplicar plantilla ${template.label} para ${typeLabels[draft.type]}`}
                className="personal-template-card"
                key={template.label}
                type="button"
                onClick={() => applyDraftTaxonomyTemplate(template)}
              >
                <span>
                  <Sparkles size={15} />
                  <strong>{template.label}</strong>
                </span>
                <small>{template.detail}</small>
                <div>
                  {template.genres.slice(0, 2).map((genre) => (
                    <em key={genre}>{genre}</em>
                  ))}
                  {template.moodTags.slice(0, 1).map((mood) => (
                    <em key={mood}>{mood}</em>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        <OriginSummary item={draft} />

        <section className="editor-section">
          <h3>Identidad</h3>
          <label>
            Titulo
            <input required value={draft.title} onChange={(event) => update('title', event.target.value)} />
          </label>
          <div className="form-grid">
            <label>
              Tipo
              <select value={draft.type} onChange={(event) => update('type', event.target.value as ItemType)}>
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select value={draft.status} onChange={(event) => update('status', event.target.value as ItemStatus)}>
                {ITEM_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rating
              <input
                max="10"
                min="0"
                step="0.1"
                type="number"
                value={draft.rating ?? ''}
                onChange={(event) => update('rating', event.target.value ? Number(event.target.value) : undefined)}
              />
            </label>
            <label>
              Duracion max.
              <input
                min="0"
                step="0.5"
                type="number"
                value={draft.durationMaxHours ?? ''}
                onChange={(event) =>
                  update('durationMaxHours', event.target.value ? Number(event.target.value) : undefined)
                }
              />
            </label>
            <label>
              Progreso
              <input value={draft.progress ?? ''} onChange={(event) => update('progress', event.target.value || undefined)} />
            </label>
            <label>
              Poster o portada
              <input value={draft.posterUrl ?? ''} onChange={(event) => update('posterUrl', event.target.value || undefined)} />
            </label>
          </div>
        </section>

        <section className="editor-section">
          <div className="editor-section-heading">
            <div>
              <h3>Taxonomia</h3>
              <p>{selectedGenres.length + selectedTags.length + selectedMoodTags.length} senales para busqueda y dado</p>
            </div>
          </div>
          <label>
            Generos
            <input value={draft.genresText} onChange={(event) => update('genresText', event.target.value)} />
          </label>
          <label>
            Tags
            <input value={draft.tagsText} onChange={(event) => update('tagsText', event.target.value)} />
          </label>
          <label>
            Mood tags
            <input value={draft.moodText} onChange={(event) => update('moodText', event.target.value)} />
          </label>
          <div className="taxonomy-assistant">
            <div className="taxonomy-template-list compact" aria-label={`Plantillas personales para ${typeLabels[draft.type]}`}>
              {taxonomyTemplates.map((template) => (
                <button className="taxonomy-template-button" key={template.label} type="button" onClick={() => applyDraftTaxonomyTemplate(template)}>
                  <span>
                    <Sparkles size={15} />
                    <strong>{template.label}</strong>
                  </span>
                  <small>{template.detail}</small>
                </button>
              ))}
            </div>
            <div className="personal-taxonomy-grid">
              <PresetChipGroup
                label="Generos"
                values={genrePresets}
                selectedKeys={selectedGenreKeys}
                onToggle={(value) => toggleDraftTextPreset('genresText', value)}
              />
              <PresetChipGroup
                label="Tags"
                values={tagPresets}
                selectedKeys={selectedTagKeys}
                onToggle={(value) => toggleDraftTextPreset('tagsText', value)}
              />
              <PresetChipGroup
                label="Tono"
                values={moodPresets}
                selectedKeys={selectedMoodKeys}
                onToggle={(value) => toggleDraftTextPreset('moodText', value)}
              />
            </div>
          </div>
        </section>

        <section className="editor-section">
          <h3>Dado</h3>
          <div className="form-grid">
            <label>
              Prioridad
              <input
                min="0"
                step="0.05"
                type="number"
                value={draft.weights.priority}
                onChange={(event) => update('weights', { ...draft.weights, priority: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              Sorpresa
              <input
                min="0"
                step="0.05"
                type="number"
                value={draft.weights.surprise}
                onChange={(event) => update('weights', { ...draft.weights, surprise: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              Reto
              <input
                min="0"
                step="0.05"
                type="number"
                value={draft.weights.challenge}
                onChange={(event) => update('weights', { ...draft.weights, challenge: Number(event.target.value) || 0 })}
              />
            </label>
          </div>
        </section>

        <section className="editor-section">
          <h3>Notas</h3>
          <label>
            Notas
            <textarea value={draft.notes ?? ''} onChange={(event) => update('notes', event.target.value)} />
          </label>
        </section>
        <div className="action-row end">
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}

function PublicItemEditor({
  item,
  onClose,
  onSave,
}: {
  item: PublicCatalogItem
  onClose: () => void
  onSave: (item: PublicCatalogItem, options?: { createAnother?: boolean }) => Promise<void> | void
}) {
  const [draft, setDraft] = useState({
    ...item,
    tagsText: item.tags.join(', '),
    genresText: item.genres.join(', '),
    moodText: item.moodTags.join(', '),
  })
  const warnings = draftCatalogQualityWarnings(draft)
  const selectedGenres = splitList(draft.genresText)
  const selectedGenreKeys = new Set(selectedGenres.map(normalizeKey))
  const selectedTags = splitList(draft.tagsText)
  const selectedTagKeys = new Set(selectedTags.map(normalizeKey))
  const selectedMoodTags = splitList(draft.moodText)
  const selectedMoodKeys = new Set(selectedMoodTags.map(normalizeKey))
  const genrePresets = catalogGenrePresets[draft.type]
  const tagPresets = catalogTagPresets[draft.type]
  const taxonomyTemplates = catalogTaxonomyTemplates[draft.type]
  const primaryTemplate = taxonomyTemplates[0]
  const featuredGenrePresets = uniqueValues([...taxonomyTemplates.flatMap((template) => template.genres), ...genrePresets]).slice(0, 14)
  const featuredTagPresets = tagPresets.slice(0, 10)
  const selectedTaxonomyCount = selectedGenres.length + selectedTags.length + selectedMoodTags.length
  const taxonomySignals = uniqueNormalizedValues([...selectedGenres, ...selectedTags, ...selectedMoodTags])
  const qualityChecklist = [
    { id: 'description', label: 'Descripcion', done: Boolean(draft.description?.trim()) },
    { id: 'genres', label: 'Generos', done: selectedGenres.length > 0 },
    { id: 'tags', label: 'Tags', done: selectedTags.length > 0 },
    { id: 'poster', label: 'Portada', done: Boolean(draft.posterUrl?.trim()) },
  ]
  const completedQualityCount = qualityChecklist.filter((entry) => entry.done).length
  const nextMissingQuality = qualityChecklist.find((entry) => !entry.done)?.label
  const isNewItem = !item.id
  const editorTitle = draft.title.trim() || 'Nueva entrada'
  const summaryDescription = draft.description?.trim() || 'Sin descripcion.'

  function buildDraftItem() {
    return buildPublicCatalogItem(
      {
        ...draft,
        id: draft.id || undefined,
        tags: splitList(draft.tagsText),
        genres: splitList(draft.genresText),
        moodTags: splitList(draft.moodText),
      },
      draft.updatedBy || 'moderator',
    )
  }

  function toggleTextPreset(field: 'genresText' | 'tagsText' | 'moodText', value: string) {
    setDraft((current) => {
      const currentValues = splitList(current[field])
      const valueKey = normalizeKey(value)
      const nextValues = currentValues.some((entry) => normalizeKey(entry) === valueKey)
        ? currentValues.filter((entry) => normalizeKey(entry) !== valueKey)
        : [...currentValues, value]

      return {
        ...current,
        [field]: nextValues.join(', '),
      }
    })
  }

  function clearTextPreset(field: 'genresText' | 'tagsText' | 'moodText') {
    setDraft((current) => ({ ...current, [field]: '' }))
  }

  function applyTaxonomyTemplate(template: CatalogTaxonomyTemplate) {
    setDraft((current) => ({
      ...current,
      genresText: mergeListText(current.genresText, template.genres),
      tagsText: mergeListText(current.tagsText, template.tags),
      moodText: mergeListText(current.moodText, template.moodTags),
    }))
  }

  function clearTaxonomy() {
    setDraft((current) => ({ ...current, genresText: '', tagsText: '', moodText: '' }))
  }

  function changeDraftType(type: ItemType) {
    setDraft((current) => {
      if (current.type === type) return current

      const hasTaxonomy =
        splitList(current.genresText).length + splitList(current.tagsText).length + splitList(current.moodText).length > 0

      if (hasTaxonomy) return { ...current, type }

      const template = catalogTaxonomyTemplates[type][0]

      return {
        ...current,
        type,
        genresText: mergeListText('', template?.genres ?? []),
        tagsText: mergeListText('', template?.tags ?? []),
        moodText: mergeListText('', template?.moodTags ?? []),
      }
    })
  }

  function completeMinimumDraft() {
    setDraft((current) => {
      const template = catalogTaxonomyTemplates[current.type][0]
      const nextGenresText = splitList(current.genresText).length
        ? current.genresText
        : mergeListText('', template?.genres ?? [])
      const nextTagsText = splitList(current.tagsText).length ? current.tagsText : mergeListText('', template?.tags ?? [])
      const nextMoodText = splitList(current.moodText).length ? current.moodText : mergeListText('', template?.moodTags ?? [])
      const signals = uniqueNormalizedValues([...splitList(nextGenresText), ...splitList(nextTagsText), ...splitList(nextMoodText)])

      return {
        ...current,
        description: current.description?.trim()
          ? current.description
          : buildCatalogDescriptionDraft(current.title, current.type, signals),
        genresText: nextGenresText,
        tagsText: nextTagsText,
        moodText: nextMoodText,
      }
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="item-editor public-item-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-item-editor-title"
        onSubmit={(event) => {
          event.preventDefault()
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
          onSave(buildDraftItem(), { createAnother: submitter?.value === 'create-another' })
        }}
      >
        <div className="panel-heading">
          <div>
            <h2 id="public-item-editor-title">Catalogo Nexo</h2>
            <p>Entrada publica curada</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="catalog-type-switcher" role="group" aria-label="Medio publico de la entrada">
          {ITEM_TYPES.map((type) => {
            const Icon = typeIcons[type]
            const isActive = draft.type === type

            return (
              <button
                aria-pressed={isActive}
                className={isActive ? 'catalog-type-button active' : 'catalog-type-button'}
                key={type}
                type="button"
                onClick={() => changeDraftType(type)}
              >
                <Icon size={15} />
                <span>{typeLabels[type]}</span>
              </button>
            )
          })}
        </div>

        <div className="editor-hero catalog-editor-hero">
          <CoverArt title={editorTitle} type={draft.type} posterUrl={draft.posterUrl} />
          <div className="editor-summary">
            <div className="detail-meta">
              <span>{typeLabels[draft.type]}</span>
              <span>{draft.releaseYear || 'Sin ano'}</span>
              <span>{selectedGenres.length ? `${selectedGenres.length} generos` : 'Sin generos'}</span>
            </div>
            <h3>{editorTitle}</h3>
            <p>{summaryDescription}</p>
          </div>
        </div>

        <section className="curation-speed-panel" aria-label="Curacion rapida">
          <div className="curation-speed-heading">
            <div>
              <span className="eyebrow">Curacion rapida</span>
              <strong>{completedQualityCount}/4 listo</strong>
              <small>{nextMissingQuality ? `Falta ${nextMissingQuality}` : 'Lista para guardar'}</small>
            </div>
            <div className="curation-speed-actions">
              <button className="primary-button" type="button" onClick={completeMinimumDraft}>
                <Check size={16} />
                Completar minimo
              </button>
              {primaryTemplate && (
                <button className="secondary-button" type="button" onClick={() => applyTaxonomyTemplate(primaryTemplate)}>
                  <Sparkles size={16} />
                  Base recomendada
                </button>
              )}
              {selectedTaxonomyCount > 0 && (
                <button className="ghost-button" type="button" onClick={clearTaxonomy}>
                  <X size={16} />
                  Limpiar taxonomia
                </button>
              )}
            </div>
          </div>
          <div className="quality-checklist" aria-label="Estado minimo de la ficha">
            {qualityChecklist.map((entry) => (
              <span className={entry.done ? 'done' : undefined} key={entry.id}>
                {entry.done ? <Check size={13} /> : <X size={13} />}
                {entry.label}
              </span>
            ))}
          </div>
          <div className="taxonomy-template-list compact speed-template-list" aria-label={`Recetas rapidas para ${typeLabels[draft.type]}`}>
            {taxonomyTemplates.map((template) => (
              <button className="taxonomy-template-button" key={template.label} type="button" onClick={() => applyTaxonomyTemplate(template)}>
                <span>
                  <Sparkles size={15} />
                  <strong>{template.label}</strong>
                </span>
                <small>{template.detail}</small>
                <em>
                  {template.genres.length} generos / {template.tags.length} tags
                </em>
              </button>
            ))}
          </div>
          <div className="active-taxonomy-strip" aria-label="Taxonomia activa">
            {taxonomySignals.length ? (
              taxonomySignals.slice(0, 10).map((signal) => <span key={signal}>{signal}</span>)
            ) : (
              <small>Sin taxonomia activa</small>
            )}
          </div>
        </section>

        <section
          className="catalog-genre-shortcuts"
          aria-label={`Generos predefinidos principales para ${typeLabels[draft.type]}`}
          data-testid="catalog-genre-shortcuts"
        >
          <div className="catalog-genre-shortcuts-heading">
            <div>
              <span className="eyebrow">Generos predefinidos</span>
              <strong>Marca la base de la ficha</strong>
              <p>Primero elige generos; despues ajusta tags y tono si hace falta.</p>
            </div>
            <span>{selectedGenres.length ? `${selectedGenres.length} activos` : 'Sin elegir'}</span>
          </div>
          <div className="preset-chip-row catalog-genre-shortcut-row">
            {featuredGenrePresets.map((genre) => {
              const isActive = selectedGenreKeys.has(normalizeKey(genre))

              return (
                <button
                  aria-pressed={isActive}
                  className={isActive ? 'preset-chip active' : 'preset-chip'}
                  key={genre}
                  type="button"
                  onClick={() => toggleTextPreset('genresText', genre)}
                >
                  {genre}
                </button>
              )
            })}
          </div>
        </section>

        <div className="public-editor-body">
          <div className="public-editor-main">
            <section className="editor-section">
              <h3>Identidad</h3>
              <label>
                Titulo
                <input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <div className="form-grid">
                <label>
                  Tipo
                  <select value={draft.type} onChange={(event) => changeDraftType(event.target.value as ItemType)}>
                    {ITEM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {typeLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ano
                  <input
                    type="number"
                    min="1800"
                    max="2100"
                    value={draft.releaseYear ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, releaseYear: event.target.value ? Number(event.target.value) : undefined }))
                    }
                  />
                </label>
              </div>
              <label>
                Descripcion
                <textarea value={draft.description ?? ''} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label>
                Poster o portada
                <input value={draft.posterUrl ?? ''} onChange={(event) => setDraft((current) => ({ ...current, posterUrl: event.target.value || undefined }))} />
              </label>
            </section>

            <section className="editor-section catalog-taxonomy-workbench">
              <div className="editor-section-heading">
                <div>
                  <h3>Taxonomia guiada</h3>
                  <p>Usa chips predefinidos y deja el texto libre solo para ajustes finos.</p>
                </div>
                <span>{selectedTaxonomyCount} activos</span>
              </div>
              <div className="catalog-taxonomy-board">
                <CatalogPresetField
                  featured
                  title="Generos"
                  inputLabel="Generos"
                  hint={selectedGenres.length ? `${selectedGenres.length} seleccionados` : 'Elige uno o varios'}
                  value={draft.genresText}
                  values={genrePresets}
                  selectedKeys={selectedGenreKeys}
                  suggestionsLabel={`Generos predefinidos para ${typeLabels[draft.type]}`}
                  clearLabel="Limpiar generos"
                  onChange={(value) => setDraft((current) => ({ ...current, genresText: value }))}
                  onClear={() => clearTextPreset('genresText')}
                  onToggle={(value) => toggleTextPreset('genresText', value)}
                />
                <CatalogPresetField
                  title="Tags"
                  inputLabel="Tags"
                  hint={selectedTags.length ? `${selectedTags.length} seleccionados` : 'Senales para busqueda y dado'}
                  value={draft.tagsText}
                  values={featuredTagPresets}
                  selectedKeys={selectedTagKeys}
                  suggestionsLabel={`Sugerencias de tags para ${typeLabels[draft.type]}`}
                  clearLabel="Limpiar tags"
                  onChange={(value) => setDraft((current) => ({ ...current, tagsText: value }))}
                  onClear={() => clearTextPreset('tagsText')}
                  onToggle={(value) => toggleTextPreset('tagsText', value)}
                />
                <CatalogPresetField
                  title="Tono"
                  inputLabel="Mood tags"
                  hint={selectedMoodTags.length ? `${selectedMoodTags.length} seleccionados` : 'Como se siente la obra'}
                  value={draft.moodText}
                  values={catalogMoodPresets}
                  selectedKeys={selectedMoodKeys}
                  suggestionsLabel="Sugerencias de tono"
                  clearLabel="Limpiar tono"
                  onChange={(value) => setDraft((current) => ({ ...current, moodText: value }))}
                  onClear={() => clearTextPreset('moodText')}
                  onToggle={(value) => toggleTextPreset('moodText', value)}
                />
              </div>
            </section>
          </div>

          <aside className="public-editor-aside">
            <div className={warnings.length ? 'quality-panel warning' : 'quality-panel'}>
              <div>
                <strong>{warnings.length ? 'Ficha incompleta' : 'Ficha lista'}</strong>
                <p>{warnings.length ? warnings.join(' / ') : 'Tiene portada, descripcion y taxonomia basica.'}</p>
              </div>
              <span>{warnings.length ? warnings.length : 'OK'}</span>
            </div>
          </aside>
        </div>

        <div className="action-row end">
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          {isNewItem && (
            <button className="secondary-button" type="submit" value="create-another">
              <Plus size={16} />
              Guardar y crear otra
            </button>
          )}
          <button className="primary-button" type="submit">
            Guardar en catalogo
          </button>
        </div>
      </form>
    </div>
  )
}

function CatalogPresetField({
  clearLabel,
  featured = false,
  hint,
  inputLabel,
  onChange,
  onClear,
  onToggle,
  selectedKeys,
  suggestionsLabel,
  title,
  value,
  values,
}: {
  clearLabel: string
  featured?: boolean
  hint: string
  inputLabel: string
  onChange: (value: string) => void
  onClear: () => void
  onToggle: (value: string) => void
  selectedKeys: Set<string>
  suggestionsLabel: string
  title: string
  value: string
  values: string[]
}) {
  const hasValue = splitList(value).length > 0

  return (
    <div className={featured ? 'catalog-preset-field featured' : 'catalog-preset-field'}>
      <div className="preset-chip-heading">
        <div>
          <strong>{title}</strong>
          <span>{hint}</span>
        </div>
        {hasValue && (
          <button className="micro-icon-button" type="button" onClick={onClear} title={clearLabel} aria-label={clearLabel}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="preset-chip-row" aria-label={suggestionsLabel}>
        {values.map((preset) => {
          const isActive = selectedKeys.has(normalizeKey(preset))

          return (
            <button
              aria-pressed={isActive}
              className={isActive ? 'preset-chip active' : 'preset-chip'}
              key={preset}
              type="button"
              onClick={() => onToggle(preset)}
            >
              {preset}
            </button>
          )
        })}
      </div>
      <label className="catalog-preset-input">
        <span>Texto libre</span>
        <input aria-label={inputLabel} value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  )
}

function LaunchGuideCard({
  guide,
  onAdd,
  onEditItem,
  onNavigate,
}: {
  guide: LibraryLaunchGuide
  onAdd: () => void
  onEditItem: (item: ListItem) => void
  onNavigate: (tab: AppTab) => void
}) {
  const nextStep = guide.steps.find((step) => !step.done)

  function handleStepAction(step: LibraryLaunchStep) {
    if (step.action === 'add') {
      onAdd()
      return
    }
    if (step.action === 'edit-taxonomy' && step.item) {
      onEditItem(step.item)
      return
    }
    if (step.action === 'open-dice') {
      onNavigate('dice')
      return
    }
    if (step.action === 'open-explorer') {
      onNavigate('explorer')
    }
  }

  return (
    <section className="launch-guide-card" aria-label="Plan de arranque de Nexo" data-testid="launch-guide">
      <div className="launch-guide-heading">
        <span className="eyebrow">Plan de arranque</span>
        <strong>{guide.title}</strong>
        <p>{guide.detail}</p>
      </div>
      <div
        aria-label={`Preparacion de Nexo ${guide.percent}%`}
        className="launch-guide-meter"
        role="meter"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={guide.percent}
      >
        <span style={{ width: `${guide.percent}%` }} />
      </div>
      <div className="launch-guide-steps">
        {guide.steps.map((step) => {
          const Icon = step.done ? CheckCircle2 : Info

          return (
            <article className={step.done ? 'launch-step done' : 'launch-step'} key={step.id}>
              <Icon size={16} />
              <div>
                <strong>{step.label}</strong>
                <p>{step.detail}</p>
              </div>
              {!step.done && step.actionLabel && (
                <button className="small-button" type="button" onClick={() => handleStepAction(step)}>
                  {step.actionLabel}
                </button>
              )}
            </article>
          )
        })}
      </div>
      {nextStep ? (
        <p className="launch-guide-next">Siguiente: {nextStep.label.toLowerCase()}</p>
      ) : (
        <p className="launch-guide-next done">Nexo esta listo para seguir creciendo.</p>
      )}
    </section>
  )
}

function RecommendationSessionPlanView({ plan }: { plan: RecommendationSessionPlan }) {
  return (
    <section className="session-plan-card" aria-label="Plan de sesion recomendado">
      <div className="session-plan-heading">
        <div>
          <span className="eyebrow">Plan de sesion</span>
          <strong>{plan.title}</strong>
          <p>{plan.detail}</p>
        </div>
      </div>
      <div className="session-plan-grid">
        {plan.facts.map((fact) => (
          <div key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
            <small>{fact.detail}</small>
          </div>
        ))}
      </div>
      <div className="session-signal-row" aria-label="Senales de la sesion">
        {plan.signals.length ? plan.signals.map((signal) => <span key={signal}>{signal}</span>) : <small>Sin senales todavia</small>}
      </div>
    </section>
  )
}

function LibraryNextPlan({ item }: { item: ListItem }) {
  const signals = uniqueValues([...item.genres, ...item.moodTags, ...item.tags]).slice(0, 4)
  const facts = getLibraryNextPlanFacts(item, signals.length)

  return (
    <section className="library-next-plan" aria-label={`Plan rapido para ${item.title}`} data-testid="library-next-plan">
      <div className="library-next-plan-heading">
        <span className="eyebrow">Plan rapido</span>
        <strong>{getLibraryNextPlanTitle(item)}</strong>
      </div>
      <div className="library-next-facts">
        {facts.map((fact) => (
          <span key={fact.label}>
            <small>{fact.label}</small>
            <strong>{fact.value}</strong>
          </span>
        ))}
      </div>
      <div className="library-next-signals" aria-label={`Senales rapidas del plan ${item.title}`}>
        {signals.length ? signals.map((signal) => <span key={signal}>{signal}</span>) : <small>Sin senales todavia</small>}
      </div>
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FeedbackMessage({ children, tone = 'info' }: { children: ReactNode; tone?: FeedbackTone }) {
  const Icon = tone === 'danger' ? AlertTriangle : tone === 'success' ? CheckCircle2 : tone === 'loading' ? LoaderCircle : Info

  return (
    <p
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className={`feedback-message ${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{children}</span>
    </p>
  )
}

function PreferencePreview({ label, tone, values }: { label: string; tone?: 'danger'; values: string[] }) {
  return (
    <div className={tone === 'danger' ? 'preference-preview-group danger' : 'preference-preview-group'}>
      <strong>{label}</strong>
      {values.length ? (
        <div className="preference-chip-row">
          {values.slice(0, 8).map((value) => (
            <span key={value}>{value}</span>
          ))}
          {values.length > 8 && <span>+{values.length - 8}</span>}
        </div>
      ) : (
        <p>Sin valores</p>
      )}
    </div>
  )
}

function DiceEligibilityPanel({
  activeFilters,
  breakdown,
  recoveryActions,
}: {
  activeFilters: string[]
  breakdown: DiceEligibilityBreakdown
  recoveryActions: DiceRecoveryAction[]
}) {
  const exclusionRows = [
    { label: 'Completadas/droppeadas', value: breakdown.resolved },
    { label: 'Pausadas', value: breakdown.paused },
    { label: 'Cooldown', value: breakdown.cooldown },
    { label: 'Medio', value: breakdown.medium },
    { label: 'Tags bloqueados', value: breakdown.blockedTags },
  ].filter((row) => row.value > 0)

  return (
    <section className="dice-eligibility-panel" aria-label="Elegibilidad del dado">
      <div className="dice-eligibility-head">
        <div>
          <h3>Elegibilidad</h3>
          <p>
            {breakdown.available} de {breakdown.total} pueden salir ahora
          </p>
        </div>
        <strong>{breakdown.total ? Math.round((breakdown.available / breakdown.total) * 100) : 0}%</strong>
      </div>
      <div className="eligibility-meter" aria-hidden="true">
        <span style={{ width: `${breakdown.total ? (breakdown.available / breakdown.total) * 100 : 0}%` }} />
      </div>
      <div className="eligibility-grid">
        <div>
          <span>Activas</span>
          <strong>{breakdown.available}</strong>
        </div>
        <div>
          <span>Fuera</span>
          <strong>{breakdown.total - breakdown.available}</strong>
        </div>
      </div>
      {exclusionRows.length > 0 && (
        <div className="eligibility-reasons">
          {exclusionRows.map((row) => (
            <span key={row.label}>
              {row.label}: {row.value}
            </span>
          ))}
        </div>
      )}
      <div className="eligibility-filters">
        {activeFilters.map((filter) => (
          <span key={filter}>{filter}</span>
        ))}
      </div>
      {breakdown.total > 0 && breakdown.available === 0 && recoveryActions.length > 0 && (
        <section className="eligibility-recovery" aria-label="Rescate del dado" data-testid="dice-recovery">
          <div className="eligibility-recovery-heading">
            <span className="eyebrow">Rescate</span>
            <strong>Abre una tirada posible</strong>
            <p>Prueba un ajuste amplio y vuelve a cerrar filtros cuando haya candidatas.</p>
          </div>
          <div className="eligibility-recovery-actions">
            {recoveryActions.map((action) => {
              const Icon = action.Icon
              return (
                <button key={action.id} className="eligibility-recovery-action" type="button" onClick={action.onClick}>
                  <Icon size={15} />
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.detail}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}

function PresetChipGroup({
  label,
  onToggle,
  selectedKeys,
  values,
}: {
  label: string
  onToggle: (value: string) => void
  selectedKeys: Set<string>
  values: string[]
}) {
  return (
    <div className="preset-chip-panel compact">
      <div className="preset-chip-heading">
        <div>
          <strong>{label}</strong>
          <span>{values.filter((value) => selectedKeys.has(normalizeKey(value))).length} activos</span>
        </div>
      </div>
      <div className="preset-chip-row" aria-label={`Sugerencias de ${label.toLowerCase()}`}>
        {values.map((value) => {
          const isActive = selectedKeys.has(normalizeKey(value))
          return (
            <button
              aria-pressed={isActive}
              className={isActive ? 'preset-chip active' : 'preset-chip'}
              key={value}
              type="button"
              onClick={() => onToggle(value)}
            >
              {value}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OriginSummary({ item }: { item: ListItem }) {
  const externalRefs = getExternalRefEntries(item.externalRefs)
  const importNotes = item.importNotes ?? []
  const hasOriginDetails = item.source !== 'manual' || item.publicSnapshot || externalRefs.length > 0 || importNotes.length > 0

  if (!hasOriginDetails) return null

  const sourceDetail =
    item.source === 'public'
      ? 'Copia privada vinculada al catalogo publico.'
      : item.source === 'external'
        ? 'Guardada desde busqueda externa.'
        : item.source === 'markdown'
          ? 'Importada desde un archivo markdown.'
          : 'Entrada creada manualmente.'
  const privacyDetail = item.publicItemId
    ? 'Tus notas, rating, estado, progreso y pesos del dado no cambian el catalogo publico.'
    : 'Esta ficha vive solo en tu biblioteca privada.'

  return (
    <section className="origin-panel" aria-label="Origen de la entrada">
      <div className="origin-panel-heading">
        <span>
          <Info size={16} />
        </span>
        <div>
          <h3>Origen</h3>
          <p>{privacyDetail}</p>
        </div>
      </div>
      <div className="origin-fact-grid">
        <OriginFact label="Fuente" value={itemSourceLabels[item.source]} detail={sourceDetail} />
        {item.publicItemId && <OriginFact label="Catalogo" value={item.publicSnapshot?.title ?? item.publicItemId} detail={item.publicItemId} />}
        {item.publicSnapshot?.updatedAt && (
          <OriginFact label="Snapshot" value={formatDateLabel(item.publicSnapshot.updatedAt)} detail="Metadatos copiados al guardar." />
        )}
        {externalRefs.length > 0 && <OriginFact label="Referencias" value={`${externalRefs.length}`} detail={externalRefs.map((ref) => `${ref.label}: ${ref.value}`).join(' / ')} />}
        {importNotes.length > 0 && <OriginFact label="Importacion" value={`${importNotes.length} notas`} detail={importNotes.slice(0, 2).join(' / ')} />}
      </div>
    </section>
  )
}

function OriginFact({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="origin-fact">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  )
}

function EmptyState({
  action,
  detail,
  icon: Icon = Sparkles,
  title,
  tone = 'neutral',
}: {
  title: string
  detail: string
  icon?: typeof Sparkles
  tone?: 'neutral' | 'loading' | 'muted' | 'warning'
  action?: ReactNode
}) {
  return (
    <div className={`empty-state ${tone}`}>
      <span className="empty-state-icon">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}

function ShellState({ action, detail, title }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <main className="auth-shell">
      <section>
        <Library size={32} />
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {action}
      </section>
    </main>
  )
}

function blankPublicCatalogItem(type: ItemType = 'book'): PublicCatalogItem {
  const timestamp = nowIso()
  return {
    id: '',
    title: '',
    type,
    genres: [],
    tags: [],
    moodTags: [],
    externalRefs: {},
    searchTokens: [],
    canonicalKey: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: 'moderator',
    updatedBy: 'moderator',
  }
}

function publicCatalogDraftFromTemplate(type: ItemType, template: CatalogTaxonomyTemplate): PublicCatalogItem {
  return {
    ...blankPublicCatalogItem(type),
    genres: [...template.genres],
    tags: [...template.tags],
    moodTags: [...template.moodTags],
  }
}

function publicCatalogDraftFromCandidate(candidate: DiscoveryCandidate): PublicCatalogItem {
  const draft = blankPublicCatalogItem(candidate.type)
  const snapshot = candidate.publicSnapshot

  return {
    ...draft,
    id: snapshot?.id ?? '',
    title: candidate.title,
    type: candidate.type,
    description: candidate.overview ?? snapshot?.description,
    releaseYear: candidate.releaseYear ?? snapshot?.releaseYear,
    genres: uniqueValues(snapshot?.genres ?? candidate.genres),
    tags: snapshot?.tags ?? publicCatalogTagsFromCandidate(candidate),
    moodTags: uniqueValues(snapshot?.moodTags ?? candidate.moodTags),
    externalRefs: snapshot?.externalRefs ?? candidate.externalRefs,
    posterUrl: candidate.posterUrl ?? snapshot?.posterUrl,
    canonicalKey: snapshot?.canonicalKey ?? '',
    createdAt: snapshot?.updatedAt ?? candidate.createdAt,
    updatedAt: snapshot?.updatedAt ?? draft.updatedAt,
  }
}

function publicCatalogTagsFromCandidate(candidate: DiscoveryCandidate) {
  const technicalTags = new Set([candidate.type, candidate.source, 'nexo', 'prompt'].map(normalizeKey))
  return uniqueValues(candidate.tags.filter((tag) => !technicalTags.has(normalizeKey(tag))))
}

function getShellPulseItems(
  library: Pick<LibrarySurface, 'discoveryCandidates' | 'isModerator' | 'items' | 'userRole'>,
  isFirebaseConfigured: boolean,
) {
  const now = Date.now()
  const privateCopyCount = library.items.filter((item) => Boolean(item.publicItemId)).length
  const diceReadyCount = library.items.filter((item) => isItemReadyForDicePulse(item, now)).length
  const queuedDiscoveryCount = library.discoveryCandidates.filter((candidate) => candidate.status === 'queued').length
  const accountMode = isFirebaseConfigured ? 'Google' : 'Demo'

  return [
    {
      Icon: Library,
      detail: `${privateCopyCount} Nexo`,
      label: 'Biblioteca',
      tone: library.items.length ? 'good' : 'warning',
      value: String(library.items.length),
    },
    {
      Icon: Dice5,
      detail: diceReadyCount ? 'listas' : 'sin candidatas',
      label: 'Dado',
      tone: diceReadyCount ? 'good' : 'warning',
      value: String(diceReadyCount),
    },
    {
      Icon: Sparkles,
      detail: queuedDiscoveryCount ? 'por decidir' : 'limpio',
      label: 'Explorador',
      tone: queuedDiscoveryCount ? 'action' : 'muted',
      value: String(queuedDiscoveryCount),
    },
    {
      Icon: ShieldCheck,
      detail: library.isModerator ? 'curacion activa' : accountMode,
      label: 'Rol',
      tone: library.isModerator ? 'good' : 'muted',
      value: roleLabels[library.userRole],
    },
  ] as const
}

function upsertVisibleCatalogItem(items: PublicCatalogItem[], nextItem: PublicCatalogItem) {
  return [nextItem, ...items.filter((item) => item.id !== nextItem.id)].sort((left, right) => left.title.localeCompare(right.title, 'es'))
}

function getDiceScoreMeterWidth(score: number, maxScore: number) {
  if (maxScore <= 0) return '0%'
  return `${Math.min(100, Math.max(8, (score / maxScore) * 100))}%`
}

function getRecommendationSessionPlan(
  recommendation: RecommendationResult,
  preferences: RecommendationPreferences,
): RecommendationSessionPlan {
  const item = recommendation.item
  const duration = item.durationMinHours || item.durationMaxHours ? formatDuration(item) : 'Sin duracion'
  const budget = preferences.timeBudgetHours ? `${preferences.timeBudgetHours}h max.` : 'Sin limite'
  const signals = uniqueValues([...item.genres, ...item.moodTags, ...item.tags]).slice(0, 6)
  const title =
    item.status === 'in_progress'
      ? 'Continuar una obra activa'
      : item.status === 'paused'
        ? 'Retomar sin perder contexto'
        : 'Nueva sesion recomendada'
  const detail = `${typeLabels[item.type]} con intensidad ${intensityLabels[preferences.intensity].toLowerCase()} y ${preferences.surprisePercent}% de sorpresa.`

  return {
    detail,
    facts: [
      { detail: `${energyLabels[preferences.energy]} energia`, label: 'Clima', value: intensityLabels[preferences.intensity] },
      { detail: budget, label: 'Tiempo', value: duration },
      { detail: typeLabels[item.type], label: 'Estado', value: statusLabels[item.status] },
      { detail: `Pool ${recommendation.poolSize}`, label: 'Azar', value: `${Math.round(recommendation.roll * 100)}%` },
    ],
    signals,
    title,
  }
}

function buildCatalogDescriptionDraft(title: string, type: ItemType, signals: string[]) {
  const displayTitle = title.trim() || 'Entrada pendiente'
  const signalText = signals.length ? signals.slice(0, 4).join(', ') : typeLabels[type].toLowerCase()
  return `${displayTitle} combina ${signalText} en una ficha curada para el catalogo Nexo.`
}

function uniqueNormalizedValues(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = normalizeKey(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sameList(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function sameRecommendationPreferences(left: RecommendationPreferences, right: RecommendationPreferences) {
  return (
    left.medium === right.medium &&
    left.timeBudgetHours === right.timeBudgetHours &&
    left.energy === right.energy &&
    left.intensity === right.intensity &&
    left.novelty === right.novelty &&
    left.includePaused === right.includePaused &&
    left.surprisePercent === right.surprisePercent &&
    left.seed === right.seed
  )
}

function splitList(value: string) {
  return uniqueValues(value.split(',').map((entry) => entry.trim()))
}

function mergeListText(currentText: string, additions: string[]) {
  return uniqueValues([...splitList(currentText), ...additions]).join(', ')
}

function toggleListTextValue(currentText: string, value: string) {
  const currentValues = splitList(currentText)
  const valueKey = normalizeKey(value)
  const nextValues = currentValues.some((entry) => normalizeKey(entry) === valueKey)
    ? currentValues.filter((entry) => normalizeKey(entry) !== valueKey)
    : [...currentValues, value]

  return nextValues.join(', ')
}

function getExternalRefEntries(refs?: ExternalRefs) {
  if (!refs) return []

  return (Object.entries(refs) as Array<[keyof ExternalRefs, string | undefined]>)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({
      label: externalRefLabels[key],
      value: compactRefValue(value ?? ''),
    }))
}

function compactRefValue(value: string) {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}

export default App
