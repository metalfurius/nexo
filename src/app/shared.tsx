/* eslint-disable react-refresh/only-export-components */
import { catalogGenrePresets, catalogMoodPresets, catalogTagPresets, type CatalogTaxonomyTemplate, catalogTaxonomyTemplates } from '../data/catalogPresets'
import { type ActivityEntry, type ActivityTab, type ActivityTarget, type ActivityTone, DEFAULT_WEIGHTS, type DiscoveryCandidate, type DiscoveryStatus, type ExplorerSearchType, type ExternalCandidate, type ImportPreview, ITEM_STATUSES, ITEM_TYPES, type ItemStatus, type ItemType, type LibraryCardsPerRow, type LibrarySyncState, type LibraryViewMode, type ListItem, nowIso, PROGRESS_UNITS, type ProgressUnit, type PublicCatalogItem, type RecommendationPreferences, type RecommendationResult, THEME_MODES, type ThemeMode, USER_ROLES, type UserProfile, type UserRole, type UserSettings } from '../domain/types'
import { getActivityContinuitySummary, getActivityDestinationTab } from '../lib/activityInsights'
import { buildPublicCatalogItem } from '../lib/catalog'
import { buildCatalogDescriptionDraft, type CatalogIssueKey, catalogIssueShortLabels, draftCatalogQualityWarnings } from '../lib/catalogInsights'
import { CATALOG_RESULTS_PAGE_SIZE } from '../lib/catalogSearch'
import { type DiceEligibilityBreakdown, type RecommendationSessionPlan } from '../lib/diceInsights'
import { type CandidateDecisionBrief, discoveryStatusLabels, type ExplorerSourceFilter, discoverySourceLabels as sourceLabels } from '../lib/explorerInsights'
import { getExternalRefEntries } from '../lib/externalRefs'
import { createLibraryExportPayload, getLibraryImportRollbackPlan, getLibraryImportSummary, type LibraryImportRollbackPlan, type LibraryImportSummary, type ParsedLibraryImport, parseLibraryImportPayload } from '../lib/libraryBackup'
import { getLibraryFocusItems, getLibraryFocusReason, getLibraryLaunchGuide, getLibraryNextPlanFacts, getLibraryNextPlanSignals, getLibraryNextPlanTitle, getLibraryReviewQueues, getLibrarySmartViewOptions, isItemReadyForDicePulse, type LibraryLaunchGuide, type LibraryLaunchStep, type LibraryReviewQueue, type LibrarySmartView, matchesLibrarySmartView } from '../lib/libraryInsights'
import { formatDateLabel, formatProgress, getDefaultProgressUnit, getItemSubtitle, getPersonalEditorReadiness, getProgressEditorMode, isItemInCooldown, itemSourceLabels, progressUnitLabels, itemStatusLabels as statusLabels, itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { type LibrarySortMode, sortLibraryItems } from '../lib/librarySorting'
import { type PublicCatalogSeedResult, type PublicCatalogSeedRollbackPlan, type PublicCatalogSeedSummary } from '../lib/publicCatalogSeed'
import { mergeListText, normalizeKey, slugify, splitList, toggleListTextValue, uniqueNormalizedValues, uniqueValues } from '../lib/strings'
import { type ExternalDiscoverDuration, type ExternalDiscoverType, externalSourceCredits } from '../services/externalSourceCredits'
import { importSourceLabels } from '../services/importSourceLabels'
import { type NotificationIntentState } from '../services/notificationService'
import { AlertTriangle, Archive, BookOpen, Check, CheckCircle2, Copy, Dice5, Download, Eye, Film, Gamepad2, HelpCircle, Info, Library, LoaderCircle, type LucideIcon, Minus, Moon, MoreHorizontal, Pause, Play, Plus, RotateCcw, Save, Search, ShieldCheck, Sparkles, Star, Trash2, Upload, X } from 'lucide-react'
import { type CSSProperties, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export const librarySortLabels: Record<LibrarySortMode, string> = {
  focus: 'Foco',
  updated: 'Recientes',
  title: 'Titulo',
  priority: 'Prioridad',
  rating: 'Rating',
}

export const libraryCardsPerRowOptions: LibraryCardsPerRow[] = [4, 5, 6]

export const progressUnitOptions: ProgressUnit[] = [...PROGRESS_UNITS]

export const libraryCatalogSearchTypes: Array<{ id: ExplorerSearchType; label: string }> = [
  { id: 'any', label: 'Todo' },
  { id: 'watch', label: 'Ver' },
  { id: 'game', label: 'Juegos' },
  { id: 'book', label: 'Libros' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
  { id: 'manhwa', label: 'Manhwa' },
]

export const explorerDiscoverTypeOptions: Array<{ id: ExternalDiscoverType; label: string }> = [
  { id: 'any', label: 'Cualquiera' },
  { id: 'movie', label: 'Pelicula' },
  { id: 'series', label: 'Serie' },
  { id: 'animeManga', label: 'Anime/Manga' },
  { id: 'game', label: 'Juego' },
  { id: 'book', label: 'Libro' },
]

export const explorerDiscoverDurationOptions: Array<{ id: ExternalDiscoverDuration; label: string }> = [
  { id: 'any', label: 'Cualquiera' },
  { id: 'short', label: 'Corto' },
  { id: 'medium', label: 'Medio' },
  { id: 'long', label: 'Largo' },
]

export type LibraryPriorityLevel = 'low' | 'normal' | 'high'

export type LibrarySelectionSignalAction = 'add' | 'remove'

export type LibrarySelectionSignalKind = 'genre' | 'mood' | 'tag'

export const libraryPriorityOptions: Array<{
  detail: string
  id: LibraryPriorityLevel
  label: string
  value: number
}> = [
  { detail: 'Apartar del dado sin pausar la ficha', id: 'low', label: 'Foco bajo', value: 0.7 },
  { detail: 'Peso equilibrado para el dado', id: 'normal', label: 'Foco normal', value: 1 },
  { detail: 'Subir en la cola del dado', id: 'high', label: 'Foco alto', value: 1.35 },
]

export const librarySelectionSignalLabels: Record<LibrarySelectionSignalKind, { plural: string; singular: string; title: string }> = {
  genre: { plural: 'generos', singular: 'genero', title: 'genero' },
  mood: { plural: 'mood tags', singular: 'mood tag', title: 'mood' },
  tag: { plural: 'tags', singular: 'tag', title: 'tag' },
}

export const librarySelectionSignalOptions: Array<{
  id: LibrarySelectionSignalKind
  label: string
  placeholder: string
}> = [
  { id: 'tag', label: 'Tags', placeholder: 'Tags, separados por coma' },
  { id: 'genre', label: 'Generos', placeholder: 'Generos, separados por coma' },
  { id: 'mood', label: 'Mood tags', placeholder: 'Mood tags, separados por coma' },
]

export const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  moderator: 'Moderador',
  user: 'Usuario',
}

export const themeOptions: Array<{
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

export const themeLabels: Record<ThemeMode, string> = Object.fromEntries(
  themeOptions.map((option) => [option.id, option.label]),
) as Record<ThemeMode, string>

export const themeMetaColors: Record<ThemeMode, string> = {
  aurora: '#101113',
  dark: '#0f1214',
  forest: '#0f1712',
  light: '#f8faf9',
  mint: '#f5fbf7',
  ocean: '#0d1726',
  rose: '#fff5f8',
}

export const coverArtPalettes: Record<ItemType, Array<[string, string, string]>> = {
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

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

export function isThemeMode(value: string | null): value is ThemeMode {
  return Boolean(value && THEME_MODES.includes(value as ThemeMode))
}

export function isStandalonePwa() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || iosNavigator.standalone)
}

export const rolePermissionSummaries: Array<{ role: UserRole; detail: string; permissions: string[] }> = [
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

export const typeIcons: Record<ItemType, typeof Film> = {
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

export type FeedbackTone = ActivityTone

export function feedbackToneFromText(message: string): FeedbackTone {
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

export type ActivityFocus = ActivityTarget

export type AppTab = ActivityTab

export interface LibrarySmartViewRequest {
  id: LibrarySmartView
  requestId: number
}

export interface LibrarySortModeRequest {
  mode: LibrarySortMode
  requestId: number
}

export interface LibraryStatusFilterRequest {
  requestId: number
  status: ItemStatus
}

export interface LibraryTypeFilterRequest {
  requestId: number
  type: ItemType
}

export interface LibraryPrimaryActionRequest {
  itemId: string
  requestId: number
}

export interface LibraryImportRequest {
  requestId: number
}

export interface LibraryReviewRequest {
  id: LibrarySmartView
  requestId: number
}

export interface LibraryResetViewRequest {
  requestId: number
}

export interface LibraryVisibleSelectionRequest {
  requestId: number
}

export interface LibraryVisibleSelectionSummary {
  allVisibleItemsSelected: boolean
  selectedVisibleCount: number
  visibleCount: number
}

export interface LibrarySelectedStatusRequest {
  requestId: number
  status: ItemStatus
}

export interface LibrarySelectedDiceActionRequest {
  action: 'snooze' | 'reactivate'
  requestId: number
}

export interface LibrarySelectedPriorityRequest {
  level: LibraryPriorityLevel
  requestId: number
}

export interface LibrarySelectedSignalsRequest {
  action: LibrarySelectionSignalAction
  kind: LibrarySelectionSignalKind
  requestId: number
  values: string[]
}

export interface LibrarySelectedExportRequest {
  requestId: number
}

export interface DiceRollRequest {
  requestId: number
}

export interface DiceRollSummary {
  candidateCount: number
}

export interface DicePreferencesSaveRequest {
  requestId: number
}

export interface DiceCooldownReactivateRequest {
  requestId: number
}

export interface ExplorerSearchRequest {
  query: string
  requestId: number
}

export interface ExplorerPromptCardRequest {
  requestId: number
}

export interface ExplorerCandidateRequest {
  candidateId: string
  requestId: number
}

export interface ExplorerCandidateSaveRequest {
  candidateId: string
  requestId: number
}

export interface ExplorerCandidateDismissRequest {
  candidateId: string
  requestId: number
}

export interface ExplorerVisibleSaveRequest {
  requestId: number
  sourceFilter: ExplorerSourceFilter
}

export interface ExplorerVisibleDismissRequest {
  requestId: number
  sourceFilter: ExplorerSourceFilter
}

export interface SettingsTaxonomyRepairRequest {
  requestId: number
}

export interface SettingsTasteSuggestionsRequest {
  requestId: number
}

export interface SettingsSaveRequest {
  requestId: number
}

export type PendingNavigation = {
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

export type ActivityRecorder = (entry: Omit<ActivityEntry, 'createdAt' | 'id'>) => void

export interface QuickSearchCommand {
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

export type QuickSearchEntry =
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

export interface ScoredQuickSearchEntry {
  entry: QuickSearchEntry
  index: number
  score: number
}

export type QuickSearchCommandEntry = Extract<QuickSearchEntry, { kind: 'command' }>

export const dialogFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface DialogScrollLockSnapshot {
  bodyOverflow: string
  bodyPaddingRight: string
  bodyPosition: string
  bodyTop: string
  bodyWidth: string
  documentOverflow: string
  scrollX: number
  scrollY: number
}

export let dialogScrollLockCount = 0

export let dialogScrollLockSnapshot: DialogScrollLockSnapshot | undefined

export function lockDialogScroll() {
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

export function unlockDialogScroll() {
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

export function getDialogFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(dialogFocusableSelector)).filter(
    (element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'),
  )
}

export function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
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

export function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>, onClose: () => void) {
  if (event.key === 'Tab') {
    trapDialogFocus(event)
    return
  }
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  onClose()
}

export function getCurrentFocusTarget() {
  if (typeof document === 'undefined') return null
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) return null
  if (activeElement === document.body || activeElement === document.documentElement) return null
  return activeElement
}

export function restoreDialogFocus(target: HTMLElement | null) {
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

export function scheduleDialogFocusRestore(target: HTMLElement | null) {
  if (typeof window === 'undefined') return
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => restoreDialogFocus(target))
    return
  }
  window.setTimeout(() => restoreDialogFocus(target), 0)
}

export function useDialogLifecycle() {
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

export function useRestoreFocusOnUnmount() {
  useDialogLifecycle()
}

export function DialogFocusReturn() {
  useDialogLifecycle()
  return null
}

export interface ShellNavItem {
  description: string
  displayLabel?: string
  group?: 'primary' | 'utility'
  hidden?: boolean
  icon: typeof Library
  id: AppTab
  label: string
  shortLabel?: string
}

export const activityTabLabels: Record<AppTab, string> = {
  catalog: 'Catalogo',
  curation: 'Curacion',
  dice: 'Dado',
  explorer: 'Explorador',
  import: 'Importar',
  library: 'Biblioteca',
  settings: 'Ajustes',
}

export const sessionActivityLimit = 5

export const serviceImportPreviewRenderLimit = 80

export interface PrivateDataAction {
  detail: string
  disabled?: boolean
  danger?: boolean
  Icon: typeof Download
  id: string
  label: string
  onClick: () => void
  primary?: boolean
}

export interface DiceRecoveryAction {
  detail: string
  Icon: typeof Download
  id: string
  label: string
  onClick: () => void
}

export interface AuthUserSummary {
  uid: string
  email: string | null
  displayName: string | null
  photoURL?: string | null
}

export const themeStorageKey = 'nexo-theme'

export const promptDeck = [
  'Un clasico que aun no has tocado',
  'Algo corto para una noche rara',
  'Una obra que cambie de textura a mitad',
  'Un pendiente que merezca segunda oportunidad',
]

export const fallbackExplorerStarters: Array<{
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

export const curationStarterTypes: ItemType[] = ['book', 'game', 'movie', 'series', 'anime', 'manga']

export const urlAddressableTabs: AppTab[] = ['catalog', 'library', 'dice', 'explorer', 'import', 'settings']

export function explorerSearchTypeForItemType(itemType: ItemType): ExplorerSearchType {
  if (itemType === 'movie' || itemType === 'series') return 'watch'
  if (itemType === 'game' || itemType === 'book' || itemType === 'anime' || itemType === 'manga' || itemType === 'manhwa') {
    return itemType
  }
  return 'any'
}

export function readInitialAppTab(): AppTab {
  const searchParams = new URLSearchParams(window.location.search)
  if (searchParams.get('item')) return 'library'

  const tab = searchParams.get('tab')
  return urlAddressableTabs.includes(tab as AppTab) ? (tab as AppTab) : 'catalog'
}

export function readInitialActivityFocus(): ActivityFocus | undefined {
  const itemId = new URLSearchParams(window.location.search).get('item')?.trim()
  return itemId ? { kind: 'item', id: itemId } : undefined
}

export function writeAppTabToUrl(tab: AppTab, mode: 'push' | 'replace' = 'replace', focus?: ActivityFocus) {
  const url = new URL(window.location.href)
  if (tab === 'catalog' || !urlAddressableTabs.includes(tab)) {
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

export function buildItemShareUrl(itemId: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete('tab')
  url.searchParams.set('item', itemId)
  return url.toString()
}

export function getImportPreviewNewItems(preview: ImportPreview) {
  return preview.items.filter((item) => !item.duplicateOfId)
}

export function getSearchQueryFromItemId(itemId: string) {
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

export const dicePreferencePresets: Array<{
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

export const blankItem = (): ListItem => ({
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

export function cloneActivityEntry(entry: ActivityEntry): ActivityEntry {
  return {
    ...entry,
    target: entry.target ? { ...entry.target } : undefined,
  }
}

export function useCloseDetailsOnOutsideClick() {
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

export function QuickSearchDialog({
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

export function SessionActivityPanel({
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

export function getActivityFocus(entry: ActivityEntry): ActivityFocus | undefined {
  return entry.target?.kind === 'item' ? entry.target : undefined
}

export function getActivityIcon(tone: FeedbackTone) {
  if (tone === 'danger') return AlertTriangle
  if (tone === 'loading') return LoaderCircle
  if (tone === 'success') return CheckCircle2
  return Info
}

export function NexoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'nexo-mark compact' : 'nexo-mark'} aria-hidden="true">
      <span className="nexo-mark-letter">N</span>
      <span className="nexo-mark-node one" />
      <span className="nexo-mark-node two" />
      <span className="nexo-mark-node three" />
    </span>
  )
}

export function ShellPulse({
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

export function NavigationDiscardPrompt({
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

export interface LibrarySurface {
  items: ListItem[]
  settings: UserSettings
  discoveryCandidates: DiscoveryCandidate[]
  activityEntries: ActivityEntry[]
  userProfiles: UserProfile[]
  userRole: UserRole
  isModerator: boolean
  loading: boolean
  error?: string
  syncState: LibrarySyncState
  saveItem: (item: ListItem) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  deleteAllItems: () => Promise<void>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  snoozeRecommendation: (id: string) => Promise<void>
  reactivateRecommendation: (id: string) => Promise<void>
  setRecommendationCooldown: (id: string, cooldownUntil?: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
  searchCatalog: (query: string, type?: string) => Promise<DiscoveryCandidate[]>
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

export interface PendingBackupImport {
  fileName: string
  payload: ParsedLibraryImport
  summary: LibraryImportSummary
}

export type ServiceImportDialogPhase = 'loading' | 'preview' | 'applying' | 'complete' | 'error'

export interface ServiceImportApplyProgress {
  current: number
  total: number
}

export type DiceUndoAction =
  | { kind: 'status'; itemId: string; previousStatus: ItemStatus; title: string }
  | { kind: 'snooze'; recommendation: RecommendationResult; title: string }
  | { kind: 'cooldowns'; items: ListItem[] }

export interface DiceDecisionSummary {
  detail: string
  itemId: string
  kind: 'started' | 'snoozed'
  title: string
}

export type DiceSettingsUndo = {
  allowPausedByDefault: boolean
  favoriteGenres: string[]
  favoriteTags: string[]
  kind: 'preferences' | 'taste'
  preferences: RecommendationPreferences
  surprisePercent: number
}

export type LibraryStatusUndo =
  | { id: string; kind: 'single'; previousStatus: ItemStatus; title: string }
  | { changes: Array<{ id: string; previousStatus: ItemStatus; title: string }>; kind: 'bulk' }

export interface LibraryCooldownUndo {
  changes: Array<{ id: string; previousCooldownUntil?: string; title: string }>
}

export interface LibraryPriorityUndo {
  changes: Array<{ id: string; previousPriority: number; title: string }>
}

export interface LibraryTagUndo {
  changes: Array<{ id: string; previousValues: string[]; title: string }>
  kind: LibrarySelectionSignalKind
  values: string[]
}

export type DeletedLibraryUndoKind = 'all' | 'selection'

export interface ActiveLibraryReviewSession {
  detail: string
  id: LibrarySmartView
  label: string
}

export interface CompletedExplorerQueue {
  actionLabel: string
  detail: string
  nextView: DiscoveryStatus
  sourceLabel: string
  title: string
}

export interface PendingCatalogSeedImport {
  fileName: string
  result: PublicCatalogSeedResult
  summary: PublicCatalogSeedSummary
}

export function LibraryTab({
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
      const candidates = await library.searchCatalog(cleanedQuery, catalogType)
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

export function formatBackupImportSummary(summary: LibraryImportSummary) {
  const parts = [
    `${summary.newItems} ${summary.newItems === 1 ? 'nueva' : 'nuevas'}`,
    `${summary.updatedItems} ${summary.updatedItems === 1 ? 'actualizada' : 'actualizadas'}`,
  ]
  if (summary.duplicateItems) parts.push(`${summary.duplicateItems} ${summary.duplicateItems === 1 ? 'duplicada' : 'duplicadas'}`)
  if (summary.settingsIncluded) parts.push('ajustes')
  return parts.join(' / ')
}

export function formatLibraryImportRollbackDetail(plan: LibraryImportRollbackPlan) {
  const parts = [
    plan.newItemIds.length ? `${plan.newItemIds.length} nuevas eliminadas` : undefined,
    plan.previousItems.length ? `${plan.previousItems.length} restauradas` : undefined,
    plan.previousSettings ? 'ajustes recuperados' : undefined,
  ].filter((part): part is string => Boolean(part))

  return parts.length ? parts.join(' / ') : 'Sin cambios que revertir'
}

export function formatLibraryImportRollbackStatus(plan: LibraryImportRollbackPlan) {
  return `Importacion deshecha: ${formatLibraryImportRollbackDetail(plan)}`
}

export function formatLibraryCooldownRollbackDetail(plan: LibraryCooldownUndo) {
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

export function formatLibraryCooldownRollbackStatus(plan: LibraryCooldownUndo) {
  return `Dado deshecho: ${formatLibraryCooldownRollbackDetail(plan)}`
}

export function formatCatalogSeedSummary(summary: PublicCatalogSeedSummary) {
  return [
    `${summary.newItems} ${summary.newItems === 1 ? 'nueva' : 'nuevas'}`,
    `${summary.updatedItems} ${summary.updatedItems === 1 ? 'actualizada' : 'actualizadas'}`,
  ].join(' / ')
}

export function formatCatalogSeedRollbackDetail(plan: PublicCatalogSeedRollbackPlan) {
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

export function formatCatalogSeedRollbackStatus(plan: PublicCatalogSeedRollbackPlan) {
  return `Seed deshecho: ${formatCatalogSeedRollbackDetail(plan)}`
}

export function formatCatalogRepairIssues(issues: CatalogIssueKey[]) {
  return issues.map((issue) => catalogIssueShortLabels[issue].toLowerCase()).join(', ')
}

export function cloneRecommendationPreferences(preferences: RecommendationPreferences): RecommendationPreferences {
  return { ...preferences }
}

export function cloneUserSettings(settings: UserSettings): UserSettings {
  return {
    ...settings,
    favoriteGenres: [...settings.favoriteGenres],
    favoriteTags: [...settings.favoriteTags],
    blockedTags: [...settings.blockedTags],
    recommendationPreferences: cloneRecommendationPreferences(settings.recommendationPreferences),
  }
}

export function ServiceImportDialog({
  allNewCount,
  applyProgress,
  isDefaultSelection,
  message,
  phase,
  preview,
  renderedItems,
  selectedCount,
  selectedIdSet,
  sourceLabel,
  statusFilter,
  visibleCount,
  visibleLimit,
  onClearSelection,
  onClose,
  onImportAll,
  onImportSelected,
  onNavigate,
  onSelectAll,
  onShowMore,
  onStatusFilterChange,
  onToggleSelection,
  onUndo,
}: {
  allNewCount: number
  applyProgress?: ServiceImportApplyProgress
  isDefaultSelection: boolean
  message?: string
  phase: ServiceImportDialogPhase
  preview?: ImportPreview
  renderedItems: ImportPreview['items']
  selectedCount: number
  selectedIdSet: Set<string>
  sourceLabel: string
  statusFilter: ItemStatus | 'all'
  visibleCount: number
  visibleLimit: number
  onClearSelection: () => void
  onClose: () => void
  onImportAll: () => void
  onImportSelected: () => void
  onNavigate: (tab: AppTab) => void
  onSelectAll: () => void
  onShowMore: () => void
  onStatusFilterChange: (status: ItemStatus | 'all') => void
  onToggleSelection: (itemId: string, selected: boolean) => void
  onUndo?: () => void
}) {
  const isBusy = phase === 'loading' || phase === 'applying'
  const canClose = phase !== 'applying'
  const progressPercent = applyProgress && applyProgress.total > 0
    ? Math.round((applyProgress.current / applyProgress.total) * 100)
    : 0

  return (
    <div className="modal-backdrop" role="presentation">
      <DialogFocusReturn />
      <section
        aria-labelledby="service-import-dialog-title"
        aria-modal="true"
        className="service-import-dialog"
        role="dialog"
        onKeyDown={(event) => handleDialogKeyDown(event, canClose ? onClose : () => undefined)}
      >
        <div className="service-import-dialog-heading">
          <div>
            <span className="eyebrow">Importar biblioteca</span>
            <h2 id="service-import-dialog-title">{sourceLabel}</h2>
            {message && <p>{message}</p>}
          </div>
          <button className="ghost-button" disabled={!canClose} type="button" onClick={onClose}>
            <X size={16} />
            {phase === 'loading' ? 'Cancelar' : 'Cerrar'}
          </button>
        </div>

        {phase === 'loading' && (
          <div className="service-import-progress-state" role="status">
            <LoaderCircle size={22} />
            <strong>Leyendo datos...</strong>
            <span>El preview aparecera aqui antes de tocar tu biblioteca.</span>
          </div>
        )}

        {phase === 'applying' && (
          <div className="service-import-progress-state" role="status">
            <LoaderCircle size={22} />
            <strong>{message ?? 'Importando entradas...'}</strong>
            {applyProgress && (
              <div className="service-import-progress-meter" aria-label={`Progreso de importacion ${progressPercent}%`}>
                <span style={{ width: `${progressPercent}%` }} />
              </div>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="service-import-error">
            <FeedbackMessage tone="danger">{message ?? 'No se pudo preparar la importacion.'}</FeedbackMessage>
            {onUndo && (
              <div className="action-row end">
                <button className="secondary-button" type="button" onClick={onUndo}>
                  <RotateCcw size={16} />
                  Deshacer importacion
                </button>
              </div>
            )}
          </div>
        )}

        {phase === 'complete' && (
          <div className="service-import-complete">
            <FeedbackMessage tone="success">{message ?? 'Importacion completada.'}</FeedbackMessage>
            <div className="action-row end">
              {onUndo && (
                <button className="secondary-button" type="button" onClick={onUndo}>
                  <RotateCcw size={16} />
                  Deshacer importacion
                </button>
              )}
              <button className="primary-button" type="button" onClick={() => onNavigate('library')}>
                <Library size={16} />
                Ver Biblioteca
              </button>
            </div>
          </div>
        )}

        {preview && (phase === 'preview' || phase === 'applying') && (
          <div className="service-import-preview" aria-label={`Preview de importacion ${preview.sourceLabel}`}>
            <div className="service-import-metrics">
              <span>
                <strong>{preview.totalEntries}</strong>
                Total
              </span>
              <span>
                <strong>{preview.newItems}</strong>
                Nuevas
              </span>
              <span>
                <strong>{preview.duplicateItems}</strong>
                Duplicadas
              </span>
              <span>
                <strong>{preview.invalidItems}</strong>
                Invalidas
              </span>
            </div>

            <div className="service-import-counts" aria-label="Conteo por tipo">
              {(Object.entries(preview.typeCounts) as Array<[ItemType, number]>).map(([type, count]) => (
                <span key={type}>
                  {typeLabels[type]}: {count}
                </span>
              ))}
            </div>

            <div className="service-import-filters" aria-label="Filtros por estado">
              <button
                className={statusFilter === 'all' ? 'active' : undefined}
                disabled={isBusy}
                type="button"
                onClick={() => onStatusFilterChange('all')}
              >
                Todos
              </button>
              {ITEM_STATUSES.map((status) => (
                <button
                  className={statusFilter === status ? 'active' : undefined}
                  disabled={isBusy}
                  key={status}
                  type="button"
                  onClick={() => onStatusFilterChange(status)}
                >
                  {statusLabels[status]} ({preview.statusCounts[status] ?? 0})
                </button>
              ))}
            </div>

            <div className="service-import-selection-actions">
              <span>{selectedCount} seleccionadas</span>
              <button className="ghost-button" disabled={isBusy || allNewCount === 0} type="button" onClick={onSelectAll}>
                <Check size={15} />
                Seleccionar todas nuevas
              </button>
              <button className="ghost-button" disabled={isBusy} type="button" onClick={onClearSelection}>
                <X size={15} />
                Limpiar
              </button>
            </div>

            <div className="service-import-table" aria-label="Entradas preparadas">
              <div className="service-import-table-head" aria-hidden="true">
                <span>Titulo</span>
                <span>Tipo</span>
                <span>Estado</span>
                <span>Ano</span>
                <span>Revision</span>
              </div>
              <div className="service-import-table-body">
                {renderedItems.map((item) => {
                  const duplicateLabel =
                    item.duplicateReason === 'externalRefs'
                      ? 'Duplicado por ID externo'
                      : item.duplicateReason === 'titleTypeYear'
                        ? 'Duplicado por titulo/tipo/ano'
                        : 'Nueva'
                  return (
                    <label
                      className={item.duplicateOfId ? 'service-import-table-row duplicate' : 'service-import-table-row'}
                      key={item.id}
                    >
                      <input
                        aria-label={`Seleccionar ${item.draft.title}`}
                        checked={selectedIdSet.has(item.id)}
                        disabled={isBusy || Boolean(item.duplicateOfId)}
                        type="checkbox"
                        onChange={(event) => onToggleSelection(item.id, event.target.checked)}
                      />
                      <span className="service-import-title-cell">
                        <strong>{item.draft.title}</strong>
                        <small>{item.draft.importNotes?.[0] ?? importSourceLabels[item.draft.sourceId]}</small>
                      </span>
                      <span>{typeLabels[item.draft.type]}</span>
                      <span>{statusLabels[item.draft.status]}</span>
                      <span>{item.draft.releaseYear ?? '-'}</span>
                      <em>{duplicateLabel}</em>
                    </label>
                  )
                })}
              </div>
            </div>

            {visibleCount > renderedItems.length && (
              <div className="service-import-overflow-note">
                <span>
                  Mostrando {renderedItems.length} de {visibleCount}; la seleccion puede incluir entradas no visibles.
                </span>
                <button className="ghost-button" disabled={isBusy || visibleLimit >= visibleCount} type="button" onClick={onShowMore}>
                  Mostrar mas
                </button>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="service-import-warnings" aria-label="Avisos de importacion">
                {preview.warnings.slice(0, 6).map((warning, index) => (
                  <span key={`${warning.code}-${warning.entryLabel ?? index}`}>
                    {warning.entryLabel ? `${warning.entryLabel}: ` : ''}
                    {warning.message}
                  </span>
                ))}
                {preview.warnings.length > 6 && (
                  <span>{preview.warnings.length - 6} avisos mas en este archivo.</span>
                )}
              </div>
            )}

            {phase === 'preview' && (
              <div className="action-row end">
                {!isDefaultSelection && (
                  <button className="secondary-button" disabled={selectedCount === 0} type="button" onClick={onImportSelected}>
                    <Upload size={16} />
                    Importar seleccionadas
                  </button>
                )}
                <button className="primary-button" disabled={allNewCount === 0} type="button" onClick={onImportAll}>
                  <Upload size={16} />
                  Importar todo
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export function settingsDraftFromSettings(settings: UserSettings) {
  return {
    theme: settings.theme,
    favoriteTags: settings.favoriteTags.join(', '),
    favoriteGenres: settings.favoriteGenres.join(', '),
    blockedTags: settings.blockedTags.join(', '),
    explorerDefaultType: settings.explorerDefaultType,
  }
}

export type SettingsDraft = ReturnType<typeof settingsDraftFromSettings>

export function getNotificationStatusLabel(state: NotificationIntentState) {
  if (!state.supported) return 'No soportadas'
  if (state.permission === 'denied') return 'Bloqueadas'
  if (state.enabled) return 'Debug activo'
  if (state.permission === 'granted') return 'Permitidas'
  return 'Sin permiso'
}

export function getNotificationActionStatus(state: NotificationIntentState, requestedEnabled: boolean) {
  if (!state.supported) return 'Este navegador no soporta notificaciones PWA.'
  if (state.permission === 'denied') return 'Las notificaciones estan bloqueadas en el navegador.'
  if (requestedEnabled && state.enabled) return 'Notificacion debug activada para actualizaciones.'
  if (requestedEnabled) return 'No se pudo activar la notificacion debug.'
  return 'Notificacion debug desactivada.'
}

export function AdminRolesPanel({
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

export function PreferenceControls({
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

export function DiscoveryCard({
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

export function CandidateDecisionBriefView({ brief }: { brief: CandidateDecisionBrief }) {
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

export function downloadLibraryBackup(items: ListItem[], settings: UserSettings | undefined, prefix: string) {
  downloadJsonFile(createLibraryExportPayload(items, settings), `${prefix}-${new Date().toISOString().slice(0, 10)}.json`)
}

export function getLibrarySelectionSignals(item: ListItem, kind: LibrarySelectionSignalKind) {
  if (kind === 'genre') return item.genres
  if (kind === 'mood') return item.moodTags
  return item.tags
}

export function setLibrarySelectionSignals(item: ListItem, kind: LibrarySelectionSignalKind, values: string[]): ListItem {
  if (kind === 'genre') return { ...item, genres: values }
  if (kind === 'mood') return { ...item, moodTags: values }
  return { ...item, tags: values }
}

export function uniqueDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  const byId = new Map<string, DiscoveryCandidate>()
  for (const candidate of candidates) {
    byId.set(candidate.id, candidate)
  }
  return [...byId.values()]
}

export function getSavedLibraryItemForCandidate(candidate: DiscoveryCandidate, items: ListItem[]) {
  const candidateTitleKey = normalizeKey(candidate.title)
  return items.find((item) => {
    if (candidate.publicItemId && item.publicItemId === candidate.publicItemId) return true
    if (matchesCandidateExternalRef(candidate, item)) return true
    return item.type === candidate.type && normalizeKey(item.title) === candidateTitleKey
  })
}

export function matchesCandidateExternalRef(candidate: DiscoveryCandidate, item: ListItem) {
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

export function LibraryCatalogCandidateCard({
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

export function downloadJsonFile(payload: unknown, filename: string) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

export function ItemCard({
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

export const editorRatingOptions = [2, 4, 6, 8, 10]

export const editorStatusButtonMeta: Record<ItemStatus, { Icon: LucideIcon; label: string }> = {
  completed: { Icon: Check, label: 'Hecho' },
  dropped: { Icon: X, label: 'Soltar' },
  in_progress: { Icon: Play, label: 'Activo' },
  paused: { Icon: Pause, label: 'Pausa' },
  wishlist: { Icon: Plus, label: 'Lista' },
}

export function StatusControl({ onChange, value }: { onChange: (value: ItemStatus) => void; value: ItemStatus }) {
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

export function RatingControl({ onChange, value }: { onChange: (value: number | undefined) => void; value?: number }) {
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

export interface ProgressControlPatch {
  progress?: string
  progressCurrent?: number
  progressTotal?: number
  progressUnit?: ProgressUnit
}

export function ProgressControl({
  current,
  freeText,
  itemType,
  onChange,
  total,
  unit,
}: {
  current?: number
  freeText?: string
  itemType: ItemType
  onChange: (patch: ProgressControlPatch) => void
  total?: number
  unit?: ProgressUnit
}) {
  const resolvedUnit = unit ?? getDefaultProgressUnit(itemType)
  const currentValue = normalizeOptionalNumber(current) ?? 0
  const totalValue = normalizeOptionalNumber(total)
  const progressSummary = formatProgress({
    progress: freeText,
    progressCurrent: current,
    progressTotal: total,
    progressUnit: resolvedUnit,
    type: itemType,
  })
  const step = resolvedUnit === 'hours' ? 0.5 : 1
  const max = totalValue ?? (resolvedUnit === 'percent' ? 100 : undefined)

  function setCurrent(nextValue: number) {
    onChange({
      progressCurrent: clampProgressValue(nextValue, max),
      progressUnit: resolvedUnit,
    })
  }

  function setTotal(nextValue?: number) {
    const nextTotal = normalizeOptionalNumber(nextValue)
    onChange({
      progressCurrent: current === undefined || nextTotal === undefined ? current : clampProgressValue(current, nextTotal),
      progressTotal: nextTotal,
      progressUnit: nextTotal !== undefined || current !== undefined ? resolvedUnit : unit,
    })
  }

  return (
    <div className="progress-control" role="group" aria-label="Progreso">
      <div className="progress-control-heading">
        <span>Progreso</span>
        <strong>{progressSummary ?? 'Sin progreso'}</strong>
      </div>
      <div className="progress-stepper-row">
        <button
          aria-label="Reducir progreso"
          className="progress-step-button"
          disabled={currentValue <= 0}
          type="button"
          onClick={() => setCurrent(currentValue - step)}
          title="Reducir progreso"
        >
          <Minus size={14} />
        </button>
        <label>
          <span className="sr-only">Actual</span>
          <input
            aria-label="Progreso actual"
            min="0"
            max={max}
            step={step}
            type="number"
            value={current ?? ''}
            onChange={(event) => {
              const nextValue = readNumberInput(event.target.value)
              onChange({
                progressCurrent: nextValue === undefined ? undefined : clampProgressValue(nextValue, max),
                progressUnit: nextValue !== undefined || totalValue !== undefined ? resolvedUnit : unit,
              })
            }}
          />
        </label>
        <span aria-hidden="true" className="progress-total-divider">/</span>
        <label>
          <span className="sr-only">Total</span>
          <input
            aria-label="Progreso total"
            min="0"
            step={step}
            type="number"
            value={total ?? ''}
            onChange={(event) => setTotal(readNumberInput(event.target.value))}
          />
        </label>
        <button
          aria-label="Aumentar progreso"
          className="progress-step-button"
          disabled={max !== undefined && currentValue >= max}
          type="button"
          onClick={() => setCurrent(currentValue + step)}
          title="Aumentar progreso"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="progress-detail-row">
        <label>
          <span className="sr-only">Unidad de progreso</span>
          <select
            aria-label="Unidad de progreso"
            value={resolvedUnit}
            onChange={(event) => onChange({ progressUnit: event.target.value as ProgressUnit })}
          >
            {progressUnitOptions.map((option) => (
              <option key={option} value={option}>
                {progressUnitLabels[option].plural}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Detalle de progreso</span>
          <input
            aria-label="Detalle de progreso"
            placeholder="detalle opcional"
            value={freeText ?? ''}
            onChange={(event) => onChange({ progress: event.target.value || undefined })}
          />
        </label>
      </div>
    </div>
  )
}

export function PlaytimeProgressControl({
  current,
  onChange,
}: {
  current?: number
  onChange: (patch: ProgressControlPatch) => void
}) {
  const currentValue = normalizeOptionalNumber(current) ?? 0
  const summary = formatProgress({
    progressCurrent: current,
    progressUnit: 'hours',
    type: 'game',
  })
  const step = 0.5

  function setCurrent(nextValue?: number) {
    const playedHours = normalizeOptionalNumber(nextValue)
    onChange({
      progress: undefined,
      progressCurrent: playedHours,
      progressTotal: undefined,
      progressUnit: playedHours !== undefined ? 'hours' : undefined,
    })
  }

  return (
    <div className="progress-control playtime-control" role="group" aria-label="Horas jugadas">
      <div className="progress-control-heading">
        <span>Horas jugadas</span>
        <strong>{summary ?? 'Sin horas'}</strong>
      </div>
      <div className="progress-stepper-row single">
        <button
          aria-label="Reducir horas jugadas"
          className="progress-step-button"
          disabled={currentValue <= 0}
          type="button"
          onClick={() => setCurrent(currentValue - step)}
          title="Reducir horas jugadas"
        >
          <Minus size={14} />
        </button>
        <label>
          <span className="sr-only">Horas jugadas</span>
          <input
            aria-label="Horas jugadas"
            min="0"
            step={step}
            type="number"
            value={current ?? ''}
            onChange={(event) => setCurrent(readNumberInput(event.target.value))}
          />
        </label>
        <button
          aria-label="Aumentar horas jugadas"
          className="progress-step-button"
          type="button"
          onClick={() => setCurrent(currentValue + step)}
          title="Aumentar horas jugadas"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

export function formatRatingValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function normalizeOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function readNumberInput(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return normalizeOptionalNumber(parsed)
}

export function clampProgressValue(value: number, max?: number) {
  const clamped = Math.max(0, max === undefined ? value : Math.min(value, max))
  return Math.round(clamped * 100) / 100
}

export function ActionMenu({
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

export function getPrimaryItemAction(status: ItemStatus): { Icon: typeof Play; label: string; nextStatus: ItemStatus } {
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

export function getSecondaryItemAction(status: ItemStatus): { Icon: typeof Play; label: string; nextStatus: ItemStatus } {
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

export function getPosterBackplateStyle(posterUrl?: string): CSSProperties | undefined {
  if (!posterUrl) return undefined

  return { '--item-poster-image': `url("${posterUrl.replace(/"/g, '\\"')}")` } as CSSProperties
}

export function getLibraryReviewQueueIcon(id: LibraryReviewQueue['id']): LucideIcon {
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

export function getLibraryReviewQueueActionLabel(queue: LibraryReviewQueue) {
  if (queue.action === 'open-dice') return 'Tirar dado'
  if (queue.action === 'open-item') return queue.id === 'needs-taxonomy' ? 'Afinar ficha' : 'Completar ficha'
  return 'Abrir vista'
}

export function CoverArt({ posterUrl, title, type }: { posterUrl?: string; title: string; type: ItemType }) {
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

export function getCoverArtStyle(title: string, type: ItemType): CSSProperties {
  const palettes = coverArtPalettes[type]
  const palette = palettes[Math.abs(hashText(`${type}:${title}`)) % palettes.length]

  return {
    '--cover-accent-a': palette[0],
    '--cover-accent-b': palette[1],
    '--cover-ink': palette[2],
  } as CSSProperties
}

export function getCoverArtTitle(title: string) {
  const words = title
    .replace(/\([^)]*\)/g, '')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  return words.slice(0, 3).join(' ') || title.slice(0, 18) || 'Nexo'
}

export function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return hash
}

export function ItemIdentity({ item }: { item: ListItem }) {
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

export function CandidateDialog({
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

export function SourceCreditsDialog({ onClose }: { onClose: () => void }) {
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
            El catalogo publico se explora sin sembrar busquedas. Biblioteca y Explorador buscan bajo demanda y pueden
            ampliar Nexo con hallazgos de alta confianza; los datos siguen perteneciendo a sus fuentes originales.
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

export function EditorDiscardPrompt({ onDiscard, onKeepEditing }: { onDiscard: () => void; onKeepEditing: () => void }) {
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

export function ItemEditor({
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
  const progressEditorMode = getProgressEditorMode(draft.type)
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
  const progressSummary =
    progressEditorMode === 'none'
      ? undefined
      : formatProgress({
          ...draft,
          progressUnit: draft.progressUnit ?? getDefaultProgressUnit(draft.type),
        })
  const personalProgressSummary =
    progressSummary ||
    (progressEditorMode === 'playtime'
      ? 'Registra horas jugadas sin objetivo obligatorio.'
      : progressEditorMode === 'none'
        ? 'Estado, nota y notas personales.'
        : draft.notes?.trim()
          ? 'Notas personales guardadas.'
          : 'Estado, nota y notas personales.')
  const editorProgressTitle = canEditTitleInPrimary
    ? 'Datos basicos'
    : progressEditorMode === 'playtime'
      ? 'Horas jugadas'
      : progressEditorMode === 'none'
        ? 'Estado'
        : 'Progreso'
  const metadataLockLabel = progressEditorMode === 'none' ? 'Solo personal' : 'Solo progreso'
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
    const structuredProgressCurrent = normalizeOptionalNumber(draft.progressCurrent)
    const structuredProgressTotal = normalizeOptionalNumber(draft.progressTotal)
    const progressCurrent =
      progressEditorMode === 'structured' || progressEditorMode === 'playtime'
        ? structuredProgressCurrent
        : undefined
    const progressTotal = progressEditorMode === 'structured' ? structuredProgressTotal : undefined
    const progressUnit =
      progressEditorMode === 'structured' && (progressCurrent !== undefined || progressTotal !== undefined)
        ? draft.progressUnit ?? getDefaultProgressUnit(draft.type)
        : progressEditorMode === 'playtime' && progressCurrent !== undefined
          ? 'hours'
          : undefined

    return {
      ...draft,
      id: draft.id.startsWith('manual-') && draft.title ? `${draft.type}-${slugify(draft.title)}` : draft.id,
      progress: progressEditorMode === 'structured' ? draft.progress?.trim() || undefined : undefined,
      progressCurrent,
      progressTotal,
      progressUnit,
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
              {isMetadataLocked && <span>{metadataLockLabel}</span>}
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

        <section className={canEditTitleInPrimary ? 'editor-section editor-progress-panel has-title-field' : 'editor-section editor-progress-panel'}>
          <div className="editor-progress-heading">
            <div>
              <span className="eyebrow">{canEditTitleInPrimary ? 'Nueva obra' : 'Personal'}</span>
              <h3>{editorProgressTitle}</h3>
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
            {progressEditorMode === 'structured' && (
              <ProgressControl
                current={draft.progressCurrent}
                freeText={draft.progress}
                itemType={draft.type}
                total={draft.progressTotal}
                unit={draft.progressUnit}
                onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              />
            )}
            {progressEditorMode === 'playtime' && (
              <PlaytimeProgressControl
                current={draft.progressCurrent}
                onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              />
            )}
          </div>
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
            <section className="editor-section editor-notes-section">
              <h3>Notas</h3>
              <label className="editor-notes-field">
                <span className="sr-only">Notas</span>
                <textarea value={draft.notes ?? ''} onChange={(event) => update('notes', event.target.value)} />
              </label>
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

export function PublicItemEditor({
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

export function CatalogPresetField({
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

export function LaunchGuideCard({
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

export function RecommendationSessionPlanView({ plan }: { plan: RecommendationSessionPlan }) {
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

export function LibraryNextPlan({ item }: { item: ListItem }) {
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

export function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export interface ToastAction {
  ariaLabel?: string
  label: string
  onClick: () => void
}

export interface ToastMessage {
  action?: ToastAction
  durationMs?: number
  id: string
  message: ReactNode
  tone?: FeedbackTone
}

export function ToastStack({ label = 'Notificaciones', onDismiss, toasts }: { label?: string; onDismiss: (id: string) => void; toasts: ToastMessage[] }) {
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

export function FeedbackMessage({ children, tone = 'info' }: { children: ReactNode; tone?: FeedbackTone }) {
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

export function PreferencePreview({ label, tone, values }: { label: string; tone?: 'danger'; values: string[] }) {
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

export function DiceEligibilityPanel({
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

export function PresetChipGroup({
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

export function OriginSummary({ item }: { item: ListItem }) {
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

export function OriginFact({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="origin-fact">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  )
}

export function EmptyState({
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

export function ShellState({ action, detail, title }: { title: string; detail?: string; action?: ReactNode }) {
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

export function getShellPulseItems(
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

export function sameList(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export function sameRecommendationPreferences(left: RecommendationPreferences, right: RecommendationPreferences) {
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
