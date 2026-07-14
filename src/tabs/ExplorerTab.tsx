import './ExplorerTab.css'

import type { DiscoveryCandidate, DiscoveryStatus, ListItem, PublicCatalogItem } from '../domain/types'
import { promptToDiscovery } from '../lib/catalog'
import { blankPublicCatalogItem, publicCatalogDraftFromCandidate } from '../lib/catalogInsights'
import {
  discoverySourceLabels as sourceLabels,
  getDiscoverySourceFilter,
  getVisibleExplorerCandidates,
  type ExplorerSourceFilter,
} from '../lib/explorerInsights'
import { itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { moveRoadmapItem } from '../lib/roadmap'
import type { ExternalDiscoverDuration, ExternalDiscoverType } from '../services/externalSourceCredits'
import { CheckCircle2, Info, Plus, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CandidateDialog,
  CoverArt,
  ItemEditor,
  PublicItemEditor,
  ToastStack,
  explorerDiscoverDurationOptions,
  explorerDiscoverTypeOptions,
  feedbackToneFromText,
  promptDeck,
  type ActivityRecorder,
  type CompletedExplorerQueue,
  type ExplorerCandidateDismissRequest,
  type ExplorerCandidateRequest,
  type ExplorerCandidateSaveRequest,
  type ExplorerPromptCardRequest,
  type LibrarySurface,
  type ToastMessage,
} from '../app/shared'
import DiscoveryReviewView from './DiscoveryReviewView'

interface ExplorerTabProps {
  candidateDismissRequest?: ExplorerCandidateDismissRequest
  candidateRequest?: ExplorerCandidateRequest
  candidateSaveRequest?: ExplorerCandidateSaveRequest
  library: LibrarySurface
  requiresSignIn?: boolean
  onActivity: ActivityRecorder
  onCandidateDismissRequestHandled: () => void
  onCandidateRequestHandled: () => void
  onCandidateSaveRequestHandled: () => void
  onPromptCardRequestHandled: () => void
  onSignIn: () => void
  promptCardRequest?: ExplorerPromptCardRequest
  surfaceMode?: 'surprise' | 'queue'
}

export default function ExplorerTab({
  candidateDismissRequest,
  candidateRequest,
  candidateSaveRequest,
  library,
  requiresSignIn = false,
  onActivity,
  onCandidateDismissRequestHandled,
  onCandidateRequestHandled,
  onCandidateSaveRequestHandled,
  onPromptCardRequestHandled,
  onSignIn,
  promptCardRequest,
  surfaceMode = 'surprise',
}: ExplorerTabProps) {
  const [view, setView] = useState<DiscoveryStatus>('queued')
  const [sourceFilter, setSourceFilter] = useState<ExplorerSourceFilter>('all')
  const [message, setMessage] = useState<string | undefined>()
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
  const [pendingCandidateIds, setPendingCandidateIds] = useState<ReadonlySet<string>>(() => new Set())
  const pendingCandidateIdsRef = useRef(new Set<string>())
  const handledCandidateDismissRequestId = useRef<number | undefined>(undefined)
  const handledCandidateRequestId = useRef<number | undefined>(undefined)
  const handledCandidateSaveRequestId = useRef<number | undefined>(undefined)
  const handledPromptCardRequestId = useRef<number | undefined>(undefined)

  const candidatesInView = useMemo(
    () => library.discoveryCandidates.filter((candidate) => candidate.status === view),
    [library.discoveryCandidates, view],
  )
  const visibleCandidates = useMemo(
    () => getVisibleExplorerCandidates(candidatesInView, sourceFilter),
    [candidatesInView, sourceFilter],
  )

  const requestPrivateAccess = useCallback((copy = 'Entra en Nexo para guardar cambios en tu espacio privado.') => {
    if (!requiresSignIn) return true
    setMessage(copy)
    onSignIn()
    return false
  }, [onSignIn, requiresSignIn])

  const runCandidateMutation = useCallback(async <T,>(candidateId: string, mutation: () => Promise<T>) => {
    if (pendingCandidateIdsRef.current.has(candidateId)) return undefined

    pendingCandidateIdsRef.current.add(candidateId)
    setPendingCandidateIds(new Set(pendingCandidateIdsRef.current))
    try {
      return await mutation()
    } finally {
      pendingCandidateIdsRef.current.delete(candidateId)
      setPendingCandidateIds(new Set(pendingCandidateIdsRef.current))
    }
  }, [])

  const clearExplorerRecentActions = useCallback(() => {
    setSavedExplorerItem(undefined)
    setSavedExplorerUndo(undefined)
    setCompletedExplorerQueue(undefined)
  }, [])

  const getCompletedExplorerQueue = useCallback((resolution: 'saved' | 'dismissed'): CompletedExplorerQueue => ({
    actionLabel: resolution === 'saved' ? 'Ver guardados' : 'Ver descartes',
    detail: resolution === 'saved' ? 'Has guardado el último hallazgo visible.' : 'Has descartado el último hallazgo visible.',
    nextView: resolution,
    sourceLabel: 'Bandeja',
    title: 'Revisión al día',
  }), [])

  const candidateCompletesVisibleQueue = useCallback((candidate: DiscoveryCandidate) => (
    view === 'queued' && visibleCandidates.length === 1 && visibleCandidates[0]?.id === candidate.id
  ), [view, visibleCandidates])

  function changeExplorerView(nextView: DiscoveryStatus) {
    setView(nextView)
    setCompletedExplorerQueue(undefined)
  }

  function changeExplorerSourceFilter(nextFilter: ExplorerSourceFilter) {
    setSourceFilter(nextFilter)
    setCompletedExplorerQueue(undefined)
  }

  const runExternalDiscovery = useCallback(async () => {
    setMessage(undefined)
    clearExplorerRecentActions()
    setDiscoverLoading(true)
    try {
      const { discoverExternalCandidate } = await import('../services/externalSearch')
      const candidate = await discoverExternalCandidate(discoverType, discoverDuration)
      if (!candidate) {
        setDiscoverCandidate(undefined)
        setMessage('No encontré una recomendación con portada. Prueba otra duración o tipo.')
        return
      }

      const discoveryCandidate = library.externalCandidateToDiscovery(candidate)
      setDiscoverCandidate(discoveryCandidate)
      setMessage(`${discoveryCandidate.title} encontrado fuera de tu biblioteca.`)
      onActivity({
        detail: `${typeLabels[discoveryCandidate.type]} / ${sourceLabels[discoveryCandidate.source]}`,
        label: 'Explorador aleatorio',
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
    if (!requestPrivateAccess('Entra en Nexo para añadir pistas a tu bandeja de revisión.')) return
    try {
      clearExplorerRecentActions()
      const title = promptDeck[Math.floor(Math.random() * promptDeck.length)]
      await library.queueDiscoveryCandidates([promptToDiscovery(title)])
      setView('queued')
      setMessage('Pista añadida a Revisar.')
      onActivity({ detail: title, label: 'Pista añadida', tab: 'explorer', tone: 'success' })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo añadir la pista.')
    }
  }, [clearExplorerRecentActions, library, onActivity, requestPrivateAccess])

  const saveCandidate = useCallback(async (candidate: DiscoveryCandidate) => {
    if (!requestPrivateAccess()) return false
    const completedQueue = candidateCompletesVisibleQueue(candidate) ? getCompletedExplorerQueue('saved') : undefined
    const result = await runCandidateMutation(candidate.id, async () => {
      try {
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
    })
    return result ?? false
  }, [candidateCompletesVisibleQueue, getCompletedExplorerQueue, library, onActivity, requestPrivateAccess, runCandidateMutation])

  const dismissCandidate = useCallback(async (candidate: DiscoveryCandidate) => {
    if (!requestPrivateAccess('Entra en Nexo para revisar tus hallazgos.')) return false
    const completedQueue = candidateCompletesVisibleQueue(candidate) ? getCompletedExplorerQueue('dismissed') : undefined
    const result = await runCandidateMutation(candidate.id, async () => {
      try {
        setSavedExplorerItem(undefined)
        setSavedExplorerUndo(undefined)
        await library.dismissDiscoveryCandidate(candidate.id)
        setCompletedExplorerQueue(completedQueue)
        setMessage(`${candidate.title} descartado.`)
        onActivity({ detail: candidate.title, label: 'Hallazgo descartado', tab: 'explorer', tone: 'success' })
        return true
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : 'No se pudo descartar el hallazgo.')
        return false
      }
    })
    return result ?? false
  }, [candidateCompletesVisibleQueue, getCompletedExplorerQueue, library, onActivity, requestPrivateAccess, runCandidateMutation])

  const restoreCandidate = useCallback(async (candidate: DiscoveryCandidate) => {
    if (!requestPrivateAccess('Entra en Nexo para recuperar hallazgos.')) return false
    const result = await runCandidateMutation(candidate.id, async () => {
      try {
        clearExplorerRecentActions()
        await library.restoreDiscoveryCandidate(candidate.id)
        setView('queued')
        setMessage(`${candidate.title} recuperado para revisar.`)
        onActivity({ detail: candidate.title, label: 'Hallazgo recuperado', tab: 'explorer', tone: 'success' })
        return true
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : 'No se pudo recuperar el hallazgo.')
        return false
      }
    })
    return result ?? false
  }, [clearExplorerRecentActions, library, onActivity, requestPrivateAccess, runCandidateMutation])

  const saveDiscoverCandidate = useCallback(async (candidate: DiscoveryCandidate) => {
    if (!requestPrivateAccess()) return false
    try {
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
  }, [library, onActivity, requestPrivateAccess])

  const putSavedItemNext = useCallback(async () => {
    if (!savedExplorerItem) return
    try {
      await library.applyRoadmapMutation({
        roadmap: moveRoadmapItem(library.settings.roadmap, savedExplorerItem.id, 'next'),
      })
      setMessage(`${savedExplorerItem.title} queda en Después.`)
      onActivity({
        detail: savedExplorerItem.title,
        label: 'Guardado en Después',
        tab: 'discover',
        target: { kind: 'item', id: savedExplorerItem.id },
        tone: 'success',
      })
      setSavedExplorerItem(undefined)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo colocar la obra en Después.')
    }
  }, [library, onActivity, savedExplorerItem])

  function dismissDiscoverCandidate(candidate: DiscoveryCandidate) {
    setDiscoverCandidate(undefined)
    setMessage(`${candidate.title} descartado.`)
  }

  async function undoSaveCandidate() {
    if (!savedExplorerUndo) return
    const undo = savedExplorerUndo
    try {
      await library.deleteItem(undo.item.id)
      await library.restoreDiscoveryCandidate(undo.candidate.id)
      setView('queued')
      clearExplorerRecentActions()
      setMessage(`${undo.item.title} recuperado para revisar y eliminado de Biblioteca.`)
      onActivity({ detail: undo.item.title, label: 'Guardado deshecho', tab: 'explorer', tone: 'success' })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo deshacer el guardado.')
    }
  }

  async function saveExplorerItemEdits(item: ListItem) {
    try {
      await library.saveItem(item)
      setEditingSavedItem(undefined)
      setSavedExplorerItem(item)
      setSavedExplorerUndo((current) => current ? { ...current, item } : current)
      setMessage(`${item.title || 'Entrada'} afinada en Biblioteca.`)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.')
    }
  }

  async function deleteExplorerItem(item: ListItem) {
    try {
      await library.deleteItem(item.id)
      setEditingSavedItem(undefined)
      setSavedExplorerItem((current) => current?.id === item.id ? undefined : current)
      setSavedExplorerUndo((current) => current?.item.id === item.id ? undefined : current)
      setMessage(`${item.title || 'Entrada'} eliminada de Biblioteca.`)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo borrar la entrada.')
    }
  }

  function openCatalogDraft(candidate: DiscoveryCandidate) {
    setSelected(undefined)
    setCatalogDraft(publicCatalogDraftFromCandidate(candidate))
  }

  async function saveCatalogDraft(item: PublicCatalogItem, options?: { createAnother?: boolean }) {
    try {
      const savedItem = await library.upsertPublicItem(item)
      setCatalogDraft(options?.createAnother ? blankPublicCatalogItem(savedItem.type) : undefined)
      setMessage(`${savedItem.title} guardado en catálogo Nexo.`)
      onActivity({ detail: savedItem.title, label: 'Catálogo actualizado', tab: 'explorer', tone: 'success' })
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo guardar en el catálogo público.')
    }
  }

  useEffect(() => {
    if (!promptCardRequest || handledPromptCardRequestId.current === promptCardRequest.requestId) return
    handledPromptCardRequestId.current = promptCardRequest.requestId
    void addPromptCard().finally(onPromptCardRequestHandled)
  }, [addPromptCard, onPromptCardRequestHandled, promptCardRequest])

  useEffect(() => {
    if (!candidateRequest || handledCandidateRequestId.current === candidateRequest.requestId) return
    const timeoutId = window.setTimeout(() => {
      if (handledCandidateRequestId.current === candidateRequest.requestId) return
      handledCandidateRequestId.current = candidateRequest.requestId
      const candidate = library.discoveryCandidates.find((current) => current.id === candidateRequest.candidateId)
      if (!candidate) {
        setMessage('Ese hallazgo ya no está disponible en Revisar.')
        onCandidateRequestHandled()
        return
      }
      setMessage(undefined)
      setView(candidate.status)
      setSourceFilter(getDiscoverySourceFilter(candidate))
      setCompletedExplorerQueue(undefined)
      setSelected(candidate)
      onCandidateRequestHandled()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [candidateRequest, library.discoveryCandidates, onCandidateRequestHandled])

  useEffect(() => {
    if (!candidateDismissRequest || handledCandidateDismissRequestId.current === candidateDismissRequest.requestId) return
    const timeoutId = window.setTimeout(() => {
      if (handledCandidateDismissRequestId.current === candidateDismissRequest.requestId) return
      handledCandidateDismissRequestId.current = candidateDismissRequest.requestId
      const candidate = library.discoveryCandidates.find((current) => current.id === candidateDismissRequest.candidateId)
      if (!candidate || candidate.status !== 'queued') {
        setMessage(candidate ? `${candidate.title} ya no está por revisar.` : 'Ese hallazgo ya no está disponible en Revisar.')
        onCandidateDismissRequestHandled()
        return
      }
      setView('queued')
      setSourceFilter(getDiscoverySourceFilter(candidate))
      void dismissCandidate(candidate).finally(onCandidateDismissRequestHandled)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [candidateDismissRequest, dismissCandidate, library.discoveryCandidates, onCandidateDismissRequestHandled])

  useEffect(() => {
    if (!candidateSaveRequest || handledCandidateSaveRequestId.current === candidateSaveRequest.requestId) return
    const timeoutId = window.setTimeout(() => {
      if (handledCandidateSaveRequestId.current === candidateSaveRequest.requestId) return
      handledCandidateSaveRequestId.current = candidateSaveRequest.requestId
      const candidate = library.discoveryCandidates.find((current) => current.id === candidateSaveRequest.candidateId)
      if (!candidate || candidate.status !== 'queued') {
        setMessage(candidate ? `${candidate.title} ya no está por revisar.` : 'Ese hallazgo ya no está disponible en Revisar.')
        onCandidateSaveRequestHandled()
        return
      }
      setView('queued')
      setSourceFilter(getDiscoverySourceFilter(candidate))
      void saveCandidate(candidate).finally(onCandidateSaveRequestHandled)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [candidateSaveRequest, library.discoveryCandidates, onCandidateSaveRequestHandled, saveCandidate])

  const explorerMessageTone = message ? feedbackToneFromText(message) : undefined
  const explorerToasts: ToastMessage[] = message ? [{
    action: savedExplorerUndo ? { ariaLabel: 'Deshacer guardado', label: 'Deshacer', onClick: () => void undoSaveCandidate() } : undefined,
    durationMs: explorerMessageTone === 'danger' || explorerMessageTone === 'loading' ? undefined : savedExplorerUndo ? 8000 : 3000,
    id: 'explorer-status',
    message,
    tone: explorerMessageTone,
  }] : []

  return (
    <section className="content-grid explorer-grid">
      <section className="workspace-panel wide">
        {surfaceMode !== 'queue' && (
          <div className="explorer-command">
            <div className="explorer-command-main">
              <div className="explorer-command-heading">
                <div>
                  <h2>Sorpréndeme</h2>
                  <p>Elige el tipo y deja que Nexo encuentre la siguiente obra.</p>
                </div>
              </div>
              <form className="explorer-search explorer-command-search explorer-discover-form" onSubmit={(event) => {
                event.preventDefault()
                void runExternalDiscovery()
              }}>
                <select aria-label="Tipo para descubrir" value={discoverType} onChange={(event) => setDiscoverType(event.target.value as ExternalDiscoverType)}>
                  {explorerDiscoverTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <select aria-label="Duración para descubrir" value={discoverDuration} onChange={(event) => setDiscoverDuration(event.target.value as ExternalDiscoverDuration)}>
                  {explorerDiscoverDurationOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <button className="primary-button" disabled={discoverLoading} type="submit">
                  <Sparkles size={18} />
                  {discoverLoading ? 'Buscando' : 'Sorpréndeme'}
                </button>
              </form>
            </div>
          </div>
        )}

        <ToastStack label="Acción reciente de Descubrir" toasts={explorerToasts} onDismiss={(id) => {
          if (id === 'explorer-status') setMessage(undefined)
          setSavedExplorerUndo(undefined)
        }} />

        {savedExplorerItem && (
          <section className="explorer-save-followup" aria-label="Siguiente paso de la obra guardada">
            <span><CheckCircle2 size={17} />{savedExplorerItem.title} ya está en tu Biblioteca.</span>
            <div>
              <button className="primary-button" type="button" onClick={() => void putSavedItemNext()}>Poner en Después</button>
              <button className="secondary-button" type="button" onClick={() => setEditingSavedItem(savedExplorerItem)}><Info size={16} />Afinar ficha</button>
            </div>
          </section>
        )}

        {surfaceMode !== 'queue' && discoverCandidate && (
          <section className="candidate-spotlight explorer-random-result" aria-label="Resultado de Sorpréndeme" data-testid="explorer-random-result">
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
              <p className="candidate-spotlight-overview">{discoverCandidate.overview || `${typeLabels[discoverCandidate.type]} encontrado fuera de tu biblioteca.`}</p>
              <div className="tag-row">{discoverCandidate.genres.slice(0, 4).map((genre) => <span key={genre}>{genre}</span>)}</div>
              <div className="candidate-spotlight-actions" aria-label={`Decidir ${discoverCandidate.title}`}>
                <button className="primary-button" type="button" onClick={() => void saveDiscoverCandidate(discoverCandidate)}><Plus size={17} />Guardar</button>
                <button className="secondary-button" disabled={discoverLoading} type="button" onClick={() => void runExternalDiscovery()}><Sparkles size={17} />Otra</button>
                <button className="ghost-button danger-ghost" type="button" onClick={() => dismissDiscoverCandidate(discoverCandidate)}><X size={17} />Descartar</button>
              </div>
            </div>
          </section>
        )}

        {surfaceMode === 'queue' && (
          <>
            {completedExplorerQueue && (
              <section className="explorer-completion-card" aria-label="Bandeja de revisión resuelta" data-testid="explorer-completion">
                <div className="explorer-completion-main">
                  <CheckCircle2 size={18} />
                  <div><strong>{completedExplorerQueue.title}</strong><p>{completedExplorerQueue.detail}</p></div>
                </div>
                <div className="explorer-completion-actions">
                  <button className="primary-button" type="button" onClick={() => {
                    setView(completedExplorerQueue.nextView)
                    setCompletedExplorerQueue(undefined)
                  }}>{completedExplorerQueue.actionLabel}</button>
                  <button className="ghost-button" type="button" onClick={() => setCompletedExplorerQueue(undefined)}>Cerrar</button>
                </div>
              </section>
            )}
            <DiscoveryReviewView
              candidates={library.discoveryCandidates}
              isModerator={library.isModerator}
              pendingCandidateIds={pendingCandidateIds}
              sourceFilter={sourceFilter}
              view={view}
              onCurate={openCatalogDraft}
              onDetails={setSelected}
              onDismiss={dismissCandidate}
              onRestore={restoreCandidate}
              onSave={saveCandidate}
              onSourceFilterChange={changeExplorerSourceFilter}
              onViewChange={changeExplorerView}
            />
          </>
        )}
      </section>

      {selected && (
        <CandidateDialog
          candidate={selected}
          pending={pendingCandidateIds.has(selected.id)}
          onClose={() => setSelected(undefined)}
          onDismiss={() => void dismissCandidate(selected).then((saved) => { if (saved) setSelected(undefined) })}
          onRestore={() => void restoreCandidate(selected).then((restored) => { if (restored) setSelected(undefined) })}
          onSave={() => void saveCandidate(selected).then((saved) => { if (saved) setSelected(undefined) })}
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
        <ItemEditor item={editingSavedItem} onClose={() => setEditingSavedItem(undefined)} onDelete={deleteExplorerItem} onSave={saveExplorerItemEdits} />
      )}
    </section>
  )
}
