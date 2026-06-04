export const SERVICE_WORKER_UPDATE_READY_EVENT = 'nexo:service-worker-update-ready'

const skipWaitingMessage = { type: 'NEXO_SKIP_WAITING' }

let waitingServiceWorker: ServiceWorker | undefined
let reloadingForUpdate = false

export function applyServiceWorkerUpdate() {
  waitingServiceWorker?.postMessage(skipWaitingMessage)
}

export function registerServiceWorker(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? import.meta.env.PROD
  if (!enabled || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return

      reloadingForUpdate = true
      window.location.reload()
    })

    void navigator.serviceWorker.register('/sw.js').then(trackServiceWorkerUpdate).catch(() => undefined)
  })
}

function trackServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    notifyUpdateReady(registration.waiting)
  }

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing
    if (!installingWorker) return

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        notifyUpdateReady(installingWorker)
      }
    })
  })
}

function notifyUpdateReady(worker: ServiceWorker) {
  waitingServiceWorker = worker
  window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_READY_EVENT))
}
