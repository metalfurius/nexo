import './AppChrome.css'

import { Download, LogIn, LogOut, MoreHorizontal, Plus, RotateCcw, Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NexoMark, roleLabels, type AppTab, type LibrarySurface, type ShellNavItem } from './shared'

interface AppChromeProps {
  activeNavItem: ShellNavItem
  activeTab: AppTab
  appVersion: string
  installAvailable: boolean
  isFirebaseConfigured: boolean
  isOffline: boolean
  isSignedIn: boolean
  library: Pick<LibrarySurface, 'discoveryCandidates' | 'isModerator' | 'items' | 'syncState' | 'userRole'>
  moreMenuOpen: boolean
  navItems: ShellNavItem[]
  serviceWorkerUpdateReady: boolean
  signOutError?: string
  signOutPending: boolean
  onAdd: () => void
  onInstall: () => void
  onMoreMenuOpenChange: (open: boolean) => void
  onNavigate: (tab: AppTab) => void
  onOpenSearch: () => void
  onSignIn: () => void
  onSignOut: () => void
  onUpdate: () => void
}

export default function AppChrome({
  activeNavItem,
  activeTab,
  appVersion,
  installAvailable,
  isFirebaseConfigured,
  isOffline,
  isSignedIn,
  library,
  moreMenuOpen,
  navItems,
  serviceWorkerUpdateReady,
  signOutError,
  signOutPending,
  onAdd,
  onInstall,
  onMoreMenuOpenChange,
  onNavigate,
  onOpenSearch,
  onSignIn,
  onSignOut,
  onUpdate,
}: AppChromeProps) {
  const visibleNavItems = navItems.filter((item) => !item.hidden)
  const primaryNavItems = visibleNavItems.filter((item) => item.group !== 'utility')
  const utilityNavItems = visibleNavItems.filter((item) => item.group === 'utility')
  const hasPrivateSession = isSignedIn || !isFirebaseConfigured
  const moreMenuRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!moreMenuOpen) return undefined

    function closeMoreMenuFromOutside(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node) || moreMenuRef.current?.contains(target)) return
      const origin = target instanceof Element ? target : target.parentElement
      if (origin?.closest('[data-keep-details-open]')) return
      onMoreMenuOpenChange(false)
    }

    window.addEventListener('click', closeMoreMenuFromOutside)
    return () => window.removeEventListener('click', closeMoreMenuFromOutside)
  }, [moreMenuOpen, onMoreMenuOpenChange])

  return (
    <>
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand-lockup">
            <NexoMark />
            <div className="brand-copy">
              <span className="brand-line">
                <span className="brand-wordmark">Nexo</span>
                <span className="brand-version" aria-label={`Version ${appVersion}`}>
                  v{appVersion}
                </span>
              </span>
              <h1>{activeNavItem.displayLabel ?? activeNavItem.label}</h1>
              <p className="topbar-subtitle">{activeNavItem.description}</p>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          {isOffline && (
            <span aria-label="Sin conexion" className="mode-pill offline" role="status">
              Sin conexion
            </span>
          )}
          {!isOffline && library.syncState.hasPendingWrites && (
            <span aria-label="Sincronizacion pendiente" className="mode-pill offline" role="status">
              Pendiente
            </span>
          )}
          {!isOffline && !library.syncState.hasPendingWrites && library.syncState.fromCache && (
            <span aria-label="Datos desde cache" className="mode-pill offline" role="status">
              Cache
            </span>
          )}
          {installAvailable && (
            <button
              aria-label="Instalar Nexo"
              className="app-update-button app-install-button"
              type="button"
              onClick={onInstall}
            >
              <Download size={16} />
              <span>Instalar</span>
            </button>
          )}
          {serviceWorkerUpdateReady && (
            <button aria-label="Actualizar Nexo" className="app-update-button" type="button" onClick={onUpdate}>
              <RotateCcw size={16} />
              <span>Actualizar</span>
            </button>
          )}
          {hasPrivateSession && (
            <span
              className={library.isModerator ? 'mode-pill moderator role-pill' : 'mode-pill role-pill role-pill-quiet'}
              aria-label={`Rol: ${roleLabels[library.userRole]}`}
            >
              <span className="role-prefix">Rol: </span>{roleLabels[library.userRole]}
            </span>
          )}
          {hasPrivateSession && (
            <button className="global-add-button" type="button" onClick={onAdd}>
              <Plus size={17} />
              <span>Añadir</span>
            </button>
          )}
          <button
            aria-label="Busqueda rapida"
            aria-keyshortcuts="/ Control+K Meta+K"
            className="icon-button"
            type="button"
            onClick={onOpenSearch}
            title="Busqueda rapida"
          >
            <Search size={18} />
          </button>
          {isSignedIn && (
            <>
              {signOutError && (
                <span aria-label={`Error al salir: ${signOutError}`} className="mode-pill warning" role="alert">
                  {signOutError}
                </span>
              )}
              <button
                aria-label="Salir"
                className="icon-button"
                disabled={signOutPending}
                type="button"
                onClick={onSignOut}
                title={signOutPending ? 'Saliendo' : 'Salir'}
              >
                <LogOut size={18} />
              </button>
            </>
          )}
          {isFirebaseConfigured && !isSignedIn && (
            <button className="app-update-button" type="button" onClick={onSignIn}>
              <LogIn size={16} />
              <span>Entrar</span>
            </button>
          )}
        </div>
      </header>

      <nav className="tabbar" aria-label="Secciones de Nexo">
        <div className="tabbar-brand" aria-hidden="true">
          <NexoMark compact />
          <span>
            <strong>Nexo</strong>
            <small>v{appVersion}</small>
          </span>
        </div>

        <div className="tabbar-group primary">
          {primaryNavItems.map((item) => (
            <ChromeNavButton activeTab={activeTab} item={item} key={item.id} onNavigate={onNavigate} />
          ))}
        </div>

        <details
          className="tabbar-more"
          data-close-on-outside
          open={moreMenuOpen}
          ref={moreMenuRef}
          onKeyDown={(event) => {
            const details = event.currentTarget
            const summary = details.querySelector<HTMLElement>('summary')
            const menuItems = [...details.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]

            if (event.key === 'Escape') {
              event.preventDefault()
              details.open = false
              onMoreMenuOpenChange(false)
              summary?.focus()
              return
            }

            const origin = event.target instanceof Element ? event.target : undefined
            const currentItem = origin?.closest<HTMLButtonElement>('[role="menuitem"]')
            const isSummaryEvent = Boolean(summary && origin?.closest('summary') === summary)
            const isDirectionalKey = event.key === 'ArrowDown' || event.key === 'ArrowUp'
            if (!currentItem && !(isSummaryEvent && isDirectionalKey)) return
            if (!isDirectionalKey && event.key !== 'Home' && event.key !== 'End') return

            event.preventDefault()
            if (!menuItems.length) return
            if (isSummaryEvent) {
              details.open = true
              onMoreMenuOpenChange(true)
              menuItems[event.key === 'ArrowUp' ? menuItems.length - 1 : 0]?.focus()
              return
            }

            const currentIndex = currentItem ? menuItems.indexOf(currentItem) : -1
            const nextIndex = event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? menuItems.length - 1
                : event.key === 'ArrowUp'
                  ? (currentIndex - 1 + menuItems.length) % menuItems.length
                  : (currentIndex + 1) % menuItems.length
            menuItems[nextIndex]?.focus()
          }}
          onToggle={(event) => onMoreMenuOpenChange(event.currentTarget.open)}
        >
          <summary
            aria-label="Más secciones"
            className={utilityNavItems.some((item) => item.id === activeTab) ? 'tab-button active' : 'tab-button'}
          >
            <MoreHorizontal size={18} />
            <span className="tab-label" data-short-label="Más">
              <span>Más</span>
            </span>
          </summary>
          <div className="tabbar-more-menu" role="menu">
            {utilityNavItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  className={activeTab === item.id ? 'active' : undefined}
                  key={item.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onMoreMenuOpenChange(false)
                    onNavigate(item.id)
                  }}
                >
                  <Icon size={17} />
                  <span>
                    <strong>{item.displayLabel ?? item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </details>
      </nav>
    </>
  )
}

function ChromeNavButton({
  activeTab,
  item,
  onNavigate,
}: {
  activeTab: AppTab
  item: ShellNavItem
  onNavigate: (tab: AppTab) => void
}) {
  const Icon = item.icon
  return (
    <button
      aria-current={activeTab === item.id ? 'page' : undefined}
      aria-label={item.label}
      className={activeTab === item.id ? 'tab-button active' : 'tab-button'}
      type="button"
      onClick={() => onNavigate(item.id)}
    >
      <Icon size={18} />
      <span className="tab-label" data-short-label={item.shortLabel ?? item.displayLabel ?? item.label}>
        <span>{item.displayLabel ?? item.label}</span>
        <small className="tab-description">{item.description}</small>
      </span>
    </button>
  )
}
