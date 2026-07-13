import './DiscoverTab.css'

import { Search, Sparkles, ListChecks } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  ShellState,
  readDiscoverMode,
  type ActivityRecorder,
  type AppTab,
  type DiscoverMode,
  type ExplorerCandidateDismissRequest,
  type ExplorerCandidateRequest,
  type ExplorerCandidateSaveRequest,
  type ExplorerPromptCardRequest,
  type ExplorerSearchRequest,
  type ExplorerVisibleDismissRequest,
  type ExplorerVisibleSaveRequest,
  type LibrarySurface,
} from '../app/shared'

const CatalogTab = lazy(() => import('./CatalogTab'))
const ExplorerTab = lazy(() => import('./ExplorerTab'))

interface DiscoverTabProps {
  candidateDismissRequest?: ExplorerCandidateDismissRequest
  candidateRequest?: ExplorerCandidateRequest
  candidateSaveRequest?: ExplorerCandidateSaveRequest
  isSignedIn: boolean
  library: LibrarySurface
  requiresSignIn?: boolean
  onActivity: ActivityRecorder
  onCandidateDismissRequestHandled: () => void
  onCandidateRequestHandled: () => void
  onCandidateSaveRequestHandled: () => void
  onNavigate: (tab: AppTab) => void
  onPromptCardRequestHandled: () => void
  onSearchRequestHandled: () => void
  onSignIn: () => void
  onVisibleDismissRequestHandled: () => void
  onVisibleSaveRequestHandled: () => void
  promptCardRequest?: ExplorerPromptCardRequest
  searchRequest?: ExplorerSearchRequest
  visibleDismissRequest?: ExplorerVisibleDismissRequest
  visibleSaveRequest?: ExplorerVisibleSaveRequest
}

const modes: Array<{ id: DiscoverMode; label: string; Icon: typeof Search }> = [
  { id: 'search', label: 'Buscar', Icon: Search },
  { id: 'surprise', label: 'Sorprendeme', Icon: Sparkles },
  { id: 'queue', label: 'Pendientes', Icon: ListChecks },
]

function writeDiscoverMode(mode: DiscoverMode, historyMode: 'push' | 'replace' = 'push') {
  const url = new URL(window.location.href)
  url.searchParams.set('tab', 'discover')
  url.searchParams.set('mode', mode)
  url.searchParams.delete('item')
  url.searchParams.delete('catalogQ')
  url.searchParams.delete('catalogType')
  if (mode !== 'search') {
    url.searchParams.delete('q')
    url.searchParams.delete('type')
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  if (historyMode === 'push') window.history.pushState(null, '', nextUrl)
  else window.history.replaceState(null, '', nextUrl)
}

export default function DiscoverTab(props: DiscoverTabProps) {
  const [mode, setMode] = useState<DiscoverMode>(() => readDiscoverMode())

  useEffect(() => {
    const syncMode = () => setMode(readDiscoverMode())
    window.addEventListener('popstate', syncMode)
    return () => window.removeEventListener('popstate', syncMode)
  }, [])

  function selectMode(nextMode: DiscoverMode) {
    if (nextMode === mode) return
    setMode(nextMode)
    writeDiscoverMode(nextMode)
  }

  return (
    <section className="discover-surface" data-discover-mode={mode}>
      <header className="discover-header">
        <h2 className="discover-header-title">Descubrir</h2>
        <nav aria-label="Modos de Descubrir" className="discover-mode-nav">
          {modes.map(({ id, label, Icon }) => (
            <button
              aria-current={mode === id ? 'page' : undefined}
              className={mode === id ? 'discover-mode-button active' : 'discover-mode-button'}
              key={id}
              type="button"
              onClick={() => selectMode(id)}
            >
              <Icon size={17} />
              <strong>{label}</strong>
            </button>
          ))}
        </nav>
      </header>

      <Suspense fallback={<ShellState title="Cargando Descubrir" detail="Preparando catalogo y recomendaciones." />}>
        {mode === 'search' ? (
          <CatalogTab
            isSignedIn={props.isSignedIn}
            library={props.library}
            onActivity={props.onActivity}
            onNavigate={props.onNavigate}
            onSignIn={props.onSignIn}
          />
        ) : (
          <ExplorerTab
            candidateDismissRequest={props.candidateDismissRequest}
            candidateRequest={props.candidateRequest}
            candidateSaveRequest={props.candidateSaveRequest}
            library={props.library}
            requiresSignIn={props.requiresSignIn}
            promptCardRequest={props.promptCardRequest}
            searchRequest={props.searchRequest}
            surfaceMode={mode}
            visibleDismissRequest={props.visibleDismissRequest}
            visibleSaveRequest={props.visibleSaveRequest}
            onActivity={props.onActivity}
            onCandidateDismissRequestHandled={props.onCandidateDismissRequestHandled}
            onCandidateRequestHandled={props.onCandidateRequestHandled}
            onCandidateSaveRequestHandled={props.onCandidateSaveRequestHandled}
            onPromptCardRequestHandled={props.onPromptCardRequestHandled}
            onSearchRequestHandled={props.onSearchRequestHandled}
            onSignIn={props.onSignIn}
            onVisibleDismissRequestHandled={props.onVisibleDismissRequestHandled}
            onVisibleSaveRequestHandled={props.onVisibleSaveRequestHandled}
          />
        )}
      </Suspense>
    </section>
  )
}
