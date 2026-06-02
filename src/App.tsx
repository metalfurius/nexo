import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
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

const catalogSortLabels: Record<CatalogSortMode, string> = {
  quality: 'Prioridad',
  title: 'Titulo',
  updated: 'Recientes',
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

const itemSourceLabels: Record<ListItem['source'], string> = {
  manual: 'Manual',
  markdown: 'Importacion',
  external: 'API externa',
  public: 'Catalogo Nexo',
}

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
type CatalogQualityFilter = 'all' | 'needs-work' | 'ready'
type CatalogSortMode = 'quality' | 'title' | 'updated'

interface DiceEligibilityBreakdown {
  available: number
  blockedTags: number
  cooldown: number
  medium: number
  paused: number
  resolved: number
  total: number
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

interface CatalogTaxonomyTemplate {
  label: string
  detail: string
  genres: string[]
  tags: string[]
  moodTags: string[]
}

const catalogGenrePresets: Record<ItemType, string[]> = {
  game: [
    'Accion',
    'Aventura',
    'RPG',
    'JRPG',
    'Estrategia',
    'Supervivencia',
    'Crafting',
    'Metroidvania',
    'Roguelike',
    'Puzzle',
    'Terror',
    'Shooter',
    'Plataformas',
    'Simulacion',
    'Gestion',
    'Soulslike',
    'Mundo abierto',
    'Ritmo',
  ],
  book: [
    'Clasico',
    'Fantasia',
    'Ciencia ficcion',
    'Misterio',
    'Ensayo',
    'Historia',
    'Aventura',
    'Romance',
    'Distopia',
    'Terror',
    'Policiaca',
    'Biografia',
    'Filosofia',
    'Mitologia',
    'Poesia',
    'Realismo magico',
  ],
  movie: [
    'Drama',
    'Ciencia ficcion',
    'Thriller',
    'Terror',
    'Comedia',
    'Animacion',
    'Fantasia',
    'Documental',
    'Accion',
    'Aventura',
    'Crimen',
    'Noir',
    'Musical',
    'Belica',
    'Historica',
    'Romance',
  ],
  series: [
    'Drama',
    'Ciencia ficcion',
    'Thriller',
    'Comedia',
    'Fantasia',
    'Crimen',
    'Animacion',
    'Documental',
    'Misterio',
    'Accion',
    'Aventura',
    'Historica',
    'Reality',
    'Procedural',
    'Miniserie',
    'Antologia',
  ],
  anime: [
    'Shonen',
    'Seinen',
    'Slice of life',
    'Mecha',
    'Fantasia',
    'Drama',
    'Romance',
    'Comedia',
    'Isekai',
    'Deportes',
    'Terror',
    'Misterio',
    'Aventura',
    'Sci-fi',
    'Historico',
    'Musica',
  ],
  manga: [
    'Shonen',
    'Seinen',
    'Shojo',
    'Josei',
    'Fantasia',
    'Drama',
    'Romance',
    'Terror',
    'Isekai',
    'Slice of life',
    'Misterio',
    'Deportes',
    'Historico',
    'Comedia',
    'Accion',
    'Psicologico',
  ],
  manhwa: [
    'Fantasia',
    'Accion',
    'Romance',
    'Drama',
    'Isekai',
    'Historico',
    'Comedia',
    'Thriller',
    'Progresion',
    'Academia',
    'Artes marciales',
    'Slice of life',
    'Supernatural',
    'Aventura',
  ],
  comic: [
    'Superheroes',
    'Fantasia',
    'Ciencia ficcion',
    'Crimen',
    'Aventura',
    'Drama',
    'Terror',
    'Humor',
    'Noir',
    'Historico',
    'Autobiografico',
    'Indie',
    'Satira',
    'Western',
  ],
  other: [
    'Aventura',
    'Drama',
    'Ciencia ficcion',
    'Fantasia',
    'Misterio',
    'Ligero',
    'Denso',
    'Experimental',
    'Ensayo',
    'Documental',
    'Humor',
    'Practico',
  ],
}

const catalogTagPresets: Record<ItemType, string[]> = {
  game: ['indie', 'single-player', 'cooperativo', 'mundo abierto', 'base building', 'historia fuerte', 'dificil', 'corto', 'sin spoilers'],
  book: ['clasico', 'moderno', 'literatura', 'epico', 'introspectivo', 'politico', 'adaptacion', 'premiado', 'canon', 'lectura lenta'],
  movie: ['autor', 'culto', 'premiada', 'palomitas', 'contemplativa', 'experimental', 'familiar', 'adaptacion', 'festival', 'visual'],
  series: ['serializada', 'miniserie', 'procedural', 'prestige', 'familiar', 'adaptacion', 'coral', 'lenta', 'binge', 'weekly'],
  anime: ['temporada corta', 'pelicula', 'original', 'adaptacion', 'sakuga', 'clasico', 'popular', 'raro', 'arco cerrado'],
  manga: ['serializado', 'finalizado', 'clasico', 'popular', 'raro', 'adaptacion', 'autoconclusivo', 'largo', 'scan friendly'],
  manhwa: ['webtoon', 'finalizado', 'popular', 'romance', 'progresion', 'fantasia', 'largo', 'ligero', 'temporadas'],
  comic: ['autoconclusivo', 'serie abierta', 'clasico', 'autor', 'mainstream', 'indie', 'premiado', 'adaptacion', 'omnibuses'],
  other: ['manual', 'pendiente', 'curado', 'raro', 'popular', 'clasico', 'corto', 'experimental', 'referencia'],
}

const catalogMoodPresets = [
  'ligero',
  'denso',
  'intenso',
  'rapido',
  'confort',
  'sorpresa',
  'melancolico',
  'raro',
  'oscuro',
  'emocional',
  'maraton',
  'cozy',
  'competitivo',
]

const catalogTaxonomyTemplates: Record<ItemType, CatalogTaxonomyTemplate[]> = {
  game: [
    {
      label: 'Survival craft',
      detail: 'Bases, farmeo, coop o mundo persistente.',
      genres: ['Supervivencia', 'Crafting', 'Accion'],
      tags: ['cooperativo', 'base building', 'mundo abierto'],
      moodTags: ['intenso'],
    },
    {
      label: 'Narrativo corto',
      detail: 'Historia fuerte para cerrar sin eternizarse.',
      genres: ['Aventura'],
      tags: ['single-player', 'historia fuerte', 'corto'],
      moodTags: ['rapido', 'emocional'],
    },
    {
      label: 'Reto tecnico',
      detail: 'Precision, repeticion y curva exigente.',
      genres: ['Soulslike', 'Roguelike', 'Accion'],
      tags: ['single-player', 'dificil'],
      moodTags: ['intenso'],
    },
    {
      label: 'Cozy gestion',
      detail: 'Sistemas tranquilos, rutina y avance suave.',
      genres: ['Gestion', 'Simulacion'],
      tags: ['indie', 'single-player'],
      moodTags: ['cozy', 'confort', 'ligero'],
    },
  ],
  book: [
    {
      label: 'Clasico epico',
      detail: 'Canon, viaje largo y lectura con peso.',
      genres: ['Clasico', 'Aventura', 'Mitologia'],
      tags: ['clasico', 'epico', 'literatura'],
      moodTags: ['denso'],
    },
    {
      label: 'Ideas grandes',
      detail: 'Mundo raro, politica o dilema filosofico.',
      genres: ['Ciencia ficcion', 'Distopia', 'Filosofia'],
      tags: ['introspectivo', 'politico', 'premiado'],
      moodTags: ['denso', 'raro'],
    },
    {
      label: 'Misterio agil',
      detail: 'Intriga clara, ritmo alto y cierre limpio.',
      genres: ['Misterio', 'Policiaca'],
      tags: ['moderno', 'adaptacion'],
      moodTags: ['rapido', 'sorpresa'],
    },
    {
      label: 'Confort romantico',
      detail: 'Calor humano, conflicto suave, final amable.',
      genres: ['Romance', 'Drama'],
      tags: ['moderno'],
      moodTags: ['confort', 'ligero'],
    },
  ],
  movie: [
    {
      label: 'Noche palomitas',
      detail: 'Directa, clara y facil de recomendar.',
      genres: ['Accion', 'Aventura'],
      tags: ['palomitas', 'visual'],
      moodTags: ['rapido', 'ligero'],
    },
    {
      label: 'Autor lento',
      detail: 'Plano largo, subtexto y conversacion despues.',
      genres: ['Drama'],
      tags: ['autor', 'contemplativa', 'festival'],
      moodTags: ['denso', 'melancolico'],
    },
    {
      label: 'Tension oscura',
      detail: 'Amenaza, paranoia y pulso nocturno.',
      genres: ['Thriller', 'Terror', 'Noir'],
      tags: ['culto'],
      moodTags: ['oscuro', 'intenso'],
    },
    {
      label: 'Familiar amable',
      detail: 'Apta para grupo y facil de ver.',
      genres: ['Animacion', 'Comedia'],
      tags: ['familiar'],
      moodTags: ['confort', 'ligero'],
    },
  ],
  series: [
    {
      label: 'Prestige drama',
      detail: 'Personajes, capas y temporada con peso.',
      genres: ['Drama', 'Crimen'],
      tags: ['prestige', 'coral', 'serializada'],
      moodTags: ['denso'],
    },
    {
      label: 'Procedural facil',
      detail: 'Episodios cerrados para entrar y salir.',
      genres: ['Misterio', 'Crimen'],
      tags: ['procedural', 'weekly'],
      moodTags: ['confort'],
    },
    {
      label: 'Maraton ligera',
      detail: 'Ritmo alto, episodios cortos, poco roce.',
      genres: ['Comedia'],
      tags: ['binge', 'familiar'],
      moodTags: ['maraton', 'ligero'],
    },
    {
      label: 'Fantasia serial',
      detail: 'Lore, facciones y continuidad larga.',
      genres: ['Fantasia', 'Aventura'],
      tags: ['serializada', 'adaptacion'],
      moodTags: ['sorpresa'],
    },
  ],
  anime: [
    {
      label: 'Arco shonen',
      detail: 'Escalada, peleas y energia alta.',
      genres: ['Shonen', 'Accion', 'Aventura'],
      tags: ['popular', 'sakuga'],
      moodTags: ['intenso'],
    },
    {
      label: 'Vida tranquila',
      detail: 'Rutina, humor suave y bajo compromiso.',
      genres: ['Slice of life', 'Comedia'],
      tags: ['temporada corta'],
      moodTags: ['cozy', 'ligero'],
    },
    {
      label: 'Mecha drama',
      detail: 'Escala grande, conflicto humano y trauma.',
      genres: ['Mecha', 'Drama', 'Sci-fi'],
      tags: ['clasico'],
      moodTags: ['denso', 'emocional'],
    },
    {
      label: 'Rareza cerrada',
      detail: 'Premisa peculiar y temporada autocontenida.',
      genres: ['Misterio', 'Fantasia'],
      tags: ['raro', 'arco cerrado'],
      moodTags: ['sorpresa', 'raro'],
    },
  ],
  manga: [
    {
      label: 'Serie larga',
      detail: 'Muchos tomos, progresion y fandom activo.',
      genres: ['Shonen', 'Aventura'],
      tags: ['serializado', 'popular', 'largo'],
      moodTags: ['maraton'],
    },
    {
      label: 'Tomo unico',
      detail: 'Autoconclusivo, facil de recomendar.',
      genres: ['Drama'],
      tags: ['autoconclusivo', 'finalizado'],
      moodTags: ['rapido'],
    },
    {
      label: 'Psico oscuro',
      detail: 'Cabeza rara, tension y lectura pesada.',
      genres: ['Psicologico', 'Terror'],
      tags: ['raro'],
      moodTags: ['oscuro', 'denso'],
    },
    {
      label: 'Romance suave',
      detail: 'Relaciones, humor y avance amable.',
      genres: ['Romance', 'Slice of life'],
      tags: ['finalizado'],
      moodTags: ['confort', 'ligero'],
    },
  ],
  manhwa: [
    {
      label: 'Power fantasy',
      detail: 'Subida de nivel, raids y progresion clara.',
      genres: ['Progresion', 'Accion', 'Fantasia'],
      tags: ['webtoon', 'popular', 'progresion'],
      moodTags: ['maraton'],
    },
    {
      label: 'Romance webtoon',
      detail: 'Capitulos cortos, drama y lectura ligera.',
      genres: ['Romance', 'Drama'],
      tags: ['webtoon', 'romance'],
      moodTags: ['ligero', 'emocional'],
    },
    {
      label: 'Historico noble',
      detail: 'Corte, intriga y vestidos con veneno.',
      genres: ['Historico', 'Drama'],
      tags: ['temporadas'],
      moodTags: ['sorpresa'],
    },
    {
      label: 'Academia magica',
      detail: 'Escuela, poderes y rivalidades.',
      genres: ['Academia', 'Fantasia'],
      tags: ['fantasia', 'largo'],
      moodTags: ['confort'],
    },
  ],
  comic: [
    {
      label: 'Mainstream hero',
      detail: 'Arcos grandes, continuidad y accion.',
      genres: ['Superheroes', 'Accion'],
      tags: ['mainstream', 'serie abierta'],
      moodTags: ['intenso'],
    },
    {
      label: 'Indie autor',
      detail: 'Voz propia, riesgo formal y cierre fuerte.',
      genres: ['Drama', 'Indie'],
      tags: ['autor', 'indie', 'premiado'],
      moodTags: ['raro'],
    },
    {
      label: 'Noir crimen',
      detail: 'Caso, ciudad sucia y tono adulto.',
      genres: ['Crimen', 'Noir'],
      tags: ['autoconclusivo'],
      moodTags: ['oscuro', 'denso'],
    },
    {
      label: 'Humor satira',
      detail: 'Lectura rapida, comentario y mala leche.',
      genres: ['Humor', 'Satira'],
      tags: ['corto'],
      moodTags: ['rapido', 'ligero'],
    },
  ],
  other: [
    {
      label: 'Curado raro',
      detail: 'Entrada manual que no encaja del todo.',
      genres: ['Experimental'],
      tags: ['manual', 'raro', 'curado'],
      moodTags: ['raro'],
    },
    {
      label: 'Referencia util',
      detail: 'Consulta, aprendizaje o material practico.',
      genres: ['Ensayo', 'Practico'],
      tags: ['referencia'],
      moodTags: ['denso'],
    },
    {
      label: 'Ligero corto',
      detail: 'Algo pequeno para recomendar sin friccion.',
      genres: ['Ligero'],
      tags: ['corto'],
      moodTags: ['rapido', 'ligero'],
    },
    {
      label: 'Documental',
      detail: 'No ficcion, tema concreto y valor externo.',
      genres: ['Documental'],
      tags: ['curado'],
      moodTags: ['sorpresa'],
    },
  ],
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
  const candidatePreview = scoredCandidates.slice(0, 4)
  const unavailableCount = Math.max(0, library.items.length - scoredCandidates.length)
  const poolSize = Math.min(scoredCandidates.length, Math.max(3, Math.ceil(3 + preferences.surprisePercent / 8)))
  const activeDiceFilters = getActiveDiceFilters(preferences, library.settings)
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
            icon={Dice5}
            title="Sin candidatas"
            detail="Afloja filtros, incluye pausados o anade pendientes desde Biblioteca y Explorador."
          />
        )}
        <div className="dice-footnotes">
          <span>{unavailableCount} fuera por estado, cooldown o filtros</span>
          <span>Pool maximo {poolSize}</span>
        </div>
        <DiceEligibilityPanel breakdown={eligibilityBreakdown} activeFilters={activeDiceFilters} />
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
  const [catalogDraft, setCatalogDraft] = useState<PublicCatalogItem | undefined>()
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
                onCurate={library.isModerator ? () => openCatalogDraft(candidate) : undefined}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={view === 'queued' ? Sparkles : view === 'saved' ? CheckCircle2 : X}
            tone={view === 'dismissed' ? 'muted' : 'neutral'}
            title={discoveryEmptyCopy[view].title}
            detail={discoveryEmptyCopy[view].detail}
            action={
              view === 'queued' ? (
                <button className="secondary-button" type="button" onClick={addPromptCard}>
                  <Sparkles size={16} />
                  Anadir carta sorpresa
                </button>
              ) : undefined
            }
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
  const accountLabel = user?.displayName ?? user?.email ?? 'Sesion demo'
  const accountInitial = accountLabel.slice(0, 1).toUpperCase()
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
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [sortMode, setSortMode] = useState<CatalogSortMode>('quality')
  const [items, setItems] = useState<PublicCatalogItem[]>([])
  const [editingItem, setEditingItem] = useState<PublicCatalogItem | undefined>()
  const [archiveTarget, setArchiveTarget] = useState<PublicCatalogItem | undefined>()
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const [initialLibrary] = useState(() => library)
  const incompleteCount = items.filter((item) => catalogQualityWarnings(item).length > 0).length
  const completeCount = items.length - incompleteCount
  const typeCount = new Set(items.map((item) => item.type)).size
  const hasActiveCatalogFilters = qualityFilter !== 'all' || typeFilter !== 'all' || sortMode !== 'quality'
  const visibleCatalogItems = useMemo(() => {
    return items
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => {
        const warningCount = catalogQualityWarnings(item).length
        if (qualityFilter === 'needs-work') return warningCount > 0
        if (qualityFilter === 'ready') return warningCount === 0
        return true
      })
      .sort((left, right) => sortCatalogItems(left, right, sortMode))
  }, [items, qualityFilter, sortMode, typeFilter])
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
    setTypeFilter('all')
    setSortMode('quality')
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
        <div className="catalog-curation-toolbar">
          <div className="catalog-filter-tabs" role="group" aria-label="Calidad del catalogo">
            {qualityFilters.map((filter) => (
              <button
                aria-pressed={qualityFilter === filter.id}
                className={qualityFilter === filter.id ? 'catalog-filter-chip active' : 'catalog-filter-chip'}
                key={filter.id}
                type="button"
                onClick={() => setQualityFilter(filter.id)}
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
              <button className="primary-button" type="button" onClick={() => setEditingItem(blankPublicCatalogItem())}>
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
  onSave,
}: {
  candidate: DiscoveryCandidate
  onDetails: () => void
  onCurate?: () => void
  onDismiss: () => void
  onSave: () => void
}) {
  const isQueued = candidate.status === 'queued'
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
          <>
            <button className="candidate-primary-action" type="button" onClick={onSave} aria-label={`Guardar ${candidate.title}`}>
              <Plus size={16} />
              <span>Guardar</span>
            </button>
            {onCurate && (
              <button className="candidate-primary-action secondary" type="button" onClick={onCurate} aria-label={`${catalogActionLabel} ${candidate.title}`}>
                <ShieldCheck size={16} />
                <span>Catalogo</span>
              </button>
            )}
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
  const visibleChips = getVisibleItemChips(item)

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
        <div className="item-body">
          <ItemIdentity item={item} />
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
  onSave,
}: {
  candidate: DiscoveryCandidate
  onClose: () => void
  onCurate?: () => void
  onDismiss: () => void
  onSave: () => void
}) {
  const isQueued = candidate.status === 'queued'
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
  const selectedTaxonomyCount = selectedGenres.length + selectedTags.length + selectedMoodTags.length
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
              <div className="editor-section-heading">
                <div>
                  <h3>Atajos de curacion</h3>
                  <p>Aplica una base de generos, tags y tono en un clic.</p>
                </div>
                <span>{selectedTaxonomyCount} activos</span>
              </div>
              <div className="taxonomy-template-list" aria-label={`Plantillas rapidas para ${typeLabels[draft.type]}`}>
                {taxonomyTemplates.map((template) => (
                  <button className="taxonomy-template-button" key={template.label} type="button" onClick={() => applyTaxonomyTemplate(template)}>
                    <span>
                      <Sparkles size={15} />
                      <strong>{template.label}</strong>
                    </span>
                    <small>{template.detail}</small>
                    <em>
                      {template.genres.length} generos / {template.tags.length} tags / {template.moodTags.length} tono
                    </em>
                  </button>
                ))}
              </div>
            </section>

            <section className="editor-section">
              <h3>Generos</h3>
              <label>
                Generos
                <input value={draft.genresText} onChange={(event) => setDraft((current) => ({ ...current, genresText: event.target.value }))} />
              </label>
              <div className="preset-chip-panel">
                <div className="preset-chip-heading">
                  <div>
                    <strong>Generos predefinidos</strong>
                    <span>{selectedGenres.length ? `${selectedGenres.length} seleccionados` : 'Elige uno o varios'}</span>
                  </div>
                  {selectedGenres.length > 0 && (
                    <button className="micro-icon-button" type="button" onClick={() => clearTextPreset('genresText')} title="Limpiar generos" aria-label="Limpiar generos">
                      <X size={14} />
                    </button>
                  )}
                </div>
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
                <div className="preset-chip-heading">
                  <div>
                    <strong>Tags frecuentes</strong>
                    <span>{selectedTags.length ? `${selectedTags.length} seleccionados` : 'Senales para busqueda y dado'}</span>
                  </div>
                  {selectedTags.length > 0 && (
                    <button className="micro-icon-button" type="button" onClick={() => clearTextPreset('tagsText')} title="Limpiar tags" aria-label="Limpiar tags">
                      <X size={14} />
                    </button>
                  )}
                </div>
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
                <div className="preset-chip-heading">
                  <div>
                    <strong>Tono predefinido</strong>
                    <span>{selectedMoodTags.length ? `${selectedMoodTags.length} seleccionados` : 'Como se siente la obra'}</span>
                  </div>
                  {selectedMoodTags.length > 0 && (
                    <button className="micro-icon-button" type="button" onClick={() => clearTextPreset('moodText')} title="Limpiar tono" aria-label="Limpiar tono">
                      <X size={14} />
                    </button>
                  )}
                </div>
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

function DiceEligibilityPanel({
  activeFilters,
  breakdown,
}: {
  activeFilters: string[]
  breakdown: DiceEligibilityBreakdown
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

function sortCatalogItems(left: PublicCatalogItem, right: PublicCatalogItem, mode: CatalogSortMode) {
  if (mode === 'updated') return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'es')
  if (mode === 'title') return left.title.localeCompare(right.title, 'es')

  const leftWarnings = catalogQualityWarnings(left).length
  const rightWarnings = catalogQualityWarnings(right).length
  return rightWarnings - leftWarnings || right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'es')
}

function getDiceEligibilityBreakdown(
  items: ListItem[],
  preferences: RecommendationPreferences,
  settings: UserSettings,
): DiceEligibilityBreakdown {
  const breakdown: DiceEligibilityBreakdown = {
    available: 0,
    blockedTags: 0,
    cooldown: 0,
    medium: 0,
    paused: 0,
    resolved: 0,
    total: items.length,
  }
  const now = Date.now()
  const blockedTagKeys = settings.blockedTags.map(normalizeKey)

  for (const item of items) {
    if (item.status === 'completed' || item.status === 'dropped') {
      breakdown.resolved += 1
      continue
    }
    if (item.status === 'paused' && !preferences.includePaused) {
      breakdown.paused += 1
      continue
    }
    if (item.recommendationCooldownUntil && Date.parse(item.recommendationCooldownUntil) > now) {
      breakdown.cooldown += 1
      continue
    }
    if (!matchesDiceMedium(item.type, preferences.medium)) {
      breakdown.medium += 1
      continue
    }
    if (blockedTagKeys.some((tag) => item.tags.map(normalizeKey).includes(tag))) {
      breakdown.blockedTags += 1
      continue
    }
    breakdown.available += 1
  }

  return breakdown
}

function matchesDiceMedium(itemType: ItemType, medium: ExplorerSearchType) {
  if (medium === 'any') return true
  if (medium === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  return itemType === medium
}

function getActiveDiceFilters(preferences: RecommendationPreferences, settings: UserSettings) {
  return [
    `Medio: ${typeLabels[preferences.medium]}`,
    preferences.timeBudgetHours ? `Tiempo: ${preferences.timeBudgetHours}h` : 'Sin limite de tiempo',
    `Energia: ${energyLabels[preferences.energy]}`,
    `Novedad: ${noveltyLabels[preferences.novelty]}`,
    preferences.includePaused ? 'Incluye pausados' : 'Pausados fuera',
    settings.blockedTags.length ? `${settings.blockedTags.length} tags bloqueados` : 'Sin tags bloqueados',
  ]
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

function formatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function getItemSubtitle(item: ListItem) {
  const parts = [typeLabels[item.type]]
  if (item.progress) parts.push(item.progress)
  if (item.durationMinHours || item.durationMaxHours) parts.push(formatDuration(item))
  if (item.publicItemId) parts.push('Nexo')
  return parts.join(' / ')
}

function getVisibleItemChips(item: ListItem) {
  return uniqueValues([
    ...(item.rating !== undefined ? [`${item.rating}/10`] : []),
    ...item.genres,
    ...item.tags,
    ...item.moodTags,
  ]).slice(0, 4)
}

function formatDuration(item: ListItem) {
  if (item.durationMinHours && item.durationMaxHours && item.durationMinHours !== item.durationMaxHours) {
    return `${item.durationMinHours}-${item.durationMaxHours}h`
  }
  return `${item.durationMaxHours ?? item.durationMinHours}h`
}

export default App
