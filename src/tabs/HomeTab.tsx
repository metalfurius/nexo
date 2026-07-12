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

function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const sync = () => setCompact(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return compact
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
  const [status, setStatus] = useState<string>()
  const [undoMutation, setUndoMutation] = useState<RoadmapMutation>()
  const [pendingMutationKey, setPendingMutationKey] = useState<string>()
  const pendingMutationRef = useRef<string | undefined>(undefined)
  const compact = useCompactLayout()
  const journey = useMemo(
    () => buildHomeJourneyModel({
      expanded,
      items: library.items,
      loading: library.loading,
      roadmap,
      viewport: compact ? 'compact' : 'desktop',
    }),
    [compact, expanded, library.items, library.loading, roadmap],
  )
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
            <small>{itemTypeLabels[entry.item.type]} · {entry.placement === 'automatic' ? 'Sugerido por Nexo' : 'Fijado por ti'}</small>
            <strong>{entry.item.title}</strong>
            <em>{progress}</em>
            <span className="journey-feature-note">
              {lane === 'now' ? 'Tu historia en curso' : 'El próximo capítulo de tu ruta'}
            </span>
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
      <article className="roadmap-card now-companion" key={entry.item.id}>
        <button className="roadmap-card-main" type="button" onClick={() => onOpenItem(entry.item)}>
          <CoverArt title={entry.item.title} type={entry.item.type} posterUrl={entry.item.posterUrl} />
          <span>
            <small>{itemTypeLabels[entry.item.type]}</small>
            <strong>{entry.item.title}</strong>
            <em>{formatProgress(entry.item) || itemStatusLabels[entry.item.status]}</em>
          </span>
        </button>
        <div className="roadmap-card-actions">
          <button className="secondary-button" type="button" onClick={() => onOpenItem(entry.item)}>
            Abrir
          </button>
          {renderRoadmapMenu(entry, 'now')}
        </div>
      </article>
    )
  }

  function renderNextCard(entry: RoadmapEntry) {
    return (
      <article className="roadmap-card atlas-poster-card" key={entry.item.id}>
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
      <article className="roadmap-card atlas-timeline-card" key={entry.item.id}>
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
  return (
    <section className="home-surface" aria-busy={isPending || undefined}>
      <header className="home-atlas-intro">
        <div className="home-atlas-title">
          <span className="eyebrow"><Map size={15} />Atlas cultural vivo</span>
          <h2>Tu ruta</h2>
          <p>Una cartografía personal de lo que estás viviendo, lo siguiente y aquello que merece esperar.</p>
        </div>
        <div className="home-hero-actions">
          <button className="primary-button" type="button" onClick={onAdd}><Plus size={17} />Añadir</button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onRollDice(roadmap.next.length ? 'roadmap-next' : 'all')}
          >
            <Dice5 size={17} />Elegir con Dado
          </button>
        </div>
      </header>

      {(status || isPending) && (
        <div className="home-status" role="status">
          <span>{isPending ? 'Guardando el cambio en tu ruta…' : status}</span>
          {!isPending && undoMutation && <button type="button" onClick={() => void undoLastMutation()}>Deshacer</button>}
        </div>
      )}

      <section className={`roadmap-board home-journey-grid hero-${heroKind}`} aria-label="Tu ruta de obras">
        <section className="roadmap-lane now atlas-now" aria-labelledby="roadmap-now">
          <header className="atlas-section-heading">
            <span>{laneMeta.now.index}</span>
            <div><h3 id="roadmap-now">{laneMeta.now.title}</h3><p>{laneMeta.now.detail}</p></div>
            <strong>{roadmap.now.length}</strong>
          </header>
          {journey.hero.kind === 'current' ? renderFeature(journey.hero.entry, 'now') : journey.hero.kind === 'invitation' ? (
            <div className="atlas-invitation">
              <span className="atlas-invitation-mark"><Map size={23} /></span>
              <div>
                <span className="eyebrow">Abre una nueva ruta</span>
                <strong>Tu siguiente historia aún no tiene nombre</strong>
                <p>Busca una obra o añade algo que ya tengas en mente.</p>
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
          ) : (
            <div className="atlas-lane-empty now-empty">
              <Play size={20} />
              <span><strong>Nada en marcha</strong><small>Tu próximo capítulo está listo para empezar.</small></span>
            </div>
          )}
          {journey.additionalNow.length > 0 && (
            <section className="now-companions" aria-label="También en marcha">
              <header><span>También en marcha</span><strong>{journey.additionalNow.length}</strong></header>
              <div>{journey.additionalNow.map(renderNowCompanion)}</div>
            </section>
          )}
        </section>

        <section className="roadmap-lane next atlas-next" aria-labelledby="roadmap-next">
          <header className="atlas-section-heading">
            <span>{laneMeta.next.index}</span>
            <div><h3 id="roadmap-next">{laneMeta.next.title}</h3><p>{laneMeta.next.detail}</p></div>
            <strong>{roadmap.next.length}</strong>
          </header>
          {journey.hero.kind === 'next-chapter' && renderFeature(journey.hero.entry, 'next')}
          <div className="roadmap-list journey-poster-grid">
            {journey.next.visibleEntries.map(renderNextCard)}
            {!roadmap.next.length && (
              <div className="atlas-lane-empty">
                <Sparkles size={19} />
                <span><strong>El horizonte está abierto</strong><small>Añade o descubre una nueva posibilidad.</small></span>
              </div>
            )}
          </div>
          {journey.next.canExpand && (
            <button
              className="roadmap-expand"
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, next: !current.next }))}
            >
              {journey.next.expanded ? 'Ver menos' : `Ver todas (${journey.next.total})`}
            </button>
          )}
        </section>

        <section className="roadmap-lane later atlas-later" aria-labelledby="roadmap-later">
          <header className="atlas-section-heading">
            <span>{laneMeta.later.index}</span>
            <div><h3 id="roadmap-later">{laneMeta.later.title}</h3><p>{laneMeta.later.detail}</p></div>
            <strong>{journey.later.total}</strong>
          </header>
          <div className="roadmap-list atlas-timeline">
            {journey.later.visibleEntries.map(renderLaterEntry)}
            {!journey.later.total && (
              <div className="atlas-lane-empty later-empty">
                <Clock3 size={19} />
                <span><strong>Sin equipaje pendiente</strong><small>Lo que aparques para más tarde aparecerá aquí.</small></span>
              </div>
            )}
          </div>
          {journey.later.canExpand && (
            <button
              className="roadmap-expand"
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, later: !current.later }))}
            >
              {journey.later.expanded ? 'Ver menos' : `Ver todas (${journey.later.total})`}
            </button>
          )}
        </section>
      </section>

      {journey.recentCompleted.length > 0 && (
        <section className="home-completed home-credits" aria-label="Completadas recientes">
          <header>
            <span className="eyebrow">Créditos recientes</span>
            <h3>Historias que ya forman parte de ti</h3>
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
    </section>
  )
}
