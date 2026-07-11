import './App.css'
import { catalogTaxonomyTemplates } from './data/catalogPresets'
import { type ActivityEntry, DEFAULT_RECOMMENDATION_PREFERENCES, DEFAULT_SETTINGS, type DiscoveryCandidate, ITEM_STATUSES, ITEM_TYPES, type ItemStatus, type ItemType, type ListItem, type ThemeMode } from './domain/types'
import { useAuth } from './hooks/useAuth'
import { useLibrary } from './hooks/useLibrary'
import { getActivityDestinationTab } from './lib/activityInsights'
import { type ExplorerSourceFilter, getDiscoverySourceFilter, getExplorerSourceFilterLabel, discoverySourceLabels as sourceLabels } from './lib/explorerInsights'
import { getLibraryFocusItems, getLibraryFocusReason, getLibraryReviewQueues, getLibrarySmartViewOptions, type LibrarySmartView } from './lib/libraryInsights'
import { isItemInCooldown, itemStatusLabels as statusLabels, itemTypeLabels as typeLabels } from './lib/libraryItemInsights'
import { type LibrarySortMode } from './lib/librarySorting'
import { getPrivateDataHealth, getPrivateTaxonomyRepairDraft } from './lib/privateDataInsights'
import { scoreCandidates } from './lib/recommendations'
import { normalizeKey, slugify, uniqueNormalizedValues } from './lib/strings'
import { notifyAppUpdateReady } from './services/notificationService'
import { applyServiceWorkerUpdate, SERVICE_WORKER_UPDATE_READY_EVENT } from './services/serviceWorker'
import { Archive, Check, CheckCircle2, Dice5, Download, Home, Library, List, LogIn, LogOut, Moon, MoreHorizontal, Palette, Pause, Play, Plus, RotateCcw, Save, Search, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DialogFocusReturn, NavigationDiscardPrompt, NexoMark, QuickSearchDialog, ShellPulse, ShellState, activityTabLabels, blankItem, canonicalizeLegacyAppRoute, cloneActivityEntry, downloadLibraryBackup, getActivityFocus, getActivityIcon, getLibraryReviewQueueIcon, getLibrarySelectionSignals, getPrimaryItemAction, handleDialogKeyDown, hasExplicitAppRoute, isStandalonePwa, isThemeMode, libraryPriorityOptions, librarySelectionSignalLabels, librarySortLabels, readInitialActivityFocus, readInitialAppTab, roleLabels, themeMetaColors, themeOptions, themeStorageKey, typeIcons, useCloseDetailsOnOutsideClick, writeAppTabToUrl, type ActivityFocus, type AppTab, type BeforeInstallPromptEvent, type DiceCooldownReactivateRequest, type DicePreferencesSaveRequest, type DiceRollRequest, type DiceRollSummary, type ExplorerCandidateDismissRequest, type ExplorerCandidateRequest, type ExplorerCandidateSaveRequest, type ExplorerPromptCardRequest, type ExplorerSearchRequest, type ExplorerVisibleDismissRequest, type ExplorerVisibleSaveRequest, type LibraryImportRequest, type LibraryPrimaryActionRequest, type LibraryPriorityLevel, type LibraryResetViewRequest, type LibraryReviewRequest, type LibrarySelectedDiceActionRequest, type LibrarySelectedExportRequest, type LibrarySelectedPriorityRequest, type LibrarySelectedSignalsRequest, type LibrarySelectedStatusRequest, type LibrarySelectionSignalAction, type LibrarySelectionSignalKind, type LibrarySmartViewRequest, type LibrarySortModeRequest, type LibraryStatusFilterRequest, type LibraryTypeFilterRequest, type LibraryVisibleSelectionRequest, type LibraryVisibleSelectionSummary, type PendingNavigation, type QuickSearchCommand, type SettingsSaveRequest, type SettingsTasteSuggestionsRequest, type SettingsTaxonomyRepairRequest, type ShellNavItem } from './app/shared'
import FeatureErrorBoundary from './app/FeatureErrorBoundary'
import { appIntentReducer, type AppIntent, type AppIntentDraft } from './app/intents'

const DiceTab = lazy(() => import('./tabs/DiceTab'))
const HomeTab = lazy(() => import('./tabs/HomeTab'))
const DiscoverTab = lazy(() => import('./tabs/DiscoverTab'))
const LibraryTab = lazy(() => import('./tabs/LibraryTab'))
const ImportTab = lazy(() => import('./tabs/ImportTab'))
const SettingsTab = lazy(() => import('./tabs/SettingsTab'))
const CurationTab = lazy(() => import('./tabs/CurationTab'))
const SignInDialog = lazy(() => import('./app/SignInDialog'))

const appVersion = String(import.meta.env.VITE_APP_VERSION ?? '0.0.0').trim() || '0.0.0'

function LazyTabFallback() {
  return <ShellState title="Cargando vista" detail="Preparando modulos de Nexo." />
}

function AddDialog({
  onClose,
  onImport,
  onManual,
  onSearch,
}: {
  onClose: () => void
  onImport: () => void
  onManual: () => void
  onSearch: (query: string) => void
}) {
  const [query, setQuery] = useState('')

  return (
    <div className="modal-backdrop" role="presentation">
      <DialogFocusReturn />
      <section
        aria-labelledby="add-dialog-title"
        aria-modal="true"
        className="add-dialog"
        role="dialog"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <button aria-label="Cerrar Añadir" className="icon-button dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Un unico punto de entrada</span>
            <h2 id="add-dialog-title">Añadir a Nexo</h2>
            <p>Busca en Descubrir, crea una ficha privada o trae una biblioteca externa.</p>
          </div>
        </div>
        <form
          className="add-dialog-search"
          onSubmit={(event) => {
            event.preventDefault()
            if (query.trim().length >= 2) onSearch(query.trim())
          }}
        >
          <label className="search-field">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Buscar obra para añadir"
              placeholder="Dune, Hollow Knight, Frieren..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={query.trim().length < 2} type="submit">
            <Search size={17} />
            Buscar en Descubrir
          </button>
        </form>
        <div className="add-dialog-options">
          <button className="secondary-button" type="button" onClick={onManual}>
            <Plus size={17} />
            Crear manualmente
          </button>
          <button className="secondary-button" type="button" onClick={onImport}>
            <Upload size={17} />
            Importar biblioteca
          </button>
        </div>
      </section>
    </div>
  )
}

function App() {
  const auth = useAuth()
  const library = useLibrary(auth.user)
  const [activeTab, setActiveTabState] = useState<AppTab>(() => readInitialAppTab())
  const explicitRouteRef = useRef(hasExplicitAppRoute())
  const [signInDialogOpen, setSignInDialogOpen] = useState(false)
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
  const [appIntentState, dispatchAppIntentState] = useReducer(appIntentReducer, {})
  const appIntentId = useRef(0)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [signOutPending, setSignOutPending] = useState(false)
  const [signOutError, setSignOutError] = useState<string | undefined>()
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
    canonicalizeLegacyAppRoute()
  }, [])

  useEffect(() => {
    if (!auth.isFirebaseConfigured) return
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') return
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
    window.scrollTo(0, 0)
  }, [activeTab])

  useEffect(() => {
    if (auth.loading) return undefined
    const privateSession = Boolean(auth.user) || !auth.isFirebaseConfigured
    if (!explicitRouteRef.current && privateSession && activeTab === 'discover') {
      const timeoutId = window.setTimeout(() => {
        explicitRouteRef.current = true
        setActiveTabState('home')
        writeAppTabToUrl('home', 'replace')
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
    if (auth.isFirebaseConfigured && !auth.user && activeTab !== 'discover') {
      const timeoutId = window.setTimeout(() => {
        setActiveTabState('discover')
        writeAppTabToUrl('discover', 'replace')
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
    return undefined
  }, [activeTab, auth.isFirebaseConfigured, auth.loading, auth.user])

  useEffect(() => {
    function handleServiceWorkerUpdateReady() {
      setServiceWorkerUpdateReady(true)
      void notifyAppUpdateReady()
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
      explicitRouteRef.current = true
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
    void library.saveSettings({ theme: nextTheme }).catch(() => undefined)
  }

  async function promptInstallPwa() {
    if (!installPrompt) return

    const prompt = installPrompt
    setInstallPrompt(undefined)
    await prompt.prompt()
    await prompt.userChoice.catch(() => undefined)
  }

  async function handleSignOut() {
    if (signOutPending) return

    setSignOutPending(true)
    setSignOutError(undefined)
    try {
      await auth.signOut()
    } catch {
      setSignOutError('No se pudo salir')
    } finally {
      setSignOutPending(false)
    }
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

  function sendAppIntent(draft: AppIntentDraft) {
    appIntentId.current += 1
    const intent = { ...draft, id: appIntentId.current } as AppIntent
    dispatchAppIntentState({ intent, type: 'dispatch' })
    if (intent.kind === 'add') return

    if (intent.kind === 'open-item') {
      changeActiveTab('library', { kind: 'item', id: intent.itemId })
    } else if (intent.kind === 'discover') {
      if (intent.mode === 'search' && intent.query) openExplorerSearchFromPalette(intent.query)
      else {
        setActiveTabState('discover')
        writeDiscoverLocation(intent.mode)
      }
    } else {
      rollDiceFromAction(intent.scope)
    }
    window.setTimeout(() => dispatchAppIntentState({ id: intent.id, type: 'consume' }), 0)
  }

  function closeAddIntent() {
    const intent = appIntentState.current
    if (intent?.kind === 'add') dispatchAppIntentState({ id: intent.id, type: 'consume' })
  }

  if (auth.loading) {
    return <ShellState title="Cargando acceso" />
  }

  const navItems: ShellNavItem[] = [
    { id: 'home', label: 'Inicio', shortLabel: 'Inicio', description: 'Tu ruta', icon: Home },
    { id: 'discover', label: 'Descubrir', shortLabel: 'Descubre', description: 'Buscar obras nuevas', icon: Sparkles },
    { id: 'library', label: 'Biblioteca', shortLabel: 'Biblioteca', description: 'Tus obras guardadas', icon: Library },
    { id: 'dice', label: 'Dado', shortLabel: 'Dado', description: 'De tus guardadas', icon: Dice5 },
    { id: 'import', label: 'Importar', shortLabel: 'Importar', description: 'Traer bibliotecas externas', icon: Upload, group: 'utility' },
    { id: 'settings', label: 'Ajustes', shortLabel: 'Ajustes', description: 'Cuenta y temas', icon: Palette, group: 'utility' },
    { id: 'curation', label: 'Curacion', displayLabel: 'Curar', shortLabel: 'Curar', description: 'Catalogo publico', icon: ShieldCheck, group: 'utility', hidden: !library.isModerator },
  ]
  const visibleNavItems = navItems.filter((item) => !item.hidden)
  const primaryNavItems = visibleNavItems.filter((item) => item.group !== 'utility')
  const utilityNavItems = visibleNavItems.filter((item) => item.group === 'utility')
  const activeNavItem = navItems.find((item) => item.id === activeTab) ?? navItems[0]
  const pendingNavItem = pendingNavigation ? navItems.find((item) => item.id === pendingNavigation.tab) : undefined
  const shellTitle = activeNavItem.displayLabel ?? activeNavItem.label

  function requestSignIn() {
    if (!auth.isFirebaseConfigured) return
    setSignInDialogOpen(true)
  }

  function changeActiveTab(nextTab: AppTab, focus?: ActivityFocus) {
    explicitRouteRef.current = true
    if (nextTab === 'curation' && !library.isModerator) return
    if (auth.isFirebaseConfigured && !auth.user && nextTab !== 'discover') {
      requestSignIn()
      return
    }
    if (nextTab === activeTab) {
      if (focus) {
        setActivityFocus(focus)
        writeAppTabToUrl(nextTab, 'push', focus)
      } else if (activityFocus || new URL(window.location.href).searchParams.has('item')) {
        setActivityFocus(undefined)
        writeAppTabToUrl(nextTab, 'replace')
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
    if (auth.isFirebaseConfigured && !auth.user) {
      requestSignIn()
      return
    }
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

  function requestDiceRoll(scope: 'roadmap-next' | 'all' = 'all') {
    diceRollRequestId.current += 1
    setDiceRollRequest({ requestId: diceRollRequestId.current, scope })
  }

  function requestDicePreferencesSave() {
    dicePreferencesSaveRequestId.current += 1
    setDicePreferencesSaveRequest({ requestId: dicePreferencesSaveRequestId.current })
  }

  function requestDiceCooldownReactivate() {
    diceCooldownReactivateRequestId.current += 1
    setDiceCooldownReactivateRequest({ requestId: diceCooldownReactivateRequestId.current })
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

  function rollDiceFromAction(scope: 'roadmap-next' | 'all' = 'all') {
    setQuickSearchOpen(false)
    if (auth.isFirebaseConfigured && !auth.user) {
      requestSignIn()
      return
    }
    if (activeTab === 'dice') {
      requestDiceRoll(scope)
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ diceRollScope: scope, source: 'app', tab: 'dice' })
      return
    }

    requestDiceRoll(scope)
    setActiveTabState('dice')
    writeAppTabToUrl('dice', 'push')
  }

  function openDiceFromPalette() {
    setQuickSearchOpen(false)
    changeActiveTab('dice')
  }

  function writeDiscoverLocation(
    mode: 'search' | 'surprise' | 'queue',
    options: { historyMode?: 'push' | 'replace'; query?: string } = {},
  ) {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'discover')
    url.searchParams.set('mode', mode)
    url.searchParams.delete('item')
    url.searchParams.delete('catalogQ')
    url.searchParams.delete('catalogType')
    if (mode === 'search' && options.query?.trim()) url.searchParams.set('q', options.query.trim())
    else if (mode !== 'search') url.searchParams.delete('q')
    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    if ((options.historyMode ?? 'push') === 'push') window.history.pushState(null, '', nextUrl)
    else window.history.replaceState(null, '', nextUrl)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function openExplorerSearchFromPalette(query: string) {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) return

    setQuickSearchOpen(false)
    if (activeTab === 'discover') {
      setActivityFocus(undefined)
      writeDiscoverLocation('search', { query: trimmedQuery })
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerSearchQuery: trimmedQuery, source: 'app', tab: 'discover' })
      return
    }

    setActivityFocus(undefined)
    setActiveTabState('discover')
    writeDiscoverLocation('search', { query: trimmedQuery })
  }

  function addExplorerPromptCardFromPalette() {
    setQuickSearchOpen(false)
    if (activeTab === 'discover') {
      setActivityFocus(undefined)
      requestExplorerPromptCard()
      writeDiscoverLocation('queue')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerPromptCard: true, source: 'app', tab: 'discover' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerPromptCard()
    setActiveTabState('discover')
    writeDiscoverLocation('queue')
  }

  function openExplorerCandidateFromPalette(candidate: DiscoveryCandidate) {
    setQuickSearchOpen(false)
    if (activeTab === 'discover') {
      setActivityFocus(undefined)
      requestExplorerCandidate(candidate.id)
      writeDiscoverLocation('queue')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerCandidateId: candidate.id, source: 'app', tab: 'discover' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerCandidate(candidate.id)
    setActiveTabState('discover')
    writeDiscoverLocation('queue')
  }

  function saveExplorerCandidateFromPalette(candidate: DiscoveryCandidate) {
    setQuickSearchOpen(false)
    if (activeTab === 'discover') {
      setActivityFocus(undefined)
      requestExplorerCandidateSave(candidate.id)
      writeDiscoverLocation('queue')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerCandidateSaveId: candidate.id, source: 'app', tab: 'discover' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerCandidateSave(candidate.id)
    setActiveTabState('discover')
    writeDiscoverLocation('queue')
  }

  function dismissExplorerCandidateFromPalette(candidate: DiscoveryCandidate) {
    setQuickSearchOpen(false)
    if (activeTab === 'discover') {
      setActivityFocus(undefined)
      requestExplorerCandidateDismiss(candidate.id)
      writeDiscoverLocation('queue')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerCandidateDismissId: candidate.id, source: 'app', tab: 'discover' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerCandidateDismiss(candidate.id)
    setActiveTabState('discover')
    writeDiscoverLocation('queue')
  }

  function saveExplorerVisibleQueueFromPalette(sourceFilter: ExplorerSourceFilter) {
    setQuickSearchOpen(false)
    if (activeTab === 'discover') {
      setActivityFocus(undefined)
      requestExplorerVisibleSave(sourceFilter)
      writeDiscoverLocation('queue')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerVisibleSaveSourceFilter: sourceFilter, source: 'app', tab: 'discover' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerVisibleSave(sourceFilter)
    setActiveTabState('discover')
    writeDiscoverLocation('queue')
  }

  function dismissExplorerVisibleQueueFromPalette(sourceFilter: ExplorerSourceFilter) {
    setQuickSearchOpen(false)
    if (activeTab === 'discover') {
      setActivityFocus(undefined)
      requestExplorerVisibleDismiss(sourceFilter)
      writeDiscoverLocation('queue')
      return
    }
    if (tabsWithUnsavedChanges[activeTab]) {
      setPendingNavigation({ explorerVisibleDismissSourceFilter: sourceFilter, source: 'app', tab: 'discover' })
      return
    }

    setActivityFocus(undefined)
    requestExplorerVisibleDismiss(sourceFilter)
    setActiveTabState('discover')
    writeDiscoverLocation('queue')
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
      diceRollScope,
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
    if (diceRollScope) {
      requestDiceRoll(diceRollScope)
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
    if (nextTab === 'discover') {
      const hasQueueIntent = Boolean(
        explorerCandidateId ||
          explorerCandidateDismissId ||
          explorerCandidateSaveId ||
          explorerPromptCard ||
          explorerVisibleDismissSourceFilter ||
          explorerVisibleSaveSourceFilter,
      )
      writeDiscoverLocation(explorerSearchQuery ? 'search' : hasQueueIntent ? 'queue' : 'search', {
        historyMode: source === 'history' ? 'replace' : 'push',
        query: explorerSearchQuery,
      })
    } else {
      writeAppTabToUrl(nextTab, source === 'history' ? 'replace' : 'push', focus)
    }
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
                <span className="brand-version" aria-label={`Version ${appVersion}`}>
                  v{appVersion}
                </span>
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
          {!isOffline && library.syncState.hasPendingWrites && (
            <span aria-label="Sincronizacion pendiente" className="mode-pill offline" role="status">
              Pendiente
            </span>
          )}
          {!isOffline && !library.syncState.hasPendingWrites && library.syncState.fromCache && (
            <span aria-label="Datos desde cache" className="mode-pill offline" role="status">
              Cache
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
          {(auth.user || !auth.isFirebaseConfigured) && (
            <span
              className={library.isModerator ? 'mode-pill moderator role-pill' : 'mode-pill role-pill'}
              aria-label={`Rol: ${roleLabels[library.userRole]}`}
            >
              Rol: {roleLabels[library.userRole]}
            </span>
          )}
          {(auth.user || !auth.isFirebaseConfigured) && (
            <button className="global-add-button" type="button" onClick={() => sendAppIntent({ kind: 'add' })}>
              <Plus size={17} />
              <span>Añadir</span>
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
            <>
              {signOutError && (
                <span aria-label={`Error al salir: ${signOutError}`} className="mode-pill warning" role="alert">
                  {signOutError}
                </span>
              )}
              <button
                aria-label="Salir"
                className="icon-button"
                disabled={signOutPending}
                type="button"
                onClick={() => void handleSignOut()}
                title={signOutPending ? 'Saliendo' : 'Salir'}
              >
                <LogOut size={18} />
              </button>
            </>
          )}
          {auth.isFirebaseConfigured && !auth.user && (
            <button className="app-update-button" type="button" onClick={requestSignIn}>
              <LogIn size={16} />
              <span>Entrar</span>
            </button>
          )}
        </div>
      </header>
      {signInDialogOpen && (
        <Suspense fallback={<ShellState title="Cargando acceso" detail="Preparando el inicio de sesion." />}>
          <SignInDialog
            error={auth.error}
            onClose={() => setSignInDialogOpen(false)}
            onCreateAccount={auth.createAccount}
            onEmailSignIn={auth.signInWithEmail}
            onGoogleSignIn={auth.signInWithGoogle}
            onResetPassword={auth.resetPassword}
          />
        </Suspense>
      )}
      {appIntentState.current?.kind === 'add' && (
        <AddDialog
          onClose={closeAddIntent}
          onImport={() => {
            closeAddIntent()
            changeActiveTab('import')
          }}
          onManual={() => {
            closeAddIntent()
            openLibraryDraft(blankItem())
          }}
          onSearch={(query) => {
            closeAddIntent()
            sendAppIntent({ kind: 'discover', mode: 'search', query })
          }}
        />
      )}

      <nav className="tabbar" aria-label="Secciones de Nexo">
        <div className="tabbar-group primary">
          {primaryNavItems.map((item) => {
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
        </div>
        <details
          className="tabbar-more"
          data-close-on-outside
          open={moreMenuOpen}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.currentTarget.open = false
              setMoreMenuOpen(false)
              event.currentTarget.querySelector('summary')?.focus()
            }
          }}
          onToggle={(event) => setMoreMenuOpen(event.currentTarget.open)}
        >
          <summary
            aria-label="Más secciones"
            className={utilityNavItems.some((item) => item.id === activeTab) ? 'tab-button active' : 'tab-button'}
          >
            <MoreHorizontal size={18} />
            <span className="tab-label"><span>Más</span></span>
          </summary>
          <div className="tabbar-more-menu" role="menu">
            {utilityNavItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  className={activeTab === item.id ? 'active' : undefined}
                  key={item.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    changeActiveTab(item.id)
                  }}
                >
                  <Icon size={17} />
                  <span><strong>{item.displayLabel ?? item.label}</strong><small>{item.description}</small></span>
                </button>
              )
            })}
          </div>
        </details>
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
        <Suspense fallback={<LazyTabFallback />}>
          {activeTab === 'home' && (
            <FeatureErrorBoundary label="Inicio">
              <HomeTab
                activityClearCount={activityClearUndo.length}
                library={library}
                onActivity={recordVisibleActivity}
                onAdd={() => sendAppIntent({ kind: 'add' })}
                onClearActivity={() => void clearSessionActivity()}
                onNavigate={changeActiveTab}
                onOpenItem={(item) => sendAppIntent({ kind: 'open-item', itemId: item.id })}
                onRollDice={(scope) => sendAppIntent({ kind: 'roll', scope })}
                onUndoClearActivity={() => void undoClearSessionActivity()}
              />
            </FeatureErrorBoundary>
          )}
          {activeTab === 'discover' && (
            <FeatureErrorBoundary label="Descubrir">
              <DiscoverTab
                candidateDismissRequest={explorerCandidateDismissRequest}
                candidateRequest={explorerCandidateRequest}
                candidateSaveRequest={explorerCandidateSaveRequest}
                isSignedIn={Boolean(auth.user)}
                library={library}
                requiresSignIn={auth.isFirebaseConfigured && !auth.user}
                promptCardRequest={explorerPromptCardRequest}
                searchRequest={explorerSearchRequest}
                visibleDismissRequest={explorerVisibleDismissRequest}
                visibleSaveRequest={explorerVisibleSaveRequest}
                onActivity={recordVisibleActivity}
                onCandidateDismissRequestHandled={clearExplorerCandidateDismissRequest}
                onCandidateRequestHandled={clearExplorerCandidateRequest}
                onCandidateSaveRequestHandled={clearExplorerCandidateSaveRequest}
                onNavigate={changeActiveTab}
                onPromptCardRequestHandled={clearExplorerPromptCardRequest}
                onSearchRequestHandled={clearExplorerSearchRequest}
                onSignIn={requestSignIn}
                onVisibleDismissRequestHandled={clearExplorerVisibleDismissRequest}
                onVisibleSaveRequestHandled={clearExplorerVisibleSaveRequest}
              />
            </FeatureErrorBoundary>
          )}
        </Suspense>
        <Suspense fallback={<LazyTabFallback />}>
          {activeTab === 'library' && (
            <FeatureErrorBoundary label="Biblioteca">
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
            </FeatureErrorBoundary>
          )}
        </Suspense>
        <Suspense fallback={<LazyTabFallback />}>
          {activeTab === 'dice' && (
            <FeatureErrorBoundary label="Dado">
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
            </FeatureErrorBoundary>
          )}
          {activeTab === 'import' && (
            <FeatureErrorBoundary label="Importar">
              <ImportTab
                library={library}
                onActivity={recordVisibleActivity}
                onNavigate={changeActiveTab}
              />
            </FeatureErrorBoundary>
          )}
          {activeTab === 'settings' && (
            <FeatureErrorBoundary label="Ajustes">
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
            </FeatureErrorBoundary>
          )}
          {activeTab === 'curation' && library.isModerator && (
            <FeatureErrorBoundary label="Curar">
              <CurationTab library={library} onActivity={recordVisibleActivity} />
            </FeatureErrorBoundary>
          )}
        </Suspense>
      </section>
    </main>
  )
}

export default App
