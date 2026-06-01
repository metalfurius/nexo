import { expect, test } from '@playwright/test'

test('library and weighted dice work in demo mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')

  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toBeVisible()
})

test('mobile layout keeps the core controls reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Buscar en biblioteca')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dado ponderado' })).toBeVisible()
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
  await expect(page.getByTestId('library-grid')).not.toContainText('Outer Wilds')
})
