/// <reference lib="webworker" />

import { cacheNames, clientsClaim, setCacheNameDetails } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { NetworkFirst } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

const appVersion = String(import.meta.env.VITE_APP_VERSION ?? '0.0.0').trim() || '0.0.0'
const cacheSuffix = `v${appVersion.replace(/[^a-zA-Z0-9._-]/g, '-')}`
const navigationCacheName = `nexo-navigation-${cacheSuffix}`

setCacheNameDetails({
  prefix: 'nexo',
  precache: 'precache',
  runtime: 'runtime',
  suffix: cacheSuffix,
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
clientsClaim()

registerRoute(
  ({ request, url }) => request.mode === 'navigate' && url.origin === self.location.origin,
  new NetworkFirst({
    cacheName: navigationCacheName,
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: 7 * 24 * 60 * 60,
        maxEntries: 24,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

setCatchHandler(async ({ request }) => {
  if (request.destination !== 'document') return Response.error()
  return (await matchPrecache('/index.html')) ?? (await matchPrecache('/')) ?? Response.error()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'NEXO_SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const activeNexoCaches = new Set([cacheNames.precache, navigationCacheName])
      return Promise.all(
        keys
          .filter((key) => key.startsWith('nexo-') && !activeNexoCaches.has(key))
          .map((key) => caches.delete(key)),
      )
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = resolveNotificationTarget(event.notification.data?.url)

  event.waitUntil(focusOrOpenWindow(targetUrl))
})

function resolveNotificationTarget(value: unknown) {
  if (typeof value !== 'string') return new URL('/', self.location.origin).href

  try {
    const target = new URL(value, self.location.origin)
    return target.origin === self.location.origin ? target.href : new URL('/', self.location.origin).href
  } catch {
    return new URL('/', self.location.origin).href
  }
}

async function focusOrOpenWindow(targetUrl: string) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  const existingClient = clients.find((client) => 'focus' in client) as WindowClient | undefined

  if (existingClient) {
    const targetClient = existingClient.url === targetUrl ? existingClient : await existingClient.navigate(targetUrl)
    return (targetClient ?? existingClient).focus()
  }

  return self.clients.openWindow(targetUrl)
}
