import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Dice5,
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
import { buildPublicCatalogItem, promptToDiscovery } from './lib/catalog'
import { createLibraryExportPayload, parseLibraryImportPayload } from './lib/libraryBackup'
import { recommendItem, scoreCandidates } from './lib/recommendations'
import { normalizeKey, slugify, uniqueValues } from './lib/strings'

const typeLabels: Record<ItemType | 'any' | 'watch', string> = {
  any: 'Todo',
  watch: 'Ver',
  game: 'Juegos',
  book: 'Libros',
  movie: 'Cine',
  series: 'Series',
  anime: 'Anime',
  manga: 'Manga',
  manhwa: 'Manhwa',
  comic: 'Comic',
  other: 'Otro',
}

const statusLabels: Record<ItemStatus | 'all', string> = {
  all: 'Todo',
  wishlist: 'Pendiente',
  in_progress: 'En progreso',
  paused: 'Pausado',
  completed: 'Completado',
  dropped: 'Droppeado',
}

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

const sourceLabels: Record<DiscoveryCandidate['source'], string> = {
  nexo: 'Nexo',
  tmdb: 'TMDB',
  rawg: 'RAWG',
  openLibrary: 'Open Library',
  anilist: 'AniList',
  wikidata: 'Wikidata',
  prompt: 'Explorador',
}

const discoveryStatusLabels: Record<DiscoveryStatus, string> = {
  queued: 'En cola',
  saved: 'Guardados',
  dismissed: 'Descartados',
}

const discoveryEmptyCopy: Record<DiscoveryStatus, { title: string; detail: string }> = {
  queued: {
    title: 'La cola esta limpia',
    detail: 'Busca en el catalogo Nexo, tira una carta sorpresa o guarda hallazgos externos.',
  },
  saved: {
    title: 'Aun no has guardado hallazgos',
    detail: 'Cuando algo pase a Biblioteca quedara registrado aqui para recordar de donde vino.',
  },
  dismissed: {
    title: 'No hay descartes',
    detail: 'Lo que apartes de la cola aparece aqui sin ensuciar tus pendientes.',
  },
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  moderator: 'Moderador',
  user: 'Usuario',
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
  if (normalized.includes('no se pudo') || normalized.includes('error')) return 'danger'
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

const catalogGenrePresets: Record<ItemType, string[]> = {
  game: ['Accion', 'Aventura', 'RPG', 'Estrategia', 'Metroidvania', 'Roguelike', 'Puzzle', 'Terror'],
  book: ['Clasico', 'Fantasia', 'Ciencia ficcion', 'Misterio', 'Ensayo', 'Historia', 'Aventura', 'Romance'],
  movie: ['Drama', 'Ciencia ficcion', 'Thriller', 'Terror', 'Comedia', 'Animacion', 'Fantasia', 'Documental'],
  series: ['Drama', 'Ciencia ficcion', 'Thriller', 'Comedia', 'Fantasia', 'Crimen', 'Animacion', 'Documental'],
  anime: ['Shonen', 'Seinen', 'Slice of life', 'Mecha', 'Fantasia', 'Drama', 'Romance', 'Comedia'],
  manga: ['Shonen', 'Seinen', 'Shojo', 'Josei', 'Fantasia', 'Drama', 'Romance', 'Terror'],
  manhwa: ['Fantasia', 'Accion', 'Romance', 'Drama', 'Isekai', 'Historico', 'Comedia', 'Thriller'],
  comic: ['Superheroes', 'Fantasia', 'Ciencia ficcion', 'Crimen', 'Aventura', 'Drama', 'Terror', 'Humor'],
  other: ['Aventura', 'Drama', 'Ciencia ficcion', 'Fantasia', 'Misterio', 'Ligero', 'Denso', 'Experimental'],
}

const catalogTagPresets: Record<ItemType, string[]> = {
  game: ['indie', 'single-player', 'cooperativo', 'mundo abierto', 'historia fuerte', 'dificil', 'corto', 'sin spoilers'],
  book: ['clasico', 'moderno', 'literatura', 'epico', 'introspectivo', 'politico', 'adaptacion', 'premiado'],
  movie: ['autor', 'culto', 'premiada', 'palomitas', 'contemplativa', 'experimental', 'familiar', 'adaptacion'],
  series: ['serializada', 'miniserie', 'procedural', 'prestige', 'familiar', 'adaptacion', 'coral', 'lenta'],
  anime: ['temporada corta', 'pelicula', 'original', 'adaptacion', 'sakuga', 'clasico', 'popular', 'raro'],
  manga: ['serializado', 'finalizado', 'clasico', 'popular', 'raro', 'adaptacion', 'autoconclusivo', 'largo'],
  manhwa: ['webtoon', 'finalizado', 'popular', 'romance', 'progresion', 'fantasia', 'largo', 'ligero'],
  comic: ['autoconclusivo', 'serie abierta', 'clasico', 'autor', 'mainstream', 'indie', 'premiado', 'adaptacion'],
  other: ['manual', 'pendiente', 'curado', 'raro', 'popular', 'clasico', 'corto', 'experimental'],
}

const catalogMoodPresets = ['ligero', 'denso', 'intenso', 'rapido', 'confort', 'sorpresa', 'melancolico', 'raro']

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
  const [activeTab, setActiveTab] = useState<AppTab>('library')
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Nexo 1.0 beta</span>
          <h1>{shellTitle}</h1>
          <p className="topbar-subtitle">{activeNavItem.description}</p>
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
                onClick={() => setActiveTab(item.id)}
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
        {activeTab === 'library' && <LibraryTab library={library} setTheme={setTheme} />}
        {activeTab === 'dice' && <DiceTab library={library} />}
        {activeTab === 'explorer' && <ExplorerTab library={library} />}
        {activeTab === 'settings' && (
          <SettingsTab library={library} setTheme={setTheme} theme={theme} user={auth.user} />
        )}
        {activeTab === 'curation' && library.isModerator && <CurationTab library={library} />}
      </section>
    </main>
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
  saveDiscoveryToLibrary: (candidate: DiscoveryCandidate) => Promise<ListItem>
  upsertPublicItem: (item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) => Promise<PublicCatalogItem>
  archivePublicItem: (id: string) => Promise<void>
  updateUserRole: (targetUserId: string, role: UserRole) => Promise<void>
  publicItemToDiscovery: (item: PublicCatalogItem) => DiscoveryCandidate
  externalCandidateToDiscovery: (candidate: ExternalCandidate) => DiscoveryCandidate
}

function LibraryTab({ library, setTheme }: { library: LibrarySurface; setTheme: (theme: ThemeMode) => void }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<ListItem | undefined>()
  const [importStatus, setImportStatus] = useState<string | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const viewMode = library.settings.libraryViewMode
  const trimmedQuery = query.trim()
  const hasActiveLibraryFilters = Boolean(trimmedQuery) || typeFilter !== 'all' || statusFilter !== 'all'
  const activeLibraryFilters = [
    trimmedQuery ? `Busqueda: ${trimmedQuery}` : undefined,
    typeFilter !== 'all' ? `Tipo: ${typeLabels[typeFilter]}` : undefined,
    statusFilter !== 'all' ? `Estado: ${statusLabels[statusFilter]}` : undefined,
  ].filter((filter): filter is string => Boolean(filter))

  const filteredItems = useMemo(() => {
    return library.items
      .filter((item) => {
        const text = `${item.title} ${item.tags.join(' ')} ${item.genres.join(' ')}`.toLowerCase()
        return text.includes(query.toLowerCase())
      })
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
  }, [library.items, query, statusFilter, typeFilter])

  const stats = useMemo(() => {
    return ITEM_STATUSES.map((status) => ({
      status,
      count: library.items.filter((item) => item.status === status).length,
    }))
  }, [library.items])

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
    const payload = createLibraryExportPayload(library.items, library.settings)
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `nexo-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(href)
  }

  async function changeViewMode(nextViewMode: LibraryViewMode) {
    if (viewMode === nextViewMode) return
    await library.saveSettings({ libraryViewMode: nextViewMode })
  }

  function resetLibraryFilters() {
    setQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
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
        </div>

        {hasActiveLibraryFilters && (
          <div className="filter-summary" aria-live="polite">
            <div>
              <strong>
                {filteredItems.length} de {library.items.length} entradas
              </strong>
              <span>{activeLibraryFilters.join(' / ')}</span>
            </div>
            <button className="ghost-button" type="button" onClick={resetLibraryFilters}>
              <X size={16} />
              Limpiar filtros
            </button>
          </div>
        )}

        {library.loading && <FeedbackMessage tone="loading">Cargando biblioteca...</FeedbackMessage>}
        {library.error && <FeedbackMessage tone="danger">{library.error}</FeedbackMessage>}
        {importStatus && <FeedbackMessage tone={feedbackToneFromText(importStatus)}>{importStatus}</FeedbackMessage>}

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
            title={hasActiveLibraryFilters ? 'Sin resultados' : 'Nada por aqui'}
            detail={
              hasActiveLibraryFilters
                ? 'Limpia filtros o prueba una busqueda menos concreta para volver a ver tu biblioteca.'
                : 'Importa tu biblioteca, guarda algo desde Explorador o anade una entrada manual.'
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
  const [status, setStatus] = useState<string | undefined>()
  const persistedPreferences = library.settings.recommendationPreferences ?? DEFAULT_RECOMMENDATION_PREFERENCES
  const preferences = draftPreferences ?? persistedPreferences
  const hasUnsavedDicePreferences = !sameRecommendationPreferences(preferences, persistedPreferences)
  const scoredCandidates = useMemo(
    () => scoreCandidates(library.items, preferences, library.settings),
    [library.items, library.settings, preferences],
  )
  const candidatePreview = scoredCandidates.slice(0, 4)
  const unavailableCount = Math.max(0, library.items.length - scoredCandidates.length)
  const hasCandidates = scoredCandidates.length > 0
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
          <ol className="dice-candidate-list">
            {candidatePreview.map((candidate) => (
              <li key={candidate.item.id}>
                <span>{candidate.item.title}</span>
                <strong>{candidate.score}</strong>
                <small>{candidate.reasons[0]}</small>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="Sin candidatas"
            detail="Afloja filtros, incluye pausados o anade pendientes desde Biblioteca y Explorador."
          />
        )}
        <div className="dice-footnotes">
          <span>{unavailableCount} fuera por estado, cooldown o filtros</span>
          <span>Pool maximo {Math.min(scoredCandidates.length, Math.max(3, Math.ceil(3 + preferences.surprisePercent / 8)))}</span>
        </div>
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
            <FeedbackMessage>Barajando {scoredCandidates.length} opciones disponibles.</FeedbackMessage>
          </div>
        ) : recommendation ? (
          <div className="recommendation-result" data-testid="recommendation-result">
            <div className="recommendation-head">
              <CoverArt title={recommendation.item.title} type={recommendation.item.type} posterUrl={recommendation.item.posterUrl} />
              <div>
                <ItemIdentity item={recommendation.item} />
                <div className="score-line">
                  <span>Score {recommendation.score}</span>
                  <span>Pool {recommendation.poolSize}</span>
                  <span>Roll {Math.round(recommendation.roll * 100)}%</span>
                </div>
              </div>
            </div>
            <ul>
              {recommendation.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="action-row">
              <button
                className="small-button"
                type="button"
                onClick={startRecommendation}
              >
                <Play size={16} />
                Empezar
              </button>
              <button
                className="small-button"
                type="button"
                onClick={skipRecommendation}
              >
                <X size={16} />
                No hoy
              </button>
            </div>
          </div>
        ) : !hasCandidates ? (
          <EmptyState title="No hay tirada posible" detail="Cambia medio, tiempo, tags bloqueados o incluye pausados para abrir el abanico." />
        ) : (
          <EmptyState title="El dado espera" detail="Ajusta el clima de la sesion y tira cuando quieras una recomendacion." />
        )}
      </section>
    </section>
  )
}

function ExplorerTab({ library }: { library: LibrarySurface }) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DiscoveryStatus>('queued')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [selected, setSelected] = useState<DiscoveryCandidate | undefined>()
  const type = library.settings.explorerDefaultType
  const discoveryCounts = useMemo(() => {
    const counts: Record<DiscoveryStatus, number> = { queued: 0, saved: 0, dismissed: 0 }
    for (const candidate of library.discoveryCandidates) {
      counts[candidate.status] += 1
    }
    return counts
  }, [library.discoveryCandidates])
  const visibleCandidates = library.discoveryCandidates.filter((candidate) => candidate.status === view)
  const queuedCandidates = library.discoveryCandidates.filter((candidate) => candidate.status === 'queued')
  const queuedNexoCount = queuedCandidates.filter((candidate) => candidate.source === 'nexo').length
  const queuedExternalCount = queuedCandidates.filter((candidate) => candidate.source !== 'nexo' && candidate.source !== 'prompt').length
  const queuedPromptCount = queuedCandidates.filter((candidate) => candidate.source === 'prompt').length

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

  async function saveSelectedCandidate(candidate: DiscoveryCandidate) {
    if (await saveCandidate(candidate)) setSelected(undefined)
  }

  async function dismissSelectedCandidate(candidate: DiscoveryCandidate) {
    if (await dismissCandidate(candidate)) setSelected(undefined)
  }

  return (
    <section className="content-grid">
      <section className="workspace-panel wide">
        <div className="panel-heading">
          <div>
            <h2>Explorador</h2>
            <p>Catalogo Nexo y APIs publicas en una cola ligera</p>
          </div>
          <button className="secondary-button" type="button" onClick={addPromptCard}>
            <Sparkles size={17} />
            Carta sorpresa
          </button>
        </div>

        <form
          className="explorer-search"
          onSubmit={(event) => {
            event.preventDefault()
            void runDiscoverySearch()
          }}
        >
          <input
            aria-label="Buscar en explorador"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Odisea, Arrival, metroidvania raro..."
          />
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
        {loading && <FeedbackMessage tone="loading">Buscando en Nexo y fuera...</FeedbackMessage>}
        {message && <FeedbackMessage tone={feedbackToneFromText(message)}>{message}</FeedbackMessage>}

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

        <div className="candidate-feed-header">
          <div>
            <h3>{discoveryStatusLabels[view]}</h3>
            <p>
              {view === 'queued'
                ? 'Revisa, guarda o descarta sin mezclarlo con tu biblioteca privada.'
                : 'Historial ligero de decisiones del explorador.'}
            </p>
          </div>
        </div>

        {visibleCandidates.length ? (
          <div className="candidate-grid">
            {visibleCandidates.map((candidate) => (
              <DiscoveryCard
                candidate={candidate}
                key={candidate.id}
                onDetails={() => setSelected(candidate)}
                onDismiss={() => dismissCandidate(candidate)}
                onSave={() => saveCandidate(candidate)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title={discoveryEmptyCopy[view].title} detail={discoveryEmptyCopy[view].detail} />
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
          onSave={() => saveSelectedCandidate(selected)}
        />
      )}
    </section>
  )
}

function SettingsTab({
  library,
  setTheme,
  theme,
  user,
}: {
  library: LibrarySurface
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
  const draftFavoriteTags = splitList(draft.favoriteTags)
  const draftFavoriteGenres = splitList(draft.favoriteGenres)
  const draftBlockedTags = splitList(draft.blockedTags)
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
              <p className="muted-line">{user?.displayName ?? user?.email ?? 'Sesion activa'}</p>
            </div>
            <span className={library.isModerator ? 'mode-pill moderator' : 'mode-pill'}>
              {roleLabels[library.userRole]}
            </span>
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

      {profiles.length ? (
        <div className="role-list">
          {profiles.map((profile) => {
            const label = profile.displayName || profile.email || profile.uid
            const isCurrentUser = profile.uid === currentUserId
            return (
              <div className="role-row" key={profile.uid}>
                <div>
                  <strong>{label}</strong>
                  <span>{profile.email || profile.uid}</span>
                </div>
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
            )
          })}
        </div>
      ) : (
        <EmptyState title="Sin usuarios" detail="Los perfiles apareceran aqui cuando inicien sesion por primera vez." />
      )}

      {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
    </section>
  )
}

function CurationTab({ library }: { library: LibrarySurface }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PublicCatalogItem[]>([])
  const [editingItem, setEditingItem] = useState<PublicCatalogItem | undefined>()
  const [archiveTarget, setArchiveTarget] = useState<PublicCatalogItem | undefined>()
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const [initialLibrary] = useState(() => library)
  const incompleteCount = items.filter((item) => catalogQualityWarnings(item).length > 0).length
  const typeCount = new Set(items.map((item) => item.type)).size

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

  return (
    <section className="content-grid">
      <section className="workspace-panel wide">
        <div className="panel-heading">
          <div>
            <h2>Catalogo Nexo</h2>
            <p>Catalogo compartido visible para usuarios logueados</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setEditingItem(blankPublicCatalogItem())}>
            <Plus size={18} />
            Nueva entrada
          </button>
        </div>
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
        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}

        {isLoading && items.length === 0 ? (
          <EmptyState title="Cargando catalogo" detail="Recuperando las entradas publicas curadas." />
        ) : hasLoaded && items.length === 0 ? (
          <EmptyState title="Sin entradas publicas" detail="Crea la primera ficha curada o prueba otra busqueda." />
        ) : (
          <div className="candidate-grid">
            {items.map((item) => {
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
  onDismiss,
  onSave,
}: {
  candidate: DiscoveryCandidate
  onDetails: () => void
  onDismiss: () => void
  onSave: () => void
}) {
  const isQueued = candidate.status === 'queued'

  return (
    <article className={`discovery-card ${candidate.status}`}>
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
      <div className={isQueued ? 'candidate-card-actions' : 'candidate-card-actions resolved'}>
        {isQueued ? (
          <>
            <button className="candidate-primary-action" type="button" onClick={onSave} aria-label={`Guardar ${candidate.title}`}>
              <Plus size={16} />
              <span>Guardar</span>
            </button>
            <ActionMenu
              label={candidate.title}
              triggerClassName="candidate-icon-action card-menu-trigger"
              items={[
                { ariaLabel: `Ver detalles ${candidate.title}`, Icon: Eye, label: 'Detalles', onSelect: onDetails },
                { ariaLabel: `Descartar ${candidate.title}`, Icon: X, label: 'Descartar', onSelect: onDismiss, tone: 'danger' },
              ]}
            />
          </>
        ) : (
          <>
            <span className="candidate-footnote">
              {candidate.status === 'saved' ? 'Ya esta en tu biblioteca' : 'Apartado de tus pendientes'}
            </span>
            <button className="candidate-primary-action secondary" type="button" onClick={onDetails} aria-label={`Ver detalles ${candidate.title}`}>
              <Eye size={16} />
              <span>Detalles</span>
            </button>
          </>
        )}
      </div>
    </article>
  )
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

  function applyStatus(status: ItemStatus) {
    onStatus(item.id, status)
  }

  function deleteItem() {
    onDelete()
  }

  return (
    <article className={layout === 'list' ? 'item-card list-card' : 'item-card'}>
      <button className="item-main" type="button" onClick={onEdit}>
        <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
        <ItemIdentity item={item} />
        <div className="tag-row">
          {item.rating && <span>{item.rating}/10</span>}
          {item.durationMaxHours && <span>{formatDuration(item)}</span>}
          {item.publicItemId && <span>Nexo</span>}
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
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
        <p>{typeLabels[item.type]}</p>
      </div>
      <span className={`item-status ${item.status}`}>{statusLabels[item.status]}</span>
    </div>
  )
}

function CandidateDialog({
  candidate,
  onClose,
  onDismiss,
  onSave,
}: {
  candidate: DiscoveryCandidate
  onClose: () => void
  onDismiss: () => void
  onSave: () => void
}) {
  const isQueued = candidate.status === 'queued'

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
          {isQueued && (
            <div className="action-row detail-actions">
              <button className="primary-button" type="button" onClick={onSave}>
                <Plus size={16} />
                Guardar en Biblioteca
              </button>
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
              <span>{draft.source}</span>
              <span>{statusLabels[draft.status]}</span>
              {draft.rating && <span>{draft.rating}/10</span>}
              {draft.publicItemId && <span>Nexo</span>}
            </div>
            <h3>{editorTitle}</h3>
            <p>{draft.notes || 'Sin notas todavia.'}</p>
          </div>
        </div>

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
          <h3>Taxonomia</h3>
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
        </section>

        <section className="editor-section">
          <h3>Dado</h3>
          <div className="form-grid">
            <label>
              Prioridad
              <input
                min="0"
                step="0.1"
                type="number"
                value={draft.weights.priority}
                onChange={(event) => update('weights', { ...draft.weights, priority: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              Sorpresa
              <input
                min="0"
                step="0.1"
                type="number"
                value={draft.weights.surprise}
                onChange={(event) => update('weights', { ...draft.weights, surprise: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              Reto
              <input
                min="0"
                step="0.1"
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
                  <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as ItemType }))}>
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
          </div>

          <aside className="public-editor-aside">
            <div className={warnings.length ? 'quality-panel warning' : 'quality-panel'}>
              <div>
                <strong>{warnings.length ? 'Ficha incompleta' : 'Ficha lista'}</strong>
                <p>{warnings.length ? warnings.join(' / ') : 'Tiene portada, descripcion y taxonomia basica.'}</p>
              </div>
              <span>{warnings.length ? warnings.length : 'OK'}</span>
            </div>

            <section className="editor-section">
              <h3>Generos</h3>
              <label>
                Generos
                <input value={draft.genresText} onChange={(event) => setDraft((current) => ({ ...current, genresText: event.target.value }))} />
              </label>
              <div className="preset-chip-panel">
                <strong>Generos frecuentes</strong>
                <div className="preset-chip-row" aria-label={`Sugerencias de taxonomia para ${typeLabels[draft.type]}`}>
                  {genrePresets.map((genre) => (
                    <button
                      aria-pressed={selectedGenreKeys.has(normalizeKey(genre))}
                      className={selectedGenreKeys.has(normalizeKey(genre)) ? 'preset-chip active' : 'preset-chip'}
                      key={genre}
                      type="button"
                      onClick={() => toggleTextPreset('genresText', genre)}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="editor-section">
              <h3>Tags</h3>
              <label>
                Tags
                <input value={draft.tagsText} onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))} />
              </label>
              <div className="preset-chip-panel">
                <strong>Tags frecuentes</strong>
                <div className="preset-chip-row" aria-label={`Sugerencias de tags para ${typeLabels[draft.type]}`}>
                  {tagPresets.map((tag) => (
                    <button
                      aria-pressed={selectedTagKeys.has(normalizeKey(tag))}
                      className={selectedTagKeys.has(normalizeKey(tag)) ? 'preset-chip active' : 'preset-chip'}
                      key={tag}
                      type="button"
                      onClick={() => toggleTextPreset('tagsText', tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="editor-section">
              <h3>Tono</h3>
              <label>
                Mood tags
                <input value={draft.moodText} onChange={(event) => setDraft((current) => ({ ...current, moodText: event.target.value }))} />
              </label>
              <div className="preset-chip-panel">
                <strong>Tono</strong>
                <div className="preset-chip-row" aria-label="Sugerencias de tono">
                  {catalogMoodPresets.map((moodTag) => (
                    <button
                      aria-pressed={selectedMoodKeys.has(normalizeKey(moodTag))}
                      className={selectedMoodKeys.has(normalizeKey(moodTag)) ? 'preset-chip active' : 'preset-chip'}
                      key={moodTag}
                      type="button"
                      onClick={() => toggleTextPreset('moodText', moodTag)}
                    >
                      {moodTag}
                    </button>
                  ))}
                </div>
              </div>
            </section>
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

function EmptyState({ detail, title }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={22} />
      <h3>{title}</h3>
      <p>{detail}</p>
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

function catalogQualityWarnings(item: Pick<PublicCatalogItem, 'description' | 'genres' | 'posterUrl' | 'tags'>) {
  const warnings: string[] = []
  if (!item.description?.trim()) warnings.push('Sin descripcion')
  if (!item.genres.length) warnings.push('Sin generos')
  if (!item.tags.length) warnings.push('Sin tags')
  if (!item.posterUrl?.trim()) warnings.push('Sin portada')
  return warnings
}

function draftCatalogQualityWarnings(draft: { description?: string; genresText: string; posterUrl?: string; tagsText: string }) {
  return catalogQualityWarnings({
    description: draft.description,
    genres: splitList(draft.genresText),
    posterUrl: draft.posterUrl,
    tags: splitList(draft.tagsText),
  })
}

function upsertVisibleCatalogItem(items: PublicCatalogItem[], nextItem: PublicCatalogItem) {
  return [nextItem, ...items.filter((item) => item.id !== nextItem.id)].sort((left, right) => left.title.localeCompare(right.title, 'es'))
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

function formatDuration(item: ListItem) {
  if (item.durationMinHours && item.durationMaxHours && item.durationMinHours !== item.durationMaxHours) {
    return `${item.durationMinHours}-${item.durationMaxHours}h`
  }
  return `${item.durationMaxHours ?? item.durationMinHours}h`
}

export default App
