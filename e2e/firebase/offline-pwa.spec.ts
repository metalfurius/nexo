import { expect, test } from '@playwright/test'

const modEmail = process.env.E2E_FIREBASE_MOD_EMAIL || 'moderator@nexo.local'
const modPassword = process.env.E2E_FIREBASE_MOD_PASSWORD || 'nexo-moderator-password'
test('recarga una ruta profunda offline y sincroniza una escritura pendiente al reconectar', async ({ context, page }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('nexo-firestore-offline-persistence', 'enabled')
  })

  await page.goto('/?tab=library')
  await page.locator('.topbar').getByRole('button', { name: 'Entrar' }).click()
  const signInDialog = page.getByRole('dialog', { name: 'Entrar en Nexo' })
  await signInDialog.getByLabel('Email').fill(modEmail)
  await signInDialog.getByLabel(/Contrase/).fill(modPassword)
  await signInDialog.getByRole('button', { name: 'Entrar con email' }).click()
  await expect(page.getByLabel('Rol: Moderador')).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca' }).click()

  const statusSelect = page.getByLabel('Cambiar estado de E2E Pendiente A')
  await expect(statusSelect).toBeVisible()
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    return Boolean(navigator.serviceWorker.controller)
  })

  await context.setOffline(true)
  try {
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
    await statusSelect.selectOption('in_progress')
    await expect(statusSelect).toHaveValue('in_progress')
    await expect(page.getByTestId('library-filter-summary')).toContainText('Sincronizando cambios')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/[?&]tab=library(?:&|$)/)
    await expect(page.getByRole('heading', { name: 'Biblioteca', exact: true, level: 2 })).toBeVisible()
    await expect(page.getByLabel('Cambiar estado de E2E Pendiente A')).toHaveValue('in_progress')
    await expect(page.getByLabel('Sin conexion')).toBeVisible()
  } finally {
    await context.setOffline(false)
  }

  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
  await expect(page.getByTestId('library-filter-summary')).toContainText('Al dia')
  await expect(page.getByLabel('Sin conexion')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Cambiar estado de E2E Pendiente A')).toHaveValue('in_progress')
})
