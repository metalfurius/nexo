import './ImportTab.css'

import { type ImportPreview, type ImportSourceId, type ItemStatus, type ListItem } from '../domain/types'
import { assertLibraryImportItemLimit, getLibraryImportRollbackPlan, type LibraryImportRollbackPlan } from '../lib/libraryBackup'
import { clearLibraryImportRollback, persistLibraryImportRollback, readLibraryImportRollback } from '../lib/libraryImportRollbackStore'
import { normalizeKey, uniqueValues } from '../lib/strings'
import { importSourceLabels } from '../services/importSourceLabels'
import { BookOpen, FileArchive, Film, HelpCircle, Library, LoaderCircle, RotateCcw, Search, ShieldCheck, Sparkles, Upload, UserRound } from 'lucide-react'
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { FeedbackMessage, ServiceImportDialog, feedbackToneFromText, formatLibraryImportRollbackDetail, formatLibraryImportRollbackStatus, getImportPreviewNewItems, serviceImportPreviewRenderLimit, type ActivityRecorder, type AppTab, type LibrarySurface, type ServiceImportApplyProgress, type ServiceImportDialogPhase } from '../app/shared'

export const publicCatalogImportRecordLimit = 500

export default function ImportTab({
  library,
  onActivity,
  onNavigate,
  sessionKey,
}: {
  library: LibrarySurface
  onActivity: ActivityRecorder
  onNavigate: (tab: AppTab) => void
  sessionKey?: string
}) {
  const [status, setStatus] = useState<string | undefined>()
  const [serviceImportPreview, setServiceImportPreview] = useState<ImportPreview | undefined>()
  const [serviceImportSelectedIds, setServiceImportSelectedIds] = useState<string[]>([])
  const [serviceImportStatusFilter, setServiceImportStatusFilter] = useState<ItemStatus | 'all'>('all')
  const [serviceImportVisibleLimit, setServiceImportVisibleLimit] = useState(serviceImportPreviewRenderLimit)
  const [serviceImportLoading, setServiceImportLoading] = useState<ImportSourceId | undefined>()
  const [serviceImportDialogOpen, setServiceImportDialogOpen] = useState(false)
  const [serviceImportDialogPhase, setServiceImportDialogPhase] = useState<ServiceImportDialogPhase>('loading')
  const [serviceImportDialogSource, setServiceImportDialogSource] = useState<ImportSourceId | undefined>()
  const [serviceImportMessage, setServiceImportMessage] = useState<string | undefined>()
  const [serviceImportApplyProgress, setServiceImportApplyProgress] = useState<ServiceImportApplyProgress | undefined>()
  const [serviceImportUndo, setServiceImportUndo] = useState<LibraryImportRollbackPlan | undefined>(() =>
    readLibraryImportRollback('service', sessionKey),
  )
  const [anilistImportInput, setAnilistImportInput] = useState('')
  const [myAnimeListImportInput, setMyAnimeListImportInput] = useState('')
  const importRequestId = useRef(0)
  const mountedRef = useRef(true)
  const serviceImportFeedbackRunId = useRef(0)
  const serviceImportSessionToken = useMemo(() => Symbol(sessionKey ?? 'local'), [sessionKey])
  const activeServiceImportSessionTokenRef = useRef<symbol | undefined>(serviceImportSessionToken)
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
  const serviceImportAllNewItems = useMemo(
    () => serviceImportPreview ? getImportPreviewNewItems(serviceImportPreview) : [],
    [serviceImportPreview],
  )
  const serviceImportAllNewIds = useMemo(() => serviceImportAllNewItems.map((item) => item.id), [serviceImportAllNewItems])
  const serviceImportSelectedIdSet = useMemo(() => new Set(serviceImportSelectedIds), [serviceImportSelectedIds])
  const serviceImportSelectedItems = useMemo(
    () =>
      serviceImportPreview?.items.filter(
        (item) => serviceImportSelectedIdSet.has(item.id) && !item.duplicateOfId,
      ) ?? [],
    [serviceImportPreview, serviceImportSelectedIdSet],
  )
  const serviceImportUsesDefaultSelection =
    serviceImportSelectedIds.length === serviceImportAllNewIds.length &&
    serviceImportAllNewIds.every((id) => serviceImportSelectedIdSet.has(id))
  const dialogSourceLabel =
    serviceImportPreview?.sourceLabel ??
    (serviceImportDialogSource ? importSourceLabels[serviceImportDialogSource] : 'Importacion')

  useEffect(() => {
    mountedRef.current = true
    activeServiceImportSessionTokenRef.current = serviceImportSessionToken
    return () => {
      mountedRef.current = false
      if (activeServiceImportSessionTokenRef.current === serviceImportSessionToken) {
        activeServiceImportSessionTokenRef.current = undefined
      }
      serviceImportFeedbackRunId.current += 1
    }
  }, [serviceImportSessionToken])

  function resetServiceImportPreview() {
    setServiceImportPreview(undefined)
    setServiceImportSelectedIds([])
    setServiceImportStatusFilter('all')
    setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
    setServiceImportApplyProgress(undefined)
  }

  function setPreparedServiceImport(preview: ImportPreview) {
    setServiceImportPreview(preview)
    setServiceImportStatusFilter('all')
    setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
    setServiceImportSelectedIds(getImportPreviewNewItems(preview).map((item) => item.id))
    setServiceImportUndo(undefined)
    clearLibraryImportRollback('service', sessionKey)
    setServiceImportDialogPhase('preview')
    setServiceImportMessage(
      `${preview.sourceLabel}: ${preview.newItems} nuevas, ${preview.duplicateItems} posibles duplicadas, ${preview.invalidItems} invalidas`,
    )
    setStatus(undefined)
  }

  async function preparePublicProfileImport(sourceId: 'anilist' | 'myanimelist') {
    const input = sourceId === 'anilist' ? anilistImportInput : myAnimeListImportInput
    const requestId = importRequestId.current + 1
    importRequestId.current = requestId
    serviceImportFeedbackRunId.current += 1
    setServiceImportDialogSource(sourceId)
    setServiceImportLoading(sourceId)
    setServiceImportDialogOpen(true)
    setServiceImportDialogPhase('loading')
    setServiceImportMessage(`Leyendo perfil de ${importSourceLabels[sourceId]}...`)
    resetServiceImportPreview()
    try {
      const { buildImportPreview, importAniListLibrary, importMyAnimeListLibrary } = await import('../services/libraryImporters')
      const result = sourceId === 'anilist' ? await importAniListLibrary(input) : await importMyAnimeListLibrary(input)
      if (importRequestId.current !== requestId) return
      setPreparedServiceImport(buildImportPreview(result, library.items))
    } catch (reason) {
      if (importRequestId.current !== requestId) return
      resetServiceImportPreview()
      setServiceImportDialogPhase('error')
      setServiceImportMessage(reason instanceof Error ? reason.message : `No se pudo importar desde ${importSourceLabels[sourceId]}.`)
    } finally {
      if (importRequestId.current === requestId) {
        setServiceImportLoading(undefined)
      }
    }
  }

  async function prepareServiceFileImport(sourceId: 'letterboxd' | 'goodreads', file?: File) {
    if (!file) return

    const requestId = importRequestId.current + 1
    importRequestId.current = requestId
    serviceImportFeedbackRunId.current += 1
    setServiceImportDialogSource(sourceId)
    setServiceImportLoading(sourceId)
    setServiceImportDialogOpen(true)
    setServiceImportDialogPhase('loading')
    setServiceImportMessage(`Leyendo ${importSourceLabels[sourceId]}...`)
    resetServiceImportPreview()
    try {
      const { buildImportPreview, importGoodreadsCsv, importLetterboxdZip } = await import('../services/libraryImporters')
      const result = sourceId === 'letterboxd' ? await importLetterboxdZip(file) : await importGoodreadsCsv(file)
      if (importRequestId.current !== requestId) return
      setPreparedServiceImport(buildImportPreview(result, library.items))
    } catch (reason) {
      if (importRequestId.current !== requestId) return
      resetServiceImportPreview()
      setServiceImportDialogPhase('error')
      setServiceImportMessage(reason instanceof Error ? reason.message : `No se pudo importar desde ${importSourceLabels[sourceId]}.`)
    } finally {
      if (importRequestId.current === requestId) {
        setServiceImportLoading(undefined)
      }
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

  function selectAllServiceImportItems() {
    setServiceImportSelectedIds(serviceImportAllNewIds)
  }

  function clearServiceImportSelection() {
    setServiceImportSelectedIds([])
  }

  function closeServiceImportDialog() {
    if (serviceImportDialogPhase === 'applying') return
    if (serviceImportDialogPhase === 'loading') {
      importRequestId.current += 1
    }
    setServiceImportDialogOpen(false)
    serviceImportFeedbackRunId.current += 1
    setServiceImportLoading(undefined)
    setServiceImportDialogSource(undefined)
    setServiceImportMessage(undefined)
    resetServiceImportPreview()
  }

  async function applyServiceImport(mode: 'all' | 'selected') {
    if (!serviceImportPreview) return
    const importSessionToken = serviceImportSessionToken
    const previewItemsToImport = mode === 'all' ? serviceImportAllNewItems : serviceImportSelectedItems
    if (!previewItemsToImport.length) {
      setServiceImportMessage('Selecciona al menos una entrada nueva para importar.')
      return
    }

    setServiceImportDialogPhase('applying')
    try {
      assertLibraryImportItemLimit(previewItemsToImport.length)
      const { importPreviewItemsToListItems } = await import('../services/libraryImporters')
      if (!isServiceImportSessionActive(importSessionToken)) return
      const itemsToImport = importPreviewItemsToListItems(previewItemsToImport)
      const rollbackPlan = getLibraryImportRollbackPlan({ items: itemsToImport }, library.items, library.settings)
      persistLibraryImportRollback('service', sessionKey, rollbackPlan)
      setServiceImportUndo(rollbackPlan)
      setServiceImportApplyProgress({ current: 0, total: itemsToImport.length })
      setServiceImportMessage(`Importando 0/${itemsToImport.length} desde ${serviceImportPreview.sourceLabel}...`)
      const shouldRecordPublicCatalog = library.syncState.remote
      const publicCatalogRecordableItems = shouldRecordPublicCatalog
        ? dedupePublicCatalogRecordItems(itemsToImport).slice(0, publicCatalogImportRecordLimit)
        : []

      for (const [index, item] of itemsToImport.entries()) {
        if (!isServiceImportSessionActive(importSessionToken)) return
        await library.saveItem(item)
        if (!isServiceImportSessionActive(importSessionToken)) return
        const current = index + 1
        setServiceImportApplyProgress({ current, total: itemsToImport.length })
        setServiceImportMessage(`Importando ${current}/${itemsToImport.length} desde ${serviceImportPreview.sourceLabel}...`)
      }

      if (!isServiceImportSessionActive(importSessionToken)) return

      const feedbackRunId = serviceImportFeedbackRunId.current + 1
      serviceImportFeedbackRunId.current = feedbackRunId
      const completionMessage = formatServiceImportPrivateCompletionMessage({
        imported: itemsToImport.length,
        recordable: publicCatalogRecordableItems.length,
        sourceLabel: serviceImportPreview.sourceLabel,
      })
      setServiceImportDialogPhase('complete')
      setServiceImportMessage(completionMessage)
      setStatus(completionMessage)
      onActivity({
        detail: `${itemsToImport.length} entradas privadas; ${publicCatalogRecordableItems.length} pendientes para catalogo`,
        label: `${serviceImportPreview.sourceLabel} importado`,
        tab: 'import',
        tone: 'success',
      })
      if (publicCatalogRecordableItems.length) {
        void recordPublicCatalogImportsInBackground(
          publicCatalogRecordableItems,
          serviceImportPreview.sourceLabel,
          itemsToImport.length,
          feedbackRunId,
          importSessionToken,
        )
      }
    } catch (reason) {
      if (!isServiceImportSessionActive(importSessionToken)) return
      setServiceImportDialogPhase('error')
      const errorMessage = reason instanceof Error ? reason.message : 'No se pudo aplicar la importacion.'
      setServiceImportMessage(`${errorMessage} Puedes deshacer cualquier cambio aplicado.`)
    }
  }

  async function recordPublicCatalogImportsInBackground(
    itemsToRecord: ListItem[],
    sourceLabel: string,
    importedCount: number,
    feedbackRunId: number,
    importSessionToken: symbol,
  ) {
    let completed = 0
    let records = 0
    let failures = 0
    const total = itemsToRecord.length

    const updateBackgroundMessage = () => {
      if (!canContinuePublicCatalogRegistration(feedbackRunId, importSessionToken)) return
      setServiceImportMessage(
        `Importadas ${importedCount} entradas desde ${sourceLabel}. Registrando catalogo publico... ${completed}/${total}`,
      )
    }

    updateBackgroundMessage()
    for (let index = 0; index < total; index += 100) {
      if (!canContinuePublicCatalogRegistration(feedbackRunId, importSessionToken)) return
      const chunk = itemsToRecord.slice(index, index + 100)
      try {
        if (library.recordImportedItemsToPublicCatalog) {
          await library.recordImportedItemsToPublicCatalog(chunk)
        } else {
          for (const item of chunk) await library.recordImportedItemToPublicCatalog(item)
        }
        records += chunk.length
      } catch {
        failures += chunk.length
      } finally {
        completed += chunk.length
        updateBackgroundMessage()
      }
    }

    if (!canContinuePublicCatalogRegistration(feedbackRunId, importSessionToken)) return
    const completionMessage = formatServiceImportCatalogCompletionMessage({
      failures,
      imported: importedCount,
      records,
      sourceLabel,
    })
    setServiceImportMessage(completionMessage)
    setStatus(completionMessage)
  }

  function isServiceImportSessionActive(importSessionToken: symbol) {
    return mountedRef.current && activeServiceImportSessionTokenRef.current === importSessionToken
  }

  function canContinuePublicCatalogRegistration(feedbackRunId: number, importSessionToken: symbol) {
    return isServiceImportSessionActive(importSessionToken) && serviceImportFeedbackRunId.current === feedbackRunId
  }

  async function undoServiceImport() {
    if (!serviceImportUndo) return

    setServiceImportDialogOpen(true)
    setServiceImportDialogPhase('applying')
    setServiceImportApplyProgress(undefined)
    setServiceImportMessage('Deshaciendo importacion privada...')
    try {
      for (const id of serviceImportUndo.newItemIds) {
        await library.deleteItem(id)
      }
      for (const item of serviceImportUndo.previousItems) {
        await library.saveItem(item)
      }
      setStatus(formatLibraryImportRollbackStatus(serviceImportUndo))
      setServiceImportMessage(formatLibraryImportRollbackStatus(serviceImportUndo))
      onActivity({
        detail: formatLibraryImportRollbackDetail(serviceImportUndo),
        label: 'Importacion privada deshecha',
        tab: 'import',
        tone: 'success',
      })
      setServiceImportUndo(undefined)
      clearLibraryImportRollback('service', sessionKey)
      setServiceImportDialogPhase('complete')
    } catch (reason) {
      setServiceImportDialogPhase('error')
      setServiceImportMessage(reason instanceof Error ? reason.message : 'No se pudo deshacer la importacion.')
    }
  }

  return (
    <section className="import-tab" data-testid="import-tab" aria-labelledby="import-title">
      <div className="workspace-panel import-panel">
        <header className="import-hero">
          <div className="import-hero-copy">
            <span className="import-eyebrow">
              <ShieldCheck aria-hidden="true" size={15} />
              Importación privada
            </span>
            <h2 id="import-title">Trae tu biblioteca</h2>
            <p>Elige un perfil público o sube un archivo. Podrás revisar todo antes de guardarlo.</p>
          </div>
          <div className="import-hero-steps" aria-label="Proceso de importación">
            <span><strong>1</strong> Elige</span>
            <span><strong>2</strong> Revisa</span>
            <span><strong>3</strong> Importa</span>
          </div>
        </header>

        <div className="import-feedback" aria-live="polite">
          {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
          {serviceImportUndo && (
            <div className="feedback-action-row" aria-label="Accion reciente de importacion">
              <button className="secondary-button" type="button" onClick={() => void undoServiceImport()}>
                <RotateCcw size={16} />
                Deshacer importacion
              </button>
              <button className="ghost-button" type="button" onClick={() => onNavigate('library')}>
                <Library size={16} />
                Ver Biblioteca
              </button>
            </div>
          )}
        </div>

        <div className="import-methods">
          <section className="import-method-section" aria-labelledby="import-profile-title">
            <div className="import-section-heading">
              <span className="import-section-icon"><UserRound aria-hidden="true" size={18} /></span>
              <div>
                <h3 id="import-profile-title">Desde un perfil</h3>
                <p>Solo necesitamos el usuario o la URL pública.</p>
              </div>
            </div>
            <div className="service-import-grid import-provider-grid">
          <form
            className="service-import-card service-profile-card"
            aria-busy={serviceImportLoading === 'anilist'}
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
              Usuario o URL pública
              <input
                value={anilistImportInput}
                onChange={(event) => setAnilistImportInput(event.target.value)}
                placeholder="usuario o anilist.co/user/..."
              />
            </label>
            <button className="secondary-button" disabled={serviceImportLoading === 'anilist'} type="submit">
              {serviceImportLoading === 'anilist' ? <LoaderCircle className="import-spinner" size={16} /> : <Search size={16} />}
              {serviceImportLoading === 'anilist' ? 'Leyendo perfil...' : 'Leer perfil'}
            </button>
          </form>

          <form
            className="service-import-card service-profile-card"
            aria-busy={serviceImportLoading === 'myanimelist'}
            onSubmit={(event) => {
              event.preventDefault()
              void preparePublicProfileImport('myanimelist')
            }}
          >
            <div className="service-import-card-heading">
              <BookOpen size={17} />
              <div>
                <strong>MyAnimeList</strong>
                <small>Importación mediante Jikan</small>
              </div>
              <span className="mode-pill warning">Beta</span>
            </div>
            <label>
              Usuario o URL pública
              <input
                value={myAnimeListImportInput}
                onChange={(event) => setMyAnimeListImportInput(event.target.value)}
                placeholder="usuario o myanimelist.net/profile/..."
              />
            </label>
            <button className="secondary-button" disabled={serviceImportLoading === 'myanimelist'} type="submit">
              {serviceImportLoading === 'myanimelist' ? <LoaderCircle className="import-spinner" size={16} /> : <Search size={16} />}
              {serviceImportLoading === 'myanimelist' ? 'Leyendo perfil...' : 'Leer perfil'}
            </button>
          </form>

            </div>
          </section>

          <section className="import-method-section" aria-labelledby="import-file-title">
            <div className="import-section-heading">
              <span className="import-section-icon"><FileArchive aria-hidden="true" size={18} /></span>
              <div>
                <h3 id="import-file-title">Desde un archivo</h3>
                <p>Usa la exportación oficial, sin modificarla.</p>
              </div>
            </div>
            <div className="service-import-grid import-provider-grid">

          <div className="service-import-card service-file-card" aria-busy={serviceImportLoading === 'letterboxd'}>
            <div className="service-import-card-heading">
              <Film size={17} />
              <div>
                <strong>Letterboxd</strong>
                <small>ZIP · hasta 10 MB y 5.000 entradas</small>
              </div>
            </div>
            <details className="service-import-guide">
              <summary>
                <HelpCircle size={15} />
                Cómo conseguir el ZIP
              </summary>
              <ol>
                <li>En Letterboxd abre Settings, Data y Export your data.</li>
                <li>Descarga el ZIP y súbelo aquí sin descomprimir.</li>
              </ol>
            </details>
            <label
              className="service-file-drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleServiceFileDrop('letterboxd', event)}
            >
              {serviceImportLoading === 'letterboxd' ? <LoaderCircle className="import-spinner" size={18} /> : <Upload aria-hidden="true" size={18} />}
              <span>{serviceImportLoading === 'letterboxd' ? 'Leyendo archivo...' : 'Elegir ZIP'}</span>
              <small>o arrástralo aquí</small>
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

          <div className="service-import-card service-file-card" aria-busy={serviceImportLoading === 'goodreads'}>
            <div className="service-import-card-heading">
              <BookOpen size={17} />
              <div>
                <strong>Goodreads</strong>
                <small>CSV · hasta 10 MB y 5.000 entradas</small>
              </div>
            </div>
            <details className="service-import-guide">
              <summary>
                <HelpCircle size={15} />
                Cómo conseguir el CSV
              </summary>
              <ol>
                <li>En Goodreads abre My Books, Import and export.</li>
                <li>Descarga el CSV y súbelo directamente.</li>
              </ol>
            </details>
            <label
              className="service-file-drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleServiceFileDrop('goodreads', event)}
            >
              {serviceImportLoading === 'goodreads' ? <LoaderCircle className="import-spinner" size={18} /> : <Upload aria-hidden="true" size={18} />}
              <span>{serviceImportLoading === 'goodreads' ? 'Leyendo archivo...' : 'Elegir CSV'}</span>
              <small>o arrástralo aquí</small>
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
          </section>
        </div>

        <details className="import-privacy-note">
          <summary>Qué ocurre con los datos importados</summary>
          <p>Las entradas se guardan en tu biblioteca privada. Nexo solo registra metadatos públicos de las obras para mejorar el catálogo compartido.</p>
        </details>
      </div>

      {serviceImportDialogOpen && (
        <ServiceImportDialog
          allNewCount={serviceImportAllNewItems.length}
          applyProgress={serviceImportApplyProgress}
          isDefaultSelection={serviceImportUsesDefaultSelection}
          message={serviceImportMessage}
          phase={serviceImportDialogPhase}
          preview={serviceImportPreview}
          renderedItems={serviceImportRenderedItems}
          selectedCount={serviceImportSelectedItems.length}
          selectedIdSet={serviceImportSelectedIdSet}
          sourceLabel={dialogSourceLabel}
          statusFilter={serviceImportStatusFilter}
          visibleCount={serviceImportVisibleItems.length}
          visibleLimit={serviceImportVisibleLimit}
          onClearSelection={clearServiceImportSelection}
          onClose={closeServiceImportDialog}
          onImportAll={() => void applyServiceImport('all')}
          onImportSelected={() => void applyServiceImport('selected')}
          onNavigate={onNavigate}
          onSelectAll={selectAllServiceImportItems}
          onShowMore={() => setServiceImportVisibleLimit((limit) => limit + serviceImportPreviewRenderLimit)}
          onStatusFilterChange={(nextStatusFilter) => {
            setServiceImportStatusFilter(nextStatusFilter)
            setServiceImportVisibleLimit(serviceImportPreviewRenderLimit)
          }}
          onToggleSelection={toggleServiceImportSelection}
          onUndo={serviceImportUndo ? () => void undoServiceImport() : undefined}
        />
      )}
    </section>
  )
}

function formatServiceImportPrivateCompletionMessage({
  imported,
  recordable,
  sourceLabel,
}: {
  imported: number
  recordable: number
  sourceLabel: string
}) {
  const backgroundSummary = recordable > 0
    ? ` Registrando ${recordable} para mejorar el catalogo en segundo plano.`
    : ''
  return `Importadas ${imported} entradas desde ${sourceLabel}.${backgroundSummary}`
}

function formatServiceImportCatalogCompletionMessage({
  failures,
  imported,
  records,
  sourceLabel,
}: {
  failures: number
  imported: number
  records: number
  sourceLabel: string
}) {
  const failureSummary = failures > 0
    ? ' Importacion completada; algunas obras no se pudieron registrar en el catalogo.'
    : ''
  return `Importadas ${imported} entradas desde ${sourceLabel}. ${records} registradas para mejorar el catalogo.${failureSummary}`
}

function dedupePublicCatalogRecordItems(items: ListItem[]) {
  const seenKeys = new Set<string>()
  return items.filter((item) => {
    const keys = publicCatalogRecordKeys(item)
    if (keys.some((key) => seenKeys.has(key))) return false
    keys.forEach((key) => seenKeys.add(key))
    return true
  })
}

function publicCatalogRecordKeys(item: ListItem) {
  const refs = item.externalRefs ?? {}
  const refKeys = [
    ['anilistId', refs.anilistId],
    ['malId', refs.malId],
    ['letterboxdSlug', refs.letterboxdSlug],
    ['goodreadsBookId', refs.goodreadsBookId],
    ['isbn', refs.isbn],
    ['googleBooksId', refs.googleBooksId],
    ['openLibraryKey', refs.openLibraryKey],
    ['tmdbId', refs.tmdbId],
    ['rawgId', refs.rawgId],
    ['kitsuId', refs.kitsuId],
    ['wikidataId', refs.wikidataId],
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
    .map(([key, value]) => `${item.type}:ref:${key}:${normalizeKey(value)}`)
  return refKeys.length ? refKeys : [`${item.type}:title:${normalizeKey(item.title)}`]
}
