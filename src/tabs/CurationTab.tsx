import { type CatalogTaxonomyTemplate, catalogTaxonomyTemplates } from '../data/catalogPresets'
import { ITEM_TYPES, type ItemType, nowIso, type PublicCatalogItem } from '../domain/types'
import { blankPublicCatalogItem, type CatalogIssueFilter, type CatalogIssueKey, catalogIssueLabels, type CatalogQualityFilter, catalogQualityIssueKeys, catalogQualityWarnings, catalogSortLabels, type CatalogSortMode, getCatalogDiagnostics, getCatalogRepairDraft, getCatalogReviewQueue, publicCatalogDraftFromTemplate, sortCatalogItems, upsertVisibleCatalogItem } from '../lib/catalogInsights'
import { itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { createPublicCatalogSeedTemplate, getPublicCatalogSeedRollbackPlan, getPublicCatalogSeedSummary, parsePublicCatalogSeed, type PublicCatalogSeedRollbackPlan } from '../lib/publicCatalogSeed'
import { BookOpen, Download, LoaderCircle, Plus, RotateCcw, Search, SlidersHorizontal, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CoverArt, DialogFocusReturn, EmptyState, FeedbackMessage, MetricCard, PublicItemEditor, curationStarterTypes, downloadJsonFile, feedbackToneFromText, formatCatalogRepairIssues, formatCatalogSeedRollbackDetail, formatCatalogSeedRollbackStatus, formatCatalogSeedSummary, handleDialogKeyDown, roleLabels, typeIcons, type ActivityRecorder, type LibrarySurface, type PendingCatalogSeedImport } from '../app/shared'

export default function CurationTab({
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
              <button
                className="icon-button"
                type="button"
                autoFocus
                onClick={() => setArchiveTarget(undefined)}
                aria-label={`Cerrar confirmacion de archivo de ${archiveTarget.title}`}
                title="Cerrar"
              >
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
