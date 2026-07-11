import './HomeTab.css'

import { Check, ChevronDown, ChevronUp, Clock3, Dice5, EyeOff, ListPlus, Pause, Play, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ItemStatus, ListItem, RoadmapLane, RoadmapMutation } from '../domain/types'
import { cloneRoadmapPreferences, deriveRoadmap, hideRoadmapItem, moveRoadmapItem, reorderRoadmapItem, resetRoadmapItemToAutomatic, transitionRoadmapItem, type RoadmapEntry } from '../lib/roadmap'
import { formatProgress, itemStatusLabels, itemTypeLabels } from '../lib/libraryItemInsights'
import { CoverArt, SessionActivityPanel, type ActivityFocus, type ActivityRecorder, type AppTab, type LibrarySurface } from '../app/shared'

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

const laneMeta: Record<RoadmapLane, { title: string; detail: string }> = {
  now: { title: 'Ahora', detail: 'Lo que ya esta en marcha' },
  next: { title: 'Despues', detail: 'Tu siguiente decision' },
  later: { title: 'Mas adelante', detail: 'Sin perderlo de vista' },
}

function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const sync = () => setCompact(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return compact
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
  const roadmap = useMemo(() => deriveRoadmap(library.items, library.settings.roadmap), [library.items, library.settings.roadmap])
  const [expanded, setExpanded] = useState<Partial<Record<RoadmapLane, boolean>>>({})
  const [status, setStatus] = useState<string>()
  const [undoMutation, setUndoMutation] = useState<RoadmapMutation>()
  const compact = useCompactLayout()
  const limit = compact ? 3 : 5
  const completed = useMemo(
    () => library.items.filter((item) => item.status === 'completed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3),
    [library.items],
  )

  async function apply(mutation: RoadmapMutation, message: string) {
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
    }
  }

  async function undoLastMutation() {
    if (!undoMutation) return
    const rollback = undoMutation
    setUndoMutation(undefined)
    try {
      await library.applyRoadmapMutation(rollback)
      setStatus('Cambio deshecho')
      onActivity({ detail: 'Se restauro el estado y la posicion anteriores.', label: 'Cambio deshecho', tab: 'home', tone: 'success' })
    } catch (reason) {
      setUndoMutation(rollback)
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el cambio.')
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

    // Persist the complete derived order before moving an automatic suggestion.
    // Otherwise the saved index only sees previously manual IDs and the item can
    // jump back to its priority-derived position after a reload.
    const materialized = roadmap[lane].reduce(
      (preferences, current, targetIndex) => moveRoadmapItem(preferences, current.item.id, lane, targetIndex),
      library.settings.roadmap,
    )
    return reorderRoadmapItem(materialized, lane, entry.item.id, direction)
  }

  function transition(item: ListItem, nextStatus: ItemStatus, message: string) {
    void apply(transitionRoadmapItem(library.settings.roadmap, item.id, nextStatus), message)
  }

  if (!library.items.length && !library.loading) {
    return (
      <section className="home-surface">
        <header className="home-hero empty">
          <div>
            <span className="eyebrow">Tu punto de partida</span>
            <h2>Construye una ruta que apetezca seguir</h2>
            <p>Añade una primera obra; Nexo te ayudara a decidir que va ahora y que puede esperar.</p>
          </div>
          <button className="primary-button" type="button" onClick={onAdd}><Plus size={18} />Añadir primera obra</button>
        </header>
        <section className="home-onboarding" aria-label="Primeros pasos de Nexo">
          <button type="button" onClick={onAdd}><ListPlus size={20} /><span><strong>1. Añade</strong><small>Busca, crea o importa</small></span></button>
          <button type="button" onClick={() => onNavigate('discover')}><Sparkles size={20} /><span><strong>2. Descubre</strong><small>Encuentra algo que encaje</small></span></button>
          <button type="button" disabled><Dice5 size={20} /><span><strong>3. Decide</strong><small>El Dado se activa con tu biblioteca</small></span></button>
        </section>
      </section>
    )
  }

  return (
    <section className="home-surface">
      <header className="home-hero">
        <div>
          <span className="eyebrow">Inicio</span>
          <h2>Tu ruta</h2>
          <p>Una vista sencilla de lo que haces ahora, lo siguiente y lo que puede esperar.</p>
        </div>
        <div className="home-hero-actions">
          <button className="primary-button" type="button" onClick={onAdd}><Plus size={17} />Añadir</button>
          <button className="secondary-button" type="button" onClick={() => onRollDice(roadmap.next.length ? 'roadmap-next' : 'all')}>
            <Dice5 size={17} />Elegir con Dado
          </button>
        </div>
      </header>

      {status && (
        <div className="home-status" role="status">
          <span>{status}</span>
          {undoMutation && <button type="button" onClick={() => void undoLastMutation()}>Deshacer</button>}
        </div>
      )}

      <section className="roadmap-board" aria-label="Tu ruta de obras">
        {(['now', 'next', 'later'] as const).map((lane) => {
          const entries = roadmap[lane]
          const visibleEntries = expanded[lane] ? entries : entries.slice(0, limit)
          return (
            <section className={`roadmap-lane ${lane}`} key={lane} aria-labelledby={`roadmap-${lane}`}>
              <header>
                <div><span>{entries.length}</span><h3 id={`roadmap-${lane}`}>{laneMeta[lane].title}</h3></div>
                <p>{laneMeta[lane].detail}</p>
              </header>
              <div className="roadmap-list">
                {visibleEntries.map((entry, index) => (
                  <article className="roadmap-card" key={entry.item.id}>
                    <button className="roadmap-card-main" type="button" onClick={() => onOpenItem(entry.item)}>
                      <CoverArt title={entry.item.title} type={entry.item.type} posterUrl={entry.item.posterUrl} />
                      <span>
                        <small>{itemTypeLabels[entry.item.type]} · {entry.placement === 'automatic' ? 'Sugerido' : 'Fijado'}</small>
                        <strong>{entry.item.title}</strong>
                        <em>{formatProgress(entry.item) || itemStatusLabels[entry.item.status]}</em>
                      </span>
                    </button>
                    <div className="roadmap-card-actions">
                      {lane === 'now' && (
                        <button className="primary-button" type="button" onClick={() => onOpenItem(entry.item)}><Play size={15} />Actualizar progreso</button>
                      )}
                      {lane === 'next' && (
                        <button className="primary-button" type="button" onClick={() => transition(entry.item, 'in_progress', `${entry.item.title} pasa a Ahora`)}><Play size={15} />Empezar ahora</button>
                      )}
                      {lane === 'later' && (
                        <button className="secondary-button" type="button" onClick={() => void apply(mutationForMove(entry, 'next'), `${entry.item.title} pasa a Despues`)}><Clock3 size={15} />Poner despues</button>
                      )}
                      <details className="roadmap-card-menu">
                        <summary aria-label={`Organizar ${entry.item.title}`}>•••</summary>
                        <div>
                          {(['now', 'next', 'later'] as const).filter((target) => target !== lane).map((target) => (
                            <button key={target} type="button" onClick={() => void apply(mutationForMove(entry, target), `${entry.item.title} movida a ${laneMeta[target].title}`)}>
                              Mover a {laneMeta[target].title}
                            </button>
                          ))}
                          <button disabled={index === 0} type="button" onClick={() => void apply({ roadmap: roadmapForReorder(entry, lane, 'up') }, `${entry.item.title} sube en la ruta`)}><ChevronUp size={14} />Subir</button>
                          <button disabled={index === entries.length - 1} type="button" onClick={() => void apply({ roadmap: roadmapForReorder(entry, lane, 'down') }, `${entry.item.title} baja en la ruta`)}><ChevronDown size={14} />Bajar</button>
                          {lane === 'now' && <button type="button" onClick={() => transition(entry.item, 'paused', `${entry.item.title} queda pausada`)}><Pause size={14} />Pausar</button>}
                          <button type="button" onClick={() => transition(entry.item, 'completed', `${entry.item.title} completada`)}><Check size={14} />Completar</button>
                          {entry.placement === 'manual' && <button type="button" onClick={() => void apply({ roadmap: resetRoadmapItemToAutomatic(library.settings.roadmap, entry.item.id) }, `${entry.item.title} vuelve a automatico`)}><RotateCcw size={14} />Volver a automatico</button>}
                          <button type="button" onClick={() => void apply({ roadmap: hideRoadmapItem(library.settings.roadmap, entry.item.id) }, `${entry.item.title} se oculta de Tu ruta`)}><EyeOff size={14} />Quitar de la ruta</button>
                        </div>
                      </details>
                    </div>
                  </article>
                ))}
                {!entries.length && <p className="roadmap-empty">Nada aqui por ahora.</p>}
              </div>
              {entries.length > limit && (
                <button className="roadmap-expand" type="button" onClick={() => setExpanded((current) => ({ ...current, [lane]: !current[lane] }))}>
                  {expanded[lane] ? 'Ver menos' : `Ver todas (${entries.length})`}
                </button>
              )}
            </section>
          )
        })}
      </section>

      {completed.length > 0 && (
        <section className="home-completed" aria-label="Completadas recientes">
          <div><span className="eyebrow">Cierre</span><h3>Completadas recientes</h3></div>
          <div>{completed.map((item) => <button key={item.id} type="button" onClick={() => onOpenItem(item)}><Check size={15} />{item.title}</button>)}</div>
        </section>
      )}

      <SessionActivityPanel
        entries={library.activityEntries.slice(0, 8)}
        clearedCount={activityClearCount}
        onClear={onClearActivity}
        onUndoClear={onUndoClearActivity}
        onSelect={(entry) => onNavigate(entry.target?.kind === 'item' ? 'library' : entry.tab === 'catalog' || entry.tab === 'explorer' ? 'discover' : entry.tab as AppTab, entry.target)}
      />
    </section>
  )
}
