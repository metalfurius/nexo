/* eslint-disable react-refresh/only-export-components */
import { catalogGenrePresets, catalogMoodPresets, catalogTagPresets, type CatalogTaxonomyTemplate, catalogTaxonomyTemplates } from '../data/catalogPresets'
import { type ActivityEntry, type ActivityTab, type ActivityTarget, type ActivityTone, DEFAULT_WEIGHTS, type DiscoveryCandidate, type DiscoveryStatus, type ExplorerSearchType, type ExternalCandidate, type ImportPreview, ITEM_STATUSES, ITEM_TYPES, type ItemStatus, type ItemType, type LibraryBulkDeleteResult, type LibrarySyncState, type ListItem, nowIso, PROGRESS_UNITS, type ProgressUnit, type PublicCatalogItem, type RecommendationPreferences, type RecommendationResult, type RoadmapMutation, type RoadmapPreferences, THEME_MODES, type ThemeMode, USER_ROLES, type UserProfile, type UserRole, type UserSettings } from '../domain/types'
import { getActivityContinuitySummary, getActivityDestinationTab } from '../lib/activityInsights'
import { buildPublicCatalogItem } from '../lib/catalog'
import { buildCatalogDescriptionDraft, type CatalogIssueKey, catalogIssueShortLabels, draftCatalogQualityWarnings } from '../lib/catalogInsights'
import { type DiceEligibilityBreakdown, type RecommendationSessionPlan } from '../lib/diceInsights'
import { discoveryStatusLabels, discoverySourceLabels as sourceLabels } from '../lib/explorerInsights'
import { getExternalRefEntries } from '../lib/externalRefs'
import { createLibraryExportPayload, type LibraryImportRollbackPlan, type LibraryImportSummary, type ParsedLibraryImport } from '../lib/libraryBackup'
import { getLibraryFocusItems, isItemReadyForDicePulse, type LibraryReviewQueue, type LibrarySmartView } from '../lib/libraryInsights'
import { formatDateLabel, formatDuration, formatProgress, getDefaultProgressUnit, getDiscoveryCandidateEffortSignal, getItemSubtitle, getPersonalEditorReadiness, getProgressEditorMode, itemSourceLabels, progressUnitLabels, itemStatusLabels as statusLabels, itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { type LibrarySortMode } from '../lib/librarySorting'
import { type PublicCatalogSeedResult, type PublicCatalogSeedRollbackPlan, type PublicCatalogSeedSummary } from '../lib/publicCatalogSeed'
import { mergeListText, normalizeKey, slugify, splitList, toggleListTextValue, uniqueNormalizedValues, uniqueValues } from '../lib/strings'
import { type ExternalDiscoverDuration, type ExternalDiscoverType, externalSourceCredits } from '../services/externalSourceCredits'
import { importSourceLabels } from '../services/importSourceLabels'
import { AlertTriangle, BookOpen, Check, CheckCircle2, Copy, Dice5, Download, Film, Gamepad2, Info, Library, LoaderCircle, type LucideIcon, Minus, Moon, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, ShieldCheck, Sparkles, Star, Trash2, Upload, X } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CoverArt } from './CoverArt'

export { CoverArt, type CoverArtPresentation, type CoverArtProps } from './CoverArt'
export { coverArtPalettes, getCoverArtStyle, getCoverArtTitle, hashText } from './coverArtModel'

export const librarySortLabels: Record<LibrarySortMode, string> = {
  focus: 'Foco',
  updated: 'Recientes',
  title: 'Titulo',
  priority: 'Prioridad',
  rating: 'Rating',
}

export const progressUnitOptions: ProgressUnit[] = [...PROGRESS_UNITS]

export const libraryCatalogSearchTypes: Array<{ id: ExplorerSearchType; label: string }> = [
  { id: 'any', label: 'Todo' },
  { id: 'watch', label: 'Ver' },
  { id: 'game', label: 'Juegos' },
  { id: 'book', label: 'Libros' },
  { id: 'animeManga', label: 'Anime/Manga' },
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

export type AppTab = 'home' | 'discover' | 'library' | 'dice' | 'import' | 'settings' | 'curation'

export type DiscoverMode = 'search' | 'surprise' | 'queue'

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
  scope?: 'roadmap-next' | 'all'
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
  diceRollScope?: 'roadmap-next' | 'all'
  draftItem?: ListItem
  explorerCandidateId?: string
  explorerCandidateDismissId?: string
  explorerCandidateSaveId?: string
  explorerPromptCard?: boolean
  explorerSearchQuery?: string
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

export const activityTabLabels: Record<ActivityTab, string> = {
  catalog: 'Catalogo',
  curation: 'Curacion',
  dice: 'Dado',
  discover: 'Descubrir',
  explorer: 'Explorador',
  home: 'Inicio',
  import: 'Importar',
  library: 'Biblioteca',
  settings: 'Ajustes',
}

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

export const urlAddressableTabs: AppTab[] = ['home', 'discover', 'library', 'dice', 'import', 'settings', 'curation']

export interface CatalogRouteState {
  query: string
  type: ExplorerSearchType
}

const catalogRouteTypeIds = new Set<ExplorerSearchType>(libraryCatalogSearchTypes.map((option) => option.id))
const catalogRouteQueryMaxLength = 120

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
  if (tab === 'catalog' || tab === 'explorer') return 'discover'
  if (searchParams.has('catalogQ') || searchParams.has('catalogType') || searchParams.has('q')) return 'discover'
  return urlAddressableTabs.includes(tab as AppTab) ? (tab as AppTab) : 'discover'
}

export function hasExplicitAppRoute() {
  const searchParams = new URLSearchParams(window.location.search)
  return Boolean(
    searchParams.get('item') ||
      searchParams.get('tab') ||
      searchParams.get('q') ||
      searchParams.get('catalogQ') ||
      searchParams.get('catalogType') ||
      searchParams.get('mode'),
  )
}

export function readDiscoverMode(): DiscoverMode {
  const searchParams = new URLSearchParams(window.location.search)
  const rawMode = searchParams.get('mode')
  if (rawMode === 'surprise' || rawMode === 'queue') return rawMode
  if (searchParams.get('tab') === 'explorer') return 'surprise'
  return 'search'
}

export function canonicalizeLegacyAppRoute() {
  const url = new URL(window.location.href)
  const tab = url.searchParams.get('tab')
  const legacyQuery = url.searchParams.get('catalogQ')
  const legacyType = url.searchParams.get('catalogType')
  const legacy = tab === 'catalog' || tab === 'explorer' || legacyQuery !== null || legacyType !== null
  if (!legacy) return false

  url.searchParams.set('tab', 'discover')
  url.searchParams.set('mode', tab === 'explorer' ? 'surprise' : 'search')
  if (legacyQuery !== null) {
    const query = legacyQuery.trim().slice(0, catalogRouteQueryMaxLength)
    if (query) url.searchParams.set('q', query)
    else url.searchParams.delete('q')
  }
  if (legacyType !== null) {
    const type = legacyType.trim() as ExplorerSearchType
    if (catalogRouteTypeIds.has(type) && type !== 'any') url.searchParams.set('type', type)
    else url.searchParams.delete('type')
  }
  url.searchParams.delete('catalogQ')
  url.searchParams.delete('catalogType')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  return true
}

export function readInitialActivityFocus(): ActivityFocus | undefined {
  const itemId = new URLSearchParams(window.location.search).get('item')?.trim()
  return itemId ? { kind: 'item', id: itemId } : undefined
}

export function readCatalogRouteState(): CatalogRouteState {
  const searchParams = new URLSearchParams(window.location.search)
  const query = (searchParams.get('q')?.trim() ?? searchParams.get('catalogQ')?.trim() ?? '')
    .slice(0, catalogRouteQueryMaxLength)
  const rawType = (searchParams.get('type') ?? searchParams.get('catalogType'))?.trim() as ExplorerSearchType | undefined
  const type = rawType && catalogRouteTypeIds.has(rawType) ? rawType : 'any'
  return { query, type }
}

export function hasCatalogRouteState(state = readCatalogRouteState()) {
  return Boolean(state.query || state.type !== 'any')
}

export function writeCatalogRouteState(
  state: CatalogRouteState,
  mode: 'push' | 'replace' = 'push',
) {
  const url = new URL(window.location.href)
  const query = state.query.trim().slice(0, catalogRouteQueryMaxLength)
  const type = catalogRouteTypeIds.has(state.type) ? state.type : 'any'

  url.searchParams.set('tab', 'discover')
  url.searchParams.set('mode', 'search')
  url.searchParams.delete('item')
  url.searchParams.delete('catalogQ')
  url.searchParams.delete('catalogType')
  if (query) {
    url.searchParams.set('q', query)
  } else {
    url.searchParams.delete('q')
  }
  if (type === 'any') {
    url.searchParams.delete('type')
  } else {
    url.searchParams.set('type', type)
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

export function writeAppTabToUrl(tab: AppTab, mode: 'push' | 'replace' = 'replace', focus?: ActivityFocus) {
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)

  if (tab === 'library' && focus?.kind === 'item') {
    url.searchParams.set('item', focus.id)
  } else {
    url.searchParams.delete('item')
  }

  if (tab !== 'discover') {
    url.searchParams.delete('q')
    url.searchParams.delete('type')
    url.searchParams.delete('mode')
    url.searchParams.delete('catalogQ')
    url.searchParams.delete('catalogType')
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
  url.searchParams.delete('q')
  url.searchParams.delete('type')
  url.searchParams.delete('mode')
  url.searchParams.delete('catalogQ')
  url.searchParams.delete('catalogType')
  url.searchParams.set('item', itemId)
  return url.toString()
}

export function getImportPreviewNewItems(preview: ImportPreview) {
  return preview.items.filter((item) => !item.duplicateOfId)
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
      const featuredCommands = [...commandEntries]
        .sort((left, right) => (right.command.searchPriority ?? 0) - (left.command.searchPriority ?? 0))
        .slice(0, 3)
      const featuredNavigation = navigationEntries
        .filter((entry) => entry.kind === 'tab' && (entry.tab === 'home' || entry.tab === 'discover'))
        .slice(0, 2)
      return [
        ...featuredCommands,
        ...featuredNavigation,
        ...focusItems.slice(0, 2).map((item): QuickSearchEntry => ({
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
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar busqueda rapida" title="Cerrar">
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
  deleteAllItems: () => Promise<LibraryBulkDeleteResult>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  snoozeRecommendation: (id: string) => Promise<void>
  reactivateRecommendation: (id: string) => Promise<void>
  setRecommendationCooldown: (id: string, cooldownUntil?: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
  searchCatalog: (query: string, type?: string) => Promise<DiscoveryCandidate[]>
  searchCatalogRequest?: (
    request: import('../services/catalogSearchClient').CatalogSearchRequest,
  ) => Promise<import('../services/catalogSearchClient').CatalogSearchResult>
  listPublicCatalog: () => Promise<PublicCatalogItem[]>
  searchPublicCatalog: (query: string, type?: string) => Promise<PublicCatalogItem[]>
  saveSettings: (settings: Partial<UserSettings>) => Promise<void>
  applyRoadmapMutation: (mutation: RoadmapMutation) => Promise<void>
  queueDiscoveryCandidates: (candidates: DiscoveryCandidate[]) => Promise<number>
  dismissDiscoveryCandidate: (candidateId: string) => Promise<void>
  restoreDiscoveryCandidate: (candidateId: string) => Promise<void>
  saveDiscoveryToLibrary: (
    candidate: DiscoveryCandidate,
    options?: { persistDiscoveryCandidate?: boolean; registerPublicCatalog?: boolean },
  ) => Promise<ListItem>
  recordImportedItemToPublicCatalog: (item: ListItem) => Promise<void>
  recordImportedItemsToPublicCatalog?: (items: ListItem[]) => Promise<void>
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
  | { kind: 'status'; itemId: string; previousRoadmap: RoadmapPreferences; previousStatus: ItemStatus; title: string }
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
    roadmap: {
      hidden: [...settings.roadmap.hidden],
      later: [...settings.roadmap.later],
      next: [...settings.roadmap.next],
      now: [...settings.roadmap.now],
    },
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

            <p className="service-import-privacy-note">
              Nexo puede usar metadatos publicos de las obras importadas para mejorar el catalogo. No se publican tus notas, estado, rating ni progreso.
            </p>

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

interface NotificationIntentState {
  enabled: boolean
  permission: NotificationPermission | 'unsupported'
  supported: boolean
}

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

export function downloadLibraryBackup(items: ListItem[], settings: UserSettings | undefined, prefix: string) {
  downloadJsonFile(createLibraryExportPayload(items, settings), `${prefix}-${new Date().toISOString().slice(0, 10)}.json`)
}

export function getLibrarySelectionSignals(item: ListItem, kind: LibrarySelectionSignalKind) {
  if (kind === 'genre') return item.genres
  if (kind === 'mood') return item.moodTags
  return item.tags
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

export function downloadJsonFile(payload: unknown, filename: string) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
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
  pending = false,
  onClose,
  onCurate,
  onDismiss,
  onRestore,
  onSave,
}: {
  candidate: DiscoveryCandidate
  pending?: boolean
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
  const effortSignal = getDiscoveryCandidateEffortSignal(candidate)

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-detail-title"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <button
          aria-label={`Cerrar detalle de ${candidate.title}`}
          className="icon-button dialog-close"
          disabled={pending}
          type="button"
          autoFocus
          onClick={onClose}
          title="Cerrar"
        >
          <X size={18} />
        </button>
        <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
        <div className="detail-body">
          <div className="detail-meta">
            <span className="source-pill">{sourceLabels[candidate.source]}</span>
            <span className={`candidate-status ${candidate.status}`}>{discoveryStatusLabels[candidate.status]}</span>
            <span>{typeLabels[candidate.type]}</span>
            {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
            {effortSignal && <span>{effortSignal}</span>}
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
              <button className="primary-button" disabled={pending} type="button" onClick={onRestore}>
                <RotateCcw size={16} />
                Recuperar a cola
              </button>
            </div>
          )}
          {isQueued && (
            <div className="action-row detail-actions">
              <button className="primary-button" disabled={pending} type="button" onClick={onSave}>
                <Plus size={16} />
                Guardar en Biblioteca
              </button>
              {onCurate && (
                <button className="secondary-button" disabled={pending} type="button" onClick={onCurate}>
                  <ShieldCheck size={16} />
                  {catalogActionLabel}
                </button>
              )}
              <button className="ghost-button danger-text" disabled={pending} type="button" onClick={onDismiss}>
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
        <button
          aria-label="Cerrar creditos de fuentes"
          className="icon-button dialog-close"
          type="button"
          autoFocus
          onClick={onClose}
          title="Cerrar"
        >
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
  const effortSummary = progressSummary || (draft.durationMinHours || draft.durationMaxHours ? formatDuration(draft) : undefined)
  const personalProgressSummary =
    progressSummary ||
    (progressEditorMode === 'playtime'
      ? 'Registra horas jugadas sin objetivo obligatorio.'
      : progressEditorMode === 'none'
        ? effortSummary ?? 'Estado, nota y notas personales.'
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
        aria-labelledby="item-editor-title"
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
            <button className="icon-button" type="button" onClick={requestClose} aria-label={`Cerrar y guardar ${editorTitle}`} title="Cerrar y guardar">
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
              {effortSummary && <span>{effortSummary}</span>}
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
          <button className="icon-button" type="button" onClick={requestClose} aria-label={`Cerrar editor de ${editorTitle}`} title="Cerrar">
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
