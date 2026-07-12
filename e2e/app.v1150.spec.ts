import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const externalBook = {
  id: 'open-library--works-OL166894W',
  title: 'Odisea',
  type: 'book',
  source: 'openLibrary',
  sourceId: '/works/OL166894W',
  overview: 'El viaje de regreso de Odiseo.',
  posterUrl: 'https://images.example.test/odisea.jpg',
  releaseYear: 1996,
  genres: ['Clasico', 'Aventura'],
  tags: [],
  moodTags: [],
  externalRefs: {
    openLibraryKey: '/works/OL166894W',
    sourceUrl: 'https://openlibrary.org/works/OL166894W',
  },
  createdAt: '2026-06-06T10:00:00.000Z',
}

const surpriseGame = {
  id: 'rawg-2454',
  title: 'V Rising',
  type: 'game',
  source: 'rawg',
  sourceId: '2454',
  overview: 'Supervivencia vampirica con exploracion.',
  posterUrl: 'https://images.example.test/v-rising.jpg',
  releaseYear: 2024,
  genres: ['Supervivencia', 'Accion'],
  tags: ['Vampiros'],
  moodTags: ['Intenso'],
  externalRefs: {
    rawgId: '2454',
    sourceUrl: 'https://rawg.io/games/v-rising',
  },
  createdAt: '2026-06-06T10:00:00.000Z',
}

test.beforeEach(async ({ page }) => {
  await page.route('https://images.example.test/**', async (route) => {
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#245c66"/></svg>',
      contentType: 'image/svg+xml',
    })
  })

  await page.route('**/catalog-proxy/search**', async (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q')?.toLowerCase() ?? ''
    await route.fulfill({
      contentType: 'application/json',
      json: { results: query.includes('odisea') ? [externalBook] : [] },
    })
  })

  await page.route('**/catalog-proxy/discover**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { result: surpriseGame } })
  })
})

function roadmapLane(page: Page, lane: 'now' | 'next' | 'later') {
  return page.locator(`.roadmap-lane.${lane}`)
}

function roadmapCard(page: Page, lane: 'now' | 'next' | 'later', title: string) {
  return roadmapLane(page, lane).locator('article.roadmap-card').filter({ hasText: title })
}

async function roadmapTitles(page: Page, lane: 'now' | 'next' | 'later') {
  return roadmapLane(page, lane).locator('.roadmap-card-main strong').allTextContents()
}

async function openUtility(page: Page, label: 'Importar' | 'Ajustes' | 'Curar') {
  const more = page.locator('details.tabbar-more')
  if (!(await more.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await more.locator(':scope > summary').click()
  }
  await more.getByRole('menuitem').filter({ hasText: label }).click()
}

async function selectDiscoverMode(page: Page, label: 'Buscar' | 'Sorprendeme' | 'Pendientes') {
  const modes = page.getByRole('navigation', { name: 'Modos de Descubrir' })
  await modes.getByRole('button', { name: new RegExp(`^${label}`) }).click()
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })))
    .toEqual(expect.objectContaining({
      client: expect.any(Number),
      scroll: expect.any(Number),
    }))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

async function expectNoReleaseA11yViolations(page: Page, label: string) {
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = audit.violations
    .filter((violation) => ['moderate', 'serious', 'critical'].includes(violation.impact ?? ''))
    .map((violation) => ({
      help: violation.help,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        failureSummary: node.failureSummary,
        target: node.target,
      })),
      rule: violation.id,
    }))
  expect(blocking, `${label} has moderate, serious or critical accessibility violations`).toEqual([])
}

async function expectNoContrastViolations(page: Page, label: string) {
  const audit = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const blocking = audit.violations.flatMap((violation) => violation.nodes.map((node) => ({
    failureSummary: node.failureSummary,
    target: node.target,
  })))
  expect(blocking, `${label} has WCAG AA contrast violations`).toEqual([])
}

async function openLibraryEditor(page: Page, title: string) {
  await page.getByRole('button', { name: `Editar ${title}` }).click()
  const editor = page.getByRole('dialog', { name: `Editar ${title}` })
  await expect(editor).toBeVisible()
  return editor
}

async function openSettingsDrawer(page: Page, testId: string) {
  const drawer = page.getByTestId(testId)
  if (!(await drawer.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await drawer.locator(':scope > summary').click()
  }
  await expect(drawer).toHaveAttribute('open', '')
  return drawer
}

async function createManualItem(page: Page, title: string) {
  await page.goto('/?tab=library')
  await page.getByRole('button', { name: 'Anadir manualmente' }).click()
  const editor = page.getByRole('dialog', { name: 'Anadir manualmente' })
  await editor.getByLabel('Titulo').fill(title)
  await editor.getByRole('button', { name: 'Guardar ficha' }).click()
  await expect(page.getByRole('status')).toContainText(`${title} guardada`)
}

test.describe('Inicio y Tu ruta', () => {
  test('abre Inicio por defecto con cuatro destinos primarios y tres carriles', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\?tab=home$/)
    await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Tu ruta', exact: true })).toBeVisible()
    await expect(page.locator('.tabbar-group.primary > button')).toHaveCount(4)
    await expect(page.locator('.tabbar-group.primary')).toContainText('Inicio')
    await expect(page.locator('.tabbar-group.primary')).toContainText('Descubrir')
    await expect(page.locator('.tabbar-group.primary')).toContainText('Biblioteca')
    await expect(page.locator('.tabbar-group.primary')).toContainText('Dado')
    await expect(roadmapLane(page, 'now')).toContainText('Ahora')
    await expect(roadmapLane(page, 'next')).toContainText('Despues')
    await expect(roadmapLane(page, 'later')).toContainText('Mas adelante')
    await expect(roadmapCard(page, 'next', 'Outer Wilds')).toContainText('Sugerido')
  })

  test('mueve y reordena sugerencias automaticas durante la sesion', async ({ page }) => {
    await page.goto('/?tab=home')
    await expect.poll(() => roadmapTitles(page, 'next')).toEqual(['Outer Wilds', 'Vinland Saga'])

    const outerWilds = roadmapCard(page, 'next', 'Outer Wilds')
    await outerWilds.getByLabel('Organizar Outer Wilds').click()
    await outerWilds.getByRole('button', { name: 'Mover a Mas adelante' }).click()

    const vinland = roadmapCard(page, 'next', 'Vinland Saga')
    await vinland.getByLabel('Organizar Vinland Saga').click()
    await vinland.getByRole('button', { name: 'Mover a Mas adelante' }).click()
    const movedVinland = roadmapCard(page, 'later', 'Vinland Saga')
    await movedVinland.getByLabel('Organizar Vinland Saga').click()
    await movedVinland.getByRole('button', { name: 'Subir' }).click()

    await expect.poll(() => roadmapTitles(page, 'later')).toEqual([
      'Vinland Saga',
      'Outer Wilds',
      'Pokemon Esmeralda',
      'Pokemon Esmeralda (Nuzlocke)',
    ])
    await page.getByRole('button', { name: 'Descubrir', exact: true }).click()
    await page.getByRole('button', { name: 'Inicio', exact: true }).click()
    await expect.poll(() => roadmapTitles(page, 'later')).toEqual([
      'Vinland Saga',
      'Outer Wilds',
      'Pokemon Esmeralda',
      'Pokemon Esmeralda (Nuzlocke)',
    ])
  })

  test('permite volver una colocacion manual al orden automatico', async ({ page }) => {
    await page.goto('/?tab=home')
    const outerWilds = roadmapCard(page, 'next', 'Outer Wilds')
    await outerWilds.getByLabel('Organizar Outer Wilds').click()
    await outerWilds.getByRole('button', { name: 'Mover a Mas adelante' }).click()
    const manual = roadmapCard(page, 'later', 'Outer Wilds')
    await expect(manual).toContainText('Fijado')
    await manual.getByLabel('Organizar Outer Wilds').click()
    await manual.getByRole('button', { name: 'Volver a automatico' }).click()
    await expect(roadmapCard(page, 'next', 'Outer Wilds')).toContainText('Sugerido')
  })

  test('completa una obra, registra actividad y deshace la transicion', async ({ page }) => {
    await page.goto('/?tab=home')
    const outerWilds = roadmapCard(page, 'next', 'Outer Wilds')
    await outerWilds.getByLabel('Organizar Outer Wilds').click()
    await outerWilds.getByRole('button', { name: 'Completar' }).click()

    const status = page.getByRole('status').filter({ hasText: 'Outer Wilds completada' })
    await expect(status).toBeVisible()
    await expect(page.getByLabel('Completadas recientes')).toContainText('Outer Wilds')
    await expect(page.getByTestId('session-activity')).toContainText('Tu ruta actualizada')
    await status.getByRole('button', { name: 'Deshacer' }).click()
    await expect(roadmapLane(page, 'next')).toContainText('Outer Wilds')
    await expect(page.getByLabel('Completadas recientes')).not.toContainText('Outer Wilds')
  })

  test('abre una ficha desde la ruta y mantiene el deep link', async ({ page }) => {
    await page.goto('/?tab=home')
    await roadmapCard(page, 'next', 'Outer Wilds').locator('.roadmap-card-main').click()
    await expect(page).toHaveURL(/tab=library&item=game-outer-wilds/)
    const editor = page.getByRole('dialog', { name: 'Editar Outer Wilds' })
    await expect(editor).toBeVisible()
    await editor.getByRole('button', { name: 'Cerrar editor' }).click()
    await expect(page).toHaveURL(/tab=library/)
    await expect(page).not.toHaveURL(/item=/)
  })

  test('elige con Dado solo desde Despues y deja trazabilidad', async ({ page }) => {
    await page.goto('/?tab=home')
    await page.getByRole('button', { name: 'Elegir con Dado' }).click()
    await expect(page.getByText('Eligiendo primero entre las obras de Despues.')).toBeVisible()
    const result = page.getByTestId('recommendation-result')
    await expect(result).toContainText(/Outer Wilds|Vinland Saga/)
    await expect(result).not.toContainText(/Inception|1984 - George Orwell|Pokemon Esmeralda/)
    await page.getByRole('button', { name: 'Inicio', exact: true }).click()
    await expect(page.getByTestId('session-activity')).toContainText('Tirada registrada')
  })

  test('muestra onboarding accionable cuando la biblioteca esta vacia', async ({ page }) => {
    await page.goto('/?tab=settings')
    const privateData = await openSettingsDrawer(page, 'settings-private-data-drawer')
    await privateData.getByTestId('private-action-plan').getByRole('button', { name: /Borrar entradas/ }).click()
    const confirmation = page.getByRole('dialog', { name: 'Borrar entradas privadas' })
    await confirmation.getByLabel('Confirmacion').fill('BORRAR')
    await confirmation.getByRole('button', { name: 'Borrar entradas' }).click()
    await expect(page.getByText('Tus entradas privadas han sido borradas')).toBeVisible()
    await page.getByRole('button', { name: 'Inicio', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Construye una ruta que apetezca seguir' })).toBeVisible()
    await expect(page.getByLabel('Primeros pasos de Nexo')).toContainText('1. Añade')
    await expect(page.getByRole('button', { name: 'Añadir primera obra' })).toBeVisible()
  })
})

test.describe('Anadir global y Descubrir', () => {
  test('crea una obra manualmente desde el Anadir global', async ({ page }) => {
    await page.goto('/?tab=home')
    await page.locator('.global-add-button').click()
    const add = page.getByRole('dialog', { name: 'Añadir a Nexo' })
    await add.getByRole('button', { name: 'Crear manualmente' }).click()
    const editor = page.getByRole('dialog', { name: 'Anadir manualmente' })
    await editor.getByLabel('Titulo').fill('La ciudad y la ciudad')
    await editor.getByRole('button', { name: 'Guardar ficha' }).click()
    await expect(page.getByRole('status')).toContainText('La ciudad y la ciudad guardada')
    await page.getByRole('button', { name: 'Inicio', exact: true }).click()
    await expect(page.getByLabel('Tu ruta de obras')).toContainText('La ciudad y la ciudad')
  })

  test('manda una busqueda global a la URL canonica de Descubrir', async ({ page }) => {
    await page.goto('/?tab=home')
    await page.locator('.global-add-button').click()
    const add = page.getByRole('dialog', { name: 'Añadir a Nexo' })
    await add.getByLabel('Buscar obra para añadir').fill('Odisea')
    await add.getByRole('button', { name: 'Buscar' }).click()
    await expect(page).toHaveURL(/tab=discover/)
    await expect(page).toHaveURL(/mode=search/)
    await expect(page).toHaveURL(/q=Odisea/)
    await expect(page.getByLabel('Buscar en el catalogo publico')).toHaveValue('Odisea')
    await expect(page.getByRole('heading', { name: 'Odisea' }).first()).toBeVisible()
  })

  test('abre Importar desde el Anadir global', async ({ page }) => {
    await page.goto('/?tab=home')
    await page.locator('.global-add-button').click()
    await page.getByRole('dialog', { name: 'Añadir a Nexo' }).getByRole('button', { name: 'Importar biblioteca' }).click()
    await expect(page).toHaveURL(/tab=import/)
    await expect(page.getByRole('heading', { name: 'Importar bibliotecas' })).toBeVisible()
  })

  test('mantiene Buscar, Sorprendeme y Pendientes bajo una sola pestaña', async ({ page }) => {
    await page.goto('/?tab=discover&mode=search')
    const modes = page.getByRole('navigation', { name: 'Modos de Descubrir' })
    await expect(modes.getByRole('button')).toHaveCount(3)
    await expect(modes.getByRole('button', { name: /^Buscar/ })).toHaveAttribute('aria-current', 'page')
    await selectDiscoverMode(page, 'Sorprendeme')
    await expect(page).toHaveURL(/mode=surprise/)
    await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
    await selectDiscoverMode(page, 'Pendientes')
    await expect(page).toHaveURL(/mode=queue/)
    await page.goBack()
    await expect(page).toHaveURL(/mode=surprise/)
  })

  test('canoniza rutas antiguas de Catalogo y Explorador', async ({ page }) => {
    await page.goto('/?tab=catalog&catalogQ=Odisea&catalogType=book')
    await expect(page).toHaveURL(/tab=discover/)
    await expect(page).toHaveURL(/mode=search/)
    await expect(page).toHaveURL(/q=Odisea/)
    await expect(page).not.toHaveURL(/catalogQ|catalogType/)
    await page.goto('/?tab=explorer')
    await expect(page).toHaveURL(/tab=discover/)
    await expect(page).toHaveURL(/mode=surprise/)
  })

  test('el catalogo anonimo busca solo en Nexo y protege las acciones privadas', async ({ page }) => {
    let externalSearches = 0
    await page.route('**/catalog-proxy/search**', async (route) => {
      externalSearches += 1
      await route.fulfill({ contentType: 'application/json', json: { results: [externalBook] } })
    })
    await page.goto('/?tab=discover&mode=search')
    await page.getByLabel('Buscar en el catalogo publico').fill('Odisea')
    await page.getByTestId('catalog-public-masthead').getByRole('button', { name: 'Buscar', exact: true }).click()
    const card = page.locator('article.catalog-public-card').filter({ hasText: 'Odisea' })
    await expect(card).toBeVisible()
    expect(externalSearches).toBe(0)
    await card.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Entra en Nexo para guardar obras')
    await card.getByRole('button', { name: 'Mandar al Explorador Odisea' }).click()
    await expect(page.getByRole('status')).toContainText('Entra en Nexo para mandar hallazgos')
    await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
    await expect(page.getByTestId('library-grid')).not.toContainText('Odisea')
  })

  test('sorprende, guarda y coloca el resultado externo en la ruta', async ({ page }) => {
    await page.goto('/?tab=discover&mode=surprise')
    await page.getByRole('button', { name: 'Sorprendeme', exact: true }).last().click()
    const result = page.getByTestId('explorer-random-result')
    await expect(result).toContainText('V Rising')
    await result.getByRole('button', { name: 'Guardar', exact: true }).click()
    const followup = page.getByLabel('Siguiente paso de la obra guardada')
    await expect(followup).toContainText('V Rising')
    await followup.getByRole('button', { name: 'Poner en Despues' }).click()
    await page.getByRole('button', { name: 'Inicio', exact: true }).click()
    await expect(roadmapLane(page, 'next')).toContainText('V Rising')
  })

  test('envia un hallazgo a Pendientes y lo resuelve desde la cola', async ({ page }) => {
    await page.goto('/?tab=discover&mode=queue')
    const history = page.locator('details.explorer-history-panel')
    if (!(await history.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await history.locator(':scope > summary').click()
    }
    await history.getByLabel('Buscar en explorador').fill('Odisea')
    await history.getByLabel('Tipo de busqueda en explorador').selectOption('book')
    await history.locator('form.explorer-search button[type="submit"]').click()
    const spotlight = page.getByTestId('candidate-spotlight')
    await expect(spotlight).toContainText('Odisea')
    await spotlight.getByRole('button', { name: 'Guardar Odisea' }).click()
    await expect(page.getByText(/Odisea guardado en Biblioteca/)).toBeVisible()
  })
})

test.describe('Biblioteca y Dado simplificados', () => {
  test('busca, filtra, ordena y cambia densidad desde controles progresivos', async ({ page }) => {
    await page.goto('/?tab=library')
    await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
    await page.getByLabel('Buscar en tu biblioteca').fill('Outer Wilds')
    await expect(page.getByTestId('library-grid').getByRole('listitem')).toHaveCount(1)
    await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
    await page.getByRole('button', { name: 'Filtros' }).click()
    await page.getByLabel('Filtrar por tipo').selectOption('game')
    await page.getByLabel('Ordenar biblioteca').selectOption('title')
    await page.getByLabel('Densidad de biblioteca').selectOption('list')
    await expect(page.getByTestId('library-grid')).toHaveAttribute('data-density', 'list')
    await page.getByRole('button', { name: 'Restablecer' }).click()
    await expect(page.getByLabel('Buscar en tu biblioteca')).toHaveValue('')
    await expect(page.getByTestId('library-filter-summary')).toContainText('7 de 7 obras')
  })

  test('actualiza estado y refleja el cambio en Tu ruta', async ({ page }) => {
    await page.goto('/?tab=library')
    await page.getByLabel('Cambiar estado de Outer Wilds').selectOption('in_progress')
    await expect(page.getByRole('status')).toContainText('Outer Wilds: en progreso')
    await page.getByRole('button', { name: 'Inicio', exact: true }).click()
    await expect(roadmapLane(page, 'now')).toContainText('Outer Wilds')
  })

  test('actualiza progreso desde Tu ruta con foco inicial y dos acciones principales', async ({ page }) => {
    await page.goto('/?tab=home')
    const card = roadmapLane(page, 'now').locator('article.roadmap-card').first()
    const title = (await card.locator('.roadmap-card-main strong').textContent())?.trim()
    expect(title).toBeTruthy()

    let primaryActions = 0
    await card.getByRole('button', { name: 'Actualizar progreso' }).click()
    primaryActions += 1

    const editor = page.getByRole('dialog', { name: `Editar ${title}` })
    const currentProgress = editor.getByLabel('Progreso actual')
    await expect(currentProgress).toBeFocused()
    await currentProgress.fill('9')
    await editor.getByRole('button', { name: 'Guardar ficha' }).click()
    primaryActions += 1

    await expect(editor).not.toBeVisible()
    const savedItem = page.getByTestId('library-grid').getByRole('listitem').filter({ hasText: title! })
    await expect(savedItem).toContainText('9')
    expect(primaryActions).toBeLessThanOrEqual(2)
  })

  test('crea, edita, borra y deshace una ficha privada', async ({ page }) => {
    await createManualItem(page, 'Manual 1.1.50')
    const editor = await openLibraryEditor(page, 'Manual 1.1.50')
    await editor.getByLabel('Notas').fill('Ficha simplificada')
    await editor.getByRole('button', { name: 'Guardar ficha' }).click()
    await expect(page.getByRole('status')).toContainText('Manual 1.1.50 guardada')
    await page.getByRole('button', { name: 'Borrar Manual 1.1.50' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Borrar Manual 1.1.50' })
    await confirm.getByRole('button', { name: 'Borrar definitivamente' }).click()
    const deleted = page.getByRole('status').filter({ hasText: 'Manual 1.1.50 eliminada' })
    await deleted.getByRole('button', { name: 'Deshacer' }).click()
    await expect(page.getByTestId('library-grid')).toContainText('Manual 1.1.50')
  })

  test('selecciona visibles y exporta sin abandonar la Biblioteca', async ({ page }) => {
    await page.goto('/?tab=library')
    await page.getByRole('button', { name: 'Filtros' }).click()
    await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
    await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 seleccionadas')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar seleccion' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^nexo-selection-.*\.json$/)
    await page.getByRole('button', { name: 'Limpiar seleccion' }).click()
    await expect(page.getByLabel('Seleccion de biblioteca')).toHaveCount(0)
  })

  test('abre el Dado desde Biblioteca y muestra encaje cualitativo', async ({ page }) => {
    await page.goto('/?tab=library')
    await page.getByRole('button', { name: 'Elegir con Dado' }).click()
    await expect(page).toHaveURL(/tab=dice/)
    await page.getByTestId('roll-button').click()
    const result = page.getByTestId('recommendation-result')
    await expect(result).toContainText('Encaje')
    await expect(result).toContainText(/Alto|Medio|Bajo/)
    const scoreDetails = result.locator('details.dice-score-details')
    await expect(scoreDetails).not.toHaveAttribute('open', '')
    await expect(scoreDetails.locator(':scope > div')).not.toBeVisible()
    await scoreDetails.getByText('Desglose de puntuacion').click()
    await expect(scoreDetails).toHaveAttribute('open', '')
    await expect(scoreDetails.locator(':scope > div')).toContainText(/Valor tecnico \d+/)
  })

  test('cierra una decision y permite tirar otra sin salir del Dado', async ({ page }) => {
    await page.goto('/?tab=dice')
    await page.getByTestId('roll-button').click()
    const result = page.getByTestId('recommendation-result')
    await result.getByRole('button', { name: 'No hoy' }).click()
    const decision = page.getByTestId('dice-decision-summary')
    await expect(decision).toContainText('Decision cerrada')
    await expect(decision).toContainText(/apartad/)
    await decision.getByRole('button', { name: 'Tirar otra' }).click()
    await expect(page.getByTestId('recommendation-result')).toContainText('Dado eligio')
  })
})

test.describe('Shell, utilidades y operaciones', () => {
  test('agrupa Importar, Ajustes y Curar en Mas con foco y estado activo', async ({ page }) => {
    await page.goto('/?tab=home')
    const more = page.locator('details.tabbar-more')
    await more.locator(':scope > summary').click()
    await expect(more.getByRole('menuitem')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(more).not.toHaveAttribute('open', '')
    await expect(more.locator(':scope > summary')).toBeFocused()

    await openUtility(page, 'Ajustes')
    await expect(page).toHaveURL(/tab=settings/)
    await expect(page.getByRole('heading', { name: 'Tu Nexo' })).toBeVisible()
    await expect(more.locator(':scope > summary')).toHaveClass(/active/)
    await openUtility(page, 'Importar')
    await expect(page).toHaveURL(/tab=import/)
    await openUtility(page, 'Curar')
    await expect(page).toHaveURL(/tab=curation/)
    await expect(page.getByRole('heading', { name: 'Catalogo Nexo' })).toBeVisible()
  })

  test('limita la busqueda rapida a siete prioridades y abre fichas y secciones', async ({ page }) => {
    await page.goto('/?tab=home')
    await page.getByRole('button', { name: 'Busqueda rapida' }).click()
    let palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
    await expect(palette.locator('.quick-search-result')).toHaveCount(7)
    await expect(palette.getByRole('button', { name: 'Abrir Inicio' })).toBeVisible()
    await expect(palette.getByRole('button', { name: 'Abrir Descubrir' })).toBeVisible()
    await palette.getByLabel('Buscar en Nexo').fill('Outer Wilds')
    await palette.getByRole('button', { name: 'Abrir Outer Wilds' }).click()
    await expect(page).toHaveURL(/tab=library&item=game-outer-wilds/)
    await page.getByRole('dialog', { name: 'Editar Outer Wilds' }).getByRole('button', { name: 'Cerrar editor' }).click()

    await page.getByRole('button', { name: 'Busqueda rapida' }).click()
    palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
    await palette.getByLabel('Buscar en Nexo').fill('Manual paleta')
    await palette.getByRole('button', { name: 'Crear entrada Manual paleta' }).click()
    await expect(page.getByRole('dialog', { name: 'Anadir manualmente' }).getByLabel('Titulo')).toHaveValue('Manual paleta')
  })

  test('importa un CSV oficial de Goodreads y abre la obra privada', async ({ page }) => {
    await page.goto('/?tab=import')
    await page.getByLabel('Importar CSV oficial de Goodreads').setInputFiles({
      name: 'goodreads-1.1.50.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Bookshelves,Original Publication Year,My Review',
        '1150,Importada 1.1.50,Autora,,4,read,favoritas,2026,Lista para Nexo',
      ].join('\n')),
    })
    const preview = page.getByLabel('Preview de importacion Goodreads')
    await expect(preview).toContainText('1 seleccionadas')
    await preview.getByRole('button', { name: 'Importar todo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Goodreads' })
    await expect(dialog).toContainText('Importadas 1 entradas desde Goodreads')
    await dialog.getByRole('button', { name: 'Ver Biblioteca' }).click()
    await expect(page.getByTestId('library-grid')).toContainText('Importada 1.1.50')
  })

  test('ofrece siete temas y persiste la apariencia elegida', async ({ page }) => {
    await page.goto('/?tab=settings')
    const themeStage = page.getByTestId('settings-theme-stage')
    await expect(themeStage.locator('.theme-option')).toHaveCount(7)
    await themeStage.getByRole('button', { name: 'Tema Claro' }).click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8faf9')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('expone metadatos PWA, shortcuts 1.1.50 y estados offline/update', async ({ context, page }) => {
    await page.goto('/?tab=home')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    const response = await page.request.get('/manifest.webmanifest')
    expect(response.ok()).toBe(true)
    const manifest = await response.json()
    expect(manifest.shortcuts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Tu ruta', url: '/?tab=home' }),
      expect.objectContaining({ name: 'Dado ponderado', url: '/?tab=dice' }),
      expect.objectContaining({ name: 'Descubrir', url: '/?tab=discover&mode=search' }),
    ]))

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nexo:service-worker-update-ready')))
    await expect(page.getByRole('button', { name: 'Actualizar Nexo' })).toBeVisible()
    await context.setOffline(true)
    try {
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
      await expect(page.getByRole('status', { name: 'Sin conexion' })).toBeVisible()
    } finally {
      await context.setOffline(false)
    }
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
  })

  test('crea, archiva y recupera una ficha del catalogo publico', async ({ page }) => {
    await page.goto('/?tab=curation')
    await page.getByRole('button', { name: 'Nueva entrada' }).click()
    const editor = page.getByRole('dialog', { name: 'Catalogo Nexo' })
    await editor.getByLabel('Titulo').fill('Catalogo 1.1.50')
    await editor.getByRole('button', { name: 'Completar minimo' }).click()
    await editor.getByRole('button', { name: 'Guardar en catalogo' }).click()
    await expect(page.getByText('Catalogo 1.1.50 guardado en catalogo')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Catalogo 1.1.50' })).toBeVisible()
    await page.getByRole('button', { name: 'Archivar Catalogo 1.1.50' }).click()
    await page.getByRole('button', { name: 'Archivar entrada' }).click()
    await expect(page.getByText('Catalogo 1.1.50 archivado')).toBeVisible()
    await page.getByRole('button', { name: 'Deshacer archivado' }).click()
    await expect(page.getByText('Catalogo 1.1.50 recuperado en catalogo')).toBeVisible()
  })

  test('previsualiza, aplica y deshace un seed de catalogo', async ({ page }) => {
    await page.goto('/?tab=curation')
    const tools = page.locator('details.curation-admin-drawer')
    await tools.locator(':scope > summary').click()
    await page.getByLabel('Importar lote de catalogo JSON').setInputFiles({
      name: 'catalogo-1.1.50.seed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ items: [{
        title: 'Seed 1.1.50',
        type: 'book',
        description: 'Entrada controlada para validar la importacion.',
        genres: ['Pruebas'],
        tags: ['seed'],
        moodTags: ['claro'],
      }] })),
    })
    const preview = page.getByLabel('Seed de catalogo preparado')
    await expect(preview).toContainText('1 entradas revisadas')
    await preview.getByRole('button', { name: 'Aplicar lote' }).click()
    await expect(page.getByText('Importadas 1 entradas al catalogo')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Seed 1.1.50' })).toBeVisible()
    await page.getByRole('button', { name: 'Deshacer lote' }).click()
    await expect(page.getByText(/Seed deshecho/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Seed 1.1.50' })).not.toBeVisible()
  })
})

test.describe('Responsive, temas y accesibilidad', () => {
  test('mantiene navegacion y superficies sin desbordamiento', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)
    const viewports = [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)

      for (const route of ['home', 'discover&mode=search', 'library', 'dice']) {
        await page.goto(`/?tab=${route}`)
        await expect.poll(() => page.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth }))).toEqual(viewport)
        await expectNoHorizontalOverflow(page)
      }

      await page.goto('/?tab=home')
      await expect(page.locator('.tabbar-group.primary > button')).toHaveCount(4)
      await expect(page.locator('details.tabbar-more')).toBeVisible()

      if (viewport.width === 390) {
        const heading = page.getByRole('heading', { name: 'Tu ruta', exact: true })
        const addCta = page.locator('.home-hero-actions .primary-button')
        await expect(heading).toBeVisible()
        await expect(addCta).toBeVisible()
        for (const locator of [heading, addCta]) {
          const box = await locator.boundingBox()
          expect(box).not.toBeNull()
          expect(box!.y).toBeGreaterThanOrEqual(0)
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
        }

        const primaryButtons = page.locator('.tabbar-group.primary > button')
        const boxes = await primaryButtons.evaluateAll((buttons) => buttons.map((button) => {
          const rect = button.getBoundingClientRect()
          return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top }
        }))
        expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1)
        expect(boxes.every((box) => box.left >= 0 && box.right <= viewport.width && box.bottom <= viewport.height)).toBe(true)
      }
    }
  })

  test('los siete temas mantienen legibles las cuatro superficies principales', async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000)
    const themes = ['dark', 'light', 'rose', 'forest', 'ocean', 'mint', 'aurora']
    const routes = ['home', 'discover&mode=search', 'library', 'dice', 'settings']
    for (const theme of themes) {
      await page.goto('/?tab=home')
      await page.evaluate((value) => window.localStorage.setItem('nexo-theme', value), theme)
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      for (const route of routes) {
        await page.goto(`/?tab=${route}`)
        await expectNoHorizontalOverflow(page)
      }
    }
  })

  test('los siete temas mantienen contraste AA en las superficies principales', async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000)
    const themes = ['dark', 'light', 'rose', 'forest', 'ocean', 'mint', 'aurora']
    const routes = ['home', 'discover&mode=search', 'library', 'dice', 'settings']

    for (const theme of themes) {
      await page.goto('/?tab=home')
      await page.evaluate((value) => window.localStorage.setItem('nexo-theme', value), theme)
      for (const route of routes) {
        await page.goto(`/?tab=${route}`)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expectNoContrastViolations(page, `${theme}/${route}`)
      }
    }
  })

  test('las superficies principales no tienen violaciones moderate o superiores WCAG', async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000)
    for (const route of ['home', 'discover&mode=search', 'library', 'dice', 'settings']) {
      await page.goto(`/?tab=${route}`)
      await expectNoReleaseA11yViolations(page, route)
    }
  })

  test('los dialogos privados atrapan y restauran el foco con accesibilidad', async ({ page }) => {
    await page.goto('/?tab=library')
    const addTrigger = page.getByRole('button', { name: 'Anadir manualmente' })
    await addTrigger.click()
    const editor = page.getByRole('dialog', { name: 'Anadir manualmente' })
    await expect(editor.getByLabel('Titulo')).toBeFocused()
    await expectNoReleaseA11yViolations(page, 'editor privado')

    const closeEditor = editor.getByRole('button', { name: 'Cerrar editor' })
    const cancelEditor = editor.getByRole('button', { name: 'Cancelar' })
    await closeEditor.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(cancelEditor).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeEditor).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(editor).not.toBeVisible()
    await expect(addTrigger).toBeFocused()

    const deleteTrigger = page.getByRole('button', { name: 'Borrar Outer Wilds' })
    await deleteTrigger.click()
    const confirmation = page.getByRole('alertdialog', { name: 'Borrar Outer Wilds' })
    const cancelDelete = confirmation.getByRole('button', { name: 'Cancelar' })
    const confirmDelete = confirmation.getByRole('button', { name: 'Borrar definitivamente' })
    await expect(cancelDelete).toBeFocused()
    await expectNoReleaseA11yViolations(page, 'confirmacion de borrado privada')
    await page.keyboard.press('Shift+Tab')
    await expect(confirmDelete).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancelDelete).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirmation).not.toBeVisible()
    await expect(deleteTrigger).toBeFocused()
  })
})
