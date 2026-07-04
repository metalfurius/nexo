import { type DiscoveryCandidate, type ExplorerSearchType } from '../domain/types'
import { discoverySourceLabels as sourceLabels } from '../lib/explorerInsights'
import { getDiscoveryCandidateEffortSignal, itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { Check, CheckCircle2, Eye, Library, LogIn, Plus, Search, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CoverArt,
  DialogFocusReturn,
  EmptyState,
  FeedbackMessage,
  feedbackToneFromText,
  getSavedLibraryItemForCandidate,
  handleDialogKeyDown,
  hasCatalogRouteState,
  libraryCatalogSearchTypes,
  readCatalogRouteState,
  writeCatalogRouteState,
  type ActivityRecorder,
  type AppTab,
  type LibrarySurface,
} from '../app/shared'

interface CatalogTabProps {
  isSignedIn: boolean
  library: LibrarySurface
  onActivity: ActivityRecorder
  onNavigate: (tab: AppTab) => void
  onSignIn: () => void
}

const adsEnabled = import.meta.env.VITE_ADS_ENABLED === 'true'
const catalogPublicPageSize = 24

export default function CatalogTab({ isSignedIn, library, onActivity, onNavigate, onSignIn }: CatalogTabProps) {
  const initialCatalogRouteState = readCatalogRouteState()
  const [query, setQuery] = useState(initialCatalogRouteState.query)
  const [type, setType] = useState<ExplorerSearchType>(initialCatalogRouteState.type)
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([])
  const [visibleLimit, setVisibleLimit] = useState(catalogPublicPageSize)
  const [catalogResultLabel, setCatalogResultLabel] = useState('obras del catalogo')
  const [selectedCandidate, setSelectedCandidate] = useState<DiscoveryCandidate | undefined>()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const libraryRef = useRef(library)
  const catalogRequestId = useRef(0)
  const visibleCandidates = useMemo(() => candidates.slice(0, visibleLimit), [candidates, visibleLimit])
  const visibleSavedCount = useMemo(
    () =>
      isSignedIn
        ? visibleCandidates.filter((candidate) => getSavedLibraryItemForCandidate(candidate, library.items)).length
        : 0,
    [isSignedIn, library.items, visibleCandidates],
  )
  const hasMoreCandidates = visibleCandidates.length < candidates.length
  const showCatalogRail = !isSignedIn || adsEnabled
  const hasActiveCatalogRoute = hasCatalogRouteState({ query, type })
  const isCandidateSaved = (candidate: DiscoveryCandidate) =>
    isSignedIn && Boolean(getSavedLibraryItemForCandidate(candidate, library.items))

  useEffect(() => {
    libraryRef.current = library
  }, [library])

  const runCatalogRequest = useCallback(async (
    nextQuery: string,
    nextType: ExplorerSearchType,
    options: { historyMode?: 'push' | 'replace'; syncInputs?: boolean; writeRoute?: boolean } = {},
  ) => {
    const cleanedQuery = nextQuery.trim()
    const requestId = ++catalogRequestId.current
    if (options.syncInputs) {
      setQuery(cleanedQuery)
      setType(nextType)
    }
    if (options.writeRoute) {
      writeCatalogRouteState(
        {
          query: cleanedQuery.length >= 2 ? cleanedQuery : '',
          type: nextType,
        },
        options.historyMode ?? 'push',
      )
    }
    setLoading(true)
    setStatus(undefined)
    try {
      const currentLibrary = libraryRef.current
      const nextCandidates =
        cleanedQuery.length >= 2
          ? (await currentLibrary.searchPublicCatalog(cleanedQuery, nextType)).map(currentLibrary.publicItemToDiscovery)
          : nextType === 'any'
            ? (await currentLibrary.listPublicCatalog()).map(currentLibrary.publicItemToDiscovery)
            : (await currentLibrary.searchPublicCatalog('', nextType)).map(currentLibrary.publicItemToDiscovery)
      if (requestId !== catalogRequestId.current) return
      const nextVisibleCount = Math.min(catalogPublicPageSize, nextCandidates.length)
      const nextResultLabel = cleanedQuery.length >= 2 ? 'resultados para explorar' : 'obras del catalogo'

      setCandidates(nextCandidates)
      setVisibleLimit(catalogPublicPageSize)
      setCatalogResultLabel(nextResultLabel)
      setStatus(
        nextCandidates.length
          ? formatCatalogVisibleStatus(nextVisibleCount, nextCandidates.length, nextResultLabel, isSignedIn)
          : 'Sin resultados en el catalogo publico.',
      )
      if (isSignedIn && cleanedQuery.length >= 2 && nextCandidates.length) {
        onActivity({
          detail: `${nextCandidates.length} resultados para "${cleanedQuery}"`,
          label: 'Catalogo explorado',
          tab: 'catalog',
          tone: 'success',
        })
      }
    } catch (reason) {
      if (requestId !== catalogRequestId.current) return
      setCandidates([])
      setStatus(reason instanceof Error ? reason.message : 'No se pudo buscar en el catalogo.')
    } finally {
      if (requestId === catalogRequestId.current) setLoading(false)
    }
  }, [isSignedIn, onActivity])

  useEffect(() => {
    const routeState = readCatalogRouteState()
    const timeoutId = window.setTimeout(() => {
      void runCatalogRequest(routeState.query, routeState.type)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [isSignedIn, library.loading, runCatalogRequest])

  useEffect(() => {
    function syncCatalogFromUrl() {
      const searchParams = new URLSearchParams(window.location.search)
      const routedTab = searchParams.get('tab')
      if (searchParams.get('item') || (routedTab && routedTab !== 'catalog')) return

      const routeState = readCatalogRouteState()
      void runCatalogRequest(routeState.query, routeState.type, { syncInputs: true })
    }

    window.addEventListener('popstate', syncCatalogFromUrl)
    return () => window.removeEventListener('popstate', syncCatalogFromUrl)
  }, [runCatalogRequest])

  function submitCatalogSearch() {
    void runCatalogRequest(query, type, { syncInputs: true, writeRoute: true })
  }

  function changeCatalogType(nextType: ExplorerSearchType) {
    setType(nextType)
    void runCatalogRequest(query, nextType, { syncInputs: true, writeRoute: true })
  }

  function clearCatalogSearch() {
    void runCatalogRequest('', 'any', { syncInputs: true, writeRoute: true })
  }

  async function saveCandidate(candidate: DiscoveryCandidate) {
    if (!isSignedIn) {
      setStatus('Entra en Nexo para guardar obras en tu biblioteca.')
      onSignIn()
      return
    }
    const savedItem = getSavedLibraryItemForCandidate(candidate, library.items)
    if (savedItem) {
      setStatus(`${candidate.title} ya esta en tu Biblioteca.`)
      return
    }

    setStatus(`Guardando ${candidate.title}...`)
    try {
      const item = await library.saveDiscoveryToLibrary(candidate, {
        persistDiscoveryCandidate: false,
        registerPublicCatalog: false,
      })
      setStatus(`${item.title} guardado en Biblioteca.`)
      onActivity({
        detail: item.title,
        label: 'Guardado desde Catalogo',
        tab: 'catalog',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo guardar la obra.')
    }
  }

  async function queueCandidate(candidate: DiscoveryCandidate) {
    if (!isSignedIn) {
      setStatus('Entra en Nexo para mandar hallazgos al Explorador.')
      onSignIn()
      return
    }

    const queuedCount = await library.queueDiscoveryCandidates([candidate])
    setStatus(queuedCount ? `${candidate.title} enviado al Explorador.` : `${candidate.title} ya estaba en tu Explorador.`)
    onNavigate('explorer')
  }

  function showMoreCandidates() {
    const nextVisibleLimit = Math.min(visibleLimit + catalogPublicPageSize, candidates.length)
    setVisibleLimit(nextVisibleLimit)
    setStatus(formatCatalogVisibleStatus(nextVisibleLimit, candidates.length, catalogResultLabel, isSignedIn))
  }

  return (
    <section className={showCatalogRail ? 'catalog-public-layout' : 'catalog-public-layout no-rail'} aria-label="Catalogo publico de Nexo">
      <div className="catalog-public-main">
        <section className="catalog-public-hero" data-testid="catalog-public-masthead">
          <div className="catalog-public-heading">
            <span className="eyebrow">Catalogo publico</span>
            <h2>Catalogo Nexo</h2>
            <p>Explora obras publicas y guarda las que quieras llevar a tu biblioteca.</p>
          </div>
          <form
            className={hasActiveCatalogRoute ? 'catalog-public-search has-clear' : 'catalog-public-search'}
            onSubmit={(event) => {
              event.preventDefault()
              submitCatalogSearch()
            }}
          >
            <label className="search-field catalog-public-query">
              <Search size={16} />
              <input
                aria-label="Buscar en el catalogo publico"
                placeholder="Buscar obra, saga, autor o juego"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Tipo de obra"
              value={type}
              onChange={(event) => {
                const nextType = event.target.value as ExplorerSearchType
                changeCatalogType(nextType)
              }}
            >
              {libraryCatalogSearchTypes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="primary-button" type="submit" disabled={loading}>
              <Search size={16} />
              {loading ? 'Buscando' : 'Buscar'}
            </button>
            {hasActiveCatalogRoute && (
              <button
                aria-label="Limpiar busqueda del catalogo"
                className="icon-button catalog-public-clear"
                disabled={loading}
                title="Limpiar busqueda"
                type="button"
                onClick={clearCatalogSearch}
              >
                <X size={17} />
              </button>
            )}
          </form>
          <div className="catalog-public-summary" aria-label="Resumen del catalogo">
            <span>{formatCatalogCompactCount(visibleCandidates.length, candidates.length)}</span>
            <span>{getCatalogTypeSummary(type)}</span>
            {visibleSavedCount > 0 && (
              <span>{formatCatalogSavedSummary(visibleSavedCount)}</span>
            )}
          </div>
        </section>

        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}

        {candidates.length ? (
          <>
            <div className="catalog-public-grid" aria-label="Resultados del catalogo">
              {visibleCandidates.map((candidate, index) => (
                <CatalogPublicCard
                  candidate={candidate}
                  isSaved={isCandidateSaved(candidate)}
                  key={candidate.id}
                  onDetails={() => setSelectedCandidate(candidate)}
                  onQueue={() => void queueCandidate(candidate)}
                  onSave={() => void saveCandidate(candidate)}
                  showAdAfter={index > 0 && (index + 1) % 10 === 0}
                />
              ))}
            </div>
            {hasMoreCandidates && (
              <div className="catalog-public-load-more" aria-label="Mas resultados del catalogo">
                <span>{formatCatalogVisibleStatus(visibleCandidates.length, candidates.length, catalogResultLabel, isSignedIn)}</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={showMoreCandidates}
                >
                  <Sparkles size={16} />
                  Mostrar mas
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            action={
              <button className="secondary-button" type="button" onClick={submitCatalogSearch}>
                <Sparkles size={16} />
                Recargar catalogo
              </button>
            }
            detail="Prueba una busqueda o vuelve a cargar las fichas publicas disponibles."
            title="Catalogo en blanco"
          />
        )}
      </div>

      {showCatalogRail && (
        <aside className="catalog-public-rail" aria-label="Acciones del catalogo">
          {!isSignedIn && (
            <section className="catalog-public-login-panel">
              <LogIn size={18} />
              <div>
                <strong>Guarda tu ruta</strong>
                <p>El catalogo se puede mirar sin cuenta. Guardar, decidir y recomendar requiere iniciar sesion.</p>
              </div>
              <button className="primary-button" type="button" onClick={onSignIn}>
                <LogIn size={16} />
                Entrar
              </button>
            </section>
          )}
          <AdSlot label="Rail catalogo" />
        </aside>
      )}

      {selectedCandidate && (
        <CatalogPublicDialog
          candidate={selectedCandidate}
          isSaved={isCandidateSaved(selectedCandidate)}
          isSignedIn={isSignedIn}
          onClose={() => setSelectedCandidate(undefined)}
          onQueue={() => void queueCandidate(selectedCandidate)}
          onSave={() => void saveCandidate(selectedCandidate)}
          onSignIn={onSignIn}
        />
      )}
    </section>
  )
}

function getCatalogTypeSummary(type: ExplorerSearchType) {
  if (type === 'any') return 'Todo'
  if (type === 'watch') return 'Ver'
  return typeLabels[type]
}

function formatCatalogVisibleStatus(visibleCount: number, totalCount: number, label: string, canTrustTotal: boolean) {
  if (canTrustTotal || totalCount < catalogPublicPageSize) {
    return `Mostrando ${visibleCount} de ${totalCount} ${label}.`
  }
  return `Mostrando ${visibleCount} ${label}.`
}

function formatCatalogCompactCount(visibleCount: number, totalCount: number) {
  return `${visibleCount} de ${totalCount}`
}

function formatCatalogSavedSummary(savedCount: number) {
  return `${savedCount} guardada${savedCount === 1 ? '' : 's'}`
}

function CatalogPublicCard({
  candidate,
  isSaved,
  onDetails,
  onQueue,
  onSave,
  showAdAfter,
}: {
  candidate: DiscoveryCandidate
  isSaved: boolean
  onDetails: () => void
  onQueue: () => void
  onSave: () => void
  showAdAfter: boolean
}) {
  const effortSignal = getDiscoveryCandidateEffortSignal(candidate)
  const metaParts = [typeLabels[candidate.type], candidate.releaseYear?.toString(), effortSignal].filter(
    (part): part is string => Boolean(part),
  )
  const visibleGenre = candidate.genres[0]
  const hiddenGenreCount = Math.max(0, candidate.genres.length - 1)

  return (
    <>
      <article className={isSaved ? 'catalog-public-card saved' : 'catalog-public-card'}>
        <button className="catalog-public-card-main" type="button" onClick={onDetails}>
          <span className="catalog-public-cover">
            <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
            <span className="source-pill catalog-public-source-badge">{sourceLabels[candidate.source]}</span>
          </span>
          <span className="catalog-public-card-body">
            <span className="catalog-public-card-meta">
              {metaParts.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </span>
            <h3>{candidate.title}</h3>
            {visibleGenre && (
              <span className="tag-row catalog-public-tags">
                <span>{visibleGenre}</span>
                {hiddenGenreCount > 0 && <span>+{hiddenGenreCount}</span>}
              </span>
            )}
          </span>
        </button>
        <div className="catalog-public-actions" aria-label={`Acciones ${candidate.title}`}>
          <button className={isSaved ? 'secondary-button saved' : 'primary-button'} disabled={isSaved} type="button" onClick={onSave}>
            {isSaved ? <Check size={16} /> : <Plus size={16} />}
            {isSaved ? 'Guardado' : 'Guardar'}
          </button>
          <button className="icon-button catalog-public-icon-action" type="button" onClick={onQueue} aria-label="Explorar" title="Explorar">
            <Library size={16} />
          </button>
          <button className="icon-button catalog-public-icon-action catalog-public-details-button" type="button" onClick={onDetails} aria-label="Ver ficha" title="Ver ficha">
            <Eye size={17} />
          </button>
        </div>
      </article>
      {showAdAfter && <AdSlot label="Entre resultados" />}
    </>
  )
}

function CatalogPublicDialog({
  candidate,
  isSaved,
  isSignedIn,
  onClose,
  onQueue,
  onSave,
  onSignIn,
}: {
  candidate: DiscoveryCandidate
  isSaved: boolean
  isSignedIn: boolean
  onClose: () => void
  onQueue: () => void
  onSave: () => void
  onSignIn: () => void
}) {
  const effortSignal = getDiscoveryCandidateEffortSignal(candidate)

  return (
    <div className="modal-backdrop" role="presentation">
      <DialogFocusReturn />
      <section
        aria-labelledby="catalog-public-dialog-title"
        aria-modal="true"
        className="detail-dialog catalog-public-dialog"
        role="dialog"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <button className="icon-button dialog-close" type="button" autoFocus onClick={onClose} title="Cerrar">
          <X size={18} />
        </button>
        <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
        <div className="detail-body">
          <div className="detail-meta">
            <span className="source-pill">{sourceLabels[candidate.source]}</span>
            <span>{typeLabels[candidate.type]}</span>
            {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
            {effortSignal && <span>{effortSignal}</span>}
          </div>
          <h2 id="catalog-public-dialog-title">{candidate.title}</h2>
          <p>{candidate.overview || 'Esta ficha todavia no tiene descripcion publica.'}</p>
          <div className="tag-row">
            {candidate.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <div className="catalog-public-dialog-note">
            <CheckCircle2 size={16} />
            <span>
              {isSaved
                ? 'Esta ficha ya esta guardada en tu Biblioteca.'
                : isSignedIn
                  ? 'Tu sesion permite guardar esta obra o mandarla al Explorador.'
                  : 'Inicia sesion para convertir esta ficha publica en una entrada privada.'}
            </span>
          </div>
          <div className="action-row detail-actions">
            <button
              className={isSaved ? 'secondary-button saved' : 'primary-button'}
              disabled={isSaved}
              type="button"
              onClick={isSignedIn ? onSave : onSignIn}
            >
              {isSaved ? <Check size={16} /> : isSignedIn ? <Plus size={16} /> : <LogIn size={16} />}
              {isSaved ? 'Guardado' : isSignedIn ? 'Guardar en Biblioteca' : 'Entrar para guardar'}
            </button>
            <button className="secondary-button" type="button" onClick={isSignedIn ? onQueue : onSignIn}>
              <Library size={16} />
              {isSignedIn ? 'Mandar al Explorador' : 'Explorar con cuenta'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function AdSlot({ label }: { label: string }) {
  if (!adsEnabled) {
    return (
      <aside className="ad-slot placeholder" aria-label={`${label}: espacio publicitario desactivado`}>
        <span>Anuncio</span>
        <strong>Espacio reservado</strong>
      </aside>
    )
  }

  return (
    <aside className="ad-slot" aria-label={`${label}: anuncio`}>
      <span>Anuncio</span>
      <ins className="adsbygoogle" data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  )
}
