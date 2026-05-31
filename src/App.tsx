import { useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
  Check,
  Dice5,
  Film,
  Gamepad2,
  Library,
  LogIn,
  LogOut,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import {
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  ITEM_STATUSES,
  ITEM_TYPES,
  type ExternalCandidate,
  type ItemStatus,
  type ItemType,
  type ListItem,
  type RecommendationPreferences,
  nowIso,
} from './domain/types'
import { useAuth } from './hooks/useAuth'
import { useLibrary } from './hooks/useLibrary'
import { recommendItem } from './lib/recommendations'
import { slugify, uniqueValues } from './lib/strings'

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
  const library = useLibrary(!auth.isFirebaseConfigured || auth.allowed)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const [externalQuery, setExternalQuery] = useState('')
  const [externalType, setExternalType] = useState<ItemType | 'watch' | 'any'>('watch')
  const [externalCandidates, setExternalCandidates] = useState<ExternalCandidate[]>([])
  const [externalLoading, setExternalLoading] = useState(false)
  const [preferences, setPreferences] = useState<RecommendationPreferences>({
    medium: 'any',
    timeBudgetHours: 15,
    energy: 'medium',
    intensity: 'balanced',
    novelty: 'balanced',
    includePaused: false,
    surprisePercent: 30,
    seed: 'listas-web',
  })
  const [recommendation, setRecommendation] = useState<ReturnType<typeof recommendItem>>()

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

  if (auth.loading) {
    return <ShellState title="Cargando acceso" />
  }

  if (auth.isFirebaseConfigured && !auth.user) {
    return (
      <ShellState
        title="Listas privadas"
        action={
          <button className="primary-button" type="button" onClick={auth.signIn}>
            <LogIn size={18} />
            Entrar con Google
          </button>
        }
        detail={auth.error}
      />
    )
  }

  if (auth.isFirebaseConfigured && !auth.allowed) {
    return (
      <ShellState
        title="Acceso no autorizado"
        detail={`Esta app solo acepta ${auth.allowedEmail ?? 'el usuario configurado'}.`}
        action={
          <button className="ghost-button" type="button" onClick={auth.signOut}>
            <LogOut size={18} />
            Salir
          </button>
        }
      />
    )
  }

  async function rollRecommendation() {
    const next = recommendItem(library.items, {
      ...preferences,
      seed: `${preferences.seed}-${Date.now()}`,
    }, DEFAULT_SETTINGS)
    setRecommendation(next)
    if (next) await library.recordRecommendation(next.item.id, next.reasons)
  }

  async function runExternalSearch() {
    setExternalLoading(true)
    try {
      setExternalCandidates(await library.searchExternal(externalQuery, externalType))
    } finally {
      setExternalLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Listas Web</span>
          <h1>Biblioteca privada</h1>
        </div>
        <div className="topbar-actions">
          {!auth.isFirebaseConfigured && <span className="mode-pill">Demo local</span>}
          {auth.user && (
            <button className="icon-button" type="button" onClick={auth.signOut} title="Salir">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      <section className="dashboard-grid">
        <section className="library-panel" aria-label="Biblioteca">
          <div className="panel-heading">
            <div>
              <h2>Biblioteca</h2>
              <p>{library.items.length} entradas</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setEditingItem(blankItem())}>
              <Plus size={18} />
              Añadir
            </button>
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
        </section>

        <aside className="side-rail" aria-label="Recomendaciones">
          <section className="recommendation-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Dado ponderado</h2>
                <p>{preferences.surprisePercent}% sorpresa</p>
              </div>
              <button className="dice-button" type="button" onClick={rollRecommendation} data-testid="roll-button">
                <Dice5 size={20} />
              </button>
            </div>

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
                onChange={(event) =>
                  setPreferences((current) => ({ ...current, includePaused: event.target.checked }))
                }
              />
              Incluir pausados
            </label>

            {recommendation ? (
              <div className="recommendation-result" data-testid="recommendation-result">
                <ItemIdentity item={recommendation.item} />
                <div className="score-line">
                  <span>Score {recommendation.score}</span>
                  <span>Pool {recommendation.poolSize}</span>
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
              <p className="muted-line">Sin tirada todavia.</p>
            )}
          </section>

          <section className="external-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Descubrir</h2>
                <p>APIs publicas</p>
              </div>
              <Sparkles size={20} />
            </div>
            <div className="external-search">
              <input
                aria-label="Buscar recomendacion externa"
                value={externalQuery}
                onChange={(event) => setExternalQuery(event.target.value)}
                placeholder="Titulo o idea"
              />
              <select
                aria-label="Tipo de busqueda externa"
                value={externalType}
                onChange={(event) => setExternalType(event.target.value as ItemType | 'watch' | 'any')}
              >
                <option value="watch">Ver</option>
                <option value="game">Juego</option>
                <option value="book">Libro</option>
                <option value="anime">Anime</option>
                <option value="manga">Manga</option>
                <option value="manhwa">Manhwa</option>
              </select>
              <button className="icon-button" type="button" onClick={runExternalSearch} title="Buscar">
                <Search size={18} />
              </button>
            </div>
            {externalLoading && <p className="muted-line">Buscando...</p>}
            <div className="candidate-list">
              {externalCandidates.map((candidate) => (
                <div className="candidate-row" key={candidate.id}>
                  <div>
                    <strong>{candidate.title}</strong>
                    <span>{typeLabels[candidate.type]}</span>
                  </div>
                  <button
                    className="small-button"
                    type="button"
                    onClick={() => library.saveItem(library.candidateToItem(candidate))}
                  >
                    <Plus size={16} />
                    Aceptar
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

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
    </main>
  )
}

interface ShellStateProps {
  title: string
  detail?: string
  action?: ReactNode
}

function ShellState({ action, detail, title }: ShellStateProps) {
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

interface ItemCardProps {
  item: ListItem
  onEdit: () => void
  onDelete: (id: string) => void
  onStatus: (id: string, status: ItemStatus) => void
}

function ItemCard({ item, onDelete, onEdit, onStatus }: ItemCardProps) {
  return (
    <article className="item-card">
      <button className="item-main" type="button" onClick={onEdit}>
        <ItemIdentity item={item} />
        <div className="tag-row">
          {item.rating && <span>{item.rating}/10</span>}
          {item.durationMaxHours && <span>{formatDuration(item)}</span>}
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

function ItemIdentity({ item }: { item: ListItem }) {
  const Icon = typeIcons[item.type]
  return (
    <div className="item-identity">
      <span className={`type-mark ${item.type}`}>
        <Icon size={18} />
      </span>
      <div>
        <h3>{item.title}</h3>
        <p>
          {typeLabels[item.type]} · {statusLabels[item.status]}
        </p>
      </div>
    </div>
  )
}

interface ItemEditorProps {
  item: ListItem
  onClose: () => void
  onSave: (item: ListItem) => void
}

function ItemEditor({ item, onClose, onSave }: ItemEditorProps) {
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
              onChange={(event) =>
                update('rating', event.target.value ? Number(event.target.value) : undefined)
              }
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
