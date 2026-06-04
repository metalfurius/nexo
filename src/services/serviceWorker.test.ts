import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ListenerMap = Record<string, Array<() => void>>

function addListener(listeners: ListenerMap, event: string, listener: () => void) {
  listeners[event] = [...(listeners[event] ?? []), listener]
}

function fire(listeners: ListenerMap, event: string) {
  for (const listener of listeners[event] ?? []) listener()
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function trapLoadEvent() {
  const loadListeners: Array<(event: Event) => void> = []
  const addEventListener = window.addEventListener.bind(window)

  vi.spyOn(window, 'addEventListener').mockImplementation((event, listener, options) => {
    if (event === 'load' && typeof listener === 'function') {
      loadListeners.push(listener as (event: Event) => void)
      return
    }

    addEventListener(event, listener, options)
  })

  return () => {
    const event = new Event('load')
    for (const listener of loadListeners) listener(event)
  }
}

describe('service worker registration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('announces a waiting service worker and applies the update on request', async () => {
    const fireLoad = trapLoadEvent()
    const registrationListeners: ListenerMap = {}
    const waitingWorker = { postMessage: vi.fn() } as unknown as ServiceWorker
    const registration = {
      addEventListener: vi.fn((event: string, listener: () => void) => addListener(registrationListeners, event, listener)),
      installing: undefined,
      waiting: waitingWorker,
    } as unknown as ServiceWorkerRegistration
    const serviceWorker = {
      addEventListener: vi.fn(),
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    }
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    })

    const { SERVICE_WORKER_UPDATE_READY_EVENT, applyServiceWorkerUpdate, registerServiceWorker } = await import(
      './serviceWorker'
    )
    const updateReady = vi.fn()
    window.addEventListener(SERVICE_WORKER_UPDATE_READY_EVENT, updateReady)

    registerServiceWorker({ enabled: true })
    fireLoad()
    await flushPromises()

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js')
    expect(updateReady).toHaveBeenCalledTimes(1)

    applyServiceWorkerUpdate()
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'NEXO_SKIP_WAITING' })
  })

  it('announces a newly installed worker only when the page already has a controller', async () => {
    const fireLoad = trapLoadEvent()
    const registrationListeners: ListenerMap = {}
    const installingListeners: ListenerMap = {}
    const installingWorker = {
      addEventListener: vi.fn((event: string, listener: () => void) => addListener(installingListeners, event, listener)),
      postMessage: vi.fn(),
      state: 'installing',
    } as unknown as ServiceWorker
    const registration = {
      addEventListener: vi.fn((event: string, listener: () => void) => addListener(registrationListeners, event, listener)),
      installing: installingWorker,
      waiting: undefined,
    } as unknown as ServiceWorkerRegistration
    const serviceWorker = {
      addEventListener: vi.fn(),
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    }
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    })

    const { SERVICE_WORKER_UPDATE_READY_EVENT, applyServiceWorkerUpdate, registerServiceWorker } = await import(
      './serviceWorker'
    )
    const updateReady = vi.fn()
    window.addEventListener(SERVICE_WORKER_UPDATE_READY_EVENT, updateReady)

    registerServiceWorker({ enabled: true })
    fireLoad()
    await flushPromises()
    fire(registrationListeners, 'updatefound')
    Object.defineProperty(installingWorker, 'state', { configurable: true, value: 'installed' })
    fire(installingListeners, 'statechange')

    expect(updateReady).toHaveBeenCalledTimes(1)

    applyServiceWorkerUpdate()
    expect(installingWorker.postMessage).toHaveBeenCalledWith({ type: 'NEXO_SKIP_WAITING' })
  })

  it('does not register outside production unless explicitly enabled', async () => {
    const fireLoad = trapLoadEvent()
    const serviceWorker = {
      addEventListener: vi.fn(),
      register: vi.fn(),
    }
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    })

    const { registerServiceWorker } = await import('./serviceWorker')
    registerServiceWorker()
    fireLoad()
    await flushPromises()

    expect(serviceWorker.register).not.toHaveBeenCalled()
  })
})
