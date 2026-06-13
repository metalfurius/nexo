import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
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
  HelpCircle,
  Library,
  List,
  LockKeyhole,
  LogIn,
  LogOut,
  MoreHorizontal,
  Moon,
  Palette,
  Pause,
  Play,
  Info,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import './App.css'
import {
  type ActivityEntry,
  type ActivityTab,
  type ActivityTarget,
  type ActivityTone,
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  THEME_MODES,
  type ExternalCandidate,
  ITEM_STATUSES,
  ITEM_TYPES,
  USER_ROLES,
  type DiscoveryCandidate,
  type DiscoveryStatus,
  type ExplorerSearchType,
  type ImportPreview,
  type ImportSourceId,
  type ItemStatus,
  type ItemType,
  type LibraryCardsPerRow,
  type LibraryViewMode,
  type ListItem,
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
import { CATALOG_RESULTS_PAGE_SIZE, rankCatalogSearchCandidates } from './lib/catalogSearch'
import { getActivityContinuitySummary, getActivityDestinationTab } from './lib/activityInsights'
import {
  blankPublicCatalogItem,
  buildCatalogDescriptionDraft,
  catalogIssueLabels,
  catalogIssueShortLabels,
  catalogQualityIssueKeys,
  catalogQualityWarnings,
  catalogSortLabels,
  draftCatalogQualityWarnings,
  getCatalogDiagnostics,
  getCatalogRepairDraft,
  getCatalogReviewQueue,
  publicCatalogDraftFromCandidate,
  publicCatalogDraftFromTemplate,
  sortCatalogItems,
  upsertVisibleCatalogItem,
  type CatalogIssueFilter,
  type CatalogIssueKey,
  type CatalogQualityFilter,
  type CatalogSortMode,
} from './lib/catalogInsights'
import {
  diceIntensityLabels as intensityLabels,
  getActiveDiceFilters,
  getDiceEligibilityBreakdown,
  getDiceScoreMeterWidth,
  getRecommendationLearningSignals,
  getRecommendationSessionPlan,
  type DiceEligibilityBreakdown,
  type RecommendationSessionPlan,
} from './lib/diceInsights'
import {
  discoveryEmptyCopy,
  discoverySourceLabels as sourceLabels,
  discoveryStatusLabels,
  explorerSourceFilters,
  getCandidateDecisionBrief,
  getDiscoverySourceFilter,
  getExplorerDecisionState,
  getExplorerSourceFilterLabel,
  type CandidateDecisionBrief,
  type ExplorerSourceFilter,
} from './lib/explorerInsights'
import { getExternalRefEntries } from './lib/externalRefs'
import {
  getLibraryFocusItems,
  getLibraryFocusReason,
  getLibraryLaunchGuide,
  getLibraryNextPlanFacts,
  getLibraryNextPlanSignals,
  getLibraryNextPlanTitle,
  getLibraryReviewQueues,
  getLibrarySmartViewOptions,
  hasItemTaxonomy,
  isItemReadyForDicePulse,
  matchesLibrarySmartView,
  type LibraryReviewQueue,
  type LibraryLaunchGuide,
  type LibraryLaunchStep,
  type LibrarySmartView,
} from './lib/libraryInsights'
import {
  formatDateLabel,
  getItemSubtitle,
  getPersonalEditorReadiness,
  isItemInCooldown,
  itemSourceLabels,
  itemStatusLabels as statusLabels,
  itemTypeLabels as typeLabels,
} from './lib/libraryItemInsights'
import {
  formatRecentRecommendationTime,
  getPrivateDataHealth,
  getPrivateTaxonomyRepairDraft,
  getRecentRecommendationItems,
  type PrivateTasteSuggestion,
} from './lib/privateDataInsights'
import {
  createLibraryExportPayload,
  getLibraryImportRollbackPlan,
  getLibraryImportSummary,
  parseLibraryImportPayload,
  type LibraryImportRollbackPlan,
  type LibraryImportSummary,
  type ParsedLibraryImport,
} from './lib/libraryBackup'
import { sortLibraryItems, type LibrarySortMode } from './lib/librarySorting'
import {
  createPublicCatalogSeedTemplate,
  getPublicCatalogSeedRollbackPlan,
  getPublicCatalogSeedSummary,
  parsePublicCatalogSeed,
  type PublicCatalogSeedRollbackPlan,
  type PublicCatalogSeedResult,
  type PublicCatalogSeedSummary,
} from './lib/publicCatalogSeed'
import { recommendItem, scoreCandidates } from './lib/recommendations'
import { discoverExternalCandidate, externalSourceCredits, type ExternalDiscoverDuration, type ExternalDiscoverType } from './services/externalSearch'
import {
  buildImportPreview,
  importAniListLibrary,
  importGoodreadsCsv,
  importLetterboxdZip,
  importMyAnimeListLibrary,
  importPreviewItemsToListItems,
  importSourceLabels,
} from './services/libraryImporters'
import { applyServiceWorkerUpdate, SERVICE_WORKER_UPDATE_READY_EVENT } from './services/serviceWorker'
import {
  mergeListText,
  normalizeKey,
  slugify,
  splitList,
  toggleListTextValue,
  uniqueNormalizedValues,
  uniqueValues,
} from './lib/strings'

const librarySortLabels: Record<LibrarySortMode, string> = {
  focus: 'Foco',
  updated: 'Recientes',
  title: 'Titulo',
  priority: 'Prioridad',
  rating: 'Rating',
}

const libraryCardsPerRowOptions: LibraryCardsPerRow[] = [4, 5, 6]

const libraryCatalogSearchTypes: Array<{ id: ExplorerSearchType; label: string }> = [
  { id: 'any', label: 'Todo' },
  { id: 'watch', label: 'Ver' },
  { id: 'game', label: 'Juegos' },
  { id: 'book', label: 'Libros' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
  { id: 'manhwa', label: 'Manhwa' },
]

const explorerDiscoverTypeOptions: Array<{ id: ExternalDiscoverType; label: string }> = [
  { id: 'any', label: 'Cualquiera' },
  { id: 'movie', label: 'Pelicula' },
  { id: 'series', label: 'Serie' },
  { id: 'animeManga', label: 'Anime/Manga' },
  { id: 'game', label: 'Juego' },
  { id: 'book', label: 'Libro' },
]

const explorerDiscoverDurationOptions: Array<{ id: ExternalDiscoverDuration; label: string }> = [
  { id: 'any', label: 'Cualquiera' },
  { id: 'short', label: 'Corto' },
  { id: 'medium', label: 'Medio' },
  { id: 'long', label: 'Largo' },
]

type LibraryPriorityLevel = 'low' | 'normal' | 'high'
type LibrarySelectionSignalAction = 'add' | 'remove'
type LibrarySelectionSignalKind = 'genre' | 'mood' | 'tag'

const libraryPriorityOptions: Array<{
  detail: string
  id: LibraryPriorityLevel
  label: string
  value: number
}> = [
  { detail: 'Apartar del dado sin pausar la ficha', id: 'low', label: 'Foco bajo', value: 0.7 },
  { detail: 'Peso equilibrado para el dado', id: 'normal', label: 'Foco normal', value: 1 },
  { detail: 'Subir en la cola del dado', id: 'high', label: 'Foco alto', value: 1.35 },
]

const librarySelectionSignalLabels: Record<LibrarySelectionSignalKind, { plural: string; singular: string; title: string }> = {
  genre: { plural: 'generos', singular: 'genero', title: 'genero' },
  mood: { plural: 'mood tags', singular: 'mood tag', title: 'mood' },
  tag: { plural: 'tags', singular: 'tag', title: 'tag' },
}

const librarySelectionSignalOptions: Array<{
  id: LibrarySelectionSignalKind
  label: string
  placeholder: string
}> = [
  { id: 'tag', label: 'Tags', placeholder: 'Tags, separados por coma' },
  { id: 'genre', label: 'Generos', placeholder: 'Generos, separados por coma' },
  { id: 'mood', label: 'Mood tags', placeholder: 'Mood tags, separados por coma' },
]

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  moderator: 'Moderador',
  user: 'Usuario',
}

const themeOptions: Array<{
  detail: string
  id: ThemeMode
  label: string
  swatches: [string, string, string]
}> = [
  { detail: 'Nexo nocturno', id: 'dark', label: 'Oscuro', swatches: ['#0f1214', '#1f6570', '#8bd5df'] },
  { detail: 'Lectura limpia', id: 'light', label: 'Claro', swatches: ['#f8faf9', '#1f6570', '#a95f2a'] },
  { detail: 'Rosa suave', id: 'rose', label: 'Rosa', swatches: ['#fff5f8', '#c44574', '#f4a7bd'] },
  { detail: 'Verde bosque', id: 'forest', label: 'Bosque', swatches: ['#0f1712', '#2f7d55', '#a8d08d'] },
  { detail: 'Azul profundo', id: 'ocean', label: 'Oceano', swatches: ['#0d1726', '#256f91', '#8bc9ff'] },
  { detail: 'Menta clara', id: 'mint', label: 'Menta', swatches: ['#f5fbf7', '#2f8c7a', '#d96b56'] },
  { detail: 'Neon calmado', id: 'aurora', label: 'Aurora', swatches: ['#101113', '#29b8a4', '#d85f9c'] },
]

const themeLabels: Record<ThemeMode, string> = Object.fromEntries(
  themeOptions.map((option) => [option.id, option.label]),
) as Record<ThemeMode, string>

const themeMetaColors: Record<ThemeMode, string> = {
  aurora: '#101113',
  dark: '#0f1214',
  forest: '#0f1712',
  light: '#f8faf9',
  mint: '#f5fbf7',
  ocean: '#0d1726',
  rose: '#fff5f8',
}

const coverArtPalettes: Record<ItemType, Array<[string, string, string]>> = {
  anime: [
    ['#7dd3fc', '#c084fc', '#0f172a'],
    ['#f9a8d4', '#67e8f9', '#1e1b4b'],
  ],
  book: [
    ['#fbbf24', '#7c3aed', '#1c1917'],
    ['#f59e0b', '#10b981', '#111827'],
  ],
  comic: [
    ['#fb7185', '#fde047', '#18181b'],
    ['#38bdf8', '#fb923c', '#111827'],
  ],
  game: [
    ['#34d399', '#60a5fa', '#06130f'],
    ['#22d3ee', '#a3e635', '#111827'],
  ],
  manga: [
    ['#f472b6', '#facc15', '#1f1020'],
    ['#a78bfa', '#fda4af', '#18181b'],
  ],
  manhwa: [
    ['#2dd4bf', '#f472b6', '#111827'],
    ['#60a5fa', '#fbbf24', '#0f172a'],
  ],
  movie: [
    ['#93c5fd', '#f97316', '#111827'],
    ['#38bdf8', '#c084fc', '#0f172a'],
  ],
  other: [
    ['#a7f3d0', '#f0abfc', '#111827'],
    ['#fde68a', '#67e8f9', '#1f2937'],
  ],
  series: [
    ['#818cf8', '#22c55e', '#111827'],
    ['#fda4af', '#60a5fa', '#1e1b4b'],
  ],
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

function isThemeMode(value: string | null): value is ThemeMode {
  return Boolean(value && THEME_MODES.includes(value as ThemeMode))
}

function isStandalonePwa() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || iosNavigator.standalone)
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

type FeedbackTone = ActivityTone

function feedbackToneFromText(message: string): FeedbackTone {
  const normalized = message.toLowerCase()
  if (normalized.includes('no se pudo') || normalized.includes('error') || normalized.includes('invalido')) return 'danger'
  if (
    normalized.startsWith('buscando') ||
    normalized.startsWith('borrando') ||
    normalized.startsWith('deshaciendo') ||
    normalized.startsWith('importando') ||
    normalized.startsWith('preparando') ||
    normalized.startsWith('restaurando')
  ) {
    return 'loading'
  }
  if (
    normalized.includes('guardad') ||
    normalized.includes('borrad') ||
    normalized.includes('deshech') ||
    normalized.includes('archivad') ||
    normalized.includes('exportad') ||
    normalized.includes('importadas') ||
    normalized.includes('descargad') ||
    normalized.includes('copiad') ||
    normalized.includes('anadid') ||
    normalized.includes('afinad') ||
    normalized.includes('completad') ||
    normalized.includes('enfriado') ||
    normalized.includes('reparad') ||
    normalized.includes('reactivad') ||
    normalized.includes('enviados') ||
    normalized.includes('marcado') ||
    normalized.includes('descartado') ||
    normalized.includes('limpiad') ||
    normalized.includes('recuperad') ||
    normalized.includes('ahora es') ||
    normalized.includes('ahora tienen')
  ) {
    return 'success'
  }
  return 'info'
}

type ActivityFocus = ActivityTarget
type AppTab = ActivityTab
interface LibrarySmartViewRequest {
  id: LibrarySmartView
  requestId: number
}

interface LibrarySortModeRequest {
  mode: LibrarySortMode
  requestId: number
}

interface LibraryStatusFilterRequest {
  requestId: number
  status: ItemStatus
}

interface LibraryTypeFilterRequest {
  requestId: number
  type: ItemType
}

interface LibraryPrimaryActionRequest {
  itemId: string
  requestId: number
}

interface LibraryImportRequest {
  requestId: number
}

interface LibraryReviewRequest {
  id: LibrarySmartView
  requestId: number
}

interface LibraryResetViewRequest {
  requestId: number
}

interface LibraryVisibleSelectionRequest {
  requestId: number
}

interface LibraryVisibleSelectionSummary {
  allVisibleItemsSelected: boolean
  selectedVisibleCount: number
  visibleCount: number
}

interface LibrarySelectedStatusRequest {
  requestId: number
  status: ItemStatus
}

interface LibrarySelectedDiceActionRequest {
  action: 'snooze' | 'reactivate'
  requestId: number
}

interface LibrarySelectedPriorityRequest {
  level: LibraryPriorityLevel
  requestId: number
}

interface LibrarySelectedSignalsRequest {
  action: LibrarySelectionSignalAction
  kind: LibrarySelectionSignalKind
  requestId: number
  values: string[]
}

interface LibrarySelectedExportRequest {
  requestId: number
}

interface DiceRollRequest {
  requestId: number
}

interface DiceRollSummary {
  candidateCount: number
}

interface DicePreferencesSaveRequest {
  requestId: number
}

interface DiceCooldownReactivateRequest {
  requestId: number
}

interface ExplorerSearchRequest {
  query: string
  requestId: number
}

interface ExplorerPromptCardRequest {
  requestId: number
}

interface ExplorerCandidateRequest {
  candidateId: string
  requestId: number
}

interface ExplorerCandidateSaveRequest {
  candidateId: string
  requestId: number
}

interface ExplorerCandidateDismissRequest {
  candidateId: string
  requestId: number
}

interface ExplorerVisibleSaveRequest {
  requestId: number
  sourceFilter: ExplorerSourceFilter
}

interface ExplorerVisibleDismissRequest {
  requestId: number
  sourceFilter: ExplorerSourceFilter
}

interface SettingsTaxonomyRepairRequest {
  requestId: number
}

interface SettingsTasteSuggestionsRequest {
  requestId: number
}

interface SettingsSaveRequest {
  requestId: number
}

type PendingNavigation = {
  diceReactivateCooldowns?: boolean
  diceRoll?: boolean
  draftItem?: ListItem
  explorerCandidateId?: string
  explorerCandidateDismissId?: string
  explorerCandidateSaveId?: string
  explorerPromptCard?: boolean
  explorerSearchQuery?: string
  explorerVisibleDismissSourceFilter?: ExplorerSourceFilter
  explorerVisibleSaveSourceFilter?: ExplorerSourceFilter
  focus?: ActivityFocus
  libraryImport?: boolean
  libraryPrimaryActionItemId?: string
  libraryReview?: LibrarySmartView
  libraryResetView?: boolean
  librarySelectedDiceAction?: LibrarySelectedDiceActionRequest['action']
  librarySelectedExport?: boolean
  librarySelectedPriority?: LibraryPriorityLevel
  librarySelectedStatus?: ItemStatus
  librarySelectedSignals?: { action: LibrarySelectionSignalAction; kind: LibrarySelectionSignalKind; values: string[] }
  librarySortMode?: LibrarySortMode
  libraryStatusFilter?: ItemStatus
  librarySmartView?: LibrarySmartView
  libraryTypeFilter?: ItemType
  libraryVisibleSelection?: boolean
  settingsTasteSuggestions?: boolean
  settingsTaxonomyRepair?: boolean
  source: 'app' | 'history'
  tab: AppTab
}
type ActivityRecorder = (entry: Omit<ActivityEntry, 'createdAt' | 'id'>) => void
interface QuickSearchCommand {
  Icon: LucideIcon
  detail: string
  id: string
  meta: string
  run: () => void
  searchText: string
  searchPriority?: number
  title: string
  tone: 'command' | 'create' | 'section'
}

type QuickSearchEntry =
  | {
      Icon: LucideIcon
      detail: string
      id: string
      kind: 'create'
      meta: string
      query: string
      tone: 'create'
      title: string
    }
  | {
      Icon: LucideIcon
      detail: string
      id: string
      kind: 'explore'
      meta: string
      query: string
      tone: 'section'
      title: string
    }
  | {
      Icon: LucideIcon
      detail: string
      id: string
      candidate: DiscoveryCandidate
      kind: 'candidate'
      meta: string
      tone: ItemType
      title: string
    }
  | {
      Icon: LucideIcon
      detail: string
      id: string
      item: ListItem
      kind: 'item'
      meta: string
      tone: ItemType
      title: string
    }
  | {
      Icon: LucideIcon
      detail: string
      id: string
      kind: 'tab'
      meta: string
      tab: AppTab
      tone: 'section'
      title: string
    }
  | {
      command: QuickSearchCommand
      Icon: LucideIcon
      detail: string
      id: string
      kind: 'command'
      meta: string
      tone: QuickSearchCommand['tone']
      title: string
    }

interface ScoredQuickSearchEntry {
  entry: QuickSearchEntry
  index: number
  score: number
}

type QuickSearchCommandEntry = Extract<QuickSearchEntry, { kind: 'command' }>

const dialogFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface DialogScrollLockSnapshot {
  bodyOverflow: string
  bodyPaddingRight: string
  bodyPosition: string
  bodyTop: string
  bodyWidth: string
  documentOverflow: string
  scrollX: number
  scrollY: number
}

let dialogScrollLockCount = 0
let dialogScrollLockSnapshot: DialogScrollLockSnapshot | undefined

function lockDialogScroll() {
  if (typeof window === 'undefined') return

  dialogScrollLockCount += 1
  if (dialogScrollLockCount > 1) return

  const { body, documentElement } = document
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth
  dialogScrollLockSnapshot = {
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyWidth: body.style.width,
    documentOverflow: documentElement.style.overflow,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }

  documentElement.classList.add('dialog-scroll-locked')
  body.classList.add('dialog-scroll-locked')
  documentElement.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  body.style.position = 'fixed'
  body.style.top = `-${dialogScrollLockSnapshot.scrollY}px`
  body.style.width = '100%'
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`
  }
}

function unlockDialogScroll() {
  if (typeof window === 'undefined') return

  dialogScrollLockCount = Math.max(0, dialogScrollLockCount - 1)
  if (dialogScrollLockCount > 0) return

  const snapshot = dialogScrollLockSnapshot
  dialogScrollLockSnapshot = undefined

  const { body, documentElement } = document
  documentElement.classList.remove('dialog-scroll-locked')
  body.classList.remove('dialog-scroll-locked')
  if (!snapshot) return

  documentElement.style.overflow = snapshot.documentOverflow
  body.style.overflow = snapshot.bodyOverflow
  body.style.paddingRight = snapshot.bodyPaddingRight
  body.style.position = snapshot.bodyPosition
  body.style.top = snapshot.bodyTop
  body.style.width = snapshot.bodyWidth
  window.scrollTo(snapshot.scrollX, snapshot.scrollY)
}

function getDialogFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(dialogFocusableSelector)).filter(
    (element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'),
  )
}

function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab' || event.defaultPrevented) return
  const focusableElements = getDialogFocusableElements(event.currentTarget)
  if (!focusableElements.length) return

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement

  if (event.shiftKey && (activeElement === firstElement || !event.currentTarget.contains(activeElement))) {
    event.preventDefault()
    lastElement.focus()
    return
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>, onClose: () => void) {
  if (event.key === 'Tab') {
    trapDialogFocus(event)
    return
  }
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  onClose()
}

function getCurrentFocusTarget() {
  if (typeof document === 'undefined') return null
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) return null
  if (activeElement === document.body || activeElement === document.documentElement) return null
  return activeElement
}

function restoreDialogFocus(target: HTMLElement | null) {
  if (!target || !target.isConnected || target.closest('[aria-hidden="true"]')) return
  if (target.matches(':disabled')) return
  if (document.querySelector('[aria-modal="true"]')) return

  const activeElement = document.activeElement
  if (
    activeElement instanceof HTMLElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement &&
    activeElement.isConnected
  ) {
    return
  }

  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
  }
}

function scheduleDialogFocusRestore(target: HTMLElement | null) {
  if (typeof window === 'undefined') return
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => restoreDialogFocus(target))
    return
  }
  window.setTimeout(() => restoreDialogFocus(target), 0)
}

function useDialogLifecycle() {
  const returnFocusTargetRef = useRef<HTMLElement | null | undefined>(undefined)
  if (returnFocusTargetRef.current === undefined) {
    returnFocusTargetRef.current = getCurrentFocusTarget()
  }

  useLayoutEffect(() => {
    const returnFocusTarget = returnFocusTargetRef.current ?? null
    lockDialogScroll()
    return () => {
      unlockDialogScroll()
      scheduleDialogFocusRestore(returnFocusTarget)
    }
  }, [])
}

function useRestoreFocusOnUnmount() {
  useDialogLifecycle()
}

function DialogFocusReturn() {
  useDialogLifecycle()
  return null
}

interface ShellNavItem {
  description: string
  displayLabel?: string
  hidden?: boolean
  icon: typeof Library
  id: AppTab
  label: string
  shortLabel?: string
}

const activityTabLabels: Record<AppTab, string> = {
  curation: 'Curacion',
  dice: 'Dado',
  explorer: 'Explorador',
  library: 'Biblioteca',
  settings: 'Ajustes',
}
const sessionActivityLimit = 5
const serviceImportPreviewRenderLimit = 80

interface PrivateDataAction {
  detail: string
  disabled?: boolean
  danger?: boolean
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

const fallbackExplorerStarters: Array<{
  id: string
  kicker: string
  posterUrl?: string
  query: string
  searchType: ExplorerSearchType
  title: string
  type: ItemType
}> = [
  { id: 'frieren', kicker: 'Anime tranquilo', query: 'Frieren', searchType: 'anime', title: 'Frieren', type: 'anime' },
  { id: 'hollow-knight', kicker: 'Juego con mundo propio', query: 'Hollow Knight', searchType: 'game', title: 'Hollow Knight', type: 'game' },
]

const curationStarterTypes: ItemType[] = ['book', 'game', 'movie', 'series', 'anime', 'manga']
const urlAddressableTabs: AppTab[] = ['library', 'dice', 'explorer', 'settings']

function explorerSearchTypeForItemType(itemType: ItemType): ExplorerSearchType {
  if (itemType === 'movie' || itemType === 'series') return 'watch'
  if (itemType === 'game' || itemType === 'book' || itemType === 'anime' || itemType === 'manga' || itemType === 'manhwa') {
    return itemType
  }
  return 'any'
}

function readInitialAppTab(): AppTab {
  const searchParams = new URLSearchParams(window.location.search)
  if (searchParams.get('item')) return 'library'

  const tab = searchParams.get('tab')
  return urlAddressableTabs.includes(tab as AppTab) ? (tab as AppTab) : 'library'
}

function readInitialActivityFocus(): ActivityFocus | undefined {
  const itemId = new URLSearchParams(window.location.search).get('item')?.trim()
  return itemId ? { kind: 'item', id: itemId } : undefined
}

function writeAppTabToUrl(tab: AppTab, mode: 'push' | 'replace' = 'replace', focus?: ActivityFocus) {
  const url = new URL(window.location.href)
  if (tab === 'library' || !urlAddressableTabs.includes(tab)) {
    url.searchParams.delete('tab')
  } else {
    url.searchParams.set('tab', tab)
  }

  if (tab === 'library' && focus?.kind === 'item') {
    url.searchParams.set('item', focus.id)
  } else {
    url.searchParams.delete('item')
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return

  if (mode === 'push') {
    window.history.pushState(null, '', nextUrl)
  } else {
    window.history.replaceState(null, '', nextUrl)
  }
}

function buildItemShareUrl(itemId: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete('tab')
  url.searchParams.set('item', itemId)
  return url.toString()
}

function getSearchQueryFromItemId(itemId: string) {
  const parts = itemId.split(/[-_]+/).filter(Boolean)
  const searchParts = ITEM_TYPES.includes(parts[0] as ItemType) ? parts.slice(1) : parts
  return searchParts.join(' ') || itemId
}

async function writeClipboardText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall back below for browsers that expose clipboard but deny writes.
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', '')
  textArea.style.left = '-9999px'
  textArea.style.position = 'fixed'
  document.body.append(textArea)
  textArea.select()
  try {
    return document.execCommand('copy')
  } finally {
    textArea.remove()
  }
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

function cloneActivityEntry(entry: ActivityEntry): ActivityEntry {
  return {
    ...entry,
    target: entry.target ? { ...entry.target } : undefined,
  }
}

function useCloseDetailsOnOutsideClick() {
  useEffect(() => {
    function closeOpenDetails(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      const origin = target instanceof Element ? target : target.parentElement
      if (origin?.closest('[data-keep-details-open]')) return

      document.querySelectorAll<HTMLDetailsElement>('details[data-close-on-outside][open]').forEach((details) => {
        if (!details.contains(target)) details.open = false
      })
    }

    window.addEventListener('click', closeOpenDetails)
    return () => window.removeEventListener('click', closeOpenDetails)
  }, [])
}

function App() {
  const auth = useAuth()
  const library = useLibrary(auth.user)
  const [activeTab, setActiveTabState] = useState<AppTab>(() => readInitialAppTab())
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | undefined>()
  const [activityFocus, setActivityFocus] = useState<ActivityFocus | undefined>(() => readInitialActivityFocus())
  const [activityClearUndo, setActivityClearUndo] = useState<ActivityEntry[]>([])
  const [libraryDraftRequest, setLibraryDraftRequest] = useState<ListItem | undefined>()
  const [libraryImportRequest, setLibraryImportRequest] = useState<LibraryImportRequest | undefined>()
  const [libraryPrimaryActionRequest, setLibraryPrimaryActionRequest] = useState<LibraryPrimaryActionRequest | undefined>()
  const [libraryReviewRequest, setLibraryReviewRequest] = useState<LibraryReviewRequest | undefined>()
  const [libraryResetViewRequest, setLibraryResetViewRequest] = useState<LibraryResetViewRequest | undefined>()
  const [librarySelectedDiceActionRequest, setLibrarySelectedDiceActionRequest] = useState<LibrarySelectedDiceActionRequest | undefined>()
  const [librarySelectedExportRequest, setLibrarySelectedExportRequest] = useState<LibrarySelectedExportRequest | undefined>()
  const [librarySelectedPriorityRequest, setLibrarySelectedPriorityRequest] = useState<LibrarySelectedPriorityRequest | undefined>()
  const [librarySelectedStatusRequest, setLibrarySelectedStatusRequest] = useState<LibrarySelectedStatusRequest | undefined>()
  const [librarySelectedSignalsRequest, setLibrarySelectedSignalsRequest] = useState<LibrarySelectedSignalsRequest | undefined>()
  const [librarySortModeRequest, setLibrarySortModeRequest] = useState<LibrarySortModeRequest | undefined>()
  const [libraryStatusFilterRequest, setLibraryStatusFilterRequest] = useState<LibraryStatusFilterRequest | undefined>()
  const [librarySmartViewRequest, setLibrarySmartViewRequest] = useState<LibrarySmartViewRequest | undefined>()
  const [libraryTypeFilterRequest, setLibraryTypeFilterRequest] = useState<LibraryTypeFilterRequest | undefined>()
  const [libraryVisibleSelectionRequest, setLibraryVisibleSelectionRequest] = useState<LibraryVisibleSelectionRequest | undefined>()
  const [diceRollRequest, setDiceRollRequest] = useState<DiceRollRequest | undefined>()
  const [dicePreferencesSaveRequest, setDicePreferencesSaveRequest] = useState<DicePreferencesSaveRequest | undefined>()
  const [diceCooldownReactivateRequest, setDiceCooldownReactivateRequest] = useState<DiceCooldownReactivateRequest | undefined>()
  const [explorerSearchRequest, setExplorerSearchRequest] = useState<ExplorerSearchRequest | undefined>()
  const [explorerPromptCardRequest, setExplorerPromptCardRequest] = useState<ExplorerPromptCardRequest | undefined>()
  const [explorerCandidateRequest, setExplorerCandidateRequest] = useState<ExplorerCandidateRequest | undefined>()
  const [explorerCandidateSaveRequest, setExplorerCandidateSaveRequest] = useState<ExplorerCandidateSaveRequest | undefined>()
  const [explorerCandidateDismissRequest, setExplorerCandidateDismissRequest] = useState<ExplorerCandidateDismissRequest | undefined>()
  const [explorerVisibleSaveRequest, setExplorerVisibleSaveRequest] = useState<ExplorerVisibleSaveRequest | undefined>()
  const [explorerVisibleDismissRequest, setExplorerVisibleDismissRequest] = useState<ExplorerVisibleDismissRequest | undefined>()
  const [settingsTaxonomyRepairRequest, setSettingsTaxonomyRepairRequest] = useState<SettingsTaxonomyRepairRequest | undefined>()
  const [settingsTasteSuggestionsRequest, setSettingsTasteSuggestionsRequest] = useState<SettingsTasteSuggestionsRequest | undefined>()
  const [settingsSaveRequest, setSettingsSaveRequest] = useState<SettingsSaveRequest | undefined>()
  const [selectedLibraryItemIds, setSelectedLibraryItemIds] = useState<string[]>([])
  const [libraryVisibleSelectionSummary, setLibraryVisibleSelectionSummary] = useState<
    LibraryVisibleSelectionSummary | undefined
  >()
  const [diceRollSummary, setDiceRollSummary] = useState<DiceRollSummary | undefined>()
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [serviceWorkerUpdateReady, setServiceWorkerUpdateReady] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | undefined>()
  const [isOffline, setIsOffline] = useState(() => 'onLine' in navigator && !navigator.onLine)
  const [tabsWithUnsavedChanges, setTabsWithUnsavedChanges] = useState<Partial<Record<AppTab, boolean>>>({})
  const libraryImportRequestId = useRef(0)
  const libraryReviewRequestId = useRef(0)
  const librarySmartViewRequestId = useRef(0)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(themeStorageKey)
    return isThemeMode(stored) ? stored : DEFAULT_SETTINGS.theme
  })
  const libraryPrimaryActionRequestId = useRef(0)
  const diceRollRequestId = useRef(0)
  const dicePreferencesSaveRequestId = useRef(0)
  const diceCooldownReactivateRequestId = useRef(0)
  const explorerSearchRequestId = useRef(0)
  const explorerPromptCardRequestId = useRef(0)
  const explorerCandidateRequestId = useRef(0)
  const explorerCandidateSaveRequestId = useRef(0)
  const explorerCandidateDismissRequestId = useRef(0)
  const explorerVisibleSaveRequestId = useRef(0)
  const explorerVisibleDismissRequestId = useRef(0)
  const settingsTaxonomyRepairRequestId = useRef(0)
  const settingsTasteSuggestionsRequestId = useRef(0)
  const settingsSaveRequestId = useRef(0)
  const selectedLibraryItems = useMemo(() => {
    const selectedIds = new Set(selectedLibraryItemIds)
    return library.items.filter((item) => selectedIds.has(item.id))
  }, [library.items, selectedLibraryItemIds])
  const selectedLibraryCount = selectedLibraryItems.length
  const selectedLibraryDiceEligibleCount = selectedLibraryItems.filter(
    (item) => item.status !== 'completed' && item.status !== 'dropped',
  ).length
  const selectedLibraryCooldownCount = selectedLibraryItems.filter(isItemInCooldown).length
  const fallbackLibraryVisibleSelectionSummary: LibraryVisibleSelectionSummary = {
    allVisibleItemsSelected: library.items.length > 0 && selectedLibraryCount === library.items.length,
    selectedVisibleCount: selectedLibraryCount,
    visibleCount: library.items.length,
  }
  const quickSearchVisibleSelectionSummary =
    activeTab === 'library' && libraryVisibleSelectionSummary
      ? libraryVisibleSelectionSummary
      : fallbackLibraryVisibleSelectionSummary
  const fallbackDiceRollSummary = useMemo<DiceRollSummary>(
    () => ({
      candidateCount: scoreCandidates(
        library.items,
        library.settings.recommendationPreferences ?? DEFAULT_RECOMMENDATION_PREFERENCES,
        library.settings,
      ).length,
    }),
    [library.items, library.settings],
  )
  const quickSearchDiceRollSummary =
    activeTab === 'dice' && diceRollSummary ? diceRollSummary : fallbackDiceRollSummary
  useCloseDetailsOnOutsideClick()

  useEffect(() => {
    if (!auth.isFirebaseConfigured) return
    void import('./services/firebaseAnalytics')
      .then(({ initializeAnalytics }) => initializeAnalytics())
      .catch(() => undefined)
  }, [auth.isFirebaseConfigured])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeMetaColors[theme])
    window.localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  useEffect(() => {
    function handleServiceWorkerUpdateReady() {
      setServiceWorkerUpdateReady(true)
    }

    window.addEventListener(SERVICE_WORKER_UPDATE_READY_EVENT, handleServiceWorkerUpdateReady)
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_READY_EVENT, handleServiceWorkerUpdateReady)
  }, [])

  useEffect(() => {
    function syncOnlineStatus() {
      setIsOffline('onLine' in navigator && !navigator.onLine)
    }

    window.addEventListener('online', syncOnlineStatus)
    window.addEventListener('offline', syncOnlineStatus)
    return () => {
      window.removeEventListener('online', syncOnlineStatus)
      window.removeEventListener('offline', syncOnlineStatus)
    }
  }, [])

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      if (isStandalonePwa()) return

      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    function handleAppInstalled() {
      setInstallPrompt(undefined)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    function openQuickSearchWithShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : undefined
      const isTypingTarget =
        target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      const isCommandShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      const isSearchShortcut = event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !isTypingTarget
      if (isCommandShortcut || isSearchShortcut) {
        event.preventDefault()
        setQuickSearchOpen(true)
      }
    }

    window.addEventListener('keydown', openQuickSearchWithShortcut)
    return () => window.removeEventListener('keydown', openQuickSearchWithShortcut)
  }, [])

  useEffect(() => {
    function syncTabFromUrl() {
      const nextTab = readInitialAppTab()
      const nextFocus = readInitialActivityFocus()
      if (nextTab === activeTab) {
        setActivityFocus(nextFocus)
        return
      }

      if (tabsWithUnsavedChanges[activeTab]) {
        setPendingNavigation({ focus: nextFocus, source: 'history', tab: nextTab })
        writeAppTabToUrl(activeTab, 'replace', activityFocus)
        return
      }

      setPendingNavigation(undefined)
      setActivityFocus(nextFocus)
      setActiveTabState(nextTab)
    }

    window.addEventListener('popstate', syncTabFromUrl)
    return () => window.removeEventListener('popstate', syncTabFromUrl)
  }, [activeTab, activityFocus, tabsWithUnsavedChanges])

  const reportUnsavedChanges = useCallback((tab: AppTab, hasUnsavedChanges: boolean) => {
    setTabsWithUnsavedChanges((current) => {
      if (Boolean(current[tab]) === hasUnsavedChanges) return current
      return { ...current, [tab]: hasUnsavedChanges }
    })
    if (tab === activeTab && !hasUnsavedChanges) setPendingNavigation(undefined)
  }, [activeTab])

  function applyTheme(nextTheme: ThemeMode) {
    if (nextTheme === theme) return

    setTheme(nextTheme)
    void library.saveSettings({ theme: nextTheme })
  }

  async function promptInstallPwa() {
    if (!installPrompt) return

    const prompt = installPrompt
    setInstallPrompt(undefined)
    await prompt.prompt()
    await prompt.userChoice.catch(() => undefined)
  }
  const reportDiceUnsavedChanges = useCallback(
    (hasUnsavedChanges: boolean) => reportUnsavedChanges('dice', hasUnsavedChanges),
    [reportUnsavedChanges],
  )
  const reportSettingsUnsavedChanges = useCallback(
    (hasUnsavedChanges: boolean) => reportUnsavedChanges('settings', hasUnsavedChanges),
    [reportUnsavedChanges],
  )
  const clearActivityFocus = useCallback(() => setActivityFocus(undefined), [])
  const clearLibraryDraftRequest = useCallback(() => setLibraryDraftRequest(undefined), [])
  const clearLibraryImportRequest = useCallback(() => setLibraryImportRequest(undefined), [])
  const clearLibraryPrimaryActionRequest = useCallback(() => setLibraryPrimaryActionRequest(undefined), [])
  const clearLibraryReviewRequest = useCallback(() => setLibraryReviewRequest(undefined), [])
  const clearDiceRollRequest = useCallback(() => setDiceRollRequest(undefined), [])
  const clearDicePreferencesSaveRequest = useCallback(() => setDicePreferencesSaveRequest(undefined), [])
  const clearDiceCooldownReactivateRequest = useCallback(() => setDiceCooldownReactivateRequest(undefined), [])
  const clearExplorerSearchRequest = useCallback(() => setExplorerSearchRequest(undefined), [])
  const clearExplorerPromptCardRequest = useCallback(() => setExplorerPromptCardRequest(undefined), [])
  const clearExplorerCandidateRequest = useCallback(() => setExplorerCandidateRequest(undefined), [])
  const clearExplorerCandidateSaveRequest = useCallback(() => setExplorerCandidateSaveRequest(undefined), [])
  const clearExplorerCandidateDismissRequest = useCallback(() => setExplorerCandidateDismissRequest(undefined), [])
  const clearExplorerVisibleSaveRequest = useCallback(() => setExplorerVisibleSaveRequest(undefined), [])
  const clearExplorerVisibleDismissRequest = useCallback(() => setExplorerVisibleDismissRequest(undefined), [])
  const clearSettingsTaxonomyRepairRequest = useCallback(() => setSettingsTaxonomyRepairRequest(undefined), [])
  const clearSettingsTasteSuggestionsRequest = useCallback(() => setSettingsTasteSuggestionsRequest(undefined), [])
  const clearSettingsSaveRequest = useCallback(() => setSettingsSaveRequest(undefined), [])
  const recordVisibleActivity = useCallback(
    (entry: Omit<ActivityEntry, 'createdAt' | 'id'>) => {
      setActivityClearUndo([])
      library.recordActivity(entry)
    },
    [library],
  )

  async function clearSessionActivity() {
    const snapshot = library.activityEntries.map(cloneActivityEntry)
    if (!snapshot.length) return
    await library.clearActivityEntries()
    setActivityClearUndo(snapshot)
  }

  async function undoClearSessionActivity() {
    if (!activityClearUndo.length) return
    await library.restoreActivityEntries(activityClearUndo)
    setActivityClearUndo([])
  }

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

  const navItems: ShellNavItem[] = [
    { id: 'library', label: 'Biblioteca', displayLabel: 'Estanteria', shortLabel: 'Inicio', description: 'Guardadas', icon: Library },
    { id: 'dice', label: 'Dado', shortLabel: 'Dado', description: 'De tus guardadas', icon: Dice5 },
    { id: 'explorer', label: 'Explorador', displayLabel: 'Explorar', shortLabel: 'Explora', description: 'Fuera de tu estanteria', icon: Sparkles },
    { id: 'settings', label: 'Ajustes', shortLabel: 'Ajustes', description: 'Cuenta y temas', icon: Palette },
    { id: 'curation', label: 'Curacion', displayLabel: 'Curar', shortLabel: 'Curar', description: 'Catalogo publico', icon: ShieldCheck, hidden: !library.isModerator },
  ]
  const visibleNavItems = navItems.filter((item) => !item.hidden)
  const activeNavItem = navItems.find((item) => item.id === activeTab) ?? navItems[0]
  const pendingNavItem = pendingNavigation ? navItems.find((item) => item.id === pendingNavigation.tab) : undefined
  const shellTitle = activeNavItem.displayLabel ?? activeNavItem.label

  function changeActiveTab(nextTab: AppTab, focus?: ActivityFocus) {
    if (nextTab === 'curation' && !library.isModerator) return
    if (nextTab === activeTab) {
      if (focus) {
        setActivityFocus(focus)
        writeAppTabToUrl(nextTab, 'push', focus)
      }
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ focus, source: 'app', tab: nextTab })
      return
    }
    setActivityFocus(focus)
    setActiveTabState(nextTab)
    writeAppTabToUrl(nextTab, 'push', focus)
  }

  function openLibraryDraft(draft: ListItem) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      setLibraryDraftRequest(draft)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ draftItem: draft, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    setLibraryDraftRequest(draft)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function requestLibrarySmartView(view: LibrarySmartView) {
    librarySmartViewRequestId.current += 1
    setLibrarySmartViewRequest({ id: view, requestId: librarySmartViewRequestId.current })
  }

  function requestLibrarySortMode(mode: LibrarySortMode) {
    setLibrarySortModeRequest((current) => ({ mode, requestId: (current?.requestId ?? 0) + 1 }))
  }

  function requestLibraryStatusFilter(status: ItemStatus) {
    setLibraryStatusFilterRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1, status }))
  }

  function requestLibraryTypeFilter(type: ItemType) {
    setLibraryTypeFilterRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1, type }))
  }

  function requestLibraryImport() {
    libraryImportRequestId.current += 1
    setLibraryImportRequest({ requestId: libraryImportRequestId.current })
  }

  function requestLibraryReview(id: LibrarySmartView) {
    libraryReviewRequestId.current += 1
    setLibraryReviewRequest({ id, requestId: libraryReviewRequestId.current })
  }

  function requestLibraryPrimaryAction(itemId: string) {
    libraryPrimaryActionRequestId.current += 1
    setLibraryPrimaryActionRequest({ itemId, requestId: libraryPrimaryActionRequestId.current })
  }

  function requestLibraryResetView() {
    setLibraryResetViewRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1 }))
  }

  function requestLibraryVisibleSelection() {
    setLibraryVisibleSelectionRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1 }))
  }

  function requestLibrarySelectedStatus(status: ItemStatus) {
    setLibrarySelectedStatusRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1, status }))
  }

  function requestLibrarySelectedDiceAction(action: LibrarySelectedDiceActionRequest['action']) {
    setLibrarySelectedDiceActionRequest((current) => ({ action, requestId: (current?.requestId ?? 0) + 1 }))
  }

  function requestLibrarySelectedExport() {
    setLibrarySelectedExportRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1 }))
  }

  function requestLibrarySelectedPriority(level: LibraryPriorityLevel) {
    setLibrarySelectedPriorityRequest((current) => ({ level, requestId: (current?.requestId ?? 0) + 1 }))
  }

  function requestLibrarySelectedSignals(action: LibrarySelectionSignalAction, kind: LibrarySelectionSignalKind, values: string[]) {
    const nextValues = uniqueNormalizedValues(values)
    if (!nextValues.length) return

    setLibrarySelectedSignalsRequest((current) => ({
      action,
      kind,
      requestId: (current?.requestId ?? 0) + 1,
      values: nextValues,
    }))
  }

  function requestDiceRoll() {
    diceRollRequestId.current += 1
    setDiceRollRequest({ requestId: diceRollRequestId.current })
  }

  function requestDicePreferencesSave() {
    dicePreferencesSaveRequestId.current += 1
    setDicePreferencesSaveRequest({ requestId: dicePreferencesSaveRequestId.current })
  }

  function requestDiceCooldownReactivate() {
    diceCooldownReactivateRequestId.current += 1
    setDiceCooldownReactivateRequest({ requestId: diceCooldownReactivateRequestId.current })
  }

  function requestExplorerSearch(query: string) {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) return

    explorerSearchRequestId.current += 1
    setExplorerSearchRequest({ query: trimmedQuery, requestId: explorerSearchRequestId.current })
  }

  function requestExplorerPromptCard() {
    explorerPromptCardRequestId.current += 1
    setExplorerPromptCardRequest({ requestId: explorerPromptCardRequestId.current })
  }

  function requestExplorerCandidate(candidateId: string) {
    explorerCandidateRequestId.current += 1
    setExplorerCandidateRequest({ candidateId, requestId: explorerCandidateRequestId.current })
  }

  function requestExplorerCandidateSave(candidateId: string) {
    explorerCandidateSaveRequestId.current += 1
    setExplorerCandidateSaveRequest({ candidateId, requestId: explorerCandidateSaveRequestId.current })
  }

  function requestExplorerCandidateDismiss(candidateId: string) {
    explorerCandidateDismissRequestId.current += 1
    setExplorerCandidateDismissRequest({ candidateId, requestId: explorerCandidateDismissRequestId.current })
  }

  function requestExplorerVisibleSave(sourceFilter: ExplorerSourceFilter) {
    explorerVisibleSaveRequestId.current += 1
    setExplorerVisibleSaveRequest({ requestId: explorerVisibleSaveRequestId.current, sourceFilter })
  }

  function requestExplorerVisibleDismiss(sourceFilter: ExplorerSourceFilter) {
    explorerVisibleDismissRequestId.current += 1
    setExplorerVisibleDismissRequest({ requestId: explorerVisibleDismissRequestId.current, sourceFilter })
  }

  function requestSettingsTaxonomyRepair() {
    settingsTaxonomyRepairRequestId.current += 1
    setSettingsTaxonomyRepairRequest({ requestId: settingsTaxonomyRepairRequestId.current })
  }

  function requestSettingsTasteSuggestions() {
    settingsTasteSuggestionsRequestId.current += 1
    setSettingsTasteSuggestionsRequest({ requestId: settingsTasteSuggestionsRequestId.current })
  }

  function requestSettingsSave() {
    settingsSaveRequestId.current += 1
    setSettingsSaveRequest({ requestId: settingsSaveRequestId.current })
  }

  function rollDiceFromAction() {
    setQuickSearchOpen(false)
    if (activeTab === 'dice') {
      requestDiceRoll()
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ diceRoll: true, source: 'app', tab: 'dice' })
      return
    }

    requestDiceRoll()
    setActiveTabState('dice')
    writeAppTabToUrl('dice', 'push')
  }

  function openDiceFromPalette() {
    setQuickSearchOpen(false)
    changeActiveTab('dice')
  }

  function openExplorerSearchFromPalette(query: string) {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) return

    setQuickSearchOpen(false)
    if (activeTab === 'explorer') {
      setActivityFocus(undefined)
      requestExplorerSearch(trimmedQuery)
      writeAppTabToUrl('explorer', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerSearchQuery: trimmedQuery, source: 'app', tab: 'explorer' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerSearch(trimmedQuery)
    setActiveTabState('explorer')
    writeAppTabToUrl('explorer', 'push')
  }

  function addExplorerPromptCardFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'explorer') {
      setActivityFocus(undefined)
      requestExplorerPromptCard()
      writeAppTabToUrl('explorer', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerPromptCard: true, source: 'app', tab: 'explorer' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerPromptCard()
    setActiveTabState('explorer')
    writeAppTabToUrl('explorer', 'push')
  }

  function openExplorerCandidateFromPalette(candidate: DiscoveryCandidate) {
    setQuickSearchOpen(false)
    if (activeTab === 'explorer') {
      setActivityFocus(undefined)
      requestExplorerCandidate(candidate.id)
      writeAppTabToUrl('explorer', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerCandidateId: candidate.id, source: 'app', tab: 'explorer' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerCandidate(candidate.id)
    setActiveTabState('explorer')
    writeAppTabToUrl('explorer', 'push')
  }

  function saveExplorerCandidateFromPalette(candidate: DiscoveryCandidate) {
    setQuickSearchOpen(false)
    if (activeTab === 'explorer') {
      setActivityFocus(undefined)
      requestExplorerCandidateSave(candidate.id)
      writeAppTabToUrl('explorer', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerCandidateSaveId: candidate.id, source: 'app', tab: 'explorer' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerCandidateSave(candidate.id)
    setActiveTabState('explorer')
    writeAppTabToUrl('explorer', 'push')
  }

  function dismissExplorerCandidateFromPalette(candidate: DiscoveryCandidate) {
    setQuickSearchOpen(false)
    if (activeTab === 'explorer') {
      setActivityFocus(undefined)
      requestExplorerCandidateDismiss(candidate.id)
      writeAppTabToUrl('explorer', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerCandidateDismissId: candidate.id, source: 'app', tab: 'explorer' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerCandidateDismiss(candidate.id)
    setActiveTabState('explorer')
    writeAppTabToUrl('explorer', 'push')
  }

  function saveExplorerVisibleQueueFromPalette(sourceFilter: ExplorerSourceFilter) {
    setQuickSearchOpen(false)
    if (activeTab === 'explorer') {
      setActivityFocus(undefined)
      requestExplorerVisibleSave(sourceFilter)
      writeAppTabToUrl('explorer', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerVisibleSaveSourceFilter: sourceFilter, source: 'app', tab: 'explorer' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerVisibleSave(sourceFilter)
    setActiveTabState('explorer')
    writeAppTabToUrl('explorer', 'push')
  }

  function dismissExplorerVisibleQueueFromPalette(sourceFilter: ExplorerSourceFilter) {
    setQuickSearchOpen(false)
    if (activeTab === 'explorer') {
      setActivityFocus(undefined)
      requestExplorerVisibleDismiss(sourceFilter)
      writeAppTabToUrl('explorer', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerVisibleDismissSourceFilter: sourceFilter, source: 'app', tab: 'explorer' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerVisibleDismiss(sourceFilter)
    setActiveTabState('explorer')
    writeAppTabToUrl('explorer', 'push')
  }

  function repairPrivateTaxonomyFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'settings') {
      setActivityFocus(undefined)
      requestSettingsTaxonomyRepair()
      writeAppTabToUrl('settings', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ settingsTaxonomyRepair: true, source: 'app', tab: 'settings' })
      return
    }

    setActivityFocus(undefined)
    requestSettingsTaxonomyRepair()
    setActiveTabState('settings')
    writeAppTabToUrl('settings', 'push')
  }

  function applyTasteSuggestionsFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'settings') {
      setActivityFocus(undefined)
      requestSettingsTasteSuggestions()
      writeAppTabToUrl('settings', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ settingsTasteSuggestions: true, source: 'app', tab: 'settings' })
      return
    }

    setActivityFocus(undefined)
    requestSettingsTasteSuggestions()
    setActiveTabState('settings')
    writeAppTabToUrl('settings', 'push')
  }

  function runLibraryPrimaryActionFromPalette(item: ListItem) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibraryPrimaryAction(item.id)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ libraryPrimaryActionItemId: item.id, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibraryPrimaryAction(item.id)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function openLibrarySmartViewFromPalette(view: LibrarySmartView) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibrarySmartView(view)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ librarySmartView: view, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibrarySmartView(view)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function applyLibrarySortModeFromPalette(mode: LibrarySortMode) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibrarySortMode(mode)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ librarySortMode: mode, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibrarySortMode(mode)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function applyLibraryStatusFilterFromPalette(status: ItemStatus) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibraryStatusFilter(status)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ libraryStatusFilter: status, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibraryStatusFilter(status)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function applyLibraryTypeFilterFromPalette(type: ItemType) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibraryTypeFilter(type)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ libraryTypeFilter: type, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibraryTypeFilter(type)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function resetLibraryViewFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibraryResetView()
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ libraryResetView: true, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibraryResetView()
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function toggleLibraryVisibleSelectionFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibraryVisibleSelection()
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ libraryVisibleSelection: true, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibraryVisibleSelection()
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function clearLibrarySelectionFromPalette() {
    if (!selectedLibraryCount) return

    const clearedCount = selectedLibraryCount
    setQuickSearchOpen(false)
    setSelectedLibraryItemIds([])
    recordVisibleActivity({
      detail: clearedCount === 1 ? '1 entrada' : `${clearedCount} entradas`,
      label: 'Seleccion limpiada',
      tab: 'library',
      tone: 'info',
    })
  }

  function applyLibrarySelectedStatusFromPalette(status: ItemStatus) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibrarySelectedStatus(status)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ librarySelectedStatus: status, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibrarySelectedStatus(status)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function applyLibrarySelectedDiceActionFromPalette(action: LibrarySelectedDiceActionRequest['action']) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibrarySelectedDiceAction(action)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ librarySelectedDiceAction: action, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibrarySelectedDiceAction(action)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function exportLibrarySelectionFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibrarySelectedExport()
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ librarySelectedExport: true, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibrarySelectedExport()
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function applyLibrarySelectedPriorityFromPalette(level: LibraryPriorityLevel) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibrarySelectedPriority(level)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ librarySelectedPriority: level, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibrarySelectedPriority(level)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function applyLibrarySelectedSignalsFromPalette(action: LibrarySelectionSignalAction, kind: LibrarySelectionSignalKind, values: string[]) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibrarySelectedSignals(action, kind, values)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ librarySelectedSignals: { action, kind, values }, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibrarySelectedSignals(action, kind, values)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function importLibraryBackupFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibraryImport()
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ libraryImport: true, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibraryImport()
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function startLibraryReviewFromPalette(id: LibrarySmartView) {
    setQuickSearchOpen(false)
    if (activeTab === 'library') {
      setActivityFocus(undefined)
      requestLibraryReview(id)
      writeAppTabToUrl('library', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ libraryReview: id, source: 'app', tab: 'library' })
      return
    }

    setActivityFocus(undefined)
    requestLibraryReview(id)
    setActiveTabState('library')
    writeAppTabToUrl('library', 'push')
  }

  function createBlankLibraryDraft() {
    openLibraryDraft(blankItem())
  }

  function createLibraryDraftFromTitle(title: string) {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    openLibraryDraft({ ...blankItem(), title: trimmedTitle })
  }

  function exportQuickBackup() {
    setQuickSearchOpen(false)
    downloadLibraryBackup(library.items, library.settings, 'nexo-backup')
    recordVisibleActivity({
      detail: `${library.items.length} entradas exportadas`,
      label: 'Backup privado exportado',
      tab: 'settings',
      tone: 'success',
    })
  }

  function applyThemeFromPalette(nextTheme: ThemeMode) {
    setQuickSearchOpen(false)
    applyTheme(nextTheme)
  }

  function openActivityFromPalette(entry: ActivityEntry) {
    setQuickSearchOpen(false)
    changeActiveTab(getActivityDestinationTab(entry), getActivityFocus(entry))
  }

  function clearActivityFromPalette() {
    setQuickSearchOpen(false)
    void clearSessionActivity()
  }

  function undoClearActivityFromPalette() {
    setQuickSearchOpen(false)
    void undoClearSessionActivity()
  }

  function saveSettingsFromPalette() {
    setQuickSearchOpen(false)
    requestSettingsSave()
  }

  function saveDicePreferencesFromPalette() {
    setQuickSearchOpen(false)
    requestDicePreferencesSave()
  }

  function reactivateDiceCooldownsFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'dice') {
      setActivityFocus(undefined)
      requestDiceCooldownReactivate()
      writeAppTabToUrl('dice', 'push')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ diceReactivateCooldowns: true, source: 'app', tab: 'dice' })
      return
    }

    setActivityFocus(undefined)
    requestDiceCooldownReactivate()
    setActiveTabState('dice')
    writeAppTabToUrl('dice', 'push')
  }

  function discardPendingNavigation() {
    if (!pendingNavigation) return

    const {
      diceReactivateCooldowns,
      diceRoll,
      draftItem,
      explorerCandidateId,
      explorerCandidateDismissId,
      explorerCandidateSaveId,
      explorerPromptCard,
      explorerSearchQuery,
      explorerVisibleDismissSourceFilter,
      explorerVisibleSaveSourceFilter,
      focus,
      libraryImport,
      libraryPrimaryActionItemId,
      libraryReview,
      libraryResetView,
      librarySelectedDiceAction,
      librarySelectedExport,
      librarySelectedPriority,
      librarySelectedStatus,
      librarySelectedSignals,
      librarySortMode,
      libraryStatusFilter,
      librarySmartView,
      libraryTypeFilter,
      libraryVisibleSelection,
      settingsTasteSuggestions,
      settingsTaxonomyRepair,
      source,
      tab: nextTab,
    } = pendingNavigation
    setTabsWithUnsavedChanges((current) => ({ ...current, [activeTab]: false }))
    setPendingNavigation(undefined)
    if (diceRoll) {
      requestDiceRoll()
    }
    if (diceReactivateCooldowns) {
      requestDiceCooldownReactivate()
    }
    if (explorerCandidateId) {
      requestExplorerCandidate(explorerCandidateId)
    }
    if (explorerCandidateDismissId) {
      requestExplorerCandidateDismiss(explorerCandidateDismissId)
    }
    if (explorerCandidateSaveId) {
      requestExplorerCandidateSave(explorerCandidateSaveId)
    }
    if (explorerPromptCard) {
      requestExplorerPromptCard()
    }
    if (explorerSearchQuery) {
      requestExplorerSearch(explorerSearchQuery)
    }
    if (explorerVisibleDismissSourceFilter) {
      requestExplorerVisibleDismiss(explorerVisibleDismissSourceFilter)
    }
    if (explorerVisibleSaveSourceFilter) {
      requestExplorerVisibleSave(explorerVisibleSaveSourceFilter)
    }
    if (draftItem) {
      setLibraryDraftRequest(draftItem)
    }
    if (libraryImport) {
      requestLibraryImport()
    }
    if (libraryPrimaryActionItemId) {
      requestLibraryPrimaryAction(libraryPrimaryActionItemId)
    }
    if (libraryReview) {
      requestLibraryReview(libraryReview)
    }
    if (libraryResetView) {
      requestLibraryResetView()
    }
    if (librarySelectedDiceAction) {
      requestLibrarySelectedDiceAction(librarySelectedDiceAction)
    }
    if (librarySelectedExport) {
      requestLibrarySelectedExport()
    }
    if (librarySelectedPriority) {
      requestLibrarySelectedPriority(librarySelectedPriority)
    }
    if (librarySelectedStatus) {
      requestLibrarySelectedStatus(librarySelectedStatus)
    }
    if (librarySelectedSignals) {
      requestLibrarySelectedSignals(
        librarySelectedSignals.action,
        librarySelectedSignals.kind,
        librarySelectedSignals.values,
      )
    }
    if (librarySortMode) {
      requestLibrarySortMode(librarySortMode)
    }
    if (libraryStatusFilter) {
      requestLibraryStatusFilter(libraryStatusFilter)
    }
    if (librarySmartView) {
      requestLibrarySmartView(librarySmartView)
    }
    if (libraryTypeFilter) {
      requestLibraryTypeFilter(libraryTypeFilter)
    }
    if (libraryVisibleSelection) {
      requestLibraryVisibleSelection()
    }
    if (settingsTasteSuggestions) {
      requestSettingsTasteSuggestions()
    }
    if (settingsTaxonomyRepair) {
      requestSettingsTaxonomyRepair()
    }
    setActivityFocus(focus)
    setActiveTabState(nextTab)
    writeAppTabToUrl(nextTab, source === 'history' ? 'replace' : 'push', focus)
  }

  const quickSearchFocusItem = getLibraryFocusItems(library.items)[0]
  const quickSearchFocusAction = quickSearchFocusItem ? getPrimaryItemAction(quickSearchFocusItem.status) : undefined
  const quickSearchReviewQueues = getLibraryReviewQueues(library.items)
  const quickSearchQueuedCandidate = library.discoveryCandidates.find((candidate) => candidate.status === 'queued')
  const quickSearchQueuedSourceCounts = library.discoveryCandidates.reduce<Record<ExplorerSourceFilter, number>>(
    (counts, candidate) => {
      if (candidate.status !== 'queued') return counts

      counts.all += 1
      counts[getDiscoverySourceFilter(candidate)] += 1
      return counts
    },
    { all: 0, external: 0, nexo: 0, prompt: 0 },
  )
  const quickSearchExplorerSaveSource = (['external', 'nexo', 'prompt'] as const).find(
    (source) => quickSearchQueuedSourceCounts[source] > 0,
  )
  const quickSearchExplorerSaveSourceLabel = quickSearchExplorerSaveSource
    ? getExplorerSourceFilterLabel(quickSearchExplorerSaveSource)
    : undefined
  const quickSearchCooldownCount = library.items.filter(
    (item) => item.status !== 'completed' && item.status !== 'dropped' && isItemInCooldown(item),
  ).length
  const quickSearchPrivateTaxonomyRepairCount = library.items.filter((item) =>
    Boolean(getPrivateTaxonomyRepairDraft(item, catalogTaxonomyTemplates[item.type][0], item.updatedAt)),
  ).length
  const quickSearchPrivateDataHealth = getPrivateDataHealth(
    library.items,
    library.discoveryCandidates,
    undefined,
    library.settings.blockedTags,
  )
  const quickSearchFavoriteGenreKeys = new Set(library.settings.favoriteGenres.map(normalizeKey))
  const quickSearchFavoriteTagKeys = new Set(library.settings.favoriteTags.map(normalizeKey))
  const quickSearchTasteSuggestionCount = quickSearchPrivateDataHealth.tasteSuggestions.filter((suggestion) => {
    const currentKeys = suggestion.kind === 'genre' ? quickSearchFavoriteGenreKeys : quickSearchFavoriteTagKeys
    return !currentKeys.has(normalizeKey(suggestion.label))
  }).length
  const quickSearchLibrarySignalCounts = (kind: LibrarySelectionSignalKind) => library.items.reduce<Map<string, number>>((counts, item) => {
    for (const signal of getLibrarySelectionSignals(item, kind)) {
      const key = normalizeKey(signal)
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, new Map())
  const quickSearchSelectionSignalOptions = (kind: LibrarySelectionSignalKind) => {
    const counts = quickSearchLibrarySignalCounts(kind)
    const favoriteKeys = kind === 'genre' ? quickSearchFavoriteGenreKeys : kind === 'tag' ? quickSearchFavoriteTagKeys : new Set<string>()
    const values = kind === 'genre'
      ? [...library.settings.favoriteGenres, ...library.items.flatMap((item) => item.genres)]
      : kind === 'tag'
        ? [...library.settings.favoriteTags, ...library.items.flatMap((item) => item.tags)]
        : library.items.flatMap((item) => item.moodTags)

    return uniqueNormalizedValues(values)
      .map((label) => {
        const key = normalizeKey(label)
        return {
          count: counts.get(key) ?? 0,
          favorite: favoriteKeys.has(key),
          kind,
          label,
        }
      })
      .sort((left, right) => {
        if (left.favorite !== right.favorite) return left.favorite ? -1 : 1
        if (left.count !== right.count) return right.count - left.count
        return left.label.localeCompare(right.label, 'es')
      })
      .slice(0, kind === 'tag' ? 8 : 6)
  }
  const quickSearchSelectionSignalOptionsList = [
    ...quickSearchSelectionSignalOptions('genre'),
    ...quickSearchSelectionSignalOptions('tag'),
    ...quickSearchSelectionSignalOptions('mood'),
  ]
  const quickSearchSelectionLabel = selectedLibraryCount === 1 ? '1 seleccionada' : `${selectedLibraryCount} seleccionadas`
  const quickSearchSelectionDetail = selectedLibraryCount ? `${quickSearchSelectionLabel} / seleccion actual` : 'Sin seleccion activa'
  const quickSearchVisibleSelectionTitle = quickSearchVisibleSelectionSummary.allVisibleItemsSelected
    ? 'Quitar visibles de Biblioteca'
    : 'Seleccionar visibles de Biblioteca'
  const quickSearchVisibleCountLabel =
    quickSearchVisibleSelectionSummary.visibleCount === 1
      ? '1 visible'
      : `${quickSearchVisibleSelectionSummary.visibleCount} visibles`
  const quickSearchVisibleSelectionAdjective =
    quickSearchVisibleSelectionSummary.visibleCount === 1 ? 'seleccionada' : 'seleccionadas'
  const quickSearchVisibleSelectionDetail = quickSearchVisibleSelectionSummary.allVisibleItemsSelected
    ? `${quickSearchVisibleCountLabel} ${quickSearchVisibleSelectionAdjective}`
    : `${quickSearchVisibleSelectionSummary.selectedVisibleCount} de ${quickSearchVisibleCountLabel} ${quickSearchVisibleSelectionAdjective}`
  const quickSearchHasDiceCandidates = quickSearchDiceRollSummary.candidateCount > 0
  const quickSearchDiceCandidateLabel =
    quickSearchDiceRollSummary.candidateCount === 1
      ? '1 candidata disponible'
      : `${quickSearchDiceRollSummary.candidateCount} candidatas disponibles`
  const quickSearchActivityCommands = library.activityEntries.slice(0, 4).map((entry): QuickSearchCommand => {
    const destinationLabel = activityTabLabels[getActivityDestinationTab(entry)]

    return {
      Icon: getActivityIcon(entry.tone),
      detail: `${entry.detail} / ${destinationLabel}`,
      id: `activity-${entry.id}`,
      meta: 'Actividad',
      run: () => openActivityFromPalette(entry),
      searchText: `continuar actividad reciente sesion ${entry.label} ${entry.detail} ${destinationLabel}`,
      title: `Continuar ${entry.label}`,
      tone: 'command',
    }
  })
  const quickSearchCommands: QuickSearchCommand[] = [
    {
      Icon: Plus,
      detail: 'Abrir una ficha privada vacia',
      id: 'new-item',
      meta: 'Accion',
      run: createBlankLibraryDraft,
      searchText: 'anadir entrada nueva ficha crear manual biblioteca',
      title: 'Anadir entrada',
      tone: 'create',
    },
    ...(quickSearchFocusItem && quickSearchFocusAction
      ? [
          {
            Icon: quickSearchFocusAction.Icon,
            detail: `${quickSearchFocusItem.title} / ${getLibraryFocusReason(quickSearchFocusItem)}`,
            id: 'library-primary-action',
            meta: 'Foco',
            run: () => runLibraryPrimaryActionFromPalette(quickSearchFocusItem),
            searchText: `siguiente accion foco continuar completar empezar retomar ${quickSearchFocusItem.title} ${getLibraryFocusReason(
              quickSearchFocusItem,
            )}`,
            title: `${quickSearchFocusAction.label} siguiente accion`,
            tone: 'command' as const,
          },
        ]
      : []),
    ...quickSearchReviewQueues.map((queue, index) => ({
      Icon: getLibraryReviewQueueIcon(queue.id),
      detail: `${queue.label} / ${queue.detail} / ${queue.count} ${queue.count === 1 ? 'pendiente' : 'pendientes'}`,
      id: `library-review-${queue.id}`,
      meta: 'Repaso',
      run: () => startLibraryReviewFromPalette(queue.id),
      searchText: `repaso guiado biblioteca mantenimiento mejorar dado completar ficha cola ${queue.label} ${queue.detail}`,
      title: index === 0 ? 'Iniciar repaso guiado' : `Repaso: ${queue.label}`,
      tone: 'section' as const,
    })),
    ...(quickSearchQueuedCandidate
      ? [
          {
            Icon: typeIcons[quickSearchQueuedCandidate.type],
            detail: `${quickSearchQueuedCandidate.title} / ${sourceLabels[quickSearchQueuedCandidate.source]}`,
            id: 'explorer-next-candidate',
            meta: 'Explorador',
            run: () => openExplorerCandidateFromPalette(quickSearchQueuedCandidate),
            searchText: `siguiente hallazgo revisar cola explorador decidir guardar descartar ${quickSearchQueuedCandidate.title} ${
              sourceLabels[quickSearchQueuedCandidate.source]
            } ${typeLabels[quickSearchQueuedCandidate.type]}`,
            title: 'Revisar siguiente hallazgo',
            tone: 'section' as const,
          },
          {
            Icon: Plus,
            detail: `${quickSearchQueuedCandidate.title} / ${sourceLabels[quickSearchQueuedCandidate.source]}`,
            id: 'explorer-save-next-candidate',
            meta: 'Explorador',
            run: () => saveExplorerCandidateFromPalette(quickSearchQueuedCandidate),
            searchText: `guardar siguiente hallazgo cola explorador biblioteca aceptar ${quickSearchQueuedCandidate.title} ${
              sourceLabels[quickSearchQueuedCandidate.source]
            } ${typeLabels[quickSearchQueuedCandidate.type]}`,
            title: 'Guardar siguiente hallazgo',
            tone: 'command' as const,
          },
          {
            Icon: X,
            detail: `${quickSearchQueuedCandidate.title} / ${sourceLabels[quickSearchQueuedCandidate.source]}`,
            id: 'explorer-dismiss-next-candidate',
            meta: 'Explorador',
            run: () => dismissExplorerCandidateFromPalette(quickSearchQueuedCandidate),
            searchText: `descartar siguiente hallazgo cola explorador quitar rechazar apartar ${quickSearchQueuedCandidate.title} ${
              sourceLabels[quickSearchQueuedCandidate.source]
            } ${typeLabels[quickSearchQueuedCandidate.type]}`,
            title: 'Descartar siguiente hallazgo',
            tone: 'command' as const,
          },
        ]
      : []),
    ...(quickSearchExplorerSaveSource && quickSearchExplorerSaveSourceLabel
      ? [
          {
            Icon: Plus,
            detail: `${quickSearchQueuedSourceCounts[quickSearchExplorerSaveSource]} ${
              quickSearchQueuedSourceCounts[quickSearchExplorerSaveSource] === 1 ? 'hallazgo' : 'hallazgos'
            } / ${quickSearchExplorerSaveSourceLabel}`,
            id: `explorer-save-visible-${quickSearchExplorerSaveSource}`,
            meta: 'Explorador',
            run: () => saveExplorerVisibleQueueFromPalette(quickSearchExplorerSaveSource),
            searchText: `guardar vista explorador cola lote ${quickSearchExplorerSaveSourceLabel} hallazgos fuentes APIs Nexo ideas`,
            title: 'Guardar vista del explorador',
            tone: 'section' as const,
          },
        ]
      : []),
    ...(quickSearchExplorerSaveSource && quickSearchExplorerSaveSourceLabel
      ? [
          {
            Icon: X,
            detail: `${quickSearchQueuedSourceCounts[quickSearchExplorerSaveSource]} ${
              quickSearchQueuedSourceCounts[quickSearchExplorerSaveSource] === 1 ? 'hallazgo' : 'hallazgos'
            } / ${quickSearchExplorerSaveSourceLabel}`,
            id: `explorer-dismiss-visible-${quickSearchExplorerSaveSource}`,
            meta: 'Explorador',
            run: () => dismissExplorerVisibleQueueFromPalette(quickSearchExplorerSaveSource),
            searchText: `descartar vista explorador limpiar cola lote ${quickSearchExplorerSaveSourceLabel} hallazgos fuentes APIs Nexo ideas quitar`,
            title: 'Descartar vista del explorador',
            tone: 'command' as const,
          },
        ]
      : []),
    {
      Icon: Dice5,
      detail: quickSearchHasDiceCandidates ? quickSearchDiceCandidateLabel : 'Sin candidatas con los filtros actuales',
      id: 'roll-dice',
      meta: 'Accion',
      run: quickSearchHasDiceCandidates ? rollDiceFromAction : openDiceFromPalette,
      searchPriority: 12,
      searchText: 'tirar revisar dado recomendar recomendacion azar decision filtros candidatas',
      title: quickSearchHasDiceCandidates ? 'Tirar dado' : 'Revisar dado',
      tone: 'section',
    },
    ...(activeTab === 'dice' && tabsWithUnsavedChanges.dice
      ? [
          {
            Icon: Save,
            detail: 'Preferencias pendientes',
            id: 'dice-save-pending',
            meta: 'Dado',
            run: saveDicePreferencesFromPalette,
            searchText: 'guardar dado ajustes cambios pendientes preferencias filtros sorpresa energia',
            title: 'Guardar ajustes del dado',
            tone: 'command' as const,
          },
        ]
      : []),
    ...(quickSearchCooldownCount
      ? [
          {
            Icon: RotateCcw,
            detail: `${quickSearchCooldownCount} ${quickSearchCooldownCount === 1 ? 'entrada en cooldown' : 'entradas en cooldown'}`,
            id: 'dice-reactivate-cooldowns',
            meta: 'Dado',
            run: reactivateDiceCooldownsFromPalette,
            searchText: 'reactivar cooldowns dado recuperar enfriadas candidatas recomendacion',
            title: 'Reactivar cooldowns del dado',
            tone: 'section' as const,
          },
        ]
      : []),
    {
      Icon: Download,
      detail: 'Descargar copia privada JSON',
      id: 'export-backup',
      meta: 'Backup',
      run: exportQuickBackup,
      searchText: 'exportar backup json copia descargar biblioteca',
      title: 'Exportar backup JSON',
      tone: 'command',
    },
    ...(selectedLibraryCount
      ? [
          {
            Icon: Download,
            detail: `${quickSearchSelectionLabel} / sin ajustes privados`,
            id: 'export-selection',
            meta: 'Backup',
            run: exportLibrarySelectionFromPalette,
            searchText: 'exportar seleccion json backup fichas seleccionadas biblioteca descargar lote',
            title: 'Exportar seleccion JSON',
            tone: 'command' as const,
          },
        ]
      : []),
    {
      Icon: Upload,
      detail: 'Elegir un backup JSON para previsualizarlo',
      id: 'import-backup',
      meta: 'Backup',
      run: importLibraryBackupFromPalette,
      searchText: 'importar backup json restaurar biblioteca archivo copia cargar preview previsualizar',
      title: 'Importar backup JSON',
      tone: 'command',
    },
    ...(activeTab === 'settings' && tabsWithUnsavedChanges.settings
      ? [
          {
            Icon: Save,
            detail: 'Preferencias pendientes',
            id: 'settings-save-pending',
            meta: 'Ajustes',
            run: saveSettingsFromPalette,
            searchText: 'guardar ajustes cambios pendientes preferencias configuracion tema favoritos',
            title: 'Guardar ajustes pendientes',
            tone: 'command' as const,
          },
        ]
      : []),
    {
      Icon: Sparkles,
      detail: 'Buscar algo relacionado con tu biblioteca',
      id: 'explorer-prompt-card',
      meta: 'Explorador',
      run: addExplorerPromptCardFromPalette,
      searchText: 'recomendar desde mi estanteria explorador descubrir buscar parecido biblioteca catalogo',
      title: 'Recomendar desde mi estanteria',
      tone: 'section',
    },
    ...(quickSearchPrivateTaxonomyRepairCount
      ? [
          {
            Icon: Sparkles,
            detail: `${quickSearchPrivateTaxonomyRepairCount} ${
              quickSearchPrivateTaxonomyRepairCount === 1 ? 'ficha reparable' : 'fichas reparables'
            }`,
            id: 'settings-repair-private-taxonomy',
            meta: 'Ajustes',
            run: repairPrivateTaxonomyFromPalette,
            searchText: 'completar reparar taxonomia privada mantenimiento ajustes generos tags plantillas',
            title: 'Completar taxonomia privada',
            tone: 'section' as const,
          },
        ]
      : []),
    ...(quickSearchTasteSuggestionCount
      ? [
          {
            Icon: Sparkles,
            detail: `${quickSearchTasteSuggestionCount} ${
              quickSearchTasteSuggestionCount === 1 ? 'sugerencia pendiente' : 'sugerencias pendientes'
            }`,
            id: 'settings-apply-taste-suggestions',
            meta: 'Ajustes',
            run: applyTasteSuggestionsFromPalette,
            searchText: 'aplicar sugerencias gusto gustos generos tags favoritos preferencias ajustes dado',
            title: 'Aplicar sugerencias de gusto',
            tone: 'section' as const,
          },
        ]
      : []),
    ...(library.activityEntries.length
      ? [
          {
            Icon: Trash2,
            detail: `${library.activityEntries.length} ${
              library.activityEntries.length === 1 ? 'entrada reciente' : 'entradas recientes'
            }`,
            id: 'clear-session-activity',
            meta: 'Actividad',
            run: clearActivityFromPalette,
            searchText: 'limpiar actividad reciente registro sesion borrar historial',
            title: 'Limpiar actividad reciente',
            tone: 'command' as const,
          },
        ]
      : []),
    ...(activityClearUndo.length
      ? [
          {
            Icon: RotateCcw,
            detail: `${activityClearUndo.length} ${
              activityClearUndo.length === 1 ? 'actividad recuperable' : 'actividades recuperables'
            }`,
            id: 'undo-clear-session-activity',
            meta: 'Actividad',
            run: undoClearActivityFromPalette,
            searchText: 'deshacer limpieza actividad reciente recuperar registro sesion',
            title: 'Deshacer limpieza de actividad',
            tone: 'command' as const,
          },
        ]
      : []),
    ...quickSearchActivityCommands,
    ...themeOptions.map((option): QuickSearchCommand => ({
      Icon: Palette,
      detail: option.detail,
      id: `theme-${option.id}`,
      meta: 'Tema',
      run: () => applyThemeFromPalette(option.id),
      searchText: `tema apariencia color paleta ${option.label} ${option.detail} claro oscuro rosa bosque oceano menta aurora`,
      title: `Tema ${option.label}`,
      tone: 'command',
    })),
    {
      Icon: X,
      detail: 'Limpiar filtros, vistas, orden y seleccion',
      id: 'library-reset-view',
      meta: 'Biblioteca',
      run: resetLibraryViewFromPalette,
      searchText: 'biblioteca restablecer vista limpiar filtros orden busqueda seleccion reset todo',
      title: 'Restablecer vista de Biblioteca',
      tone: 'command',
    },
    ...(quickSearchVisibleSelectionSummary.visibleCount
      ? [
          {
            Icon: CheckCircle2,
            detail: `${quickSearchVisibleSelectionDetail} / acciones masivas`,
            id: 'library-toggle-visible-selection',
            meta: 'Biblioteca',
            run: toggleLibraryVisibleSelectionFromPalette,
            searchText: 'biblioteca seleccionar visibles quitar visibles seleccion masiva lote marcar vista filtrada',
            title: quickSearchVisibleSelectionTitle,
            tone: 'command' as const,
          },
        ]
      : []),
    ...(selectedLibraryCount
      ? [
          {
            Icon: X,
            detail: quickSearchSelectionLabel,
            id: 'library-clear-selection',
            meta: 'Biblioteca',
            run: clearLibrarySelectionFromPalette,
            searchText: 'biblioteca limpiar seleccion quitar seleccionadas vaciar seleccion masiva lote',
            title: 'Limpiar seleccion de Biblioteca',
            tone: 'command' as const,
          },
          ...ITEM_STATUSES.map((status): QuickSearchCommand => ({
            Icon: status === 'completed' ? Check : status === 'in_progress' ? Play : status === 'paused' ? Pause : status === 'dropped' ? Trash2 : Library,
            detail: quickSearchSelectionDetail,
            id: `library-selected-status-${status}`,
            meta: 'Biblioteca',
            run: () => applyLibrarySelectedStatusFromPalette(status),
            searchText: `biblioteca seleccion seleccionadas estado masivo cambiar aplicar ${statusLabels[status]} pendientes progreso pausado completado droppeado`,
            title: `Seleccion: ${statusLabels[status]}`,
            tone: 'command',
          })),
          ...libraryPriorityOptions.map((option): QuickSearchCommand => ({
            Icon: Dice5,
            detail: `${quickSearchSelectionLabel} / foco del dado`,
            id: `library-selected-priority-${option.id}`,
            meta: 'Biblioteca',
            run: () => applyLibrarySelectedPriorityFromPalette(option.id),
            searchText: `biblioteca seleccion seleccionadas foco prioridad dado masivo aplicar ${option.label} ${option.detail}`,
            title: `Seleccion: ${option.label}`,
            tone: 'command',
          })),
          ...quickSearchSelectionSignalOptionsList.map((option): QuickSearchCommand => ({
            Icon: Plus,
            detail: `${quickSearchSelectionLabel} / ${option.count} ${option.count === 1 ? 'entrada' : 'entradas'} con senal`,
            id: `library-selected-${option.kind}-${slugify(option.label)}`,
            meta: 'Biblioteca',
            run: () => applyLibrarySelectedSignalsFromPalette('add', option.kind, [option.label]),
            searchText: `biblioteca seleccion seleccionadas ${librarySelectionSignalLabels[option.kind].singular} ${librarySelectionSignalLabels[option.kind].plural} tags etiqueta senal masivo aplicar ${option.label}`,
            title: `Seleccion: ${librarySelectionSignalLabels[option.kind].title} ${option.label}`,
            tone: 'command',
          })),
          ...quickSearchSelectionSignalOptionsList.map((option): QuickSearchCommand => ({
            Icon: X,
            detail: `${quickSearchSelectionLabel} / quitar ${librarySelectionSignalLabels[option.kind].singular}`,
            id: `library-selected-remove-${option.kind}-${slugify(option.label)}`,
            meta: 'Biblioteca',
            run: () => applyLibrarySelectedSignalsFromPalette('remove', option.kind, [option.label]),
            searchText: `biblioteca seleccion seleccionadas quitar eliminar retirar ${librarySelectionSignalLabels[option.kind].singular} ${librarySelectionSignalLabels[option.kind].plural} tags etiqueta senal masivo ${option.label}`,
            title: `Seleccion: quitar ${librarySelectionSignalLabels[option.kind].title} ${option.label}`,
            tone: 'command',
          })),
          {
            Icon: Moon,
            detail: `${quickSearchSelectionLabel} / ${selectedLibraryDiceEligibleCount} candidatas del dado`,
            id: 'library-selected-dice-snooze',
            meta: 'Biblioteca',
            run: () => applyLibrarySelectedDiceActionFromPalette('snooze'),
            searchText: 'biblioteca seleccion seleccionadas enfriar dado cooldown pausar candidatas masivo',
            title: 'Enfriar seleccion del dado',
            tone: 'command' as const,
          },
          {
            Icon: RotateCcw,
            detail: `${quickSearchSelectionLabel} / ${selectedLibraryCooldownCount} cooldowns activos`,
            id: 'library-selected-dice-reactivate',
            meta: 'Biblioteca',
            run: () => applyLibrarySelectedDiceActionFromPalette('reactivate'),
            searchText: 'biblioteca seleccion seleccionadas reactivar dado cooldown recuperar candidatas masivo',
            title: 'Reactivar seleccion del dado',
            tone: 'command' as const,
          },
        ]
      : []),
    ...(Object.keys(librarySortLabels) as LibrarySortMode[]).map((mode): QuickSearchCommand => ({
      Icon: mode === 'focus' ? Sparkles : mode === 'updated' ? Archive : mode === 'title' ? List : mode === 'priority' ? Dice5 : CheckCircle2,
      detail: 'Ordenar biblioteca',
      id: `library-sort-${mode}`,
      meta: 'Biblioteca',
      run: () => applyLibrarySortModeFromPalette(mode),
      searchText: `biblioteca ordenar orden sort ${librarySortLabels[mode]} foco recientes titulo prioridad rating`,
      title: `Orden ${librarySortLabels[mode]}`,
      tone: 'command',
    })),
    ...ITEM_STATUSES.map((status): QuickSearchCommand => ({
      Icon: status === 'completed' ? Check : status === 'in_progress' ? Play : status === 'paused' ? Pause : status === 'dropped' ? Trash2 : Library,
      detail: `${library.items.filter((item) => item.status === status).length} entradas`,
      id: `library-status-${status}`,
      meta: 'Biblioteca',
      run: () => applyLibraryStatusFilterFromPalette(status),
      searchText: `biblioteca filtrar estado status ${statusLabels[status]} pendientes progreso pausado completado droppeado`,
      title: `Estado ${statusLabels[status]}`,
      tone: 'command',
    })),
    ...ITEM_TYPES.map((type): QuickSearchCommand => ({
      Icon: typeIcons[type],
      detail: `${library.items.filter((item) => item.type === type).length} entradas`,
      id: `library-type-${type}`,
      meta: 'Biblioteca',
      run: () => applyLibraryTypeFilterFromPalette(type),
      searchText: `biblioteca filtrar tipo medio ${typeLabels[type]} juegos libros cine series anime manga manhwa comic`,
      title: `Tipo ${typeLabels[type]}`,
      tone: 'command',
    })),
    ...getLibrarySmartViewOptions(library.items)
      .filter((option) => option.id !== 'all')
      .map((option): QuickSearchCommand => ({
        Icon: option.id === 'dice-ready' ? Dice5 : option.id === 'cooldown' ? Pause : option.id === 'nexo' ? Sparkles : Search,
        detail: `${option.count} entradas / ${option.detail}`,
        id: `library-view-${option.id}`,
        meta: 'Vista',
        run: () => openLibrarySmartViewFromPalette(option.id),
        searchText: `${option.label} ${option.detail} vista biblioteca cola filtro dado taxonomia contexto cooldown catalogo`,
        title: `Vista ${option.label}`,
        tone: 'section',
      })),
  ]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand-lockup">
            <NexoMark />
            <div className="brand-copy">
              <span className="brand-line">
                <span className="brand-wordmark">Nexo</span>
              </span>
              <h1>{shellTitle}</h1>
              <p className="topbar-subtitle">{activeNavItem.description}</p>
            </div>
          </div>
          <ShellPulse library={library} isFirebaseConfigured={auth.isFirebaseConfigured} />
        </div>
        <div className="topbar-actions">
          {isOffline && (
            <span aria-label="Sin conexion" className="mode-pill offline" role="status">
              Sin conexion
            </span>
          )}
          {installPrompt && (
            <button
              aria-label="Instalar Nexo"
              className="app-update-button app-install-button"
              type="button"
              onClick={() => void promptInstallPwa()}
            >
              <Download size={16} />
              <span>Instalar</span>
            </button>
          )}
          {serviceWorkerUpdateReady && (
            <button
              aria-label="Actualizar Nexo"
              className="app-update-button"
              type="button"
              onClick={() => {
                setServiceWorkerUpdateReady(false)
                applyServiceWorkerUpdate()
              }}
            >
              <RotateCcw size={16} />
              <span>Actualizar</span>
            </button>
          )}
          <button
            aria-label="Busqueda rapida"
            aria-keyshortcuts="/ Control+K Meta+K"
            className="icon-button"
            type="button"
            onClick={() => {
              setQuickSearchOpen(true)
            }}
            title="Busqueda rapida"
          >
            <Search size={18} />
          </button>
          {auth.user && (
            <button className="icon-button" type="button" onClick={auth.signOut} title="Salir">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      <nav className="tabbar" aria-label="Secciones de Nexo">
        {visibleNavItems
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
                <span className="tab-label" data-short-label={item.shortLabel ?? item.displayLabel ?? item.label}>
                  <span>{item.displayLabel ?? item.label}</span>
                </span>
              </button>
            )
          })}
      </nav>

      {quickSearchOpen && (
        <QuickSearchDialog
          commands={quickSearchCommands}
          candidates={library.discoveryCandidates}
          items={library.items}
          navItems={visibleNavItems}
          onClose={() => setQuickSearchOpen(false)}
          onCreateItem={createLibraryDraftFromTitle}
          onExploreQuery={openExplorerSearchFromPalette}
          onOpenCandidate={openExplorerCandidateFromPalette}
          onOpenItem={(item) => {
            setQuickSearchOpen(false)
            changeActiveTab('library', { kind: 'item', id: item.id })
          }}
          onOpenTab={(tab) => {
            setQuickSearchOpen(false)
            changeActiveTab(tab)
          }}
        />
      )}

      <section className="tab-stage">
        {pendingNavigation && pendingNavItem && (
          <NavigationDiscardPrompt
            currentLabel={activeNavItem.label}
            nextLabel={pendingNavItem.label}
            onDiscard={discardPendingNavigation}
            onKeepEditing={() => setPendingNavigation(undefined)}
          />
        )}
        {activeTab === 'library' && (
          <LibraryTab
            activityFocusItemId={activityFocus?.kind === 'item' ? activityFocus.id : undefined}
            draftRequest={libraryDraftRequest}
            importRequest={libraryImportRequest}
            library={library}
            primaryActionRequest={libraryPrimaryActionRequest}
            resetViewRequest={libraryResetViewRequest}
            reviewRequest={libraryReviewRequest}
            selectedDiceActionRequest={librarySelectedDiceActionRequest}
            selectedExportRequest={librarySelectedExportRequest}
            selectedPriorityRequest={librarySelectedPriorityRequest}
            selectedStatusRequest={librarySelectedStatusRequest}
            selectedSignalsRequest={librarySelectedSignalsRequest}
            selectedItemIds={selectedLibraryItemIds}
            sortModeRequest={librarySortModeRequest}
            statusFilterRequest={libraryStatusFilterRequest}
            smartViewRequest={librarySmartViewRequest}
            typeFilterRequest={libraryTypeFilterRequest}
            visibleSelectionRequest={libraryVisibleSelectionRequest}
            onActivity={recordVisibleActivity}
            onActivityFocusHandled={clearActivityFocus}
            onImportRequestHandled={clearLibraryImportRequest}
            onPrimaryActionRequestHandled={clearLibraryPrimaryActionRequest}
            onReviewRequestHandled={clearLibraryReviewRequest}
            onVisibleSelectionSummaryChange={setLibraryVisibleSelectionSummary}
            onDraftRequestHandled={clearLibraryDraftRequest}
            onNavigate={changeActiveTab}
            onRollDice={rollDiceFromAction}
            setSelectedItemIds={setSelectedLibraryItemIds}
            setTheme={setTheme}
          />
        )}
        {activeTab === 'dice' && (
          <DiceTab
            library={library}
            cooldownReactivateRequest={diceCooldownReactivateRequest}
            saveRequest={dicePreferencesSaveRequest}
            rollRequest={diceRollRequest}
            onActivity={recordVisibleActivity}
            onCooldownReactivateRequestHandled={clearDiceCooldownReactivateRequest}
            onSaveRequestHandled={clearDicePreferencesSaveRequest}
            onRollRequestHandled={clearDiceRollRequest}
            onRollSummaryChange={setDiceRollSummary}
            onUnsavedChange={reportDiceUnsavedChanges}
          />
        )}
        {activeTab === 'explorer' && (
          <ExplorerTab
            library={library}
            candidateDismissRequest={explorerCandidateDismissRequest}
            candidateRequest={explorerCandidateRequest}
            candidateSaveRequest={explorerCandidateSaveRequest}
            promptCardRequest={explorerPromptCardRequest}
            searchRequest={explorerSearchRequest}
            visibleDismissRequest={explorerVisibleDismissRequest}
            visibleSaveRequest={explorerVisibleSaveRequest}
            onActivity={recordVisibleActivity}
            onCandidateDismissRequestHandled={clearExplorerCandidateDismissRequest}
            onCandidateRequestHandled={clearExplorerCandidateRequest}
            onCandidateSaveRequestHandled={clearExplorerCandidateSaveRequest}
            onPromptCardRequestHandled={clearExplorerPromptCardRequest}
            onSearchRequestHandled={clearExplorerSearchRequest}
            onVisibleDismissRequestHandled={clearExplorerVisibleDismissRequest}
            onVisibleSaveRequestHandled={clearExplorerVisibleSaveRequest}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            library={library}
            saveRequest={settingsSaveRequest}
            tasteSuggestionsRequest={settingsTasteSuggestionsRequest}
            taxonomyRepairRequest={settingsTaxonomyRepairRequest}
            onActivity={recordVisibleActivity}
            onNavigate={changeActiveTab}
            onRollDice={rollDiceFromAction}
            onSaveRequestHandled={clearSettingsSaveRequest}
            onTasteSuggestionsRequestHandled={clearSettingsTasteSuggestionsRequest}
            onTaxonomyRepairRequestHandled={clearSettingsTaxonomyRepairRequest}
            onUnsavedChange={reportSettingsUnsavedChanges}
            setTheme={setTheme}
            theme={theme}
            user={auth.user}
          />
        )}
        {activeTab === 'curation' && library.isModerator && (
          <CurationTab library={library} onActivity={recordVisibleActivity} />
        )}
        <SessionActivityPanel
          entries={library.activityEntries.slice(0, sessionActivityLimit)}
          clearedCount={activityClearUndo.length}
          onClear={() => void clearSessionActivity()}
          onUndoClear={() => void undoClearSessionActivity()}
          onSelect={(entry) => changeActiveTab(getActivityDestinationTab(entry), getActivityFocus(entry))}
        />
      </section>
    </main>
  )
}

function QuickSearchDialog({
  commands,
  candidates,
  items,
  navItems,
  onClose,
  onCreateItem,
  onExploreQuery,
  onOpenCandidate,
  onOpenItem,
  onOpenTab,
}: {
  commands: QuickSearchCommand[]
  candidates: DiscoveryCandidate[]
  items: ListItem[]
  navItems: ShellNavItem[]
  onClose: () => void
  onCreateItem: (title: string) => void
  onExploreQuery: (query: string) => void
  onOpenCandidate: (candidate: DiscoveryCandidate) => void
  onOpenItem: (item: ListItem) => void
  onOpenTab: (tab: AppTab) => void
}) {
  useRestoreFocusOnUnmount()

  const [query, setQuery] = useState('')
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const trimmedQuery = query.trim()
  const normalizedQuery = normalizeKey(query)
  const focusItems = useMemo(() => getLibraryFocusItems(items), [items])
  const results = useMemo(() => {
    const commandEntries: QuickSearchCommandEntry[] = commands.map((command) => ({
      Icon: command.Icon,
      command,
      detail: command.detail,
      id: `command-${command.id}`,
      kind: 'command',
      meta: command.meta,
      title: command.title,
      tone: command.tone,
    }))
    const navigationEntries: QuickSearchEntry[] = navItems.map((item) => ({
      Icon: item.icon,
      detail: item.description,
      id: `tab-${item.id}`,
      kind: 'tab',
      meta: 'Seccion',
      tab: item.id,
      title: item.label,
      tone: 'section',
    }))

    if (!normalizedQuery) {
      return [
        ...commandEntries,
        ...navigationEntries,
        ...focusItems.slice(0, 5).map((item): QuickSearchEntry => ({
          Icon: typeIcons[item.type],
          detail: getItemSubtitle(item),
          id: `item-${item.id}`,
          item,
          kind: 'item',
          meta: statusLabels[item.status],
          title: item.title,
          tone: item.type,
        })),
      ]
    }

    const tokens = normalizedQuery.split(' ').filter(Boolean)
    const exactItemMatch = items.some((item) => normalizeKey(item.title) === normalizedQuery)
    const explicitExplorerMatch = trimmedQuery.match(/^(explorar|explorador|buscar)\s+(.+)/i)
    const explorerQuery = (explicitExplorerMatch?.[2] ?? trimmedQuery).trim()
    const scoredCandidateEntries = candidates
      .map((candidate, index): ScoredQuickSearchEntry | undefined => {
        const titleKey = normalizeKey(candidate.title)
        const sourceLabel = sourceLabels[candidate.source]
        const statusLabel = discoveryStatusLabels[candidate.status]
        const textKey = normalizeKey(
          [
            candidate.title,
            typeLabels[candidate.type],
            statusLabel,
            sourceLabel,
            candidate.overview,
            ...candidate.genres,
            ...candidate.tags,
            ...candidate.moodTags,
          ].join(' '),
        )
        if (!tokens.every((token) => textKey.includes(token))) return undefined

        return {
          entry: {
            Icon: typeIcons[candidate.type],
            candidate,
            detail: candidate.overview || `${sourceLabel} / ${typeLabels[candidate.type]}`,
            id: `candidate-${candidate.id}`,
            kind: 'candidate',
            meta: `${statusLabel} / ${sourceLabel}`,
            title: candidate.title,
            tone: candidate.type,
          },
          index,
          score:
            35 +
            (titleKey === normalizedQuery ? 55 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 32 : 0) +
            (titleKey.includes(normalizedQuery) ? 18 : 0) +
            (candidate.status === 'queued' ? 8 : 0) +
            (candidate.status === 'saved' ? 3 : 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))
    const scoredCommandEntries = commandEntries
      .map((entry, index): ScoredQuickSearchEntry | undefined => {
        const commandSearchKey = normalizeKey(entry.command.searchText)
        const textKey = normalizeKey(`${entry.title} ${entry.detail} ${entry.meta} ${entry.command.searchText}`)
        const titleKey = normalizeKey(entry.title)
        if (!tokens.every((token) => textKey.includes(token))) return undefined

        return {
          entry,
          index,
          score:
            32 +
            (titleKey === normalizedQuery ? 60 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 34 : 0) +
            (titleKey.includes(normalizedQuery) ? 18 : 0) +
            (tokens.every((token) => commandSearchKey.split(' ').includes(token)) ? 8 : 0) +
            (normalizedQuery ? (entry.command.searchPriority ?? 0) : 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))
    const createEntry: ScoredQuickSearchEntry[] =
      trimmedQuery && !exactItemMatch && !explicitExplorerMatch
        ? [
            {
              entry: {
                Icon: Plus,
                detail: 'Nueva ficha privada',
                id: `create-${slugify(trimmedQuery) || 'entrada'}`,
                kind: 'create',
                meta: 'Crear',
                query: trimmedQuery,
                title: `Crear entrada "${trimmedQuery}"`,
                tone: 'create',
              },
              index: -1,
              score: 25,
            },
          ]
        : []
    const exploreEntry: ScoredQuickSearchEntry[] =
      explorerQuery.length >= 2
        ? [
            {
              entry: {
                Icon: Sparkles,
                detail: 'Buscar en Nexo y APIs publicas',
                id: `explore-${slugify(explorerQuery) || 'busqueda'}`,
                kind: 'explore',
                meta: 'Explorador',
                query: explorerQuery,
                title: `Explorar "${explorerQuery}"`,
                tone: 'section',
              },
              index: -2,
              score: explicitExplorerMatch ? 48 : 23,
            },
          ]
        : []
    const scoredNavigationEntries = navigationEntries
      .map((entry, index): ScoredQuickSearchEntry | undefined => {
        const titleKey = normalizeKey(entry.title)
        const textKey = normalizeKey(`${entry.title} ${entry.detail} ${entry.meta}`)
        if (!tokens.every((token) => textKey.includes(token))) return undefined

        return {
          entry,
          index,
          score:
            20 +
            (titleKey === normalizedQuery ? 60 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 34 : 0) +
            (titleKey.includes(normalizedQuery) ? 16 : 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))

    const scoredItemEntries = items
      .map((item, index): ScoredQuickSearchEntry | undefined => {
        const titleKey = normalizeKey(item.title)
        const textKey = normalizeKey(
          [
            item.title,
            typeLabels[item.type],
            statusLabels[item.status],
            getItemSubtitle(item),
            ...item.genres,
            ...item.tags,
            ...item.moodTags,
          ].join(' '),
        )
        if (!tokens.every((token) => textKey.includes(token))) return undefined

        return {
          entry: {
            Icon: typeIcons[item.type],
            detail: getItemSubtitle(item),
            id: `item-${item.id}`,
            item,
            kind: 'item',
            meta: statusLabels[item.status],
            title: item.title,
            tone: item.type,
          },
          index,
          score:
            (titleKey === normalizedQuery ? 50 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 30 : 0) +
            (titleKey.includes(normalizedQuery) ? 15 : 0) +
            (item.status === 'in_progress' ? 8 : 0) +
            (item.status === 'wishlist' ? 4 : 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))

    return [
      ...scoredCommandEntries,
      ...scoredCandidateEntries,
      ...createEntry,
      ...exploreEntry,
      ...scoredNavigationEntries,
      ...scoredItemEntries,
    ]
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title) || a.index - b.index)
      .slice(0, 8)
      .map((result) => result.entry)
  }, [candidates, commands, focusItems, items, navItems, normalizedQuery, trimmedQuery])
  const resultLabel = normalizedQuery ? 'Resultados' : 'Acciones, secciones y foco'
  const resultTotal = commands.length + candidates.length + items.length + navItems.length
  const activeEntry = results[Math.min(activeResultIndex, Math.max(results.length - 1, 0))]

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery)
    setActiveResultIndex(0)
  }

  function openActiveResult() {
    if (activeEntry?.kind === 'command') activeEntry.command.run()
    if (activeEntry?.kind === 'create') onCreateItem(activeEntry.query)
    if (activeEntry?.kind === 'explore') onExploreQuery(activeEntry.query)
    if (activeEntry?.kind === 'candidate') onOpenCandidate(activeEntry.candidate)
    if (activeEntry?.kind === 'item') onOpenItem(activeEntry.item)
    if (activeEntry?.kind === 'tab') onOpenTab(activeEntry.tab)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      setActiveResultIndex((current) => (current + 1) % results.length)
      return
    }
    if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      setActiveResultIndex((current) => (current - 1 + results.length) % results.length)
      return
    }
    if (event.key === 'Enter' && activeEntry) {
      event.preventDefault()
      openActiveResult()
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="quick-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-search-title"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Busqueda rapida</span>
            <h2 id="quick-search-title">Abrir en Nexo</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <label className="quick-search-field">
          <Search size={18} />
          <span className="sr-only">Buscar en Nexo</span>
          <input
            aria-label="Buscar en Nexo"
            aria-activedescendant={activeEntry ? `quick-search-result-${activeEntry.id}` : undefined}
            aria-controls="quick-search-results"
            autoFocus
            placeholder="Buscar ficha o seccion"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </label>

        <div className="quick-search-section-heading">
          <strong>{resultLabel}</strong>
          <span>
            {results.length} de {resultTotal}
          </span>
        </div>

        {results.length ? (
          <ul className="quick-search-results" id="quick-search-results" aria-label={resultLabel}>
            {results.map((entry, index) => {
              const Icon = entry.Icon
              const isActive = entry.id === activeEntry?.id

              return (
                <li key={entry.id}>
                  <button
                    className={isActive ? 'quick-search-result active' : 'quick-search-result'}
                    id={`quick-search-result-${entry.id}`}
                    type="button"
                    aria-label={
                      entry.kind === 'command'
                        ? `Ejecutar ${entry.title}`
                        : entry.kind === 'create'
                          ? `Crear entrada ${entry.query}`
                          : entry.kind === 'explore'
                            ? `Explorar ${entry.query}`
                            : entry.kind === 'candidate'
                              ? `Abrir hallazgo ${entry.title}`
                              : `Abrir ${entry.title}`
                    }
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => {
                      if (entry.kind === 'command') entry.command.run()
                      if (entry.kind === 'create') onCreateItem(entry.query)
                      if (entry.kind === 'explore') onExploreQuery(entry.query)
                      if (entry.kind === 'candidate') onOpenCandidate(entry.candidate)
                      if (entry.kind === 'item') onOpenItem(entry.item)
                      if (entry.kind === 'tab') onOpenTab(entry.tab)
                    }}
                    onPointerMove={() => setActiveResultIndex(index)}
                  >
                    <span className={`quick-search-type ${entry.tone}`} aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{entry.title}</strong>
                      <small>{entry.detail}</small>
                    </span>
                    <em>{entry.meta}</em>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="quick-search-empty">
            <Search size={20} />
            <span>Sin resultados</span>
          </div>
        )}
      </section>
    </div>
  )
}

function SessionActivityPanel({
  clearedCount,
  entries,
  onClear,
  onUndoClear,
  onSelect,
}: {
  clearedCount: number
  entries: ActivityEntry[]
  onClear: () => void
  onUndoClear: () => void
  onSelect: (entry: ActivityEntry) => void
}) {
  if (!entries.length && !clearedCount) return null
  const continuity = getActivityContinuitySummary(entries)
  const primaryDestination = continuity ? activityTabLabels[getActivityDestinationTab(continuity.primaryEntry)] : undefined

  return (
    <section className="session-activity-panel" aria-label="Actividad reciente" data-testid="session-activity">
      <div className="session-activity-heading">
        <div>
          <span className="eyebrow">Registro de sesion</span>
          <strong>Actividad reciente</strong>
        </div>
        <div className="session-activity-actions">
          <span>{entries.length === 1 ? '1 ultima' : `${entries.length} ultimas`}</span>
          {entries.length > 0 && (
            <button className="ghost-button" type="button" onClick={onClear}>
              Limpiar
            </button>
          )}
        </div>
      </div>
      {clearedCount > 0 && (
        <div className="feedback-action-row" aria-label="Accion reciente de actividad">
          <FeedbackMessage tone="success">
            {clearedCount === 1 ? 'Actividad limpiada' : `${clearedCount} actividades limpiadas`}
          </FeedbackMessage>
          <button className="secondary-button" type="button" onClick={onUndoClear}>
            <RotateCcw size={16} />
            Deshacer limpieza
          </button>
        </div>
      )}
      {continuity && primaryDestination && (
        <div className="session-continuity-card" data-testid="session-continuity">
          <div className="session-continuity-main">
            <span className="eyebrow">Continuar sesion</span>
            <strong>{continuity.primaryEntry.label}</strong>
            <small className="session-continuity-destination">{primaryDestination}</small>
            <p>{continuity.primaryEntry.detail}</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            aria-label={`Continuar desde ${continuity.primaryEntry.label} en ${primaryDestination}`}
            onClick={() => onSelect(continuity.primaryEntry)}
          >
            Abrir
          </button>
          <div className="session-continuity-groups" aria-label="Actividad por zona">
            {continuity.groups.map((group) => {
              const label = activityTabLabels[group.tab]

              return (
                <button
                  aria-label={`Abrir ultima actividad de ${label}`}
                  key={group.tab}
                  type="button"
                  onClick={() => onSelect(group.entry)}
                >
                  <span>{label}</span>
                  <strong>{group.count}</strong>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {entries.length > 0 && (
        <ol className="session-activity-list">
          {entries.map((entry) => {
            const Icon = getActivityIcon(entry.tone)
            const tabLabel = activityTabLabels[entry.tab]
            const destinationLabel = activityTabLabels[getActivityDestinationTab(entry)]

            return (
              <li key={entry.id}>
                <button
                  aria-label={`Abrir ${entry.label} en ${destinationLabel}`}
                  className={`session-activity-item ${entry.tone}`}
                  type="button"
                  onClick={() => onSelect(entry)}
                >
                  <Icon size={16} />
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{entry.detail}</small>
                  </span>
                  <em>{tabLabel}</em>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function getActivityFocus(entry: ActivityEntry): ActivityFocus | undefined {
  return entry.target?.kind === 'item' ? entry.target : undefined
}

function getActivityIcon(tone: FeedbackTone) {
  if (tone === 'danger') return AlertTriangle
  if (tone === 'loading') return LoaderCircle
  if (tone === 'success') return CheckCircle2
  return Info
}

function NexoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'nexo-mark compact' : 'nexo-mark'} aria-hidden="true">
      <span className="nexo-mark-letter">N</span>
      <span className="nexo-mark-node one" />
      <span className="nexo-mark-node two" />
      <span className="nexo-mark-node three" />
    </span>
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
  const [libraryPulse, dicePulse, explorerPulse] = pulseItems
  const pulseSummary = pulseItems.map((item) => `${item.label} ${item.value} ${item.detail}`).join(' / ')

  return (
    <div className="topbar-pulse sr-only" aria-label={`Pulso de Nexo: ${pulseSummary}`} data-testid="shell-pulse">
      <span className={`pulse-summary ${libraryPulse.tone}`}>
        <libraryPulse.Icon size={15} />
        <strong>{libraryPulse.value}</strong>
        <span>obras</span>
      </span>
      <span className="pulse-mini-strip" aria-hidden="true">
        {[libraryPulse, dicePulse, explorerPulse].map(({ Icon, label, tone, value }) => (
          <span className={`pulse-dot ${tone}`} key={label} title={`${label}: ${value}`}>
            <Icon size={13} />
          </span>
        ))}
      </span>
      <span className="sr-only">{pulseSummary}</span>
    </div>
  )
}

function NavigationDiscardPrompt({
  currentLabel,
  nextLabel,
  onDiscard,
  onKeepEditing,
}: {
  currentLabel: string
  nextLabel: string
  onDiscard: () => void
  onKeepEditing: () => void
}) {
  return (
    <div className="navigation-discard-warning" role="alert" aria-label="Salida con cambios pendientes">
      <div>
        <strong>Cambios pendientes en {currentLabel}</strong>
        <span>Guarda antes de ir a {nextLabel} o descarta el borrador de esta seccion.</span>
      </div>
      <div className="action-row end">
        <button className="ghost-button" type="button" onClick={onKeepEditing}>
          Seguir editando
        </button>
        <button className="danger-button" type="button" onClick={onDiscard}>
          Descartar cambios
        </button>
      </div>
    </div>
  )
}

interface LibrarySurface {
  items: ListItem[]
  settings: UserSettings
  discoveryCandidates: DiscoveryCandidate[]
  activityEntries: ActivityEntry[]
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
  reactivateRecommendation: (id: string) => Promise<void>
  setRecommendationCooldown: (id: string, cooldownUntil?: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
  listPublicCatalog: () => Promise<PublicCatalogItem[]>
  searchPublicCatalog: (query: string, type?: string) => Promise<PublicCatalogItem[]>
  saveSettings: (settings: Partial<UserSettings>) => Promise<void>
  queueDiscoveryCandidates: (candidates: DiscoveryCandidate[]) => Promise<number>
  dismissDiscoveryCandidate: (candidateId: string) => Promise<void>
  restoreDiscoveryCandidate: (candidateId: string) => Promise<void>
  saveDiscoveryToLibrary: (candidate: DiscoveryCandidate, options?: { persistDiscoveryCandidate?: boolean }) => Promise<ListItem>
  upsertPublicItem: (item: Partial<PublicCatalogItem> & Pick<PublicCatalogItem, 'title' | 'type'>) => Promise<PublicCatalogItem>
  replacePublicItem: (item: PublicCatalogItem) => Promise<PublicCatalogItem>
  archivePublicItem: (id: string) => Promise<void>
  restorePublicItem: (id: string) => Promise<void>
  updateUserRole: (targetUserId: string, role: UserRole) => Promise<void>
  recordActivity: ActivityRecorder
  clearActivityEntries: () => Promise<void>
  restoreActivityEntries: (entries: ActivityEntry[]) => Promise<void>
  publicItemToDiscovery: (item: PublicCatalogItem) => DiscoveryCandidate
  externalCandidateToDiscovery: (candidate: ExternalCandidate) => DiscoveryCandidate
}

interface PendingBackupImport {
  fileName: string
  payload: ParsedLibraryImport
  summary: LibraryImportSummary
}

type DiceUndoAction =
  | { kind: 'status'; itemId: string; previousStatus: ItemStatus; title: string }
  | { kind: 'snooze'; recommendation: RecommendationResult; title: string }
  | { kind: 'cooldowns'; items: ListItem[] }
interface DiceDecisionSummary {
  detail: string
  itemId: string
  kind: 'started' | 'snoozed'
  title: string
}
type DiceSettingsUndo = {
  allowPausedByDefault: boolean
  favoriteGenres: string[]
  favoriteTags: string[]
  kind: 'preferences' | 'taste'
  preferences: RecommendationPreferences
  surprisePercent: number
}
type LibraryStatusUndo =
  | { id: string; kind: 'single'; previousStatus: ItemStatus; title: string }
  | { changes: Array<{ id: string; previousStatus: ItemStatus; title: string }>; kind: 'bulk' }
interface LibraryCooldownUndo {
  changes: Array<{ id: string; previousCooldownUntil?: string; title: string }>
}

interface LibraryPriorityUndo {
  changes: Array<{ id: string; previousPriority: number; title: string }>
}

interface LibraryTagUndo {
  changes: Array<{ id: string; previousValues: string[]; title: string }>
  kind: LibrarySelectionSignalKind
  values: string[]
}

type DeletedLibraryUndoKind = 'all' | 'selection'

interface ActiveLibraryReviewSession {
  detail: string
  id: LibrarySmartView
  label: string
}

interface CompletedExplorerQueue {
  actionLabel: string
  detail: string
  nextView: DiscoveryStatus
  sourceLabel: string
  title: string
}

interface PendingCatalogSeedImport {
  fileName: string
  result: PublicCatalogSeedResult
  summary: PublicCatalogSeedSummary
}

function LibraryTab({
  activityFocusItemId,
  draftRequest,
  importRequest,
  library,
  primaryActionRequest,
  resetViewRequest,
  reviewRequest,
  selectedDiceActionRequest,
  selectedExportRequest,
  selectedPriorityRequest,
  selectedStatusRequest,
  selectedSignalsRequest,
  selectedItemIds,
  sortModeRequest,
  statusFilterRequest,
  smartViewRequest,
  typeFilterRequest,
  visibleSelectionRequest,
  onActivity,
  onActivityFocusHandled,
  onImportRequestHandled,
  onPrimaryActionRequestHandled,
  onReviewRequestHandled,
  onVisibleSelectionSummaryChange,
  onDraftRequestHandled,
  onNavigate,
  onRollDice,
  setSelectedItemIds,
  setTheme,
}: {
  activityFocusItemId?: string
  draftRequest?: ListItem
  importRequest?: LibraryImportRequest
  library: LibrarySurface
  primaryActionRequest?: LibraryPrimaryActionRequest
  resetViewRequest?: LibraryResetViewRequest
  reviewRequest?: LibraryReviewRequest
  selectedDiceActionRequest?: LibrarySelectedDiceActionRequest
  selectedExportRequest?: LibrarySelectedExportRequest
  selectedPriorityRequest?: LibrarySelectedPriorityRequest
  selectedStatusRequest?: LibrarySelectedStatusRequest
  selectedSignalsRequest?: LibrarySelectedSignalsRequest
  selectedItemIds: string[]
  sortModeRequest?: LibrarySortModeRequest
  statusFilterRequest?: LibraryStatusFilterRequest
  smartViewRequest?: LibrarySmartViewRequest
  typeFilterRequest?: LibraryTypeFilterRequest
  visibleSelectionRequest?: LibraryVisibleSelectionRequest
  onActivity: ActivityRecorder
  onActivityFocusHandled: () => void
  onImportRequestHandled: () => void
  onPrimaryActionRequestHandled: () => void
  onReviewRequestHandled: () => void
  onVisibleSelectionSummaryChange: (summary: LibraryVisibleSelectionSummary) => void
  onDraftRequestHandled: () => void
  onNavigate: (tab: AppTab, focus?: ActivityFocus) => void
  onRollDice: () => void
  setSelectedItemIds: Dispatch<SetStateAction<string[]>>
  setTheme: (theme: ThemeMode) => void
}) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [smartView, setSmartView] = useState<LibrarySmartView>('all')
  const [sortMode, setSortMode] = useState<LibrarySortMode>('focus')
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const [handledDraftRequestId, setHandledDraftRequestId] = useState<string | undefined>()
  const handledResetViewRequestId = useRef<number | undefined>(undefined)
  const handledSelectedDiceActionRequestId = useRef<number | undefined>(undefined)
  const handledSelectedExportRequestId = useRef<number | undefined>(undefined)
  const handledSelectedPriorityRequestId = useRef<number | undefined>(undefined)
  const handledSelectedStatusRequestId = useRef<number | undefined>(undefined)
  const handledSelectedSignalsRequestId = useRef<number | undefined>(undefined)
  const handledSortModeRequestId = useRef<number | undefined>(undefined)
  const handledStatusFilterRequestId = useRef<number | undefined>(undefined)
  const [handledSmartViewRequestId, setHandledSmartViewRequestId] = useState<number | undefined>()
  const handledTypeFilterRequestId = useRef<number | undefined>(undefined)
  const handledVisibleSelectionRequestId = useRef<number | undefined>(undefined)
  const handledImportRequestId = useRef<number | undefined>(undefined)
  const handledReviewRequestId = useRef<number | undefined>(undefined)
  const libraryImportInputRef = useRef<HTMLInputElement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ListItem | undefined>()
  const [deletedItemUndo, setDeletedItemUndo] = useState<ListItem | undefined>()
  const [deletedLibraryUndo, setDeletedLibraryUndo] = useState<ListItem[]>([])
  const [deletedLibraryUndoKind, setDeletedLibraryUndoKind] = useState<DeletedLibraryUndoKind | undefined>()
  const [statusUndo, setStatusUndo] = useState<LibraryStatusUndo | undefined>()
  const [cooldownUndo, setCooldownUndo] = useState<LibraryCooldownUndo | undefined>()
  const [priorityUndo, setPriorityUndo] = useState<LibraryPriorityUndo | undefined>()
  const [tagUndo, setTagUndo] = useState<LibraryTagUndo | undefined>()
  const [pendingLibraryImport, setPendingLibraryImport] = useState<PendingBackupImport | undefined>()
  const [applyLibraryImportSettings, setApplyLibraryImportSettings] = useState(false)
  const [libraryImportUndo, setLibraryImportUndo] = useState<LibraryImportRollbackPlan | undefined>()
  const [libraryLinkCopy, setLibraryLinkCopy] = useState<{ title: string; url: string } | undefined>()
  const [importStatus, setImportStatus] = useState<string | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [selectedDeleteDialogOpen, setSelectedDeleteDialogOpen] = useState(false)
  const [selectedDeleteConfirmText, setSelectedDeleteConfirmText] = useState('')
  const [bulkStatus, setBulkStatus] = useState<ItemStatus>('completed')
  const [bulkPriorityLevel, setBulkPriorityLevel] = useState<LibraryPriorityLevel>('high')
  const [bulkSignalKind, setBulkSignalKind] = useState<LibrarySelectionSignalKind>('tag')
  const [bulkSignalText, setBulkSignalText] = useState('')
  const [activeReviewSession, setActiveReviewSession] = useState<ActiveLibraryReviewSession | undefined>()
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogType, setCatalogType] = useState<ExplorerSearchType>('any')
  const [catalogCandidates, setCatalogCandidates] = useState<DiscoveryCandidate[]>([])
  const [catalogResultsPage, setCatalogResultsPage] = useState(1)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogStatus, setCatalogStatus] = useState<string | undefined>()
  const [sourceCreditsOpen, setSourceCreditsOpen] = useState(false)
  const [libraryAdvancedOpen, setLibraryAdvancedOpen] = useState(false)
  const libraryAdvancedRef = useRef<HTMLDetailsElement>(null)
  const libraryCardsPerRow = library.settings.libraryCardsPerRow
  const libraryGridStyle = { '--library-cards-per-row': String(libraryCardsPerRow) } as CSSProperties
  const handledPrimaryActionRequestId = useRef<number | undefined>(undefined)
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
  const mastheadItems = (focusItems.length > 0 ? focusItems : library.items).slice(0, 4)
  const showFocusShelf = !hasActiveLibraryFilters && secondaryFocusItems.length > 0

  const filteredItems = useMemo(() => {
    const matchingItems = library.items
      .filter((item) => {
        const text = `${item.title} ${item.tags.join(' ')} ${item.genres.join(' ')} ${item.moodTags.join(' ')}`.toLowerCase()
        return text.includes(query.toLowerCase())
      })
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => matchesLibrarySmartView(item, smartView))

    return sortLibraryItems(matchingItems, sortMode)
  }, [library.items, query, smartView, sortMode, statusFilter, typeFilter])

  async function changeLibraryCardsPerRow(nextCardsPerRow: LibraryCardsPerRow) {
    if (nextCardsPerRow === libraryCardsPerRow) return

    try {
      await library.saveSettings({ libraryCardsPerRow: nextCardsPerRow })
      setImportStatus(`Biblioteca ajustada a ${nextCardsPerRow} tarjetas por fila`)
      onActivity({
        detail: `${nextCardsPerRow} por fila`,
        label: 'Densidad ajustada',
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo guardar la densidad de Biblioteca.')
    }
  }
  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const selectedItems = useMemo(
    () => library.items.filter((item) => selectedItemIdSet.has(item.id)),
    [library.items, selectedItemIdSet],
  )
  const visibleItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems])
  const selectedVisibleCount = visibleItemIds.filter((id) => selectedItemIdSet.has(id)).length
  const allVisibleItemsSelected = filteredItems.length > 0 && selectedVisibleCount === filteredItems.length

  useEffect(() => {
    if (!libraryAdvancedOpen) return

    function closeLibraryAdvancedOnOutsideClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      const origin = target instanceof Element ? target : target.parentElement
      if (origin?.closest('[data-keep-details-open]')) return
      if (libraryAdvancedRef.current?.contains(target)) return

      setLibraryAdvancedOpen(false)
    }

    window.addEventListener('click', closeLibraryAdvancedOnOutsideClick)
    return () => window.removeEventListener('click', closeLibraryAdvancedOnOutsideClick)
  }, [libraryAdvancedOpen])
  const selectedItemsLabel = selectedItems.length === 1 ? '1 seleccionada' : `${selectedItems.length} seleccionadas`
  const selectedVisibleLabel =
    selectedVisibleCount === 1 ? '1 visible en esta vista' : `${selectedVisibleCount} visibles en esta vista`
  const filteredVisibleLabel =
    filteredItems.length === 1 ? '1 visible en esta vista' : `${filteredItems.length} visibles en esta vista`
  const selectedDiceEligibleCount = selectedItems.filter((item) => item.status !== 'completed' && item.status !== 'dropped').length
  const selectedCooldownCount = selectedItems.filter(isItemInCooldown).length
  const bulkSignalLabels = librarySelectionSignalLabels[bulkSignalKind]
  const bulkSignalOption = librarySelectionSignalOptions.find((option) => option.id === bulkSignalKind) ?? librarySelectionSignalOptions[0]
  const isLibraryAdvancedOpen = libraryAdvancedOpen

  useEffect(() => {
    onVisibleSelectionSummaryChange({
      allVisibleItemsSelected,
      selectedVisibleCount,
      visibleCount: filteredItems.length,
    })
  }, [allVisibleItemsSelected, filteredItems.length, onVisibleSelectionSummaryChange, selectedVisibleCount])

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
  const reviewQueues = useMemo(() => getLibraryReviewQueues(library.items), [library.items])
  const activeReviewQueue = activeReviewSession
    ? reviewQueues.find((queue) => queue.id === activeReviewSession.id)
    : undefined
  const completedReviewSession = activeReviewSession && !activeReviewQueue ? activeReviewSession : undefined
  const focusedActivityItem = activityFocusItemId ? library.items.find((item) => item.id === activityFocusItemId) : undefined
  const missingActivityFocus = Boolean(activityFocusItemId && !library.loading && !focusedActivityItem)
  const missingActivitySearchQuery = activityFocusItemId ? getSearchQueryFromItemId(activityFocusItemId) : ''
  const editorItem = editingItem ?? focusedActivityItem

  useEffect(() => {
    if (!draftRequest || handledDraftRequestId === draftRequest.id) return

    const timeoutId = window.setTimeout(() => {
      if (handledDraftRequestId === draftRequest.id) return

      setHandledDraftRequestId(draftRequest.id)
      setEditingItem(draftRequest)
      setQuery(draftRequest.title)
      setTypeFilter('all')
      setStatusFilter('all')
      setSmartView('all')
      setSortMode('focus')
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [draftRequest, handledDraftRequestId])

  useEffect(() => {
    if (!smartViewRequest || handledSmartViewRequestId === smartViewRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSmartViewRequestId === smartViewRequest.requestId) return

      setHandledSmartViewRequestId(smartViewRequest.requestId)
      setQuery('')
      setTypeFilter('all')
      setStatusFilter('all')
      setSmartView(smartViewRequest.id)
      setSortMode('focus')
      setSelectedItemIds([])
      setActiveReviewSession(undefined)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [handledSmartViewRequestId, setSelectedItemIds, smartViewRequest])

  useLayoutEffect(() => {
    if (!importRequest || handledImportRequestId.current === importRequest.requestId) return

    handledImportRequestId.current = importRequest.requestId
    setImportStatus('Elige un backup JSON para previsualizarlo.')
    libraryImportInputRef.current?.click()
    onImportRequestHandled()
  }, [importRequest, onImportRequestHandled])

  async function prepareLibraryImportFile(file?: File) {
    if (!file) return

    setImportStatus('Preparando backup JSON...')
    setDeletedItemUndo(undefined)
    setDeletedLibraryUndo([])
    setStatusUndo(undefined)
    setCooldownUndo(undefined)
    setPriorityUndo(undefined)
    setTagUndo(undefined)
    setLibraryImportUndo(undefined)
    try {
      const payload = parseLibraryImportPayload(JSON.parse(await file.text()))
      const summary = getLibraryImportSummary(payload, library.items)
      setPendingLibraryImport({ fileName: file.name, payload, summary })
      setApplyLibraryImportSettings(Boolean(payload.settings))
      setSelectedItemIds([])
      setImportStatus(`Backup preparado: ${formatBackupImportSummary(summary)}`)
    } catch (reason) {
      setPendingLibraryImport(undefined)
      setApplyLibraryImportSettings(false)
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo importar el archivo')
    }
  }

  async function applyLibraryImportFile() {
    if (!pendingLibraryImport) return

    setImportStatus('Importando biblioteca...')
    try {
      const { payload, summary } = pendingLibraryImport
      const shouldApplySettings = applyLibraryImportSettings && Boolean(payload.settings)
      const payloadToApply: ParsedLibraryImport = shouldApplySettings ? payload : { ...payload, settings: undefined }
      const rollbackPlan = getLibraryImportRollbackPlan(payloadToApply, library.items, library.settings)

      for (const item of payload.items) {
        await library.saveItem(item)
      }
      if (shouldApplySettings && payload.settings) {
        await library.saveSettings(payload.settings)
        setTheme(payload.settings.theme)
      }
      setImportStatus(
        shouldApplySettings
          ? `Importadas ${summary.totalItems} entradas y ajustes`
          : `Importadas ${summary.totalItems} entradas`,
      )
      onActivity({
        detail: shouldApplySettings ? `${summary.totalItems} entradas y ajustes` : `${summary.totalItems} entradas`,
        label: 'Backup privado aplicado',
        tab: 'library',
        tone: 'success',
      })
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setLibraryImportUndo(rollbackPlan)
      setPendingLibraryImport(undefined)
      setApplyLibraryImportSettings(false)
      setSelectedItemIds([])
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo importar el archivo')
    }
  }

  function cancelLibraryImportFile() {
    setPendingLibraryImport(undefined)
    setApplyLibraryImportSettings(false)
    setImportStatus('Importacion de backup cancelada')
  }

  async function undoLibraryImportFile() {
    if (!libraryImportUndo) return

    setImportStatus('Deshaciendo importacion de backup...')
    try {
      for (const id of libraryImportUndo.newItemIds) {
        await library.deleteItem(id)
      }
      for (const item of libraryImportUndo.previousItems) {
        await library.saveItem(item)
      }
      if (libraryImportUndo.previousSettings) {
        await library.saveSettings(libraryImportUndo.previousSettings)
        setTheme(libraryImportUndo.previousSettings.theme)
      }
      setImportStatus(formatLibraryImportRollbackStatus(libraryImportUndo))
      onActivity({
        detail: formatLibraryImportRollbackDetail(libraryImportUndo),
        label: 'Backup privado deshecho',
        tab: 'library',
        tone: 'success',
      })
      setLibraryImportUndo(undefined)
      setPendingLibraryImport(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setSelectedItemIds([])
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el backup.')
    }
  }

  async function deleteEntireLibrary() {
    const deletedItems = library.items.map((item) => ({ ...item }))
    setImportStatus('Borrando tu biblioteca...')
    setDeletedItemUndo(undefined)
    setDeletedLibraryUndo([])
    setStatusUndo(undefined)
    setCooldownUndo(undefined)
    setPriorityUndo(undefined)
    setTagUndo(undefined)
    setPendingLibraryImport(undefined)
    setLibraryImportUndo(undefined)
    await library.deleteAllItems()
    setDeletedLibraryUndo(deletedItems)
    setDeletedLibraryUndoKind('all')
    setSelectedItemIds([])
    setDeleteDialogOpen(false)
    setDeleteConfirmText('')
    setImportStatus('Tu biblioteca ha sido borrada')
    onActivity({
      detail: `${deletedItems.length} entradas eliminadas`,
      label: 'Biblioteca borrada',
      tab: 'library',
      tone: 'success',
    })
  }

  async function deleteSelectedItems() {
    const deletedItems = selectedItems.map((item) => ({ ...item }))
    if (!deletedItems.length) {
      setSelectedDeleteDialogOpen(false)
      setSelectedDeleteConfirmText('')
      setImportStatus('No hay entradas seleccionadas')
      return
    }

    setImportStatus(`Borrando ${deletedItems.length} seleccionadas...`)
    setDeletedItemUndo(undefined)
    setDeletedLibraryUndo([])
    setDeletedLibraryUndoKind(undefined)
    setStatusUndo(undefined)
    setCooldownUndo(undefined)
    setPriorityUndo(undefined)
    setTagUndo(undefined)
    setPendingLibraryImport(undefined)
    setLibraryImportUndo(undefined)
    for (const item of deletedItems) {
      await library.deleteItem(item.id)
    }
    setDeletedLibraryUndo(deletedItems)
    setDeletedLibraryUndoKind('selection')
    setSelectedItemIds([])
    setSelectedDeleteDialogOpen(false)
    setSelectedDeleteConfirmText('')
    setImportStatus(`${deletedItems.length} entradas borradas de la seleccion`)
    onActivity({
      detail: `${deletedItems.length} entradas eliminadas`,
      label: 'Seleccion borrada',
      tab: 'library',
      tone: 'success',
    })
  }

  async function deleteLibraryItem(item: ListItem) {
    const deletedTitle = item.title
    setImportStatus(`Borrando ${deletedTitle}...`)

    try {
      await library.deleteItem(item.id)
      setDeletedItemUndo(item)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setSelectedItemIds((current) => current.filter((id) => id !== item.id))
      setImportStatus(`${deletedTitle} borrado`)
      onActivity({
        detail: deletedTitle,
        label: 'Entrada borrada',
        tab: 'library',
        tone: 'success',
      })
      return true
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo borrar la entrada.')
      return false
    }
  }

  async function deleteSingleItem() {
    if (!deleteTarget) return

    if (await deleteLibraryItem(deleteTarget)) {
      setDeleteTarget(undefined)
    }
  }

  async function deleteLibraryEditorItem(item: ListItem) {
    if (await deleteLibraryItem(item)) {
      setDeleteTarget(undefined)
      setEditingItem(undefined)
      onActivityFocusHandled()
      onDraftRequestHandled()
      writeAppTabToUrl('library')
    }
  }

  async function undoDeleteSingleItem() {
    if (!deletedItemUndo) return

    try {
      await library.saveItem(deletedItemUndo)
      setImportStatus(`${deletedItemUndo.title} recuperado en Biblioteca`)
      onActivity({
        detail: deletedItemUndo.title,
        label: 'Entrada recuperada',
        tab: 'library',
        target: { kind: 'item', id: deletedItemUndo.id },
        tone: 'success',
      })
      setDeletedItemUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el borrado.')
    }
  }

  async function undoDeleteEntireLibrary() {
    if (!deletedLibraryUndo.length) return

    try {
      setImportStatus(`Restaurando ${deletedLibraryUndo.length} entradas...`)
      for (const item of deletedLibraryUndo) {
        await library.saveItem(item)
      }
      setImportStatus(`${deletedLibraryUndo.length} entradas recuperadas en Biblioteca`)
      onActivity({
        detail: `${deletedLibraryUndo.length} entradas restauradas`,
        label: deletedLibraryUndoKind === 'selection' ? 'Seleccion recuperada' : 'Biblioteca recuperada',
        tab: 'library',
        tone: 'success',
      })
      setDeletedLibraryUndo([])
      setDeletedLibraryUndoKind(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el borrado total.')
    }
  }

  async function snoozeLibraryItem(item: ListItem) {
    try {
      await library.snoozeRecommendation(item.id)
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo({ changes: [{ id: item.id, previousCooldownUntil: item.recommendationCooldownUntil, title: item.title }] })
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setImportStatus(`${item.title} enfriado para el dado`)
      onActivity({
        detail: item.title,
        label: 'Entrada enfriada',
        tab: 'library',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo enfriar la entrada.')
    }
  }

  async function reactivateLibraryItem(item: ListItem) {
    try {
      await library.reactivateRecommendation(item.id)
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo({ changes: [{ id: item.id, previousCooldownUntil: item.recommendationCooldownUntil, title: item.title }] })
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setImportStatus(`${item.title} reactivado para el dado`)
      onActivity({
        detail: item.title,
        label: 'Entrada reactivada',
        tab: 'library',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo reactivar la entrada.')
    }
  }

  async function changeLibraryItemStatus(item: ListItem, status: ItemStatus) {
    try {
      await library.setStatus(item.id, status)
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo({ id: item.id, kind: 'single', previousStatus: item.status, title: item.title })
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setImportStatus(`${item.title} ahora es ${statusLabels[status]}`)
      onActivity({
        detail: `${item.title} -> ${statusLabels[status]}`,
        label: 'Estado actualizado',
        tab: 'library',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el estado.')
    }
  }

  async function undoLibraryStatusChange() {
    if (!statusUndo) return

    try {
      if (statusUndo.kind === 'bulk') {
        for (const change of statusUndo.changes) {
          await library.setStatus(change.id, change.previousStatus)
        }
        setImportStatus(`${statusUndo.changes.length} estados recuperados`)
        onActivity({
          detail: `${statusUndo.changes.length} entradas`,
          label: 'Estados recuperados',
          tab: 'library',
          tone: 'success',
        })
        setStatusUndo(undefined)
        setCooldownUndo(undefined)
        setPriorityUndo(undefined)
        setTagUndo(undefined)
        setPendingLibraryImport(undefined)
        setLibraryImportUndo(undefined)
        return
      }

      await library.setStatus(statusUndo.id, statusUndo.previousStatus)
      setImportStatus(`${statusUndo.title} recuperado como ${statusLabels[statusUndo.previousStatus]}`)
      onActivity({
        detail: `${statusUndo.title} -> ${statusLabels[statusUndo.previousStatus]}`,
        label: 'Estado recuperado',
        tab: 'library',
        target: { kind: 'item', id: statusUndo.id },
        tone: 'success',
      })
      setStatusUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el cambio de estado.')
    }
  }

  async function undoLibraryCooldownChange() {
    if (!cooldownUndo) return

    try {
      for (const change of cooldownUndo.changes) {
        await library.setRecommendationCooldown(change.id, change.previousCooldownUntil)
      }
      setImportStatus(formatLibraryCooldownRollbackStatus(cooldownUndo))
      onActivity({
        detail: formatLibraryCooldownRollbackDetail(cooldownUndo),
        label: 'Dado recuperado',
        tab: 'library',
        tone: 'success',
      })
      setCooldownUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el cambio del dado.')
    }
  }

  async function undoLibraryPriorityChange() {
    if (!priorityUndo) return

    try {
      for (const change of priorityUndo.changes) {
        const item = library.items.find((candidate) => candidate.id === change.id)
        if (!item) continue

        await library.saveItem({
          ...item,
          weights: { ...item.weights, priority: change.previousPriority },
        })
      }
      setImportStatus(`${priorityUndo.changes.length} focos recuperados`)
      onActivity({
        detail: `${priorityUndo.changes.length} entradas`,
        label: 'Foco recuperado',
        tab: 'library',
        tone: 'success',
      })
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el foco.')
    }
  }

  const addSelectedItemsSignals = useCallback(async (kind: LibrarySelectionSignalKind, requestedValues?: string[]) => {
    const valuesToAdd = requestedValues ? uniqueNormalizedValues(requestedValues) : splitList(bulkSignalText)
    const labels = librarySelectionSignalLabels[kind]
    if (!selectedItems.length) {
      setImportStatus('No hay entradas seleccionadas')
      return
    }
    if (!valuesToAdd.length) {
      setImportStatus(`Escribe al menos un ${labels.singular} para la seleccion`)
      return
    }

    const signalKeys = new Set(valuesToAdd.map(normalizeKey))
    const changedItems = selectedItems.filter((item) => {
      const currentKeys = new Set(getLibrarySelectionSignals(item, kind).map(normalizeKey))
      return [...signalKeys].some((signalKey) => !currentKeys.has(signalKey))
    })
    if (!changedItems.length) {
      setImportStatus(`La seleccion ya tiene ${valuesToAdd.join(', ')}`)
      return
    }

    try {
      for (const item of changedItems) {
        await library.saveItem(setLibrarySelectionSignals(item, kind, uniqueNormalizedValues([
          ...getLibrarySelectionSignals(item, kind),
          ...valuesToAdd,
        ])))
      }
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo({
        changes: changedItems.map((item) => ({
          id: item.id,
          previousValues: [...getLibrarySelectionSignals(item, kind)],
          title: item.title,
        })),
        kind,
        values: valuesToAdd,
      })
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setSelectedItemIds([])
      setBulkSignalText('')
      setImportStatus(`${changedItems.length} entradas ${kind === 'tag' ? 'etiquetadas' : 'actualizadas'} con ${valuesToAdd.join(', ')}`)
      onActivity({
        detail: `${changedItems.length} -> ${valuesToAdd.join(', ')}`,
        label: `${labels.plural.slice(0, 1).toUpperCase()}${labels.plural.slice(1)} masivos actualizados`,
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : `No se pudieron actualizar los ${labels.plural} de la seleccion.`)
    }
  }, [bulkSignalText, library, onActivity, selectedItems, setSelectedItemIds])

  const removeSelectedItemsSignals = useCallback(async (kind: LibrarySelectionSignalKind, requestedValues?: string[]) => {
    const valuesToRemove = requestedValues ? uniqueNormalizedValues(requestedValues) : splitList(bulkSignalText)
    const labels = librarySelectionSignalLabels[kind]
    if (!selectedItems.length) {
      setImportStatus('No hay entradas seleccionadas')
      return
    }
    if (!valuesToRemove.length) {
      setImportStatus(`Escribe al menos un ${labels.singular} para quitar de la seleccion`)
      return
    }

    const signalKeys = new Set(valuesToRemove.map(normalizeKey))
    const changedItems = selectedItems.filter((item) =>
      getLibrarySelectionSignals(item, kind).some((signal) => signalKeys.has(normalizeKey(signal))),
    )
    if (!changedItems.length) {
      setImportStatus(`La seleccion no tiene ${valuesToRemove.join(', ')}`)
      return
    }

    try {
      for (const item of changedItems) {
        await library.saveItem(setLibrarySelectionSignals(
          item,
          kind,
          getLibrarySelectionSignals(item, kind).filter((signal) => !signalKeys.has(normalizeKey(signal))),
        ))
      }
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo({
        changes: changedItems.map((item) => ({
          id: item.id,
          previousValues: [...getLibrarySelectionSignals(item, kind)],
          title: item.title,
        })),
        kind,
        values: valuesToRemove,
      })
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setSelectedItemIds([])
      setBulkSignalText('')
      setImportStatus(`${changedItems.length} entradas actualizadas sin ${valuesToRemove.join(', ')}`)
      onActivity({
        detail: `${changedItems.length} -> sin ${valuesToRemove.join(', ')}`,
        label: `${labels.plural.slice(0, 1).toUpperCase()}${labels.plural.slice(1)} masivos retirados`,
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : `No se pudieron quitar los ${labels.plural} de la seleccion.`)
    }
  }, [bulkSignalText, library, onActivity, selectedItems, setSelectedItemIds])

  async function undoLibraryTagChange() {
    if (!tagUndo) return
    const labels = librarySelectionSignalLabels[tagUndo.kind]

    try {
      for (const change of tagUndo.changes) {
        const item = library.items.find((candidate) => candidate.id === change.id)
        if (!item) continue

        await library.saveItem(setLibrarySelectionSignals(item, tagUndo.kind, [...change.previousValues]))
      }
      setImportStatus(`${tagUndo.changes.length} ${labels.plural} recuperados`)
      onActivity({
        detail: `${tagUndo.changes.length} entradas / ${tagUndo.values.join(', ')}`,
        label: `${labels.plural} recuperados`,
        tab: 'library',
        tone: 'success',
      })
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : `No se pudieron deshacer los ${labels.plural}.`)
    }
  }

  useEffect(() => {
    if (!selectedSignalsRequest || handledSelectedSignalsRequestId.current === selectedSignalsRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSelectedSignalsRequestId.current === selectedSignalsRequest.requestId) return

      handledSelectedSignalsRequestId.current = selectedSignalsRequest.requestId
      if (selectedSignalsRequest.action === 'remove') {
        void removeSelectedItemsSignals(selectedSignalsRequest.kind, selectedSignalsRequest.values)
        return
      }

      void addSelectedItemsSignals(selectedSignalsRequest.kind, selectedSignalsRequest.values)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [addSelectedItemsSignals, removeSelectedItemsSignals, selectedSignalsRequest])

  function toggleLibraryItemSelection(itemId: string) {
    setSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    )
  }

  const toggleVisibleLibrarySelection = useCallback(() => {
    if (!visibleItemIds.length) {
      setImportStatus('No hay entradas visibles para seleccionar')
      return
    }

    const visibleIdSet = new Set(visibleItemIds)
    if (allVisibleItemsSelected) {
      setSelectedItemIds((current) => current.filter((id) => !visibleIdSet.has(id)))
      setImportStatus(`${visibleItemIds.length} visibles quitadas de la seleccion`)
      onActivity({
        detail: `${visibleItemIds.length} entradas`,
        label: 'Visibles quitadas de la seleccion',
        tab: 'library',
        tone: 'info',
      })
      return
    }

    setSelectedItemIds((current) => uniqueValues([...current, ...visibleItemIds]))
    setImportStatus(`${visibleItemIds.length} visibles seleccionadas`)
    onActivity({
      detail: `${visibleItemIds.length} entradas`,
      label: 'Visibles seleccionadas',
      tab: 'library',
      tone: 'success',
    })
  }, [allVisibleItemsSelected, onActivity, setSelectedItemIds, visibleItemIds])

  useEffect(() => {
    if (!visibleSelectionRequest || handledVisibleSelectionRequestId.current === visibleSelectionRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledVisibleSelectionRequestId.current === visibleSelectionRequest.requestId) return

      handledVisibleSelectionRequestId.current = visibleSelectionRequest.requestId
      toggleVisibleLibrarySelection()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [toggleVisibleLibrarySelection, visibleSelectionRequest])

  const changeSelectedItemsStatus = useCallback(async (nextStatus = bulkStatus) => {
    setBulkStatus(nextStatus)
    const changedItems = selectedItems.filter((item) => item.status !== nextStatus)
    if (!selectedItems.length) {
      setImportStatus('No hay entradas seleccionadas')
      return
    }
    if (!changedItems.length) {
      setImportStatus(`La seleccion ya esta en ${statusLabels[nextStatus]}`)
      return
    }

    try {
      for (const item of changedItems) {
        await library.setStatus(item.id, nextStatus)
      }
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo({
        changes: changedItems.map((item) => ({ id: item.id, previousStatus: item.status, title: item.title })),
        kind: 'bulk',
      })
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setSelectedItemIds([])
      setImportStatus(
        changedItems.length === 1
          ? `1 entrada ahora es ${statusLabels[nextStatus]}`
          : `${changedItems.length} entradas ahora son ${statusLabels[nextStatus]}`,
      )
      onActivity({
        detail: `${changedItems.length} -> ${statusLabels[nextStatus]}`,
        label: 'Estado masivo actualizado',
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar la seleccion.')
    }
  }, [bulkStatus, library, onActivity, selectedItems, setSelectedItemIds])

  useEffect(() => {
    if (!selectedStatusRequest || handledSelectedStatusRequestId.current === selectedStatusRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSelectedStatusRequestId.current === selectedStatusRequest.requestId) return

      handledSelectedStatusRequestId.current = selectedStatusRequest.requestId
      void changeSelectedItemsStatus(selectedStatusRequest.status)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [changeSelectedItemsStatus, selectedStatusRequest])

  const changeSelectedItemsPriority = useCallback(async (nextLevel = bulkPriorityLevel) => {
    setBulkPriorityLevel(nextLevel)
    const priorityOption = libraryPriorityOptions.find((option) => option.id === nextLevel) ?? libraryPriorityOptions[1]
    const changedItems = selectedItems.filter(
      (item) => Math.abs(item.weights.priority - priorityOption.value) > 0.001,
    )
    if (!selectedItems.length) {
      setImportStatus('No hay entradas seleccionadas')
      return
    }
    if (!changedItems.length) {
      setImportStatus(`La seleccion ya tiene ${priorityOption.label.toLowerCase()}`)
      return
    }

    try {
      for (const item of changedItems) {
        await library.saveItem({
          ...item,
          weights: { ...item.weights, priority: priorityOption.value },
        })
      }
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo({
        changes: changedItems.map((item) => ({
          id: item.id,
          previousPriority: item.weights.priority,
          title: item.title,
        })),
      })
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setSelectedItemIds([])
      setImportStatus(
        changedItems.length === 1
          ? `1 entrada ahora tiene ${priorityOption.label}`
          : `${changedItems.length} entradas ahora tienen ${priorityOption.label}`,
      )
      onActivity({
        detail: `${changedItems.length} -> ${priorityOption.label}`,
        label: 'Foco masivo actualizado',
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el foco de la seleccion.')
    }
  }, [bulkPriorityLevel, library, onActivity, selectedItems, setSelectedItemIds])

  useEffect(() => {
    if (!selectedPriorityRequest || handledSelectedPriorityRequestId.current === selectedPriorityRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSelectedPriorityRequestId.current === selectedPriorityRequest.requestId) return

      handledSelectedPriorityRequestId.current = selectedPriorityRequest.requestId
      void changeSelectedItemsPriority(selectedPriorityRequest.level)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [changeSelectedItemsPriority, selectedPriorityRequest])

  const snoozeSelectedItems = useCallback(async () => {
    const itemsToSnooze = selectedItems.filter((item) => item.status !== 'completed' && item.status !== 'dropped')
    if (!itemsToSnooze.length) {
      setImportStatus('La seleccion no tiene candidatas vivas para el dado')
      return
    }

    try {
      for (const item of itemsToSnooze) {
        await library.snoozeRecommendation(item.id)
      }
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo({
        changes: itemsToSnooze.map((item) => ({
          id: item.id,
          previousCooldownUntil: item.recommendationCooldownUntil,
          title: item.title,
        })),
      })
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setSelectedItemIds([])
      setImportStatus(`${itemsToSnooze.length} entradas enfriadas para el dado`)
      onActivity({
        detail: `${itemsToSnooze.length} entradas`,
        label: 'Seleccion enfriada',
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo enfriar la seleccion.')
    }
  }, [library, onActivity, selectedItems, setSelectedItemIds])

  const reactivateSelectedItems = useCallback(async () => {
    const itemsToReactivate = selectedItems.filter(isItemInCooldown)
    if (!itemsToReactivate.length) {
      setImportStatus('La seleccion no tiene cooldowns activos')
      return
    }

    try {
      for (const item of itemsToReactivate) {
        await library.reactivateRecommendation(item.id)
      }
      setDeletedItemUndo(undefined)
      setDeletedLibraryUndo([])
      setStatusUndo(undefined)
      setCooldownUndo({
        changes: itemsToReactivate.map((item) => ({
          id: item.id,
          previousCooldownUntil: item.recommendationCooldownUntil,
          title: item.title,
        })),
      })
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setSelectedItemIds([])
      setImportStatus(`${itemsToReactivate.length} entradas reactivadas para el dado`)
      onActivity({
        detail: `${itemsToReactivate.length} entradas`,
        label: 'Seleccion reactivada',
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo reactivar la seleccion.')
    }
  }, [library, onActivity, selectedItems, setSelectedItemIds])

  useEffect(() => {
    if (
      !selectedDiceActionRequest ||
      handledSelectedDiceActionRequestId.current === selectedDiceActionRequest.requestId
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (handledSelectedDiceActionRequestId.current === selectedDiceActionRequest.requestId) return

      handledSelectedDiceActionRequestId.current = selectedDiceActionRequest.requestId
      void (selectedDiceActionRequest.action === 'snooze' ? snoozeSelectedItems() : reactivateSelectedItems())
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [reactivateSelectedItems, selectedDiceActionRequest, snoozeSelectedItems])

  function openLibraryEditor(item: ListItem) {
    const existingItem = library.items.find((libraryItem) => libraryItem.id === item.id)
    if (existingItem) {
      setEditingItem(undefined)
      onNavigate('library', { kind: 'item', id: existingItem.id })
      return
    }

    setEditingItem(item)
    onActivityFocusHandled()
    writeAppTabToUrl('library', 'push')
  }

  function closeLibraryEditor() {
    setEditingItem(undefined)
    onActivityFocusHandled()
    onDraftRequestHandled()
    writeAppTabToUrl('library', 'push')
  }

  function clearMissingActivityFocus() {
    onActivityFocusHandled()
    writeAppTabToUrl('library')
  }

  function searchMissingActivityFocus() {
    setQuery(missingActivitySearchQuery)
    setTypeFilter('all')
    setStatusFilter('all')
    setSmartView('all')
    setSortMode('focus')
    setImportStatus(`Buscando "${missingActivitySearchQuery}" en tu biblioteca`)
    clearMissingActivityFocus()
  }

  async function saveLibraryEditorItem(item: ListItem) {
    try {
      await library.saveItem(item)
      setDeletedItemUndo(undefined)
      setPendingLibraryImport(undefined)
      setLibraryImportUndo(undefined)
      setCooldownUndo(undefined)
      setPriorityUndo(undefined)
      setTagUndo(undefined)
      setEditingItem(undefined)
      onActivityFocusHandled()
      onDraftRequestHandled()
      writeAppTabToUrl('library')
      setImportStatus(`${item.title || 'Entrada'} guardada en Biblioteca`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Ficha guardada',
        tab: 'library',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setImportStatus(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.')
    }
  }

  async function searchCatalogFromLibrary() {
    const cleanedQuery = catalogQuery.trim()
    setCatalogStatus(undefined)
    setCatalogResultsPage(1)
    if (cleanedQuery.length < 2) {
      setCatalogStatus('Escribe al menos 2 caracteres para buscar obras.')
      setCatalogCandidates([])
      return
    }

    setCatalogLoading(true)
    try {
      const [publicItems, externalCandidates] = await Promise.all([
        library.searchPublicCatalog(cleanedQuery, catalogType),
        library.searchExternal(cleanedQuery, catalogType),
      ])
      const candidates = rankCatalogSearchCandidates(
        uniqueDiscoveryCandidates([
          ...publicItems.map(library.publicItemToDiscovery),
          ...externalCandidates.map(library.externalCandidateToDiscovery),
        ]),
        cleanedQuery,
        catalogType,
      )
      setCatalogCandidates(candidates)
      setCatalogStatus(
        candidates.length
          ? `${candidates.length} resultado${candidates.length === 1 ? '' : 's'} listo${candidates.length === 1 ? '' : 's'} para guardar.`
          : 'Sin resultados. Puedes crear una ficha manual si quieres conservar esa idea.',
      )
      if (candidates.length) {
        onActivity({
          detail: `${candidates.length} resultados para "${cleanedQuery}"`,
          label: 'Busqueda de obra',
          tab: 'library',
          tone: 'success',
        })
      }
    } catch (reason) {
      setCatalogStatus(reason instanceof Error ? reason.message : 'No se pudo completar la busqueda.')
      setCatalogCandidates([])
    } finally {
      setCatalogLoading(false)
    }
  }

  async function saveCatalogCandidateFromLibrary(candidate: DiscoveryCandidate) {
    setCatalogStatus(`Guardando ${candidate.title}...`)
    try {
      const item = await library.saveDiscoveryToLibrary(candidate, { persistDiscoveryCandidate: false })
      setCatalogCandidates((current) =>
        current.map((entry) =>
          entry.id === candidate.id ? { ...entry, savedItemId: item.id, status: 'saved', updatedAt: nowIso() } : entry,
        ),
      )
      setImportStatus(`${item.title} guardado en Biblioteca`)
      setCatalogStatus(`${item.title} guardado. Puedes seguir buscando o abrirlo en tu lista.`)
      onActivity({
        detail: item.title,
        label: 'Obra guardada',
        tab: 'library',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setCatalogStatus(reason instanceof Error ? reason.message : 'No se pudo guardar la obra.')
    }
  }

  function exportLibrary() {
    downloadLibraryBackup(library.items, library.settings, 'nexo-export')
    setImportStatus('Backup JSON descargado')
    onActivity({
      detail: `${library.items.length} entradas exportadas`,
      label: 'Backup privado exportado',
      tab: 'library',
      tone: 'success',
    })
  }

  const exportSelectedItems = useCallback(() => {
    if (!selectedItems.length) {
      setImportStatus('No hay entradas seleccionadas')
      return
    }

    downloadLibraryBackup(selectedItems, undefined, 'nexo-selection')
    setImportStatus(`${selectedItems.length} entradas seleccionadas exportadas sin ajustes`)
    onActivity({
      detail: `${selectedItems.length} entradas sin ajustes`,
      label: 'Seleccion exportada',
      tab: 'library',
      tone: 'success',
    })
  }, [onActivity, selectedItems])

  useEffect(() => {
    if (!selectedExportRequest || handledSelectedExportRequestId.current === selectedExportRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSelectedExportRequestId.current === selectedExportRequest.requestId) return

      handledSelectedExportRequestId.current = selectedExportRequest.requestId
      exportSelectedItems()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [exportSelectedItems, selectedExportRequest])

  useEffect(() => {
    if (!sortModeRequest || handledSortModeRequestId.current === sortModeRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSortModeRequestId.current === sortModeRequest.requestId) return

      handledSortModeRequestId.current = sortModeRequest.requestId
      const nextLabel = librarySortLabels[sortModeRequest.mode]
      if (sortMode === sortModeRequest.mode) {
        setImportStatus(`Orden ${nextLabel} ya activo`)
        return
      }

      setSortMode(sortModeRequest.mode)
      setImportStatus(`Orden ${nextLabel} aplicado`)
      onActivity({
        detail: nextLabel,
        label: 'Orden de biblioteca aplicado',
        tab: 'library',
        tone: 'success',
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onActivity, sortMode, sortModeRequest])

  useEffect(() => {
    if (!statusFilterRequest || handledStatusFilterRequestId.current === statusFilterRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledStatusFilterRequestId.current === statusFilterRequest.requestId) return

      handledStatusFilterRequestId.current = statusFilterRequest.requestId
      const nextLabel = statusLabels[statusFilterRequest.status]
      if (statusFilter === statusFilterRequest.status && smartView === 'all' && !trimmedQuery) {
        setImportStatus(`Estado ${nextLabel} ya activo`)
        return
      }

      setQuery('')
      setStatusFilter(statusFilterRequest.status)
      setSmartView('all')
      setSelectedItemIds([])
      setActiveReviewSession(undefined)
      setImportStatus(`Filtro ${nextLabel} aplicado`)
      onActivity({
        detail: nextLabel,
        label: 'Filtro de estado aplicado',
        tab: 'library',
        tone: 'success',
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onActivity, setSelectedItemIds, smartView, statusFilter, statusFilterRequest, trimmedQuery])

  useEffect(() => {
    if (!typeFilterRequest || handledTypeFilterRequestId.current === typeFilterRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledTypeFilterRequestId.current === typeFilterRequest.requestId) return

      handledTypeFilterRequestId.current = typeFilterRequest.requestId
      const nextLabel = typeLabels[typeFilterRequest.type]
      if (typeFilter === typeFilterRequest.type && smartView === 'all' && !trimmedQuery) {
        setImportStatus(`Tipo ${nextLabel} ya activo`)
        return
      }

      setQuery('')
      setTypeFilter(typeFilterRequest.type)
      setSmartView('all')
      setSelectedItemIds([])
      setActiveReviewSession(undefined)
      setImportStatus(`Tipo ${nextLabel} aplicado`)
      onActivity({
        detail: nextLabel,
        label: 'Filtro de tipo aplicado',
        tab: 'library',
        tone: 'success',
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onActivity, setSelectedItemIds, smartView, trimmedQuery, typeFilter, typeFilterRequest])

  async function copyLibraryItemLink(item: ListItem) {
    const itemUrl = buildItemShareUrl(item.id)
    const copied = await writeClipboardText(itemUrl)
    setLibraryLinkCopy(copied ? undefined : { title: item.title, url: itemUrl })
    setImportStatus(copied ? `Enlace de ${item.title} copiado` : `Enlace de ${item.title} listo para copiar manualmente`)
    onActivity({
      detail: item.title,
      label: copied ? 'Enlace copiado' : 'Enlace preparado',
      tab: 'library',
      target: { kind: 'item', id: item.id },
      tone: copied ? 'success' : 'info',
    })
  }

  const resetLibraryFilters = useCallback(() => {
    setQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setSmartView('all')
    setSortMode('focus')
    setSelectedItemIds([])
    setActiveReviewSession(undefined)
  }, [setSelectedItemIds])

  useEffect(() => {
    if (!resetViewRequest || handledResetViewRequestId.current === resetViewRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledResetViewRequestId.current === resetViewRequest.requestId) return

      handledResetViewRequestId.current = resetViewRequest.requestId
      resetLibraryFilters()
      setImportStatus('Vista de Biblioteca restablecida')
      onActivity({
        detail: 'Filtros y orden iniciales',
        label: 'Vista de biblioteca restablecida',
        tab: 'library',
        tone: 'success',
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onActivity, resetLibraryFilters, resetViewRequest])

  function openLibrarySmartView(view: LibrarySmartView, label: string) {
    setQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setSmartView(view)
    setSortMode('focus')
    setImportStatus(`Vista de repaso: ${label}`)
  }

  function startLibraryReviewSession(queue: LibraryReviewQueue) {
    setActiveReviewSession({ detail: queue.detail, id: queue.id, label: queue.label })
  }

  function viewLibraryReviewQueue(queue: LibraryReviewQueue) {
    startLibraryReviewSession(queue)
    if (queue.action === 'open-dice') {
      onRollDice()
      return
    }

    openLibrarySmartView(queue.id, queue.label)
  }

  function runLibraryReviewQueue(queue: LibraryReviewQueue) {
    startLibraryReviewSession(queue)
    if (queue.action === 'open-dice') {
      onRollDice()
      return
    }

    if (queue.action === 'open-item' && queue.item) {
      openLibraryEditor(queue.item)
      return
    }

    openLibrarySmartView(queue.id, queue.label)
  }

  function stopLibraryReviewQueue() {
    setActiveReviewSession(undefined)
    setImportStatus('Repaso guiado pausado')
  }

  function closeCompletedReviewSession() {
    setActiveReviewSession(undefined)
    setImportStatus('Repaso completado cerrado')
  }

  function createItemFromCurrentSearch() {
    const draft = blankItem()
    openLibraryEditor({
      ...draft,
      status: statusFilter === 'all' ? draft.status : statusFilter,
      title: trimmedQuery,
      type: typeFilter === 'all' ? draft.type : typeFilter,
    })
  }

  useEffect(() => {
    if (!primaryActionRequest || handledPrimaryActionRequestId.current === primaryActionRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledPrimaryActionRequestId.current === primaryActionRequest.requestId) return

      handledPrimaryActionRequestId.current = primaryActionRequest.requestId
      const item = library.items.find((candidate) => candidate.id === primaryActionRequest.itemId)
      if (!item) {
        setImportStatus('La siguiente accion ya no esta disponible')
        onPrimaryActionRequestHandled()
        return
      }

      const primaryAction = getPrimaryItemAction(item.status)
      setQuery('')
      setTypeFilter('all')
      setStatusFilter('all')
      setSmartView('all')
      setSortMode('focus')
      setSelectedItemIds([])
      setActiveReviewSession(undefined)
      setImportStatus(`${primaryAction.label}: ${item.title}`)

      void (async () => {
        try {
          await library.setStatus(item.id, primaryAction.nextStatus)
          setDeletedItemUndo(undefined)
          setDeletedLibraryUndo([])
          setStatusUndo({ id: item.id, kind: 'single', previousStatus: item.status, title: item.title })
          setCooldownUndo(undefined)
          setPriorityUndo(undefined)
          setTagUndo(undefined)
          setPendingLibraryImport(undefined)
          setLibraryImportUndo(undefined)
          setImportStatus(`${item.title} ahora es ${statusLabels[primaryAction.nextStatus]}`)
          onActivity({
            detail: `${item.title} -> ${statusLabels[primaryAction.nextStatus]}`,
            label: 'Siguiente accion aplicada',
            tab: 'library',
            target: { kind: 'item', id: item.id },
            tone: 'success',
          })
        } catch (reason) {
          setImportStatus(reason instanceof Error ? reason.message : 'No se pudo aplicar la siguiente accion.')
        } finally {
          onPrimaryActionRequestHandled()
        }
      })()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [library, onActivity, onPrimaryActionRequestHandled, primaryActionRequest, setSelectedItemIds])

  useEffect(() => {
    if (!reviewRequest || handledReviewRequestId.current === reviewRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledReviewRequestId.current === reviewRequest.requestId) return

      handledReviewRequestId.current = reviewRequest.requestId
      const queue = reviewQueues.find((candidate) => candidate.id === reviewRequest.id)
      if (!queue) {
        setImportStatus('Ese repaso ya no tiene entradas pendientes')
        onReviewRequestHandled()
        return
      }

      startLibraryReviewSession(queue)
      if (queue.action === 'open-dice') {
        onRollDice()
      } else if (queue.action === 'open-item' && queue.item) {
        const existingItem = library.items.find((item) => item.id === queue.item?.id)
        if (existingItem) {
          setEditingItem(undefined)
          onNavigate('library', { kind: 'item', id: existingItem.id })
        } else {
          setEditingItem(queue.item)
          onActivityFocusHandled()
          writeAppTabToUrl('library', 'push')
        }
      } else {
        openLibrarySmartView(queue.id, queue.label)
      }
      onReviewRequestHandled()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [library.items, onActivityFocusHandled, onNavigate, onReviewRequestHandled, onRollDice, reviewQueues, reviewRequest])

  const showCatalogEmptyAction = !catalogCandidates.length && catalogStatus?.startsWith('Sin resultados')
  const showCatalogResultsPanel = Boolean(catalogStatus || catalogCandidates.length > 0 || showCatalogEmptyAction)
  const catalogPageCount = Math.max(1, Math.ceil(catalogCandidates.length / CATALOG_RESULTS_PAGE_SIZE))
  const safeCatalogResultsPage = Math.min(Math.max(catalogResultsPage, 1), catalogPageCount)
  const catalogPageStart = (safeCatalogResultsPage - 1) * CATALOG_RESULTS_PAGE_SIZE
  const catalogPageCandidates = catalogCandidates.slice(catalogPageStart, catalogPageStart + CATALOG_RESULTS_PAGE_SIZE)
  const catalogRangeStart = catalogCandidates.length ? catalogPageStart + 1 : 0
  const catalogRangeEnd = Math.min(catalogPageStart + catalogPageCandidates.length, catalogCandidates.length)
  const libraryUndoAction =
    libraryImportUndo
      ? { ariaLabel: 'Deshacer importacion', label: 'Deshacer', onClick: () => void undoLibraryImportFile() }
      : deletedItemUndo
        ? { ariaLabel: 'Deshacer borrado', label: 'Deshacer', onClick: () => void undoDeleteSingleItem() }
        : deletedLibraryUndo.length > 0
          ? {
              ariaLabel: deletedLibraryUndoKind === 'selection' ? 'Deshacer seleccion' : 'Deshacer borrado total',
              label: 'Deshacer',
              onClick: () => void undoDeleteEntireLibrary(),
            }
          : statusUndo
            ? { ariaLabel: 'Deshacer estado', label: 'Deshacer', onClick: () => void undoLibraryStatusChange() }
            : cooldownUndo
              ? { ariaLabel: 'Deshacer dado', label: 'Deshacer', onClick: () => void undoLibraryCooldownChange() }
              : priorityUndo
                ? { ariaLabel: 'Deshacer foco', label: 'Deshacer', onClick: () => void undoLibraryPriorityChange() }
                : tagUndo
                  ? {
                      ariaLabel: `Deshacer ${librarySelectionSignalLabels[tagUndo.kind].plural}`,
                      label: 'Deshacer',
                      onClick: () => void undoLibraryTagChange(),
                    }
                  : undefined
  const libraryToastTone = importStatus ? feedbackToneFromText(importStatus) : undefined
  const libraryToasts: ToastMessage[] = importStatus
    ? [
        {
          action: libraryUndoAction,
          durationMs: libraryToastTone === 'danger' || libraryToastTone === 'loading' ? undefined : libraryUndoAction ? 8000 : 3000,
          id: 'library-status',
          message: importStatus,
          tone: libraryToastTone,
        },
      ]
    : libraryUndoAction
      ? [
          {
            action: libraryUndoAction,
            durationMs: 8000,
            id: 'library-undo',
            message: 'Accion reciente disponible para deshacer.',
            tone: 'info',
          },
        ]
      : []

  function clearLibraryUndoState() {
    if (libraryImportUndo) setLibraryImportUndo(undefined)
    if (deletedItemUndo) setDeletedItemUndo(undefined)
    if (deletedLibraryUndo.length > 0) {
      setDeletedLibraryUndo([])
      setDeletedLibraryUndoKind(undefined)
    }
    if (statusUndo) setStatusUndo(undefined)
    if (cooldownUndo) setCooldownUndo(undefined)
    if (priorityUndo) setPriorityUndo(undefined)
    if (tagUndo) setTagUndo(undefined)
  }

  function dismissLibraryToast(id: string) {
    if (id === 'library-status') setImportStatus(undefined)
    if (id === 'library-status' || id === 'library-undo') clearLibraryUndoState()
  }

  const catalogSearchForm = (
    <form
      aria-label="Buscar obras para guardar"
      className="library-catalog-form"
      data-testid="library-catalog-search"
      onSubmit={(event) => {
        event.preventDefault()
        void searchCatalogFromLibrary()
      }}
    >
      <label className="search-field library-catalog-query">
        <Search size={18} />
        <input
          aria-label="Buscar obra para guardar"
          value={catalogQuery}
          onChange={(event) => setCatalogQuery(event.target.value)}
          placeholder="Dune, Hollow Knight, Frieren, Berserk..."
        />
      </label>
      <select
        aria-label="Tipo de obra para buscar"
        value={catalogType}
        onChange={(event) => {
          setCatalogType(event.target.value as ExplorerSearchType)
          setCatalogResultsPage(1)
        }}
      >
        {libraryCatalogSearchTypes.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button className="primary-button" disabled={catalogLoading} type="submit">
        <Search size={18} />
        {catalogLoading ? 'Buscando' : 'Buscar obra'}
      </button>
      <button
        aria-label="Fuentes"
        className="secondary-button source-credit-trigger"
        title="Fuentes"
        type="button"
        onClick={() => setSourceCreditsOpen(true)}
      >
        <HelpCircle size={17} />
        <span className="sr-only">Fuentes</span>
      </button>
    </form>
  )

  return (
    <section className="content-grid library-content-grid">
      <section className="workspace-panel wide library-panel" aria-label="Biblioteca">
        <section className="library-masthead" aria-label="Estanteria de Nexo" data-testid="library-masthead">
          <div className="library-masthead-copy">
            <h2>Biblioteca</h2>
          </div>
          <div className={mastheadItems.length > 0 ? 'library-masthead-covers' : 'library-masthead-covers empty'} aria-hidden="true">
            {mastheadItems.length > 0 ? (
              mastheadItems.map((item) => (
                <CoverArt key={item.id} title={item.title} type={item.type} posterUrl={item.posterUrl} />
              ))
            ) : (
              <>
                <span />
                <span />
                <span />
              </>
            )}
          </div>
          {catalogSearchForm}
        </section>

        {showCatalogResultsPanel && (
        <section className="library-search-hero" aria-label="Resultados del catalogo">
          {catalogStatus && <FeedbackMessage tone={feedbackToneFromText(catalogStatus)}>{catalogStatus}</FeedbackMessage>}
          {catalogCandidates.length > 0 && (
            <>
              <div className="library-catalog-results" aria-label="Resultados para guardar">
                {catalogPageCandidates.map((candidate) => {
                  const savedItem = getSavedLibraryItemForCandidate(candidate, library.items)
                  return (
                    <LibraryCatalogCandidateCard
                      candidate={candidate}
                      isSaved={Boolean(savedItem)}
                      key={candidate.id}
                      onSave={() => void saveCatalogCandidateFromLibrary(candidate)}
                    />
                  )
                })}
              </div>
              {catalogCandidates.length > CATALOG_RESULTS_PAGE_SIZE && (
                <nav className="library-catalog-pagination" aria-label="Paginacion del catalogo" data-testid="library-catalog-pagination">
                  <span>
                    Mostrando {catalogRangeStart}-{catalogRangeEnd} de {catalogCandidates.length}
                  </span>
                  <div className="library-catalog-pagination-controls">
                    <button
                      className="secondary-button"
                      disabled={safeCatalogResultsPage <= 1}
                      type="button"
                      onClick={() => setCatalogResultsPage((page) => Math.max(1, page - 1))}
                    >
                      Anterior
                    </button>
                    <label>
                      Pagina
                      <select
                        aria-label="Pagina de resultados"
                        value={safeCatalogResultsPage}
                        onChange={(event) => setCatalogResultsPage(Number(event.target.value))}
                      >
                        {Array.from({ length: catalogPageCount }, (_, index) => {
                          const page = index + 1
                          return (
                            <option key={page} value={page}>
                              {page} de {catalogPageCount}
                            </option>
                          )
                        })}
                      </select>
                    </label>
                    <button
                      className="secondary-button"
                      disabled={safeCatalogResultsPage >= catalogPageCount}
                      type="button"
                      onClick={() => setCatalogResultsPage((page) => Math.min(catalogPageCount, page + 1))}
                    >
                      Siguiente
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
          {showCatalogEmptyAction && (
            <div className="library-catalog-empty-action">
              <button className="secondary-button" type="button" onClick={() => openLibraryEditor({ ...blankItem(), title: catalogQuery.trim() })}>
                <Plus size={16} />
                Crear manual
              </button>
            </div>
          )}
        </section>
        )}

        <section className="library-shelf-header" aria-label="Obras guardadas" data-testid="library-shelf-header">
          <div className="library-shelf-title">
            <span className="eyebrow">Guardadas</span>
            <h3>Todas</h3>
            <p>
              {filteredItems.length} de {library.items.length} obras / {hasActiveLibraryControls ? 'vista filtrada' : 'orden inteligente'}
            </p>
          </div>
          <div className="library-primary-controls" aria-label="Ordenar y filtrar biblioteca">
            <select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ItemStatus | 'all')}
            >
              <option value="all">Todos</option>
              {ITEM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por tipo"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ItemType | 'all')}
            >
              <option value="all">Tipo</option>
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
            <select
              aria-label="Tarjetas por fila"
              value={libraryCardsPerRow}
              onChange={(event) => void changeLibraryCardsPerRow(Number(event.target.value) as LibraryCardsPerRow)}
            >
              {libraryCardsPerRowOptions.map((count) => (
                <option key={count} value={count}>
                  {count} tarjetas
                </option>
              ))}
            </select>
          </div>
        </section>

        {hasActiveLibraryControls && (
          <div className="filter-summary" aria-live="polite" data-testid="library-filter-summary">
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

        <details
          className="library-advanced-panel"
          ref={libraryAdvancedRef}
          open={isLibraryAdvancedOpen}
          onToggle={(event) => {
            setLibraryAdvancedOpen(event.currentTarget.open)
          }}
        >
          <summary>
            <span>
              <strong>Avanzado</strong>
              <small>Filtros, import/export, repaso y acciones masivas</small>
            </span>
            <em>{isLibraryAdvancedOpen ? 'Abierto' : 'Oculto'}</em>
          </summary>
          <div className="library-advanced-content">
            <div className="utility-actions library-tool-actions" aria-label="Herramientas de biblioteca">
                <label className="icon-button file-button" title="Importar">
                  <Upload size={18} />
                  <span className="sr-only">Importar</span>
                  <input
                    accept="application/json,.json"
                    aria-label="Importar biblioteca desde JSON"
                    ref={libraryImportInputRef}
                    type="file"
                    onChange={(event) => {
                      void prepareLibraryImportFile(event.target.files?.[0])
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

        <LaunchGuideCard
          guide={launchGuide}
          onAdd={() => openLibraryEditor(blankItem())}
          onEditItem={(item) => openLibraryEditor(item)}
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
                    onClick={() => void changeLibraryItemStatus(nextFocusItem, nextFocusAction.nextStatus)}
                  >
                    <nextFocusAction.Icon size={16} />
                    {nextFocusAction.label}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => openLibraryEditor(nextFocusItem)}>
                    <Info size={16} />
                    Afinar ficha
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <strong>Todo listo</strong>
                  <p>Anade algo o guarda hallazgos desde Explorar para alimentar el dado.</p>
                </div>
                <button className="primary-button" type="button" onClick={() => openLibraryEditor(blankItem())}>
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

        {reviewQueues.length > 0 && (
          <section className="library-review-panel" aria-label="Repaso guiado de biblioteca" data-testid="library-review-queue">
            <div className="library-review-heading">
              <div>
                <span className="eyebrow">Repaso guiado</span>
                <h3>Colas que mejoran el dado</h3>
              </div>
              <span>{reviewQueues.length} activas</span>
            </div>
            <div className="library-review-grid">
              {reviewQueues.map((queue) => {
                const Icon = getLibraryReviewQueueIcon(queue.id)
                const canOpenView = queue.id !== 'all' && queue.action !== 'open-dice'

                return (
                  <article className={queue.primary ? 'library-review-card primary' : 'library-review-card'} key={queue.id}>
                    <div className="library-review-main">
                      <span className="library-review-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <div>
                        <strong>{queue.label}</strong>
                        <p>{queue.detail}</p>
                        {queue.item && <small>Siguiente: {queue.item.title}</small>}
                      </div>
                      <em>{queue.count}</em>
                    </div>
                    <div className="library-review-actions">
                      <button
                        className={queue.primary ? 'primary-button' : 'secondary-button'}
                        type="button"
                        onClick={() => runLibraryReviewQueue(queue)}
                      >
                        {getLibraryReviewQueueActionLabel(queue)}
                      </button>
                      {canOpenView && (
                        <button className="ghost-button" type="button" onClick={() => viewLibraryReviewQueue(queue)}>
                          Ver cola
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {activeReviewQueue && (
          <section
            className="library-review-session"
            aria-label={`Sesion de repaso ${activeReviewQueue.label}`}
            data-testid="library-review-session"
          >
            <div className="library-review-session-main">
              <span className="eyebrow">Repaso activo</span>
              <strong>{activeReviewQueue.label}</strong>
              <p>{activeReviewQueue.detail}</p>
              {activeReviewQueue.item && <small>Siguiente: {activeReviewQueue.item.title}</small>}
              {activeReviewQueue.items.length > 1 && (
                <div className="library-review-session-stack" aria-label="Proximas entradas del repaso">
                  {activeReviewQueue.items.slice(0, 3).map((item) => (
                    <button key={item.id} type="button" onClick={() => openLibraryEditor(item)}>
                      {item.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="library-review-session-progress" aria-label="Pendientes en repaso">
              <strong>{activeReviewQueue.count}</strong>
              <span>{activeReviewQueue.count === 1 ? 'pendiente' : 'pendientes'}</span>
            </div>
            <div className="library-review-session-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => runLibraryReviewQueue(activeReviewQueue)}
              >
                {getLibraryReviewQueueActionLabel(activeReviewQueue)}
              </button>
              {activeReviewQueue.action !== 'open-dice' && (
                <button className="secondary-button" type="button" onClick={() => viewLibraryReviewQueue(activeReviewQueue)}>
                  Ver cola
                </button>
              )}
              <button className="ghost-button" type="button" onClick={stopLibraryReviewQueue}>
                Terminar repaso
              </button>
            </div>
          </section>
        )}

        {completedReviewSession && (
          <section
            className="library-review-session completed"
            aria-label={`Repaso completado ${completedReviewSession.label}`}
            data-testid="library-review-complete"
          >
            <div className="library-review-session-main">
              <span className="eyebrow">Repaso completado</span>
              <strong>{completedReviewSession.label}</strong>
              <p>La cola ya no tiene entradas pendientes.</p>
            </div>
            <div className="library-review-session-progress" aria-label="Pendientes en repaso">
              <strong>0</strong>
              <span>pendientes</span>
            </div>
            <div className="library-review-session-actions">
              <button className="primary-button" type="button" onClick={onRollDice}>
                <Dice5 size={16} />
                Tirar dado
              </button>
              <button className="ghost-button" type="button" onClick={closeCompletedReviewSession}>
                Cerrar
              </button>
            </div>
          </section>
        )}

        <div className="stats-row library-advanced-only">
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

        <div className="toolbar library-advanced-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar en biblioteca"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar titulo, genero, tag o mood"
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

        {(filteredItems.length > 0 || selectedItems.length > 0) && (
          <div className="library-selection-bar" aria-label="Seleccion de biblioteca">
            <button
              className="secondary-button"
              disabled={filteredItems.length === 0}
              type="button"
              onClick={toggleVisibleLibrarySelection}
            >
              <CheckCircle2 size={16} />
              {allVisibleItemsSelected ? 'Quitar visibles' : 'Seleccionar visibles'}
            </button>
            <div className={selectedItems.length > 0 ? 'library-selection-count' : 'library-selection-count muted'}>
              {selectedItems.length > 0 ? (
                <>
                  <strong>{selectedItemsLabel}</strong>
                  <span>{selectedVisibleLabel}</span>
                </>
              ) : (
                <>
                  <strong>Seleccion rapida</strong>
                  <span>{filteredVisibleLabel}</span>
                </>
              )}
            </div>
            {selectedItems.length > 0 && (
              <>
                <button className="secondary-button" type="button" onClick={exportSelectedItems}>
                  <Download size={16} />
                  Exportar seleccion
                </button>
                <label className="bulk-status-control">
                  <span className="sr-only">Estado para seleccion</span>
                  <select
                    aria-label="Estado para seleccion"
                    value={bulkStatus}
                    onChange={(event) => setBulkStatus(event.target.value as ItemStatus)}
                  >
                    {ITEM_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" type="button" onClick={() => void changeSelectedItemsStatus()}>
                  <Save size={16} />
                  Aplicar estado
                </button>
                <label className="bulk-priority-control">
                  <span className="sr-only">Foco para seleccion</span>
                  <select
                    aria-label="Foco para seleccion"
                    value={bulkPriorityLevel}
                    onChange={(event) => setBulkPriorityLevel(event.target.value as LibraryPriorityLevel)}
                  >
                    {libraryPriorityOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="secondary-button" type="button" onClick={() => void changeSelectedItemsPriority()}>
                  <Dice5 size={16} />
                  Aplicar foco
                </button>
                <label className="bulk-signal-kind-control">
                  <span className="sr-only">Tipo de senal para seleccion</span>
                  <select
                    aria-label="Tipo de senal para seleccion"
                    value={bulkSignalKind}
                    onChange={(event) => setBulkSignalKind(event.target.value as LibrarySelectionSignalKind)}
                  >
                    {librarySelectionSignalOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="bulk-signal-control">
                  <span className="sr-only">{bulkSignalOption.label} para seleccion</span>
                  <input
                    aria-label={`${bulkSignalOption.label} para seleccion`}
                    placeholder={bulkSignalOption.placeholder}
                    value={bulkSignalText}
                    onChange={(event) => setBulkSignalText(event.target.value)}
                  />
                </label>
                <button
                  className="secondary-button"
                  disabled={!bulkSignalText.trim()}
                  type="button"
                  onClick={() => void addSelectedItemsSignals(bulkSignalKind)}
                >
                  <Plus size={16} />
                  Añadir {bulkSignalLabels.plural}
                </button>
                <button
                  className="ghost-button"
                  disabled={!bulkSignalText.trim()}
                  type="button"
                  onClick={() => void removeSelectedItemsSignals(bulkSignalKind)}
                >
                  <X size={16} />
                  Quitar {bulkSignalLabels.plural}
                </button>
                <button
                  className="secondary-button"
                  disabled={selectedDiceEligibleCount === 0}
                  type="button"
                  onClick={() => void snoozeSelectedItems()}
                >
                  <Moon size={16} />
                  Enfriar dado
                </button>
                <button
                  className="secondary-button"
                  disabled={selectedCooldownCount === 0}
                  type="button"
                  onClick={() => void reactivateSelectedItems()}
                >
                  <RotateCcw size={16} />
                  Reactivar dado
                </button>
                <button className="ghost-button" type="button" onClick={() => setSelectedItemIds([])}>
                  <X size={16} />
                  Limpiar
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => {
                    setSelectedDeleteConfirmText('')
                    setSelectedDeleteDialogOpen(true)
                  }}
                >
                  <Trash2 size={16} />
                  Borrar seleccion
                </button>
              </>
            )}
          </div>
        )}
          </div>
        </details>

        {library.loading && <FeedbackMessage tone="loading">Cargando biblioteca...</FeedbackMessage>}
        {library.error && <FeedbackMessage tone="danger">{library.error}</FeedbackMessage>}
        <ToastStack label="Accion reciente de biblioteca Notificaciones" toasts={libraryToasts} onDismiss={dismissLibraryToast} />
        {libraryLinkCopy && (
          <div className="link-copy-feedback" aria-label={`Enlace listo para ${libraryLinkCopy.title}`}>
            <input
              aria-label="Enlace de ficha"
              readOnly
              value={libraryLinkCopy.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )}
        {missingActivityFocus && (
          <div className="feedback-action-row" aria-label="Actividad sin entrada">
            <FeedbackMessage>
              Esa actividad ya no tiene una entrada en la biblioteca. Puedes buscar algo parecido a "{missingActivitySearchQuery}".
            </FeedbackMessage>
            <button className="secondary-button" type="button" onClick={searchMissingActivityFocus}>
              <Search size={16} />
              Buscar parecido
            </button>
            <button className="ghost-button" type="button" onClick={clearMissingActivityFocus}>
              Cerrar aviso
            </button>
          </div>
        )}
        {pendingLibraryImport && (
          <div className="backup-import-preview" aria-label="Backup preparado en biblioteca">
            <div>
              <strong>{pendingLibraryImport.fileName}</strong>
              <span>{formatBackupImportSummary(pendingLibraryImport.summary)}</span>
              <small>{pendingLibraryImport.summary.totalItems} entradas revisadas antes de aplicar</small>
            </div>
            {pendingLibraryImport.summary.settingsIncluded && (
              <label className="check-row">
                <input
                  checked={applyLibraryImportSettings}
                  type="checkbox"
                  onChange={(event) => setApplyLibraryImportSettings(event.target.checked)}
                />
                Aplicar ajustes del backup
              </label>
            )}
            <div className="action-row end">
              <button className="ghost-button" type="button" onClick={cancelLibraryImportFile}>
                <X size={16} />
                Cancelar
              </button>
              <button className="primary-button" type="button" onClick={() => void applyLibraryImportFile()}>
                <Upload size={16} />
                Aplicar backup
              </button>
            </div>
          </div>
        )}
        {showFocusShelf && (
          <section className="library-focus-shelf" aria-label="Sugerencias de biblioteca" data-testid="library-focus-shelf">
            <div className="focus-shelf-heading">
              <div>
                <h3>Sugerencias</h3>
                <p>Entradas listas para seguir.</p>
              </div>
              <span>{secondaryFocusItems.length} sugeridas</span>
            </div>
            <div className="focus-shelf-grid">
              {secondaryFocusItems.map((item) => {
                const primaryAction = getPrimaryItemAction(item.status)

                return (
                  <article className="focus-item" key={item.id}>
                    <button className="focus-item-main" type="button" onClick={() => openLibraryEditor(item)}>
                      <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{getLibraryFocusReason(item)}</small>
                      </span>
                    </button>
                    <button
                      className="focus-item-action"
                      type="button"
                      aria-label={`Accion de foco para ${item.title}: ${primaryAction.label}`}
                      onClick={() => void changeLibraryItemStatus(item, primaryAction.nextStatus)}
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
          <div
            className="item-grid mosaic-view"
            data-cards-per-row={libraryCardsPerRow}
            data-testid="library-grid"
            style={libraryGridStyle}
          >
            {filteredItems.map((item) => (
              <ItemCard
                item={item}
                key={item.id}
                layout="mosaic"
                isSelected={selectedItemIdSet.has(item.id)}
                showSelectionControl={isLibraryAdvancedOpen || selectedItemIdSet.has(item.id)}
                onToggleSelected={() => toggleLibraryItemSelection(item.id)}
                onEdit={() => openLibraryEditor(item)}
                onCopyLink={() => void copyLibraryItemLink(item)}
                onStatus={(status) => void changeLibraryItemStatus(item, status)}
                onSnooze={() => void snoozeLibraryItem(item)}
                onReactivate={() => void reactivateLibraryItem(item)}
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
                ? trimmedQuery
                  ? `No existe nada para "${trimmedQuery}". Puedes crear una ficha con esa busqueda o limpiar filtros.`
                  : 'Limpia filtros o prueba una busqueda menos concreta para volver a ver tu biblioteca.'
                : 'Importa tu biblioteca, guarda algo desde Explorador o anade una entrada manual.'
            }
            action={
              hasActiveLibraryFilters ? (
                <div className="action-row">
                  {trimmedQuery && (
                    <button
                      aria-label={`Crear entrada ${trimmedQuery}`}
                      className="primary-button"
                      type="button"
                      onClick={createItemFromCurrentSearch}
                    >
                      <Plus size={16} />
                      Crear entrada
                    </button>
                  )}
                  <button className="secondary-button" type="button" onClick={resetLibraryFilters}>
                    <X size={16} />
                    Quitar filtros
                  </button>
                </div>
              ) : (
                <button className="primary-button" type="button" onClick={() => openLibraryEditor(blankItem())}>
                  <Plus size={16} />
                  Crear primera entrada
                </button>
              )
            }
          />
        )}
      </section>

      {editorItem && (
        <ItemEditor
          item={editorItem}
          onClose={closeLibraryEditor}
          onDelete={deleteLibraryEditorItem}
          onSave={saveLibraryEditorItem}
        />
      )}

      {sourceCreditsOpen && <SourceCreditsDialog onClose={() => setSourceCreditsOpen(false)} />}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <DialogFocusReturn />
          <form
            aria-labelledby="delete-item-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onKeyDown={(event) => handleDialogKeyDown(event, () => setDeleteTarget(undefined))}
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
              <button className="ghost-button" type="button" autoFocus onClick={() => setDeleteTarget(undefined)}>
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

      {selectedDeleteDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <DialogFocusReturn />
          <form
            aria-labelledby="delete-selected-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onKeyDown={(event) =>
              handleDialogKeyDown(event, () => {
                setSelectedDeleteDialogOpen(false)
                setSelectedDeleteConfirmText('')
              })
            }
            onSubmit={(event) => {
              event.preventDefault()
              if (selectedDeleteConfirmText === 'BORRAR') void deleteSelectedItems()
            }}
          >
            <div>
              <h2 id="delete-selected-title">Borrar seleccion</h2>
              <p>
                Esto elimina {selectedItems.length} entradas privadas seleccionadas. Podras deshacerlo justo despues.
              </p>
            </div>
            <label>
              Confirmacion
              <input
                autoFocus
                value={selectedDeleteConfirmText}
                onChange={(event) => setSelectedDeleteConfirmText(event.target.value)}
                placeholder="BORRAR"
              />
            </label>
            <div className="action-row end">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setSelectedDeleteDialogOpen(false)
                  setSelectedDeleteConfirmText('')
                }}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={selectedDeleteConfirmText !== 'BORRAR' || selectedItems.length === 0}
                type="submit"
              >
                <Trash2 size={16} />
                Borrar seleccion
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <DialogFocusReturn />
          <form
            aria-labelledby="delete-all-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onKeyDown={(event) =>
              handleDialogKeyDown(event, () => {
                setDeleteDialogOpen(false)
                setDeleteConfirmText('')
              })
            }
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

function DiceTab({
  library,
  cooldownReactivateRequest,
  saveRequest,
  rollRequest,
  onActivity,
  onCooldownReactivateRequestHandled,
  onSaveRequestHandled,
  onRollRequestHandled,
  onRollSummaryChange,
  onUnsavedChange,
}: {
  library: LibrarySurface
  cooldownReactivateRequest?: DiceCooldownReactivateRequest
  saveRequest?: DicePreferencesSaveRequest
  rollRequest?: DiceRollRequest
  onActivity: ActivityRecorder
  onCooldownReactivateRequestHandled: () => void
  onSaveRequestHandled: () => void
  onRollRequestHandled: () => void
  onRollSummaryChange: (summary: DiceRollSummary) => void
  onUnsavedChange: (hasUnsavedChanges: boolean) => void
}) {
  const [draftPreferences, setDraftPreferences] = useState<RecommendationPreferences | undefined>()
  const [recommendation, setRecommendation] = useState<RecommendationResult | undefined>()
  const [editingDiceItem, setEditingDiceItem] = useState<ListItem | undefined>()
  const [isRolling, setIsRolling] = useState(false)
  const [showFullDicePool, setShowFullDicePool] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const [diceUndoAction, setDiceUndoAction] = useState<DiceUndoAction | undefined>()
  const [diceSettingsUndo, setDiceSettingsUndo] = useState<DiceSettingsUndo | undefined>()
  const [diceDecisionSummary, setDiceDecisionSummary] = useState<DiceDecisionSummary | undefined>()
  const handledCooldownReactivateRequestId = useRef<number | undefined>(undefined)
  const handledSaveRequestId = useRef<number | undefined>(undefined)
  const handledRollRequestId = useRef<number | undefined>(undefined)
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
  const recommendationLearningSignals = useMemo(
    () => (recommendation ? getRecommendationLearningSignals(recommendation.item, library.settings) : undefined),
    [library.settings, recommendation],
  )
  const activeDiceDecision =
    recommendation && diceDecisionSummary?.itemId === recommendation.item.id ? diceDecisionSummary : undefined
  const hasCandidates = scoredCandidates.length > 0
  const cooldownRecoveryItems = useMemo(
    () =>
      library.items.filter(
        (item) => item.status !== 'completed' && item.status !== 'dropped' && isItemInCooldown(item),
      ),
    [library.items],
  )

  useLayoutEffect(() => {
    onUnsavedChange(hasUnsavedDicePreferences)
    return () => onUnsavedChange(false)
  }, [hasUnsavedDicePreferences, onUnsavedChange])

  useEffect(() => {
    onRollSummaryChange({ candidateCount: scoredCandidates.length })
  }, [onRollSummaryChange, scoredCandidates.length])

  const diceRecoveryActions: DiceRecoveryAction[] = [
    ...(cooldownRecoveryItems.length
      ? [
          {
            detail: `${cooldownRecoveryItems.length} en cooldown`,
            Icon: RotateCcw,
            id: 'reactivate-cooldowns',
            label: 'Reactivar cooldowns',
            onClick: () => void reactivateDiceCooldowns(),
          },
        ]
      : []),
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
    setDiceUndoAction(undefined)
    setDiceSettingsUndo(undefined)
    setDiceDecisionSummary(undefined)
    setDraftPreferences((current) => (typeof update === 'function' ? update(current ?? preferences) : update))
  }

  function openDiceDecisionItem() {
    if (!recommendation) return
    setEditingDiceItem(library.items.find((item) => item.id === recommendation.item.id) ?? recommendation.item)
  }

  function getDiceSettingsUndo(kind: DiceSettingsUndo['kind']): DiceSettingsUndo {
    return {
      allowPausedByDefault: library.settings.allowPausedByDefault,
      favoriteGenres: [...library.settings.favoriteGenres],
      favoriteTags: [...library.settings.favoriteTags],
      kind,
      preferences: cloneRecommendationPreferences(persistedPreferences),
      surprisePercent: library.settings.surprisePercent,
    }
  }

  const rollRecommendation = useCallback(async (excludedItemId?: string) => {
    const rollItems = excludedItemId ? library.items.filter((item) => item.id !== excludedItemId) : library.items
    const rollCandidates = scoreCandidates(rollItems, preferences, library.settings)

    if (!rollCandidates.length) {
      setRecommendation(undefined)
      setDiceDecisionSummary(undefined)
      setStatus(
        excludedItemId
          ? 'No quedan candidatas distintas con estos filtros.'
          : 'No hay candidatas disponibles con estos filtros.',
      )
      return
    }

    setIsRolling(true)
    setStatus(undefined)
    setDiceUndoAction(undefined)
    setDiceSettingsUndo(undefined)
    setDiceDecisionSummary(undefined)
    setRecommendation(undefined)
    const next = recommendItem(
      rollItems,
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
    if (next) {
      await library.recordRecommendation(next.item.id, next.reasons)
      onActivity({
        detail: next.item.title,
        label: 'Tirada registrada',
        tab: 'dice',
        target: { kind: 'item', id: next.item.id },
        tone: 'success',
      })
    }
  }, [library, onActivity, preferences])

  async function rollAnotherRecommendation() {
    if (!recommendation) return
    await rollRecommendation(recommendation.item.id)
  }

  const savePreferences = useCallback(async () => {
    if (!hasUnsavedDicePreferences) return

    const previousDiceSettings: DiceSettingsUndo = {
      allowPausedByDefault: library.settings.allowPausedByDefault,
      favoriteGenres: [...library.settings.favoriteGenres],
      favoriteTags: [...library.settings.favoriteTags],
      kind: 'preferences',
      preferences: cloneRecommendationPreferences(persistedPreferences),
      surprisePercent: library.settings.surprisePercent,
    }
    const nextPreferences = cloneRecommendationPreferences(preferences)

    try {
      await library.saveSettings({
        recommendationPreferences: nextPreferences,
        surprisePercent: nextPreferences.surprisePercent,
        allowPausedByDefault: nextPreferences.includePaused,
      })
      setDraftPreferences(undefined)
      setDiceUndoAction(undefined)
      setDiceSettingsUndo(previousDiceSettings)
      setStatus('Ajustes del dado guardados')
      onActivity({
        detail: `${nextPreferences.surprisePercent}% sorpresa / ${typeLabels[nextPreferences.medium]}`,
        label: 'Preferencias guardadas',
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron guardar los ajustes del dado.')
    }
  }, [hasUnsavedDicePreferences, library, onActivity, persistedPreferences, preferences])

  useEffect(() => {
    if (!saveRequest || handledSaveRequestId.current === saveRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSaveRequestId.current === saveRequest.requestId) return

      handledSaveRequestId.current = saveRequest.requestId
      void savePreferences().finally(onSaveRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onSaveRequestHandled, savePreferences, saveRequest])

  async function undoDicePreferencesSave() {
    if (!diceSettingsUndo) return

    const undoStatus =
      diceSettingsUndo.kind === 'taste' ? 'Gustos del dado recuperados' : 'Ajustes del dado recuperados'
    const undoActivityLabel = diceSettingsUndo.kind === 'taste' ? 'Gustos recuperados' : 'Preferencias recuperadas'
    const undoActivityDetail =
      diceSettingsUndo.kind === 'taste'
        ? `${diceSettingsUndo.favoriteGenres.length + diceSettingsUndo.favoriteTags.length} gustos previos`
        : `${diceSettingsUndo.preferences.surprisePercent}% sorpresa / ${typeLabels[diceSettingsUndo.preferences.medium]}`

    try {
      await library.saveSettings(
        diceSettingsUndo.kind === 'taste'
          ? {
              favoriteGenres: [...diceSettingsUndo.favoriteGenres],
              favoriteTags: [...diceSettingsUndo.favoriteTags],
            }
          : {
              favoriteGenres: [...diceSettingsUndo.favoriteGenres],
              favoriteTags: [...diceSettingsUndo.favoriteTags],
              recommendationPreferences: cloneRecommendationPreferences(diceSettingsUndo.preferences),
              surprisePercent: diceSettingsUndo.surprisePercent,
              allowPausedByDefault: diceSettingsUndo.allowPausedByDefault,
            },
      )
      if (diceSettingsUndo.kind === 'preferences') setDraftPreferences(undefined)
      setDiceSettingsUndo(undefined)
      setDiceUndoAction(undefined)
      setStatus(undoStatus)
      onActivity({
        detail: undoActivityDetail,
        label: undoActivityLabel,
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron recuperar los ajustes del dado.')
    }
  }

  async function startRecommendation() {
    if (!recommendation) return
    try {
      await library.setStatus(recommendation.item.id, 'in_progress')
      setDiceSettingsUndo(undefined)
      setDiceUndoAction({
        kind: 'status',
        itemId: recommendation.item.id,
        previousStatus: recommendation.item.status,
        title: recommendation.item.title,
      })
      setDiceDecisionSummary({
        detail: 'Ya esta en curso. Puedes afinar la ficha o tirar otra opcion para dejar otra preparada.',
        itemId: recommendation.item.id,
        kind: 'started',
        title: `${recommendation.item.title} iniciado`,
      })
      setStatus(`${recommendation.item.title} marcado como en progreso.`)
      onActivity({
        detail: recommendation.item.title,
        label: 'Recomendacion iniciada',
        tab: 'dice',
        target: { kind: 'item', id: recommendation.item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el estado.')
    }
  }

  async function learnRecommendationTaste() {
    if (!recommendation || !recommendationLearningSignals?.total) return

    const learnedLabels = [...recommendationLearningSignals.genres, ...recommendationLearningSignals.tags]
    try {
      await library.saveSettings({
        favoriteGenres: uniqueNormalizedValues([...library.settings.favoriteGenres, ...recommendationLearningSignals.genres]),
        favoriteTags: uniqueNormalizedValues([...library.settings.favoriteTags, ...recommendationLearningSignals.tags]),
      })
      setDiceSettingsUndo(getDiceSettingsUndo('taste'))
      setDiceUndoAction(undefined)
      setStatus(`${recommendation.item.title}: ${learnedLabels.length} gustos aprendidos`)
      onActivity({
        detail: learnedLabels.slice(0, 4).join(', '),
        label: 'Gustos aprendidos',
        tab: 'dice',
        target: { kind: 'item', id: recommendation.item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron aprender estos gustos.')
    }
  }

  async function skipRecommendation() {
    if (!recommendation) return
    try {
      await library.snoozeRecommendation(recommendation.item.id)
      setDiceSettingsUndo(undefined)
      setDiceUndoAction({ kind: 'snooze', recommendation, title: recommendation.item.title })
      setDiceDecisionSummary({
        detail: 'Queda fuera hasta manana para que el dado no insista con la misma recomendacion.',
        itemId: recommendation.item.id,
        kind: 'snoozed',
        title: `${recommendation.item.title} apartado`,
      })
      setStatus(`${recommendation.item.title} queda fuera hasta manana.`)
      onActivity({
        detail: recommendation.item.title,
        label: 'Recomendacion enfriada',
        tab: 'dice',
        target: { kind: 'item', id: recommendation.item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo apartar la recomendacion.')
    }
  }

  const reactivateDiceCooldowns = useCallback(async () => {
    if (!cooldownRecoveryItems.length) return
    const count = cooldownRecoveryItems.length
    const recoverySnapshot = cooldownRecoveryItems.map((item) => ({ ...item }))
    try {
      await Promise.all(cooldownRecoveryItems.map((item) => library.reactivateRecommendation(item.id)))
      setDiceSettingsUndo(undefined)
      setDiceUndoAction({ kind: 'cooldowns', items: recoverySnapshot })
      setRecommendation(undefined)
      setDiceDecisionSummary(undefined)
      setStatus(count === 1 ? '1 entrada reactivada para el dado' : `${count} entradas reactivadas para el dado`)
      onActivity({
        detail: count === 1 ? '1 entrada en cooldown' : `${count} entradas en cooldown`,
        label: 'Cooldowns reactivados',
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron reactivar las entradas.')
    }
  }, [cooldownRecoveryItems, library, onActivity])

  useEffect(() => {
    if (!cooldownReactivateRequest || handledCooldownReactivateRequestId.current === cooldownReactivateRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledCooldownReactivateRequestId.current === cooldownReactivateRequest.requestId) return

      handledCooldownReactivateRequestId.current = cooldownReactivateRequest.requestId
      void reactivateDiceCooldowns().finally(onCooldownReactivateRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [cooldownReactivateRequest, onCooldownReactivateRequestHandled, reactivateDiceCooldowns])

  async function saveDiceItemEdits(item: ListItem) {
    try {
      await library.saveItem(item)
      setEditingDiceItem(undefined)
      setRecommendation((current) => (current?.item.id === item.id ? { ...current, item } : current))
      setDiceDecisionSummary((current) =>
        current?.itemId === item.id
          ? { ...current, title: current.kind === 'started' ? `${item.title} iniciado` : `${item.title} apartado` }
          : current,
      )
      setDiceUndoAction(undefined)
      setDiceSettingsUndo(undefined)
      setStatus(`${item.title || 'Entrada'} afinada desde el dado.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Ficha afinada',
        tab: 'dice',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.')
    }
  }

  async function deleteDiceItem(item: ListItem) {
    try {
      await library.deleteItem(item.id)
      setEditingDiceItem(undefined)
      setRecommendation((current) => (current?.item.id === item.id ? undefined : current))
      setDiceDecisionSummary((current) => (current?.itemId === item.id ? undefined : current))
      setDiceUndoAction(undefined)
      setDiceSettingsUndo(undefined)
      setStatus(`${item.title || 'Entrada'} eliminada de Biblioteca.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Entrada eliminada',
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo borrar la entrada.')
    }
  }

  function applyDicePreset(preferencesPreset: RecommendationPreferences) {
    setPreferences(preferencesPreset)
  }

  async function undoDiceDecision() {
    if (!diceUndoAction) return

    try {
      if (diceUndoAction.kind === 'status') {
        await library.setStatus(diceUndoAction.itemId, diceUndoAction.previousStatus)
        setStatus(`${diceUndoAction.title} recuperado como ${statusLabels[diceUndoAction.previousStatus]}`)
        onActivity({
          detail: `${diceUndoAction.title} -> ${statusLabels[diceUndoAction.previousStatus]}`,
          label: 'Decision recuperada',
          tab: 'dice',
          target: { kind: 'item', id: diceUndoAction.itemId },
          tone: 'success',
        })
      } else if (diceUndoAction.kind === 'snooze') {
        await library.reactivateRecommendation(diceUndoAction.recommendation.item.id)
        setRecommendation(diceUndoAction.recommendation)
        setStatus(`${diceUndoAction.title} reactivado para el dado`)
        onActivity({
          detail: diceUndoAction.title,
          label: 'Recomendacion recuperada',
          tab: 'dice',
          target: { kind: 'item', id: diceUndoAction.recommendation.item.id },
          tone: 'success',
        })
      } else {
        for (const item of diceUndoAction.items) {
          await library.setRecommendationCooldown(item.id, item.recommendationCooldownUntil)
        }
        setRecommendation(undefined)
        setStatus(diceUndoAction.items.length === 1 ? '1 cooldown recuperado' : `${diceUndoAction.items.length} cooldowns recuperados`)
        onActivity({
          detail: diceUndoAction.items.length === 1 ? '1 cooldown restaurado' : `${diceUndoAction.items.length} cooldowns restaurados`,
          label: 'Cooldowns recuperados',
          tab: 'dice',
          tone: 'success',
        })
      }
      setDiceUndoAction(undefined)
      setDiceDecisionSummary(undefined)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer la decision del dado.')
    }
  }

  function getDiceUndoLabel() {
    if (!diceUndoAction) return 'Deshacer decision'
    if (diceUndoAction.kind === 'status') return 'Deshacer estado'
    if (diceUndoAction.kind === 'snooze') return 'Deshacer enfriado'
    return 'Deshacer reactivacion'
  }

  function getDiceSettingsUndoLabel() {
    if (!diceSettingsUndo) return 'Deshacer ajustes del dado'
    return diceSettingsUndo.kind === 'taste' ? 'Deshacer gustos' : 'Deshacer ajustes del dado'
  }

  useEffect(() => {
    if (!rollRequest || handledRollRequestId.current === rollRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledRollRequestId.current === rollRequest.requestId) return

      handledRollRequestId.current = rollRequest.requestId
      void rollRecommendation().finally(onRollRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onRollRequestHandled, rollRecommendation, rollRequest])

  const shouldShowDiceResult = isRolling || Boolean(recommendation) || !hasCandidates

  return (
    <section className={shouldShowDiceResult ? 'dice-layout has-dice-result' : 'dice-layout dice-idle'}>
      <section className="workspace-panel dice-hero" aria-label="Dado ponderado">
        <div className="dice-hero-copy">
          <span className="tool-mode-badge dice-mode-badge">
            <Dice5 size={15} />
            Dado
          </span>
          <span className="eyebrow">Guardadas / elegir ahora</span>
          <h2>Que sigo ahora?</h2>
          <p className="hero-copy">Elige una obra que ya guardaste. Para encontrar algo nuevo, abre Explorar.</p>
          <div className="intent-flow dice-intent-flow" aria-label="Que hace el dado" data-testid="dice-job">
            <span>
              <Library size={14} />
              Guardadas
            </span>
            <span>
              <Dice5 size={14} />
              Tirada
            </span>
            <span>
              <Play size={14} />
              Empiezas
            </span>
          </div>
          <p className="tool-boundary dice-boundary">
            <LockKeyhole size={14} />
            No busca fuera ni crea fichas.
          </p>
        </div>
        <div className="dice-action-stage">
          {candidatePreview.length > 0 && (
            <div className="dice-deck-peek" aria-hidden="true">
              {candidatePreview.slice(0, 3).map((candidate) => (
                <CoverArt
                  key={candidate.item.id}
                  title={candidate.item.title}
                  type={candidate.item.type}
                  posterUrl={candidate.item.posterUrl}
                />
              ))}
            </div>
          )}
          <button
            className={isRolling ? 'dice-orb rolling' : 'dice-orb'}
            disabled={isRolling || !hasCandidates}
            type="button"
            onClick={() => void rollRecommendation()}
            data-testid="roll-button"
            aria-label="Tirar dado ponderado"
          >
            <span className="dice-orb-kicker">{scoredCandidates.length ? `${scoredCandidates.length} candidatas` : 'Sin candidatas'}</span>
            <Dice5 size={42} />
            <strong>{isRolling ? 'Eligiendo' : recommendation ? 'Tirar otra' : 'Elegir ahora'}</strong>
          </button>
        </div>
        <div className="dice-readiness" aria-label="Resumen del dado" data-testid="dice-readiness" role="group">
          <div className={`${hasCandidates ? 'dice-readiness-card ready' : 'dice-readiness-card warning'}${topCandidate ? ' with-cover' : ''}`}>
            {topCandidate && (
              <CoverArt title={topCandidate.item.title} type={topCandidate.item.type} posterUrl={topCandidate.item.posterUrl} />
            )}
            <span>{hasCandidates ? 'Listo para tirar' : 'Sin tirada posible'}</span>
            <strong>{topCandidate ? topCandidate.item.title : 'Ajusta filtros'}</strong>
            <small>
              {topCandidate
                ? `${topCandidate.reasons[0] ?? 'Mejor candidata'} / guardada`
                : 'Afloja medio, tiempo, tags o pausados.'}
            </small>
          </div>
          <div className="dice-readiness-metrics">
            <span>
              <strong>{scoredCandidates.length}</strong>
              Candidatas guardadas
            </span>
            <span>
              <strong>{intensityLabels[preferences.intensity]}</strong>
              Modo
            </span>
            <span>
              <strong>{hasUnsavedDicePreferences ? '!' : 'OK'}</strong>
              Ajustes
            </span>
          </div>
          {(preferences.includePaused || library.settings.blockedTags.length > 0) && (
            <div className="dice-active-filter-strip" aria-label="Filtros activos del dado">
              {preferences.includePaused && <span>Incluye pausados</span>}
              {library.settings.blockedTags.length > 0 && <span>{library.settings.blockedTags.length} senales bloqueadas</span>}
            </div>
          )}
        </div>
      </section>

      <section className="workspace-panel dice-queue">
        <div className="panel-heading compact">
          <div>
            <h2>Candidatas guardadas</h2>
            <p>{scoredCandidates.length ? `${scoredCandidates.length} entradas pueden salir` : 'Sin candidatas con estos filtros'}</p>
          </div>
        </div>
        {topCandidate && (
          <button className="dice-featured-candidate" type="button" onClick={() => setEditingDiceItem(topCandidate.item)}>
            <CoverArt title={topCandidate.item.title} type={topCandidate.item.type} posterUrl={topCandidate.item.posterUrl} />
            <span className="dice-featured-copy">
              <small>Mejor encaje ahora</small>
              <strong>{topCandidate.item.title}</strong>
              <em>{topCandidate.reasons[0] ?? 'Lista para salir'}</em>
            </span>
            <span className="dice-featured-score">
              <small>Encaje</small>
              <strong>{topCandidate.score}</strong>
            </span>
          </button>
        )}
        {candidatePreview.length ? (
          <details className="dice-pool-detail" data-close-on-outside>
            <summary>
              <span>
                <strong>Por que pueden salir</strong>
                <small>{unavailableCount} fuera por estado, cooldown o filtros</small>
              </span>
              <em>{showFullDicePool ? `${candidatePreview.length} visibles` : `${candidatePreview.length} de ${scoredCandidates.length}`}</em>
            </summary>
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
                  <span className="dice-candidate-score" aria-label={`Encaje ${candidate.score} de ${candidate.item.title}`}>
                    <span>Encaje</span>
                    <strong>{candidate.score}</strong>
                    <span className="dice-score-meter" aria-hidden="true">
                      <span style={{ width: getDiceScoreMeterWidth(candidate.score, maxCandidateScore) }} />
                    </span>
                  </span>
                </li>
                )
              })}
            </ol>
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
          </details>
        ) : (
          <>
            <EmptyState
              icon={Dice5}
              title="Sin candidatas"
              detail="Afloja filtros, incluye pausados o anade pendientes desde Estanteria y Explorar."
            />
            <DiceEligibilityPanel
              activeFilters={activeDiceFilters}
              breakdown={eligibilityBreakdown}
              recoveryActions={diceRecoveryActions}
            />
          </>
        )}
      </section>

      <section className="workspace-panel dice-settings">
        <details className="dice-settings-panel" data-close-on-outside open={hasUnsavedDicePreferences}>
          <summary aria-label="Abrir modos de tirada">
            <span className="dice-settings-summary-copy">
              <strong>Afinar tirada</strong>
              <small>{preferences.surprisePercent}% sorpresa / {intensityLabels[preferences.intensity]}</small>
            </span>
            <span className={hasUnsavedDicePreferences ? 'dice-settings-summary-state pending' : 'dice-settings-summary-state'}>
              {hasUnsavedDicePreferences ? 'Pendiente' : `${scoredCandidates.length} candidatas`}
            </span>
          </summary>
          <div className="dice-settings-content">
            <div className="panel-heading">
              <div>
                <h2>Modos de tirada</h2>
                <p>Presets rapidos y filtros para cuando quieras controlar el azar.</p>
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
            <details className="dice-tuning-panel" data-close-on-outside open={hasUnsavedDicePreferences}>
              <summary>
                <span>Filtros concretos</span>
                <small>Medio, tiempo, energia y sorpresa</small>
              </summary>
              <PreferenceControls preferences={preferences} setPreferences={setPreferences} />
            </details>
          </div>
        </details>
        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
        {(diceSettingsUndo || diceUndoAction) && (
          <div className="feedback-action-row" aria-label="Accion reciente del dado">
            {diceSettingsUndo && (
              <button className="secondary-button" type="button" onClick={() => void undoDicePreferencesSave()}>
                <RotateCcw size={16} />
                {getDiceSettingsUndoLabel()}
              </button>
            )}
            {diceUndoAction && (
              <button className="secondary-button" type="button" onClick={() => void undoDiceDecision()}>
                <RotateCcw size={16} />
                {getDiceUndoLabel()}
              </button>
            )}
          </div>
        )}
      </section>

      {shouldShowDiceResult && (
        <section className="workspace-panel result-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Tu siguiente obra</h2>
              <p>{recommendation ? `Elegida entre ${recommendation.poolSize}` : isRolling ? 'Eligiendo ahora' : 'Sin decision todavia'}</p>
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
            <div
              className={recommendation.item.posterUrl ? 'recommendation-result revealed-result has-poster' : 'recommendation-result revealed-result'}
              data-testid="recommendation-result"
              style={getPosterBackplateStyle(recommendation.item.posterUrl)}
            >
            <div className="recommendation-head">
              <CoverArt title={recommendation.item.title} type={recommendation.item.type} posterUrl={recommendation.item.posterUrl} />
              <div className="recommendation-summary">
                <span className="eyebrow">Dado eligio</span>
                <ItemIdentity item={recommendation.item} />
                {activeDiceDecision ? (
                  <section
                    className={`recommendation-decision-complete ${activeDiceDecision.kind}`}
                    aria-label="Decision cerrada del dado"
                    data-testid="dice-decision-summary"
                  >
                    <div className="recommendation-decision-complete-main">
                      {activeDiceDecision.kind === 'started' ? <Play size={17} /> : <Moon size={17} />}
                      <div>
                        <span className="eyebrow">Decision cerrada</span>
                        <strong>{activeDiceDecision.title}</strong>
                        <p>{activeDiceDecision.detail}</p>
                      </div>
                    </div>
                    <div className="recommendation-decision-complete-actions">
                      {activeDiceDecision.kind === 'started' && (
                        <button className="secondary-button" type="button" onClick={openDiceDecisionItem}>
                          <Info size={16} />
                          Afinar ficha
                        </button>
                      )}
                      <button className="primary-button" type="button" onClick={() => void rollAnotherRecommendation()}>
                        <Dice5 size={16} />
                        Tirar otra
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="recommendation-decision" aria-label="Decision de la tirada">
                    <div>
                      <span className="eyebrow">Decision</span>
                      <strong>Quieres seguir con esta ahora?</strong>
                      <p>Empezar lo marca en curso. No hoy lo aparta hasta manana.</p>
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
                        aria-label="Afinar ficha recomendada"
                        onClick={openDiceDecisionItem}
                      >
                        <Info size={16} />
                        Afinar ficha
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
                )}
                <div className="recommendation-scoreboard" aria-label="Resumen de la tirada">
                  <div className="score-card primary">
                    <span>Encaje</span>
                    <strong>{recommendation.score}</strong>
                  </div>
                  <div className="score-card">
                    <span>Entre</span>
                    <strong>{recommendation.poolSize}</strong>
                  </div>
                  <div className="score-card">
                    <span>Modo</span>
                    <strong>{intensityLabels[preferences.intensity]}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="recommendation-detail-grid" aria-label="Detalles de la tirada">
              <details className="recommendation-detail-panel" data-close-on-outside>
                <summary>
                  <span>
                    <strong>Plan de sesion</strong>
                    <small>{getRecommendationSessionPlan(recommendation, preferences).title}</small>
                  </span>
                </summary>
                <RecommendationSessionPlanView plan={getRecommendationSessionPlan(recommendation, preferences)} />
              </details>
              <details className="recommendation-detail-panel" data-close-on-outside>
                <summary>
                  <span>
                    <strong>Por que sale</strong>
                    <small>{recommendation.reasons[0] ?? 'Mejor candidata ahora'}</small>
                  </span>
                </summary>
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
              </details>
            </div>
            {recommendationLearningSignals && recommendationLearningSignals.total > 0 && (
              <section className="recommendation-learning" aria-label="Aprendizaje de gustos del dado" data-testid="dice-learning">
                <div className="recommendation-learning-main">
                  <div>
                    <span className="eyebrow">Aprendizaje</span>
                    <strong>Senales para recordar</strong>
                  </div>
                  <div className="recommendation-learning-chips">
                    {recommendationLearningSignals.genres.map((genre) => (
                      <span key={`genre-${normalizeKey(genre)}`}>
                        <small>Genero</small>
                        {genre}
                      </span>
                    ))}
                    {recommendationLearningSignals.tags.map((tag) => (
                      <span key={`tag-${normalizeKey(tag)}`}>
                        <small>Tag</small>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="secondary-button" type="button" onClick={() => void learnRecommendationTaste()}>
                  <Sparkles size={16} />
                  Aprender gustos
                </button>
              </section>
            )}
            </div>
          ) : (
            <EmptyState
              icon={AlertTriangle}
              tone="warning"
              title="No hay tirada posible"
              detail="Cambia medio, tiempo, senales bloqueadas o incluye pausados para abrir el abanico."
            />
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
                      <button
                        aria-label={`Afinar tirada reciente ${item.title}`}
                        type="button"
                        onClick={() =>
                          setEditingDiceItem(library.items.find((libraryItem) => libraryItem.id === item.id) ?? item)
                        }
                      >
                        <span className={`recent-roll-icon ${item.type}`}>
                          <Icon size={14} />
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{formatRecentRecommendationTime(item.lastRecommendedAt)}</small>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="muted-line">Las tiradas guardadas apareceran aqui despues de usar el dado.</p>
            )}
          </section>
        </section>
      )}

      {editingDiceItem && (
        <ItemEditor
          item={editingDiceItem}
          onClose={() => setEditingDiceItem(undefined)}
          onDelete={deleteDiceItem}
          onSave={saveDiceItemEdits}
        />
      )}
    </section>
  )
}

function ExplorerTab({
  candidateDismissRequest,
  candidateRequest,
  candidateSaveRequest,
  library,
  onActivity,
  onCandidateDismissRequestHandled,
  onCandidateRequestHandled,
  onCandidateSaveRequestHandled,
  onPromptCardRequestHandled,
  onSearchRequestHandled,
  onVisibleDismissRequestHandled,
  onVisibleSaveRequestHandled,
  promptCardRequest,
  searchRequest,
  visibleDismissRequest,
  visibleSaveRequest,
}: {
  candidateDismissRequest?: ExplorerCandidateDismissRequest
  candidateRequest?: ExplorerCandidateRequest
  candidateSaveRequest?: ExplorerCandidateSaveRequest
  library: LibrarySurface
  onActivity: ActivityRecorder
  onCandidateDismissRequestHandled: () => void
  onCandidateRequestHandled: () => void
  onCandidateSaveRequestHandled: () => void
  onPromptCardRequestHandled: () => void
  onSearchRequestHandled: () => void
  onVisibleDismissRequestHandled: () => void
  onVisibleSaveRequestHandled: () => void
  promptCardRequest?: ExplorerPromptCardRequest
  searchRequest?: ExplorerSearchRequest
  visibleDismissRequest?: ExplorerVisibleDismissRequest
  visibleSaveRequest?: ExplorerVisibleSaveRequest
}) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DiscoveryStatus>('queued')
  const [sourceFilter, setSourceFilter] = useState<ExplorerSourceFilter>('all')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [bulkDismissUndo, setBulkDismissUndo] = useState<DiscoveryCandidate[]>([])
  const [bulkSaveUndo, setBulkSaveUndo] = useState<Array<{ candidate: DiscoveryCandidate; item: ListItem }>>([])
  const [savedExplorerItem, setSavedExplorerItem] = useState<ListItem | undefined>()
  const [savedExplorerUndo, setSavedExplorerUndo] = useState<{ candidate: DiscoveryCandidate; item: ListItem } | undefined>()
  const [editingSavedItem, setEditingSavedItem] = useState<ListItem | undefined>()
  const [selected, setSelected] = useState<DiscoveryCandidate | undefined>()
  const [catalogDraft, setCatalogDraft] = useState<PublicCatalogItem | undefined>()
  const [completedExplorerQueue, setCompletedExplorerQueue] = useState<CompletedExplorerQueue | undefined>()
  const [discoverType, setDiscoverType] = useState<ExternalDiscoverType>('any')
  const [discoverDuration, setDiscoverDuration] = useState<ExternalDiscoverDuration>('any')
  const [discoverCandidate, setDiscoverCandidate] = useState<DiscoveryCandidate | undefined>()
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const handledCandidateDismissRequestId = useRef<number | undefined>(undefined)
  const handledCandidateRequestId = useRef<number | undefined>(undefined)
  const handledCandidateSaveRequestId = useRef<number | undefined>(undefined)
  const handledPromptCardRequestId = useRef<number | undefined>(undefined)
  const handledSearchRequestId = useRef<number | undefined>(undefined)
  const handledVisibleDismissRequestId = useRef<number | undefined>(undefined)
  const handledVisibleSaveRequestId = useRef<number | undefined>(undefined)
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
    sourceCounts,
    spotlightCandidate,
    totalDiscoveryCount,
    visibleCandidates,
  } = explorerDecision
  const canSaveVisibleQueue = view === 'queued' && sourceFilter !== 'all' && visibleCandidates.length > 0
  const showCandidateFeedHeader = totalDiscoveryCount > 0 || visibleCandidates.length > 0 || view !== 'queued' || isSourceFilteredEmpty
  const explorerShelfItems = useMemo(() => library.items.slice(0, 3), [library.items])
  const explorerStarterIdeas = useMemo(() => {
    const seen = new Set<string>()
    const personalIdeas = explorerShelfItems
      .map((item) => ({
        id: item.id,
        kicker: `Desde ${typeLabels[item.type]}`,
        posterUrl: item.posterUrl,
        query: item.title,
        searchType: explorerSearchTypeForItemType(item.type),
        title: item.title,
        type: item.type,
      }))
      .filter((idea) => {
        const key = normalizeKey(idea.query)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    return [...personalIdeas, ...fallbackExplorerStarters.filter((idea) => !seen.has(normalizeKey(idea.query)))].slice(0, 2)
  }, [explorerShelfItems])
  const hasHeroStarterIdeas = totalDiscoveryCount === 0 && explorerStarterIdeas.length > 0

  const clearExplorerRecentActions = useCallback(() => {
    setBulkDismissUndo([])
    setBulkSaveUndo([])
    setSavedExplorerItem(undefined)
    setSavedExplorerUndo(undefined)
    setCompletedExplorerQueue(undefined)
  }, [])

  const getCompletedExplorerQueue = useCallback((resolvedCount: number, resolution: 'saved' | 'dismissed', sourceLabel = activeSourceLabel): CompletedExplorerQueue => {
    const actionLabel = resolution === 'saved' ? 'Ver guardados' : 'Ver descartes'
    const nextView = resolution === 'saved' ? 'saved' : 'dismissed'
    const resolvedLabel = resolvedCount === 1 ? '1 hallazgo' : `${resolvedCount} hallazgos`
    const verb = resolution === 'saved' ? 'guardado' : 'descartado'
    const pluralVerb = resolution === 'saved' ? 'guardados' : 'descartados'

    return {
      actionLabel,
      detail:
        resolvedCount === 1
          ? `${resolvedLabel} ${verb} desde ${sourceLabel}.`
          : `${resolvedLabel} ${pluralVerb} desde ${sourceLabel}.`,
      nextView,
      sourceLabel,
      title: `${sourceLabel} limpio`,
    }
  }, [activeSourceLabel])

  const candidateCompletesVisibleQueue = useCallback((candidate: DiscoveryCandidate) => {
    return view === 'queued' && visibleCandidates.length === 1 && visibleCandidates[0]?.id === candidate.id
  }, [view, visibleCandidates])

  function openCompletedExplorerQueue() {
    if (!completedExplorerQueue) return
    setView(completedExplorerQueue.nextView)
    setCompletedExplorerQueue(undefined)
  }

  function changeExplorerView(nextView: DiscoveryStatus) {
    setView(nextView)
    setCompletedExplorerQueue(undefined)
  }

  function changeExplorerSourceFilter(nextFilter: ExplorerSourceFilter) {
    setSourceFilter(nextFilter)
    setCompletedExplorerQueue(undefined)
  }

  const changeSearchType = useCallback(async (nextType: ExplorerSearchType) => {
    setMessage(undefined)
    clearExplorerRecentActions()
    try {
      await library.saveSettings({ explorerDefaultType: nextType })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar el tipo de busqueda.')
    }
  }, [clearExplorerRecentActions, library])

  const runDiscoverySearch = useCallback(async (searchQuery = query, searchType = type) => {
    const cleanedQuery = searchQuery.trim()
    setMessage(undefined)
    clearExplorerRecentActions()
    if (cleanedQuery.length < 2) {
      setMessage('Escribe al menos 2 caracteres para buscar.')
      return
    }

    setLoading(true)
    try {
      const [publicItems, externalCandidates] = await Promise.all([
        library.searchPublicCatalog(cleanedQuery, searchType),
        library.searchExternal(cleanedQuery, searchType),
      ])
      const candidates = rankCatalogSearchCandidates(
        uniqueDiscoveryCandidates([
          ...publicItems.map(library.publicItemToDiscovery),
          ...externalCandidates.map(library.externalCandidateToDiscovery),
        ]),
        cleanedQuery,
        searchType,
      )
      const queuedCount = await library.queueDiscoveryCandidates(candidates)
      setView('queued')
      setMessage(
        !candidates.length
          ? 'Sin resultados para esa busqueda.'
          : queuedCount
            ? `${queuedCount} hallazgos enviados a la cola.`
            : 'No hay hallazgos nuevos para esa busqueda.',
      )
      if (queuedCount) {
        onActivity({
          detail: `${queuedCount} hallazgos para "${cleanedQuery}"`,
          label: 'Busqueda en cola',
          tab: 'explorer',
          tone: 'success',
        })
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo completar la busqueda.')
    } finally {
      setLoading(false)
    }
  }, [clearExplorerRecentActions, library, onActivity, query, type])

  const runExternalDiscovery = useCallback(async () => {
    setMessage(undefined)
    clearExplorerRecentActions()
    setDiscoverLoading(true)
    try {
      const candidate = await discoverExternalCandidate(discoverType, discoverDuration)
      if (!candidate) {
        setDiscoverCandidate(undefined)
        setMessage('No encontre una recomendacion con portada. Prueba otra duracion o tipo.')
        return
      }

      const discoveryCandidate = library.externalCandidateToDiscovery(candidate)
      setDiscoverCandidate(discoveryCandidate)
      setMessage(`${discoveryCandidate.title} encontrado fuera de tu biblioteca.`)
      onActivity({
        detail: `${typeLabels[discoveryCandidate.type]} / ${sourceLabels[discoveryCandidate.source]}`,
        label: 'Explorador random',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo descubrir una obra.')
    } finally {
      setDiscoverLoading(false)
    }
  }, [clearExplorerRecentActions, discoverDuration, discoverType, library, onActivity])

  const addPromptCard = useCallback(async () => {
    try {
      clearExplorerRecentActions()
      const title = promptDeck[Math.floor(Math.random() * promptDeck.length)]
      await library.queueDiscoveryCandidates([promptToDiscovery(title)])
      setView('queued')
      setMessage('Pista de exploracion anadida.')
      onActivity({
        detail: title,
        label: 'Pista anadida',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo anadir la carta.')
    }
  }, [clearExplorerRecentActions, library, onActivity])

  const startExplorerIdea = useCallback(async (idea: (typeof explorerStarterIdeas)[number]) => {
    setQuery(idea.query)
    if (type !== idea.searchType) void changeSearchType(idea.searchType)
    await runDiscoverySearch(idea.query, idea.searchType)
  }, [changeSearchType, runDiscoverySearch, type])

  const recommendFromLibrary = useCallback(async () => {
    const personalIdea = explorerStarterIdeas.find((idea) => explorerShelfItems.some((item) => item.id === idea.id))
      ?? explorerStarterIdeas[0]

    if (personalIdea) {
      await startExplorerIdea(personalIdea)
      return
    }

    await addPromptCard()
  }, [addPromptCard, explorerShelfItems, explorerStarterIdeas, startExplorerIdea])

  const saveCandidate = useCallback(async (candidate: DiscoveryCandidate) => {
    const completedQueue = candidateCompletesVisibleQueue(candidate) ? getCompletedExplorerQueue(1, 'saved') : undefined
    try {
      setBulkDismissUndo([])
      setBulkSaveUndo([])
      const item = await library.saveDiscoveryToLibrary(candidate)
      setSavedExplorerItem(item)
      setSavedExplorerUndo({ candidate, item })
      setCompletedExplorerQueue(completedQueue)
      setMessage(`${item.title} guardado en Biblioteca.`)
      onActivity({
        detail: item.title,
        label: 'Hallazgo guardado',
        tab: 'explorer',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar el hallazgo.')
      return false
    }
  }, [candidateCompletesVisibleQueue, getCompletedExplorerQueue, library, onActivity])

  const saveDiscoverCandidate = useCallback(async (candidate: DiscoveryCandidate) => {
    try {
      setBulkDismissUndo([])
      setBulkSaveUndo([])
      const item = await library.saveDiscoveryToLibrary(candidate, { persistDiscoveryCandidate: false })
      setSavedExplorerItem(item)
      setSavedExplorerUndo(undefined)
      setDiscoverCandidate(undefined)
      setMessage(`${item.title} guardado en Biblioteca.`)
      onActivity({
        detail: item.title,
        label: 'Hallazgo guardado',
        tab: 'explorer',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar el hallazgo.')
      return false
    }
  }, [library, onActivity])

  function dismissDiscoverCandidate(candidate: DiscoveryCandidate) {
    setDiscoverCandidate(undefined)
    setMessage(`${candidate.title} descartado.`)
    onActivity({
      detail: candidate.title,
      label: 'Hallazgo descartado',
      tab: 'explorer',
      tone: 'success',
    })
  }

  const dismissCandidate = useCallback(async (candidate: DiscoveryCandidate) => {
    const completedQueue = candidateCompletesVisibleQueue(candidate) ? getCompletedExplorerQueue(1, 'dismissed') : undefined
    try {
      clearExplorerRecentActions()
      await library.dismissDiscoveryCandidate(candidate.id)
      setBulkDismissUndo([candidate])
      setCompletedExplorerQueue(completedQueue)
      setMessage(`${candidate.title} descartado de la cola.`)
      onActivity({
        detail: candidate.title,
        label: 'Hallazgo descartado',
        tab: 'explorer',
        tone: 'success',
      })
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo descartar el hallazgo.')
      return false
    }
  }, [candidateCompletesVisibleQueue, clearExplorerRecentActions, getCompletedExplorerQueue, library, onActivity])

  async function restoreCandidate(candidate: DiscoveryCandidate) {
    try {
      clearExplorerRecentActions()
      await library.restoreDiscoveryCandidate(candidate.id)
      setView('queued')
      setMessage(`${candidate.title} recuperado a la cola.`)
      onActivity({
        detail: candidate.title,
        label: 'Hallazgo recuperado',
        tab: 'explorer',
        tone: 'success',
      })
      return true
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo recuperar el hallazgo.')
      return false
    }
  }

  const dismissVisibleQueueForFilter = useCallback(async (targetFilter: ExplorerSourceFilter) => {
    setView('queued')
    setSourceFilter(targetFilter)
    setSelected(undefined)
    setCompletedExplorerQueue(undefined)

    if (targetFilter === 'all') return

    const sourceLabel = getExplorerSourceFilterLabel(targetFilter)
    const candidatesToDismiss = library.discoveryCandidates.filter(
      (candidate) => candidate.status === 'queued' && getDiscoverySourceFilter(candidate) === targetFilter,
    )
    if (!candidatesToDismiss.length) return
    const completedQueue = getCompletedExplorerQueue(candidatesToDismiss.length, 'dismissed', sourceLabel)

    try {
      await Promise.all(candidatesToDismiss.map((candidate) => library.dismissDiscoveryCandidate(candidate.id)))
      setSavedExplorerItem(undefined)
      setSavedExplorerUndo(undefined)
      setBulkSaveUndo([])
      setBulkDismissUndo(candidatesToDismiss)
      setCompletedExplorerQueue(completedQueue)
      setMessage(
        candidatesToDismiss.length === 1
          ? `${candidatesToDismiss[0].title} descartado de la vista ${sourceLabel}.`
          : `${candidatesToDismiss.length} hallazgos descartados de la vista ${sourceLabel}.`,
      )
      onActivity({
        detail: candidatesToDismiss.length === 1 ? candidatesToDismiss[0].title : `${candidatesToDismiss.length} hallazgos`,
        label: 'Vista descartada',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo limpiar la vista.')
    }
  }, [getCompletedExplorerQueue, library, onActivity])

  async function dismissVisibleQueue() {
    if (view !== 'queued') return
    await dismissVisibleQueueForFilter(sourceFilter)
  }

  const saveVisibleQueueForFilter = useCallback(async (targetFilter: ExplorerSourceFilter) => {
    setView('queued')
    setSourceFilter(targetFilter)
    setSelected(undefined)
    setCompletedExplorerQueue(undefined)

    if (targetFilter === 'all') return

    const sourceLabel = getExplorerSourceFilterLabel(targetFilter)
    const candidatesToSave = library.discoveryCandidates.filter(
      (candidate) => candidate.status === 'queued' && getDiscoverySourceFilter(candidate) === targetFilter,
    )
    if (!candidatesToSave.length) return
    const completedQueue = getCompletedExplorerQueue(candidatesToSave.length, 'saved', sourceLabel)

    const savedPairs: Array<{ candidate: DiscoveryCandidate; item: ListItem }> = []
    try {
      for (const candidate of candidatesToSave) {
        const item = await library.saveDiscoveryToLibrary(candidate)
        savedPairs.push({ candidate, item })
      }
      setBulkDismissUndo([])
      setBulkSaveUndo(savedPairs)
      setSavedExplorerItem(savedPairs.length === 1 ? savedPairs[0].item : undefined)
      setSavedExplorerUndo(undefined)
      setCompletedExplorerQueue(completedQueue)
      setMessage(
        savedPairs.length === 1
          ? `${savedPairs[0].item.title} guardado desde la vista ${sourceLabel}.`
          : `${savedPairs.length} hallazgos guardados desde la vista ${sourceLabel}.`,
      )
      onActivity({
        detail: savedPairs.length === 1 ? savedPairs[0].item.title : `${savedPairs.length} hallazgos`,
        label: 'Vista guardada',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar la vista.')
      if (savedPairs.length) setBulkSaveUndo(savedPairs)
    }
  }, [getCompletedExplorerQueue, library, onActivity])

  async function saveVisibleQueue() {
    if (view !== 'queued') return
    await saveVisibleQueueForFilter(sourceFilter)
  }

  async function undoDismissVisibleQueue() {
    const candidatesToRestore = bulkDismissUndo
    if (!candidatesToRestore.length) return

    try {
      await Promise.all(candidatesToRestore.map((candidate) => library.restoreDiscoveryCandidate(candidate.id)))
      setView('queued')
      clearExplorerRecentActions()
      setMessage(
        candidatesToRestore.length === 1
          ? `${candidatesToRestore[0].title} recuperado a la cola.`
          : `${candidatesToRestore.length} hallazgos recuperados a la cola.`,
      )
      onActivity({
        detail: candidatesToRestore.length === 1 ? candidatesToRestore[0].title : `${candidatesToRestore.length} hallazgos`,
        label: 'Vista recuperada',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo deshacer el descarte.')
    }
  }

  async function undoSaveVisibleQueue() {
    const savedPairs = bulkSaveUndo
    if (!savedPairs.length) return

    try {
      for (const pair of savedPairs) {
        await library.deleteItem(pair.item.id)
        await library.restoreDiscoveryCandidate(pair.candidate.id)
      }
      setView('queued')
      clearExplorerRecentActions()
      setMessage(
        savedPairs.length === 1
          ? `${savedPairs[0].item.title} recuperado a la cola y eliminado de Biblioteca.`
          : `${savedPairs.length} hallazgos recuperados a la cola y eliminados de Biblioteca.`,
      )
      onActivity({
        detail: savedPairs.length === 1 ? savedPairs[0].item.title : `${savedPairs.length} hallazgos`,
        label: 'Guardado de vista deshecho',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo deshacer el guardado de vista.')
    }
  }

  async function undoSaveCandidate() {
    if (!savedExplorerUndo) return

    try {
      await library.deleteItem(savedExplorerUndo.item.id)
      await library.restoreDiscoveryCandidate(savedExplorerUndo.candidate.id)
      setView('queued')
      clearExplorerRecentActions()
      setMessage(`${savedExplorerUndo.item.title} recuperado a la cola y eliminado de Biblioteca.`)
      onActivity({
        detail: savedExplorerUndo.item.title,
        label: 'Guardado deshecho',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo deshacer el guardado.')
    }
  }

  async function saveExplorerItemEdits(item: ListItem) {
    try {
      await library.saveItem(item)
      setEditingSavedItem(undefined)
      setSavedExplorerItem(item)
      setSavedExplorerUndo((current) => (current ? { ...current, item } : current))
      setMessage(`${item.title || 'Entrada'} afinada en Biblioteca.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Ficha afinada',
        tab: 'explorer',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.')
    }
  }

  async function deleteExplorerItem(item: ListItem) {
    try {
      await library.deleteItem(item.id)
      setEditingSavedItem(undefined)
      setSavedExplorerItem((current) => (current?.id === item.id ? undefined : current))
      setSavedExplorerUndo((current) => (current?.item.id === item.id ? undefined : current))
      setMessage(`${item.title || 'Entrada'} eliminada de Biblioteca.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Entrada eliminada',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo borrar la entrada.')
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
      onActivity({
        detail: savedItem.title,
        label: 'Catalogo actualizado',
        tab: 'explorer',
        tone: 'success',
      })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar en el catalogo publico.')
    }
  }

  useEffect(() => {
    if (!searchRequest || handledSearchRequestId.current === searchRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSearchRequestId.current === searchRequest.requestId) return

      handledSearchRequestId.current = searchRequest.requestId
      setQuery(searchRequest.query)
      setView('queued')
      setSourceFilter('all')
      void runDiscoverySearch(searchRequest.query).finally(onSearchRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onSearchRequestHandled, runDiscoverySearch, searchRequest])

  useEffect(() => {
    if (!promptCardRequest || handledPromptCardRequestId.current === promptCardRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledPromptCardRequestId.current === promptCardRequest.requestId) return

      handledPromptCardRequestId.current = promptCardRequest.requestId
      void recommendFromLibrary().finally(onPromptCardRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onPromptCardRequestHandled, promptCardRequest, recommendFromLibrary])

  useEffect(() => {
    if (!candidateRequest || handledCandidateRequestId.current === candidateRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledCandidateRequestId.current === candidateRequest.requestId) return

      handledCandidateRequestId.current = candidateRequest.requestId
      const candidate = library.discoveryCandidates.find((current) => current.id === candidateRequest.candidateId)
      if (!candidate) {
        setMessage('Ese hallazgo ya no esta disponible en el Explorador.')
        onCandidateRequestHandled()
        return
      }

      clearExplorerRecentActions()
      setMessage(undefined)
      setView(candidate.status)
      setSourceFilter(getDiscoverySourceFilter(candidate))
      setCompletedExplorerQueue(undefined)
      setSelected(candidate)
      onCandidateRequestHandled()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [candidateRequest, clearExplorerRecentActions, library.discoveryCandidates, onCandidateRequestHandled])

  useEffect(() => {
    if (!candidateDismissRequest || handledCandidateDismissRequestId.current === candidateDismissRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledCandidateDismissRequestId.current === candidateDismissRequest.requestId) return

      handledCandidateDismissRequestId.current = candidateDismissRequest.requestId
      const candidate = library.discoveryCandidates.find((current) => current.id === candidateDismissRequest.candidateId)
      if (!candidate) {
        setMessage('Ese hallazgo ya no esta disponible en el Explorador.')
        onCandidateDismissRequestHandled()
        return
      }

      clearExplorerRecentActions()
      setMessage(undefined)
      setSelected(undefined)
      setCompletedExplorerQueue(undefined)
      setView(candidate.status)
      setSourceFilter(getDiscoverySourceFilter(candidate))

      if (candidate.status !== 'queued') {
        setMessage(`${candidate.title} ya no esta en cola.`)
        onCandidateDismissRequestHandled()
        return
      }

      void dismissCandidate(candidate).finally(onCandidateDismissRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [
    candidateDismissRequest,
    clearExplorerRecentActions,
    dismissCandidate,
    library.discoveryCandidates,
    onCandidateDismissRequestHandled,
  ])

  useEffect(() => {
    if (!candidateSaveRequest || handledCandidateSaveRequestId.current === candidateSaveRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledCandidateSaveRequestId.current === candidateSaveRequest.requestId) return

      handledCandidateSaveRequestId.current = candidateSaveRequest.requestId
      const candidate = library.discoveryCandidates.find((current) => current.id === candidateSaveRequest.candidateId)
      if (!candidate) {
        setMessage('Ese hallazgo ya no esta disponible en el Explorador.')
        onCandidateSaveRequestHandled()
        return
      }

      clearExplorerRecentActions()
      setMessage(undefined)
      setSelected(undefined)
      setCompletedExplorerQueue(undefined)
      setView(candidate.status)
      setSourceFilter(getDiscoverySourceFilter(candidate))

      if (candidate.status !== 'queued') {
        setMessage(`${candidate.title} ya no esta en cola.`)
        onCandidateSaveRequestHandled()
        return
      }

      void saveCandidate(candidate).finally(onCandidateSaveRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [candidateSaveRequest, clearExplorerRecentActions, library.discoveryCandidates, onCandidateSaveRequestHandled, saveCandidate])

  useEffect(() => {
    if (!visibleSaveRequest || handledVisibleSaveRequestId.current === visibleSaveRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledVisibleSaveRequestId.current === visibleSaveRequest.requestId) return

      handledVisibleSaveRequestId.current = visibleSaveRequest.requestId
      clearExplorerRecentActions()
      setMessage(undefined)
      void saveVisibleQueueForFilter(visibleSaveRequest.sourceFilter).finally(onVisibleSaveRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [clearExplorerRecentActions, onVisibleSaveRequestHandled, saveVisibleQueueForFilter, visibleSaveRequest])

  useEffect(() => {
    if (!visibleDismissRequest || handledVisibleDismissRequestId.current === visibleDismissRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledVisibleDismissRequestId.current === visibleDismissRequest.requestId) return

      handledVisibleDismissRequestId.current = visibleDismissRequest.requestId
      clearExplorerRecentActions()
      setMessage(undefined)
      void dismissVisibleQueueForFilter(visibleDismissRequest.sourceFilter).finally(onVisibleDismissRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [clearExplorerRecentActions, dismissVisibleQueueForFilter, onVisibleDismissRequestHandled, visibleDismissRequest])

  const explorerMessageTone = message ? feedbackToneFromText(message) : undefined
  const explorerUndoAction =
    savedExplorerUndo
      ? { ariaLabel: 'Deshacer guardado', label: 'Deshacer', onClick: () => void undoSaveCandidate() }
      : bulkSaveUndo.length > 0
        ? { ariaLabel: 'Deshacer guardado de vista', label: 'Deshacer', onClick: () => void undoSaveVisibleQueue() }
        : bulkDismissUndo.length > 0
          ? { ariaLabel: 'Deshacer descarte', label: 'Deshacer', onClick: () => void undoDismissVisibleQueue() }
          : undefined
  const explorerToasts: ToastMessage[] = message
    ? [
        {
          action: explorerUndoAction,
          durationMs: explorerMessageTone === 'danger' || explorerMessageTone === 'loading' ? undefined : explorerUndoAction ? 8000 : 3000,
          id: 'explorer-status',
          message,
          tone: explorerMessageTone,
        },
      ]
    : explorerUndoAction
      ? [
          {
            action: explorerUndoAction,
            durationMs: 8000,
            id: 'explorer-undo',
            message: 'Accion reciente disponible para deshacer.',
            tone: 'info',
          },
        ]
      : []

  function clearExplorerUndoState() {
    setBulkDismissUndo([])
    setBulkSaveUndo([])
    setSavedExplorerUndo(undefined)
  }

  function dismissExplorerToast(id: string) {
    if (id === 'explorer-status') setMessage(undefined)
    if (id === 'explorer-status' || id === 'explorer-undo') clearExplorerUndoState()
  }

  return (
    <section className={totalDiscoveryCount > 0 ? 'content-grid explorer-grid' : 'content-grid explorer-focus-grid explorer-grid'}>
      <section className="workspace-panel wide">
        <div className="explorer-command">
          <div className="explorer-command-main">
            <div className="explorer-command-heading">
              <div>
                <span className="tool-mode-badge explorer-mode-badge">
                  <Sparkles size={15} />
                  Explorar
                </span>
                <span className="eyebrow">Fuera de tu estanteria</span>
                <h2>Sorprendeme</h2>
              </div>
            </div>

            <form
              className="explorer-search explorer-command-search explorer-discover-form"
              onSubmit={(event) => {
                event.preventDefault()
                void runExternalDiscovery()
              }}
            >
              <select
                aria-label="Tipo para descubrir"
                value={discoverType}
                onChange={(event) => setDiscoverType(event.target.value as ExternalDiscoverType)}
              >
                {explorerDiscoverTypeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Duracion para descubrir"
                value={discoverDuration}
                onChange={(event) => setDiscoverDuration(event.target.value as ExternalDiscoverDuration)}
              >
                {explorerDiscoverDurationOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button className="primary-button" disabled={discoverLoading} type="submit">
                <Sparkles size={18} />
                {discoverLoading ? 'Buscando' : 'Sorprendeme'}
              </button>
            </form>
          </div>
        </div>

        <ToastStack label="Accion reciente del explorador Notificaciones" toasts={explorerToasts} onDismiss={dismissExplorerToast} />

        {discoverCandidate && (
          <section className="candidate-spotlight explorer-random-result" aria-label="Resultado random externo" data-testid="explorer-random-result">
            <div className="candidate-spotlight-media">
              <CoverArt title={discoverCandidate.title} type={discoverCandidate.type} posterUrl={discoverCandidate.posterUrl} />
            </div>
            <div className="candidate-spotlight-body">
              <div className="candidate-meta">
                <span className="source-pill">{sourceLabels[discoverCandidate.source]}</span>
                <span>{typeLabels[discoverCandidate.type]}</span>
                {discoverCandidate.releaseYear && <span>{discoverCandidate.releaseYear}</span>}
              </div>
              <h3>{discoverCandidate.title}</h3>
              <p className="candidate-spotlight-overview">
                {discoverCandidate.overview || `${typeLabels[discoverCandidate.type]} encontrado fuera de tu biblioteca.`}
              </p>
              <div className="tag-row">
                {discoverCandidate.genres.slice(0, 4).map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
              <div className="candidate-spotlight-actions" aria-label={`Decidir ${discoverCandidate.title}`}>
                <button className="primary-button" type="button" onClick={() => void saveDiscoverCandidate(discoverCandidate)}>
                  <Plus size={17} />
                  Guardar
                </button>
                <button className="secondary-button" disabled={discoverLoading} type="button" onClick={() => void runExternalDiscovery()}>
                  <Sparkles size={17} />
                  Otra
                </button>
                <button className="ghost-button danger-ghost" type="button" onClick={() => dismissDiscoverCandidate(discoverCandidate)}>
                  <X size={17} />
                  Descartar
                </button>
              </div>
            </div>
          </section>
        )}

        <details className="explorer-tools-panel explorer-history-panel">
          <summary aria-label="Abrir historial avanzado del explorador">
            <span>
              <SlidersHorizontal size={16} />
              <strong>Avanzado</strong>
              <small>{discoveryCounts.queued} por revisar / historial y busqueda manual</small>
            </span>
            <em>Oculto</em>
          </summary>
          <div className="explorer-tools-content">
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
                  placeholder="Frieren, Dune, Hollow Knight..."
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
              <button className="secondary-button" disabled={loading} type="submit">
                <Search size={18} />
                {loading ? 'Buscando' : 'Buscar'}
              </button>
            </form>

            {savedExplorerItem && (
              <button
                aria-label={`Afinar ficha guardada ${savedExplorerItem.title}`}
                className="secondary-button"
                type="button"
                onClick={() => setEditingSavedItem(savedExplorerItem)}
              >
                <Info size={16} />
                Afinar ficha guardada
              </button>
            )}

        {totalDiscoveryCount > 0 && (
          <>
            <details className="explorer-tools-panel" data-close-on-outside open={sourceFilter !== 'all' || view !== 'queued'}>
              <summary aria-label="Abrir filtros e historial del explorador">
                <span>
                  <SlidersHorizontal size={16} />
                  <strong>Filtros e historial</strong>
                  <small>{discoveryCounts.queued} por revisar / {activeSourceLabel}</small>
                </span>
                <em>{decisionProgressPercent}% decidido</em>
              </summary>
              <div className="explorer-tools-content">
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
                        onClick={() => changeExplorerView(status)}
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
                        onClick={() => changeExplorerSourceFilter(filter.id)}
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
                      <span className="eyebrow">Explorar</span>
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
                      <button className="secondary-button" type="button" onClick={() => changeExplorerSourceFilter('all')}>
                        Ver todos los origenes
                      </button>
                    )}
                    {canSaveVisibleQueue && (
                      <button className="secondary-button" type="button" onClick={() => void saveVisibleQueue()}>
                        <Plus size={16} />
                        Guardar vista
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
              </div>
            </details>
          </>
        )}

        {completedExplorerQueue && (
          <section
            className="explorer-completion-card"
            aria-label={`Bandeja resuelta ${completedExplorerQueue.sourceLabel}`}
            data-testid="explorer-completion"
          >
            <div className="explorer-completion-main">
              <CheckCircle2 size={18} />
              <div>
                <span className="eyebrow">Bandeja resuelta</span>
                <strong>{completedExplorerQueue.title}</strong>
                <p>{completedExplorerQueue.detail}</p>
              </div>
            </div>
            <div className="explorer-completion-actions">
              <button className="primary-button" type="button" onClick={openCompletedExplorerQueue}>
                {completedExplorerQueue.actionLabel}
              </button>
              <button className="ghost-button" type="button" onClick={() => setCompletedExplorerQueue(undefined)}>
                Cerrar
              </button>
            </div>
          </section>
        )}

        {showCandidateFeedHeader && (
          <div className="candidate-feed-header">
            <div>
              <h3>{spotlightCandidate ? 'Para revisar' : view === 'queued' ? 'Descubrir' : discoveryStatusLabels[view]}</h3>
              <p>
                {spotlightCandidate
                  ? 'Guarda si encaja o descartalo para limpiar la busqueda.'
                  : view === 'queued'
                  ? 'Busca por titulo o lanza una pista cuando no sepas por donde empezar.'
                  : 'Historial ligero de decisiones del explorador.'}
              </p>
            </div>
            <span className="feed-count-pill">
              {visibleCandidates.length} / {candidatesInView.length} {activeSourceLabel}
            </span>
          </div>
        )}

        {spotlightCandidate && (
          <section className="candidate-spotlight" aria-label="Obra encontrada" data-testid="candidate-spotlight">
            <div className="candidate-spotlight-media">
              <CoverArt title={spotlightCandidate.title} type={spotlightCandidate.type} posterUrl={spotlightCandidate.posterUrl} />
            </div>
            <div className="candidate-spotlight-body">
              <div className="candidate-meta">
                <span className="source-pill">{sourceLabels[spotlightCandidate.source]}</span>
                <span>{typeLabels[spotlightCandidate.type]}</span>
                {spotlightCandidate.releaseYear && <span>{spotlightCandidate.releaseYear}</span>}
              </div>
              <span className="eyebrow">Resultado listo</span>
              <h3>{spotlightCandidate.title}</h3>
              <p className="candidate-spotlight-overview">{spotlightCandidate.overview || `${typeLabels[spotlightCandidate.type]} para explorar`}</p>
              <div className="tag-row">
                {spotlightCandidate.genres.slice(0, 4).map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
              <CandidateDecisionBriefView brief={getCandidateDecisionBrief(spotlightCandidate, library.isModerator)} />
              <div className="candidate-spotlight-actions" aria-label={`Decidir ${spotlightCandidate.title}`}>
                <button className="primary-button" type="button" onClick={() => void saveCandidate(spotlightCandidate)} aria-label={`Guardar ${spotlightCandidate.title}`}>
                  <Plus size={17} />
                  Guardar
                </button>
                <button className="secondary-button" type="button" onClick={() => setSelected(spotlightCandidate)} aria-label={`Abrir ficha ${spotlightCandidate.title}`}>
                  <Eye size={17} />
                  Ver ficha
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
          <div className={explorerShelfItems.length > 0 ? 'explorer-empty-state with-constellation' : 'explorer-empty-state'}>
            {explorerShelfItems.length > 0 && (
              <div className="explorer-empty-constellation" aria-hidden="true">
                {explorerShelfItems.map((item) => (
                  <CoverArt key={item.id} title={item.title} type={item.type} posterUrl={item.posterUrl} />
                ))}
              </div>
            )}
            <EmptyState
              icon={view === 'queued' ? Sparkles : view === 'saved' ? CheckCircle2 : X}
              tone={view === 'dismissed' ? 'muted' : 'neutral'}
              title={
                isSourceFilteredEmpty
                  ? `Sin resultados ${activeSourceLabel}`
                  : hasHeroStarterIdeas && view === 'queued'
                    ? 'Desde tu estanteria'
                    : discoveryEmptyCopy[view].title
              }
              detail={
                isSourceFilteredEmpty
                  ? 'Este estado tiene hallazgos, pero ninguno coincide con el origen seleccionado.'
                  : hasHeroStarterIdeas && view === 'queued'
                    ? 'Abre una busqueda relacionada con algo que ya guardaste.'
                  : discoveryEmptyCopy[view].detail
              }
              action={
                view === 'queued' && !isSourceFilteredEmpty ? (
                  <div className="explorer-empty-actions explorer-starter-actions">
                    <div className="explorer-primary-empty-actions">
                      <button className="primary-button" type="button" onClick={() => void recommendFromLibrary()}>
                        <Sparkles size={16} />
                        Recomendar desde mi estanteria
                      </button>
                      {query.trim() && (
                        <button className="secondary-button" disabled={!query.trim() || loading} type="button" onClick={() => void runDiscoverySearch()}>
                          <Search size={16} />
                          Usar consulta
                        </button>
                      )}
                    </div>
                    {!hasHeroStarterIdeas && explorerStarterIdeas.length > 0 && (
                      <div className="explorer-starter-grid" aria-label="Ideas rapidas de exploracion">
                        {explorerStarterIdeas.map((idea) => (
                          <button
                            className="explorer-starter-card"
                            key={idea.id}
                            type="button"
                            onClick={() => void startExplorerIdea(idea)}
                          >
                            <CoverArt title={idea.title} type={idea.type} posterUrl={idea.posterUrl} />
                            <span>
                              <small>{idea.kicker}</small>
                              <strong>{idea.title}</strong>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : undefined
              }
            />
          </div>
        )}
          </div>
        </details>
      </section>

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

      {editingSavedItem && (
        <ItemEditor
          item={editingSavedItem}
          onClose={() => setEditingSavedItem(undefined)}
          onDelete={deleteExplorerItem}
          onSave={saveExplorerItemEdits}
        />
      )}
    </section>
  )
}

function formatBackupImportSummary(summary: LibraryImportSummary) {
  const parts = [
    `${summary.newItems} ${summary.newItems === 1 ? 'nueva' : 'nuevas'}`,
    `${summary.updatedItems} ${summary.updatedItems === 1 ? 'actualizada' : 'actualizadas'}`,
  ]
  if (summary.duplicateItems) parts.push(`${summary.duplicateItems} ${summary.duplicateItems === 1 ? 'duplicada' : 'duplicadas'}`)
  if (summary.settingsIncluded) parts.push('ajustes')
  return parts.join(' / ')
}

function formatLibraryImportRollbackDetail(plan: LibraryImportRollbackPlan) {
  const parts = [
    plan.newItemIds.length ? `${plan.newItemIds.length} nuevas eliminadas` : undefined,
    plan.previousItems.length ? `${plan.previousItems.length} restauradas` : undefined,
    plan.previousSettings ? 'ajustes recuperados' : undefined,
  ].filter((part): part is string => Boolean(part))

  return parts.length ? parts.join(' / ') : 'Sin cambios que revertir'
}

function formatLibraryImportRollbackStatus(plan: LibraryImportRollbackPlan) {
  return `Importacion deshecha: ${formatLibraryImportRollbackDetail(plan)}`
}

function formatLibraryCooldownRollbackDetail(plan: LibraryCooldownUndo) {
  const restoredCooldowns = plan.changes.filter((change) => Boolean(change.previousCooldownUntil)).length
  const reactivatedItems = plan.changes.length - restoredCooldowns
  const parts = [
    restoredCooldowns
      ? `${restoredCooldowns} ${restoredCooldowns === 1 ? 'cooldown recuperado' : 'cooldowns recuperados'}`
      : undefined,
    reactivatedItems
      ? `${reactivatedItems} ${reactivatedItems === 1 ? 'reactivada' : 'reactivadas'}`
      : undefined,
  ].filter((part): part is string => Boolean(part))

  return parts.length ? parts.join(' / ') : 'Sin cambios que revertir'
}

function formatLibraryCooldownRollbackStatus(plan: LibraryCooldownUndo) {
  return `Dado deshecho: ${formatLibraryCooldownRollbackDetail(plan)}`
}

function formatCatalogSeedSummary(summary: PublicCatalogSeedSummary) {
  return [
    `${summary.newItems} ${summary.newItems === 1 ? 'nueva' : 'nuevas'}`,
    `${summary.updatedItems} ${summary.updatedItems === 1 ? 'actualizada' : 'actualizadas'}`,
  ].join(' / ')
}

function formatCatalogSeedRollbackDetail(plan: PublicCatalogSeedRollbackPlan) {
  const parts = [
    plan.newItemIds.length
      ? `${plan.newItemIds.length} ${plan.newItemIds.length === 1 ? 'nueva archivada' : 'nuevas archivadas'}`
      : undefined,
    plan.previousItems.length
      ? `${plan.previousItems.length} ${plan.previousItems.length === 1 ? 'restaurada' : 'restauradas'}`
      : undefined,
  ].filter((part): part is string => Boolean(part))

  return parts.length ? parts.join(' / ') : 'Sin cambios que revertir'
}

function formatCatalogSeedRollbackStatus(plan: PublicCatalogSeedRollbackPlan) {
  return `Seed deshecho: ${formatCatalogSeedRollbackDetail(plan)}`
}

function formatCatalogRepairIssues(issues: CatalogIssueKey[]) {
  return issues.map((issue) => catalogIssueShortLabels[issue].toLowerCase()).join(', ')
}

function cloneRecommendationPreferences(preferences: RecommendationPreferences): RecommendationPreferences {
  return { ...preferences }
}

function cloneUserSettings(settings: UserSettings): UserSettings {
  return {
    ...settings,
    favoriteGenres: [...settings.favoriteGenres],
    favoriteTags: [...settings.favoriteTags],
    blockedTags: [...settings.blockedTags],
    recommendationPreferences: cloneRecommendationPreferences(settings.recommendationPreferences),
  }
}

function settingsDraftFromSettings(settings: UserSettings) {
  return {
    theme: settings.theme,
    favoriteTags: settings.favoriteTags.join(', '),
    favoriteGenres: settings.favoriteGenres.join(', '),
    blockedTags: settings.blockedTags.join(', '),
    explorerDefaultType: settings.explorerDefaultType,
  }
}

type SettingsDraft = ReturnType<typeof settingsDraftFromSettings>

function SettingsTab({
  library,
  onActivity,
  onNavigate,
  onRollDice,
  onSaveRequestHandled,
  onTasteSuggestionsRequestHandled,
  onTaxonomyRepairRequestHandled,
  onUnsavedChange,
  saveRequest,
  setTheme,
  tasteSuggestionsRequest,
  taxonomyRepairRequest,
  theme,
  user,
}: {
  library: LibrarySurface
  onActivity: ActivityRecorder
  onNavigate: (tab: AppTab) => void
  onRollDice: () => void
  onSaveRequestHandled: () => void
  onTasteSuggestionsRequestHandled: () => void
  onTaxonomyRepairRequestHandled: () => void
  onUnsavedChange: (hasUnsavedChanges: boolean) => void
  saveRequest?: SettingsSaveRequest
  setTheme: (theme: ThemeMode) => void
  tasteSuggestionsRequest?: SettingsTasteSuggestionsRequest
  taxonomyRepairRequest?: SettingsTaxonomyRepairRequest
  theme: ThemeMode
  user: AuthUserSummary | null
}) {
  const [draft, setDraft] = useState<SettingsDraft>(() => settingsDraftFromSettings({ ...library.settings, theme }))
  const [status, setStatus] = useState<string | undefined>()
  const [settingsUndo, setSettingsUndo] = useState<UserSettings | undefined>()
  const [privateTaxonomyUndoItems, setPrivateTaxonomyUndoItems] = useState<ListItem[]>([])
  const [settingsImportUndo, setSettingsImportUndo] = useState<LibraryImportRollbackPlan | undefined>()
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | undefined>()
  const [applyBackupImportSettings, setApplyBackupImportSettings] = useState(false)
  const [serviceImportPreview, setServiceImportPreview] = useState<ImportPreview | undefined>()
  const [serviceImportSelectedIds, setServiceImportSelectedIds] = useState<string[]>([])
  const [serviceImportStatusFilter, setServiceImportStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [serviceImportVisibleLimit, setServiceImportVisibleLimit] = useState(serviceImportPreviewRenderLimit)
  const [serviceImportLoading, setServiceImportLoading] = useState<ImportSourceId | undefined>()
  const [anilistImportInput, setAnilistImportInput] = useState('')
  const [myAnimeListImportInput, setMyAnimeListImportInput] = useState('')
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('')
  const [deletedPrivateItemsUndo, setDeletedPrivateItemsUndo] = useState<ListItem[]>([])
  const handledSaveRequestId = useRef<number | undefined>(undefined)
  const handledTasteSuggestionsRequestId = useRef<number | undefined>(undefined)
  const handledTaxonomyRepairRequestId = useRef<number | undefined>(undefined)
  const draftFavoriteTags = useMemo(() => splitList(draft.favoriteTags), [draft.favoriteTags])
  const draftFavoriteGenres = useMemo(() => splitList(draft.favoriteGenres), [draft.favoriteGenres])
  const draftBlockedTags = useMemo(() => splitList(draft.blockedTags), [draft.blockedTags])
  const draftBlockedSignalKeys = useMemo(() => new Set(draftBlockedTags.map(normalizeKey)), [draftBlockedTags])
  const accountLabel = user?.displayName ?? user?.email ?? 'Sesion demo'
  const accountInitial = accountLabel.slice(0, 1).toUpperCase()
  const queuedDiscoveryCount = library.discoveryCandidates.filter((candidate) => candidate.status === 'queued').length
  const resolvedDiscoveryCount = library.discoveryCandidates.length - queuedDiscoveryCount
  const firstMissingTaxonomyItem = library.items.find((item) => !hasItemTaxonomy(item))
  const privateDataHealth = useMemo(
    () => getPrivateDataHealth(library.items, library.discoveryCandidates, undefined, draftBlockedTags),
    [draftBlockedTags, library.discoveryCandidates, library.items],
  )
  const serviceImportVisibleItems = useMemo(() => {
    if (!serviceImportPreview) return []
    return serviceImportPreview.items.filter(
      (item) => serviceImportStatusFilter === 'all' || item.draft.status === serviceImportStatusFilter,
    )
  }, [serviceImportPreview, serviceImportStatusFilter])
  const serviceImportRenderedItems = useMemo(
    () => serviceImportVisibleItems.slice(0, serviceImportVisibleLimit),
    [serviceImportVisibleItems, serviceImportVisibleLimit],
  )
  const serviceImportSelectedIdSet = useMemo(() => new Set(serviceImportSelectedIds), [serviceImportSelectedIds])
  const serviceImportSelectedItems = useMemo(
    () =>
      serviceImportPreview?.items.filter(
        (item) => serviceImportSelectedIdSet.has(item.id) && !item.duplicateOfId,
      ) ?? [],
    [serviceImportPreview, serviceImportSelectedIdSet],
  )
  const privateTaxonomyRepairs = useMemo(() => {
    return library.items
      .map((item) => ({
        original: item,
        repair: getPrivateTaxonomyRepairDraft(item, catalogTaxonomyTemplates[item.type][0], item.updatedAt),
      }))
      .filter((entry): entry is { original: ListItem; repair: NonNullable<ReturnType<typeof getPrivateTaxonomyRepairDraft>> } =>
        Boolean(entry.repair),
      )
  }, [library.items])
  const visibleTasteSuggestions = useMemo(
    () => privateDataHealth.tasteSuggestions.filter((suggestion) => !draftBlockedSignalKeys.has(normalizeKey(suggestion.label))),
    [draftBlockedSignalKeys, privateDataHealth.tasteSuggestions],
  )
  const pendingTasteSuggestions = useMemo(() => visibleTasteSuggestions.filter((suggestion) => {
    const currentValues = suggestion.kind === 'genre' ? draftFavoriteGenres : draftFavoriteTags
    const suggestionKey = normalizeKey(suggestion.label)
    return !currentValues.some((value) => normalizeKey(value) === suggestionKey)
  }), [draftFavoriteGenres, draftFavoriteTags, visibleTasteSuggestions])
  const draftThemeOption = themeOptions.find((option) => option.id === draft.theme) ?? themeOptions[0]
  const personalTasteCount = draftFavoriteGenres.length + draftFavoriteTags.length
  const tasteSummary =
    pendingTasteSuggestions.length > 0
      ? `${pendingTasteSuggestions.length} sugerencias`
      : personalTasteCount > 0 || draftBlockedTags.length > 0
        ? `${personalTasteCount} favoritos / ${draftBlockedTags.length} bloqueados`
        : 'Sin preferencias'
  const hasUnsavedChanges =
    draft.theme !== theme ||
    draft.explorerDefaultType !== library.settings.explorerDefaultType ||
    !sameList(draftFavoriteTags, library.settings.favoriteTags) ||
    !sameList(draftFavoriteGenres, library.settings.favoriteGenres) ||
    !sameList(draftBlockedTags, library.settings.blockedTags)

  useLayoutEffect(() => {
    onUnsavedChange(hasUnsavedChanges)
    return () => onUnsavedChange(false)
  }, [hasUnsavedChanges, onUnsavedChange])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDraft((current) => (current.theme === theme ? current : { ...current, theme }))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [theme])

  const updateDraft = useCallback((updater: (current: SettingsDraft) => SettingsDraft) => {
    setSettingsUndo(undefined)
    setDraft(updater)
  }, [])

  function applyTasteSuggestion(suggestion: PrivateTasteSuggestion) {
    updateDraft((current) =>
      suggestion.kind === 'genre'
        ? { ...current, favoriteGenres: mergeListText(current.favoriteGenres, [suggestion.label]) }
        : { ...current, favoriteTags: mergeListText(current.favoriteTags, [suggestion.label]) },
    )
    setStatus(`${suggestion.kind === 'genre' ? 'Genero' : 'Tag'} sugerido anadido`)
  }

  const applyTasteSuggestions = useCallback(() => {
    if (!pendingTasteSuggestions.length) return

    const genres = pendingTasteSuggestions.filter((suggestion) => suggestion.kind === 'genre').map((suggestion) => suggestion.label)
    const tags = pendingTasteSuggestions.filter((suggestion) => suggestion.kind === 'tag').map((suggestion) => suggestion.label)
    updateDraft((current) => ({
      ...current,
      favoriteGenres: genres.length ? mergeListText(current.favoriteGenres, genres) : current.favoriteGenres,
      favoriteTags: tags.length ? mergeListText(current.favoriteTags, tags) : current.favoriteTags,
    }))
    setStatus(`${pendingTasteSuggestions.length} sugerencias anadidas`)
  }, [pendingTasteSuggestions, updateDraft])

  useEffect(() => {
    if (!tasteSuggestionsRequest || handledTasteSuggestionsRequestId.current === tasteSuggestionsRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledTasteSuggestionsRequestId.current === tasteSuggestionsRequest.requestId) return

      handledTasteSuggestionsRequestId.current = tasteSuggestionsRequest.requestId
      applyTasteSuggestions()
      onTasteSuggestionsRequestHandled()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [applyTasteSuggestions, onTasteSuggestionsRequestHandled, tasteSuggestionsRequest])

  const saveSettings = useCallback(async () => {
    const previousSettings = cloneUserSettings({ ...library.settings, theme })
    const nextSettings: Partial<UserSettings> = {
      theme: draft.theme,
      favoriteTags: draftFavoriteTags,
      favoriteGenres: draftFavoriteGenres,
      blockedTags: draftBlockedTags,
      explorerDefaultType: draft.explorerDefaultType,
    }
    setTheme(draft.theme)
    await library.saveSettings(nextSettings)
    setPendingBackupImport(undefined)
    setApplyBackupImportSettings(false)
    setPrivateTaxonomyUndoItems([])
    setSettingsImportUndo(undefined)
    setDeletedPrivateItemsUndo([])
    setSettingsUndo(previousSettings)
    setStatus('Ajustes guardados')
    onActivity({
      detail: `${themeLabels[draft.theme]} / ${typeLabels[draft.explorerDefaultType]}`,
      label: 'Ajustes guardados',
      tab: 'settings',
      tone: 'success',
    })
  }, [draft.explorerDefaultType, draft.theme, draftBlockedTags, draftFavoriteGenres, draftFavoriteTags, library, onActivity, setTheme, theme])

  useEffect(() => {
    if (!saveRequest || handledSaveRequestId.current === saveRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSaveRequestId.current === saveRequest.requestId) return

      handledSaveRequestId.current = saveRequest.requestId
      void saveSettings().finally(onSaveRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onSaveRequestHandled, saveRequest, saveSettings])

  async function undoSettingsSave() {
    if (!settingsUndo) return

    const previousSettings = settingsUndo
    setTheme(previousSettings.theme)
    try {
      await library.saveSettings(previousSettings)
      setDraft(settingsDraftFromSettings(previousSettings))
      setSettingsUndo(undefined)
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
      setPrivateTaxonomyUndoItems([])
      setSettingsImportUndo(undefined)
      setDeletedPrivateItemsUndo([])
      setStatus('Ajustes recuperados')
      onActivity({
        detail: `${themeLabels[previousSettings.theme]} / ${typeLabels[previousSettings.explorerDefaultType]}`,
        label: 'Ajustes recuperados',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron recuperar los ajustes.')
    }
  }

  async function copyUserId() {
    if (!user) return
    await navigator.clipboard?.writeText(user.uid)
    setStatus('UID copiado')
  }

  function exportPrivateBackup() {
    downloadLibraryBackup(library.items, library.settings, 'nexo-backup')
    setStatus('Backup JSON descargado')
    onActivity({
      detail: `${library.items.length} entradas exportadas`,
      label: 'Backup privado exportado',
      tab: 'settings',
      tone: 'success',
    })
  }

  function setPreparedServiceImport(preview: ImportPreview) {
    setPrivateTaxonomyUndoItems([])
    setSettingsImportUndo(undefined)
    setDeletedPrivateItemsUndo([])
    setPendingBackupImport(undefined)
    setApplyBackupImportSettings(false)
    setServiceImportPreview(preview)
    setServiceImportStatusFilter('all')
    setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
    setServiceImportSelectedIds(
      preview.items
        .slice(0, serviceImportPreviewRenderLimit)
        .filter((item) => !item.duplicateOfId)
        .map((item) => item.id),
    )
    setStatus(
      `${preview.sourceLabel}: ${preview.newItems} nuevas, ${preview.duplicateItems} posibles duplicadas, ${preview.invalidItems} invalidas`,
    )
  }

  async function preparePublicProfileImport(sourceId: 'anilist' | 'myanimelist') {
    const input = sourceId === 'anilist' ? anilistImportInput : myAnimeListImportInput
    setServiceImportLoading(sourceId)
    setStatus(`Leyendo ${importSourceLabels[sourceId]}...`)
    try {
      const result = sourceId === 'anilist' ? await importAniListLibrary(input) : await importMyAnimeListLibrary(input)
      setPreparedServiceImport(buildImportPreview(result, library.items))
    } catch (reason) {
      setServiceImportPreview(undefined)
      setServiceImportSelectedIds([])
      setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
      setStatus(reason instanceof Error ? reason.message : `No se pudo importar desde ${importSourceLabels[sourceId]}.`)
    } finally {
      setServiceImportLoading(undefined)
    }
  }

  async function prepareServiceFileImport(sourceId: 'letterboxd' | 'goodreads', file?: File) {
    if (!file) return

    setServiceImportLoading(sourceId)
    setStatus(`Leyendo ${importSourceLabels[sourceId]}...`)
    try {
      const result = sourceId === 'letterboxd' ? await importLetterboxdZip(file) : await importGoodreadsCsv(file)
      setPreparedServiceImport(buildImportPreview(result, library.items))
    } catch (reason) {
      setServiceImportPreview(undefined)
      setServiceImportSelectedIds([])
      setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
      setStatus(reason instanceof Error ? reason.message : `No se pudo importar desde ${importSourceLabels[sourceId]}.`)
    } finally {
      setServiceImportLoading(undefined)
    }
  }

  function handleServiceFileDrop(sourceId: 'letterboxd' | 'goodreads', event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    void prepareServiceFileImport(sourceId, event.dataTransfer.files?.[0])
  }

  function toggleServiceImportSelection(itemId: string, selected: boolean) {
    setServiceImportSelectedIds((current) =>
      selected ? uniqueValues([...current, itemId]) : current.filter((id) => id !== itemId),
    )
  }

  function selectVisibleServiceImportItems() {
    setServiceImportSelectedIds((current) =>
      uniqueValues([
        ...current,
        ...serviceImportRenderedItems.filter((item) => !item.duplicateOfId).map((item) => item.id),
      ]),
    )
  }

  function clearServiceImportSelection() {
    setServiceImportSelectedIds([])
  }

  function cancelServiceImport() {
    setServiceImportPreview(undefined)
    setServiceImportSelectedIds([])
    setServiceImportStatusFilter('all')
    setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
    setStatus('Importacion desde servicio cancelada')
  }

  async function applyServiceImport() {
    if (!serviceImportPreview) return
    if (!serviceImportSelectedItems.length) {
      setStatus('Selecciona al menos una entrada nueva para importar.')
      return
    }

    setStatus(`Importando ${serviceImportSelectedItems.length} entradas desde ${serviceImportPreview.sourceLabel}...`)
    try {
      const itemsToImport = importPreviewItemsToListItems(serviceImportSelectedItems)
      const payload: ParsedLibraryImport = { items: itemsToImport }
      const rollbackPlan = getLibraryImportRollbackPlan(payload, library.items, library.settings)

      for (const item of itemsToImport) {
        await library.saveItem(item)
      }

      setPrivateTaxonomyUndoItems([])
      setSettingsUndo(undefined)
      setDeletedPrivateItemsUndo([])
      setSettingsImportUndo(rollbackPlan)
      setServiceImportPreview(undefined)
      setServiceImportSelectedIds([])
      setServiceImportStatusFilter('all')
      setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
      setStatus(`Importadas ${itemsToImport.length} entradas desde ${serviceImportPreview.sourceLabel}`)
      onActivity({
        detail: `${itemsToImport.length} entradas privadas`,
        label: `${serviceImportPreview.sourceLabel} importado`,
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo aplicar la importacion.')
    }
  }

  async function preparePrivateBackupImport(file?: File) {
    if (!file) return

    setStatus('Preparando backup JSON...')
    try {
      const payload = parseLibraryImportPayload(JSON.parse(await file.text()))
      const summary = getLibraryImportSummary(payload, library.items)
      setPrivateTaxonomyUndoItems([])
      setSettingsImportUndo(undefined)
      setDeletedPrivateItemsUndo([])
      setServiceImportPreview(undefined)
      setServiceImportSelectedIds([])
      setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
      setPendingBackupImport({ fileName: file.name, payload, summary })
      setApplyBackupImportSettings(Boolean(payload.settings))
      setStatus(`Backup preparado: ${formatBackupImportSummary(summary)}`)
    } catch (reason) {
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
      setStatus(reason instanceof Error ? reason.message : 'No se pudo importar el backup.')
    }
  }

  async function applyPrivateBackupImport() {
    if (!pendingBackupImport) return

    setStatus('Importando backup JSON...')
    try {
      const { payload, summary } = pendingBackupImport
      const shouldApplySettings = applyBackupImportSettings && Boolean(payload.settings)
      const payloadToApply: ParsedLibraryImport = shouldApplySettings ? payload : { ...payload, settings: undefined }
      const rollbackPlan = getLibraryImportRollbackPlan(payloadToApply, library.items, library.settings)

      for (const item of payload.items) {
        await library.saveItem(item)
      }
      if (shouldApplySettings && payload.settings) {
        await library.saveSettings(payload.settings)
        setTheme(payload.settings.theme)
        setDraft(settingsDraftFromSettings(payload.settings))
        setSettingsUndo(undefined)
      }
      setPrivateTaxonomyUndoItems([])
      setSettingsUndo(undefined)
      setDeletedPrivateItemsUndo([])
      setSettingsImportUndo(rollbackPlan)
      setStatus(
        shouldApplySettings
          ? `Importadas ${summary.totalItems} entradas y ajustes desde backup`
          : `Importadas ${summary.totalItems} entradas desde backup`,
      )
      onActivity({
        detail: shouldApplySettings ? `${summary.totalItems} entradas y ajustes` : `${summary.totalItems} entradas`,
        label: 'Backup privado aplicado',
        tab: 'settings',
        tone: 'success',
      })
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo importar el backup.')
    }
  }

  function cancelPrivateBackupImport() {
    setPendingBackupImport(undefined)
    setApplyBackupImportSettings(false)
    setStatus('Importacion de backup cancelada')
  }

  async function undoSettingsImport() {
    if (!settingsImportUndo) return

    setStatus('Deshaciendo importacion privada...')
    try {
      for (const id of settingsImportUndo.newItemIds) {
        await library.deleteItem(id)
      }
      for (const item of settingsImportUndo.previousItems) {
        await library.saveItem(item)
      }
      if (settingsImportUndo.previousSettings) {
        await library.saveSettings(settingsImportUndo.previousSettings)
        setTheme(settingsImportUndo.previousSettings.theme)
        setDraft(settingsDraftFromSettings(settingsImportUndo.previousSettings))
      }
      setSettingsImportUndo(undefined)
      setApplyBackupImportSettings(false)
      setPrivateTaxonomyUndoItems([])
      setDeletedPrivateItemsUndo([])
      setStatus(formatLibraryImportRollbackStatus(settingsImportUndo))
      onActivity({
        detail: formatLibraryImportRollbackDetail(settingsImportUndo),
        label: 'Importacion privada deshecha',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el backup.')
    }
  }

  async function savePrivateItemFromSettings(item: ListItem) {
    await library.saveItem(item)
    setEditingItem(undefined)
    setPrivateTaxonomyUndoItems([])
    setSettingsImportUndo(undefined)
    setDeletedPrivateItemsUndo([])
    setStatus(`${item.title || 'Entrada'} guardada`)
    onActivity({
      detail: item.title || 'Entrada sin titulo',
      label: 'Ficha guardada',
      tab: 'settings',
      target: { kind: 'item', id: item.id },
      tone: 'success',
    })
  }

  async function deletePrivateItemFromSettings(item: ListItem) {
    try {
      await library.deleteItem(item.id)
      setEditingItem(undefined)
      setPrivateTaxonomyUndoItems([])
      setSettingsImportUndo(undefined)
      setStatus(`${item.title || 'Entrada'} eliminada de Biblioteca.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Entrada eliminada',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo borrar la entrada.')
    }
  }

  const repairPrivateTaxonomy = useCallback(async () => {
    if (!privateTaxonomyRepairs.length) {
      setStatus('No hay taxonomia privada que completar')
      return
    }

    try {
      for (const entry of privateTaxonomyRepairs) {
        await library.saveItem(entry.repair.item)
      }
      setPendingBackupImport(undefined)
      setSettingsUndo(undefined)
      setPrivateTaxonomyUndoItems(privateTaxonomyRepairs.map((entry) => entry.original))
      setSettingsImportUndo(undefined)
      setDeletedPrivateItemsUndo([])
      setStatus(
        `Taxonomia privada completada en ${privateTaxonomyRepairs.length} ficha${privateTaxonomyRepairs.length === 1 ? '' : 's'}`,
      )
      onActivity({
        detail: `${privateTaxonomyRepairs.length} ficha${privateTaxonomyRepairs.length === 1 ? '' : 's'} privadas`,
        label: 'Taxonomia privada completada',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo completar la taxonomia privada.')
    }
  }, [library, onActivity, privateTaxonomyRepairs])

  useEffect(() => {
    if (!taxonomyRepairRequest || handledTaxonomyRepairRequestId.current === taxonomyRepairRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledTaxonomyRepairRequestId.current === taxonomyRepairRequest.requestId) return

      handledTaxonomyRepairRequestId.current = taxonomyRepairRequest.requestId
      void repairPrivateTaxonomy().finally(onTaxonomyRepairRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onTaxonomyRepairRequestHandled, repairPrivateTaxonomy, taxonomyRepairRequest])

  async function undoPrivateTaxonomyRepair() {
    if (!privateTaxonomyUndoItems.length) return

    try {
      for (const item of privateTaxonomyUndoItems) {
        await library.saveItem(item)
      }
      setPrivateTaxonomyUndoItems([])
      setStatus(
        privateTaxonomyUndoItems.length === 1
          ? 'Taxonomia privada recuperada en 1 ficha'
          : `Taxonomia privada recuperada en ${privateTaxonomyUndoItems.length} fichas`,
      )
      onActivity({
        detail: `${privateTaxonomyUndoItems.length} ficha${privateTaxonomyUndoItems.length === 1 ? '' : 's'} privadas`,
        label: 'Taxonomia privada recuperada',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer la taxonomia privada.')
    }
  }

  async function deleteAllPrivateItemsFromSettings() {
    const deletedItems = library.items.map((item) => ({ ...item }))
    if (!deletedItems.length) {
      setDeleteAllDialogOpen(false)
      setDeleteAllConfirmText('')
      setStatus('No hay entradas privadas que borrar')
      return
    }

    setStatus('Borrando entradas privadas...')
    try {
      await library.deleteAllItems()
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
      setSettingsUndo(undefined)
      setPrivateTaxonomyUndoItems([])
      setSettingsImportUndo(undefined)
      setDeletedPrivateItemsUndo(deletedItems)
      setDeleteAllDialogOpen(false)
      setDeleteAllConfirmText('')
      setStatus('Tus entradas privadas han sido borradas')
      onActivity({
        detail: `${deletedItems.length} entradas eliminadas`,
        label: 'Entradas privadas borradas',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron borrar las entradas privadas.')
    }
  }

  async function undoDeleteAllPrivateItemsFromSettings() {
    if (!deletedPrivateItemsUndo.length) return

    const itemsToRestore = deletedPrivateItemsUndo
    setStatus('Restaurando entradas privadas...')
    try {
      for (const item of itemsToRestore) {
        await library.saveItem(item)
      }
      setDeletedPrivateItemsUndo([])
      setStatus(`${itemsToRestore.length} entradas recuperadas en Biblioteca`)
      onActivity({
        detail: `${itemsToRestore.length} entradas restauradas`,
        label: 'Entradas privadas recuperadas',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron recuperar las entradas privadas.')
    }
  }

  const privateDataActions: PrivateDataAction[] = [
    privateTaxonomyRepairs.length
      ? {
          detail: `${privateTaxonomyRepairs.length} con plantillas seguras`,
          Icon: Sparkles,
          id: 'repair-taxonomy',
          label: 'Completar taxonomia',
          onClick: () => void repairPrivateTaxonomy(),
          primary: true,
        }
      : firstMissingTaxonomyItem
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
            onClick: privateDataHealth.diceReadyCount ? onRollDice : () => onNavigate('dice'),
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
    {
      danger: true,
      detail: library.items.length ? `${library.items.length} entradas privadas` : 'Sin entradas privadas',
      disabled: library.items.length === 0,
      Icon: Trash2,
      id: 'delete-all',
      label: 'Borrar entradas',
      onClick: () => {
        setDeleteAllConfirmText('')
        setDeleteAllDialogOpen(true)
      },
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
            <h2>Tu Nexo</h2>
            <p>Tema, descubrimiento y privacidad sin ruido.</p>
          </div>
          <button className="primary-button" disabled={!hasUnsavedChanges} type="submit">
            <Save size={17} />
            {hasUnsavedChanges ? 'Guardar cambios' : 'Guardado'}
          </button>
        </div>

        <div className={hasUnsavedChanges ? 'settings-status pending' : 'settings-status'}>
          <span>{hasUnsavedChanges ? 'Ajustes sin guardar' : 'Sin cambios pendientes'}</span>
          <strong>{typeLabels[draft.explorerDefaultType]}</strong>
        </div>

        <section className="settings-theme-stage" aria-label="Apariencia de Nexo" data-testid="settings-theme-stage">
          <div className="settings-theme-preview">
            <div>
              <span className="eyebrow">Apariencia</span>
              <h3>{draftThemeOption.label}</h3>
              <p>{draftThemeOption.detail}</p>
            </div>
            <span className="settings-theme-preview-swatch" aria-hidden="true">
              {draftThemeOption.swatches.map((swatch) => (
                <span key={swatch} style={{ background: swatch }} />
              ))}
            </span>
          </div>
          <div className="settings-theme-picker">
            <div className="settings-section-heading">
              <h3>Tema de Nexo</h3>
              <p>Elige el tono que quieres recordar.</p>
            </div>
            <div className="theme-option-grid" role="group" aria-label="Tema">
              {themeOptions.map((option) => (
                <button
                  aria-label={`Tema ${option.label}`}
                  className={draft.theme === option.id ? 'theme-option active' : 'theme-option'}
                  key={option.id}
                  type="button"
                  onClick={() => updateDraft((current) => ({ ...current, theme: option.id }))}
                >
                  <span className="theme-swatch" aria-hidden="true">
                    {option.swatches.map((swatch) => (
                      <span key={swatch} style={{ background: swatch }} />
                    ))}
                  </span>
                  <span className="theme-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                  {draft.theme === option.id && (
                    <span className="theme-option-status" aria-hidden="true">
                      <Check size={13} />
                      Actual
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

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
              <strong>{themeLabels[draft.theme]}</strong>
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
            <div className="settings-confidence-actions">
              <span className="settings-pending-badge">Cambios pendientes</span>
              <button className="secondary-button" type="submit">
                <Save size={16} />
                Guardar ajustes
              </button>
            </div>
          ) : (
            <span className="settings-confidence-rest">
              <CheckCircle2 size={16} />
              Sin acciones urgentes
            </span>
          )}
        </section>

        <div className="settings-overview" aria-label="Resumen de ajustes">
          <MetricCard label="Favoritos" value={draftFavoriteGenres.length + draftFavoriteTags.length} />
          <MetricCard label="Bloqueados" value={draftBlockedTags.length} />
          <MetricCard label="Explorador" value={typeLabels[draft.explorerDefaultType]} />
        </div>

        <div className="settings-section">
          <h3>Explorador</h3>
          <label>
            Tipo por defecto
            <select
              value={draft.explorerDefaultType}
              onChange={(event) =>
                updateDraft((current) => ({
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

        <details className="settings-section settings-taste-panel" data-close-on-outside>
          <summary>
            <span>
              <strong>Preferencias del dado</strong>
              <small>Tags, generos y bloqueos personales</small>
            </span>
            <em>{tasteSummary}</em>
          </summary>
          <div className="settings-taste-content">
            <label>
              Tags favoritos
              <input value={draft.favoriteTags} onChange={(event) => updateDraft((current) => ({ ...current, favoriteTags: event.target.value }))} />
            </label>
            <label>
              Generos favoritos
              <input value={draft.favoriteGenres} onChange={(event) => updateDraft((current) => ({ ...current, favoriteGenres: event.target.value }))} />
            </label>
            <label>
              Senales bloqueadas
              <input value={draft.blockedTags} onChange={(event) => updateDraft((current) => ({ ...current, blockedTags: event.target.value }))} />
            </label>
            {visibleTasteSuggestions.length > 0 && (
              <div className="taste-suggestions" aria-label="Sugerencias de gusto" data-testid="taste-suggestions">
                <div className="taste-suggestions-heading">
                  <div>
                    <strong>Sugerencias de gusto</strong>
                    <span>Desde completadas con rating alto</span>
                  </div>
                  {pendingTasteSuggestions.length > 0 && (
                    <button className="secondary-button" type="button" onClick={applyTasteSuggestions}>
                      <Sparkles size={15} />
                      Aplicar sugerencias
                    </button>
                  )}
                </div>
                <div className="taste-suggestion-row">
                  {visibleTasteSuggestions.map((suggestion) => {
                    const suggestionKey = `${suggestion.kind}:${normalizeKey(suggestion.label)}`
                    const isApplied = !pendingTasteSuggestions.some(
                      (pending) => pending.kind === suggestion.kind && normalizeKey(pending.label) === normalizeKey(suggestion.label),
                    )
                    const suggestionKindLabel = suggestion.kind === 'genre' ? 'Genero' : 'Tag'

                    return (
                      <button
                        aria-label={`${isApplied ? 'Sugerencia aplicada' : 'Anadir'} ${suggestionKindLabel.toLowerCase()} ${suggestion.label}`}
                        className={isApplied ? 'taste-suggestion-chip applied' : 'taste-suggestion-chip'}
                        disabled={isApplied}
                        key={suggestionKey}
                        type="button"
                        onClick={() => applyTasteSuggestion(suggestion)}
                      >
                        <span>{suggestionKindLabel}</span>
                        <strong>{suggestion.label}</strong>
                        <small>{suggestion.sourceCount}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </details>

        {(personalTasteCount > 0 || draftBlockedTags.length > 0) && (
          <div className="preference-preview" aria-label="Resumen de preferencias">
            <PreferencePreview label="Favoritos" values={[...draftFavoriteGenres, ...draftFavoriteTags]} />
            <PreferencePreview label="Bloqueados" values={draftBlockedTags} tone="danger" />
          </div>
        )}

        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
        {(settingsUndo || privateTaxonomyUndoItems.length > 0 || settingsImportUndo || deletedPrivateItemsUndo.length > 0) &&
          !hasUnsavedChanges && (
          <div className="feedback-action-row" aria-label="Accion reciente de ajustes">
            {settingsImportUndo && (
              <button className="secondary-button" type="button" onClick={() => void undoSettingsImport()}>
                <RotateCcw size={16} />
                Deshacer importacion
              </button>
            )}
            {settingsUndo && (
              <button className="secondary-button" type="button" onClick={() => void undoSettingsSave()}>
                <RotateCcw size={16} />
                Deshacer ajustes
              </button>
            )}
            {privateTaxonomyUndoItems.length > 0 && (
              <button className="secondary-button" type="button" onClick={() => void undoPrivateTaxonomyRepair()}>
                <RotateCcw size={16} />
                Deshacer taxonomia
              </button>
            )}
            {deletedPrivateItemsUndo.length > 0 && (
              <button className="secondary-button" type="button" onClick={() => void undoDeleteAllPrivateItemsFromSettings()}>
                <RotateCcw size={16} />
                Deshacer borrado total
              </button>
            )}
          </div>
        )}
      </form>

      <div className="settings-side">
        <details className="workspace-panel settings-drawer" data-close-on-outside data-testid="settings-account-drawer">
          <summary>
            <span>
              <strong>Cuenta</strong>
              <small>{user?.email ?? 'Sesion activa'}</small>
            </span>
            <em>{roleLabels[library.userRole]}</em>
          </summary>
          <div className="settings-drawer-body">
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
          </div>
        </details>

        {library.userRole === 'admin' && (
          <details className="workspace-panel settings-drawer settings-roles-drawer" data-close-on-outside data-testid="settings-roles-drawer">
            <summary>
              <span>
                <strong>Roles</strong>
                <small>{library.userProfiles.length ? `${library.userProfiles.length} perfiles con acceso` : 'Sin perfiles cargados'}</small>
              </span>
              <em>Admin</em>
            </summary>
            <AdminRolesPanel
              currentUserId={user?.uid}
              embedded
              onActivity={onActivity}
              onRoleChange={library.updateUserRole}
              profiles={library.userProfiles}
            />
          </details>
        )}

        <details className="workspace-panel settings-drawer private-data-panel" data-close-on-outside data-testid="settings-private-data-drawer">
          <summary>
            <span>
              <strong>Datos privados</strong>
              <small>{library.items.length} entradas / {queuedDiscoveryCount} en cola</small>
            </span>
            <em>JSON v1</em>
          </summary>
          <div className="settings-drawer-body">
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
          <section className="service-import-section" aria-label="Importar desde servicios" data-testid="service-import-section">
            <div className="service-import-heading">
              <div>
                <span className="eyebrow">Importar desde servicios</span>
                <strong>Traer biblioteca privada</strong>
                <p>AniList y MyAnimeList leen perfiles publicos; Letterboxd y Goodreads usan el export oficial.</p>
              </div>
            </div>
            <div className="service-import-grid">
              <form
                className="service-import-card"
                onSubmit={(event) => {
                  event.preventDefault()
                  void preparePublicProfileImport('anilist')
                }}
              >
                <div className="service-import-card-heading">
                  <Sparkles size={17} />
                  <div>
                    <strong>AniList</strong>
                    <small>Anime, manga y manhwa</small>
                  </div>
                </div>
                <label>
                  Usuario o URL publica
                  <input
                    value={anilistImportInput}
                    onChange={(event) => setAnilistImportInput(event.target.value)}
                    placeholder="usuario o anilist.co/user/..."
                  />
                </label>
                <button className="secondary-button" disabled={serviceImportLoading === 'anilist'} type="submit">
                  {serviceImportLoading === 'anilist' ? <LoaderCircle size={16} /> : <Search size={16} />}
                  Leer perfil
                </button>
              </form>

              <form
                className="service-import-card"
                onSubmit={(event) => {
                  event.preventDefault()
                  void preparePublicProfileImport('myanimelist')
                }}
              >
                <div className="service-import-card-heading">
                  <BookOpen size={17} />
                  <div>
                    <strong>MyAnimeList</strong>
                    <small>Experimental via Jikan</small>
                  </div>
                  <span className="mode-pill warning">Best effort</span>
                </div>
                <label>
                  Usuario o URL publica
                  <input
                    value={myAnimeListImportInput}
                    onChange={(event) => setMyAnimeListImportInput(event.target.value)}
                    placeholder="usuario o myanimelist.net/profile/..."
                  />
                </label>
                <button className="secondary-button" disabled={serviceImportLoading === 'myanimelist'} type="submit">
                  {serviceImportLoading === 'myanimelist' ? <LoaderCircle size={16} /> : <Search size={16} />}
                  Leer perfil
                </button>
              </form>

              <div className="service-import-card">
                <div className="service-import-card-heading">
                  <Film size={17} />
                  <div>
                    <strong>Letterboxd</strong>
                    <small>ZIP oficial de exportacion</small>
                  </div>
                </div>
                <details className="service-import-guide">
                  <summary>
                    <HelpCircle size={15} />
                    Mini guia
                  </summary>
                  <ol>
                    <li>En Letterboxd abre Settings, Data y Export your data.</li>
                    <li>Descarga el ZIP y sueltalo aqui sin descomprimir.</li>
                  </ol>
                </details>
                <label
                  className="service-file-drop"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleServiceFileDrop('letterboxd', event)}
                >
                  <Upload size={17} />
                  <span>Elegir ZIP</span>
                  <input
                    accept="application/zip,application/x-zip-compressed,.zip"
                    aria-label="Importar ZIP oficial de Letterboxd"
                    type="file"
                    onChange={(event) => {
                      void prepareServiceFileImport('letterboxd', event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>

              <div className="service-import-card">
                <div className="service-import-card-heading">
                  <BookOpen size={17} />
                  <div>
                    <strong>Goodreads</strong>
                    <small>CSV oficial de exportacion</small>
                  </div>
                </div>
                <details className="service-import-guide">
                  <summary>
                    <HelpCircle size={15} />
                    Mini guia
                  </summary>
                  <ol>
                    <li>En Goodreads abre My Books, Import and export.</li>
                    <li>Descarga el CSV y cargalo aqui.</li>
                  </ol>
                </details>
                <label
                  className="service-file-drop"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleServiceFileDrop('goodreads', event)}
                >
                  <Upload size={17} />
                  <span>Elegir CSV</span>
                  <input
                    accept="text/csv,.csv"
                    aria-label="Importar CSV oficial de Goodreads"
                    type="file"
                    onChange={(event) => {
                      void prepareServiceFileImport('goodreads', event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>

            {serviceImportPreview && (
              <div className="service-import-preview" aria-label={`Preview de importacion ${serviceImportPreview.sourceLabel}`}>
                <div className="service-import-preview-heading">
                  <div>
                    <strong>{serviceImportPreview.sourceLabel}</strong>
                    <span>{serviceImportPreview.totalEntries} entradas revisadas antes de aplicar</span>
                  </div>
                  <button className="ghost-button" type="button" onClick={cancelServiceImport}>
                    <X size={16} />
                    Cancelar
                  </button>
                </div>

                <div className="service-import-metrics">
                  <span>
                    <strong>{serviceImportPreview.totalEntries}</strong>
                    Total
                  </span>
                  <span>
                    <strong>{serviceImportPreview.newItems}</strong>
                    Nuevas
                  </span>
                  <span>
                    <strong>{serviceImportPreview.duplicateItems}</strong>
                    Duplicadas
                  </span>
                  <span>
                    <strong>{serviceImportPreview.invalidItems}</strong>
                    Invalidas
                  </span>
                </div>

                <div className="service-import-counts" aria-label="Conteo por tipo">
                  {(Object.entries(serviceImportPreview.typeCounts) as Array<[ItemType, number]>).map(([type, count]) => (
                    <span key={type}>
                      {typeLabels[type]}: {count}
                    </span>
                  ))}
                </div>

                <div className="service-import-filters" aria-label="Filtros por estado">
                  <button
                    className={serviceImportStatusFilter === 'all' ? 'active' : undefined}
                    type="button"
                    onClick={() => {
                      setServiceImportStatusFilter('all')
                      setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
                    }}
                  >
                    Todos
                  </button>
                  {ITEM_STATUSES.map((status) => (
                    <button
                      className={serviceImportStatusFilter === status ? 'active' : undefined}
                      key={status}
                      type="button"
                      onClick={() => {
                        setServiceImportStatusFilter(status)
                        setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
                      }}
                    >
                      {statusLabels[status]} ({serviceImportPreview.statusCounts[status] ?? 0})
                    </button>
                  ))}
                </div>

                <div className="service-import-selection-actions">
                  <span>{serviceImportSelectedItems.length} seleccionadas</span>
                  <button className="ghost-button" type="button" onClick={selectVisibleServiceImportItems}>
                    <Check size={15} />
                    Seleccionar nuevas visibles
                  </button>
                  <button className="ghost-button" type="button" onClick={clearServiceImportSelection}>
                    <X size={15} />
                    Limpiar
                  </button>
                </div>

                <div className="service-import-list">
                  {serviceImportRenderedItems.map((item) => {
                    const duplicateLabel =
                      item.duplicateReason === 'externalRefs'
                        ? 'Duplicado por ID externo'
                        : item.duplicateReason === 'titleTypeYear'
                          ? 'Duplicado por titulo/tipo/ano'
                          : 'Nueva'
                    return (
                      <label className={item.duplicateOfId ? 'service-import-row duplicate' : 'service-import-row'} key={item.id}>
                        <input
                          checked={serviceImportSelectedIdSet.has(item.id)}
                          disabled={Boolean(item.duplicateOfId)}
                          type="checkbox"
                          onChange={(event) => toggleServiceImportSelection(item.id, event.target.checked)}
                        />
                        <span>
                          <strong>{item.draft.title}</strong>
                          <small>
                            {typeLabels[item.draft.type]} / {statusLabels[item.draft.status]}
                            {item.draft.releaseYear ? ` / ${item.draft.releaseYear}` : ''}
                          </small>
                        </span>
                        <em>{duplicateLabel}</em>
                      </label>
                    )
                  })}
                </div>
                {serviceImportVisibleItems.length > serviceImportRenderedItems.length && (
                  <div className="service-import-overflow-note">
                    <span>
                      Mostrando {serviceImportRenderedItems.length} de {serviceImportVisibleItems.length}; usa filtros para acotar.
                    </span>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setServiceImportVisibleLimit((limit) => limit + serviceImportPreviewRenderLimit)}
                    >
                      Mostrar mas
                    </button>
                  </div>
                )}

                {serviceImportPreview.warnings.length > 0 && (
                  <div className="service-import-warnings" aria-label="Avisos de importacion">
                    {serviceImportPreview.warnings.slice(0, 6).map((warning, index) => (
                      <span key={`${warning.code}-${warning.entryLabel ?? index}`}>
                        {warning.entryLabel ? `${warning.entryLabel}: ` : ''}
                        {warning.message}
                      </span>
                    ))}
                    {serviceImportPreview.warnings.length > 6 && (
                      <span>{serviceImportPreview.warnings.length - 6} avisos mas en este archivo.</span>
                    )}
                  </div>
                )}

                <div className="action-row end">
                  <button className="primary-button" disabled={!serviceImportSelectedItems.length} type="button" onClick={() => void applyServiceImport()}>
                    <Upload size={16} />
                    Importar seleccionadas
                  </button>
                </div>
              </div>
            )}
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
                const actionClassName = [
                  'private-action-item',
                  action.primary ? 'primary' : undefined,
                  action.danger ? 'danger' : undefined,
                ].filter(Boolean).join(' ')
                return (
                  <button
                    className={actionClassName}
                    disabled={action.disabled}
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
              <label className="private-action-item private-import-item">
                <Upload size={16} />
                <span>
                  <strong>Importar backup</strong>
                  <small>Restaurar JSON v1</small>
                </span>
                <input
                  accept="application/json,.json"
                  aria-label="Importar backup JSON"
                  type="file"
                  onChange={(event) => {
                    void preparePrivateBackupImport(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
            {pendingBackupImport && (
              <div className="backup-import-preview" aria-label="Backup preparado">
                <div>
                  <strong>{pendingBackupImport.fileName}</strong>
                  <span>{formatBackupImportSummary(pendingBackupImport.summary)}</span>
                  <small>{pendingBackupImport.summary.totalItems} entradas revisadas antes de aplicar</small>
                </div>
                {pendingBackupImport.summary.settingsIncluded && (
                  <label className="check-row">
                    <input
                      checked={applyBackupImportSettings}
                      type="checkbox"
                      onChange={(event) => setApplyBackupImportSettings(event.target.checked)}
                    />
                    Aplicar ajustes del backup
                  </label>
                )}
                <div className="action-row end">
                  <button className="ghost-button" type="button" onClick={cancelPrivateBackupImport}>
                    <X size={16} />
                    Cancelar
                  </button>
                  <button className="primary-button" type="button" onClick={() => void applyPrivateBackupImport()}>
                    <Upload size={16} />
                    Aplicar backup
                  </button>
                </div>
              </div>
            )}
          </section>
          <div className="data-safety-note">
            <ShieldCheck size={17} />
            <span>Tus notas, ratings, progreso y pesos viven bajo tu usuario. El catalogo Nexo no recibe esos cambios privados.</span>
          </div>
          <button className="secondary-button data-backup-button" type="button" onClick={exportPrivateBackup}>
            <Archive size={17} />
            Exportar backup JSON
          </button>
          </div>
        </details>

        <details className="workspace-panel settings-drawer" data-close-on-outside data-testid="settings-beta-drawer">
          <summary>
            <span>
              <strong>Beta suave</strong>
              <small>Privacidad y catalogo compartido</small>
            </span>
            <em>Info</em>
          </summary>
          <div className="settings-drawer-body">
            <h2>Beta suave</h2>
            <p className="muted-line">Google login abre una biblioteca privada por usuario. El catalogo Nexo es comun, pero solo moderadores lo editan.</p>
            <div className="release-list">
              <span>Firestore privado por usuario</span>
              <span>Catalogo publico curado</span>
              <span>Export JSON schemaVersion 1</span>
            </div>
          </div>
        </details>
      </div>

      {deleteAllDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <DialogFocusReturn />
          <form
            aria-labelledby="settings-delete-all-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onKeyDown={(event) =>
              handleDialogKeyDown(event, () => {
                setDeleteAllDialogOpen(false)
                setDeleteAllConfirmText('')
              })
            }
            onSubmit={(event) => {
              event.preventDefault()
              if (deleteAllConfirmText === 'BORRAR') void deleteAllPrivateItemsFromSettings()
            }}
          >
            <div>
              <h2 id="settings-delete-all-title">Borrar entradas privadas</h2>
              <p>
                Esto elimina {library.items.length} entradas privadas de tu cuenta. Tus ajustes, cola, actividad y
                catalogo publico no cambian. Podras deshacerlo justo despues.
              </p>
            </div>
            <label>
              Confirmacion
              <input
                autoFocus
                value={deleteAllConfirmText}
                onChange={(event) => setDeleteAllConfirmText(event.target.value)}
                placeholder="BORRAR"
              />
            </label>
            <div className="action-row end">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setDeleteAllDialogOpen(false)
                  setDeleteAllConfirmText('')
                }}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={deleteAllConfirmText !== 'BORRAR' || library.items.length === 0}
                type="submit"
              >
                <Trash2 size={16} />
                Borrar entradas
              </button>
            </div>
          </form>
        </div>
      )}

      {editingItem && (
        <ItemEditor
          item={editingItem}
          onClose={() => setEditingItem(undefined)}
          onDelete={deletePrivateItemFromSettings}
          onSave={savePrivateItemFromSettings}
        />
      )}
    </section>
  )
}

function AdminRolesPanel({
  embedded = false,
  currentUserId,
  onActivity,
  onRoleChange,
  profiles,
}: {
  embedded?: boolean
  currentUserId?: string
  onActivity: ActivityRecorder
  onRoleChange: (targetUserId: string, role: UserRole) => Promise<void>
  profiles: UserProfile[]
}) {
  type PendingRoleChange = { profile: UserProfile; role: UserRole }
  type RoleChangeUndo = { profile: UserProfile; previousRole: UserRole; role: UserRole }

  const [status, setStatus] = useState<string | undefined>()
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | undefined>()
  const [roleChangeUndo, setRoleChangeUndo] = useState<RoleChangeUndo | undefined>()
  const roleCounts = USER_ROLES.map((role) => ({
    role,
    count: profiles.filter((profile) => profile.role === role).length,
  }))

  function prepareRoleChange(profile: UserProfile, role: UserRole) {
    if (profile.role === role) {
      setPendingRoleChange(undefined)
      return
    }

    setStatus(undefined)
    setRoleChangeUndo(undefined)
    setPendingRoleChange({ profile, role })
  }

  async function applyRoleChange() {
    if (!pendingRoleChange) return

    const { profile, role } = pendingRoleChange

    setStatus(undefined)
    try {
      await onRoleChange(profile.uid, role)
      setStatus(`${profile.displayName || profile.email || profile.uid} ahora es ${roleLabels[role]}`)
      setRoleChangeUndo({ profile, previousRole: profile.role, role })
      onActivity({
        detail: `${profile.displayName || profile.email || profile.uid} -> ${roleLabels[role]}`,
        label: 'Rol actualizado',
        tab: 'settings',
        tone: 'success',
      })
      setPendingRoleChange(undefined)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el rol.')
    }
  }

  async function undoRoleChange() {
    if (!roleChangeUndo) return

    const label = roleChangeUndo.profile.displayName || roleChangeUndo.profile.email || roleChangeUndo.profile.uid

    setStatus('Deshaciendo cambio de rol...')
    try {
      await onRoleChange(roleChangeUndo.profile.uid, roleChangeUndo.previousRole)
      setStatus(`Rol de ${label} recuperado como ${roleLabels[roleChangeUndo.previousRole]}`)
      onActivity({
        detail: `${label}: ${roleLabels[roleChangeUndo.role]} -> ${roleLabels[roleChangeUndo.previousRole]}`,
        label: 'Rol recuperado',
        tab: 'settings',
        tone: 'success',
      })
      setPendingRoleChange(undefined)
      setRoleChangeUndo(undefined)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el rol.')
    }
  }

  function cancelRoleChange() {
    setPendingRoleChange(undefined)
    setStatus('Cambio de rol cancelado')
  }

  return (
    <section className={embedded ? 'settings-drawer-body admin-roles-panel' : 'workspace-panel'}>
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
            const preparedRole = pendingRoleChange?.profile.uid === profile.uid ? pendingRoleChange.role : profile.role
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
                    value={preparedRole}
                    onChange={(event) => prepareRoleChange(profile, event.target.value as UserRole)}
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

      {pendingRoleChange && (
        <div className="role-change-preview" aria-label="Cambio de rol preparado">
          <div>
            <strong>{pendingRoleChange.profile.displayName || pendingRoleChange.profile.email || pendingRoleChange.profile.uid}</strong>
            <span>
              {roleLabels[pendingRoleChange.profile.role]} {'->'} {roleLabels[pendingRoleChange.role]}
            </span>
            <small>El cambio se aplicara solo cuando confirmes esta accion administrativa.</small>
          </div>
          <div className="action-row end">
            <button className="ghost-button" type="button" onClick={cancelRoleChange}>
              <X size={16} />
              Cancelar
            </button>
            <button className="primary-button" type="button" onClick={() => void applyRoleChange()}>
              <ShieldCheck size={16} />
              Aplicar rol
            </button>
          </div>
        </div>
      )}

      {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
      {roleChangeUndo && !pendingRoleChange && (
        <div className="feedback-action-row" aria-label="Accion reciente de roles">
          <button className="secondary-button" type="button" onClick={() => void undoRoleChange()}>
            <RotateCcw size={16} />
            Deshacer rol
          </button>
        </div>
      )}
    </section>
  )
}

function CurationTab({
  library,
  onActivity,
}: {
  library: LibrarySurface
  onActivity: ActivityRecorder
}) {
  const [query, setQuery] = useState('')
  const [qualityFilter, setQualityFilter] = useState<CatalogQualityFilter>('all')
  const [issueFilter, setIssueFilter] = useState<CatalogIssueFilter>('all')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [sortMode, setSortMode] = useState<CatalogSortMode>('quality')
  const [items, setItems] = useState<PublicCatalogItem[]>([])
  const [editingItem, setEditingItem] = useState<PublicCatalogItem | undefined>()
  const [archiveTarget, setArchiveTarget] = useState<PublicCatalogItem | undefined>()
  const [archiveUndoItem, setArchiveUndoItem] = useState<PublicCatalogItem | undefined>()
  const [catalogRepairUndoItems, setCatalogRepairUndoItems] = useState<PublicCatalogItem[]>([])
  const [catalogSeedUndo, setCatalogSeedUndo] = useState<PublicCatalogSeedRollbackPlan | undefined>()
  const [pendingCatalogSeed, setPendingCatalogSeed] = useState<PendingCatalogSeedImport | undefined>()
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
  const safeRepairableItems = useMemo(() => {
    return items.filter((item) => getCatalogRepairDraft(item, catalogTaxonomyTemplates[item.type][0], item.updatedAt))
  }, [items])
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
        const nextItems = await initialLibrary.listPublicCatalog()
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
      const nextItems = searchQuery.trim() ? await library.searchPublicCatalog(searchQuery, 'any') : await library.listPublicCatalog()
      setItems(nextItems)
      setArchiveUndoItem(undefined)
      setCatalogRepairUndoItems([])
      setCatalogSeedUndo(undefined)
      setPendingCatalogSeed(undefined)
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
    const archivedItem = archiveTarget
    await library.archivePublicItem(archivedItem.id)
    setArchiveUndoItem(archivedItem)
    setCatalogRepairUndoItems([])
    setCatalogSeedUndo(undefined)
    setPendingCatalogSeed(undefined)
    setItems((current) => current.filter((item) => item.id !== archivedItem.id))
    setStatus(`${archivedItem.title} archivado`)
    onActivity({
      detail: archivedItem.title,
      label: 'Entrada archivada',
      tab: 'curation',
      tone: 'success',
    })
    setArchiveTarget(undefined)
  }

  async function undoArchivePublicItem() {
    if (!archiveUndoItem) return
    try {
      await library.restorePublicItem(archiveUndoItem.id)
      const restoredItem = { ...archiveUndoItem, updatedAt: nowIso() }
      delete restoredItem.archivedAt
      setItems((current) => upsertVisibleCatalogItem(current, restoredItem))
      setStatus(`${archiveUndoItem.title} recuperado en catalogo`)
      onActivity({
        detail: archiveUndoItem.title,
        label: 'Entrada recuperada',
        tab: 'curation',
        tone: 'success',
      })
      setArchiveUndoItem(undefined)
      setCatalogRepairUndoItems([])
      setCatalogSeedUndo(undefined)
      setPendingCatalogSeed(undefined)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el archivado.')
    }
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
    setArchiveUndoItem(undefined)
    setCatalogRepairUndoItems([])
    setCatalogSeedUndo(undefined)
    setPendingCatalogSeed(undefined)
    setEditingItem(template ? publicCatalogDraftFromTemplate(type, template) : blankPublicCatalogItem(type))
  }

  async function repairCatalogItem(item: PublicCatalogItem) {
    await repairCatalogItems([item])
  }

  async function repairSafeCatalogItems() {
    await repairCatalogItems(safeRepairableItems)
  }

  async function repairCatalogItems(targetItems: PublicCatalogItem[]) {
    const repairEntries = targetItems
      .map((item) => ({
        original: item,
        repair: getCatalogRepairDraft(item, catalogTaxonomyTemplates[item.type][0]),
      }))
      .filter((entry): entry is { original: PublicCatalogItem; repair: NonNullable<ReturnType<typeof getCatalogRepairDraft>> } =>
        Boolean(entry.repair),
      )

    if (!repairEntries.length) {
      setStatus(targetItems.length === 1 ? `${targetItems[0].title} no tiene reparaciones automaticas seguras` : 'No hay reparaciones automaticas seguras')
      return
    }

    try {
      const savedItems: PublicCatalogItem[] = []
      for (const entry of repairEntries) {
        savedItems.push(await library.upsertPublicItem(entry.repair.item))
      }

      setItems((current) => savedItems.reduce((nextItems, item) => upsertVisibleCatalogItem(nextItems, item), current))
      setArchiveUndoItem(undefined)
      setCatalogRepairUndoItems(repairEntries.map((entry) => entry.original))
      setCatalogSeedUndo(undefined)
      setPendingCatalogSeed(undefined)
      setHasLoaded(true)
      const repairedIssues = [...new Set(repairEntries.flatMap((entry) => entry.repair.appliedIssues))]
      const repairSummary = formatCatalogRepairIssues(repairedIssues)
      setStatus(
        savedItems.length === 1
          ? `${savedItems[0].title} reparado: ${repairSummary}`
          : `Reparadas ${savedItems.length} fichas: ${repairSummary}`,
      )
      onActivity({
        detail: savedItems.length === 1 ? savedItems[0].title : `${savedItems.length} fichas publicas`,
        label: savedItems.length === 1 ? 'Catalogo reparado' : 'Catalogo reparado en lote',
        tab: 'curation',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo reparar el catalogo publico.')
    }
  }

  async function undoCatalogRepair() {
    if (!catalogRepairUndoItems.length) return

    try {
      const restoredItems: PublicCatalogItem[] = []
      for (const item of catalogRepairUndoItems) {
        restoredItems.push(await library.upsertPublicItem(item))
      }

      setItems((current) => restoredItems.reduce((nextItems, item) => upsertVisibleCatalogItem(nextItems, item), current))
      setCatalogRepairUndoItems([])
      setArchiveUndoItem(undefined)
      setCatalogSeedUndo(undefined)
      setPendingCatalogSeed(undefined)
      setStatus(
        restoredItems.length === 1
          ? `${restoredItems[0].title} recuperado antes de la reparacion`
          : `${restoredItems.length} fichas recuperadas antes de la reparacion`,
      )
      onActivity({
        detail: restoredItems.length === 1 ? restoredItems[0].title : `${restoredItems.length} fichas publicas`,
        label: 'Reparacion deshecha',
        tab: 'curation',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer la reparacion.')
    }
  }

  function downloadCatalogSeedTemplate() {
    downloadJsonFile(createPublicCatalogSeedTemplate(), 'nexo-catalog-seed-template.json')
    setStatus('Plantilla de catalogo descargada')
    onActivity({
      detail: 'JSON de importacion publica',
      label: 'Plantilla descargada',
      tab: 'curation',
      tone: 'success',
    })
  }

  async function prepareCatalogSeed(file?: File) {
    if (!file) return

    setIsImporting(true)
    setStatus('Preparando lote de catalogo...')
    try {
      const parsed = parsePublicCatalogSeed(JSON.parse(await file.text()), 'curation-import')
      if (parsed.errors.length) {
        setPendingCatalogSeed(undefined)
        setStatus(`Seed invalido: ${parsed.errors[0]}${parsed.errors.length > 1 ? ` (+${parsed.errors.length - 1})` : ''}`)
        return
      }
      if (!parsed.items.length) {
        setPendingCatalogSeed(undefined)
        setStatus('El seed no contiene entradas para importar.')
        return
      }

      const currentCatalogItems = await library.listPublicCatalog()
      setArchiveUndoItem(undefined)
      setCatalogRepairUndoItems([])
      setCatalogSeedUndo(undefined)
      const summary = getPublicCatalogSeedSummary(parsed, currentCatalogItems)
      setPendingCatalogSeed({ fileName: file.name, result: parsed, summary })
      setStatus(`Seed preparado: ${formatCatalogSeedSummary(summary)}`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo importar el lote de catalogo.')
    } finally {
      setIsImporting(false)
    }
  }

  async function applyCatalogSeed() {
    if (!pendingCatalogSeed) return

    setIsImporting(true)
    setStatus('Importando lote de catalogo...')
    try {
      const currentCatalogItems = await library.listPublicCatalog()
      const rollbackPlan = getPublicCatalogSeedRollbackPlan(pendingCatalogSeed.result, currentCatalogItems)
      const savedItems: PublicCatalogItem[] = []
      for (const item of pendingCatalogSeed.result.items) {
        savedItems.push(await library.upsertPublicItem(item))
      }

      setItems(savedItems.reduce((nextItems, item) => upsertVisibleCatalogItem(nextItems, item), currentCatalogItems))
      setQuery('')
      setPendingCatalogSeed(undefined)
      setArchiveUndoItem(undefined)
      setCatalogRepairUndoItems([])
      setCatalogSeedUndo(rollbackPlan)
      setHasLoaded(true)
      setQualityFilter('all')
      setIssueFilter('all')
      setSortMode('updated')
      setStatus(`Importadas ${savedItems.length} entradas al catalogo`)
      onActivity({
        detail: `${savedItems.length} entradas publicas`,
        label: 'Seed aplicado',
        tab: 'curation',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo importar el lote de catalogo.')
    } finally {
      setIsImporting(false)
    }
  }

  async function undoCatalogSeedImport() {
    if (!catalogSeedUndo) return

    const rollbackPlan = catalogSeedUndo
    setIsImporting(true)
    setStatus('Deshaciendo lote de catalogo...')
    try {
      for (const id of rollbackPlan.newItemIds) {
        await library.archivePublicItem(id)
      }
      for (const item of rollbackPlan.previousItems) {
        await library.replacePublicItem(item)
      }

      setItems((current) => {
        const newIds = new Set(rollbackPlan.newItemIds)
        const withoutNewItems = current.filter((item) => !newIds.has(item.id))
        return rollbackPlan.previousItems.reduce((nextItems, item) => upsertVisibleCatalogItem(nextItems, item), withoutNewItems)
      })
      setPendingCatalogSeed(undefined)
      setArchiveUndoItem(undefined)
      setCatalogRepairUndoItems([])
      setCatalogSeedUndo(undefined)
      setHasLoaded(true)
      setStatus(formatCatalogSeedRollbackStatus(rollbackPlan))
      onActivity({
        detail: formatCatalogSeedRollbackDetail(rollbackPlan),
        label: 'Seed deshecho',
        tab: 'curation',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el seed de catalogo.')
    } finally {
      setIsImporting(false)
    }
  }

  function cancelCatalogSeedImport() {
    setPendingCatalogSeed(undefined)
    setStatus('Importacion de seed cancelada')
  }

  return (
    <section className="content-grid curation-layout">
      <section className="workspace-panel wide">
        <div className="panel-heading">
          <div>
            <h2>Catalogo Nexo</h2>
            <p>Cola visual de fichas publicas: primero arregla lo que se vera en Biblioteca.</p>
          </div>
          <div className="panel-actions">
            <button className="primary-button" type="button" onClick={() => startNewCatalogItem()}>
              <Plus size={18} />
              Nueva entrada
            </button>
          </div>
        </div>
        {pendingCatalogSeed && (
          <div className="seed-import-preview" aria-label="Seed de catalogo preparado">
            <div>
              <strong>{pendingCatalogSeed.fileName}</strong>
              <span>{formatCatalogSeedSummary(pendingCatalogSeed.summary)}</span>
              <small>{pendingCatalogSeed.summary.totalItems} entradas revisadas antes de tocar el catalogo publico</small>
            </div>
            <div className="action-row end">
              <button className="ghost-button" type="button" onClick={cancelCatalogSeedImport}>
                <X size={16} />
                Cancelar
              </button>
              <button className="primary-button" disabled={isImporting} type="button" onClick={() => void applyCatalogSeed()}>
                <Upload size={16} />
                Aplicar lote
              </button>
            </div>
          </div>
        )}
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
        <details className="curation-admin-drawer" data-close-on-outside>
          <summary>
            <span>
              <SlidersHorizontal size={17} />
              Herramientas de catalogo
            </span>
            <small>Plantillas, diagnostico, filtros e importacion viven aqui.</small>
          </summary>
          <div className="curation-admin-content">
            <div className="curation-admin-actions" aria-label="Acciones avanzadas de catalogo">
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
                    void prepareCatalogSeed(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
              <div className="curation-metric-strip" aria-label="Resumen del catalogo">
                <span>
                  <strong>{items.length}</strong>
                  Catalogo
                </span>
                <span>
                  <strong>{incompleteCount}</strong>
                  Incompletas
                </span>
                <span>
                  <strong>{typeCount}</strong>
                  Tipos
                </span>
                <span>
                  <strong>{roleLabels[library.userRole]}</strong>
                  Rol
                </span>
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
          </div>
        </details>
        {reviewQueue.length > 0 && (
          <section className="catalog-review-panel" aria-label="Revision prioritaria del catalogo">
            <div className="catalog-review-heading">
              <div>
                <h3>Revision prioritaria</h3>
                <p>Fichas publicas con senales pendientes antes de compartir beta.</p>
              </div>
              <div className="catalog-review-heading-actions">
                {safeRepairableItems.length > 0 && (
                  <button className="secondary-button" type="button" onClick={() => void repairSafeCatalogItems()}>
                    <Sparkles size={16} />
                    Reparar seguras
                    <span>{safeRepairableItems.length}</span>
                  </button>
                )}
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
            </div>
            <div className="catalog-review-list">
              {reviewQueue.map(({ item, warnings }) => {
                const repairPreview = getCatalogRepairDraft(item, catalogTaxonomyTemplates[item.type][0], item.updatedAt)

                return (
                  <article className="catalog-review-item" key={item.id}>
                    <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
                    <div className="catalog-review-copy">
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
                    <div className="catalog-review-actions">
                      {repairPreview && (
                        <button
                          className="small-button"
                          type="button"
                          onClick={() => void repairCatalogItem(item)}
                          aria-label={`Reparar ${item.title}`}
                        >
                          <Sparkles size={14} />
                          Reparar
                        </button>
                      )}
                      <button className="small-button" type="button" onClick={() => setEditingItem(item)} aria-label={`Revisar ${item.title}`}>
                        Revisar
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}
        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
        {(archiveUndoItem || catalogRepairUndoItems.length > 0 || catalogSeedUndo) && (
          <div className="feedback-action-row" aria-label="Accion reciente de curacion">
            {archiveUndoItem && (
              <button className="secondary-button" type="button" onClick={() => void undoArchivePublicItem()}>
                <RotateCcw size={16} />
                Deshacer archivado
              </button>
            )}
            {catalogRepairUndoItems.length > 0 && (
              <button className="secondary-button" type="button" onClick={() => void undoCatalogRepair()}>
                <RotateCcw size={16} />
                Deshacer reparacion{catalogRepairUndoItems.length === 1 ? '' : 'es'}
              </button>
            )}
            {catalogSeedUndo && (
              <button className="secondary-button" disabled={isImporting} type="button" onClick={() => void undoCatalogSeedImport()}>
                <RotateCcw size={16} />
                Deshacer lote
              </button>
            )}
          </div>
        )}

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

      <aside className="insight-rail curation-rail">
        <MetricCard label="Catalogo" value={items.length} />
        <MetricCard label="Incompletas" value={incompleteCount} />
        <MetricCard label="Tipos" value={typeCount} />
        <MetricCard label="Rol" value={roleLabels[library.userRole]} />
      </aside>

      {archiveTarget && (
        <div className="modal-backdrop" role="presentation">
          <DialogFocusReturn />
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-title"
            onKeyDown={(event) => handleDialogKeyDown(event, () => setArchiveTarget(undefined))}
          >
            <div className="panel-heading compact">
              <div>
                <h2 id="archive-title">Archivar entrada publica</h2>
                <p>{archiveTarget.title} dejara de aparecer en Explorador y busquedas del catalogo.</p>
              </div>
              <button className="icon-button" type="button" autoFocus onClick={() => setArchiveTarget(undefined)} title="Cerrar">
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
            setArchiveUndoItem(undefined)
            setCatalogRepairUndoItems([])
            setCatalogSeedUndo(undefined)
            setHasLoaded(true)
            setEditingItem(options?.createAnother ? blankPublicCatalogItem(savedItem.type) : undefined)
            setStatus(`${savedItem.title} guardado en catalogo`)
            onActivity({
              detail: savedItem.title,
              label: 'Catalogo actualizado',
              tab: 'curation',
              tone: 'success',
            })
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
    <section className="candidate-decision-brief" aria-label="Siguiente paso del hallazgo">
      <div className="candidate-decision-main">
        <span className="eyebrow">{brief.title}</span>
        <strong>{brief.action}</strong>
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

function downloadLibraryBackup(items: ListItem[], settings: UserSettings | undefined, prefix: string) {
  downloadJsonFile(createLibraryExportPayload(items, settings), `${prefix}-${new Date().toISOString().slice(0, 10)}.json`)
}

function getLibrarySelectionSignals(item: ListItem, kind: LibrarySelectionSignalKind) {
  if (kind === 'genre') return item.genres
  if (kind === 'mood') return item.moodTags
  return item.tags
}

function setLibrarySelectionSignals(item: ListItem, kind: LibrarySelectionSignalKind, values: string[]): ListItem {
  if (kind === 'genre') return { ...item, genres: values }
  if (kind === 'mood') return { ...item, moodTags: values }
  return { ...item, tags: values }
}

function uniqueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  const byId = new Map<string, DiscoveryCandidate>()
  for (const candidate of candidates) {
    byId.set(candidate.id, candidate)
  }
  return [...byId.values()]
}

function getSavedLibraryItemForCandidate(candidate: DiscoveryCandidate, items: ListItem[]) {
  const candidateTitleKey = normalizeKey(candidate.title)
  return items.find((item) => {
    if (candidate.publicItemId && item.publicItemId === candidate.publicItemId) return true
    if (matchesCandidateExternalRef(candidate, item)) return true
    return item.type === candidate.type && normalizeKey(item.title) === candidateTitleKey
  })
}

function matchesCandidateExternalRef(candidate: DiscoveryCandidate, item: ListItem) {
  if (!item.externalRefs) return false
  if (candidate.source === 'tmdb') return Boolean(candidate.externalRefs.tmdbId && item.externalRefs.tmdbId === candidate.externalRefs.tmdbId)
  if (candidate.source === 'rawg') return Boolean(candidate.externalRefs.rawgId && item.externalRefs.rawgId === candidate.externalRefs.rawgId)
  if (candidate.source === 'openLibrary') {
    return Boolean(candidate.externalRefs.openLibraryKey && item.externalRefs.openLibraryKey === candidate.externalRefs.openLibraryKey)
  }
  if (candidate.source === 'anilist') return Boolean(candidate.externalRefs.anilistId && item.externalRefs.anilistId === candidate.externalRefs.anilistId)
  if (candidate.source === 'jikan') return Boolean(candidate.externalRefs.malId && item.externalRefs.malId === candidate.externalRefs.malId)
  if (candidate.source === 'wikidata') return Boolean(candidate.externalRefs.wikidataId && item.externalRefs.wikidataId === candidate.externalRefs.wikidataId)
  return false
}

function LibraryCatalogCandidateCard({
  candidate,
  isSaved,
  onSave,
}: {
  candidate: DiscoveryCandidate
  isSaved: boolean
  onSave: () => void
}) {
  return (
    <article className={isSaved ? 'library-catalog-card saved' : 'library-catalog-card'}>
      <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
      <div className="library-catalog-card-body">
        <div className="candidate-meta">
          <span className="source-pill">{sourceLabels[candidate.source]}</span>
          <span>{typeLabels[candidate.type]}</span>
          {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
        </div>
        <h4>{candidate.title}</h4>
        <p>{candidate.overview || `${typeLabels[candidate.type]} encontrado en ${sourceLabels[candidate.source]}.`}</p>
        <div className="tag-row library-catalog-tags">
          {candidate.genres.slice(0, 2).map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
      </div>
      <button className={isSaved ? 'secondary-button' : 'primary-button'} disabled={isSaved} type="button" onClick={onSave}>
        {isSaved ? <Check size={16} /> : <Plus size={16} />}
        {isSaved ? 'Guardado' : 'Guardar'}
      </button>
    </article>
  )
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
  isSelected,
  item,
  layout = 'cards',
  onDelete,
  onEdit,
  onCopyLink,
  onReactivate,
  onSnooze,
  onStatus,
  showSelectionControl,
  onToggleSelected,
}: {
  isSelected: boolean
  item: ListItem
  layout?: LibraryViewMode
  onEdit: () => void
  onCopyLink: () => void
  onDelete: () => void
  onReactivate: () => void
  onSnooze: () => void
  onStatus: (status: ItemStatus) => void
  showSelectionControl: boolean
  onToggleSelected: () => void
}) {
  const primaryAction = getPrimaryItemAction(item.status)
  const secondaryAction = getSecondaryItemAction(item.status)
  const canControlDiceCooldown = item.status !== 'completed' && item.status !== 'dropped'
  const cardClassName = [
    layout === 'list' ? 'item-card list-card' : layout === 'mosaic' ? 'item-card mosaic-card' : 'item-card',
    item.posterUrl ? 'has-poster' : undefined,
    isSelected ? 'selected' : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  const posterBackplateStyle = getPosterBackplateStyle(item.posterUrl)
  const cardStyle = { ...getCoverArtStyle(item.title, item.type), ...posterBackplateStyle } as CSSProperties
  const diceCooldownAction = isItemInCooldown(item)
    ? {
        Icon: RotateCcw,
        label: 'Reactivar dado',
        onSelect: onReactivate,
      }
    : {
        Icon: Moon,
        label: 'Enfriar dado',
        onSelect: onSnooze,
      }

  function applyStatus(status: ItemStatus) {
    onStatus(status)
  }

  function deleteItem() {
    onDelete()
  }

  return (
    <article className={cardClassName} data-status={item.status} style={cardStyle}>
      {showSelectionControl && (
        <label className="item-select-control" data-keep-details-open title="Seleccionar">
          <input
            aria-label={`Seleccionar ${item.title}`}
            checked={isSelected}
            type="checkbox"
            onChange={onToggleSelected}
          />
        </label>
      )}
      <button className="item-main" type="button" onClick={onEdit}>
        <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
        <div className="item-body">
          <ItemIdentity item={item} />
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
            { Icon: Copy, label: 'Copiar enlace', onSelect: onCopyLink },
            ...(canControlDiceCooldown
              ? [
                  diceCooldownAction,
                ]
              : []),
            { Icon: Trash2, label: 'Borrar', onSelect: deleteItem, tone: 'danger' },
          ]}
        />
      </div>
    </article>
  )
}

const editorRatingOptions = [2, 4, 6, 8, 10]
const editorStatusButtonMeta: Record<ItemStatus, { Icon: LucideIcon; label: string }> = {
  completed: { Icon: Check, label: 'Hecho' },
  dropped: { Icon: X, label: 'Soltar' },
  in_progress: { Icon: Play, label: 'Activo' },
  paused: { Icon: Pause, label: 'Pausa' },
  wishlist: { Icon: Plus, label: 'Lista' },
}

function StatusControl({ onChange, value }: { onChange: (value: ItemStatus) => void; value: ItemStatus }) {
  return (
    <div className="status-control" role="group" aria-label="Estado">
      <div className="status-control-heading">
        <span>Estado</span>
        <strong className="sr-only">Estado actual: {statusLabels[value]}</strong>
      </div>
      <div className="status-chip-row">
        {ITEM_STATUSES.map((status) => {
          const Icon = editorStatusButtonMeta[status].Icon

          return (
            <button
              aria-label={`Cambiar estado a ${statusLabels[status]}`}
              aria-pressed={value === status}
              className={value === status ? `status-chip-button ${status} active` : `status-chip-button ${status}`}
              key={status}
              title={statusLabels[status]}
              type="button"
              onClick={() => onChange(status)}
            >
              <Icon size={14} />
              <span>{editorStatusButtonMeta[status].label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RatingControl({ onChange, value }: { onChange: (value: number | undefined) => void; value?: number }) {
  const displayValue = typeof value === 'number' ? formatRatingValue(value) : 'Sin nota'

  return (
    <div className="rating-control" role="group" aria-label="Rating">
      <div className="rating-control-heading">
        <span>Nota</span>
        <strong>{typeof value === 'number' ? `${displayValue}/10` : displayValue}</strong>
      </div>
      <div className="rating-star-row">
        {editorRatingOptions.map((option) => {
          const isSelected = value === option
          const isActive = typeof value === 'number' && value >= option - 1

          return (
            <button
              aria-label={`Puntuar ${option / 2} estrellas (${option}/10)`}
              aria-pressed={isSelected}
              className={isActive ? 'rating-star-button active' : 'rating-star-button'}
              key={option}
              type="button"
              onClick={() => onChange(isSelected ? undefined : option)}
            >
              <Star size={16} />
            </button>
          )
        })}
        <button
          aria-label="Quitar rating"
          className="rating-clear-button"
          disabled={typeof value !== 'number'}
          type="button"
          onClick={() => onChange(undefined)}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

function formatRatingValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
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
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  function selectItem(onSelect: () => void) {
    setOpen(false)
    onSelect()
  }

  return (
    <div
      ref={menuRef}
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

function getPosterBackplateStyle(posterUrl?: string): CSSProperties | undefined {
  if (!posterUrl) return undefined

  return { '--item-poster-image': `url("${posterUrl.replace(/"/g, '\\"')}")` } as CSSProperties
}

function getLibraryReviewQueueIcon(id: LibraryReviewQueue['id']): LucideIcon {
  const icons: Record<LibraryReviewQueue['id'], LucideIcon> = {
    all: Library,
    cooldown: RotateCcw,
    'dice-ready': Dice5,
    'needs-context': Info,
    'needs-taxonomy': Sparkles,
    nexo: ShieldCheck,
  }

  return icons[id]
}

function getLibraryReviewQueueActionLabel(queue: LibraryReviewQueue) {
  if (queue.action === 'open-dice') return 'Tirar dado'
  if (queue.action === 'open-item') return queue.id === 'needs-taxonomy' ? 'Afinar ficha' : 'Completar ficha'
  return 'Abrir vista'
}

function CoverArt({ posterUrl, title, type }: { posterUrl?: string; title: string; type: ItemType }) {
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | undefined>()
  const Icon = typeIcons[type]
  const shouldShowPoster = Boolean(posterUrl && failedPosterUrl !== posterUrl)
  const fallbackStyle = useMemo(() => getCoverArtStyle(title, type), [title, type])
  const coverClassName = shouldShowPoster ? `cover-art ${type} with-poster` : `cover-art ${type} fallback-cover`
  const coverTitle = getCoverArtTitle(title)

  return (
    <div className={coverClassName} style={shouldShowPoster ? undefined : fallbackStyle}>
      {shouldShowPoster && <img alt="" loading="lazy" src={posterUrl} onError={() => setFailedPosterUrl(posterUrl)} />}
      {!shouldShowPoster && (
        <>
          <span className="cover-art-letter">{title.slice(0, 1).toUpperCase()}</span>
          <span className="cover-art-type">{typeLabels[type]}</span>
          <strong className="cover-art-title">{coverTitle}</strong>
          <Icon className="cover-art-icon" size={24} aria-hidden="true" />
        </>
      )}
    </div>
  )
}

function getCoverArtStyle(title: string, type: ItemType): CSSProperties {
  const palettes = coverArtPalettes[type]
  const palette = palettes[Math.abs(hashText(`${type}:${title}`)) % palettes.length]

  return {
    '--cover-accent-a': palette[0],
    '--cover-accent-b': palette[1],
    '--cover-ink': palette[2],
  } as CSSProperties
}

function getCoverArtTitle(title: string) {
  const words = title
    .replace(/\([^)]*\)/g, '')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  return words.slice(0, 3).join(' ') || title.slice(0, 18) || 'Nexo'
}

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return hash
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
  useRestoreFocusOnUnmount()

  const isQueued = candidate.status === 'queued'
  const isDismissed = candidate.status === 'dismissed'
  const catalogActionLabel = candidate.source === 'nexo' ? 'Editar catalogo' : 'Crear ficha publica'

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-detail-title"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <button className="icon-button dialog-close" type="button" autoFocus onClick={onClose} title="Cerrar">
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

function SourceCreditsDialog({ onClose }: { onClose: () => void }) {
  useRestoreFocusOnUnmount()

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="source-credits-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-credits-title"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <button className="icon-button dialog-close" type="button" autoFocus onClick={onClose} title="Cerrar">
          <X size={18} />
        </button>
        <div>
          <span className="eyebrow">Fuentes externas</span>
          <h2 id="source-credits-title">Catalogos usados por Nexo</h2>
          <p>
            Nexo busca bajo demanda y guarda solo copias privadas elegidas por ti. Los datos siguen perteneciendo a sus
            fuentes originales.
          </p>
        </div>
        <div className="source-credit-list">
          {externalSourceCredits.map((source) => (
            <a href={source.url} key={source.id} rel="noreferrer" target="_blank">
              <strong>{source.label}</strong>
              <span>{source.detail}</span>
              {source.requiresKey && <small>Clave privada en proxy</small>}
            </a>
          ))}
        </div>
        <p className="source-credit-note">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </section>
    </div>
  )
}

function EditorDiscardPrompt({ onDiscard, onKeepEditing }: { onDiscard: () => void; onKeepEditing: () => void }) {
  return (
    <div className="editor-discard-warning" role="alert" aria-label="Cambios sin guardar">
      <div>
        <strong>Cambios sin guardar</strong>
        <span>Guarda la ficha o descarta los cambios antes de cerrar.</span>
      </div>
      <div className="action-row end">
        <button className="ghost-button" type="button" onClick={onKeepEditing}>
          Seguir editando
        </button>
        <button className="danger-button" type="button" onClick={onDiscard}>
          Descartar cambios
        </button>
      </div>
    </div>
  )
}

function ItemEditor({
  item,
  onClose,
  onDelete,
  onSave,
}: {
  item: ListItem
  onClose: () => void
  onDelete?: (item: ListItem) => Promise<void> | void
  onSave: (item: ListItem) => Promise<void> | void
}) {
  useRestoreFocusOnUnmount()

  const initialDraft = useMemo(() => ({
    ...item,
    tagsText: item.tags.join(', '),
    genresText: item.genres.join(', '),
    moodText: item.moodTags.join(', '),
  }), [item])
  const [draft, setDraft] = useState(initialDraft)
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false)
  const [isSavingAndClosing, setIsSavingAndClosing] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeletingItem, setIsDeletingItem] = useState(false)
  const [linkCopyStatus, setLinkCopyStatus] = useState<{ message: string; tone: FeedbackTone; url: string } | undefined>()
  const editorFormRef = useRef<HTMLFormElement>(null)
  const hasUnsavedEditorChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initialDraft), [draft, initialDraft])

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
  const isNewDraft = item.id.startsWith('manual-')
  const canCopyItemLink = !isNewDraft
  const canDeleteItem = Boolean(onDelete) && !isNewDraft
  const isMetadataLocked = item.source === 'external' || item.source === 'public'
  const canEditTitleInPrimary = !isMetadataLocked && isNewDraft
  const shouldAutofocusTitle = canEditTitleInPrimary && !draft.title.trim()
  const canSaveDraft = Boolean(draft.title.trim())
  const editorHeroClassName = [
    'editor-hero',
    draft.posterUrl ? 'has-poster' : 'generated-cover',
    isMetadataLocked ? 'metadata-locked' : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  const editorHeroStyle = getPosterBackplateStyle(draft.posterUrl)
  const editorSummaryText =
    draft.notes?.trim() || draft.publicSnapshot?.description?.trim() || `${typeLabels[draft.type]} en tu biblioteca personal.`
  const personalProgressSummary =
    draft.progress?.trim() || (draft.notes?.trim() ? 'Notas personales guardadas.' : 'Estado, nota y notas personales.')
  const heroSignals = uniqueValues([...selectedGenres, ...selectedTags]).slice(0, 4)
  const readiness = getPersonalEditorReadiness({
    ...draft,
    genres: selectedGenres,
    tags: selectedTags,
    moodTags: selectedMoodTags,
  })

  useEffect(() => {
    if (shouldAutofocusTitle) return
    editorFormRef.current?.focus({ preventScroll: true })
  }, [shouldAutofocusTitle])

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

  function buildSavedItem(): ListItem {
    const priorityWeight = Number(draft.weights.priority)
    const surpriseWeight = Number(draft.weights.surprise)
    const challengeWeight = Number(draft.weights.challenge)

    return {
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
  }

  async function saveAndClose() {
    if (isSavingAndClosing) return

    if (!hasUnsavedEditorChanges) {
      onClose()
      return
    }

    if (!canSaveDraft) {
      setShowDiscardPrompt(true)
      return
    }

    setShowDiscardPrompt(false)
    setIsSavingAndClosing(true)
    try {
      await onSave(buildSavedItem())
    } finally {
      setIsSavingAndClosing(false)
    }
  }

  function requestClose() {
    void saveAndClose()
  }

  function discardAndClose() {
    onClose()
  }

  function requestDelete() {
    setDeleteConfirmOpen(true)
  }

  async function confirmDelete() {
    if (!onDelete || isDeletingItem) return

    setIsDeletingItem(true)
    try {
      await onDelete(item)
    } finally {
      setIsDeletingItem(false)
    }
  }

  async function copyItemLink() {
    const itemUrl = buildItemShareUrl(item.id)
    const copied = await writeClipboardText(itemUrl)
    setLinkCopyStatus(
      copied
        ? { message: 'Enlace de ficha copiado', tone: 'success', url: itemUrl }
        : { message: 'Enlace listo para copiar manualmente', tone: 'info', url: itemUrl },
    )
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose()
        }
      }}
    >
      <form
        ref={editorFormRef}
        className="item-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Entrada"
        aria-describedby="item-editor-title"
        tabIndex={-1}
        onKeyDown={(event) => handleDialogKeyDown(event, requestClose)}
        onSubmit={(event) => {
          event.preventDefault()
          void saveAndClose()
        }}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Ficha personal</span>
            <p>{typeLabels[draft.type]} / {statusLabels[draft.status]}</p>
          </div>
          <div className="action-row end">
            {canCopyItemLink && (
              <button
                aria-label={`Copiar enlace a ${editorTitle}`}
                className="icon-button"
                type="button"
                onClick={() => void copyItemLink()}
                title="Copiar enlace"
              >
                {linkCopyStatus?.tone === 'success' ? <Check size={18} /> : <Copy size={18} />}
              </button>
            )}
            <button className="icon-button" type="button" onClick={requestClose} title="Cerrar y guardar">
              <X size={18} />
            </button>
          </div>
        </div>
        {showDiscardPrompt && <EditorDiscardPrompt onDiscard={onClose} onKeepEditing={() => setShowDiscardPrompt(false)} />}
        {linkCopyStatus && (
          <div className="link-copy-feedback">
            <FeedbackMessage tone={linkCopyStatus.tone}>{linkCopyStatus.message}</FeedbackMessage>
            <input
              aria-label="Enlace de ficha"
              readOnly
              value={linkCopyStatus.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )}
        {deleteConfirmOpen && (
          <div className="editor-delete-warning" role="alert" aria-label="Confirmar borrado de entrada">
            <div>
              <strong>Eliminar entrada</strong>
              <span>{editorTitle} se borrara por completo de tu biblioteca privada.</span>
            </div>
            <div className="action-row end">
              <button className="ghost-button" type="button" onClick={() => setDeleteConfirmOpen(false)}>
                Mantener
              </button>
              <button className="danger-button" type="button" disabled={isDeletingItem} onClick={() => void confirmDelete()}>
                <Trash2 size={16} />
                {isDeletingItem ? 'Eliminando' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        )}

        <div className={editorHeroClassName} style={editorHeroStyle}>
          <div className="editor-cover-frame">
            <CoverArt title={editorTitle} type={draft.type} posterUrl={draft.posterUrl} />
          </div>
          <div className="editor-summary">
            <div className="detail-meta">
              <span>{itemSourceLabels[draft.source]}</span>
              <span>{typeLabels[draft.type]}</span>
              {isMetadataLocked && <span>Solo progreso</span>}
            </div>
            <h3 id="item-editor-title">{editorTitle}</h3>
            <p>{editorSummaryText}</p>
            {heroSignals.length > 0 && (
              <div className="tag-row editor-hero-tags" aria-label="Senales de la ficha">
                {heroSignals.map((signal) => (
                  <span key={signal}>{signal}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {isMetadataLocked && <LockedMetadataSummary item={draft} />}

        <section className={canEditTitleInPrimary ? 'editor-section editor-progress-panel has-title-field' : 'editor-section editor-progress-panel'}>
          <div className="editor-progress-heading">
            <div>
              <span className="eyebrow">{canEditTitleInPrimary ? 'Nueva obra' : 'Personal'}</span>
              <h3>{canEditTitleInPrimary ? 'Datos basicos' : 'Progreso'}</h3>
              <p>{personalProgressSummary}</p>
            </div>
          </div>
          {canEditTitleInPrimary && (
            <label>
              Titulo
              <input autoFocus={shouldAutofocusTitle} required value={draft.title} onChange={(event) => update('title', event.target.value)} />
            </label>
          )}
          <div className="form-grid editor-progress-fields">
            <StatusControl value={draft.status} onChange={(status) => update('status', status)} />
            <RatingControl value={draft.rating} onChange={(rating) => update('rating', rating)} />
            <label>
              Progreso
              <input value={draft.progress ?? ''} onChange={(event) => update('progress', event.target.value || undefined)} />
            </label>
          </div>
          <label className="editor-notes-field">
            Notas
            <textarea value={draft.notes ?? ''} onChange={(event) => update('notes', event.target.value)} />
          </label>
        </section>

        <details className="editor-advanced-panel" data-close-on-outside>
          <summary>
            <span>
              <strong>Avanzado</strong>
              <small>{isMetadataLocked ? 'Tono y prioridad personal' : 'Metadatos, taxonomia y dado'}</small>
            </span>
          </summary>
          <div className="editor-advanced-content">
            {!isMetadataLocked && (
              <>
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
                </section>

                <section className="personal-template-panel" aria-label="Inicio rapido de entrada">
                  <div className="personal-template-heading">
                    <div>
                      <span className="eyebrow">Inicio rapido</span>
                      <strong>Parte de una receta</strong>
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
                      </button>
                    ))}
                  </div>
                </section>

                <section className="editor-section">
                  <h3>Metadatos</h3>
                  <div className="form-grid">
                    {!canEditTitleInPrimary && (
                      <label>
                        Titulo
                        <input required value={draft.title} onChange={(event) => update('title', event.target.value)} />
                      </label>
                    )}
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
                      Poster o portada
                      <input value={draft.posterUrl ?? ''} onChange={(event) => update('posterUrl', event.target.value || undefined)} />
                    </label>
                  </div>
                </section>

                <section className="editor-section">
                  <div className="editor-section-heading">
                    <div>
                      <h3>Taxonomia</h3>
                      <p>{selectedGenres.length + selectedTags.length + selectedMoodTags.length} senales</p>
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
                    </div>
                  </div>
                </section>
              </>
            )}
            <section className="editor-section">
              <h3>Personal</h3>
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
                  Duracion personal
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
            </section>
            <section className="editor-section">
              <h3>Tono</h3>
              <PresetChipGroup
                label="Tono"
                values={moodPresets}
                selectedKeys={selectedMoodKeys}
                onToggle={(value) => toggleDraftTextPreset('moodText', value)}
              />
            </section>
            <OriginSummary item={draft} />
          </div>
        </details>

        <div className="action-row end editor-footer-actions">
          {canDeleteItem && (
            <button className="editor-delete-entry-button" type="button" onClick={requestDelete}>
              <Trash2 size={16} />
              Eliminar entrada
            </button>
          )}
          <details className="editor-secondary-actions">
            <summary>
              <MoreHorizontal size={17} />
              Opciones
            </summary>
            <div className="editor-secondary-action-list">
              <button className="ghost-button" type="button" onClick={discardAndClose}>
                Descartar cambios
              </button>
            </div>
          </details>
          <span className="editor-autosave-note">Se guarda al cerrar</span>
          <button className="primary-button" type="button" disabled={isSavingAndClosing} onClick={requestClose}>
            {isSavingAndClosing ? 'Guardando' : 'Cerrar'}
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
  useRestoreFocusOnUnmount()

  const initialDraft = useMemo(() => ({
    ...item,
    tagsText: item.tags.join(', '),
    genresText: item.genres.join(', '),
    moodText: item.moodTags.join(', '),
    aliasesText: (item.searchAliases ?? []).join(', '),
  }), [item])
  const [draft, setDraft] = useState(initialDraft)
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false)
  const hasUnsavedEditorChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initialDraft), [draft, initialDraft])

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
        searchAliases: splitList(draft.aliasesText),
      },
      draft.updatedBy || 'moderator',
    )
  }

  function toggleTextPreset(field: 'genresText' | 'tagsText' | 'moodText', value: string) {
    setDraft((current) => {
      return {
        ...current,
        [field]: toggleListTextValue(current[field], value),
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

  function requestClose() {
    if (hasUnsavedEditorChanges) {
      setShowDiscardPrompt(true)
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="item-editor public-item-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-item-editor-title"
        onKeyDown={(event) => handleDialogKeyDown(event, requestClose)}
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
          <button className="icon-button" type="button" onClick={requestClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>
        {showDiscardPrompt && <EditorDiscardPrompt onDiscard={onClose} onKeepEditing={() => setShowDiscardPrompt(false)} />}

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
                <input autoFocus required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label>
                Alias de busqueda
                <input
                  aria-label="Alias de busqueda"
                  value={draft.aliasesText}
                  onChange={(event) => setDraft((current) => ({ ...current, aliasesText: event.target.value }))}
                />
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
          <button className="ghost-button" type="button" onClick={requestClose}>
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
  const signals = getLibraryNextPlanSignals(item)
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

interface ToastAction {
  ariaLabel?: string
  label: string
  onClick: () => void
}

interface ToastMessage {
  action?: ToastAction
  durationMs?: number
  id: string
  message: ReactNode
  tone?: FeedbackTone
}

function ToastStack({ label = 'Notificaciones', onDismiss, toasts }: { label?: string; onDismiss: (id: string) => void; toasts: ToastMessage[] }) {
  useEffect(() => {
    const timers = toasts.flatMap((toast) => {
      if (!toast.durationMs) return []
      return [
        window.setTimeout(() => {
          onDismiss(toast.id)
        }, toast.durationMs),
      ]
    })

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [onDismiss, toasts])

  if (!toasts.length) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-label={label}>
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'info'
        const Icon = tone === 'danger' ? AlertTriangle : tone === 'success' ? CheckCircle2 : tone === 'loading' ? LoaderCircle : Info

        return (
          <div className={`toast-message ${tone}`} key={toast.id} role={tone === 'danger' ? 'alert' : 'status'}>
            <Icon aria-hidden="true" size={16} />
            <span>{toast.message}</span>
            {toast.action && (
              <button className="toast-action" type="button" aria-label={toast.action.ariaLabel ?? toast.action.label} onClick={toast.action.onClick}>
                {toast.action.label}
              </button>
            )}
            <button className="toast-close" type="button" aria-label="Cerrar notificacion" onClick={() => onDismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        )
      })}
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
          {values.slice(0, 8).map((value, index) => (
            <span key={`${normalizeKey(value)}-${index}`}>{value}</span>
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
    { label: 'Senales bloqueadas', value: breakdown.blockedTags },
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

function LockedMetadataSummary({ item }: { item: ListItem }) {
  const externalRefs = getExternalRefEntries(item.externalRefs)
  const lockedGenres = item.genres.slice(0, 4)
  const lockedTags = item.tags.filter((tag) => tag !== item.type).slice(0, 4)
  const releaseYear = item.publicSnapshot?.releaseYear

  return (
    <section className="locked-metadata-panel" aria-label="Metadatos protegidos">
      <div className="locked-metadata-heading">
        <span>
          <LockKeyhole size={16} />
        </span>
        <div>
          <h3>Metadatos protegidos</h3>
          <p>Titulo, tipo, portada, generos y referencias vienen de la fuente. Aqui solo cambias tu progreso.</p>
        </div>
      </div>
      <div className="locked-metadata-facts">
        <span>
          <strong>Fuente</strong>
          {itemSourceLabels[item.source]}
        </span>
        <span>
          <strong>Tipo</strong>
          {typeLabels[item.type]}
        </span>
        {releaseYear && (
          <span>
            <strong>Ano</strong>
            {releaseYear}
          </span>
        )}
        {externalRefs.length > 0 && (
          <span>
            <strong>Refs</strong>
            {externalRefs.length}
          </span>
        )}
      </div>
      {(lockedGenres.length > 0 || lockedTags.length > 0) && (
        <div className="tag-row locked-metadata-tags">
          {uniqueValues([...lockedGenres, ...lockedTags]).slice(0, 6).map((signal) => (
            <span key={signal}>{signal}</span>
          ))}
        </div>
      )}
    </section>
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
        <NexoMark />
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {action}
      </section>
    </main>
  )
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

export default App
