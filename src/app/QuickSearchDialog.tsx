import type { DiscoveryCandidate, ListItem } from '../domain/types'
import {
  discoverySourceLabels as sourceLabels,
  discoveryStatusLabels,
} from '../lib/explorerInsights'
import { getLibraryFocusItems } from '../lib/libraryInsights'
import {
  getItemSubtitle,
  itemStatusLabels as statusLabels,
  itemTypeLabels as typeLabels,
} from '../lib/libraryItemInsights'
import { normalizeKey, slugify } from '../lib/strings'
import { Plus, Search, Sparkles, X } from 'lucide-react'
import { type KeyboardEvent, useMemo, useState } from 'react'
import {
  handleDialogKeyDown,
  typeIcons,
  useRestoreFocusOnUnmount,
  type AppTab,
  type QuickSearchCommand,
  type QuickSearchCommandEntry,
  type QuickSearchEntry,
  type ScoredQuickSearchEntry,
  type ShellNavItem,
} from './shared'

export interface QuickSearchDialogProps {
  commands: QuickSearchCommand[]
  candidates: DiscoveryCandidate[]
  items: ListItem[]
  navItems: ShellNavItem[]
  onClose: () => void
  onCreateItem: (title: string) => void
  onExploreQuery: (query: string) => void
  onOpenCandidate: (candidate: DiscoveryCandidate) => void
  onOpenItem: (item: ListItem) => void
  onOpenTab: (tab: AppTab) => void
}

export default function QuickSearchDialog({
  commands,
  candidates,
  items,
  navItems,
  onClose,
  onCreateItem,
  onExploreQuery,
  onOpenCandidate,
  onOpenItem,
  onOpenTab,
}: QuickSearchDialogProps) {
  useRestoreFocusOnUnmount()

  const [query, setQuery] = useState('')
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const trimmedQuery = query.trim()
  const normalizedQuery = normalizeKey(query)
  const focusItems = useMemo(() => getLibraryFocusItems(items), [items])
  const results = useMemo(() => {
    const commandEntries: QuickSearchCommandEntry[] = commands.map((command) => ({
      Icon: command.Icon,
      command,
      detail: command.detail,
      id: `command-${command.id}`,
      kind: 'command',
      meta: command.meta,
      title: command.title,
      tone: command.tone,
    }))
    const navigationEntries: QuickSearchEntry[] = navItems.map((item) => ({
      Icon: item.icon,
      detail: item.description,
      id: `tab-${item.id}`,
      kind: 'tab',
      meta: 'Seccion',
      tab: item.id,
      title: item.label,
      tone: 'section',
    }))

    if (!normalizedQuery) {
      return [
        ...[...commandEntries]
          .sort((left, right) => (right.command.searchPriority ?? 0) - (left.command.searchPriority ?? 0))
          .slice(0, 3),
        ...navigationEntries
          .filter((entry) => entry.kind === 'tab' && (entry.tab === 'home' || entry.tab === 'discover'))
          .slice(0, 2),
        ...focusItems.slice(0, 2).map((item): QuickSearchEntry => ({
          Icon: typeIcons[item.type],
          detail: getItemSubtitle(item),
          id: `item-${item.id}`,
          item,
          kind: 'item',
          meta: statusLabels[item.status],
          title: item.title,
          tone: item.type,
        })),
      ]
    }

    const tokens = normalizedQuery.split(' ').filter(Boolean)
    const exactItemMatch = items.some((item) => normalizeKey(item.title) === normalizedQuery)
    const explicitExplorerMatch = trimmedQuery.match(/^(explorar|explorador|buscar)\s+(.+)/i)
    const explorerQuery = (explicitExplorerMatch?.[2] ?? trimmedQuery).trim()
    const scoredCandidateEntries = candidates
      .map((candidate, index): ScoredQuickSearchEntry | undefined => {
        const titleKey = normalizeKey(candidate.title)
        const sourceLabel = sourceLabels[candidate.source]
        const statusLabel = discoveryStatusLabels[candidate.status]
        const textKey = normalizeKey([
          candidate.title,
          typeLabels[candidate.type],
          statusLabel,
          sourceLabel,
          candidate.overview,
          ...candidate.genres,
          ...candidate.tags,
          ...candidate.moodTags,
        ].join(' '))
        if (!tokens.every((token) => textKey.includes(token))) return undefined

        return {
          entry: {
            Icon: typeIcons[candidate.type],
            candidate,
            detail: candidate.overview || `${sourceLabel} / ${typeLabels[candidate.type]}`,
            id: `candidate-${candidate.id}`,
            kind: 'candidate',
            meta: `${statusLabel} / ${sourceLabel}`,
            title: candidate.title,
            tone: candidate.type,
          },
          index,
          score:
            35 +
            (titleKey === normalizedQuery ? 55 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 32 : 0) +
            (titleKey.includes(normalizedQuery) ? 18 : 0) +
            (candidate.status === 'queued' ? 8 : 0) +
            (candidate.status === 'saved' ? 3 : 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))
    const scoredCommandEntries = commandEntries
      .map((entry, index): ScoredQuickSearchEntry | undefined => {
        const commandSearchKey = normalizeKey(entry.command.searchText)
        const textKey = normalizeKey(`${entry.title} ${entry.detail} ${entry.meta} ${entry.command.searchText}`)
        const titleKey = normalizeKey(entry.title)
        if (!tokens.every((token) => textKey.includes(token))) return undefined

        return {
          entry,
          index,
          score:
            32 +
            (titleKey === normalizedQuery ? 60 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 34 : 0) +
            (titleKey.includes(normalizedQuery) ? 18 : 0) +
            (tokens.every((token) => commandSearchKey.split(' ').includes(token)) ? 8 : 0) +
            (entry.command.searchPriority ?? 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))
    const createEntries: ScoredQuickSearchEntry[] = trimmedQuery && !exactItemMatch && !explicitExplorerMatch
      ? [{
          entry: {
            Icon: Plus,
            detail: 'Nueva ficha privada',
            id: `create-${slugify(trimmedQuery) || 'entrada'}`,
            kind: 'create',
            meta: 'Crear',
            query: trimmedQuery,
            title: `Crear entrada "${trimmedQuery}"`,
            tone: 'create',
          },
          index: -1,
          score: 25,
        }]
      : []
    const exploreEntries: ScoredQuickSearchEntry[] = explorerQuery.length >= 2
      ? [{
          entry: {
            Icon: Sparkles,
            detail: 'Buscar en Nexo y APIs publicas',
            id: `explore-${slugify(explorerQuery) || 'busqueda'}`,
            kind: 'explore',
            meta: 'Explorador',
            query: explorerQuery,
            title: `Explorar "${explorerQuery}"`,
            tone: 'section',
          },
          index: -2,
          score: explicitExplorerMatch ? 48 : 23,
        }]
      : []
    const scoredNavigationEntries = navigationEntries
      .map((entry, index): ScoredQuickSearchEntry | undefined => {
        const titleKey = normalizeKey(entry.title)
        const textKey = normalizeKey(`${entry.title} ${entry.detail} ${entry.meta}`)
        if (!tokens.every((token) => textKey.includes(token))) return undefined
        return {
          entry,
          index,
          score: 20 +
            (titleKey === normalizedQuery ? 60 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 34 : 0) +
            (titleKey.includes(normalizedQuery) ? 16 : 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))
    const scoredItemEntries = items
      .map((item, index): ScoredQuickSearchEntry | undefined => {
        const titleKey = normalizeKey(item.title)
        const textKey = normalizeKey([
          item.title,
          typeLabels[item.type],
          statusLabels[item.status],
          getItemSubtitle(item),
          ...item.genres,
          ...item.tags,
          ...item.moodTags,
        ].join(' '))
        if (!tokens.every((token) => textKey.includes(token))) return undefined

        return {
          entry: {
            Icon: typeIcons[item.type],
            detail: getItemSubtitle(item),
            id: `item-${item.id}`,
            item,
            kind: 'item',
            meta: statusLabels[item.status],
            title: item.title,
            tone: item.type,
          },
          index,
          score:
            (titleKey === normalizedQuery ? 50 : 0) +
            (titleKey.startsWith(normalizedQuery) ? 30 : 0) +
            (titleKey.includes(normalizedQuery) ? 15 : 0) +
            (item.status === 'in_progress' ? 8 : 0) +
            (item.status === 'wishlist' ? 4 : 0),
        }
      })
      .filter((result): result is ScoredQuickSearchEntry => Boolean(result))

    return [
      ...scoredCommandEntries,
      ...scoredCandidateEntries,
      ...createEntries,
      ...exploreEntries,
      ...scoredNavigationEntries,
      ...scoredItemEntries,
    ]
      .sort((left, right) =>
        right.score - left.score || left.entry.title.localeCompare(right.entry.title) || left.index - right.index,
      )
      .slice(0, 8)
      .map((result) => result.entry)
  }, [candidates, commands, focusItems, items, navItems, normalizedQuery, trimmedQuery])
  const activeEntry = results[Math.min(activeResultIndex, Math.max(results.length - 1, 0))]

  function openEntry(entry: QuickSearchEntry | undefined) {
    if (entry?.kind === 'command') entry.command.run()
    if (entry?.kind === 'create') onCreateItem(entry.query)
    if (entry?.kind === 'explore') onExploreQuery(entry.query)
    if (entry?.kind === 'candidate') onOpenCandidate(entry.candidate)
    if (entry?.kind === 'item') onOpenItem(entry.item)
    if (entry?.kind === 'tab') onOpenTab(entry.tab)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      setActiveResultIndex((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      setActiveResultIndex((current) => (current - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && activeEntry) {
      event.preventDefault()
      openEntry(activeEntry)
    }
  }

  const resultLabel = normalizedQuery ? 'Resultados' : 'Acciones, secciones y foco'
  const resultTotal = commands.length + candidates.length + items.length + navItems.length

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="quick-search-title"
        aria-modal="true"
        className="quick-search-dialog"
        role="dialog"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <div className="panel-heading compact">
          <div><span className="eyebrow">Busqueda rapida</span><h2 id="quick-search-title">Abrir en Nexo</h2></div>
          <button aria-label="Cerrar busqueda rapida" className="icon-button" title="Cerrar" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="quick-search-field">
          <Search size={18} />
          <span className="sr-only">Buscar en Nexo</span>
          <input
            aria-activedescendant={activeEntry ? `quick-search-result-${activeEntry.id}` : undefined}
            aria-controls="quick-search-results"
            aria-label="Buscar en Nexo"
            autoFocus
            placeholder="Buscar ficha o seccion"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveResultIndex(0)
            }}
            onKeyDown={handleSearchKeyDown}
          />
        </label>
        <div className="quick-search-section-heading">
          <strong>{resultLabel}</strong><span>{results.length} de {resultTotal}</span>
        </div>
        {results.length ? (
          <ul aria-label={resultLabel} className="quick-search-results" id="quick-search-results">
            {results.map((entry, index) => {
              const Icon = entry.Icon
              const isActive = entry.id === activeEntry?.id
              return (
                <li key={entry.id}>
                  <button
                    aria-current={isActive ? 'true' : undefined}
                    aria-label={
                      entry.kind === 'command' ? `Ejecutar ${entry.title}`
                        : entry.kind === 'create' ? `Crear entrada ${entry.query}`
                          : entry.kind === 'explore' ? `Explorar ${entry.query}`
                            : entry.kind === 'candidate' ? `Abrir hallazgo ${entry.title}`
                              : `Abrir ${entry.title}`
                    }
                    className={isActive ? 'quick-search-result active' : 'quick-search-result'}
                    id={`quick-search-result-${entry.id}`}
                    type="button"
                    onClick={() => openEntry(entry)}
                    onPointerMove={() => setActiveResultIndex(index)}
                  >
                    <span aria-hidden="true" className={`quick-search-type ${entry.tone}`}><Icon size={16} /></span>
                    <span><strong>{entry.title}</strong><small>{entry.detail}</small></span>
                    <em>{entry.meta}</em>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="quick-search-empty"><Search size={20} /><span>Sin resultados</span></div>
        )}
      </section>
    </div>
  )
}
