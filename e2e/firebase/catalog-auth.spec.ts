import { expect, test } from '@playwright/test'

const modEmail = process.env.E2E_FIREBASE_MOD_EMAIL || 'moderator@nexo.local'
const modPassword = process.env.E2E_FIREBASE_MOD_PASSWORD || 'nexo-moderator-password'
const publicCatalogUrl = 'http://127.0.0.1:5001/recomendaciones-78eb7/us-central1/publicCatalog'

test('anonymous public catalog searches Dune through the Firebase Function path', async ({ page, request }) => {
  const endpointResponse = await request.get(publicCatalogUrl, {
    params: {
      q: 'dune',
      type: 'any',
      limit: '24',
    },
  })
  expect(endpointResponse.ok()).toBe(true)
  const payload = (await endpointResponse.json()) as { items?: Array<{ title?: string; type?: string }> }
  expect(payload.items?.filter((item) => item.title === 'Dune').map((item) => item.type).sort()).toEqual(['book', 'movie'])

  let openLibraryCalls = 0
  await page.route('https://openlibrary.org/search.json**', async (route) => {
    openLibraryCalls += 1
    await route.fulfill({ contentType: 'application/json', json: { docs: [] } })
  })

  await page.goto('/')
  await page.getByLabel('Buscar en el catalogo publico').fill('Dune')
  await page.getByRole('button', { name: /^Buscar$/ }).click()

  const duneCards = page.locator('article.catalog-public-card').filter({ hasText: 'Dune' })
  await expect(duneCards.filter({ hasText: 'Libros' })).toBeVisible()
  await expect(duneCards.filter({ hasText: 'Cine' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'resultados para explorar' })).toBeVisible()
  expect(openLibraryCalls).toBe(0)
})

test('moderator can sign in with email and see curation without Google', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Entrar' }).click()

  const dialog = page.getByRole('dialog', { name: 'Entrar en Nexo' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Email').fill(modEmail)
  await dialog.getByLabel('Contraseña').fill(modPassword)
  await dialog.getByRole('button', { name: 'Entrar con email' }).click({ force: true })

  await expect(page.getByLabel('Rol: Moderador')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Curacion' })).toBeVisible()
})
