import { expect, test } from '@playwright/test'

const publicCatalogUrl = process.env.E2E_PUBLIC_CATALOG_URL || process.env.VITE_PUBLIC_CATALOG_URL
const catalogProxyUrl = process.env.E2E_CATALOG_API_URL || process.env.E2E_CATALOG_PROXY_URL
const backendHealthUrl = process.env.E2E_BACKEND_HEALTH_URL
const expectedRevision = process.env.E2E_EXPECTED_REVISION
const modEmail = process.env.E2E_PROD_MOD_EMAIL
const modPassword = process.env.E2E_PROD_MOD_PASSWORD

test('production backends expose the approved revision', async ({ request }) => {
  expect(expectedRevision, 'E2E_EXPECTED_REVISION must be configured').toBeTruthy()
  expect(catalogProxyUrl, 'E2E_CATALOG_API_URL must be configured').toBeTruthy()
  expect(backendHealthUrl, 'E2E_BACKEND_HEALTH_URL must be configured').toBeTruthy()

  const proxyHealthUrl = new URL('/health', catalogProxyUrl as string)
  for (const endpoint of [proxyHealthUrl.toString(), backendHealthUrl as string]) {
    const response = await request.get(endpoint)
    expect(response.ok(), endpoint).toBe(true)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ revision: expectedRevision }))
  }
})

test('production catalog Worker searches Dune through the v1 gateway', async ({ request }) => {
  expect(catalogProxyUrl, 'E2E_CATALOG_API_URL must be configured').toBeTruthy()

  const endpoint = new URL('/v1/catalog/search', catalogProxyUrl as string)
  endpoint.searchParams.set('q', 'Dune')
  endpoint.searchParams.set('type', 'any')
  endpoint.searchParams.set('limit', '24')
  const response = await request.get(endpoint.toString(), {
    headers: { origin: 'https://nexo.codeoverdose.es' },
  })

  expect(response.ok()).toBe(true)
  expect(response.headers()['access-control-allow-origin']).toBe('https://nexo.codeoverdose.es')
  const payload = (await response.json()) as { results?: Array<{ title?: string }> }
  expect(payload.results?.some((item) => item.title?.toLocaleLowerCase('es').includes('dune'))).toBe(true)
})

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
  expect(duneTypes.length).toBeGreaterThan(0)
})

test('production anonymous UI searches Dune in Todo', async ({ page }) => {
  expect(publicCatalogUrl, 'E2E_PUBLIC_CATALOG_URL or VITE_PUBLIC_CATALOG_URL must be configured').toBeTruthy()
  expect(catalogProxyUrl, 'E2E_CATALOG_API_URL must be configured').toBeTruthy()
  const publicEndpoint = new URL(publicCatalogUrl as string)
  const gatewayEndpoint = new URL(
    'v1/catalog/search',
    (catalogProxyUrl as string).endsWith('/') ? catalogProxyUrl as string : `${catalogProxyUrl}/`,
  )
  const counts = { callable: 0, directProvider: 0, gateway: 0, publicCatalog: 0 }
  const directProviderHosts = new Set([
    'api.rawg.io',
    'api.themoviedb.org',
    'books.googleapis.com',
    'graphql.anilist.co',
    'openlibrary.org',
  ])
  page.on('request', (request) => {
    const url = new URL(request.url())
    const isDuneRequest = url.searchParams.get('q')?.toLocaleLowerCase('es') === 'dune'
    if (isDuneRequest && url.origin === publicEndpoint.origin && url.pathname === publicEndpoint.pathname) {
      counts.publicCatalog += 1
    }
    if (isDuneRequest && url.origin === gatewayEndpoint.origin && url.pathname === gatewayEndpoint.pathname) {
      counts.gateway += 1
    }
    if (directProviderHosts.has(url.hostname)) counts.directProvider += 1
    if (/\/searchCatalog(?:\?|$)/.test(url.pathname)) counts.callable += 1
  })

  await page.goto('/')
  const catalogSearch = page.getByLabel('Buscar en el catalogo publico')
  await catalogSearch.fill('Dune')
  await page.evaluate(() => {
    const smokeWindow = window as Window & { __nexoCatalogSmokeMarker?: string }
    smokeWindow.__nexoCatalogSmokeMarker = 'search-started'
  })
  const catalogSearchForm = page.locator('form').filter({ has: catalogSearch })
  const catalogSubmit = catalogSearchForm.getByRole('button', { name: /^Buscar$/ })
  await expect(catalogSubmit).toBeEnabled()
  await catalogSubmit.click()

  await expect(page).toHaveURL(/[?&]tab=discover(?:&|$)/)
  await expect(page).toHaveURL(/[?&]mode=search(?:&|$)/)
  await expect(page).toHaveURL(/[?&]q=Dune(?:&|$)/)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const smokeWindow = window as Window & { __nexoCatalogSmokeMarker?: string }
        return smokeWindow.__nexoCatalogSmokeMarker
      }),
    )
    .toBe('search-started')
  await expect(catalogSearch).toHaveValue('Dune')
  const duneCards = page.locator('article.catalog-public-card').filter({ hasText: 'Dune' })
  await expect(duneCards.first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'resultados para explorar' })).toBeVisible()
  await expect(catalogSubmit).toBeEnabled()
  await expect.poll(() => counts).toEqual({ callable: 0, directProvider: 0, gateway: 1, publicCatalog: 1 })
  await page.waitForTimeout(3_000)
  expect(counts).toEqual({ callable: 0, directProvider: 0, gateway: 1, publicCatalog: 1 })

  await page.reload()
  const reloadedCatalogSearch = page.getByLabel('Buscar en el catalogo publico')
  await expect(page).toHaveURL(/[?&]tab=discover(?:&|$)/)
  await expect(page).toHaveURL(/[?&]mode=search(?:&|$)/)
  await expect(page).toHaveURL(/[?&]q=Dune(?:&|$)/)
  await expect(reloadedCatalogSearch).toHaveValue('Dune')
  await expect(page.locator('article.catalog-public-card').filter({ hasText: 'Dune' }).first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'resultados para explorar' })).toBeVisible()
  expect(counts.callable).toBe(0)
  expect(counts.directProvider).toBe(0)
  expect(counts.gateway).toBeGreaterThanOrEqual(1)
  expect(counts.gateway).toBeLessThanOrEqual(2)
  expect(counts.publicCatalog).toBeGreaterThanOrEqual(1)
  expect(counts.publicCatalog).toBeLessThanOrEqual(2)
  const hydratedCounts = { ...counts }
  await page.waitForTimeout(3_000)
  expect(counts).toEqual(hydratedCounts)
})

test('production moderator signs in with email without Google', async ({ page }) => {
  expect(modEmail, 'E2E_PROD_MOD_EMAIL must be configured').toBeTruthy()
  expect(modPassword, 'E2E_PROD_MOD_PASSWORD must be configured').toBeTruthy()

  await page.goto('/')
  await page.locator('.topbar').getByRole('button', { name: 'Entrar' }).click()

  const dialog = page.getByRole('dialog', { name: 'Entrar en Nexo' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Email').fill(modEmail as string)
  await dialog.getByLabel('Contraseña').fill(modPassword as string)
  await dialog.getByRole('button', { name: 'Entrar con email' }).click()

  await expect(page.getByLabel(/Rol: (Admin|Moderador)/)).toBeVisible()
  await page.getByLabel('Más secciones').click()
  await page.getByRole('menuitem', { name: /Curar/ }).click()
  await expect(page).toHaveURL(/[?&]tab=curation(?:&|$)/)
  await expect(page.getByRole('heading', { name: 'Catalogo Nexo' })).toBeVisible()
})
