import './HomeTab.css'

import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Dice5,
  Ellipsis,
  EyeOff,
  ListPlus,
  Map,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemStatus, ListItem, RoadmapLane, RoadmapMutation } from '../domain/types'
import {
  cloneRoadmapPreferences,
  deriveRoadmap,
  hideRoadmapItem,
  moveRoadmapItem,
  reorderRoadmapItem,
  resetRoadmapItemToAutomatic,
  transitionRoadmapItem,
  type RoadmapEntry,
} from '../lib/roadmap'
import { formatProgress, itemStatusLabels, itemTypeLabels } from '../lib/libraryItemInsights'
import {
  CoverArt,
  SessionActivityPanel,
  getPosterBackplateStyle,
  type ActivityFocus,
  type ActivityRecorder,
  type AppTab,
  type LibrarySurface,
} from '../app/shared'
import { buildHomeJourneyModel, type HomeJourneyExpandableLane } from './homeJourney'
import { useRoadmapFlip } from './useRoadmapFlip'

interface HomeTabProps {
  activityClearCount: number
  library: LibrarySurface
  onActivity: ActivityRecorder
  onAdd: () => void
  onClearActivity: () => void
  onNavigate: (tab: AppTab, focus?: ActivityFocus) => void
  onOpenItem: (item: ListItem) => void
  onRollDice: (scope: 'roadmap-next' | 'all') => void
  onUndoClearActivity: () => void
}

const laneMeta: Record<RoadmapLane, { index: string; title: string; detail: string }> = {
  now: { index: '01', title: 'Ahora', detail: 'Lo que ya está en marcha' },
  next: { index: '02', title: 'Después', detail: 'Tu siguiente decisión' },
  later: { index: '03', title: 'Más adelante', detail: 'Sin perderlo de vista' },
}

function readJourneyViewport() {
  if (window.matchMedia('(max-width: 767px)').matches) return 'compact' as const
  if (window.matchMedia('(max-width: 1099px)').matches) return 'tablet' as const
  return 'desktop' as const
}

function useJourneyViewport() {
  const [viewport, setViewport] = useState(readJourneyViewport)
  useEffect(() => {
    const compactQuery = window.matchMedia('(max-width: 767px)')
    const tabletQuery = window.matchMedia('(max-width: 1099px)')
    const sync = () => setViewport(readJourneyViewport())
    compactQuery.addEventListener('change', sync)
    tabletQuery.addEventListener('change', sync)
    return () => {
      compactQuery.removeEventListener('change', sync)
      tabletQuery.removeEventListener('change', sync)
    }
  }, [])
  return viewport
}

function closeRoadmapMenu(target: HTMLElement) {
  const menu = target.closest('details')
  if (menu instanceof HTMLDetailsElement) menu.open = false
}

export default function HomeTab({
  activityClearCount,
  library,
  onActivity,
  onAdd,
  onClearActivity,
  onNavigate,
  onOpenItem,
  onRollDice,
  onUndoClearActivity,
}: HomeTabProps) {
  const roadmap = useMemo(
    () => deriveRoadmap(library.items, library.settings.roadmap),
    [library.items, library.settings.roadmap],
  )
  const [expanded, setExpanded] = useState<Partial<Record<HomeJourneyExpandableLane, boolean>>>({})
  const [activityOpen, setActivityOpen] = useState(false)
  const [status, setStatus] = useState<string>()
  const [undoMutation, setUndoMutation] = useState<RoadmapMutation>()
  const [pendingMutationKey, setPendingMutationKey] = useState<string>()
  const pendingMutationRef = useRef<string | undefined>(undefined)
  const journeyBoardRef = useRef<HTMLElement>(null)
  const viewport = useJourneyViewport()
  const journey = useMemo(
    () => buildHomeJourneyModel({
      expanded,
      items: library.items,
      loading: library.loading,
      roadmap,
      viewport,
    }),
    [expanded, library.items, library.loading, roadmap, viewport],
  )
  const roadmapMotionSignature = (['now', 'next', 'later'] as const)
    .map((lane) => roadmap[lane].map((entry) => entry.item.id).join(','))
    .join('|')
  useRoadmapFlip(journeyBoardRef, roadmapMotionSignature)
  const isPending = Boolean(pendingMutationKey)

  async function apply(mutation: RoadmapMutation, message: string, mutationKey = 'roadmap') {
    if (pendingMutationRef.current) return
    pendingMutationRef.current = mutationKey
    setPendingMutationKey(mutationKey)
    const mutatedItemId = mutation.item
      ? mutation.item.kind === 'restore' || mutation.item.kind === 'upsert'
        ? mutation.item.item.id
        : mutation.item.itemId
      : undefined
    const previousItem = mutatedItemId ? library.items.find((item) => item.id === mutatedItemId) : undefined
    const rollback: RoadmapMutation = {
      roadmap: cloneRoadmapPreferences(library.settings.roadmap),
      ...(mutation.item?.kind === 'status' && previousItem
        ? { item: { kind: 'status' as const, itemId: previousItem.id, status: previousItem.status } }
        : {}),
    }
    try {
      await library.applyRoadmapMutation(mutation)
      setStatus(message)
      setUndoMutation(rollback)
      onActivity({
        detail: message,
        label: 'Tu ruta actualizada',
        tab: 'home',
        ...(mutatedItemId ? { target: { kind: 'item' as const, id: mutatedItemId } } : {}),
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar Tu ruta.')
    } finally {
      pendingMutationRef.current = undefined
      setPendingMutationKey(undefined)
    }
  }

  async function undoLastMutation() {
    if (!undoMutation || pendingMutationRef.current) return
    const rollback = undoMutation
    pendingMutationRef.current = 'undo'
    setPendingMutationKey('undo')
    setUndoMutation(undefined)
    try {
      await library.applyRoadmapMutation(rollback)
      setStatus('Cambio deshecho')
      onActivity({
        detail: 'Se restauró el estado y la posición anteriores.',
        label: 'Cambio deshecho',
        tab: 'home',
        tone: 'success',
      })
    } catch (reason) {
      setUndoMutation(rollback)
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el cambio.')
    } finally {
      pendingMutationRef.current = undefined
      setPendingMutationKey(undefined)
    }
  }

  function mutationForMove(entry: RoadmapEntry, lane: RoadmapLane): RoadmapMutation {
    const roadmapPreferences = moveRoadmapItem(library.settings.roadmap, entry.item.id, lane)
    let statusMutation: RoadmapMutation['item']
    if (lane === 'now' && entry.item.status !== 'in_progress') {
      statusMutation = { kind: 'status', itemId: entry.item.id, status: 'in_progress' }
    } else if (entry.lane === 'now' && lane !== 'now') {
      statusMutation = { kind: 'status', itemId: entry.item.id, status: 'wishlist' }
    }
    return { roadmap: roadmapPreferences, ...(statusMutation ? { item: statusMutation } : {}) }
  }

  function roadmapForReorder(entry: RoadmapEntry, lane: RoadmapLane, direction: 'up' | 'down') {
    if (entry.placement === 'manual') {
      return reorderRoadmapItem(library.settings.roadmap, lane, entry.item.id, direction)
    }

    const materialized = roadmap[lane].reduce(
      (preferences, current, targetIndex) => moveRoadmapItem(preferences, current.item.id, lane, targetIndex),
      library.settings.roadmap,
    )
    return reorderRoadmapItem(materialized, lane, entry.item.id, direction)
  }

  function transition(item: ListItem, nextStatus: ItemStatus, message: string) {
    void apply(transitionRoadmapItem(library.settings.roadmap, item.id, nextStatus), message, item.id)
  }

  function renderRoadmapMenu(entry: RoadmapEntry, lane: RoadmapLane) {
    const entries = roadmap[lane]
    const index = entries.findIndex((candidate) => candidate.item.id === entry.item.id)
    const run = (target: HTMLElement, mutation: RoadmapMutation, message: string) => {
      closeRoadmapMenu(target)
      void apply(mutation, message, entry.item.id)
    }

    return (
      <details
        className="roadmap-card-menu"
        data-close-on-outside
        onToggle={(event) => {
          if (isPending && event.currentTarget.open) event.currentTarget.open = false
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.currentTarget.open = false
          event.currentTarget.querySelector('summary')?.focus()
        }}
      >
        <summary
          aria-label={`Organizar ${entry.item.title}`}
          aria-disabled={isPending || undefined}
          onClick={(event) => {
            if (isPending) event.preventDefault()
          }}
        >
          <Ellipsis size={18} aria-hidden="true" />
        </summary>
        <div>
          {(['now', 'next', 'later'] as const).filter((target) => target !== lane).map((target) => (
            <button
              disabled={isPending}
              key={target}
              type="button"
              onClick={(event) => run(
                event.currentTarget,
                mutationForMove(entry, target),
                `${entry.item.title} pasa a ${laneMeta[target].title}`,
              )}
            >
              Mover a {laneMeta[target].title}
            </button>
          ))}
          <button
            disabled={isPending || index <= 0}
            type="button"
            onClick={(event) => run(
              event.currentTarget,
              { roadmap: roadmapForReorder(entry, lane, 'up') },
              `${entry.item.title} sube en la ruta`,
            )}
          >
            <ChevronUp size={14} />Subir
          </button>
          <button
            disabled={isPending || index < 0 || index === entries.length - 1}
            type="button"
            onClick={(event) => run(
              event.currentTarget,
              { roadmap: roadmapForReorder(entry, lane, 'down') },
              `${entry.item.title} baja en la ruta`,
            )}
          >
            <ChevronDown size={14} />Bajar
          </button>
          {lane === 'now' && (
            <button
              disabled={isPending}
              type="button"
              onClick={(event) => {
                closeRoadmapMenu(event.currentTarget)
                transition(entry.item, 'paused', `${entry.item.title} queda pausada`)
              }}
            >
              <Pause size={14} />Pausar
            </button>
          )}
          <button
            disabled={isPending}
            type="button"
            onClick={(event) => {
              closeRoadmapMenu(event.currentTarget)
              transition(entry.item, 'completed', `${entry.item.title} completada`)
            }}
          >
            <Check size={14} />Completar
          </button>
          {entry.placement === 'manual' && (
            <button
              disabled={isPending}
              type="button"
              onClick={(event) => run(
                event.currentTarget,
                { roadmap: resetRoadmapItemToAutomatic(library.settings.roadmap, entry.item.id) },
                `${entry.item.title} vuelve a automático`,
              )}
            >
              <RotateCcw size={14} />Volver a automático
            </button>
          )}
          <button
            disabled={isPending}
            type="button"
            onClick={(event) => run(
              event.currentTarget,
              { roadmap: hideRoadmapItem(library.settings.roadmap, entry.item.id) },
              `${entry.item.title} se oculta de Tu ruta`,
            )}
          >
            <EyeOff size={14} />Quitar de la ruta
          </button>
        </div>
      </details>
    )
  }

  function renderFeature(entry: RoadmapEntry, lane: 'now' | 'next') {
    const progress = formatProgress(entry.item) || itemStatusLabels[entry.item.status]
    return (
      <article
        className={`roadmap-card journey-feature-card ${entry.item.posterUrl ? 'has-poster' : 'generated-poster'}`}
        aria-busy={pendingMutationKey === entry.item.id || undefined}
        data-pending={pendingMutationKey === entry.item.id || undefined}
        data-roadmap-item-id={entry.item.id}
        style={getPosterBackplateStyle(entry.item.posterUrl)}
      >
        <div className="journey-feature-atmosphere" aria-hidden="true" />
        <button className="roadmap-card-main journey-feature-main" type="button" onClick={() => onOpenItem(entry.item)}>
          <CoverArt
            posterUrl={entry.item.posterUrl}
            presentation="hero"
            priority
            title={entry.item.title}
            type={entry.item.type}
          />
          <span className="journey-feature-copy">
            <small>{lane === 'now' ? 'Ahora' : 'Próximo'} · {itemTypeLabels[entry.item.type]} · {entry.placement === 'automatic' ? 'Sugerido' : 'Fijado'}</small>
            <strong>{entry.item.title}</strong>
            <em>{progress}</em>
          </span>
        </button>
        <div className="roadmap-card-actions journey-feature-actions">
          {lane === 'now' ? (
            <button className="primary-button" disabled={isPending} type="button" onClick={() => onOpenItem(entry.item)}>
              <Play size={16} />Actualizar progreso
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={isPending}
              type="button"
              onClick={() => transition(entry.item, 'in_progress', `${entry.item.title} pasa a Ahora`)}
            >
              <Play size={16} />Empezar ahora
            </button>
          )}
          {renderRoadmapMenu(entry, lane)}
        </div>
      </article>
    )
  }

  function renderNowCompanion(entry: RoadmapEntry) {
    return (
      <article
        aria-busy={pendingMutationKey === entry.item.id || undefined}
        className="roadmap-card now-companion"
        data-pending={pendingMutationKey === entry.item.id || undefined}
        data-roadmap-item-id={entry.item.id}
        key={entry.item.id}
      >
        <button className="roadmap-card-main" type="button" onClick={() => onOpenItem(entry.item)}>
          <CoverArt title={entry.item.title} type={entry.item.type} posterUrl={entry.item.posterUrl} />
          <span>
            <small>{itemTypeLabels[entry.item.type]}</small>
            <strong>{entry.item.title}</strong>
            <em>{formatProgress(entry.item) || itemStatusLabels[entry.item.status]}</em>
          </span>
        </button>
        <div className="roadmap-card-actions">
          {renderRoadmapMenu(entry, 'now')}
        </div>
      </article>
    )
  }

  function renderNextCard(entry: RoadmapEntry) {
    return (
      <article
        aria-busy={pendingMutationKey === entry.item.id || undefined}
        className="roadmap-card atlas-poster-card"
        data-pending={pendingMutationKey === entry.item.id || undefined}
        data-roadmap-item-id={entry.item.id}
        key={entry.item.id}
      >
        <button className="roadmap-card-main" type="button" onClick={() => onOpenItem(entry.item)}>
          <CoverArt title={entry.item.title} type={entry.item.type} posterUrl={entry.item.posterUrl} />
          <span>
            <small>{itemTypeLabels[entry.item.type]} · {entry.placement === 'automatic' ? 'Sugerido' : 'Fijado'}</small>
            <strong>{entry.item.title}</strong>
            <em>{formatProgress(entry.item) || itemStatusLabels[entry.item.status]}</em>
          </span>
        </button>
        <div className="roadmap-card-actions">
          <button
            className="primary-button"
            disabled={isPending}
            type="button"
            onClick={() => transition(entry.item, 'in_progress', `${entry.item.title} pasa a Ahora`)}
          >
            <Play size={15} />Empezar ahora
          </button>
          {renderRoadmapMenu(entry, 'next')}
        </div>
      </article>
    )
  }

  function renderLaterEntry(entry: RoadmapEntry) {
    return (
      <article
        aria-busy={pendingMutationKey === entry.item.id || undefined}
        className={`roadmap-card atlas-timeline-card ${entry.item.posterUrl ? 'has-poster' : 'generated-poster'}`}
        data-pending={pendingMutationKey === entry.item.id || undefined}
        data-roadmap-item-id={entry.item.id}
        key={entry.item.id}
        style={getPosterBackplateStyle(entry.item.posterUrl)}
      >
        <span className="atlas-timeline-node" aria-hidden="true" />
        <button className="roadmap-card-main" type="button" onClick={() => onOpenItem(entry.item)}>
          <CoverArt title={entry.item.title} type={entry.item.type} posterUrl={entry.item.posterUrl} />
          <span>
            <small>{itemTypeLabels[entry.item.type]} · {entry.placement === 'automatic' ? 'Sugerido' : 'Fijado'}</small>
            <strong>{entry.item.title}</strong>
            <em>{formatProgress(entry.item) || itemStatusLabels[entry.item.status]}</em>
          </span>
        </button>
        <div className="roadmap-card-actions">
          <button
            className="secondary-button"
            disabled={isPending}
            type="button"
            onClick={() => void apply(
              mutationForMove(entry, 'next'),
              `${entry.item.title} pasa a Después`,
              entry.item.id,
            )}
          >
            <Clock3 size={15} />Poner después
          </button>
          {renderRoadmapMenu(entry, 'later')}
        </div>
      </article>
    )
  }

  if (journey.status === 'loading') {
    return (
      <section className="home-surface home-loading" aria-busy="true" aria-label="Cargando Tu ruta">
        <div className="home-loading-intro" />
        <div className="home-loading-grid">
          <div /><div /><div />
        </div>
        <span className="sr-only">Preparando tu atlas cultural.</span>
      </section>
    )
  }

  if (!library.items.length) {
    return (
      <section className="home-surface home-empty-atlas">
        <header className="home-atlas-intro empty">
          <div className="home-atlas-title">
            <span className="eyebrow"><Map size={15} />Tu atlas cultural</span>
            <h2>Construye una ruta que apetezca seguir</h2>
            <p>Añade una primera obra. Nexo te ayudará a convertir una lista pendiente en un recorrido con intención.</p>
          </div>
          <button className="primary-button" type="button" onClick={onAdd}>
            <Plus size={18} />Añadir primera obra
          </button>
        </header>
        <section className="home-onboarding" aria-label="Primeros pasos de Nexo">
          <span className="home-onboarding-route" aria-hidden="true" />
          <button type="button" onClick={onAdd}>
            <span className="home-onboarding-index">01</span><ListPlus size={20} />
            <span><strong>Añade</strong><small>Busca, crea o importa tu primera obra</small></span>
          </button>
          <button type="button" onClick={() => onNavigate('discover')}>
            <span className="home-onboarding-index">02</span><Sparkles size={20} />
            <span><strong>Descubre</strong><small>Encuentra historias que encajen contigo</small></span>
          </button>
          <button type="button" disabled>
            <span className="home-onboarding-index">03</span><Dice5 size={20} />
            <span><strong>Decide</strong><small>El Dado se activa con tu biblioteca</small></span>
          </button>
        </section>
      </section>
    )
  }

  const heroKind = journey.hero.kind
  const primaryLaneCount = journey.hero.kind === 'next-chapter' ? 1 : roadmap.now.length
  const primaryLaneLabel = journey.hero.kind === 'next-chapter' ? 'próximo' : 'en curso'
  const lastActivity = library.activityEntries[0]
  return (
    <section className="home-surface" aria-busy={isPending || undefined}>
      <header className="home-route-summary">
        <div className="home-route-counts" aria-label="Resumen de Tu ruta">
          <Map size={18} aria-hidden="true" />
          <span><strong>{primaryLaneCount}</strong> {primaryLaneLabel}</span>
          <span><strong>{journey.next.total}</strong> después</span>
          <span><strong>{roadmap.later.length}</strong> más tarde</span>
        </div>
        <div className="home-hero-actions">
          <button
            className="secondary-button"
            type="button"
            aria-label="Elegir con Dado"
            onClick={() => onRollDice(roadmap.next.length ? 'roadmap-next' : 'all')}
            disabled={isPending}
          >
            <Dice5 size={17} /><span>Elegir</span><span className="sr-only"> con Dado</span>
          </button>
        </div>
        <h2 className="sr-only">Tu ruta</h2>
      </header>

      {(status || isPending) && (
        <div className="home-status" role="status">
          <span>{isPending ? 'Guardando el cambio en tu ruta…' : status}</span>
          {!isPending && undoMutation && <button type="button" onClick={() => void undoLastMutation()}>Deshacer</button>}
        </div>
      )}

      <section ref={journeyBoardRef} className={`roadmap-board home-journey-grid hero-${heroKind}`} aria-label="Tu ruta de obras">
        <section className="roadmap-lane now atlas-now" aria-labelledby="roadmap-now">
          <header className="atlas-section-heading">
            <div><h3 id="roadmap-now">{journey.hero.kind === 'next-chapter' ? 'Próximo' : laneMeta.now.title}</h3></div>
            <strong>{primaryLaneCount}</strong>
          </header>
          {journey.hero.kind === 'current'
            ? renderFeature(journey.hero.entry, 'now')
            : journey.hero.kind === 'next-chapter'
              ? renderFeature(journey.hero.entry, 'next')
              : (
            <div className="atlas-invitation">
              <span className="atlas-invitation-mark"><Map size={23} /></span>
              <div>
                <strong>Elige tu próxima historia</strong>
                <p>Añade una obra o encuentra algo nuevo.</p>
              </div>
              <div className="atlas-invitation-actions">
                <button className="primary-button" type="button" onClick={() => onNavigate('discover')}>
                  <Sparkles size={16} />Descubrir
                </button>
                <button className="secondary-button" type="button" onClick={onAdd}>
                  <Plus size={16} />Añadir
                </button>
              </div>
            </div>
          )}
          {journey.additionalNow.total > 0 && (
            <section className="now-companions" aria-label="También en marcha">
              <header><span>También en marcha</span><strong>{journey.additionalNow.total}</strong></header>
              <div>{journey.additionalNow.visibleEntries.map(renderNowCompanion)}</div>
              {journey.additionalNow.canExpand && (
                <button
                  className="roadmap-expand"
                  type="button"
                  onClick={() => setExpanded((current) => ({ ...current, now: !current.now }))}
                >
                  {journey.additionalNow.expanded ? 'Ver menos' : `Ver ${journey.additionalNow.hiddenCount} más`}
                </button>
              )}
            </section>
          )}
        </section>

        <section className="roadmap-lane next atlas-next" aria-labelledby="roadmap-next">
          <header className="atlas-section-heading">
            <div><h3 id="roadmap-next">{laneMeta.next.title}</h3></div>
            <strong>{journey.next.total}</strong>
          </header>
          <div className="roadmap-list journey-poster-grid">
            {journey.next.visibleEntries.map(renderNextCard)}
            {!journey.next.total && (
              <div className="atlas-lane-empty">
                <Sparkles size={19} />
                <span><strong>Busca lo siguiente</strong></span>
              </div>
            )}
          </div>
          {journey.next.canExpand && (
            <button
              className="roadmap-expand"
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, next: !current.next }))}
            >
              {journey.next.expanded ? 'Ver menos' : `Ver ${journey.next.hiddenCount} más`}
            </button>
          )}
        </section>

        <section className="roadmap-lane later atlas-later" aria-labelledby="roadmap-later">
          <header className="atlas-section-heading">
            <div><h3 id="roadmap-later">{laneMeta.later.title}</h3></div>
            <strong>{journey.later.total}</strong>
          </header>
          <div className="roadmap-list atlas-timeline">
            {journey.later.visibleEntries.map(renderLaterEntry)}
            {!journey.later.total && (
              <div className="atlas-lane-empty later-empty">
                <Clock3 size={19} />
                <span><strong>Sin obras para más tarde</strong></span>
              </div>
            )}
          </div>
          {journey.later.canExpand && (
            <button
              className="roadmap-expand"
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, later: !current.later }))}
            >
              {journey.later.expanded ? 'Ver menos' : `Ver ${journey.later.hiddenCount} más`}
            </button>
          )}
        </section>
      </section>

      {journey.recentCompleted.length > 0 && (
        <section className="home-completed home-credits" aria-label="Completadas recientes">
          <header>
            <h3>Completadas</h3>
          </header>
          <div>
            {journey.recentCompleted.map((item, index) => (
              <button key={item.id} type="button" onClick={() => onOpenItem(item)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <CoverArt title={item.title} type={item.type} posterUrl={item.posterUrl} />
                <strong>{item.title}</strong>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>
      )}

      {(lastActivity || activityClearCount > 0) && (
        <details
          className="home-activity-disclosure"
          open={activityOpen}
          onToggle={(event) => setActivityOpen(event.currentTarget.open)}
        >
          <summary aria-label="Historial de actividad">
            <span>Actividad</span>
            <strong>{lastActivity?.label ?? 'Actividad limpiada'}</strong>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <SessionActivityPanel
            entries={library.activityEntries.slice(0, 8)}
            clearedCount={activityClearCount}
            onClear={onClearActivity}
            onUndoClear={onUndoClearActivity}
            onSelect={(entry) => onNavigate(
              entry.target?.kind === 'item'
                ? 'library'
                : entry.tab === 'catalog' || entry.tab === 'explorer'
                  ? 'discover'
                  : entry.tab as AppTab,
              entry.target,
            )}
          />
        </details>
      )}
    </section>
  )
}
