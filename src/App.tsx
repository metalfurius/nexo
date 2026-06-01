import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Archive,
  BookOpen,
  Check,
  Copy,
  Dice5,
  Film,
  Gamepad2,
  Library,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Play,
  Plus,
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
  type DiscoveryCandidate,
  type ItemStatus,
  type ItemType,
  type ListItem,
  type PublicCatalogItem,
  type RecommendationPreferences,
  type ThemeMode,
  type UserSettings,
  nowIso,
} from './domain/types'
import { useAuth } from './hooks/useAuth'
import { useLibrary } from './hooks/useLibrary'
import { buildPublicCatalogItem, promptToDiscovery } from './lib/catalog'
import { recommendItem } from './lib/recommendations'
import { slugify, uniqueValues } from './lib/strings'
import { initializeAnalytics } from './services/firebase'

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

const sourceLabels: Record<DiscoveryCandidate['source'], string> = {
  nexo: 'Nexo',
  tmdb: 'TMDB',
  rawg: 'RAWG',
  openLibrary: 'Open Library',
  anilist: 'AniList',
  wikidata: 'Wikidata',
  prompt: 'Explorador',
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

type AppTab = 'library' | 'dice' | 'explorer' | 'settings' | 'curation'

interface AuthUserSummary {
  uid: string
  email: string | null
  displayName: string | null
}

const themeStorageKey = 'nexo-theme'
const promptDeck = [
  'Un clasico que aun no has tocado',
  'Algo corto para una noche rara',
  'Una obra que cambie de textura a mitad',
  'Un pendiente que merezca segunda oportunidad',
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
  const library = useLibrary(auth.user?.uid)
  const [activeTab, setActiveTab] = useState<AppTab>('library')
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(themeStorageKey)
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_SETTINGS.theme
  })

  useEffect(() => {
    void initializeAnalytics().catch(() => undefined)
  }, [])

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

  const navItems: Array<{ id: AppTab; label: string; icon: typeof Library; hidden?: boolean }> = [
    { id: 'library', label: 'Biblioteca', icon: Library },
    { id: 'dice', label: 'Dado', icon: Dice5 },
    { id: 'explorer', label: 'Explorador', icon: Sparkles },
    { id: 'settings', label: 'Ajustes', icon: Sun },
    { id: 'curation', label: 'Curacion', icon: ShieldCheck, hidden: !library.isModerator },
  ]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Nexo 1.0 beta</span>
          <h1>Biblioteca privada</h1>
        </div>
        <div className="topbar-actions">
          {!auth.isFirebaseConfigured && <span className="mode-pill">Demo local</span>}
          {library.isModerator && <span className="mode-pill moderator">Moderador</span>}
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
                className={activeTab === item.id ? 'tab-button active' : 'tab-button'}
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            )
          })}
      </nav>

      <section className="tab-stage">
        {activeTab === 'library' && <LibraryTab library={library} />}
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
  queueDiscoveryCandidates: (candidates: DiscoveryCandidate[]) => Promise<void>
  dismissDiscoveryCandidate: (candidateId: string) => Promise<void>
  saveDiscoveryToLibrary: (candidate: DiscoveryCandidate) => Promise<ListItem>
  upsertPublicItem: (item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) => Promise<PublicCatalogItem>
  archivePublicItem: (id: string) => Promise<void>
  publicItemToDiscovery: (item: PublicCatalogItem) => DiscoveryCandidate
  externalCandidateToDiscovery: (candidate: ExternalCandidate) => DiscoveryCandidate
}

function LibraryTab({ library }: { library: LibrarySurface }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const [importStatus, setImportStatus] = useState<string | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

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
      const payload = JSON.parse(await file.text()) as { items?: ListItem[] }
      if (!Array.isArray(payload.items)) throw new Error('El archivo no tiene una lista de items valida')

      for (const item of payload.items) {
        await library.saveItem({ ...item, updatedAt: nowIso() })
      }
      setImportStatus(`Importadas ${payload.items.length} entradas`)
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

  function exportLibrary() {
    const payload = {
      schemaVersion: 1,
      exportedAt: nowIso(),
      items: library.items,
      settings: library.settings,
    }
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `nexo-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(href)
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
            <label className="secondary-button file-button">
              <Upload size={18} />
              Importar
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
            <button className="secondary-button" type="button" onClick={exportLibrary}>
              <Archive size={18} />
              Exportar
            </button>
            <button className="primary-button" type="button" onClick={() => setEditingItem(blankItem())}>
              <Plus size={18} />
              Anadir
            </button>
            <button
              className="danger-button"
              disabled={library.items.length === 0}
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 size={18} />
              Borrar todo
            </button>
          </div>
        </div>

        <div className="stats-row">
          {stats.map((stat) => (
            <button
              className={statusFilter === stat.status ? 'stat-chip active' : 'stat-chip'}
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
          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ItemStatus | 'all')}
          >
            <option value="all">Todos los estados</option>
            {ITEM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </div>

        {library.loading && <p className="muted-line">Cargando biblioteca...</p>}
        {library.error && <p className="error-line">{library.error}</p>}
        {importStatus && <p className="muted-line">{importStatus}</p>}

        {filteredItems.length ? (
          <div className="item-grid" data-testid="library-grid">
            {filteredItems.map((item) => (
              <ItemCard
                item={item}
                key={item.id}
                onEdit={() => setEditingItem(item)}
                onStatus={library.setStatus}
                onDelete={library.deleteItem}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="Nada por aqui" detail="Importa tu biblioteca, guarda algo desde Explorador o anade una entrada manual." />
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

      {deleteDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="confirm-dialog"
            onSubmit={(event) => {
              event.preventDefault()
              if (deleteConfirmText === 'BORRAR') void deleteEntireLibrary()
            }}
          >
            <div>
              <h2>Borrar toda la biblioteca</h2>
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
  const [recommendation, setRecommendation] = useState<ReturnType<typeof recommendItem>>()
  const [isRolling, setIsRolling] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const preferences = draftPreferences ?? library.settings.recommendationPreferences ?? DEFAULT_RECOMMENDATION_PREFERENCES
  const setPreferences = (
    update: RecommendationPreferences | ((current: RecommendationPreferences) => RecommendationPreferences),
  ) => {
    setDraftPreferences((current) => (typeof update === 'function' ? update(current ?? preferences) : update))
  }

  async function rollRecommendation() {
    setIsRolling(true)
    setStatus(undefined)
    const next = recommendItem(
      library.items,
      {
        ...preferences,
        seed: `${preferences.seed}-${Date.now()}`,
      },
      library.settings,
    )
    window.setTimeout(() => setIsRolling(false), 420)
    setRecommendation(next)
    if (next) await library.recordRecommendation(next.item.id, next.reasons)
  }

  async function savePreferences() {
    await library.saveSettings({
      recommendationPreferences: preferences,
      surprisePercent: preferences.surprisePercent,
      allowPausedByDefault: preferences.includePaused,
    })
    setDraftPreferences(undefined)
    setStatus('Ajustes del dado guardados')
  }

  return (
    <section className="dice-layout">
      <section className="workspace-panel dice-hero" aria-label="Dado ponderado">
        <div>
          <span className="eyebrow">Dado ponderado</span>
          <h2>Elige el siguiente hilo</h2>
          <p className="hero-copy">Una tirada con memoria: filtra por tiempo, energia y novedad sin perder sorpresa.</p>
        </div>
        <button
          className={isRolling ? 'dice-orb rolling' : 'dice-orb'}
          type="button"
          onClick={rollRecommendation}
          data-testid="roll-button"
          aria-label="Tirar dado ponderado"
        >
          <Dice5 size={42} />
        </button>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <h2>Preferencias</h2>
            <p>{preferences.surprisePercent}% sorpresa</p>
          </div>
          <button className="secondary-button" type="button" onClick={savePreferences}>
            <Save size={17} />
            Guardar ajustes
          </button>
        </div>
        <PreferenceControls preferences={preferences} setPreferences={setPreferences} />
        {status && <p className="muted-line">{status}</p>}
      </section>

      <section className="workspace-panel result-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Resultado</h2>
            <p>{recommendation ? `Score ${recommendation.score}` : 'Sin tirada todavia'}</p>
          </div>
        </div>

        {recommendation ? (
          <div className="recommendation-result" data-testid="recommendation-result">
            <ItemIdentity item={recommendation.item} />
            <div className="score-line">
              <span>Score {recommendation.score}</span>
              <span>Pool {recommendation.poolSize}</span>
              <span>Roll {Math.round(recommendation.roll * 100)}%</span>
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
                onClick={() => library.setStatus(recommendation.item.id, 'in_progress')}
              >
                <Play size={16} />
                Empezar
              </button>
              <button
                className="small-button"
                type="button"
                onClick={() => library.snoozeRecommendation(recommendation.item.id)}
              >
                <X size={16} />
                No hoy
              </button>
            </div>
          </div>
        ) : (
          <EmptyState title="El dado espera" detail="Ajusta el clima de la sesion y tira cuando quieras una recomendacion." />
        )}
      </section>
    </section>
  )
}

function ExplorerTab({ library }: { library: LibrarySurface }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ItemType | 'watch' | 'any'>(library.settings.explorerDefaultType)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [selected, setSelected] = useState<DiscoveryCandidate | undefined>()
  const queuedCandidates = library.discoveryCandidates.filter((candidate) => candidate.status === 'queued')
  const savedCount = library.discoveryCandidates.filter((candidate) => candidate.status === 'saved').length
  const dismissedCount = library.discoveryCandidates.filter((candidate) => candidate.status === 'dismissed').length

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
      await library.queueDiscoveryCandidates(candidates)
      setMessage(candidates.length ? `${candidates.length} hallazgos enviados a la cola.` : 'Sin resultados para esa busqueda.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo completar la busqueda.')
    } finally {
      setLoading(false)
    }
  }

  async function addPromptCard() {
    const title = promptDeck[Math.floor(Math.random() * promptDeck.length)]
    await library.queueDiscoveryCandidates([promptToDiscovery(title)])
    setMessage('Carta de exploracion anadida.')
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

        <div className="explorer-search">
          <input
            aria-label="Buscar en explorador"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Odisea, Arrival, metroidvania raro..."
          />
          <select
            aria-label="Tipo de busqueda en explorador"
            value={type}
            onChange={(event) => setType(event.target.value as ItemType | 'watch' | 'any')}
          >
            <option value="any">Todo</option>
            <option value="watch">Ver</option>
            <option value="game">Juego</option>
            <option value="book">Libro</option>
            <option value="anime">Anime</option>
            <option value="manga">Manga</option>
            <option value="manhwa">Manhwa</option>
          </select>
          <button className="primary-button" type="button" onClick={runDiscoverySearch}>
            <Search size={18} />
            Buscar
          </button>
        </div>
        {loading && <p className="muted-line">Buscando en Nexo y fuera...</p>}
        {message && <p className="muted-line">{message}</p>}

        {queuedCandidates.length ? (
          <div className="candidate-grid">
            {queuedCandidates.map((candidate) => (
              <DiscoveryCard
                candidate={candidate}
                key={candidate.id}
                onDetails={() => setSelected(candidate)}
                onDismiss={() => library.dismissDiscoveryCandidate(candidate.id)}
                onSave={() => library.saveDiscoveryToLibrary(candidate)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="La cola esta limpia" detail="Busca en el catalogo Nexo, tira una carta sorpresa o guarda hallazgos externos." />
        )}
      </section>

      <aside className="insight-rail">
        <MetricCard label="En cola" value={queuedCandidates.length} />
        <MetricCard label="Guardados" value={savedCount} />
        <MetricCard label="Descartados" value={dismissedCount} />
      </aside>

      {selected && <CandidateDialog candidate={selected} onClose={() => setSelected(undefined)} />}
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

  async function saveSettings() {
    const nextSettings: Partial<UserSettings> = {
      theme: draft.theme,
      favoriteTags: splitList(draft.favoriteTags),
      favoriteGenres: splitList(draft.favoriteGenres),
      blockedTags: splitList(draft.blockedTags),
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
      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <h2>Ajustes</h2>
            <p>Preferencias privadas para el dado y el explorador</p>
          </div>
          <button className="primary-button" type="button" onClick={saveSettings}>
            <Save size={17} />
            Guardar
          </button>
        </div>
        <div className="form-grid">
          <label>
            Tema
            <select
              value={draft.theme}
              onChange={(event) => setDraft((current) => ({ ...current, theme: event.target.value as ThemeMode }))}
            >
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
            </select>
          </label>
          <label>
            Explorador por defecto
            <select
              value={draft.explorerDefaultType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  explorerDefaultType: event.target.value as ItemType | 'watch' | 'any',
                }))
              }
            >
              <option value="watch">Ver</option>
              <option value="any">Todo</option>
              <option value="game">Juego</option>
              <option value="book">Libro</option>
            </select>
          </label>
        </div>
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
        {status && <p className="muted-line">{status}</p>}
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Cuenta</h2>
            <p className="muted-line">{user?.displayName ?? user?.email ?? 'Sesion activa'}</p>
          </div>
          <span className={library.isModerator ? 'mode-pill moderator' : 'mode-pill'}>
            {library.isModerator ? 'Moderador' : 'Usuario'}
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

      <section className="workspace-panel">
        <h2>Beta suave</h2>
        <p className="muted-line">Google login abre una biblioteca privada por usuario. El catalogo Nexo es comun, pero solo moderadores lo editan.</p>
        <div className="release-list">
          <span>Firestore privado por usuario</span>
          <span>Catalogo publico curado</span>
          <span>Export JSON schemaVersion 1</span>
        </div>
      </section>
    </section>
  )
}

function CurationTab({ library }: { library: LibrarySurface }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PublicCatalogItem[]>([])
  const [editingItem, setEditingItem] = useState<PublicCatalogItem | undefined>()
  const [status, setStatus] = useState<string | undefined>()

  async function refreshCatalog(searchQuery = query) {
    const nextItems = await library.searchPublicCatalog(searchQuery, 'any')
    setItems(nextItems)
  }

  return (
    <section className="content-grid">
      <section className="workspace-panel wide">
        <div className="panel-heading">
          <div>
            <h2>Curacion</h2>
            <p>Catalogo compartido visible para usuarios logueados</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setEditingItem(blankPublicCatalogItem())}>
            <Plus size={18} />
            Nueva entrada
          </button>
        </div>
        <div className="explorer-search two">
          <input
            aria-label="Buscar en catalogo publico"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar entrada publica"
          />
          <button className="secondary-button" type="button" onClick={() => void refreshCatalog()}>
            <Search size={18} />
            Buscar
          </button>
        </div>
        {status && <p className="muted-line">{status}</p>}

        <div className="candidate-grid">
          {items.map((item) => (
            <article className="catalog-card" key={item.id}>
              <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
              <div>
                <span className="source-pill">Nexo</span>
                <h3>{item.title}</h3>
                <p>{item.description || `${typeLabels[item.type]} publico`}</p>
                <div className="tag-row">
                  {item.genres.slice(0, 3).map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>
              </div>
              <div className="action-row">
                <button className="small-button" type="button" onClick={() => setEditingItem(item)}>
                  Editar
                </button>
                <button
                  className="small-button danger-text"
                  type="button"
                  onClick={async () => {
                    await library.archivePublicItem(item.id)
                    setStatus(`${item.title} archivado`)
                    await refreshCatalog()
                  }}
                >
                  Archivar
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="insight-rail">
        <MetricCard label="Catalogo" value={items.length} />
        <MetricCard label="Rol" value="Mod" />
      </aside>

      {editingItem && (
        <PublicItemEditor
          item={editingItem}
          onClose={() => setEditingItem(undefined)}
          onSave={async (item) => {
            await library.upsertPublicItem(item)
            setEditingItem(undefined)
            setStatus(`${item.title} guardado en catalogo`)
            await refreshCatalog()
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
  return (
    <article className="discovery-card">
      <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
      <div className="discovery-body">
        <span className="source-pill">{sourceLabels[candidate.source]}</span>
        <h3>{candidate.title}</h3>
        <p>{candidate.overview || `${typeLabels[candidate.type]} para explorar`}</p>
        <div className="tag-row">
          {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
          {candidate.genres.slice(0, 2).map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
      </div>
      <div className="action-row">
        <button className="small-button" type="button" onClick={onSave}>
          <Plus size={16} />
          Guardar
        </button>
        <button className="small-button" type="button" onClick={onDetails}>
          Ver detalles
        </button>
        <button className="small-button" type="button" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>
    </article>
  )
}

function ItemCard({
  item,
  onDelete,
  onEdit,
  onStatus,
}: {
  item: ListItem
  onEdit: () => void
  onDelete: (id: string) => void
  onStatus: (id: string, status: ItemStatus) => void
}) {
  return (
    <article className="item-card">
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
        <button type="button" title="Empezar" onClick={() => onStatus(item.id, 'in_progress')}>
          <Play size={16} />
        </button>
        <button type="button" title="Pausar" onClick={() => onStatus(item.id, 'paused')}>
          <Pause size={16} />
        </button>
        <button type="button" title="Completar" onClick={() => onStatus(item.id, 'completed')}>
          <Check size={16} />
        </button>
        <button type="button" title="Borrar" onClick={() => onDelete(item.id)}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  )
}

function CoverArt({ posterUrl, title, type }: { posterUrl?: string; title: string; type: ItemType }) {
  const Icon = typeIcons[type]
  return (
    <div className={`cover-art ${type}`}>
      {posterUrl ? <img alt="" src={posterUrl} /> : <Icon size={24} aria-hidden="true" />}
      {!posterUrl && <span>{title.slice(0, 1).toUpperCase()}</span>}
    </div>
  )
}

function ItemIdentity({ item }: { item: ListItem }) {
  return (
    <div className="item-identity">
      <div>
        <h3>{item.title}</h3>
        <p>
          {typeLabels[item.type]} / {statusLabels[item.status]}
        </p>
      </div>
    </div>
  )
}

function CandidateDialog({ candidate, onClose }: { candidate: DiscoveryCandidate; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="detail-dialog">
        <button className="icon-button dialog-close" type="button" onClick={onClose} title="Cerrar">
          <X size={18} />
        </button>
        <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
        <div>
          <span className="source-pill">{sourceLabels[candidate.source]}</span>
          <h2>{candidate.title}</h2>
          <p>{candidate.overview || 'Sin descripcion todavia.'}</p>
          <div className="tag-row">
            {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
            {candidate.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
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

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="item-editor"
        onSubmit={(event) => {
          event.preventDefault()
          const saved: ListItem = {
            ...draft,
            id: draft.id.startsWith('manual-') && draft.title ? `${draft.type}-${slugify(draft.title)}` : draft.id,
            tags: splitList(draft.tagsText),
            genres: splitList(draft.genresText),
            moodTags: splitList(draft.moodText),
            weights: {
              priority: Number(draft.weights.priority) || 1,
              surprise: Number(draft.weights.surprise) || 0,
              challenge: Number(draft.weights.challenge) || 0,
            },
            updatedAt: nowIso(),
          }
          onSave(saved)
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>Entrada</h2>
            <p>{draft.source}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>
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
        </div>
        <label>
          Poster o portada
          <input value={draft.posterUrl ?? ''} onChange={(event) => update('posterUrl', event.target.value || undefined)} />
        </label>
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
        <label>
          Notas
          <textarea value={draft.notes ?? ''} onChange={(event) => update('notes', event.target.value)} />
        </label>
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
  onSave: (item: PublicCatalogItem) => void
}) {
  const [draft, setDraft] = useState({
    ...item,
    tagsText: item.tags.join(', '),
    genresText: item.genres.join(', '),
    moodText: item.moodTags.join(', '),
  })

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="item-editor"
        onSubmit={(event) => {
          event.preventDefault()
          onSave(
            buildPublicCatalogItem(
              {
                ...draft,
                tags: splitList(draft.tagsText),
                genres: splitList(draft.genresText),
                moodTags: splitList(draft.moodText),
              },
              draft.updatedBy || 'moderator',
            ),
          )
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>Catalogo Nexo</h2>
            <p>Entrada publica curada</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>
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
              value={draft.releaseYear ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, releaseYear: event.target.value ? Number(event.target.value) : undefined }))}
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
        <label>
          Generos
          <input value={draft.genresText} onChange={(event) => setDraft((current) => ({ ...current, genresText: event.target.value }))} />
        </label>
        <label>
          Tags
          <input value={draft.tagsText} onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))} />
        </label>
        <label>
          Mood tags
          <input value={draft.moodText} onChange={(event) => setDraft((current) => ({ ...current, moodText: event.target.value }))} />
        </label>
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

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
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

function blankPublicCatalogItem(): PublicCatalogItem {
  return buildPublicCatalogItem(
    {
      title: '',
      type: 'book',
      genres: [],
      tags: [],
      moodTags: [],
      externalRefs: {},
    },
    'moderator',
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
