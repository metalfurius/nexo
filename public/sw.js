const CACHE_VERSION = 'nexo-v1.1.50'
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/nexo.svg',
  '/icons/nexo-192.png',
  '/icons/nexo-512.png',
  '/icons/nexo-maskable-512.png',
  '/screenshots/nexo-wide.png',
  '/screenshots/nexo-narrow.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL)),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'NEXO_SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'))
    return
  }

  if (url.pathname.startsWith('/assets/') || APP_SHELL.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: 'window' })
      .then((clients) => {
        const focusedClient = clients.find((client) => 'focus' in client)
        if (focusedClient) {
          if ('navigate' in focusedClient && focusedClient.url !== targetUrl) {
            return focusedClient.navigate(targetUrl).then((client) => client?.focus() ?? focusedClient.focus())
          }
          return focusedClient.focus()
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(CACHE_VERSION)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) ?? (await cache.match(fallbackPath))
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION)
  const cached = await cache.match(request)
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)

  return cached ?? (await fresh) ?? Response.error()
}
