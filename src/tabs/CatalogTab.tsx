import { type DiscoveryCandidate, type ExplorerSearchType } from '../domain/types'
import { discoverySourceLabels as sourceLabels } from '../lib/explorerInsights'
import { getDiscoveryCandidateEffortSignal, itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { CheckCircle2, Eye, Library, LogIn, Plus, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  CoverArt,
  DialogFocusReturn,
  EmptyState,
  FeedbackMessage,
  feedbackToneFromText,
  handleDialogKeyDown,
  libraryCatalogSearchTypes,
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

export default function CatalogTab({ isSignedIn, library, onActivity, onNavigate, onSignIn }: CatalogTabProps) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ExplorerSearchType>('any')
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<DiscoveryCandidate | undefined>()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const publicCount = useMemo(() => candidates.filter((candidate) => candidate.source === 'nexo').length, [candidates])

  useEffect(() => {
    let disposed = false

    async function loadCatalog() {
      setLoading(true)
      try {
        const publicItems = await library.listPublicCatalog()
        if (disposed) return
        const initialCandidates = publicItems.map(library.publicItemToDiscovery).slice(0, 24)
        setCandidates(initialCandidates)
        setStatus(
          initialCandidates.length
            ? `${initialCandidates.length} obras del catalogo listas para explorar.`
            : 'El catalogo publico esta esperando sus primeras obras.',
        )
      } catch (reason) {
        if (!disposed) {
          setStatus(reason instanceof Error ? reason.message : 'No se pudo cargar el catalogo publico.')
        }
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void loadCatalog()
    return () => {
      disposed = true
    }
  }, [library])

  async function searchCatalog() {
    const cleanedQuery = query.trim()
    setLoading(true)
    setStatus(undefined)
    try {
      const nextCandidates =
        cleanedQuery.length >= 2
          ? (await library.searchPublicCatalog(cleanedQuery, type)).map(library.publicItemToDiscovery).slice(0, 24)
          : (await library.listPublicCatalog()).map(library.publicItemToDiscovery).slice(0, 24)

      setCandidates(nextCandidates)
      setStatus(
        nextCandidates.length
          ? `${nextCandidates.length} resultado${nextCandidates.length === 1 ? '' : 's'} para explorar.`
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
      setCandidates([])
      setStatus(reason instanceof Error ? reason.message : 'No se pudo buscar en el catalogo.')
    } finally {
      setLoading(false)
    }
  }

  async function saveCandidate(candidate: DiscoveryCandidate) {
    if (!isSignedIn) {
      setStatus('Entra con Google para guardar obras en tu biblioteca.')
      onSignIn()
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
      setStatus('Entra con Google para mandar hallazgos al Explorador.')
      onSignIn()
      return
    }

    const queuedCount = await library.queueDiscoveryCandidates([candidate])
    setStatus(queuedCount ? `${candidate.title} enviado al Explorador.` : `${candidate.title} ya estaba en tu Explorador.`)
    onNavigate('explorer')
  }

  return (
    <section className="catalog-public-layout" aria-label="Catalogo publico de Nexo">
      <div className="catalog-public-main">
        <section className="catalog-public-hero">
          <div className="catalog-public-heading">
            <span className="eyebrow">Catalogo Nexo</span>
            <h2>Explora obras antes de montar tu biblioteca</h2>
            <p>
              Busca en el catalogo publico, descubre fichas de Nexo y prueba las acciones que se vuelven personales al iniciar sesion.
            </p>
          </div>
          <form
            className="catalog-public-search"
            onSubmit={(event) => {
              event.preventDefault()
              void searchCatalog()
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
              onChange={(event) => setType(event.target.value as ExplorerSearchType)}
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
          </form>
          <div className="catalog-public-summary" aria-label="Resumen del catalogo">
            <span>
              <strong>{publicCount}</strong>
              <small>Nexo</small>
            </span>
            <span>
              <strong>{getCatalogTypeSummary(type)}</strong>
              <small>Filtro</small>
            </span>
            <span>
              <strong>{isSignedIn ? 'Activa' : 'Vista'}</strong>
              <small>{isSignedIn ? 'Biblioteca conectada' : 'Acciones con login'}</small>
            </span>
          </div>
        </section>

        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}

        {candidates.length ? (
          <div className="catalog-public-grid" aria-label="Resultados del catalogo">
            {candidates.map((candidate, index) => (
              <CatalogPublicCard
                candidate={candidate}
                key={candidate.id}
                onDetails={() => setSelectedCandidate(candidate)}
                onQueue={() => void queueCandidate(candidate)}
                onSave={() => void saveCandidate(candidate)}
                showAdAfter={index > 0 && (index + 1) % 10 === 0}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <button className="secondary-button" type="button" onClick={() => void searchCatalog()}>
                <Sparkles size={16} />
                Recargar catalogo
              </button>
            }
            detail="Prueba una busqueda o vuelve a cargar las fichas publicas disponibles."
            title="Catalogo en blanco"
          />
        )}
      </div>

      <aside className="catalog-public-rail" aria-label="Acciones del catalogo">
        <section className="catalog-public-login-panel">
          <LogIn size={18} />
          <div>
            <strong>{isSignedIn ? 'Biblioteca conectada' : 'Guarda tu ruta'}</strong>
            <p>
              {isSignedIn
                ? 'Puedes guardar obras, enviarlas al Explorador y convertir el catalogo en una lista privada.'
                : 'El catalogo se puede mirar sin cuenta. Guardar, decidir y recomendar requiere iniciar sesion.'}
            </p>
          </div>
          {!isSignedIn && (
            <button className="primary-button" type="button" onClick={onSignIn}>
              <LogIn size={16} />
              Entrar
            </button>
          )}
        </section>
        <AdSlot label="Rail catalogo" />
      </aside>

      {selectedCandidate && (
        <CatalogPublicDialog
          candidate={selectedCandidate}
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

function CatalogPublicCard({
  candidate,
  onDetails,
  onQueue,
  onSave,
  showAdAfter,
}: {
  candidate: DiscoveryCandidate
  onDetails: () => void
  onQueue: () => void
  onSave: () => void
  showAdAfter: boolean
}) {
  const effortSignal = getDiscoveryCandidateEffortSignal(candidate)

  return (
    <>
      <article className="catalog-public-card">
        <button className="catalog-public-card-main" type="button" onClick={onDetails}>
          <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
          <div>
            <div className="candidate-meta">
              <span className="source-pill">{sourceLabels[candidate.source]}</span>
              <span>{typeLabels[candidate.type]}</span>
              {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
              {effortSignal && <span>{effortSignal}</span>}
            </div>
            <h3>{candidate.title}</h3>
            <p>{candidate.overview || `${typeLabels[candidate.type]} en ${sourceLabels[candidate.source]}.`}</p>
            <div className="tag-row">
              {candidate.genres.slice(0, 3).map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
          </div>
        </button>
        <div className="catalog-public-actions" aria-label={`Acciones ${candidate.title}`}>
          <button className="primary-button" type="button" onClick={onSave}>
            <Plus size={16} />
            Guardar
          </button>
          <button className="secondary-button" type="button" onClick={onQueue}>
            <Library size={16} />
            Explorar
          </button>
          <button className="icon-button" type="button" onClick={onDetails} title="Ver ficha">
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
  isSignedIn,
  onClose,
  onQueue,
  onSave,
  onSignIn,
}: {
  candidate: DiscoveryCandidate
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
              {isSignedIn
                ? 'Tu sesion permite guardar esta obra o mandarla al Explorador.'
                : 'Inicia sesion para convertir esta ficha publica en una entrada privada.'}
            </span>
          </div>
          <div className="action-row detail-actions">
            <button className="primary-button" type="button" onClick={isSignedIn ? onSave : onSignIn}>
              {isSignedIn ? <Plus size={16} /> : <LogIn size={16} />}
              {isSignedIn ? 'Guardar en Biblioteca' : 'Entrar para guardar'}
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
