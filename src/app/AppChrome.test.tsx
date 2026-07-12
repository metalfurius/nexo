import { fireEvent, render, screen, within } from '@testing-library/react'
import { Home, Library, Palette, Sparkles, Upload } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import AppChrome from './AppChrome'
import type { ShellNavItem } from './shared'

const navItems: ShellNavItem[] = [
  { description: 'Tu ruta', icon: Home, id: 'home', label: 'Inicio', shortLabel: 'Inicio' },
  { description: 'Buscar obras nuevas', icon: Sparkles, id: 'discover', label: 'Descubrir', shortLabel: 'Descubre' },
  { description: 'Tus obras guardadas', icon: Library, id: 'library', label: 'Biblioteca', shortLabel: 'Biblioteca' },
  { description: 'Traer bibliotecas externas', group: 'utility', icon: Upload, id: 'import', label: 'Importar' },
  { description: 'Cuenta y temas', group: 'utility', icon: Palette, id: 'settings', label: 'Ajustes' },
]

const library = {
  discoveryCandidates: [],
  isModerator: false,
  items: [],
  syncState: {
    fromCache: false,
    hasPendingWrites: false,
    offlinePersistenceEnabled: false,
    pendingWriteCount: 0,
    remote: true,
  },
  userRole: 'user' as const,
}

function renderChrome(overrides: Partial<React.ComponentProps<typeof AppChrome>> = {}) {
  const props: React.ComponentProps<typeof AppChrome> = {
    activeNavItem: navItems[0],
    activeTab: 'home',
    appVersion: '1.2.0',
    installAvailable: false,
    isFirebaseConfigured: true,
    isOffline: false,
    isSignedIn: false,
    library,
    moreMenuOpen: false,
    navItems,
    serviceWorkerUpdateReady: false,
    signOutPending: false,
    onAdd: vi.fn(),
    onInstall: vi.fn(),
    onMoreMenuOpenChange: vi.fn(),
    onNavigate: vi.fn(),
    onOpenSearch: vi.fn(),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onUpdate: vi.fn(),
    ...overrides,
  }
  render(<AppChrome {...props} />)
  return props
}

describe('AppChrome', () => {
  it('keeps the primary navigation and signed-out entry points accessible', () => {
    const props = renderChrome()
    const navigation = screen.getByRole('navigation', { name: 'Secciones de Nexo' })

    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeVisible()
    expect(screen.getByLabelText('Version 1.2.0')).toBeInTheDocument()
    expect(within(navigation).getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('button', { name: 'Descubrir' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Biblioteca' })).toBeVisible()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Biblioteca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(props.onNavigate).toHaveBeenCalledWith('library')
    expect(props.onSignIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument()
  })

  it('exposes session, PWA and More actions without changing their callbacks', () => {
    const props = renderChrome({
      installAvailable: true,
      isOffline: true,
      isSignedIn: true,
      moreMenuOpen: true,
      serviceWorkerUpdateReady: true,
    })

    expect(screen.getByRole('status', { name: 'Sin conexion' })).toBeVisible()
    expect(screen.getByLabelText('Rol: Usuario')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Instalar Nexo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar Nexo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Busqueda rapida' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Ajustes/ }))

    expect(props.onInstall).toHaveBeenCalledOnce()
    expect(props.onUpdate).toHaveBeenCalledOnce()
    expect(props.onAdd).toHaveBeenCalledOnce()
    expect(props.onOpenSearch).toHaveBeenCalledOnce()
    expect(props.onSignOut).toHaveBeenCalledOnce()
    expect(props.onMoreMenuOpenChange).toHaveBeenCalledWith(false)
    expect(props.onNavigate).toHaveBeenCalledWith('settings')
  })

  it('supports disclosure-menu keyboard navigation and returns focus on Escape', () => {
    const props = renderChrome({ moreMenuOpen: true })
    const summary = screen.getByLabelText('Más secciones')
    const [importItem, settingsItem] = screen.getAllByRole('menuitem')

    summary.focus()
    fireEvent.keyDown(summary, { key: 'ArrowDown' })
    expect(importItem).toHaveFocus()

    fireEvent.keyDown(importItem, { key: 'ArrowDown' })
    expect(settingsItem).toHaveFocus()
    fireEvent.keyDown(settingsItem, { key: 'Home' })
    expect(importItem).toHaveFocus()
    fireEvent.keyDown(importItem, { key: 'ArrowUp' })
    expect(settingsItem).toHaveFocus()

    fireEvent.keyDown(settingsItem, { key: 'Escape' })
    expect(props.onMoreMenuOpenChange).toHaveBeenCalledWith(false)
    expect(summary).toHaveFocus()
  })
})
