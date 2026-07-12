import {
  BookOpen,
  Check,
  Dice5,
  Download,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import {
  DEFAULT_WEIGHTS,
  ITEM_STATUSES,
  ITEM_TYPES,
  PROGRESS_UNITS,
  nowIso,
  type ItemStatus,
  type ItemType,
  type LibraryViewMode,
  type ListItem,
  type ProgressUnit,
  type RoadmapItemMutation,
  type RoadmapMutation,
  type ThemeMode,
  type UserSettings,
} from '../domain/types'
import {
  formatProgress,
  getDefaultProgressUnit,
  itemStatusLabels,
  itemTypeLabels,
  progressUnitLabels,
} from '../lib/libraryItemInsights'
import { matchesLibrarySmartView, type LibrarySmartView } from '../lib/libraryInsights'
import { sortLibraryItems, type LibrarySortMode } from '../lib/librarySorting'
import { createRoadmapRestoreMutation, createRoadmapUndoMutation } from '../lib/roadmap'
import { createLibraryExportPayload } from '../lib/libraryBackup'
import { DialogFocusReturn, handleDialogKeyDown } from '../app/shared'
import type {
  ActivityFocus,
  ActivityRecorder,
  AppTab,
  LibraryImportRequest,
  LibraryPrimaryActionRequest,
  LibraryResetViewRequest,
  LibraryReviewRequest,
  LibrarySelectedDiceActionRequest,
  LibrarySelectedExportRequest,
  LibrarySelectedPriorityRequest,
  LibrarySelectedSignalsRequest,
  LibrarySelectedStatusRequest,
  LibrarySmartViewRequest,
  LibrarySortModeRequest,
  LibraryStatusFilterRequest,
  LibrarySurface,
  LibraryTypeFilterRequest,
  LibraryVisibleSelectionRequest,
  LibraryVisibleSelectionSummary,
} from '../app/shared'
import './LibraryTab.css'

const sortLabels: Record<LibrarySortMode, string> = {
  focus: 'Relevancia',
  updated: 'Actualizacion reciente',
  title: 'Titulo',
  priority: 'Prioridad',
  rating: 'Nota',
}

const densityLabels: Record<LibraryViewMode, string> = {
  cards: 'Comoda',
  mosaic: 'Compacta',
  list: 'Lista',
}

const priorityValues = {
  low: 0.7,
  normal: 1,
  high: 1.35,
} as const

const processedRequests = new WeakSet<object>()

export type LibraryTabSurface = Pick<
  LibrarySurface,
  | 'deleteItem'
  | 'applyRoadmapMutation'
  | 'error'
  | 'items'
  | 'loading'
  | 'reactivateRecommendation'
  | 'saveItem'
  | 'saveSettings'
  | 'setStatus'
  | 'settings'
  | 'snoozeRecommendation'
  | 'syncState'
> & {
  applyRoadmapBatchMutation: (itemMutations: RoadmapItemMutation[]) => Promise<void>
}

export interface LibraryTabProps {
  activityFocusItemId?: string
  draftRequest?: ListItem
  importRequest?: LibraryImportRequest
  library: LibraryTabSurface
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
  onUnsavedChange: (hasUnsavedChanges: boolean) => void
  setSelectedItemIds: Dispatch<SetStateAction<string[]>>
  setTheme: (theme: ThemeMode) => void
}

type Feedback = { message: string; tone: 'danger' | 'info' | 'success' }
type LibraryUndo = { label: string; mutation: RoadmapMutation }

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
  onDraftRequestHandled,
  onImportRequestHandled,
  onNavigate,
  onPrimaryActionRequestHandled,
  onReviewRequestHandled,
  onRollDice,
  onUnsavedChange,
  onVisibleSelectionSummaryChange,
  setSelectedItemIds,
}: LibraryTabProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [sortMode, setSortMode] = useState<LibrarySortMode>('focus')
  const [smartView, setSmartView] = useState<LibrarySmartView>('all')
  const [density, setDensity] = useState<LibraryViewMode>(library.settings.libraryViewMode)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(selectedItemIds.length > 0)
  const [editingItem, setEditingItem] = useState<ListItem>()
  const [deleteTarget, setDeleteTarget] = useState<ListItem>()
  const [undo, setUndo] = useState<LibraryUndo>()
  const [feedback, setFeedback] = useState<Feedback>()
  const [busyItemId, setBusyItemId] = useState<string>()
  const [savingEditor, setSavingEditor] = useState(false)
  const [visibleWindow, setVisibleWindow] = useState({ key: '', limit: 24 })
  const handledFocusId = useRef<string | undefined>(undefined)
  const handledDraft = useRef<ListItem | undefined>(undefined)
  const editorRouteFocusId = useRef<string | undefined>(undefined)

  const normalizedQuery = normalizeSearchText(query)
  const filteredItems = useMemo(() => {
    const matching = library.items
      .filter((item) => !normalizedQuery || getSearchText(item).includes(normalizedQuery))
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => matchesLibrarySmartView(item, smartView))
    return sortLibraryItems(matching, sortMode)
  }, [library.items, normalizedQuery, smartView, sortMode, statusFilter, typeFilter])
  const visibleWindowKey = JSON.stringify([normalizedQuery, smartView, sortMode, statusFilter, typeFilter])
  const visibleItemLimit = visibleWindow.key === visibleWindowKey ? visibleWindow.limit : 24
  const renderedItems = useMemo(
    () => filteredItems.slice(0, visibleItemLimit),
    [filteredItems, visibleItemLimit],
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisibleWindow({ key: visibleWindowKey, limit: 24 }), 0)
    return () => window.clearTimeout(timeoutId)
  }, [visibleWindowKey])

  const visibleIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems])
  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds])
  const selectedIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const selectedItems = useMemo(
    () => library.items.filter((item) => selectedIdSet.has(item.id)),
    [library.items, selectedIdSet],
  )
  const selectedVisibleCount = useMemo(
    () => selectedItemIds.filter((id) => visibleIdSet.has(id)).length,
    [selectedItemIds, visibleIdSet],
  )
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const hasViewChanges =
    Boolean(query.trim()) ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    smartView !== 'all' ||
    sortMode !== 'focus'

  useEffect(() => {
    onVisibleSelectionSummaryChange({
      allVisibleItemsSelected: allVisibleSelected,
      selectedVisibleCount,
      visibleCount: visibleIds.length,
    })
  }, [allVisibleSelected, onVisibleSelectionSummaryChange, selectedVisibleCount, visibleIds.length])

  const resetView = useCallback(() => {
    setQuery('')
    setStatusFilter('all')
    setTypeFilter('all')
    setSmartView('all')
    setSortMode('focus')
    setSelectionMode(false)
    setSelectedItemIds([])
  }, [setSelectedItemIds])

  const changeStatus = useCallback(
    async (item: ListItem, status: ItemStatus) => {
      if (item.status === status) return
      setBusyItemId(item.id)
      const undoMutation = createRoadmapUndoMutation(library.settings.roadmap, item)
      try {
        await library.setStatus(item.id, status)
        setUndo({ label: `Restaurar ${item.title}`, mutation: undoMutation })
        setFeedback({ message: `${item.title}: ${itemStatusLabels[status].toLowerCase()}.`, tone: 'success' })
        onActivity({
          detail: `${item.title} / ${itemStatusLabels[status]}`,
          label: 'Estado actualizado',
          tab: 'library',
          target: { kind: 'item', id: item.id },
          tone: 'success',
        })
      } catch (reason) {
        setFeedback({ message: getErrorMessage(reason, 'No se pudo cambiar el estado.'), tone: 'danger' })
      } finally {
        setBusyItemId(undefined)
      }
    },
    [library, onActivity],
  )

  const toggleVisibleSelection = useCallback(() => {
    setSelectionMode(true)
    setSelectedItemIds((current) => {
      const currentSet = new Set(current)
      const currentlyAllSelected = visibleIds.length > 0 && visibleIds.every((id) => currentSet.has(id))
      if (currentlyAllSelected) return current.filter((id) => !visibleIdSet.has(id))
      for (const id of visibleIds) currentSet.add(id)
      return [...currentSet]
    })
  }, [setSelectedItemIds, visibleIds, visibleIdSet])

  useEffect(() => {
    if (!draftRequest) {
      handledDraft.current = undefined
      return
    }
    if (handledDraft.current === draftRequest) return
    handledDraft.current = draftRequest
    editorRouteFocusId.current = undefined
    setEditingItem(cloneListItem(draftRequest))
    onDraftRequestHandled()
  }, [draftRequest, onDraftRequestHandled])

  useEffect(() => {
    if (!activityFocusItemId) {
      handledFocusId.current = undefined
      return
    }
    const focusedItem = library.items.find((candidate) => candidate.id === activityFocusItemId)
    const isWaitingForRemoteConfirmation =
      !focusedItem && (library.loading || (library.syncState.remote && library.syncState.fromCache))
    if (isWaitingForRemoteConfirmation) return
    if (handledFocusId.current === activityFocusItemId) return
    const timeoutId = window.setTimeout(() => {
      if (handledFocusId.current === activityFocusItemId) return
      handledFocusId.current = activityFocusItemId
      if (focusedItem) {
        editorRouteFocusId.current = activityFocusItemId
        setQuery('')
        setStatusFilter('all')
        setTypeFilter('all')
        setSmartView('all')
        setEditingItem(cloneListItem(focusedItem))
      } else {
        setFeedback({ message: 'Esa obra ya no esta en tu biblioteca.', tone: 'info' })
      }
      onActivityFocusHandled()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [
    activityFocusItemId,
    library.items,
    library.loading,
    library.syncState.fromCache,
    library.syncState.remote,
    onActivityFocusHandled,
  ])

  useEffect(() => {
    if (!consumeRequest(importRequest)) return
    onImportRequestHandled()
    onNavigate('import')
  }, [importRequest, onImportRequestHandled, onNavigate])

  useEffect(() => {
    if (!resetViewRequest || processedRequests.has(resetViewRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (!consumeRequest(resetViewRequest)) return
      resetView()
      setFeedback({ message: 'Vista de Biblioteca restablecida.', tone: 'success' })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [resetView, resetViewRequest])

  useEffect(() => {
    if (!sortModeRequest || processedRequests.has(sortModeRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (consumeRequest(sortModeRequest)) setSortMode(sortModeRequest.mode)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [sortModeRequest])

  useEffect(() => {
    if (!statusFilterRequest || processedRequests.has(statusFilterRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (consumeRequest(statusFilterRequest)) setStatusFilter(statusFilterRequest.status)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [statusFilterRequest])

  useEffect(() => {
    if (!typeFilterRequest || processedRequests.has(typeFilterRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (consumeRequest(typeFilterRequest)) setTypeFilter(typeFilterRequest.type)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [typeFilterRequest])

  useEffect(() => {
    if (!smartViewRequest || processedRequests.has(smartViewRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (!consumeRequest(smartViewRequest)) return
      setQuery('')
      setStatusFilter('all')
      setTypeFilter('all')
      setSmartView(smartViewRequest.id)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [smartViewRequest])

  useEffect(() => {
    if (!reviewRequest || processedRequests.has(reviewRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (!consumeRequest(reviewRequest)) return
      setQuery('')
      setStatusFilter('all')
      setTypeFilter('all')
      setSmartView(reviewRequest.id)
      setFeedback({ message: 'Repaso abierto en tu biblioteca.', tone: 'info' })
      onReviewRequestHandled()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [onReviewRequestHandled, reviewRequest])

  useEffect(() => {
    if (!visibleSelectionRequest || processedRequests.has(visibleSelectionRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (consumeRequest(visibleSelectionRequest)) toggleVisibleSelection()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [toggleVisibleSelection, visibleSelectionRequest])

  useEffect(() => {
    if (!primaryActionRequest || processedRequests.has(primaryActionRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (!consumeRequest(primaryActionRequest)) return
      const item = library.items.find((candidate) => candidate.id === primaryActionRequest.itemId)
      if (!item) {
        setFeedback({ message: 'La siguiente accion ya no esta disponible.', tone: 'info' })
        onPrimaryActionRequestHandled()
        return
      }
      void changeStatus(item, getPrimaryStatus(item.status)).finally(onPrimaryActionRequestHandled)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [changeStatus, library.items, onPrimaryActionRequestHandled, primaryActionRequest])

  useEffect(() => {
    if (!consumeRequest(selectedStatusRequest)) return
    const changed = selectedItems.filter((item) => item.status !== selectedStatusRequest.status)
    void runRoadmapBulkTask(
      changed.map((item): RoadmapItemMutation => ({
        kind: 'status',
        itemId: item.id,
        status: selectedStatusRequest.status,
      })),
      library.applyRoadmapBatchMutation,
      changed.length ? `${changed.length} estados actualizados.` : 'La seleccion ya tenia ese estado.',
      setFeedback,
    ).then(() => setUndo(undefined))
  }, [library, selectedItems, selectedStatusRequest])

  useEffect(() => {
    if (!consumeRequest(selectedPriorityRequest)) return
    const value = priorityValues[selectedPriorityRequest.level]
    const changed = selectedItems.filter((item) => Math.abs(item.weights.priority - value) > 0.001)
    void runRoadmapBulkTask(
      changed.map((item): RoadmapItemMutation => ({
        item: { ...item, weights: { ...item.weights, priority: value } },
        kind: 'upsert',
      })),
      library.applyRoadmapBatchMutation,
      changed.length ? `${changed.length} prioridades actualizadas.` : 'La seleccion ya tenia ese foco.',
      setFeedback,
    )
  }, [library, selectedItems, selectedPriorityRequest])

  useEffect(() => {
    if (!consumeRequest(selectedSignalsRequest)) return
    const field = selectedSignalsRequest.kind === 'genre'
      ? 'genres'
      : selectedSignalsRequest.kind === 'mood'
        ? 'moodTags'
        : 'tags'
    const itemMutations = selectedItems.map((item): RoadmapItemMutation => {
      const current = item[field]
      const next = selectedSignalsRequest.action === 'add'
        ? uniqueTextValues([...current, ...selectedSignalsRequest.values])
        : current.filter((value) => !selectedSignalsRequest.values.some((target) => sameText(value, target)))
      return { item: { ...item, [field]: next }, kind: 'upsert' }
    })
    void runRoadmapBulkTask(
      itemMutations,
      library.applyRoadmapBatchMutation,
      `${itemMutations.length} fichas actualizadas.`,
      setFeedback,
    )
  }, [library, selectedItems, selectedSignalsRequest])

  useEffect(() => {
    if (!consumeRequest(selectedDiceActionRequest)) return
    const tasks = selectedItems
      .filter((item) => item.status !== 'completed' && item.status !== 'dropped')
      .map((item) => () => selectedDiceActionRequest.action === 'snooze'
        ? library.snoozeRecommendation(item.id)
        : library.reactivateRecommendation(item.id))
    void runBulkTask(
      tasks,
      tasks.length
        ? `${tasks.length} fichas actualizadas para el Dado.`
        : 'La seleccion no tiene fichas activas para el Dado.',
      setFeedback,
    )
  }, [library, selectedDiceActionRequest, selectedItems])

  useEffect(() => {
    if (!selectedExportRequest || processedRequests.has(selectedExportRequest)) return
    const timeoutId = window.setTimeout(() => {
      if (!consumeRequest(selectedExportRequest)) return
      if (!selectedItems.length) {
        setFeedback({ message: 'Selecciona alguna obra antes de exportar.', tone: 'info' })
        return
      }
    const didDownload = downloadLibraryItems(selectedItems, undefined, 'nexo-selection')
      setFeedback({
        message: didDownload
          ? `${selectedItems.length} fichas exportadas.`
          : 'El navegador no permite descargar desde esta vista.',
        tone: didDownload ? 'success' : 'info',
      })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [selectedExportRequest, selectedItems])

  async function saveEditorItem(item: ListItem) {
    setSavingEditor(true)
    try {
      await library.saveItem(item)
      setEditingItem(undefined)
      if (editorRouteFocusId.current) onNavigate('library')
      editorRouteFocusId.current = undefined
      setFeedback({ message: `${item.title} guardada.`, tone: 'success' })
      onActivity({
        detail: `${item.title} / ${itemTypeLabels[item.type]}`,
        label: library.items.some((candidate) => candidate.id === item.id) ? 'Ficha actualizada' : 'Obra anadida',
        tab: 'library',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setFeedback({ message: getErrorMessage(reason, 'No se pudo guardar la ficha.'), tone: 'danger' })
    } finally {
      setSavingEditor(false)
    }
  }

  async function deleteItem(item: ListItem) {
    setBusyItemId(item.id)
    const undoMutation = createRoadmapRestoreMutation(library.settings.roadmap, item)
    try {
      await library.deleteItem(item.id)
      setDeleteTarget(undefined)
      setSelectedItemIds((current) => current.filter((id) => id !== item.id))
      setFeedback({ message: `${item.title} eliminada.`, tone: 'success' })
      setUndo({ label: `Recuperar ${item.title}`, mutation: undoMutation })
      onActivity({
        detail: item.title,
        label: 'Obra eliminada',
        tab: 'library',
        tone: 'success',
      })
    } catch (reason) {
      setFeedback({ message: getErrorMessage(reason, 'No se pudo borrar la obra.'), tone: 'danger' })
    } finally {
      setBusyItemId(undefined)
    }
  }

  async function undoLastChange() {
    if (!undo) return
    const pendingUndo = undo
    setUndo(undefined)
    try {
      await library.applyRoadmapMutation(pendingUndo.mutation)
      setFeedback({ message: `${pendingUndo.label}: cambio deshecho.`, tone: 'success' })
      onActivity({ detail: pendingUndo.label, label: 'Cambio deshecho', tab: 'library', tone: 'success' })
    } catch (reason) {
      setUndo(pendingUndo)
      setFeedback({ message: getErrorMessage(reason, 'No se pudo deshacer el cambio.'), tone: 'danger' })
    }
  }

  async function changeDensity(nextDensity: LibraryViewMode) {
    const previousDensity = density
    setDensity(nextDensity)
    try {
      await library.saveSettings(getDensitySettings(nextDensity))
    } catch (reason) {
      setDensity(previousDensity)
      setFeedback({ message: getErrorMessage(reason, 'No se pudo guardar la densidad.'), tone: 'danger' })
    }
  }

  function openNewItem() {
    editorRouteFocusId.current = undefined
    setEditingItem(createBlankItem())
  }

  function closeEditor() {
    setEditingItem(undefined)
    if (editorRouteFocusId.current) onNavigate('library')
    editorRouteFocusId.current = undefined
  }

  function exportLibraryView() {
    const exportingSelection = selectedItems.length > 0
    const items = exportingSelection ? selectedItems : library.items
    if (!items.length) {
      setFeedback({ message: 'No hay obras que exportar.', tone: 'info' })
      return
    }

    const didDownload = downloadLibraryItems(
      items,
      exportingSelection ? undefined : library.settings,
      exportingSelection ? 'nexo-selection' : 'nexo-export',
    )
    setFeedback({
      message: didDownload
        ? exportingSelection
          ? `${items.length} fichas seleccionadas exportadas.`
          : `Backup de ${items.length} fichas exportado.`
        : 'El navegador no permite descargar desde esta vista.',
      tone: didDownload ? 'success' : 'info',
    })
    if (didDownload) {
      onActivity({
        detail: exportingSelection ? `${items.length} entradas sin ajustes` : `${items.length} entradas y ajustes`,
        label: exportingSelection ? 'Seleccion exportada' : 'Backup privado exportado',
        tab: 'library',
        tone: 'success',
      })
    }
  }

  const syncLabel = getSyncLabel(library.syncState)
  const selectionControlsVisible = selectionMode || selectedItemIds.length > 0

  return (
    <section className="library-v2" aria-labelledby="library-v2-title">
      <header className="library-v2-heading">
        <div>
          <span className="library-v2-eyebrow">Coleccion privada</span>
          <h2 id="library-v2-title">Biblioteca</h2>
          <p>Busca y actualiza lo que ya has guardado.</p>
        </div>
        <div className="library-v2-heading-actions">
          <button className="library-v2-button secondary" type="button" onClick={onRollDice}>
            <Dice5 size={17} />
            Elegir con Dado
          </button>
          <button className="library-v2-button primary" type="button" onClick={openNewItem}>
            <Plus size={17} />
            Anadir manualmente
          </button>
        </div>
      </header>

      <section className="library-v2-toolbar" aria-label="Buscar y filtrar biblioteca" data-testid="library-shelf-header">
        <label className="library-v2-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Buscar en tu biblioteca</span>
          <input
            aria-label="Buscar en tu biblioteca"
            placeholder="Titulo, genero, tag o nota"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="library-v2-status-filter">
          <span>Estado</span>
          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ItemStatus | 'all')}
          >
            <option value="all">Todos</option>
            {ITEM_STATUSES.map((status) => (
              <option key={status} value={status}>{itemStatusLabels[status]}</option>
            ))}
          </select>
        </label>
        <button
          aria-controls="library-v2-filters"
          aria-expanded={filtersOpen}
          className={filtersOpen ? 'library-v2-button filter active' : 'library-v2-button filter'}
          type="button"
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <Filter size={17} />
          Filtros
        </button>
      </section>

      {filtersOpen && (
        <section className="library-v2-filter-panel" id="library-v2-filters" aria-label="Filtros avanzados">
          <label>
            <span>Tipo</span>
            <select
              aria-label="Filtrar por tipo"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ItemType | 'all')}
            >
              <option value="all">Todos</option>
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>{itemTypeLabels[type]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Orden</span>
            <select
              aria-label="Ordenar biblioteca"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as LibrarySortMode)}
            >
              {(Object.keys(sortLabels) as LibrarySortMode[]).map((mode) => (
                <option key={mode} value={mode}>{sortLabels[mode]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Densidad</span>
            <select
              aria-label="Densidad de biblioteca"
              value={density}
              onChange={(event) => void changeDensity(event.target.value as LibraryViewMode)}
            >
              {(Object.keys(densityLabels) as LibraryViewMode[]).map((mode) => (
                <option key={mode} value={mode}>{densityLabels[mode]}</option>
              ))}
            </select>
          </label>
          <div className="library-v2-filter-actions">
            <button className="library-v2-button quiet" type="button" onClick={toggleVisibleSelection}>
              <Check size={16} />
              {allVisibleSelected ? 'Quitar seleccion visible' : 'Seleccionar visibles'}
            </button>
            <button className="library-v2-button quiet" type="button" onClick={() => onNavigate('import')}>
              <Upload size={16} />
              Importar
            </button>
            <button className="library-v2-button quiet" disabled={!library.items.length} type="button" onClick={exportLibraryView}>
              <Download size={16} />
              {selectedItems.length ? 'Exportar seleccion' : 'Exportar biblioteca'}
            </button>
            <button className="library-v2-button quiet" disabled={!hasViewChanges && !selectedItemIds.length} type="button" onClick={resetView}>
              <RotateCcw size={16} />
              Restablecer
            </button>
          </div>
        </section>
      )}

      <div className="library-v2-summary" aria-live="polite" data-testid="library-filter-summary">
        <span><strong>{filteredItems.length}</strong> de {library.items.length} obras</span>
        <span className={library.syncState.hasPendingWrites ? 'pending' : undefined}>{syncLabel}</span>
        {smartView !== 'all' && <span>Vista: {getSmartViewLabel(smartView)}</span>}
      </div>

      {selectedItemIds.length > 0 && (
        <section className="library-v2-selection" aria-label="Seleccion de biblioteca">
          <span><strong>{selectedItemIds.length}</strong> seleccionadas</span>
          <button className="library-v2-button quiet" type="button" onClick={() => setSelectedItemIds([])}>
            <X size={16} />
            Limpiar seleccion
          </button>
        </section>
      )}

      {library.error && <div className="library-v2-feedback danger" role="alert">{library.error}</div>}
      {feedback && (
        <div className={`library-v2-feedback ${feedback.tone}`} role={feedback.tone === 'danger' ? 'alert' : 'status'}>
          <span>{feedback.message}</span>
          {undo && <button type="button" onClick={() => void undoLastChange()}>Deshacer</button>}
          <button aria-label="Cerrar aviso" type="button" onClick={() => { setFeedback(undefined); setUndo(undefined) }}><X size={15} /></button>
        </div>
      )}

      {library.loading && !library.items.length ? (
        <LibraryEmptyState loading onAdd={openNewItem} />
      ) : filteredItems.length ? (
        <div
          className={`library-v2-grid ${density}`}
          data-density={density}
          data-testid="library-grid"
          role="list"
        >
          {renderedItems.map((item) => (
            <LibraryItemCard
              busy={busyItemId === item.id}
              density={density}
              item={item}
              key={item.id}
              selected={selectedIdSet.has(item.id)}
              showSelection={selectionControlsVisible}
              onDelete={() => setDeleteTarget(item)}
              onEdit={() => {
                editorRouteFocusId.current = undefined
                setEditingItem(cloneListItem(item))
              }}
              onSelect={() => {
                setSelectionMode(true)
                setSelectedItemIds((current) => current.includes(item.id)
                  ? current.filter((id) => id !== item.id)
                  : [...current, item.id])
              }}
              onStatus={(status) => void changeStatus(item, status)}
            />
          ))}
        </div>
      ) : library.items.length ? (
        <LibraryNoMatches onReset={resetView} />
      ) : (
        <LibraryEmptyState onAdd={openNewItem} />
      )}

      {renderedItems.length < filteredItems.length && (
        <button
          className="library-v2-button secondary"
          type="button"
          onClick={() => setVisibleWindow({ key: visibleWindowKey, limit: visibleItemLimit + 24 })}
        >
          Mostrar 24 más
        </button>
      )}

      {editingItem && (
        <LibraryItemEditor
          busy={savingEditor}
          isNew={!library.items.some((item) => item.id === editingItem.id)}
          item={editingItem}
          key={`${editingItem.id}:${editingItem.updatedAt}`}
          onCancel={closeEditor}
          onDirtyChange={onUnsavedChange}
          onSave={(item) => void saveEditorItem(item)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          busy={busyItemId === deleteTarget.id}
          item={deleteTarget}
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void deleteItem(deleteTarget)}
        />
      )}
    </section>
  )
}

function LibraryItemCard({
  busy,
  density,
  item,
  selected,
  showSelection,
  onDelete,
  onEdit,
  onSelect,
  onStatus,
}: {
  busy: boolean
  density: LibraryViewMode
  item: ListItem
  selected: boolean
  showSelection: boolean
  onDelete: () => void
  onEdit: () => void
  onSelect: () => void
  onStatus: (status: ItemStatus) => void
}) {
  const progress = formatProgress(item)
  const cardClassName = selected ? 'library-v2-card selected' : 'library-v2-card'

  return (
    <article className={cardClassName} data-status={item.status} role="listitem">
      <div className="library-v2-cover" aria-hidden="true">
        {item.posterUrl ? <img alt="" loading="lazy" src={item.posterUrl} /> : <BookOpen size={density === 'mosaic' ? 22 : 30} />}
      </div>
      <div className="library-v2-card-body">
        <div className="library-v2-card-title-row">
          <div>
            <span>{itemTypeLabels[item.type]}</span>
            <h3>{item.title}</h3>
          </div>
          {showSelection && (
            <label className="library-v2-card-select">
              <span className="sr-only">Seleccionar {item.title}</span>
              <input aria-label={`Seleccionar ${item.title}`} checked={selected} type="checkbox" onChange={onSelect} />
            </label>
          )}
        </div>
        <div className="library-v2-card-meta">
          <span className={`status ${item.status}`}>{itemStatusLabels[item.status]}</span>
          {progress && <span>{progress}</span>}
          {typeof item.rating === 'number' && <span>{item.rating}/10</span>}
        </div>
        {(item.genres.length > 0 || item.tags.length > 0) && (
          <div className="library-v2-card-tags" aria-label={`Etiquetas de ${item.title}`}>
            {uniqueTextValues([...item.genres, ...item.tags])
              .slice(0, density === 'mosaic' ? 2 : 3)
              .map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}
          </div>
        )}
        <div className="library-v2-card-actions">
          <label>
            <span className="sr-only">Cambiar estado de {item.title}</span>
            <select
              aria-label={`Cambiar estado de ${item.title}`}
              disabled={busy}
              value={item.status}
              onChange={(event) => onStatus(event.target.value as ItemStatus)}
            >
              {ITEM_STATUSES.map((status) => <option key={status} value={status}>{itemStatusLabels[status]}</option>)}
            </select>
          </label>
          <button aria-label={`Editar ${item.title}`} className="library-v2-icon-button" type="button" onClick={onEdit}>
            <Pencil size={16} />
          </button>
          <button aria-label={`Borrar ${item.title}`} className="library-v2-icon-button danger" type="button" onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
  )
}

interface EditorDraft {
  genres: string
  moodTags: string
  notes: string
  posterUrl: string
  progressCurrent: string
  progressTotal: string
  progressUnit: ProgressUnit
  rating: string
  status: ItemStatus
  tags: string
  title: string
  type: ItemType
}

function LibraryItemEditor({
  busy,
  isNew,
  item,
  onCancel,
  onDirtyChange,
  onSave,
}: {
  busy: boolean
  isNew: boolean
  item: ListItem
  onCancel: () => void
  onDirtyChange: (hasUnsavedChanges: boolean) => void
  onSave: (item: ListItem) => void
}) {
  const initialDraft = useMemo(() => itemToEditorDraft(item), [item])
  const [draft, setDraft] = useState<EditorDraft>(() => initialDraft)
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false)
  const metadataLocked = item.source === 'external' || item.source === 'public'
  const hasUnsavedChanges = !areEditorDraftsEqual(draft, initialDraft)
  const editorTitle = isNew
    ? item.source === 'manual'
      ? 'Anadir manualmente'
      : `Anadir ${item.title}`
    : `Editar ${item.title}`

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges)
    return () => onDirtyChange(false)
  }, [hasUnsavedChanges, onDirtyChange])

  function update<Key extends keyof EditorDraft>(key: Key, value: EditorDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) return
    onSave({
      ...item,
      title,
      type: draft.type,
      status: draft.status,
      genres: splitTextValues(draft.genres),
      tags: splitTextValues(draft.tags),
      moodTags: splitTextValues(draft.moodTags),
      notes: draft.notes.trim() || undefined,
      posterUrl: draft.posterUrl.trim() || undefined,
      progressCurrent: readOptionalNumber(draft.progressCurrent),
      progressTotal: readOptionalNumber(draft.progressTotal),
      progressUnit: draft.progressCurrent.trim() || draft.progressTotal.trim() ? draft.progressUnit : undefined,
      rating: readOptionalNumber(draft.rating),
      updatedAt: nowIso(),
    })
  }

  function requestCancel() {
    if (busy) return
    if (hasUnsavedChanges) {
      setDiscardPromptOpen(true)
      return
    }
    onCancel()
  }

  function discardChanges() {
    onDirtyChange(false)
    onCancel()
  }

  return (
    <div className="library-v2-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) requestCancel()
    }}>
      <DialogFocusReturn />
      <form
        className="library-v2-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-v2-editor-title"
        onKeyDown={(event) => handleDialogKeyDown(event, requestCancel)}
        onSubmit={submit}
      >
        <header>
          <div>
            <span className="library-v2-eyebrow">{isNew ? 'Nueva obra' : 'Ficha privada'}</span>
            <h2 id="library-v2-editor-title">{editorTitle}</h2>
          </div>
          <button
            aria-label="Cerrar editor"
            autoFocus={!isNew && item.status !== 'in_progress'}
            className="library-v2-icon-button"
            type="button"
            onClick={requestCancel}
          ><X size={18} /></button>
        </header>
        <div className="library-v2-editor-grid">
          <label className="wide">
            <span>Titulo</span>
            <input
              autoFocus={isNew}
              disabled={metadataLocked}
              required
              value={draft.title}
              onChange={(event) => update('title', event.target.value)}
            />
          </label>
          <label>
            <span>Tipo</span>
            <select disabled={metadataLocked} value={draft.type} onChange={(event) => update('type', event.target.value as ItemType)}>
              {ITEM_TYPES.map((type) => <option key={type} value={type}>{itemTypeLabels[type]}</option>)}
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={draft.status} onChange={(event) => update('status', event.target.value as ItemStatus)}>
              {ITEM_STATUSES.map((status) => <option key={status} value={status}>{itemStatusLabels[status]}</option>)}
            </select>
          </label>
          <label>
            <span>Progreso actual</span>
            <input
              autoFocus={!isNew && item.status === 'in_progress'}
              min="0"
              step="0.5"
              type="number"
              value={draft.progressCurrent}
              onChange={(event) => update('progressCurrent', event.target.value)}
            />
          </label>
          <label>
            <span>Progreso total</span>
            <input min="0" step="0.5" type="number" value={draft.progressTotal} onChange={(event) => update('progressTotal', event.target.value)} />
          </label>
          <label>
            <span>Unidad</span>
            <select value={draft.progressUnit} onChange={(event) => update('progressUnit', event.target.value as ProgressUnit)}>
              {PROGRESS_UNITS.map((unit) => <option key={unit} value={unit}>{progressUnitLabels[unit].plural}</option>)}
            </select>
          </label>
          <label>
            <span>Nota / 10</span>
            <input max="10" min="0" step="0.5" type="number" value={draft.rating} onChange={(event) => update('rating', event.target.value)} />
          </label>
          <label className="wide">
            <span>Generos</span>
            <input placeholder="Fantasia, aventura" value={draft.genres} onChange={(event) => update('genres', event.target.value)} />
          </label>
          <label className="wide">
            <span>Tags</span>
            <input placeholder="Corta, cozy, multijugador" value={draft.tags} onChange={(event) => update('tags', event.target.value)} />
          </label>
          <label className="wide">
            <span>Tono</span>
            <input placeholder="Relajado, intenso" value={draft.moodTags} onChange={(event) => update('moodTags', event.target.value)} />
          </label>
          <label className="wide">
            <span>Portada</span>
            <input type="url" value={draft.posterUrl} onChange={(event) => update('posterUrl', event.target.value)} />
          </label>
          <label className="wide">
            <span>Notas</span>
            <textarea rows={4} value={draft.notes} onChange={(event) => update('notes', event.target.value)} />
          </label>
        </div>
        {metadataLocked && <p className="library-v2-editor-note">Titulo y tipo proceden del catalogo; tus datos personales siguen siendo editables.</p>}
        {discardPromptOpen && (
          <div className="library-v2-feedback danger" role="alert">
            <span>Hay cambios sin guardar. Guardalos o descartalos antes de cerrar.</span>
            <button autoFocus type="button" onClick={() => setDiscardPromptOpen(false)}>Seguir editando</button>
            <button type="button" onClick={discardChanges}>Descartar cambios</button>
          </div>
        )}
        <footer>
          <button className="library-v2-button quiet" type="button" onClick={requestCancel}>Cancelar</button>
          <button className="library-v2-button primary" disabled={busy || !draft.title.trim()} type="submit">
            {busy ? 'Guardando...' : 'Guardar ficha'}
          </button>
        </footer>
      </form>
    </div>
  )
}

function ConfirmDeleteDialog({
  busy,
  item,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  item: ListItem
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="library-v2-modal-backdrop" role="presentation">
      <DialogFocusReturn />
      <section
        className="library-v2-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="library-v2-delete-title"
        onKeyDown={(event) => handleDialogKeyDown(event, onCancel)}
      >
        <Trash2 size={24} aria-hidden="true" />
        <h2 id="library-v2-delete-title">Borrar {item.title}</h2>
        <p>La obra desaparecera de tu biblioteca y de Tu ruta.</p>
        <div>
          <button autoFocus className="library-v2-button quiet" type="button" onClick={onCancel}>Cancelar</button>
          <button className="library-v2-button danger" disabled={busy} type="button" onClick={onConfirm}>
            {busy ? 'Borrando...' : 'Borrar definitivamente'}
          </button>
        </div>
      </section>
    </div>
  )
}

function LibraryEmptyState({ loading = false, onAdd }: { loading?: boolean; onAdd: () => void }) {
  return (
    <section className="library-v2-empty" aria-label={loading ? 'Cargando biblioteca' : 'Biblioteca vacia'}>
      <BookOpen size={34} aria-hidden="true" />
      <h3>{loading ? 'Cargando tu biblioteca...' : 'Tu biblioteca esta lista para empezar'}</h3>
      <p>{loading ? 'Recuperando tus obras guardadas.' : 'Anade una obra manualmente o buscala desde Descubrir.'}</p>
      {!loading && <button className="library-v2-button primary" type="button" onClick={onAdd}><Plus size={17} />Anadir obra</button>}
    </section>
  )
}

function LibraryNoMatches({ onReset }: { onReset: () => void }) {
  return (
    <section className="library-v2-empty" aria-label="Sin coincidencias">
      <Search size={32} aria-hidden="true" />
      <h3>No hay coincidencias</h3>
      <p>Prueba otra busqueda o vuelve a mostrar toda tu biblioteca.</p>
      <button className="library-v2-button secondary" type="button" onClick={onReset}><RotateCcw size={16} />Restablecer filtros</button>
    </section>
  )
}

function createBlankItem(): ListItem {
  const timestamp = nowIso()
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    type: 'movie',
    status: 'wishlist',
    genres: [],
    tags: [],
    moodTags: [],
    weights: { ...DEFAULT_WEIGHTS },
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function cloneListItem(item: ListItem): ListItem {
  return {
    ...item,
    genres: [...item.genres],
    tags: [...item.tags],
    moodTags: [...item.moodTags],
    weights: { ...item.weights },
    externalRefs: item.externalRefs ? { ...item.externalRefs } : undefined,
    publicSnapshot: item.publicSnapshot
      ? {
          ...item.publicSnapshot,
          genres: [...item.publicSnapshot.genres],
          tags: [...item.publicSnapshot.tags],
          moodTags: [...item.publicSnapshot.moodTags],
          searchAliases: item.publicSnapshot.searchAliases ? [...item.publicSnapshot.searchAliases] : undefined,
          externalRefs: { ...item.publicSnapshot.externalRefs },
        }
      : undefined,
  }
}

function itemToEditorDraft(item: ListItem): EditorDraft {
  return {
    title: item.title,
    type: item.type,
    status: item.status,
    genres: item.genres.join(', '),
    tags: item.tags.join(', '),
    moodTags: item.moodTags.join(', '),
    notes: item.notes ?? '',
    posterUrl: item.posterUrl ?? '',
    progressCurrent: item.progressCurrent === undefined ? '' : String(item.progressCurrent),
    progressTotal: item.progressTotal === undefined ? '' : String(item.progressTotal),
    progressUnit: item.progressUnit ?? getDefaultProgressUnit(item.type),
    rating: item.rating === undefined ? '' : String(item.rating),
  }
}

function areEditorDraftsEqual(left: EditorDraft, right: EditorDraft) {
  return (Object.keys(left) as Array<keyof EditorDraft>).every((key) => left[key] === right[key])
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es')
}

function getSearchText(item: ListItem) {
  return normalizeSearchText([
    item.title,
    ...item.genres,
    ...item.tags,
    ...item.moodTags,
    item.notes ?? '',
  ].join(' '))
}

function splitTextValues(value: string) {
  return uniqueTextValues(value.split(/[\n,;]+/))
}

function uniqueTextValues(values: string[]) {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const trimmed = value.trim()
    const key = normalizeSearchText(trimmed)
    if (!trimmed || seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
}

function sameText(left: string, right: string) {
  return normalizeSearchText(left) === normalizeSearchText(right)
}

function readOptionalNumber(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function getPrimaryStatus(status: ItemStatus): ItemStatus {
  if (status === 'in_progress') return 'completed'
  if (status === 'completed' || status === 'paused') return 'in_progress'
  if (status === 'dropped') return 'wishlist'
  return 'in_progress'
}

function getDensitySettings(density: LibraryViewMode): Partial<UserSettings> {
  if (density === 'mosaic') return { libraryViewMode: density, libraryCardsPerRow: 6 }
  if (density === 'cards') return { libraryViewMode: density, libraryCardsPerRow: 4 }
  return { libraryViewMode: density }
}

function getSyncLabel(syncState: LibraryTabSurface['syncState']) {
  if (syncState.hasPendingWrites || syncState.pendingWriteCount > 0) return 'Sincronizando cambios'
  if (!syncState.remote) return 'Guardada en este dispositivo'
  if (syncState.fromCache) return 'Disponible sin conexion'
  return 'Al dia'
}

function getSmartViewLabel(view: LibrarySmartView) {
  const labels: Record<LibrarySmartView, string> = {
    all: 'Todas',
    cooldown: 'En pausa para Dado',
    'dice-ready': 'Listas para Dado',
    'needs-context': 'Sin contexto',
    'needs-taxonomy': 'Sin taxonomia',
    nexo: 'Catalogo Nexo',
  }
  return labels[view]
}

function consumeRequest<Request extends object>(request?: Request): request is Request {
  if (!request || processedRequests.has(request)) return false
  processedRequests.add(request)
  return true
}

async function runBulkTask(
  tasks: Array<() => Promise<void>>,
  successMessage: string,
  setFeedback: Dispatch<SetStateAction<Feedback | undefined>>,
) {
  try {
    for (const task of tasks) await task()
    setFeedback({ message: successMessage, tone: tasks.length ? 'success' : 'info' })
  } catch (reason) {
    setFeedback({ message: getErrorMessage(reason, 'No se pudo actualizar la seleccion.'), tone: 'danger' })
  }
}

async function runRoadmapBulkTask(
  itemMutations: RoadmapItemMutation[],
  applyBatch: (mutations: RoadmapItemMutation[]) => Promise<void>,
  successMessage: string,
  setFeedback: Dispatch<SetStateAction<Feedback | undefined>>,
) {
  try {
    for (let index = 0; index < itemMutations.length; index += 400) {
      await applyBatch(itemMutations.slice(index, index + 400))
    }
    setFeedback({ message: successMessage, tone: itemMutations.length ? 'success' : 'info' })
  } catch (reason) {
    setFeedback({ message: getErrorMessage(reason, 'No se pudo actualizar la seleccion.'), tone: 'danger' })
  }
}

function downloadLibraryItems(items: ListItem[], settings: UserSettings | undefined, prefix: string) {
  if (typeof URL.createObjectURL !== 'function') return false
  const payload = createLibraryExportPayload(items, settings)
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${prefix}-${nowIso().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(href)
  return true
}

function getErrorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export default LibraryTab
