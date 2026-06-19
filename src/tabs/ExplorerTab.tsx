import { type DiscoveryCandidate, type DiscoveryStatus, type ExplorerSearchType, type ListItem, type PublicCatalogItem } from '../domain/types'
import { promptToDiscovery } from '../lib/catalog'
import { blankPublicCatalogItem, publicCatalogDraftFromCandidate } from '../lib/catalogInsights'
import { discoveryEmptyCopy, discoveryStatusLabels, type ExplorerSourceFilter, explorerSourceFilters, getCandidateDecisionBrief, getDiscoverySourceFilter, getExplorerDecisionState, getExplorerSourceFilterLabel, discoverySourceLabels as sourceLabels } from '../lib/explorerInsights'
import { itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { normalizeKey } from '../lib/strings'
import { type ExternalDiscoverDuration, type ExternalDiscoverType } from '../services/externalSourceCredits'
import { CheckCircle2, Eye, Info, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CandidateDecisionBriefView, CandidateDialog, CoverArt, DiscoveryCard, EmptyState, ItemEditor, PublicItemEditor, ToastStack, explorerDiscoverDurationOptions, explorerDiscoverTypeOptions, explorerSearchTypeForItemType, fallbackExplorerStarters, feedbackToneFromText, promptDeck, type ActivityRecorder, type CompletedExplorerQueue, type ExplorerCandidateDismissRequest, type ExplorerCandidateRequest, type ExplorerCandidateSaveRequest, type ExplorerPromptCardRequest, type ExplorerSearchRequest, type ExplorerVisibleDismissRequest, type ExplorerVisibleSaveRequest, type LibrarySurface, type ToastMessage } from '../app/shared'

export default function ExplorerTab({
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
      const candidates = await library.searchCatalog(cleanedQuery, searchType)
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
      const { discoverExternalCandidate } = await import('../services/externalSearch')
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
