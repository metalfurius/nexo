import { expect, test } from '@playwright/test'

const publicCatalogUrl = process.env.E2E_PUBLIC_CATALOG_URL || process.env.VITE_PUBLIC_CATALOG_URL
const modEmail = process.env.E2E_PROD_MOD_EMAIL
const modPassword = process.env.E2E_PROD_MOD_PASSWORD

test('production public catalog endpoint returns Dune in Todo', async ({ request }) => {
  expect(publicCatalogUrl, 'E2E_PUBLIC_CATALOG_URL or VITE_PUBLIC_CATALOG_URL must be configured').toBeTruthy()

  const response = await request.get(publicCatalogUrl as string, {
    params: {
      q: 'dune',
      type: 'any',
      limit: '24',
    },
  })
  expect(response.ok()).toBe(true)
  const payload = (await response.json()) as { items?: Array<{ title?: string; type?: string }> }
  const duneTypes = payload.items?.filter((item) => item.title === 'Dune').map((item) => item.type).sort() ?? []
  expect(duneTypes).toEqual(expect.arrayContaining(['book', 'movie']))
})

test('production anonymous UI searches Dune in Todo', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Buscar en el catalogo publico').fill('Dune')
  await page.getByRole('button', { name: /^Buscar$/ }).click()

  const duneCards = page.locator('article.catalog-public-card').filter({ hasText: 'Dune' })
  await expect(duneCards.first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'resultados para explorar' })).toBeVisible()
})

test('production moderator signs in with email without Google', async ({ page }) => {
  test.skip(!modEmail || !modPassword, 'Production moderator credentials are not configured.')

  await page.goto('/')
  await page.getByRole('button', { name: 'Entrar' }).click()

  const dialog = page.getByRole('dialog', { name: 'Entrar en Nexo' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Email').fill(modEmail as string)
  await dialog.getByLabel('Contraseña').fill(modPassword as string)
  await dialog.getByRole('button', { name: 'Entrar con email' }).click({ force: true })

  await expect(page.getByLabel(/Rol: (Admin|Moderador)/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Curacion' })).toBeVisible()
})
