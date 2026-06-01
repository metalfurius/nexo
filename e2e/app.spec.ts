import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('library and weighted dice work in demo mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')

  await page.getByRole('button', { name: 'Dado' }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toBeVisible()
})

test('mobile layout keeps the core controls reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Buscar en biblioteca')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explorador' })).toBeVisible()
  await page.getByRole('button', { name: 'Dado' }).click()
  await expect(page.getByRole('button', { name: 'Tirar dado ponderado' })).toBeVisible()
})

test('explorer searches public catalog and saves to private library', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explorador' }).click()
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByRole('button', { name: 'Guardar' }).first().click()
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
  await editor.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Solaris')).toBeVisible()
})

test('delete all requires explicit confirmation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')

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
