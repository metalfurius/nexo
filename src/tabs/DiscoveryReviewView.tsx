import './DiscoveryReviewView.css'

import { CheckCircle2, Eye, Library, MoreHorizontal, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { DiscoveryCandidate, DiscoveryStatus } from '../domain/types'
import {
  discoveryEmptyCopy,
  discoverySourceLabels,
  discoveryStatusLabels,
  explorerSourceFilters,
  getDiscoveryStatusCounts,
  getExplorerSourceCounts,
  getVisibleExplorerCandidates,
  type ExplorerSourceFilter,
} from '../lib/explorerInsights'
import { itemTypeLabels } from '../lib/libraryItemInsights'
import { CoverArt, EmptyState } from '../app/shared'
import { useEffect, useRef } from 'react'

interface DiscoveryReviewViewProps {
  candidates: DiscoveryCandidate[]
  isModerator: boolean
  pendingCandidateIds: ReadonlySet<string>
  sourceFilter: ExplorerSourceFilter
  view: DiscoveryStatus
  onCurate: (candidate: DiscoveryCandidate) => void
  onDetails: (candidate: DiscoveryCandidate) => void
  onDismiss: (candidate: DiscoveryCandidate) => Promise<boolean>
  onRestore: (candidate: DiscoveryCandidate) => Promise<boolean>
  onSave: (candidate: DiscoveryCandidate) => Promise<boolean>
  onSourceFilterChange: (filter: ExplorerSourceFilter) => void
  onViewChange: (view: DiscoveryStatus) => void
}

const reviewStatusLabels: Record<DiscoveryStatus, string> = {
  queued: 'Por revisar',
  saved: 'Guardados',
  dismissed: 'Descartados',
}

function ReviewCard({
  candidate,
  isModerator,
  pending,
  onCurate,
  onDetails,
  onDismiss,
  onRestore,
  onSave,
}: {
  candidate: DiscoveryCandidate
  isModerator: boolean
  pending: boolean
  onCurate: () => void
  onDetails: () => void
  onDismiss: () => Promise<boolean>
  onRestore: () => Promise<boolean>
  onSave: () => Promise<boolean>
}) {
  const isQueued = candidate.status === 'queued'
  const isDismissed = candidate.status === 'dismissed'
  const genres = candidate.genres.slice(0, 2)
  const catalogActionLabel = candidate.source === 'nexo' ? 'Editar catálogo' : 'Crear ficha en catálogo'
  const overflowRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      if (!overflowRef.current?.open || overflowRef.current.contains(event.target as Node)) return
      overflowRef.current.open = false
    }

    function closeFromEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !overflowRef.current?.open) return
      overflowRef.current.open = false
      overflowRef.current.querySelector('summary')?.focus()
    }

    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromEscape)
    }
  }, [])

  return (
    <article className="review-card" aria-busy={pending || undefined} data-status={candidate.status}>
      <button
        aria-label={`Abrir ficha ${candidate.title}`}
        className="review-card-cover"
        disabled={pending}
        type="button"
        onClick={onDetails}
      >
        <CoverArt title={candidate.title} type={candidate.type} posterUrl={candidate.posterUrl} />
      </button>

      <div className="review-card-body">
        <div className="review-card-meta">
          <span className="source-pill">{discoverySourceLabels[candidate.source]}</span>
          <span>{itemTypeLabels[candidate.type]}</span>
          {candidate.releaseYear && <span>{candidate.releaseYear}</span>}
          {!isQueued && <span className={`candidate-status ${candidate.status}`}>{discoveryStatusLabels[candidate.status]}</span>}
        </div>
        <h3 title={candidate.title}>{candidate.title}</h3>
        <p>{candidate.overview || `${itemTypeLabels[candidate.type]} para descubrir`}</p>
        {genres.length > 0 && (
          <div className="review-card-genres" role="group" aria-label={`Géneros: ${candidate.genres.join(', ')}`}>
            {genres.map((genre) => <span key={genre}>{genre}</span>)}
          </div>
        )}
      </div>

      <div className="review-card-actions" role="group" aria-label={`Acciones para ${candidate.title}`}>
        {isQueued && (
          <button aria-label={`Guardar en Biblioteca ${candidate.title}`} className="review-card-primary" disabled={pending} type="button" onClick={() => void onSave()}>
            <Library size={17} />
            {pending ? 'Guardando…' : 'Guardar en Biblioteca'}
          </button>
        )}
        {isDismissed && (
          <button aria-label={`Recuperar ${candidate.title}`} className="review-card-primary secondary" disabled={pending} type="button" onClick={() => void onRestore()}>
            <RotateCcw size={17} />
            {pending ? 'Recuperando…' : 'Recuperar'}
          </button>
        )}
        <button aria-label={`Ver ficha ${candidate.title}`} className="review-card-secondary" disabled={pending} type="button" onClick={onDetails}>
          <Eye size={17} />
          Ver ficha
        </button>
        {isQueued && (
          <button
            aria-label={`Descartar ${candidate.title}`}
            className="review-card-secondary danger"
            disabled={pending}
            title="Descartar"
            type="button"
            onClick={() => void onDismiss()}
          >
            <X size={18} />
            Descartar
          </button>
        )}
        {isModerator && (
          <details className="review-card-overflow" ref={overflowRef}>
            <summary
              aria-label={`Más acciones para ${candidate.title}`}
              aria-disabled={pending || undefined}
              role="button"
              title="Más acciones"
              onClick={(event) => {
                if (pending) event.preventDefault()
              }}
            >
              <MoreHorizontal size={18} />
            </summary>
            <div>
              <button aria-label={`${catalogActionLabel} ${candidate.title}`} disabled={pending} type="button" onClick={() => {
                if (overflowRef.current) overflowRef.current.open = false
                onCurate()
              }}>
                <ShieldCheck size={16} />
                {catalogActionLabel}
              </button>
            </div>
          </details>
        )}
      </div>
    </article>
  )
}

export default function DiscoveryReviewView({
  candidates,
  isModerator,
  pendingCandidateIds,
  sourceFilter,
  view,
  onCurate,
  onDetails,
  onDismiss,
  onRestore,
  onSave,
  onSourceFilterChange,
  onViewChange,
}: DiscoveryReviewViewProps) {
  const counts = getDiscoveryStatusCounts(candidates)
  const candidatesInView = candidates.filter((candidate) => candidate.status === view)
  const sourceCounts = getExplorerSourceCounts(candidatesInView)
  const visibleCandidates = getVisibleExplorerCandidates(candidatesInView, sourceFilter)
  const activeSource = explorerSourceFilters.find((filter) => filter.id === sourceFilter)
  const isSourceFilteredEmpty = sourceFilter !== 'all' && candidatesInView.length > 0 && visibleCandidates.length === 0

  return (
    <section className="discovery-review" aria-labelledby="discovery-review-title">
      <header className="discovery-review-header">
        <div>
          <span className="eyebrow">Tu bandeja</span>
          <h2 id="discovery-review-title">Hallazgos por revisar</h2>
          <p>Guarda en tu Biblioteca lo que te interese o descarta el resto.</p>
        </div>
      </header>

      <div className="discovery-review-controls">
        <div className="discovery-review-tabs" role="group" aria-label="Estado de los hallazgos">
          {(['queued', 'saved', 'dismissed'] as const).map((status) => (
            <button
              aria-label={`${reviewStatusLabels[status]}, ${counts[status]}`}
              aria-pressed={view === status}
              className={view === status ? 'active' : undefined}
              key={status}
              type="button"
              onClick={() => onViewChange(status)}
            >
              <span>{reviewStatusLabels[status]}</span>
              <strong>{counts[status]}</strong>
            </button>
          ))}
        </div>

        <label className="discovery-review-source">
          <span>Origen</span>
          <select value={sourceFilter} onChange={(event) => onSourceFilterChange(event.target.value as ExplorerSourceFilter)}>
            {explorerSourceFilters.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label} ({sourceCounts[filter.id]})
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleCandidates.length > 0 ? (
        <div className="discovery-review-grid" aria-live="polite">
          {visibleCandidates.map((candidate) => (
            <ReviewCard
              candidate={candidate}
              isModerator={isModerator}
              key={candidate.id}
              pending={pendingCandidateIds.has(candidate.id)}
              onCurate={() => onCurate(candidate)}
              onDetails={() => onDetails(candidate)}
              onDismiss={() => onDismiss(candidate)}
              onRestore={() => onRestore(candidate)}
              onSave={() => onSave(candidate)}
            />
          ))}
        </div>
      ) : (
        <div className="discovery-review-empty">
          <EmptyState
            icon={view === 'queued' ? Sparkles : view === 'saved' ? CheckCircle2 : X}
            tone={view === 'dismissed' ? 'muted' : 'neutral'}
            title={isSourceFilteredEmpty ? `Sin hallazgos de ${activeSource?.label ?? 'este origen'}` : discoveryEmptyCopy[view].title}
            detail={
              isSourceFilteredEmpty
                ? 'Prueba con otro origen o vuelve a mostrar todos.'
                : view === 'queued'
                  ? 'Busca una obra o usa Sorpréndeme. Los resultados que quieras pensar aparecerán aquí.'
                  : discoveryEmptyCopy[view].detail
            }
            action={
              isSourceFilteredEmpty ? (
                <button className="secondary-button" type="button" onClick={() => onSourceFilterChange('all')}>
                  Mostrar todos
                </button>
              ) : undefined
            }
          />
        </div>
      )}
    </section>
  )
}
