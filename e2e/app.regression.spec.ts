import { expect, test, type Locator, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/catalog-proxy/search**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { results: [] } })
  })
  await page.route('**/catalog-proxy/discover**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { result: null } })
  })
})

async function expectFocusWithin(scope: Locator) {
  await expect.poll(() => scope.evaluate((element) => element.contains(document.activeElement))).toBe(true)
}

async function openSettingsDrawer(page: Page, testId = 'settings-private-data-drawer') {
  const drawer = page.getByTestId(testId)
  if (!(await drawer.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await drawer.locator(':scope > summary').click()
  }
  await expect(drawer).toHaveAttribute('open', '')
  return drawer
}

async function openLibraryEditor(page: Page, title: string) {
  await page.getByRole('button', { name: `Editar ${title}` }).click()
  const editor = page.getByRole('dialog', { name: `Editar ${title}` })
  await expect(editor).toBeVisible()
  return editor
}

test.describe('Regresiones de continuidad 1.1.50', () => {
  test('conserva, limpia y restaura el historial de actividad', async ({ page }) => {
    await page.goto('/?tab=library')
    await page.getByRole('button', { name: 'Anadir manualmente' }).click()
    const editor = page.getByRole('dialog', { name: 'Anadir manualmente' })
    await editor.getByLabel('Titulo').fill('Historial 1.1.50')
    await editor.getByRole('button', { name: 'Guardar ficha' }).click()

    await page.getByRole('button', { name: 'Inicio', exact: true }).click()
    await page.getByLabel('Historial de actividad').click()
    const activity = page.getByTestId('session-activity')
    await expect(activity).toContainText('Obra anadida')
    await expect(activity).toContainText('Historial 1.1.50')

    await activity.getByRole('button', { name: 'Limpiar' }).click()
    await expect(activity).toContainText('Actividad limpiada')
    await expect(activity).not.toContainText('Historial 1.1.50')
    await activity.getByRole('button', { name: 'Deshacer limpieza' }).click()
    await expect(activity).toContainText('Obra anadida')
    await expect(activity).toContainText('Historial 1.1.50')
  })

  test('mantiene atajos, busqueda por teclado, foco y proteccion al escribir', async ({ page }) => {
    await page.goto('/?tab=library')
    const trigger = page.getByRole('button', { name: 'Busqueda rapida' })
    await expect(trigger).toHaveAttribute('aria-keyshortcuts', '/ Control+K Meta+K')

    await trigger.click()
    let palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
    await expect(palette.getByLabel('Buscar en Nexo')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette).not.toBeVisible()
    await expect(trigger).toBeFocused()

    const librarySearch = page.getByLabel('Buscar en tu biblioteca')
    await librarySearch.fill('/')
    await expect(librarySearch).toHaveValue('/')
    await expect(page.getByRole('dialog', { name: 'Abrir en Nexo' })).toHaveCount(0)
    await librarySearch.fill('')
    await librarySearch.blur()

    await page.keyboard.press('/')
    palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
    const paletteSearch = palette.getByLabel('Buscar en Nexo')
    await expect(paletteSearch).toBeFocused()
    await paletteSearch.fill('Outer Wilds')
    await expect(palette.getByRole('button', { name: 'Abrir Outer Wilds' })).toHaveAttribute('aria-current', 'true')
    await paletteSearch.press('Enter')
    const itemEditor = page.getByRole('dialog', { name: 'Editar Outer Wilds' })
    await expect(itemEditor).toBeVisible()
    await itemEditor.getByRole('button', { name: 'Cerrar editor' }).click()

    await page.keyboard.press('Control+K')
    palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab')
      await expectFocusWithin(palette)
    }
  })

  test('abre deep links, limpia el item al cerrar y respeta el historial del navegador', async ({ page }) => {
    await page.goto('/?tab=home')
    const outerWilds = page.locator('article.roadmap-card').filter({ hasText: 'Outer Wilds' })
    await outerWilds.locator('.roadmap-card-main').click()
    let editor = page.getByRole('dialog', { name: 'Editar Outer Wilds' })
    await expect(editor).toBeVisible()
    await expect(page).toHaveURL(/tab=library&item=game-outer-wilds/)
    await editor.getByRole('button', { name: 'Cerrar editor' }).click()
    await expect(page).toHaveURL(/tab=library/)
    await expect(page).not.toHaveURL(/item=/)

    await page.goBack()
    await expect(page).toHaveURL(/tab=home/)
    await page.goto('/?tab=library&item=game-outer-wilds')
    editor = page.getByRole('dialog', { name: 'Editar Outer Wilds' })
    await expect(editor).toBeVisible()
    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Editar Outer Wilds' })).toBeVisible()
  })

  test('persiste progreso con unidades propias de juegos, libros y anime', async ({ page }) => {
    await page.goto('/?tab=library')

    let editor = await openLibraryEditor(page, 'Outer Wilds')
    await expect(editor.getByLabel('Unidad')).toHaveValue('hours')
    await editor.getByLabel('Progreso actual').fill('4.5')
    await editor.getByRole('button', { name: 'Guardar ficha' }).click()
    await expect(page.locator('.library-v2-card').filter({ hasText: 'Outer Wilds' })).toContainText('4.5 horas')

    editor = await openLibraryEditor(page, '1984 - George Orwell')
    await expect(editor.getByLabel('Unidad')).toHaveValue('pages')
    await editor.getByLabel('Progreso actual').fill('120')
    await editor.getByLabel('Progreso total').fill('300')
    await editor.getByRole('button', { name: 'Guardar ficha' }).click()
    await expect(page.locator('.library-v2-card').filter({ hasText: '1984 - George Orwell' })).toContainText('120/300 paginas')

    editor = await openLibraryEditor(page, 'Vinland Saga')
    await expect(editor.getByLabel('Unidad')).toHaveValue('episodes')
    await editor.getByLabel('Progreso actual').fill('3')
    await editor.getByRole('button', { name: 'Guardar ficha' }).click()
    await expect(page.locator('.library-v2-card').filter({ hasText: 'Vinland Saga' })).toContainText('3 episodios')
  })

  test('exporta, previsualiza, aplica y deshace un backup privado', async ({ page }) => {
    await page.goto('/?tab=settings')
    const privateData = await openSettingsDrawer(page)

    const downloadPromise = page.waitForEvent('download')
    await privateData.getByRole('button', { name: 'Exportar backup JSON' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^nexo-backup-.*\.json$/)

    await privateData.getByLabel('Importar backup JSON').setInputFiles({
      name: 'nexo-regression-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-07-11T18:00:00.000Z',
        settings: {
          theme: 'light',
          favoriteTags: ['regression'],
          favoriteGenres: [],
          blockedTags: [],
          explorerDefaultType: 'book',
          libraryViewMode: 'list',
        },
        items: [{
          title: 'Backup Regression 1.1.50',
          type: 'book',
          status: 'wishlist',
          genres: ['Ensayo'],
          tags: ['backup'],
          moodTags: [],
          weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
          source: 'manual',
          createdAt: '2026-07-11T18:00:00.000Z',
          updatedAt: '2026-07-11T18:00:00.000Z',
        }],
      })),
    })

    const preview = page.getByLabel('Backup preparado')
    await expect(preview).toContainText('nexo-regression-backup.json')
    await expect(preview).toContainText('1 entradas revisadas antes de aplicar')
    await preview.getByLabel('Aplicar ajustes del backup').uncheck()
    await preview.getByRole('button', { name: 'Aplicar backup' }).click()
    await expect(page.getByText('Importadas 1 entradas desde backup')).toBeVisible()

    await page.getByRole('button', { name: 'Busqueda rapida' }).click()
    const palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
    await palette.getByLabel('Buscar en Nexo').fill('Backup Regression 1.1.50')
    await expect(palette.getByRole('button', { name: 'Abrir Backup Regression 1.1.50' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Deshacer importacion' }).click()
    await expect(page.getByText('Importacion deshecha: 1 nuevas eliminadas')).toBeVisible()
    await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
    await expect(page.getByTestId('library-grid')).not.toContainText('Backup Regression 1.1.50')
  })

  test('aplica una accion masiva desde la paleta a la seleccion visible', async ({ page }) => {
    await page.goto('/?tab=library')
    await page.getByRole('button', { name: 'Filtros' }).click()
    await page.getByLabel('Filtrar por tipo').selectOption('game')
    await expect(page.getByTestId('library-filter-summary')).toContainText('3 de 7 obras')
    await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
    await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('3 seleccionadas')

    await page.getByRole('button', { name: 'Busqueda rapida' }).click()
    const palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
    await palette.getByLabel('Buscar en Nexo').fill('seleccion en progreso')
    await palette.getByRole('button', { name: 'Ejecutar Seleccion: En progreso' }).click()
    await expect(page.getByRole('status').filter({ hasText: '3 estados actualizados' })).toBeVisible()

    for (const title of ['Outer Wilds', 'Pokemon Esmeralda (Nuzlocke)', 'Mass Effect Legendary Edition']) {
      await expect(page.locator('.library-v2-card').filter({ hasText: title })).toContainText('En progreso')
    }
  })

  test('bloquea el scroll, atrapa el foco y lo devuelve al cerrar el editor', async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === 'mobile'
      ? { width: 390, height: 600 }
      : { width: 1024, height: 520 })
    await page.goto('/?tab=library')

    const trigger = page.getByRole('button', { name: 'Editar Mass Effect Legendary Edition' })
    const scrollYBeforeOpen = await trigger.evaluate((element) => {
      element.scrollIntoView({ block: 'center' })
      ;(element as HTMLElement).focus()
      return window.scrollY
    })
    expect(scrollYBeforeOpen).toBeGreaterThan(0)
    await trigger.evaluate((element) => (element as HTMLButtonElement).click())

    const editor = page.getByRole('dialog', { name: 'Editar Mass Effect Legendary Edition' })
    await expect(editor).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('dialog-scroll-locked'))).toBe(true)
    await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe(`-${scrollYBeforeOpen}px`)

    for (let index = 0; index < 18; index += 1) {
      await page.keyboard.press('Tab')
      await expectFocusWithin(editor)
    }
    await page.keyboard.press('Escape')
    await expect(editor).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('dialog-scroll-locked'))).toBe(false)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollYBeforeOpen)
  })

  test('intercepta navegacion con cambios pendientes y permite conservarlos o descartarlos', async ({ page }) => {
    await page.goto('/?tab=settings')
    await page.getByRole('button', { name: 'Tema Claro', exact: true }).click()
    await expect(page.getByText('Cambios pendientes', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
    const warning = page.getByLabel('Salida con cambios pendientes')
    await expect(warning).toContainText('Cambios pendientes en Ajustes')
    await warning.getByRole('button', { name: 'Seguir editando' }).click()
    await expect(page).toHaveURL(/tab=settings/)
    await expect(page.getByTestId('settings-confidence')).toContainText('Ajustes pendientes')

    await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
    await warning.getByRole('button', { name: 'Descartar cambios' }).click()
    await expect(page).toHaveURL(/tab=library/)
    await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
  })
})
