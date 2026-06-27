import { type ImportPreview, type ImportSourceId, type ItemStatus, type ListItem } from '../domain/types'
import { getLibraryImportRollbackPlan, type LibraryImportRollbackPlan } from '../lib/libraryBackup'
import { normalizeKey, uniqueValues } from '../lib/strings'
import { importSourceLabels } from '../services/importSourceLabels'
import { BookOpen, Film, HelpCircle, Library, LoaderCircle, RotateCcw, Search, Sparkles, Upload } from 'lucide-react'
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { FeedbackMessage, ServiceImportDialog, feedbackToneFromText, formatLibraryImportRollbackDetail, formatLibraryImportRollbackStatus, getImportPreviewNewItems, serviceImportPreviewRenderLimit, type ActivityRecorder, type AppTab, type LibrarySurface, type ServiceImportApplyProgress, type ServiceImportDialogPhase } from '../app/shared'

export const publicCatalogImportRecordLimit = 500
export const publicCatalogImportRecordConcurrency = 4

export default function ImportTab({
  library,
  onActivity,
  onNavigate,
}: {
  library: LibrarySurface
  onActivity: ActivityRecorder
  onNavigate: (tab: AppTab) => void
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
  const [serviceImportUndo, setServiceImportUndo] = useState<LibraryImportRollbackPlan | undefined>()
  const [anilistImportInput, setAnilistImportInput] = useState('')
  const [myAnimeListImportInput, setMyAnimeListImportInput] = useState('')
  const importRequestId = useRef(0)
  const mountedRef = useRef(true)
  const serviceImportFeedbackRunId = useRef(0)
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
    return () => {
      mountedRef.current = false
      serviceImportFeedbackRunId.current += 1
    }
  }, [])

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
    const previewItemsToImport = mode === 'all' ? serviceImportAllNewItems : serviceImportSelectedItems
    if (!previewItemsToImport.length) {
      setServiceImportMessage('Selecciona al menos una entrada nueva para importar.')
      return
    }

    const { importPreviewItemsToListItems } = await import('../services/libraryImporters')
    const itemsToImport = importPreviewItemsToListItems(previewItemsToImport)
    const rollbackPlan = getLibraryImportRollbackPlan({ items: itemsToImport }, library.items, library.settings)
    setServiceImportUndo(rollbackPlan)
    setServiceImportDialogPhase('applying')
    setServiceImportApplyProgress({ current: 0, total: itemsToImport.length })
    setServiceImportMessage(`Importando 0/${itemsToImport.length} desde ${serviceImportPreview.sourceLabel}...`)
    const shouldRecordPublicCatalog = library.syncState.remote
    const publicCatalogRecordableItems = shouldRecordPublicCatalog
      ? dedupePublicCatalogRecordItems(itemsToImport).slice(0, publicCatalogImportRecordLimit)
      : []
    try {
      for (const [index, item] of itemsToImport.entries()) {
        await library.saveItem(item)
        const current = index + 1
        setServiceImportApplyProgress({ current, total: itemsToImport.length })
        setServiceImportMessage(`Importando ${current}/${itemsToImport.length} desde ${serviceImportPreview.sourceLabel}...`)
      }

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
        )
      }
    } catch (reason) {
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
  ) {
    let completed = 0
    let records = 0
    let failures = 0
    const total = itemsToRecord.length

    const updateBackgroundMessage = () => {
      if (!canUpdateServiceImportFeedback(feedbackRunId)) return
      setServiceImportMessage(
        `Importadas ${importedCount} entradas desde ${sourceLabel}. Registrando catalogo publico... ${completed}/${total}`,
      )
    }

    updateBackgroundMessage()
    const workerCount = Math.min(publicCatalogImportRecordConcurrency, total)
    await Promise.all(
      Array.from({ length: workerCount }, async (_entry, workerIndex) => {
        for (let index = workerIndex; index < total; index += workerCount) {
          try {
            await library.recordImportedItemToPublicCatalog(itemsToRecord[index])
            records += 1
          } catch {
            failures += 1
          } finally {
            completed += 1
            updateBackgroundMessage()
          }
        }
      }),
    )

    if (!canUpdateServiceImportFeedback(feedbackRunId)) return
    const completionMessage = formatServiceImportCatalogCompletionMessage({
      failures,
      imported: importedCount,
      records,
      sourceLabel,
    })
    setServiceImportMessage(completionMessage)
    setStatus(completionMessage)
  }

  function canUpdateServiceImportFeedback(feedbackRunId: number) {
    return mountedRef.current && serviceImportFeedbackRunId.current === feedbackRunId
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
      setServiceImportDialogPhase('complete')
    } catch (reason) {
      setServiceImportDialogPhase('error')
      setServiceImportMessage(reason instanceof Error ? reason.message : 'No se pudo deshacer la importacion.')
    }
  }

  return (
    <section className="import-tab" data-testid="import-tab">
      <div className="workspace-panel import-panel">
        <div className="panel-heading">
          <div>
            <h2>Importar bibliotecas</h2>
            <p>Trae listas privadas desde perfiles publicos o exports oficiales.</p>
          </div>
          <span className="mode-pill">Privado</span>
        </div>

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

        <div className="service-import-grid import-provider-grid">
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
              {serviceImportLoading === 'anilist' ? 'Leyendo perfil...' : 'Leer perfil'}
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
              {serviceImportLoading === 'myanimelist' ? 'Leyendo perfil...' : 'Leer perfil'}
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
