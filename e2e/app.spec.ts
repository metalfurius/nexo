import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('library and weighted dice work in demo mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByRole('button', { name: 'Todo 7' })).toBeVisible()
  await page.getByRole('button', { name: 'Lista' }).click()
  await expect(page.getByTestId('library-grid')).toHaveClass(/list-view/)
  await page.getByRole('button', { name: 'Dado' }).click()
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.getByTestId('library-grid')).toHaveClass(/list-view/)
  await page.getByRole('button', { name: 'Tarjetas' }).click()
  await expect(page.getByTestId('library-grid')).not.toHaveClass(/list-view/)
  await page.locator('.item-main').filter({ hasText: 'Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Entrada' })).toBeVisible()
  await expect(page.getByLabel('Prioridad')).toBeVisible()
  await expect(page.getByLabel('Sorpresa')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar' }).click()
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
  await expect(page.getByRole('button', { name: 'Ajustes guardados' })).toBeDisabled()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar ajustes' }).click()
  await expect(page.getByText('Ajustes del dado guardados')).toBeVisible()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Score')
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
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByRole('button', { name: 'Mas acciones Odisea' }).click()
  await expect(page.getByRole('menu', { name: 'Acciones Odisea' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Ver detalles Odisea' }).click()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('En cola')
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Guardar Odisea' }).click()
  await page.getByRole('tab', { name: /Guardados 1/ }).click()
  await expect(page.getByText('Ya esta en tu biblioteca')).toBeVisible()
  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
})

test('moderator curation can create a public catalog item in demo mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Curacion' }).click()
  await expect(page.getByRole('heading', { name: 'Curacion' })).toBeVisible()

  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  const editor = page.locator('.item-editor')
  await editor.getByLabel('Titulo').fill('Solaris')
  await editor.getByLabel('Descripcion').fill('Ciencia ficcion introspectiva.')
  await editor.getByLabel('Generos').fill('Ciencia ficcion')
  await editor.getByLabel('Tags', { exact: true }).fill('clasico, introspectivo')
  await editor.getByRole('button', { name: 'Guardar en catalogo' }).click()

  await expect(page.getByRole('heading', { name: 'Solaris' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar Solaris' })).toBeVisible()
  await page.getByRole('button', { name: 'Archivar Solaris' }).click()
  await expect(page.getByRole('heading', { name: 'Archivar entrada publica' })).toBeVisible()
  await page.getByRole('button', { name: 'Archivar entrada' }).click()

  await expect(page.getByText('Solaris archivado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar Solaris' })).not.toBeVisible()
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
