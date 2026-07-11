import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySurface } from '../app/shared'
import DiscoverTab from './DiscoverTab'

const tabMocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  explorer: vi.fn(),
}))

vi.mock('./CatalogTab', () => ({
  default: (props: unknown) => {
    tabMocks.catalog(props)
    return <section aria-label="Buscar mock">Catalog mock</section>
  },
}))

vi.mock('./ExplorerTab', () => ({
  default: (props: unknown) => {
    tabMocks.explorer(props)
    return <section aria-label="Explorer mock">Explorer mock</section>
  },
}))

function createProps(): Parameters<typeof DiscoverTab>[0] {
  return {
    isSignedIn: true,
    library: {} as LibrarySurface,
    onActivity: vi.fn(),
    onCandidateDismissRequestHandled: vi.fn(),
    onCandidateRequestHandled: vi.fn(),
    onCandidateSaveRequestHandled: vi.fn(),
    onNavigate: vi.fn(),
    onPromptCardRequestHandled: vi.fn(),
    onSearchRequestHandled: vi.fn(),
    onSignIn: vi.fn(),
    onVisibleDismissRequestHandled: vi.fn(),
    onVisibleSaveRequestHandled: vi.fn(),
  }
}

describe('DiscoverTab', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    tabMocks.catalog.mockReset()
    tabMocks.explorer.mockReset()
  })

  it('opens Buscar by default and forwards the public/auth context to Catalog', async () => {
    const props = createProps()
    props.isSignedIn = false
    render(<DiscoverTab {...props} />)

    expect(screen.getByRole('button', { name: /Buscar/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('region', { name: 'Buscar mock' })).toBeVisible()
    expect(tabMocks.catalog).toHaveBeenLastCalledWith(expect.objectContaining({
      isSignedIn: false,
      library: props.library,
      onSignIn: props.onSignIn,
    }))
    expect(tabMocks.explorer).not.toHaveBeenCalled()
  })

  it('maps the legacy Explorer route to Sorprendeme', async () => {
    window.history.replaceState(null, '', '/?tab=explorer')
    render(<DiscoverTab {...createProps()} />)

    expect(screen.getByRole('button', { name: /Sorprendeme/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('region', { name: 'Explorer mock' })).toBeVisible()
    expect(document.querySelector('.discover-surface')).toHaveAttribute('data-discover-mode', 'surprise')
  })

  it('maps legacy Catalog query state to Buscar and lets Catalog hydrate it', async () => {
    window.history.replaceState(null, '', '/?tab=catalog&catalogQ=Dune&catalogType=book')
    render(<DiscoverTab {...createProps()} />)

    expect(screen.getByRole('button', { name: /Buscar/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('region', { name: 'Buscar mock' })).toBeVisible()
    expect(window.location.search).toContain('catalogQ=Dune')
  })

  it('writes a canonical URL and removes search state when switching to Pendientes', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/?tab=catalog&catalogQ=Dune&catalogType=book&q=legacy&type=watch#route')
    render(<DiscoverTab {...createProps()} />)

    await user.click(screen.getByRole('button', { name: /Pendientes/ }))

    expect(await screen.findByRole('region', { name: 'Explorer mock' })).toBeVisible()
    expect(window.location.search).toBe('?tab=discover&mode=queue')
    expect(window.location.hash).toBe('#route')
    expect(screen.getByRole('button', { name: /Pendientes/ })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps shareable search state when returning to Buscar', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/?tab=discover&mode=queue')
    render(<DiscoverTab {...createProps()} />)

    await user.click(screen.getByRole('button', { name: /Buscar/ }))

    expect(await screen.findByRole('region', { name: 'Buscar mock' })).toBeVisible()
    expect(window.location.search).toBe('?tab=discover&mode=search')
  })

  it('restores the selected mode from browser history', async () => {
    window.history.replaceState(null, '', '/?tab=discover&mode=queue')
    render(<DiscoverTab {...createProps()} />)
    expect(await screen.findByRole('region', { name: 'Explorer mock' })).toBeVisible()

    act(() => {
      window.history.pushState(null, '', '/?tab=discover&mode=search&q=Dune')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await waitFor(() => expect(screen.getByRole('button', { name: /Buscar/ })).toHaveAttribute('aria-current', 'page'))
    expect(await screen.findByRole('region', { name: 'Buscar mock' })).toBeVisible()
  })

  it('forwards queue action requests to Explorer unchanged', async () => {
    window.history.replaceState(null, '', '/?tab=discover&mode=queue')
    const props = createProps()
    props.requiresSignIn = true
    props.candidateRequest = { candidateId: 'candidate-1', requestId: 7 }
    props.visibleSaveRequest = { requestId: 8, sourceFilter: 'all' }
    render(<DiscoverTab {...props} />)

    expect(await screen.findByRole('region', { name: 'Explorer mock' })).toBeVisible()
    expect(tabMocks.explorer).toHaveBeenLastCalledWith(expect.objectContaining({
      candidateRequest: props.candidateRequest,
      requiresSignIn: true,
      visibleSaveRequest: props.visibleSaveRequest,
      onCandidateRequestHandled: props.onCandidateRequestHandled,
      onSignIn: props.onSignIn,
    }))
  })
})
