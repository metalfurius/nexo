import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('library and weighted dice work in demo mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-focus-shelf')).toContainText('En foco')
  await expect(page.getByTestId('library-focus-shelf')).toContainText('Inception')
  await expect(page.getByRole('button', { name: 'Todo 7' })).toBeVisible()
  await page.getByRole('button', { name: 'Lista' }).click()
  await expect(page.getByTestId('library-grid')).toHaveClass(/list-view/)
  await page.getByRole('button', { name: 'Dado' }).click()
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.getByTestId('library-grid')).toHaveClass(/list-view/)
  await page.getByRole('button', { name: 'Tarjetas' }).click()
  await expect(page.getByTestId('library-grid')).not.toHaveClass(/list-view/)
  await page.getByLabel('Buscar en biblioteca').fill('zzzz no match')
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await expect(page.getByText('0 de 7 entradas')).toBeVisible()
  await expect(page.getByTestId('library-focus-shelf')).not.toBeVisible()
  await page.getByRole('button', { name: 'Quitar filtros' }).click()
  await expect(page.getByTestId('library-focus-shelf')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  const outerWildsCard = page.locator('.item-card').filter({ hasText: 'Outer Wilds' })
  await expect(outerWildsCard.getByLabel('Senales rapidas de Outer Wilds')).toContainText('Importacion')
  await expect(outerWildsCard.getByLabel('Senales rapidas de Outer Wilds')).toContainText('12-20h')
  await page.getByRole('button', { name: 'Anadir' }).click()
  const quickEditor = page.getByRole('dialog', { name: 'Entrada' })
  await quickEditor.getByLabel('Titulo').fill('Manual de prueba')
  await quickEditor.getByLabel('Tipo').selectOption('book')
  await quickEditor.getByRole('button', { name: 'Ideas grandes' }).click()
  await expect(quickEditor.getByLabel('Generos', { exact: true })).toHaveValue('Ciencia ficcion, Distopia, Filosofia')
  await expect(quickEditor.getByLabel('Tags', { exact: true })).toHaveValue('introspectivo, politico, premiado')
  await expect(quickEditor.getByLabel('Mood tags')).toHaveValue('denso, raro')
  await quickEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Manual de prueba')
  await page.locator('.item-main').filter({ hasText: 'Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Entrada' })).toBeVisible()
  await expect(page.getByLabel('Prioridad')).toBeVisible()
  await expect(page.getByLabel('Sorpresa')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Empezar Outer Wilds' })).toBeVisible()
  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await expect(page.getByRole('menu', { name: 'Acciones Outer Wilds' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Completar Outer Wilds' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Borrar Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).toContainText('Outer Wilds')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByRole('button', { name: 'Empezar Outer Wilds' }).click()
  await expect(page.getByRole('button', { name: 'Completar Outer Wilds' })).toBeVisible()

  await page.getByRole('button', { name: 'Dado' }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'En la mesa' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Elegibilidad' })).toBeVisible()
  await expect(page.getByText(/pueden salir ahora/)).toBeVisible()
  await expect(page.getByText('Pausados fuera')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajustes guardados' })).toBeDisabled()
  await page.getByRole('button', { name: 'Aplicar preset Noche ligera' }).click()
  await expect(page.getByLabel('Energia')).toHaveValue('low')
  await expect(page.getByLabel('Porcentaje de sorpresa')).toHaveValue('15')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByLabel('Energia').selectOption('high')
  await page.getByLabel('Incluir pausados').check()
  await expect(page.getByText('Incluye pausados')).toBeVisible()
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar ajustes' }).click()
  await expect(page.getByText('Ajustes del dado guardados')).toBeVisible()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Score')
  await expect(page.getByTestId('recommendation-result')).toContainText('Por que sale')
  await expect(page.getByTestId('recent-rolls')).toContainText('Ahora mismo')
})

test('mobile layout keeps the core controls reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Buscar en biblioteca')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explorador' })).toBeVisible()
  await page.getByRole('button', { name: 'Dado' }).click()
  await expect(page.getByRole('button', { name: 'Tirar dado ponderado' })).toBeVisible()
})

test('pwa metadata is present', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f1214')

  const response = await page.request.get('/manifest.webmanifest')
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest).toEqual(expect.objectContaining({ display: 'standalone', name: 'Nexo' }))
  expect(manifest.icons).toEqual(
    expect.arrayContaining([expect.objectContaining({ src: '/icons/nexo.svg', purpose: 'any maskable' })]),
  )
})

test('settings show pending changes before saving preferences', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ajustes' }).click()

  await expect(page.getByRole('button', { name: 'Guardado' })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Datos privados' })).toBeVisible()
  await expect(page.getByLabel('Estado de datos privados')).toContainText('7')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar backup JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^nexo-backup-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(page.getByText('Backup JSON descargado')).toBeVisible()
  await expect(page.getByLabel('Rol de Usuario demo')).toHaveValue('user')
  await page.getByLabel('Rol de Usuario demo').selectOption('moderator')
  await expect(page.getByText('Usuario demo ahora es Moderador')).toBeVisible()
  await page.getByRole('button', { name: 'Claro', exact: true }).click()
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Ajustes guardados')).toBeVisible()
})

test('explorer searches public catalog and saves to private library', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explorador' }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('game')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByLabel('Tipo por defecto')).toHaveValue('game')
  await page.getByRole('button', { name: 'Explorador' }).click()
  await expect(page.getByLabel('Tipo de busqueda en explorador')).toHaveValue('game')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByRole('button', { name: /APIs/ })).toBeVisible()
  await page.getByRole('button', { name: /APIs/ }).click()
  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByRole('button', { name: /Nexo/ }).click()
  await expect(page.getByRole('heading', { name: 'Sin resultados Nexo' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver todos los origenes' }).click()
  await expect(page.getByText('Odisea').first()).toBeVisible()
  const odiseaCard = page.locator('.discovery-card').filter({ hasText: 'Odisea' }).first()
  await expect(odiseaCard.getByLabel('Acciones rapidas Odisea')).toContainText('Guardar')
  await odiseaCard.getByRole('button', { name: 'Descartar Odisea' }).click()
  await page.getByRole('tab', { name: /Descartados 1/ }).click()
  await expect(page.getByText('Apartado de tus pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Recuperar Odisea' }).click()
  await expect(page.getByRole('tab', { name: /En cola 1/ })).toBeVisible()
  await odiseaCard.getByRole('button', { name: 'Abrir ficha Odisea' }).click()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('En cola')
  await page.getByRole('button', { name: 'Guardar en Biblioteca' }).click()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).not.toBeVisible()
  await page.getByRole('tab', { name: /Guardados 1/ }).click()
  await expect(page.getByText('Ya esta en tu biblioteca')).toBeVisible()
  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('No hay hallazgos nuevos para esa busqueda.')).toBeVisible()
  await expect(page.getByRole('tab', { name: /En cola 0/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Guardados 1/ })).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
  await page.locator('.item-main').filter({ hasText: 'Odisea' }).click()
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(editor).toContainText('Origen')
  await expect(editor).toContainText('API externa')
  await expect(editor).toContainText('Esta ficha vive solo en tu biblioteca privada.')
})

test('library editor explains private copies from the Nexo catalog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explorador' }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  const nexoCard = page.locator('.discovery-card').filter({ hasText: 'Nexo' }).filter({ hasText: 'Odisea' })
  await expect(nexoCard).toBeVisible()
  await nexoCard.getByRole('button', { name: 'Guardar Odisea' }).click()

  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
  await page.locator('.item-main').filter({ hasText: 'Odisea' }).click()

  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(editor).toContainText('Catalogo Nexo')
  await expect(editor).toContainText('Tus notas, rating, estado, progreso y pesos del dado no cambian el catalogo publico.')
  await expect(editor).toContainText('Referencias')
})

test('moderator curation can create a public catalog item in demo mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Curacion' }).click()
  await expect(page.getByRole('heading', { name: 'Curacion' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Revision prioritaria' })).toBeVisible()
  await expect(page.getByLabel('Revision prioritaria del catalogo')).toContainText('Sin portada')
  await page.getByRole('button', { name: 'Revisar Arrival' }).click()
  await expect(page.locator('.public-item-editor').getByLabel('Titulo')).toHaveValue('Arrival')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  const templateDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Plantilla' }).click()
  const templateDownload = await templateDownloadPromise
  expect(templateDownload.suggestedFilename()).toBe('nexo-catalog-seed-template.json')
  const templatePath = await templateDownload.path()
  if (!templatePath) throw new Error('Template download path is missing')
  const templatePayload = JSON.parse(await readFile(templatePath, 'utf8')) as { items?: unknown[] }
  expect(templatePayload.items?.length).toBeGreaterThan(0)

  await page.getByLabel('Importar lote de catalogo JSON').setInputFiles({
    name: 'public-catalog.seed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        items: [
          {
            title: 'Moon',
            type: 'movie',
            description: 'Ciencia ficcion contenida y solitaria.',
            releaseYear: 2009,
            genres: ['Ciencia ficcion', 'Drama'],
            tags: ['culto', 'introspectivo'],
            moodTags: ['melancolico'],
          },
        ],
      }),
    ),
  })
  await expect(page.getByText('Importadas 1 entradas al catalogo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Moon' })).toBeVisible()

  await page.getByRole('button', { name: 'Crear Libros' }).click()
  const editor = page.locator('.item-editor')
  await expect(editor.getByLabel('Tipo')).toHaveValue('book')
  await editor.getByLabel('Titulo').fill('Solaris')
  await expect(editor.getByLabel('Curacion rapida')).toContainText('Falta Descripcion')
  await editor.getByRole('button', { name: 'Completar minimo' }).click()
  await expect(editor.getByLabel('Descripcion')).toHaveValue(/Solaris combina/)
  await expect(editor.getByLabel('Generos', { exact: true })).toHaveValue('Clasico, Aventura, Mitologia')
  await expect(editor.getByLabel('Tags', { exact: true })).toHaveValue('clasico, epico, literatura')
  await expect(editor.getByLabel('Mood tags')).toHaveValue('denso')
  await expect(editor.getByLabel('Curacion rapida')).toContainText('3/4 listo')
  await editor.getByRole('button', { name: 'Guardar y crear otra' }).click()

  await expect(page.getByText('Solaris guardado en catalogo')).toBeVisible()
  await expect(editor.getByLabel('Titulo')).toHaveValue('')
  await editor.getByLabel('Titulo').fill('Dune')
  await editor.getByLabel('Descripcion').fill('Politica, desierto y destino.')
  await editor.getByRole('button', { name: 'Ciencia ficcion' }).click()
  await editor.getByLabel('Sugerencias de tags para Libros').getByRole('button', { name: 'epico' }).click()
  await editor.getByLabel('Sugerencias de tono').getByRole('button', { name: 'denso' }).click()
  await editor.getByRole('button', { name: 'Guardar en catalogo' }).click()

  await expect(page.getByRole('heading', { name: 'Solaris' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Pendientes \d+/ })).toBeVisible()
  await page.getByRole('button', { name: /Pendientes/ }).click()
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Outer Wilds' })).not.toBeVisible()
  await page.getByLabel('Filtrar catalogo por tipo').selectOption('manhwa')
  await expect(page.getByRole('heading', { name: 'Sin entradas con esos filtros' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver todo el catalogo' }).click()
  await expect(page.getByRole('heading', { name: 'Solaris' })).toBeVisible()
  await page.getByLabel('Ordenar catalogo').selectOption('title')
  await expect(page.getByText(/\d+ de \d+ entradas visibles/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar Solaris' })).toBeVisible()
  await page.getByRole('button', { name: 'Archivar Solaris' }).click()
  await expect(page.getByRole('heading', { name: 'Archivar entrada publica' })).toBeVisible()
  await page.getByRole('button', { name: 'Archivar entrada' }).click()

  await expect(page.getByText('Solaris archivado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar Solaris' })).not.toBeVisible()
})

test('moderator can turn an explorer candidate into a public catalog item', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explorador' }).click()
  await page.getByLabel('Buscar en explorador').fill('V Rising')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByRole('button', { name: 'Crear catalogo V Rising' })).toBeVisible()
  await page.getByRole('button', { name: 'Crear catalogo V Rising' }).click()

  const editor = page.locator('.public-item-editor')
  await expect(editor.getByLabel('Titulo')).toHaveValue('V Rising')
  await expect(editor.getByLabel('Descripcion')).toHaveValue('Candidato de demostracion hasta configurar Firebase Functions.')
  await expect(editor.getByLabel('Tipo')).toHaveValue('movie')

  await editor.getByRole('button', { name: 'Noche palomitas' }).click()
  await expect(editor.getByLabel('Generos', { exact: true })).toHaveValue('Accion, Aventura')
  await expect(editor.getByLabel('Tags', { exact: true })).toHaveValue('palomitas, visual')
  await editor.getByRole('button', { name: 'Guardar en catalogo' }).click()

  await expect(page.getByText('V Rising guardado en catalogo Nexo.')).toBeVisible()
  await page.getByRole('button', { name: 'Curacion' }).click()
  await expect(page.getByRole('heading', { name: 'V Rising' })).toBeVisible()
})

test('delete all requires explicit confirmation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await page.getByRole('button', { name: 'Mas acciones Mass Effect Legendary Edition' }).click()
  await page.getByRole('menuitem', { name: 'Borrar Mass Effect Legendary Edition' }).click()
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).toContainText('Mass Effect Legendary Edition')
  await page.getByRole('button', { name: 'Borrar entrada' }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Mass Effect Legendary Edition')

  await page.getByRole('button', { name: 'Borrar todo' }).click()
  await expect(page.getByRole('heading', { name: 'Borrar toda la biblioteca' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Borrar todo' }).last()).toBeDisabled()

  await page.getByLabel('Confirmacion').fill('BORRAR')
  await page.getByRole('button', { name: 'Borrar todo' }).last().click()

  await expect(page.getByText('Tu biblioteca ha sido borrada')).toBeVisible()
  await expect(page.getByText('Outer Wilds')).not.toBeVisible()
})

test('launch screens have no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))

  expect(seriousViolations).toEqual([])
})
