import { expect, test } from '@playwright/test'

test('instala el service worker y recarga una ruta profunda sin red', async ({ context, page }) => {
  await page.goto('/?tab=library')
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    return Boolean(navigator.serviceWorker.controller)
  })

  const cacheNames = await page.evaluate(() => caches.keys())
  expect(cacheNames.length).toBeGreaterThan(0)
  expect(cacheNames.every((name) => name.startsWith('nexo-'))).toBe(true)

  await context.setOffline(true)
  try {
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Outer Wilds' })).toBeVisible()
    await expect(page.getByLabel('Sin conexion')).toBeVisible()
  } finally {
    await context.setOffline(false)
  }

  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
})
