import { expect, test, type Locator, type Page } from '@playwright/test'

const modEmail = process.env.E2E_FIREBASE_MOD_EMAIL || 'moderator@nexo.local'
const modPassword = process.env.E2E_FIREBASE_MOD_PASSWORD || 'nexo-moderator-password'
const publicCatalogUrl = 'http://127.0.0.1:5001/recomendaciones-78eb7/us-central1/publicCatalog'
const anonymousSurprise = {
  id: 'rawg-anonymous-privacy',
  title: 'Hallazgo anonimo privado',
  type: 'game',
  source: 'rawg',
  sourceId: 'anonymous-privacy',
  overview: 'Resultado publico que no debe guardarse sin sesion.',
  posterUrl: 'https://images.example.test/anonymous-privacy.svg',
  genres: ['Aventura'],
  externalRefs: {},
  createdAt: '2026-07-11T00:00:00.000Z',
}

test('anonymous mode can search the public catalog and gates private routes', async ({ page, request }) => {
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
  await page.route('https://images.example.test/**', async (route) => {
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#245c66"/></svg>',
      contentType: 'image/svg+xml',
    })
  })
  await page.route('**/catalog-proxy/discover**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { result: anonymousSurprise } })
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Descubrir' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('El catalogo se puede mirar sin cuenta.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar' }).first()).toBeVisible()

  const catalogSearch = page.getByLabel('Buscar en el catalogo publico')
  await catalogSearch.fill('Dune')
  await page.getByRole('button', { name: /^Buscar$/ }).click()

  await expect(page).toHaveURL(/tab=discover/)
  await expect(page).toHaveURL(/mode=search/)
  await expect(page).toHaveURL(/q=Dune/)
  await expect(catalogSearch).toHaveValue('Dune')
  const duneCards = page.locator('article.catalog-public-card').filter({ hasText: 'Dune' })
  await expect(duneCards.filter({ hasText: 'Libros' })).toBeVisible()
  await expect(duneCards.filter({ hasText: 'Cine' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'resultados para explorar' })).toBeVisible()
  expect(openLibraryCalls).toBe(0)

  await page.reload()
  const reloadedCatalogSearch = page.getByLabel('Buscar en el catalogo publico')
  await expect(reloadedCatalogSearch).toHaveValue('Dune')
  const reloadedDuneCards = page.locator('article.catalog-public-card').filter({ hasText: 'Dune' })
  await expect(reloadedDuneCards.filter({ hasText: 'Libros' })).toBeVisible()
  await expect(reloadedDuneCards.filter({ hasText: 'Cine' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'resultados para explorar' })).toBeVisible()
  expect(openLibraryCalls).toBe(0)

  await page.goBack()
  await expect(page).not.toHaveURL(/[?&]q=/)
  await expect(page.getByLabel('Buscar en el catalogo publico')).toHaveValue('')

  const discoverModes = page.getByRole('navigation', { name: 'Modos de Descubrir' })
  await discoverModes.getByRole('button', { name: /^Sorprendeme/ }).click()
  await page.getByRole('button', { name: 'Sorprendeme', exact: true }).last().click()
  const anonymousResult = page.getByTestId('explorer-random-result')
  await expect(anonymousResult).toContainText(anonymousSurprise.title)
  await anonymousResult.getByRole('button', { name: 'Guardar', exact: true }).click()
  const saveGate = page.getByRole('dialog', { name: 'Entrar en Nexo' })
  await expect(saveGate).toBeVisible()
  await saveGate.getByRole('button', { name: 'Cerrar acceso a Nexo' }).click()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const anonymousPalette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await anonymousPalette.getByLabel('Buscar en Nexo').fill('E2E Pendiente A')
  await expect(anonymousPalette.getByRole('button', { name: 'Abrir E2E Pendiente A' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Inicio' }).click()
  await expect(page.getByRole('dialog', { name: 'Entrar en Nexo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Descubrir' })).toHaveAttribute('aria-current', 'page')
})

test('email login opens Inicio and roadmap mutations persist through reload and undo', async ({ page }) => {
  await page.goto('/')
  await signIn(page)

  await expect(page).toHaveURL(/tab=home/)
  await expect(page.getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Tu ruta' })).toBeVisible()
  await expect(page.getByLabel('Rol: Moderador')).toBeVisible()
  const moreMenu = page.locator('details.tabbar-more')
  await moreMenu.locator(':scope > summary').click()
  await expect(moreMenu.getByRole('menuitem', { name: /Curar/ })).toBeVisible()
  await page.keyboard.press('Escape')

  const nextLane = roadmapLane(page, 'Despues')
  const laterLane = roadmapLane(page, 'Mas adelante')
  await expectRoadmapOrder(nextLane, ['E2E Pendiente A', 'E2E Pendiente B'])
  await expectRoadmapOrder(laterLane, ['E2E Mas adelante'])

  const laterCard = roadmapCard(laterLane, 'E2E Mas adelante')
  await openOrganizeMenu(laterCard)
  await laterCard.getByRole('button', { name: 'Mover a Despues' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'E2E Mas adelante movida a Despues' })).toBeVisible()
  await expectRoadmapOrder(nextLane, ['E2E Pendiente A', 'E2E Pendiente B', 'E2E Mas adelante'])

  const movedCard = roadmapCard(nextLane, 'E2E Mas adelante')
  await openOrganizeMenu(movedCard)
  await movedCard.getByRole('button', { name: 'Subir' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'E2E Mas adelante sube en la ruta' })).toBeVisible()
  await expectRoadmapOrder(nextLane, ['E2E Pendiente A', 'E2E Mas adelante', 'E2E Pendiente B'])

  await reloadHome(page)
  await expectRoadmapOrder(roadmapLane(page, 'Despues'), ['E2E Pendiente A', 'E2E Mas adelante', 'E2E Pendiente B'])
  await expectRoadmapOrder(roadmapLane(page, 'Mas adelante'), [])

  const itemToComplete = roadmapCard(roadmapLane(page, 'Despues'), 'E2E Pendiente B')
  await openOrganizeMenu(itemToComplete)
  await itemToComplete.getByRole('button', { name: 'Completar' }).click()

  const completionStatus = page.getByRole('status').filter({ hasText: 'E2E Pendiente B completada' })
  await expect(completionStatus).toBeVisible()
  await expect(roadmapCard(roadmapLane(page, 'Despues'), 'E2E Pendiente B')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Completadas recientes' }).getByRole('button', { name: /E2E Pendiente B/ })).toBeVisible()

  await completionStatus.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cambio deshecho' })).toBeVisible()
  await expectRoadmapOrder(roadmapLane(page, 'Despues'), ['E2E Pendiente A', 'E2E Mas adelante', 'E2E Pendiente B'])

  await reloadHome(page)
  await expectRoadmapOrder(roadmapLane(page, 'Despues'), ['E2E Pendiente A', 'E2E Mas adelante', 'E2E Pendiente B'])
  await expect(page.getByRole('region', { name: 'Completadas recientes' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const signedInPalette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await signedInPalette.getByLabel('Buscar en Nexo').fill('E2E Pendiente A')
  await expect(signedInPalette.getByRole('button', { name: 'Abrir E2E Pendiente A' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page.getByRole('button', { name: 'Descubrir' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('Rol: Moderador')).toHaveCount(0)
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const signedOutPalette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await signedOutPalette.getByLabel('Buscar en Nexo').fill('E2E Pendiente A')
  await expect(signedOutPalette.getByRole('button', { name: 'Abrir E2E Pendiente A' })).toHaveCount(0)
})

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Entrar' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Entrar en Nexo' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Email').fill(modEmail)
  await dialog.getByLabel(/Contrase/).fill(modPassword)
  await dialog.getByRole('button', { name: 'Entrar con email' }).click()
}

async function reloadHome(page: Page) {
  await page.reload()
  await expect(page).toHaveURL(/tab=home/)
  await expect(page.getByLabel('Rol: Moderador')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Tu ruta' })).toBeVisible()
}

function roadmapLane(page: Page, heading: string) {
  return page.getByRole('region', { name: heading, exact: true })
}

function roadmapCard(lane: Locator, title: string) {
  return lane.getByRole('article').filter({ hasText: title })
}

async function openOrganizeMenu(card: Locator) {
  const menu = card.locator('details.roadmap-card-menu')
  if (!(await menu.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await card.getByLabel(/^Organizar /).click()
  }
}

async function expectRoadmapOrder(lane: Locator, titles: string[]) {
  await expect(lane.locator('.roadmap-card-main > span > strong')).toHaveText(titles)
}
