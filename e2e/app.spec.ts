import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function expectFocusWithin(scope: Locator) {
  const hasFocusWithin = await scope.evaluate((element) => element.contains(document.activeElement))
  expect(hasFocusWithin).toBe(true)
}

async function expectDialogAnimationsSettled(dialog: Locator) {
  await expect(dialog).toBeVisible()
  await dialog.evaluate(async (element) => {
    const animatedElements = [element, element.closest('.modal-backdrop')].filter((entry): entry is Element =>
      Boolean(entry),
    )
    await Promise.all(
      animatedElements.flatMap((animatedElement) =>
        animatedElement.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      ),
    )
  })
}

async function openLibraryAdvanced(page: Page) {
  const advancedPanel = page.locator('details.library-advanced-panel')
  await expect(advancedPanel).toBeVisible()
  const isOpen = await advancedPanel.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    await advancedPanel.locator('summary').click()
  }
}

async function mockOpenLibraryOdisea(page: Page) {
  await page.route('https://openlibrary.org/search.json**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        docs: [
          {
            author_name: [],
            cover_i: 531509,
            first_publish_year: 1996,
            key: '/works/OL166894W',
            subject: ['Clasico', 'Aventura'],
            title: 'Odisea',
          },
        ],
      },
    })
  })
}

async function openApp(page: Page) {
  await mockOpenLibraryOdisea(page)
  await page.goto('/')
  await openLibraryAdvanced(page)
}

test('library starts with a focused search-first surface', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('library-catalog-search')).toBeVisible()
  await expect(page.getByLabel('Buscar obra para guardar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Buscar obra' })).toBeVisible()
  await expect(page.locator('details.library-advanced-panel')).not.toHaveAttribute('open', '')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
})

test('library can search a free catalog source and save directly', async ({ page }) => {
  await page.route('https://openlibrary.org/search.json**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        docs: [
          {
            author_name: ['Frank Herbert'],
            cover_i: 12345,
            first_publish_year: 1965,
            key: '/works/OL893415W',
            subject: ['Science fiction', 'Desert planets', 'Politics'],
            title: 'Dune',
          },
        ],
      },
    })
  })

  await page.goto('/')
  await page.getByLabel('Buscar obra para guardar').fill('Dune')
  await page.getByLabel('Tipo de obra para buscar').selectOption('book')
  await page.getByRole('button', { name: 'Buscar obra' }).click()
  await expect(page.getByLabel('Resultados para guardar')).toContainText('Dune - Frank Herbert')
  await expect(page.getByLabel('Resultados para guardar')).toContainText('Open Library')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Dune - Frank Herbert guardado en Biblioteca' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Dune - Frank Herbert')
  await page.getByRole('button', { name: 'Fuentes' }).click()
  await expect(page.getByRole('dialog', { name: 'Catalogos usados por Nexo' })).toContainText('TMDB')
  await expect(page.getByRole('dialog', { name: 'Catalogos usados por Nexo' })).toContainText('RAWG')
  await expect(page.getByRole('dialog', { name: 'Catalogos usados por Nexo' })).toContainText('Open Library')
})

test('library and weighted dice work in demo mode', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('shell-pulse')).toContainText('Biblioteca')
  await expect(page.getByTestId('shell-pulse')).toContainText('Dado')
  await expect(page.getByTestId('shell-pulse')).toContainText('Explorador')
  await expect(page.getByTestId('shell-pulse')).toContainText('Admin')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-overview')).toContainText('Siguiente accion')
  await expect(page.getByTestId('library-overview')).toContainText('Inception')
  await expect(page.getByTestId('library-overview')).toContainText('Explorador')
  await expect(page.getByTestId('library-next-plan')).toContainText('Plan rapido')
  await expect(page.getByTestId('library-next-plan')).toContainText('Continuar sin perder contexto')
  await expect(page.getByTestId('library-next-plan')).toContainText('Importacion')
  await expect(page.getByRole('button', { name: 'Afinar ficha' })).toBeVisible()
  await expect(page.getByTestId('launch-guide')).toContainText('Plan de arranque')
  await expect(page.getByTestId('launch-guide')).toContainText('Base privada')
  await expect(page.getByTestId('launch-guide')).toContainText('Dado vivo')
  await expect(page.getByTestId('launch-guide')).toContainText('Explorador limpio')
  await expect(page.getByTestId('library-focus-shelf')).toContainText('En foco')
  await expect(page.getByTestId('library-focus-shelf')).toContainText('1984 - George Orwell')
  await expect(page.getByRole('button', { name: 'Todo 7' })).toBeVisible()
  await expect(page.getByTestId('library-review-queue')).toContainText('Repaso guiado')
  await expect(page.getByTestId('library-review-queue')).toContainText('Dar contexto')
  await expect(page.getByTestId('library-review-queue')).toContainText('Probar dado')
  await page.getByTestId('library-review-queue').getByRole('button', { name: 'Ver cola' }).click()
  await expect(page.getByText('Vista de repaso: Dar contexto')).toBeVisible()
  await expect(page.getByText('Vista: Sin contexto')).toBeVisible()
  await page.getByRole('button', { name: 'Restablecer vista' }).click()
  await expect(page.getByTestId('library-smart-views')).toContainText('Listas para dado')
  await expect(page.getByTestId('library-smart-views')).toContainText('Sin contexto')
  await expect(page.getByTestId('library-smart-views')).toContainText('En cooldown')
  await page.getByTestId('library-smart-views').getByRole('button', { name: /Sin contexto/ }).click()
  await expect(page.getByText('Vista: Sin contexto')).toBeVisible()
  await expect(page.getByText('4 de 7 entradas')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Inception')
  await expect(page.getByTestId('library-grid')).not.toContainText('Outer Wilds')
  await page.getByRole('button', { name: 'Restablecer vista' }).click()
  await expect(page.getByLabel('Ordenar biblioteca')).toHaveValue('focus')
  await page.getByLabel('Ordenar biblioteca').selectOption('title')
  await expect(page.getByText('Orden: Titulo')).toBeVisible()
  await expect(page.locator('[data-testid="library-grid"] .item-card').first()).toContainText('1984 - George Orwell')
  await page.getByRole('button', { name: 'Restablecer vista' }).click()
  await expect(page.getByLabel('Ordenar biblioteca')).toHaveValue('focus')
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toHaveClass(/list-view/)
  await expect(page.getByRole('status').filter({ hasText: 'Vista Lista guardada' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Vista de biblioteca guardada')
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toHaveClass(/list-view/)
  await page.getByRole('button', { name: 'Tarjetas' }).click()
  await expect(page.getByTestId('library-grid')).not.toHaveClass(/list-view/)
  await expect(page.getByRole('status').filter({ hasText: 'Vista Tarjetas guardada' })).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('zzzz no match')
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await expect(page.getByText('0 de 7 entradas')).toBeVisible()
  await expect(page.getByTestId('library-focus-shelf')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear entrada zzzz no match' })).toBeVisible()
  await page.getByRole('button', { name: 'Quitar filtros' }).click()
  await expect(page.getByTestId('library-focus-shelf')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  const outerWildsCard = page.locator('.item-card').filter({ hasText: 'Outer Wilds' })
  await expect(outerWildsCard.getByLabel('Pulso de Outer Wilds')).toContainText('Dado')
  await expect(outerWildsCard.getByLabel('Pulso de Outer Wilds')).toContainText('Foco')
  await expect(outerWildsCard.getByLabel('Pulso de Outer Wilds')).toContainText('Sorpresa')
  await expect(outerWildsCard.getByLabel('Senales rapidas de Outer Wilds')).toContainText('Importacion')
  await expect(outerWildsCard.getByLabel('Senales rapidas de Outer Wilds')).toContainText('12-20h')
  await page.getByRole('button', { name: 'Anadir' }).first().click()
  const quickEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(quickEditor.getByTestId('personal-readiness')).toContainText('Preparacion')
  await expect(quickEditor.getByTestId('personal-readiness')).toContainText('Ficha por afinar')
  await quickEditor.getByLabel('Titulo').fill('Manual de prueba')
  await expect(quickEditor.getByLabel('Inicio rapido de entrada')).toContainText('Parte de una receta')
  await quickEditor.getByLabel('Medio de inicio rapido').selectOption('book')
  await expect(quickEditor.getByLabel('Tipo')).toHaveValue('book')
  await quickEditor.getByRole('button', { name: 'Aplicar plantilla Ideas grandes para Libros' }).click()
  await expect(quickEditor.getByLabel('Generos', { exact: true })).toHaveValue('Ciencia ficcion, Distopia, Filosofia')
  await expect(quickEditor.getByLabel('Tags', { exact: true })).toHaveValue('introspectivo, politico, premiado')
  await expect(quickEditor.getByLabel('Mood tags')).toHaveValue('denso, raro')
  await quickEditor.getByLabel('Notas').fill('Entrada manual con contexto inicial.')
  await expect(quickEditor.getByTestId('personal-readiness')).toContainText('Ficha lista')
  await quickEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Manual de prueba guardada en Biblioteca')).toBeVisible()
  await expect(page.getByTestId('session-continuity')).toContainText('Continuar sesion')
  await expect(page.getByTestId('session-continuity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-continuity')).toContainText('Biblioteca')
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-activity')).toContainText('Manual de prueba')
  await page.getByTestId('session-activity').getByRole('button', { name: 'Limpiar' }).click()
  await expect(page.getByLabel('Accion reciente de actividad')).toContainText(/actividad(?:es)? limpiada/i)
  await expect(page.getByTestId('session-activity')).not.toContainText('Manual de prueba')
  await page.getByRole('button', { name: 'Deshacer limpieza' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-activity')).toContainText('Manual de prueba')
  await expect(page.getByTestId('library-grid')).toContainText('Manual de prueba')
  await page.locator('.item-main').filter({ hasText: 'Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Entrada' })).toBeVisible()
  await expect(page.getByTestId('personal-readiness')).toContainText('Preparacion')
  await expect(page.getByLabel('Prioridad')).toBeVisible()
  await expect(page.getByLabel('Sorpresa')).toBeVisible()
  await page.getByRole('textbox', { name: 'Progreso' }).fill('Cambio temporal sin guardar.')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByLabel('Cambios sin guardar')).toContainText('Guarda la ficha')
  await page.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByRole('textbox', { name: 'Progreso' })).toHaveValue('Cambio temporal sin guardar.')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('button', { name: 'Empezar Outer Wilds' })).toBeVisible()
  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await expect(page.getByRole('menu', { name: 'Acciones Outer Wilds' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Completar Outer Wilds' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Copiar enlace Outer Wilds' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Copiar enlace Outer Wilds' }).click()
  await expect(page.getByText(/Enlace de Outer Wilds/)).toBeVisible()
  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await page.getByRole('menuitem', { name: 'Borrar Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).toContainText('Outer Wilds')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByRole('button', { name: 'Empezar Outer Wilds' }).click()
  await expect(page.getByText('Outer Wilds ahora es En progreso')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Completar Outer Wilds' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer estado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer estado' }).click()
  await expect(page.getByText('Outer Wilds recuperado como Pendiente')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Empezar Outer Wilds' })).toBeVisible()
  await page.getByRole('button', { name: 'Empezar Outer Wilds' }).click()
  await expect(page.getByText('Outer Wilds ahora es En progreso')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Completar Outer Wilds' })).toBeVisible()

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Listo para tirar')
  await expect(page.getByTestId('dice-readiness')).toContainText('Candidatas')
  await expect(page.getByTestId('dice-readiness')).toContainText('Ajustes')
  await expect(page.getByRole('heading', { name: 'En la mesa' })).toBeVisible()
  await expect(page.getByTestId('dice-candidate-list')).toContainText('#1')
  await expect(page.getByTestId('dice-candidate-list')).toContainText('Score')
  await expect(page.getByRole('button', { name: 'Ver 1 mas' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver 1 mas' }).click()
  await expect(page.getByRole('button', { name: 'Ver menos candidatas' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Elegibilidad' })).toBeVisible()
  await expect(page.getByText(/pueden salir ahora/)).toBeVisible()
  await expect(page.getByText('Pausados fuera')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajustes guardados' })).toBeDisabled()
  await page.getByLabel('Medio').selectOption('manhwa')
  await expect(page.getByTestId('dice-readiness')).toContainText('Sin tirada posible')
  await expect(page.getByTestId('dice-recovery')).toContainText('Abrir abanico')
  await expect(page.getByTestId('dice-recovery')).toContainText('Quitar tiempo')
  await expect(page.getByTestId('dice-recovery')).toContainText('Sorpresa amplia')
  await page.getByTestId('dice-recovery').getByRole('button', { name: /Abrir abanico/ }).click()
  await expect(page.getByLabel('Medio')).toHaveValue('any')
  await expect(page.getByLabel('Incluir pausados')).toBeChecked()
  await expect(page.getByTestId('dice-readiness')).toContainText('Listo para tirar')
  await page.getByRole('button', { name: 'Aplicar preset Noche ligera' }).click()
  await expect(page.getByLabel('Energia')).toHaveValue('low')
  await expect(page.getByLabel('Porcentaje de sorpresa')).toHaveValue('15')
  await expect(page.getByTestId('dice-readiness')).toContainText('!')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByLabel('Energia').selectOption('high')
  await page.getByLabel('Incluir pausados').check()
  await expect(page.getByText('Incluye pausados')).toBeVisible()
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar ajustes' }).click()
  await expect(page.getByText('Ajustes del dado guardados')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Preferencias guardadas')
  await expect(page.getByRole('button', { name: 'Deshacer ajustes del dado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer ajustes del dado' }).click()
  await expect(page.getByText('Ajustes del dado recuperados')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Preferencias recuperadas')
  await expect(page.getByLabel('Energia')).toHaveValue('medium')
  await expect(page.getByLabel('Porcentaje de sorpresa')).toHaveValue('30')
  await expect(page.getByLabel('Incluir pausados')).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Ajustes guardados' })).toBeDisabled()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Score')
  await expect(page.getByTestId('recommendation-result')).toContainText('Plan de sesion')
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await expect(page.getByTestId('recommendation-result')).toContainText('Por que sale')
  await expect(page.getByTestId('dice-learning')).toContainText('Aprendizaje')
  await expect(page.getByTestId('dice-learning')).toContainText('Aprender gustos')
  await page.getByRole('button', { name: 'Aprender gustos' }).click()
  await expect(page.getByText(/gustos aprendidos/)).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Gustos aprendidos')
  await expect(page.getByRole('button', { name: 'Deshacer gustos' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer gustos' }).click()
  await expect(page.getByText('Gustos del dado recuperados')).toBeVisible()
  await page.getByRole('button', { name: 'Afinar ficha recomendada' }).click()
  const diceEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(diceEditor.getByTestId('personal-readiness')).toContainText('Preparacion')
  await diceEditor.getByLabel('Notas').fill('Afinada desde el dado.')
  await diceEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/afinada desde el dado\./)).toBeVisible()
  await expect(page.getByTestId('recent-rolls')).toContainText('Ahora mismo')
  await page.getByTestId('recent-rolls').getByRole('button', { name: /Afinar tirada reciente/ }).click()
  const recentEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(recentEditor.getByLabel('Notas')).toHaveValue('Afinada desde el dado.')
  await recentEditor.getByRole('textbox', { name: 'Progreso' }).fill('Revisada desde historial.')
  await recentEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/afinada desde el dado\./)).toBeVisible()
  await page.getByRole('button', { name: 'No hoy' }).click()
  await expect(page.getByText(/queda fuera hasta manana/)).toBeVisible()
  await expect(page.getByTestId('dice-decision-summary')).toContainText('Decision cerrada')
  await expect(page.getByTestId('dice-decision-summary')).toContainText('apartado')
  await expect(page.getByTestId('dice-decision-summary')).toContainText('Tirar otra')
  await expect(page.getByRole('button', { name: 'Deshacer enfriado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer enfriado' }).click()
  await expect(page.getByText(/reactivado para el dado/)).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByText(/marcado como en progreso/)).toBeVisible()
  await expect(page.getByTestId('dice-decision-summary')).toContainText('Decision cerrada')
  await expect(page.getByTestId('dice-decision-summary')).toContainText('iniciado')
  await expect(page.getByTestId('dice-decision-summary')).toContainText('Afinar ficha')
  await expect(page.getByRole('button', { name: 'Deshacer estado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer estado' }).click()
  await expect(page.getByText(/recuperado como/)).toBeVisible()

  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await expect(page.getByRole('menuitem', { name: 'Enfriar dado Outer Wilds' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Enfriar dado Outer Wilds' }).click()
  await expect(page.getByText('Outer Wilds enfriado para el dado')).toBeVisible()
  await expect(outerWildsCard.getByLabel('Pulso de Outer Wilds')).toContainText('Cooldown')
  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await expect(page.getByRole('menuitem', { name: 'Reactivar dado Outer Wilds' })).toBeVisible()

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Medio').selectOption('game')
  await page.getByLabel('Incluir pausados').uncheck()
  await expect(page.getByTestId('dice-readiness')).toContainText('Sin tirada posible')
  await expect(page.getByTestId('dice-recovery')).toContainText('Reactivar cooldowns')
  await page.getByTestId('dice-recovery').getByRole('button', { name: /Reactivar cooldowns/ }).click()
  await expect(page.getByText('1 entrada reactivada para el dado')).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Listo para tirar')
  await expect(page.getByRole('button', { name: 'Deshacer reactivacion' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer reactivacion' }).click()
  await expect(page.getByText('1 cooldown recuperado')).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Sin tirada posible')
  await page.getByTestId('dice-recovery').getByRole('button', { name: /Reactivar cooldowns/ }).click()
  await expect(page.getByText('1 entrada reactivada para el dado')).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Listo para tirar')

  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(outerWildsCard.getByLabel('Pulso de Outer Wilds')).toContainText('Continuar')
})

test('dice closed decisions can roll another recommendation', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await page.getByRole('button', { name: 'No hoy' }).click()
  await expect(page.getByTestId('dice-decision-summary')).toContainText('apartado')

  await page.getByTestId('dice-decision-summary').getByRole('button', { name: 'Tirar otra' }).click()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await expect(page.getByTestId('dice-decision-summary')).not.toBeVisible()
})

test('library dice review queue rolls a recommendation', async ({ page }) => {
  await openApp(page)
  const diceQueue = page.getByTestId('library-review-queue').locator('.library-review-card', { hasText: 'Probar dado' })

  await expect(diceQueue).toContainText('Candidatas vivas')
  await diceQueue.getByRole('button', { name: 'Tirar dado' }).click()

  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await expect(page.getByTestId('session-activity')).toContainText('Tirada registrada')
})

test('library review session keeps guided queues actionable', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('library-review-queue').getByRole('button', { name: 'Completar ficha' }).click()
  await expect(page.getByTestId('library-review-session')).toContainText('Repaso activo')
  await expect(page.getByTestId('library-review-session')).toContainText('Dar contexto')
  await expect(page.getByTestId('library-review-session')).toContainText('Siguiente:')
  await expect(page.getByLabel('Proximas entradas del repaso')).toContainText('Inception')
  await expect(page.getByRole('dialog', { name: 'Entrada' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  const reviewSession = page.getByTestId('library-review-session')
  await reviewSession.getByRole('button', { name: 'Ver cola' }).click()
  await expect(page.getByText('Vista de repaso: Dar contexto')).toBeVisible()
  await expect(page.getByText('Vista: Sin contexto')).toBeVisible()
  await expect(reviewSession.getByLabel('Pendientes en repaso')).toContainText('4')
  await reviewSession.getByRole('button', { name: 'Terminar repaso' }).click()
  await expect(reviewSession).not.toBeVisible()
  await expect(page.getByText('Repaso guiado pausado')).toBeVisible()
})

test('library review session celebrates completed queues', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Borrar todo' }).click()
  await page.getByLabel('Confirmacion').fill('BORRAR')
  await page.getByRole('button', { name: 'Borrar todo' }).last().click()
  await expect(page.getByText('Tu biblioteca ha sido borrada')).toBeVisible()

  await page.getByRole('button', { name: 'Anadir' }).first().click()
  const draftEditor = page.getByRole('dialog', { name: 'Entrada' })
  await draftEditor.getByLabel('Titulo').fill('Repaso Final')
  await draftEditor.getByLabel('Generos', { exact: true }).fill('Drama')
  await draftEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Repaso Final guardada en Biblioteca')).toBeVisible()

  await page.getByTestId('library-review-queue').getByRole('button', { name: 'Completar ficha' }).click()
  const reviewEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(reviewEditor.getByLabel('Titulo')).toHaveValue('Repaso Final')
  await reviewEditor.getByLabel('Notas').fill('Contexto suficiente para cerrar este repaso.')
  await reviewEditor.getByRole('button', { name: 'Guardar' }).click()

  const completedReview = page.getByTestId('library-review-complete')
  await expect(completedReview).toContainText('Repaso completado')
  await expect(completedReview).toContainText('Dar contexto')
  await expect(completedReview.getByLabel('Pendientes en repaso')).toContainText('0')
  await completedReview.getByRole('button', { name: 'Cerrar' }).click()
  await expect(completedReview).not.toBeVisible()
})

test('mobile layout keeps the core controls reachable', async ({ page }) => {
  await openApp(page)
  await expect(page.getByTestId('library-overview')).toBeVisible()
  await expect(page.getByLabel('Buscar en biblioteca')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explorador', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tirar dado ponderado' })).toBeVisible()
})

test('library empty search can create a prefilled item', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Buscar en biblioteca').fill('Manual sombra')
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await page.getByRole('button', { name: 'Crear entrada Manual sombra' }).click()

  const searchDraftEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(searchDraftEditor.getByLabel('Titulo')).toHaveValue('Manual sombra')
  await searchDraftEditor.getByLabel('Notas').fill('Creada desde una busqueda vacia.')
  await searchDraftEditor.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Manual sombra guardada en Biblioteca')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Manual sombra')
})

test('library can update selected visible items in bulk', async ({ page }) => {
  await openApp(page)
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('Seleccion rapida')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 visibles en esta vista')
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 seleccionadas')
  await page.getByRole('button', { name: 'Quitar visibles' }).click()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('Seleccion rapida')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 visibles en esta vista')
  await expect(page.getByLabel('Seleccion de biblioteca')).not.toContainText('seleccionadas')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()

  const selectionBar = page.getByLabel('Seleccion de biblioteca')
  await expect(selectionBar).toContainText('2 seleccionadas')
  await page.getByLabel('Buscar en biblioteca').fill('zzzz no match')
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await expect(selectionBar).toContainText('2 seleccionadas')
  await expect(selectionBar.getByRole('button', { name: 'Seleccionar visibles' })).toBeDisabled()
  await page.getByLabel('Buscar en biblioteca').fill('')
  await selectionBar.getByLabel('Tags para seleccion').fill('lote qa')
  await selectionBar.getByRole('button', { name: 'Añadir tags' }).click()
  await expect(page.getByText('2 entradas etiquetadas con lote qa')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Tags masivos actualizados')
  await page.getByLabel('Buscar en biblioteca').fill('lote qa')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await selectionBar.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await selectionBar.getByLabel('Tags para seleccion').fill('lote qa')
  await selectionBar.getByRole('button', { name: 'Quitar tags' }).click()
  await expect(page.getByText('2 entradas actualizadas sin lote qa')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer tags' }).click()
  await expect(page.getByText('2 tags recuperados')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await selectionBar.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await selectionBar.getByLabel('Tags para seleccion').fill('lote qa')
  await selectionBar.getByRole('button', { name: 'Quitar tags' }).click()
  await expect(page.getByText('2 entradas actualizadas sin lote qa')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(selectionBar).toContainText('2 seleccionadas')
  await selectionBar.getByLabel('Tipo de senal para seleccion').selectOption('genre')
  await selectionBar.getByLabel('Generos para seleccion').fill('manual genero')
  await selectionBar.getByRole('button', { name: 'Añadir generos' }).click()
  await expect(page.getByText('2 entradas actualizadas con manual genero')).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('manual genero')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer generos' }).click()
  await expect(page.getByText('2 generos recuperados')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(selectionBar).toContainText('2 seleccionadas')
  await selectionBar.getByLabel('Tipo de senal para seleccion').selectOption('mood')
  await selectionBar.getByLabel('Mood tags para seleccion').fill('manual mood')
  await selectionBar.getByRole('button', { name: 'Añadir mood tags' }).click()
  await expect(page.getByText('2 entradas actualizadas con manual mood')).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('manual mood')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer mood tags' }).click()
  await expect(page.getByText('2 mood tags recuperados')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(selectionBar).toContainText('2 seleccionadas')
  await selectionBar.getByLabel('Estado para seleccion').selectOption('completed')
  await selectionBar.getByRole('button', { name: 'Aplicar estado' }).click()

  await expect(page.getByText('2 entradas ahora son Completado')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toContainText('Completado')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('Completado')

  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer estado' }).click()
  await expect(page.getByText('2 estados recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toContainText('Pendiente')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('Pendiente')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await selectionBar.getByLabel('Foco para seleccion').selectOption('high')
  await selectionBar.getByRole('button', { name: 'Aplicar foco' }).click()
  await expect(page.getByText('2 entradas ahora tienen Foco alto')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toContainText('Alta prioridad')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('Alta prioridad')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer foco' }).click()
  await expect(page.getByText('2 focos recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).not.toContainText('Alta prioridad')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).not.toContainText('Alta prioridad')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await selectionBar.getByRole('button', { name: 'Enfriar dado' }).click()
  await expect(page.getByText('2 entradas enfriadas para el dado')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' }).getByLabel('Pulso de Outer Wilds')).toContainText('Cooldown')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' }).getByLabel('Pulso de Vinland Saga')).toContainText('Cooldown')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer dado' }).click()
  await expect(page.getByText('Dado deshecho: 2 reactivadas')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' }).getByLabel('Pulso de Outer Wilds')).toContainText('Disponible')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' }).getByLabel('Pulso de Vinland Saga')).toContainText('Disponible')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await selectionBar.getByRole('button', { name: 'Enfriar dado' }).click()
  await expect(page.getByText('2 entradas enfriadas para el dado')).toBeVisible()
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await selectionBar.getByRole('button', { name: 'Reactivar dado' }).click()
  await expect(page.getByText('2 entradas reactivadas para el dado')).toBeVisible()
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer dado' }).click()
  await expect(page.getByText('Dado deshecho: 2 cooldowns recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' }).getByLabel('Pulso de Outer Wilds')).toContainText('Cooldown')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' }).getByLabel('Pulso de Vinland Saga')).toContainText('Cooldown')
})

test('library can export the current selection without private settings', async ({ page }) => {
  await openApp(page)
  const fullDownloadPromise = page.waitForEvent('download')
  await page.getByLabel('Herramientas de biblioteca').getByRole('button', { name: 'Exportar' }).click()
  const fullDownload = await fullDownloadPromise
  expect(fullDownload.suggestedFilename()).toMatch(/^nexo-export-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(page.getByRole('status').filter({ hasText: 'Backup JSON descargado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Backup privado exportado')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar seleccion' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^nexo-selection-\d{4}-\d{2}-\d{2}\.json$/)
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  const payload = JSON.parse(await readFile(downloadPath!, 'utf8')) as { items: Array<{ title: string }>; settings?: unknown }
  expect(payload.items.map((item) => item.title).sort()).toEqual(['Outer Wilds', 'Vinland Saga'])
  expect(payload.settings).toBeUndefined()
  await expect(page.getByText('2 entradas seleccionadas exportadas sin ajustes')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion exportada')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('exportar seleccion')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Exportar seleccion JSON' })).toHaveAttribute('aria-current', 'true')
  const paletteDownloadPromise = page.waitForEvent('download')
  await quickSearch.getByRole('button', { name: 'Ejecutar Exportar seleccion JSON' }).click()
  const paletteDownload = await paletteDownloadPromise
  expect(paletteDownload.suggestedFilename()).toMatch(/^nexo-selection-\d{4}-\d{2}-\d{2}\.json$/)
})

test('library can delete the current selection with confirmation and undo it', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Borrar seleccion' }).click()
  const deleteSelectionDialog = page.getByRole('dialog', { name: 'Borrar seleccion' })
  await expect(deleteSelectionDialog).toContainText('2 entradas privadas seleccionadas')
  await expect(deleteSelectionDialog.getByRole('button', { name: 'Borrar seleccion' })).toBeDisabled()

  await deleteSelectionDialog.getByLabel('Confirmacion').fill('BORRAR')
  await deleteSelectionDialog.getByRole('button', { name: 'Borrar seleccion' }).click()

  await expect(page.getByText('2 entradas borradas de la seleccion')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion borrada')
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toHaveCount(0)
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toHaveCount(0)

  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer seleccion' }).click()
  await expect(page.getByText('2 entradas recuperadas en Biblioteca')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion recuperada')
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toHaveCount(1)
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toHaveCount(1)
})

test('quick search toggles visible library selection through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Filtrar por tipo').selectOption('game')
  await expect(page.getByText('Tipo: Juegos')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccionar visibles')
  const selectVisibleAction = quickSearch.getByRole('button', {
    name: 'Ejecutar Seleccionar visibles de Biblioteca',
    exact: true,
  })
  await expect(selectVisibleAction).toHaveAttribute('aria-current', 'true')
  await expect(selectVisibleAction).toContainText('0 de 3 visibles seleccionadas')
  await selectVisibleAction.click()

  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('3 seleccionadas')
  await expect(page.getByRole('status').filter({ hasText: '3 visibles seleccionadas' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Visibles seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('quitar visibles')
  const clearVisibleAction = quickSearch.getByRole('button', {
    name: 'Ejecutar Quitar visibles de Biblioteca',
    exact: true,
  })
  await expect(clearVisibleAction).toHaveAttribute('aria-current', 'true')
  await expect(clearVisibleAction).toContainText('3 visibles seleccionadas')
  await clearVisibleAction.click()

  await expect(page.getByLabel('Seleccion de biblioteca')).not.toContainText('seleccionadas')
  await expect(page.getByRole('status').filter({ hasText: '3 visibles quitadas de la seleccion' })).toBeVisible()

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccionar visibles')
  await quickSearch
    .getByRole('button', { name: 'Ejecutar Seleccionar visibles de Biblioteca', exact: true })
    .click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 seleccionadas')
  await expect(page.getByRole('status').filter({ hasText: '7 visibles seleccionadas' })).toBeVisible()
})

test('quick search hides selection-only commands until a library selection exists', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })

  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccion completado')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Seleccion: Completado', exact: true })).toHaveCount(0)

  await quickSearch.getByLabel('Buscar en Nexo').fill('exportar seleccion')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Exportar seleccion JSON', exact: true })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(quickSearch).not.toBeVisible()
  await page.getByLabel('Seleccionar Outer Wilds').check()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearchWithSelection = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearchWithSelection.getByLabel('Buscar en Nexo').fill('seleccion completado')
  const selectedStatusAction = quickSearchWithSelection.getByRole('button', {
    name: 'Ejecutar Seleccion: Completado',
    exact: true,
  })
  await expect(selectedStatusAction).toHaveAttribute('aria-current', 'true')
  await expect(selectedStatusAction).toContainText('1 seleccionada')

  await quickSearchWithSelection.getByLabel('Buscar en Nexo').fill('exportar seleccion')
  await expect(quickSearchWithSelection.getByRole('button', { name: 'Ejecutar Exportar seleccion JSON', exact: true })).toContainText(
    '1 seleccionada',
  )
})

test('quick search clears the persistent library selection', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('limpiar seleccion')
  const clearSelectionAction = quickSearch.getByRole('button', {
    name: 'Ejecutar Limpiar seleccion de Biblioteca',
    exact: true,
  })
  await expect(clearSelectionAction).toHaveAttribute('aria-current', 'true')
  await expect(clearSelectionAction).toContainText('2 seleccionadas')
  await clearSelectionAction.click()

  await expect(page.getByLabel('Seleccion de biblioteca')).not.toContainText('seleccionadas')
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion limpiada')
})

test('quick search applies a status to the current library selection', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccion completado')
  const completeSelectionAction = quickSearch.getByRole('button', {
    name: 'Ejecutar Seleccion: Completado',
    exact: true,
  })
  await expect(completeSelectionAction).toHaveAttribute('aria-current', 'true')
  await expect(completeSelectionAction).toContainText('2 seleccionadas')
  await completeSelectionAction.click()

  await expect(page.getByText('2 entradas ahora son Completado')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toContainText('Completado')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('Completado')
  await expect(page.getByTestId('session-activity')).toContainText('Estado masivo actualizado')

  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer estado' }).click()
  await expect(page.getByText('2 estados recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toContainText('Pendiente')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('Pendiente')
  await page.getByLabel('Seleccionar Inception').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('1 seleccionada')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccion pendiente')
  const pendingSelectionAction = quickSearch.getByRole('button', { name: 'Ejecutar Seleccion: Pendiente', exact: true })
  await expect(pendingSelectionAction).toContainText('1 seleccionada')
  await pendingSelectionAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByText('1 entrada ahora es Pendiente')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Inception' })).toContainText('Pendiente')
})

test('quick search updates dice cooldowns for the current library selection', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('enfriar seleccion')
  const snoozeSelectionAction = quickSearch.getByRole('button', {
    name: 'Ejecutar Enfriar seleccion del dado',
    exact: true,
  })
  await expect(snoozeSelectionAction).toHaveAttribute('aria-current', 'true')
  await expect(snoozeSelectionAction).toContainText('2 candidatas del dado')
  await snoozeSelectionAction.click()

  await expect(page.getByText('2 entradas enfriadas para el dado')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' }).getByLabel('Pulso de Outer Wilds')).toContainText('Cooldown')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' }).getByLabel('Pulso de Vinland Saga')).toContainText('Cooldown')
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion enfriada')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('reactivar seleccion')
  const reactivateSelectionAction = quickSearch.getByRole('button', {
    name: 'Ejecutar Reactivar seleccion del dado',
    exact: true,
  })
  await expect(reactivateSelectionAction).toHaveAttribute('aria-current', 'true')
  await expect(reactivateSelectionAction).toContainText('2 cooldowns activos')
  await reactivateSelectionAction.click()

  await expect(page.getByText('2 entradas reactivadas para el dado')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' }).getByLabel('Pulso de Outer Wilds')).toContainText('Disponible')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' }).getByLabel('Pulso de Vinland Saga')).toContainText('Disponible')
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion reactivada')

  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer dado' }).click()
  await expect(page.getByText('Dado deshecho: 2 cooldowns recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' }).getByLabel('Pulso de Outer Wilds')).toContainText('Cooldown')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' }).getByLabel('Pulso de Vinland Saga')).toContainText('Cooldown')
})

test('quick search updates focus for the current library selection', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccion foco alto')
  const focusSelectionAction = quickSearch.getByRole('button', {
    name: 'Ejecutar Seleccion: Foco alto',
    exact: true,
  })
  await expect(focusSelectionAction).toHaveAttribute('aria-current', 'true')
  await expect(focusSelectionAction).toContainText('2 seleccionadas')
  await focusSelectionAction.click()

  await expect(page.getByText('2 entradas ahora tienen Foco alto')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).toContainText('Alta prioridad')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('Alta prioridad')
  await expect(page.getByTestId('session-activity')).toContainText('Foco masivo actualizado')

  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer foco' }).click()
  await expect(page.getByText('2 focos recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).not.toContainText('Alta prioridad')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).not.toContainText('Alta prioridad')

  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccion foco bajo')
  const lowFocusSelectionAction = quickSearch.getByRole('button', { name: 'Ejecutar Seleccion: Foco bajo', exact: true })
  await expect(lowFocusSelectionAction).toContainText('1 seleccionada')
  await lowFocusSelectionAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByText('1 entrada ahora tiene Foco bajo')).toBeVisible()
})

test('quick search adds known taxonomy signals to the current library selection', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccion tag sci-fi')
  const tagSelectionAction = quickSearch.getByRole('button', { name: 'Ejecutar Seleccion: tag sci-fi', exact: true })
  await expect(tagSelectionAction).toHaveAttribute('aria-current', 'true')
  await tagSelectionAction.click()

  await expect(page.getByText('1 entradas etiquetadas con sci-fi')).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('Vinland Saga')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('sci-fi')

  await page.getByLabel('Seleccionar Vinland Saga').check()
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const removeQuickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await removeQuickSearch.getByLabel('Buscar en Nexo').fill('seleccion quitar tag sci-fi')
  const removeTagSelectionAction = removeQuickSearch.getByRole('button', { name: 'Ejecutar Seleccion: quitar tag sci-fi', exact: true })
  await expect(removeTagSelectionAction).toHaveAttribute('aria-current', 'true')
  await removeTagSelectionAction.click()

  await expect(page.getByText('1 entradas actualizadas sin sci-fi')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).not.toContainText('sci-fi')

  await page.getByLabel('Buscar en biblioteca').fill('')
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const genreQuickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await genreQuickSearch.getByLabel('Buscar en Nexo').fill('seleccion genero misterio')
  const genreSelectionAction = genreQuickSearch.getByRole('button', { name: 'Ejecutar Seleccion: genero misterio', exact: true })
  await expect(genreSelectionAction).toHaveAttribute('aria-current', 'true')
  await genreSelectionAction.click()

  await expect(page.getByText('1 entradas actualizadas con misterio')).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('Vinland Saga')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('misterio')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer generos' }).click()
  await expect(page.getByText('1 generos recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).not.toContainText('misterio')

  await page.getByLabel('Buscar en biblioteca').fill('')
  await page.getByLabel('Seleccionar Outer Wilds').check()
  await page.getByLabel('Seleccionar Vinland Saga').check()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const moodQuickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await moodQuickSearch.getByLabel('Buscar en Nexo').fill('seleccion mood intenso')
  const moodSelectionAction = moodQuickSearch.getByRole('button', { name: 'Ejecutar Seleccion: mood intenso', exact: true })
  await expect(moodSelectionAction).toHaveAttribute('aria-current', 'true')
  await moodSelectionAction.click()

  await expect(page.getByText('2 entradas actualizadas con intenso')).toBeVisible()
  await page.getByLabel('Buscar en biblioteca').fill('Vinland Saga')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toContainText('intenso')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer mood tags' }).click()
  await expect(page.getByText('2 mood tags recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).not.toContainText('intenso')
})

test('quick search opens library items through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await expect(quickSearch).toBeVisible()
  await quickSearch.getByLabel('Buscar en Nexo').fill('outer')
  await quickSearch.getByRole('button', { name: 'Abrir Outer Wilds' }).click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page).toHaveURL(/item=game-outer-wilds/)
  await expect(page.getByRole('dialog', { name: 'Entrada' }).getByLabel('Titulo')).toHaveValue('Outer Wilds')
})

test('quick search opens the active result from the keyboard', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Busqueda rapida' })).toHaveAttribute(
    'aria-keyshortcuts',
    '/ Control+K Meta+K',
  )
  await page.keyboard.press('/')
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await expect(quickSearch).toBeVisible()
  const searchInput = quickSearch.getByLabel('Buscar en Nexo')
  await searchInput.fill('outer')
  await expect(quickSearch.getByRole('button', { name: 'Abrir Outer Wilds' })).toHaveAttribute('aria-current', 'true')
  await searchInput.press('Enter')
  await expect(page).toHaveURL(/item=game-outer-wilds/)
  await expect(page.getByRole('dialog', { name: 'Entrada' }).getByLabel('Titulo')).toHaveValue('Outer Wilds')
})

test('quick search keyboard shortcuts avoid normal text entry', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()

  const quickSearchButton = page.getByRole('button', { name: 'Busqueda rapida' })
  await quickSearchButton.click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await expect(quickSearch).toBeVisible()
  await expect(quickSearch.getByLabel('Buscar en Nexo')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Abrir en Nexo' })).not.toBeVisible()
  await expect(quickSearchButton).toBeFocused()

  const librarySearch = page.getByLabel('Buscar en biblioteca')
  await librarySearch.fill('/')
  await expect(librarySearch).toHaveValue('/')
  await expect(page.getByRole('dialog', { name: 'Abrir en Nexo' })).not.toBeVisible()

  await librarySearch.blur()
  await page.keyboard.press('Control+K')
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await expect(quickSearch).toBeVisible()
  await expect(quickSearch.getByLabel('Buscar en Nexo')).toBeFocused()
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press('Tab')
    await expectFocusWithin(quickSearch)
  }
})

test('dialogs support escape without losing unsaved edits', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()

  const addButton = page.getByRole('button', { name: 'Anadir' }).first()
  await addButton.click()
  let privateEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(privateEditor).toBeVisible()
  await expect(privateEditor.getByLabel('Titulo')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Entrada' })).not.toBeVisible()
  await expect(addButton).toBeFocused()

  await addButton.click()
  privateEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(privateEditor.getByLabel('Titulo')).toBeFocused()
  await privateEditor.getByLabel('Titulo').fill('Borrador con Escape')
  await privateEditor.getByRole('button', { name: 'Guardar', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expectFocusWithin(privateEditor)
  await page.keyboard.press('Escape')
  await expect(privateEditor).toBeVisible()
  await expect(page.getByLabel('Cambios sin guardar')).toContainText('Guarda la ficha')
  await page.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(privateEditor.getByLabel('Titulo')).toHaveValue('Borrador con Escape')
  await privateEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('dialog', { name: 'Entrada' })).not.toBeVisible()
  await expect(addButton).toBeFocused()

  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await page.getByRole('menuitem', { name: 'Borrar Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).not.toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')

  await page.getByRole('button', { name: 'Curacion' }).click()
  const createBooksButton = page.getByRole('button', { name: 'Crear Libros' })
  await createBooksButton.click()
  const publicEditor = page.locator('.public-item-editor')
  await expect(publicEditor).toBeVisible()
  await expect(publicEditor.getByLabel('Titulo')).toBeFocused()
  await publicEditor.getByLabel('Titulo').fill('Catalogo con Escape')
  await publicEditor.getByRole('button', { name: 'Guardar en catalogo' }).focus()
  await page.keyboard.press('Tab')
  await expectFocusWithin(publicEditor)
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Cambios sin guardar')).toContainText('Guarda la ficha')
  await page.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(publicEditor).not.toBeVisible()
  await expect(createBooksButton).toBeFocused()
})

test('quick search runs command actions', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Anadir entrada' })).toBeVisible()
  await quickSearch.getByRole('button', { name: 'Ejecutar Anadir entrada' }).click()
  const draftEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(draftEditor.getByLabel('Titulo')).toHaveValue('')
  await draftEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('tirar')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Tirar dado' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Ejecutar Tirar dado' }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await expect(page.getByTestId('session-activity')).toContainText('Tirada registrada')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('backup')
  const downloadPromise = page.waitForEvent('download')
  await quickSearch.getByRole('button', { name: 'Ejecutar Exportar backup JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^nexo-backup-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(page.getByTestId('session-activity')).toContainText('Backup privado exportado')
})

test('quick search rolls dice through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByLabel('Tipo por defecto').selectOption('book')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('tirar')
  await quickSearch.getByRole('button', { name: 'Ejecutar Tirar dado' }).click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Ajustes')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
})

test('quick search reviews dice instead of rolling when no candidates exist', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Medio').selectOption('manhwa')
  await expect(page.getByTestId('dice-readiness')).toContainText('Sin tirada posible')

  await page.keyboard.press('Control+K')
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('tirar')
  const reviewDiceAction = quickSearch.getByRole('button', { name: 'Ejecutar Revisar dado' })
  await expect(reviewDiceAction).toHaveAttribute('aria-current', 'true')
  await expect(reviewDiceAction).toContainText('Sin candidatas con los filtros actuales')
  await reviewDiceAction.click()

  await expect(quickSearch).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Sin tirada posible')
  await expect(page.getByTestId('recommendation-result')).toHaveCount(0)
})

test('quick search can save pending dice preferences', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('guardar dado')
  const saveDiceAction = quickSearch.getByRole('button', { name: 'Ejecutar Guardar ajustes del dado' })
  await expect(saveDiceAction).toHaveAttribute('aria-current', 'true')
  await expect(saveDiceAction).toContainText('Preferencias pendientes')
  await saveDiceAction.click()

  await expect(page.getByRole('status').filter({ hasText: 'Ajustes del dado guardados' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajustes guardados' })).toBeDisabled()
  await expect(page.getByTestId('session-activity')).toContainText('Preferencias guardadas')
  await expect(page.getByRole('button', { name: 'Deshacer ajustes del dado' })).toBeVisible()
})

test('quick search can reactivate dice cooldowns through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await page.getByRole('menuitem', { name: 'Enfriar dado Outer Wilds' }).click()
  await expect(page.getByText('Outer Wilds enfriado para el dado')).toBeVisible()

  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Tema Rosa', exact: true }).click()
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('reactivar cooldowns')
  const reactivateAction = quickSearch.getByRole('button', { name: 'Ejecutar Reactivar cooldowns del dado' })
  await expect(reactivateAction).toHaveAttribute('aria-current', 'true')
  await expect(reactivateAction).toContainText('1 entrada en cooldown')
  await reactivateAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Ajustes')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=dice/)
  await expect(page.getByRole('status').filter({ hasText: '1 entrada reactivada para el dado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Cooldowns reactivados')
  await expect(page.getByRole('button', { name: 'Deshacer reactivacion' })).toBeVisible()
})

test('quick search applies theme commands', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('rosa')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Tema Rosa' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Ejecutar Tema Rosa' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fff5f8')
  await expect(page.getByRole('button', { name: 'Elegir tema. Actual Rosa', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('bosque')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Tema Bosque' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Ejecutar Tema Bosque' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f1712')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('aurora')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Tema Aurora' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Ejecutar Tema Aurora' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101113')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('menta')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Tema Menta' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Ejecutar Tema Menta' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mint')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5fbf7')
})

test('global theme menu stays in sync with settings', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: 'Elegir tema. Actual Oscuro', exact: true }).click()
  const themeMenu = page.getByRole('menu', { name: 'Temas de Nexo' })
  await themeMenu.getByRole('menuitemradio', { name: 'Usar tema Rosa' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fff5f8')
  const roseThemeButton = page.getByRole('button', { name: 'Tema Rosa', exact: true })
  await expect(roseThemeButton).toHaveClass(/active/)
  await expect(roseThemeButton.locator('.theme-option-status')).toContainText('Actual')
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Salida con cambios pendientes')).not.toBeVisible()

  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByLabel('Salida con cambios pendientes')).not.toBeVisible()
})

test('quick search can save pending settings', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Tema Rosa', exact: true }).click()
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('guardar ajustes')
  const saveSettingsAction = quickSearch.getByRole('button', { name: 'Ejecutar Guardar ajustes pendientes' })
  await expect(saveSettingsAction).toHaveAttribute('aria-current', 'true')
  await expect(saveSettingsAction).toContainText('Preferencias pendientes')
  await saveSettingsAction.click()

  await expect(page.getByRole('status').filter({ hasText: 'Ajustes guardados' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose')
  await expect(page.getByTestId('session-activity')).toContainText('Ajustes guardados')
})

test('quick search can start a backup import through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('importar backup')
  const importAction = quickSearch.getByRole('button', { name: 'Ejecutar Importar backup JSON' })
  await expect(importAction).toHaveAttribute('aria-current', 'true')
  await importAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({
    name: 'nexo-palette-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-03T00:00:00.000Z',
        items: [
          {
            title: 'Palette Import Probe',
            type: 'book',
            status: 'wishlist',
            genres: ['Ensayo'],
            tags: ['paleta'],
            moodTags: [],
            weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
            source: 'manual',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  })

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page).not.toHaveURL(/tab=dice/)
  await expect(page.getByText('Backup preparado: 1 nueva / 0 actualizadas')).toBeVisible()
  await expect(page.getByLabel('Backup preparado en biblioteca')).toContainText('nexo-palette-import.json')
  await expect(page.getByText('Palette Import Probe')).not.toBeVisible()
  await page.getByRole('button', { name: 'Aplicar backup' }).click()
  await expect(page.getByText('Importadas 1 entradas')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Palette Import Probe')
})

test('quick search opens library smart views through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('sin contexto')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Vista Sin contexto' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Ejecutar Vista Sin contexto' }).click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByText('Vista: Sin contexto')).toBeVisible()
  await expect(page.getByText('4 de 7 entradas')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Inception')
  await expect(page.getByTestId('library-grid')).not.toContainText('Outer Wilds')
})

test('quick search switches library layout through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('vista lista')
  const listLayoutAction = quickSearch.getByRole('button', { name: 'Ejecutar Vista Lista', exact: true })
  await expect(listLayoutAction).toHaveAttribute('aria-current', 'true')
  await expect(listLayoutAction).toContainText('Guardar como vista de biblioteca')
  await listLayoutAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toHaveClass(/list-view/)
  await expect(page.getByRole('status').filter({ hasText: 'Vista Lista guardada' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Vista de biblioteca guardada')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('vista tarjetas')
  const cardsLayoutAction = quickSearch.getByRole('button', { name: 'Ejecutar Vista Tarjetas', exact: true })
  await expect(cardsLayoutAction).toHaveAttribute('aria-current', 'true')
  await cardsLayoutAction.click()

  await expect(page.getByTestId('library-grid')).not.toHaveClass(/list-view/)
  await expect(page.getByRole('status').filter({ hasText: 'Vista Tarjetas guardada' })).toBeVisible()
})

test('quick search changes library sort through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('orden titulo')
  const titleSortAction = quickSearch.getByRole('button', { name: 'Ejecutar Orden Titulo', exact: true })
  await expect(titleSortAction).toHaveAttribute('aria-current', 'true')
  await expect(titleSortAction).toContainText('Ordenar biblioteca')
  await titleSortAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByLabel('Ordenar biblioteca')).toHaveValue('title')
  await expect(page.getByText('Orden: Titulo')).toBeVisible()
  await expect(page.locator('[data-testid="library-grid"] .item-card').first()).toContainText('1984 - George Orwell')
  await expect(page.getByRole('status').filter({ hasText: 'Orden Titulo aplicado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Orden de biblioteca aplicado')
})

test('quick search applies library filters through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('estado pendiente')
  const pendingStatusAction = quickSearch.getByRole('button', { name: 'Ejecutar Estado Pendiente', exact: true })
  await expect(pendingStatusAction).toHaveAttribute('aria-current', 'true')
  await expect(pendingStatusAction).toContainText('2 entradas')
  await pendingStatusAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByText('Estado: Pendiente')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).not.toContainText('Inception')
  await expect(page.getByRole('status').filter({ hasText: 'Filtro Pendiente aplicado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Filtro de estado aplicado')

  await page.getByRole('button', { name: 'Restablecer vista' }).click()
  await expect(page.getByText('Estado: Pendiente')).not.toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('tipo juegos')
  const gamesTypeAction = quickSearch.getByRole('button', { name: 'Ejecutar Tipo Juegos', exact: true })
  await expect(gamesTypeAction).toHaveAttribute('aria-current', 'true')
  await expect(gamesTypeAction).toContainText('3 entradas')
  await gamesTypeAction.click()

  await expect(page.getByLabel('Filtrar por tipo')).toHaveValue('game')
  await expect(page.getByText('Tipo: Juegos')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).not.toContainText('Inception')
  await expect(page.getByRole('status').filter({ hasText: 'Tipo Juegos aplicado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Filtro de tipo aplicado')
})

test('quick search resets the library view through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Filtrar por tipo').selectOption('game')
  await page.getByLabel('Ordenar biblioteca').selectOption('title')
  await expect(page.getByText('Tipo: Juegos')).toBeVisible()
  await expect(page.getByText('Orden: Titulo')).toBeVisible()

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('restablecer biblioteca')
  const resetAction = quickSearch.getByRole('button', { name: 'Ejecutar Restablecer vista de Biblioteca', exact: true })
  await expect(resetAction).toHaveAttribute('aria-current', 'true')
  await expect(resetAction).toContainText('Limpiar filtros')
  await resetAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByLabel('Filtrar por tipo')).toHaveValue('all')
  await expect(page.getByLabel('Ordenar biblioteca')).toHaveValue('focus')
  await expect(page.getByText('Tipo: Juegos')).not.toBeVisible()
  await expect(page.getByText('Orden: Titulo')).not.toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Vista de Biblioteca restablecida' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Vista de biblioteca restablecida')
})

test('quick search starts guided library review through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('repaso guiado')
  const reviewAction = quickSearch.getByRole('button', { name: 'Ejecutar Iniciar repaso guiado' })
  await expect(reviewAction).toHaveAttribute('aria-current', 'true')
  await expect(reviewAction).toContainText('Dar contexto')
  await reviewAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByTestId('library-review-session')).toContainText('Repaso activo')
  await expect(page.getByTestId('library-review-session')).toContainText('Dar contexto')
  await expect(page.getByRole('dialog', { name: 'Entrada' }).getByLabel('Titulo')).toHaveValue('Inception')
})

test('quick search can start a specific guided review queue', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('probar dado')
  const reviewAction = quickSearch.getByRole('button', { name: 'Ejecutar Repaso: Probar dado' })
  await expect(reviewAction).toHaveAttribute('aria-current', 'true')
  await expect(reviewAction).toContainText('Candidatas vivas')
  await reviewAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await expect(page.getByTestId('session-activity')).toContainText('Tirada registrada')
})

test('quick search applies the next library action through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('siguiente')
  const nextAction = quickSearch.getByRole('button', { name: 'Ejecutar Completar siguiente accion' })
  await expect(nextAction).toHaveAttribute('aria-current', 'true')
  await expect(nextAction).toContainText('Inception')
  await nextAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page.getByText('Inception ahora es Completado')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Inception' })).toContainText('Completado')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer estado' }).click()
  await expect(page.getByText('Inception recuperado como En progreso')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Inception' })).toContainText('En progreso')
})

test('quick search opens sections through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('explorador')
  await expect(quickSearch.getByRole('button', { name: 'Abrir Explorador' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Abrir Explorador' }).click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByRole('heading', { name: 'Encuentra la proxima entrada' })).toBeVisible()
})

test('quick search can start an explorer search through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('explorar Odisea')
  const exploreAction = quickSearch.getByRole('button', { name: 'Explorar Odisea', exact: true })
  await expect(exploreAction).toHaveAttribute('aria-current', 'true')
  await exploreAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByRole('heading', { name: 'Encuentra la proxima entrada' })).toBeVisible()
  await expect(page.getByLabel('Buscar en explorador')).toHaveValue('Odisea')
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Odisea')
})

test('quick search can add an explorer surprise card through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('carta sorpresa')
  await expect(quickSearch.getByRole('button', { name: 'Ejecutar Carta sorpresa' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Ejecutar Carta sorpresa' }).click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByRole('heading', { name: 'Encuentra la proxima entrada' })).toBeVisible()
  await expect(page.getByText('Carta de exploracion anadida.')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Carta sorpresa anadida')
  await expect(page.getByRole('button', { name: /Ideas/ })).toBeVisible()
})

test('quick search can reopen explorer candidates through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('odisea')
  const candidateAction = quickSearch.getByRole('button', { name: 'Abrir hallazgo Odisea' }).first()
  await expect(candidateAction).toHaveAttribute('aria-current', 'true')
  await expect(candidateAction).toContainText('En cola')
  await candidateAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByRole('heading', { name: 'Encuentra la proxima entrada' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('En cola')
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('Guardar en Biblioteca')
})

test('quick search can open the next explorer candidate through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('revisar hallazgo')
  const nextCandidateAction = quickSearch.getByRole('button', { name: 'Ejecutar Revisar siguiente hallazgo' })
  await expect(nextCandidateAction).toHaveAttribute('aria-current', 'true')
  await expect(nextCandidateAction).toContainText('Odisea')
  await nextCandidateAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('En cola')
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('Guardar en Biblioteca')
})

test('quick search can save the next explorer candidate through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('guardar hallazgo')
  const saveCandidateAction = quickSearch.getByRole('button', { name: 'Ejecutar Guardar siguiente hallazgo' })
  await expect(saveCandidateAction).toHaveAttribute('aria-current', 'true')
  await expect(saveCandidateAction).toContainText('Odisea')
  await saveCandidateAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByText('Odisea guardado en Biblioteca.')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Hallazgo guardado')
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer guardado' })).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
})

test('quick search can save a filtered explorer view through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Odisea')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('guardar vista')
  const saveVisibleAction = quickSearch.getByRole('button', { name: 'Ejecutar Guardar vista del explorador' })
  await expect(saveVisibleAction).toHaveAttribute('aria-current', 'true')
  await expect(saveVisibleAction).toContainText('APIs')
  await saveVisibleAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByText('Odisea guardado desde la vista APIs.')).toBeVisible()
  await expect(page.getByTestId('explorer-completion')).toContainText('APIs limpio')
  await expect(page.getByRole('button', { name: 'Deshacer guardado de vista' })).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
})

test('quick search can dismiss the next explorer candidate through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('descartar hallazgo')
  const dismissCandidateAction = quickSearch.getByRole('button', { name: 'Ejecutar Descartar siguiente hallazgo' })
  await expect(dismissCandidateAction).toHaveAttribute('aria-current', 'true')
  await expect(dismissCandidateAction).toContainText('Odisea')
  await dismissCandidateAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByText('Odisea descartado de la cola.')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Hallazgo descartado')
  await expect(page.getByRole('button', { name: 'Deshacer descarte' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer descarte' }).click()
  await expect(page.getByText('Odisea recuperado a la cola.')).toBeVisible()
})

test('quick search can dismiss a filtered explorer view through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Odisea')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('descartar vista')
  const dismissVisibleAction = quickSearch.getByRole('button', { name: 'Ejecutar Descartar vista del explorador' })
  await expect(dismissVisibleAction).toHaveAttribute('aria-current', 'true')
  await expect(dismissVisibleAction).toContainText('APIs')
  await dismissVisibleAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByText('Odisea descartado de la vista APIs.')).toBeVisible()
  await expect(page.getByTestId('explorer-completion')).toContainText('APIs limpio')
  await expect(page.getByRole('button', { name: 'Deshacer descarte' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Vista descartada')
  await page.getByRole('button', { name: 'Deshacer descarte' }).click()
  await expect(page.getByText('Odisea recuperado a la cola.')).toBeVisible()
})

test('quick search can create a prefilled item through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('Manual global')
  await expect(quickSearch.getByRole('button', { name: 'Crear entrada Manual global' })).toHaveAttribute('aria-current', 'true')
  await quickSearch.getByRole('button', { name: 'Crear entrada Manual global' }).click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  const createdEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(createdEditor.getByLabel('Titulo')).toHaveValue('Manual global')
  await createdEditor.getByLabel('Notas').fill('Creada desde busqueda rapida global.')
  await createdEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Manual global guardada en Biblioteca')).toBeVisible()
})

test('activity entries navigate through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Anadir' }).click()
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await editor.getByLabel('Titulo').fill('Actividad navegable')
  await editor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByTestId('session-continuity').getByRole('button', { name: 'Continuar desde Ficha guardada en Biblioteca' }).click()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()

  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page).toHaveURL(/item=movie-actividad-navegable/)
  const focusedEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(focusedEditor.getByLabel('Titulo')).toHaveValue('Actividad navegable')
})

test('quick search resumes recent activity through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Anadir' }).click()
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await editor.getByLabel('Titulo').fill('Actividad paleta')
  await editor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('ficha guardada')
  const activityCommand = quickSearch.getByRole('button', { name: 'Ejecutar Continuar Ficha guardada' })
  await expect(activityCommand).toHaveAttribute('aria-current', 'true')
  await expect(activityCommand).toContainText('Actividad paleta')
  await activityCommand.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page).toHaveURL(/item=movie-actividad-paleta/)
  await expect(page.getByRole('dialog', { name: 'Entrada' }).getByLabel('Titulo')).toHaveValue('Actividad paleta')
})

test('quick search can clear and restore recent activity', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Anadir' }).click()
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await editor.getByLabel('Titulo').fill('Actividad limpiable')
  await editor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-activity')).toContainText('Actividad limpiable')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('limpiar actividad')
  const clearActivityAction = quickSearch.getByRole('button', { name: 'Ejecutar Limpiar actividad reciente' })
  await expect(clearActivityAction).toHaveAttribute('aria-current', 'true')
  await clearActivityAction.click()

  await expect(page.getByTestId('session-activity')).toContainText('Actividad limpiada')
  await expect(page.getByTestId('session-activity')).not.toContainText('Actividad limpiable')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('deshacer limpieza')
  const undoActivityAction = quickSearch.getByRole('button', { name: 'Ejecutar Deshacer limpieza de actividad' })
  await expect(undoActivityAction).toHaveAttribute('aria-current', 'true')
  await undoActivityAction.click()

  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-activity')).toContainText('Actividad limpiable')
})

test('quick search can apply taste suggestions through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('sugerencias gusto')
  const suggestionsAction = quickSearch.getByRole('button', { name: 'Ejecutar Aplicar sugerencias de gusto' })
  await expect(suggestionsAction).toHaveAttribute('aria-current', 'true')
  await expect(suggestionsAction).toContainText('sugerencias pendientes')
  await suggestionsAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=settings/)
  await expect(page.getByRole('status').filter({ hasText: /sugerencias anadidas/ })).toBeVisible()
  await expect(page.getByLabel('Generos favoritos')).toHaveValue('sci-fi')
  await expect(page.getByLabel('Tags favoritos')).toHaveValue('pelicula, sci-fi')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
})

test('quick search can repair private taxonomy through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByLabel('Importar backup JSON').setInputFiles({
    name: 'nexo-quick-taxonomy-repair.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-03T00:00:00.000Z',
        items: [
          {
            title: 'Quick Taxonomy Probe',
            type: 'movie',
            status: 'wishlist',
            genres: [],
            tags: [],
            moodTags: [],
            weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
            source: 'manual',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  })
  await page.getByRole('button', { name: 'Aplicar backup' }).click()
  await expect(page.getByTestId('private-action-plan')).toContainText('Completar taxonomia')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('completar taxonomia privada')
  const repairAction = quickSearch.getByRole('button', { name: 'Ejecutar Completar taxonomia privada' })
  await expect(repairAction).toHaveAttribute('aria-current', 'true')
  await expect(repairAction).toContainText('1 ficha reparable')
  await repairAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=settings/)
  await expect(page.getByRole('status').filter({ hasText: 'Taxonomia privada completada en 1 ficha' })).toBeVisible()
  await expect(page.getByTestId('private-data-health')).toContainText('8/8')
  await expect(page.getByRole('button', { name: 'Deshacer taxonomia' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Taxonomia privada completada')
})

test('library item deep links open and close the focused editor', async ({ page }) => {
  await page.goto('/?item=game-outer-wilds')
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(editor.getByLabel('Titulo')).toHaveValue('Outer Wilds')
  await expect(page).toHaveURL(/item=game-outer-wilds/)
  await editor.getByRole('button', { name: 'Copiar enlace a Outer Wilds' }).click()
  await expect(editor.getByLabel('Enlace de ficha')).toHaveValue(/item=game-outer-wilds/)

  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Entrada' })).not.toBeVisible()
  await expect(page).not.toHaveURL(/item=game-outer-wilds/)

  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Entrada' }).getByLabel('Titulo')).toHaveValue('Outer Wilds')
})

test('missing item deep links can recover through library search', async ({ page }) => {
  await page.goto('/?item=outer-wilds')
  await expect(page.getByLabel('Actividad sin entrada')).toContainText('outer wilds')
  await page.getByRole('button', { name: 'Buscar parecido' }).click()
  await expect(page).not.toHaveURL(/item=outer-wilds/)
  await expect(page.getByLabel('Buscar en biblioteca')).toHaveValue('outer wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
})

test('dice item activity opens the linked library editor', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toBeVisible()
  await page.getByRole('button', { name: 'Afinar ficha recomendada' }).click()

  const diceEditor = page.getByRole('dialog', { name: 'Entrada' })
  const recommendedTitle = await diceEditor.getByLabel('Titulo').inputValue()
  await diceEditor.getByRole('textbox', { name: 'Progreso' }).fill('Vuelta desde actividad del dado.')
  await diceEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha afinada')

  await page
    .getByTestId('session-activity')
    .getByRole('button', { name: 'Abrir Ficha afinada en Biblioteca' })
    .click()
  await expect(page).toHaveURL(/item=/)
  await expect(page.getByRole('dialog', { name: 'Entrada' }).getByLabel('Titulo')).toHaveValue(recommendedTitle)
})

test('pwa metadata is present', async ({ page }) => {
  await openApp(page)

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f1214')

  const response = await page.request.get('/manifest.webmanifest')
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest).toEqual(expect.objectContaining({ display: 'standalone', id: '/', name: 'Nexo' }))
  expect(manifest.icons).toEqual(
    expect.arrayContaining([expect.objectContaining({ src: '/icons/nexo.svg', purpose: 'any maskable' })]),
  )
  expect(manifest.shortcuts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Dado ponderado', url: '/?tab=dice' }),
      expect.objectContaining({ name: 'Explorador', url: '/?tab=explorer' }),
    ]),
  )
  await page.evaluate(() => {
    const installEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => {
        window.localStorage.setItem('nexo-install-prompted', 'yes')
        return Promise.resolve()
      },
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    })
    window.dispatchEvent(installEvent)
  })
  await expect(page.getByRole('button', { name: 'Instalar Nexo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Instalar Nexo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Instalar Nexo', exact: true })).not.toBeVisible()
  await page.waitForFunction(() => window.localStorage.getItem('nexo-install-prompted') === 'yes')

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('nexo:service-worker-update-ready')))
  await expect(page.getByRole('button', { name: 'Actualizar Nexo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Actualizar Nexo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Actualizar Nexo', exact: true })).not.toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    window.dispatchEvent(new Event('offline'))
  })
  await expect(page.getByRole('status', { name: 'Sin conexion', exact: true })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
  })
  await expect(page.getByRole('status', { name: 'Sin conexion', exact: true })).not.toBeVisible()

  await page.getByRole('button', { name: 'Elegir tema. Actual Oscuro', exact: true }).click()
  const themeMenu = page.getByRole('menu', { name: 'Temas de Nexo' })
  await expect(themeMenu).toBeVisible()
  await expect(themeMenu.getByRole('menuitemradio')).toHaveCount(7)
  const themeMenuBox = await themeMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportWidth: window.innerWidth,
    }
  })
  expect(themeMenuBox.left).toBeGreaterThanOrEqual(-1)
  expect(themeMenuBox.right).toBeLessThanOrEqual(themeMenuBox.viewportWidth + 1)
  expect(themeMenuBox.top).toBeGreaterThanOrEqual(-1)
  await expect(themeMenu.getByRole('menuitemradio', { name: 'Usar tema Oscuro' })).toHaveAttribute('aria-checked', 'true')
  await themeMenu.getByRole('menuitemradio', { name: 'Usar tema Claro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8faf9')
  await page.getByRole('button', { name: 'Elegir tema. Actual Claro', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Usar tema Rosa' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fff5f8')
  await expect(page.getByRole('button', { name: 'Elegir tema. Actual Rosa', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Elegir tema. Actual Rosa', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Usar tema Aurora' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101113')

  await page.goto('/?tab=dice')
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page).toHaveURL(/tab=explorer/)
  await page.goBack()
  await expect(page).toHaveURL(/tab=dice/)
  await expect(page.getByRole('heading', { name: 'Elige el siguiente hilo' })).toBeVisible()
})

test('browser history asks before leaving pending dice preferences', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page).toHaveURL(/tab=explorer/)
  await page.goBack()
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page).not.toHaveURL(/tab=dice/)
})

test('settings show pending changes before saving preferences', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
  await expect(page.getByLabel('Resumen de roles')).toContainText('Admin')
  await expect(page.getByLabel('Permisos de roles')).toContainText('Cambiar roles')
  await expect(page.getByLabel('Permisos de roles')).toContainText('Curar catalogo')
  await expect(page.getByTestId('settings-confidence')).toContainText('Cuenta lista')
  await expect(page.getByTestId('settings-confidence')).toContainText('Admin')
  await expect(page.getByTestId('settings-confidence')).toContainText('Entradas')
  await expect(page.getByRole('heading', { name: 'Datos privados' })).toBeVisible()
  await expect(page.getByLabel('Estado de datos privados')).toContainText('7')
  await expect(page.getByTestId('private-data-health')).toContainText('Salud de datos')
  await expect(page.getByTestId('private-data-health')).toContainText('Taxonomia')
  await expect(page.getByTestId('private-data-health')).toContainText('Catalogo Nexo')
  await expect(page.getByTestId('private-data-health')).toContainText('Dado')
  await expect(page.getByTestId('private-action-plan')).toContainText('Plan de mantenimiento')
  await expect(page.getByTestId('private-action-plan')).toContainText('Tirar dado')
  await expect(page.getByTestId('private-action-plan')).toContainText('Explorar catalogo')
  await expect(page.getByTestId('private-action-plan')).toContainText('Backup JSON')
  await expect(page.getByTestId('taste-suggestions')).toContainText('Sugerencias de gusto')
  await expect(page.getByTestId('taste-suggestions')).toContainText('sci-fi')
  await page.getByLabel('Senales bloqueadas').fill('sci-fi')
  await expect(page.getByTestId('taste-suggestions')).toContainText('pelicula')
  await expect(page.getByTestId('taste-suggestions')).not.toContainText('sci-fi')
  await page.getByLabel('Senales bloqueadas').fill('')
  await expect(page.getByTestId('taste-suggestions')).toContainText('sci-fi')
  await page.getByRole('button', { name: 'Aplicar sugerencias' }).click()
  await expect(page.getByLabel('Generos favoritos')).toHaveValue('sci-fi')
  await expect(page.getByLabel('Tags favoritos')).toHaveValue('pelicula, sci-fi')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ajustes guardados' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()
  await page.getByTestId('private-action-plan').getByRole('button', { name: /Tirar dado/ }).click()
  await expect(page).toHaveURL(/tab=dice/)
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar backup JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^nexo-backup-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(page.getByText('Backup JSON descargado')).toBeVisible()
  await page.getByLabel('Importar backup JSON').setInputFiles({
    name: 'nexo-backup-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-03T00:00:00.000Z',
        items: [
          {
            title: 'Backup Probe',
            type: 'book',
            status: 'wishlist',
            genres: ['Ensayo'],
            tags: ['backup'],
            moodTags: [],
            weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
            source: 'manual',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  })
  await expect(page.getByText('Backup preparado: 1 nueva / 0 actualizadas')).toBeVisible()
  await expect(page.getByLabel('Backup preparado')).toContainText('nexo-backup-import.json')
  await expect(page.getByLabel('Backup preparado')).toContainText('1 entradas revisadas antes de aplicar')
  await expect(page.getByText('Backup Probe')).not.toBeVisible()
  await page.getByRole('button', { name: 'Aplicar backup' }).click()
  await expect(page.getByText('Importadas 1 entradas desde backup')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Backup privado aplicado')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Backup Probe')
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByLabel('Rol de Usuario demo')).toHaveValue('user')
  await page.getByLabel('Rol de Usuario demo').selectOption('admin')
  await expect(page.getByLabel('Cambio de rol preparado')).toContainText('Usuario demo')
  await expect(page.getByLabel('Cambio de rol preparado')).toContainText('Usuario -> Admin')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByText('Cambio de rol cancelado')).toBeVisible()
  await expect(page.getByLabel('Rol de Usuario demo')).toHaveValue('user')
  await page.getByLabel('Rol de Usuario demo').selectOption('moderator')
  await expect(page.getByLabel('Cambio de rol preparado')).toContainText('Usuario -> Moderador')
  await page.getByRole('button', { name: 'Aplicar rol' }).click()
  await expect(page.getByText('Usuario demo ahora es Moderador')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Rol actualizado')
  await expect(page.getByRole('button', { name: 'Deshacer rol' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer rol' }).click()
  await expect(page.getByText('Rol de Usuario demo recuperado como Usuario')).toBeVisible()
  await expect(page.getByLabel('Rol de Usuario demo')).toHaveValue('user')
  await expect(page.getByTestId('session-activity')).toContainText('Rol recuperado')
  await page.getByRole('button', { name: 'Tema Rosa', exact: true }).click()
  await expect(page.getByTestId('settings-confidence')).toContainText('Ajustes pendientes')
  await expect(page.getByTestId('settings-confidence')).toContainText('Rosa')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Ajustes')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByTestId('settings-confidence')).toContainText('Ajustes pendientes')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByTestId('settings-confidence')).toContainText('Oscuro')
  await page.getByRole('button', { name: 'Tema Rosa', exact: true }).click()
  await expect(page.getByTestId('settings-confidence')).toContainText('Ajustes pendientes')
  await expect(page.getByTestId('settings-confidence')).toContainText('Rosa')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ajustes guardados' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Ajustes guardados')
  await expect(page.getByRole('button', { name: 'Deshacer ajustes' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer ajustes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ajustes recuperados' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Ajustes recuperados')
  await expect(page.getByTestId('settings-confidence')).toContainText('Oscuro')
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()
})

test('settings can repair private taxonomy from the maintenance plan', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByLabel('Importar backup JSON').setInputFiles({
    name: 'nexo-taxonomy-repair.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-03T00:00:00.000Z',
        items: [
          {
            title: 'Taxonomy Repair Probe',
            type: 'movie',
            status: 'wishlist',
            genres: [],
            tags: [],
            moodTags: [],
            weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
            source: 'manual',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  })

  await expect(page.getByText('Backup preparado: 1 nueva / 0 actualizadas')).toBeVisible()
  await page.getByRole('button', { name: 'Aplicar backup' }).click()
  await expect(page.getByText('Importadas 1 entradas desde backup')).toBeVisible()
  await expect(page.getByTestId('private-data-health')).toContainText('7/8')
  await expect(page.getByTestId('private-data-health')).toContainText('1 sin generos/tags')
  await expect(page.getByTestId('private-action-plan')).toContainText('Completar taxonomia')

  await page.getByTestId('private-action-plan').getByRole('button', { name: /Completar taxonomia/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Taxonomia privada completada en 1 ficha' })).toBeVisible()
  await expect(page.getByTestId('private-data-health')).toContainText('8/8')
  await expect(page.getByTestId('private-data-health')).toContainText('Dado entiende el tono')
  await expect(page.getByRole('button', { name: 'Deshacer taxonomia' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Taxonomia privada completada')

  await page.getByRole('button', { name: 'Deshacer taxonomia' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Taxonomia privada recuperada en 1 ficha' })).toBeVisible()
  await expect(page.getByTestId('private-data-health')).toContainText('7/8')
})

test('settings can undo a private backup import with settings', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByLabel('Importar backup JSON').setInputFiles({
    name: 'nexo-settings-rollback.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-03T00:00:00.000Z',
        settings: {
          theme: 'light',
          favoriteTags: ['backup'],
          favoriteGenres: [],
          blockedTags: [],
          explorerDefaultType: 'book',
          libraryViewMode: 'list',
        },
        items: [
          {
            title: 'Settings Rollback Probe',
            type: 'book',
            status: 'wishlist',
            genres: ['Ensayo'],
            tags: ['rollback'],
            moodTags: [],
            weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
            source: 'manual',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  })

  await expect(page.getByText('Backup preparado: 1 nueva / 0 actualizadas / ajustes')).toBeVisible()
  await expect(page.getByLabel('Aplicar ajustes del backup')).toBeChecked()
  await page.getByRole('button', { name: 'Aplicar backup' }).click()
  await expect(page.getByText('Importadas 1 entradas y ajustes desde backup')).toBeVisible()
  await expect(page.getByTestId('settings-confidence')).toContainText('Claro')
  await expect(page.getByRole('button', { name: 'Deshacer backup' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer backup' }).click()
  await expect(page.getByText('Backup deshecho: 1 nuevas eliminadas / ajustes recuperados')).toBeVisible()
  await expect(page.getByTestId('settings-confidence')).toContainText('Oscuro')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Settings Rollback Probe')
})

test('library quick import previews a backup before applying it', async ({ page }) => {
  await openApp(page)
  await page.getByLabel('Importar biblioteca desde JSON').setInputFiles({
    name: 'nexo-library-preview.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-03T00:00:00.000Z',
        settings: {
          theme: 'light',
          favoriteTags: ['preview-settings'],
          favoriteGenres: [],
          blockedTags: [],
          explorerDefaultType: 'book',
          libraryViewMode: 'list',
        },
        items: [
          {
            title: 'Preview Probe',
            type: 'movie',
            status: 'wishlist',
            genres: ['Drama'],
            tags: ['preview'],
            moodTags: [],
            weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
            source: 'manual',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  })

  await expect(page.getByText('Backup preparado: 1 nueva / 0 actualizadas / ajustes')).toBeVisible()
  await expect(page.getByLabel('Backup preparado en biblioteca')).toContainText('nexo-library-preview.json')
  await expect(page.getByText('Preview Probe')).not.toBeVisible()
  await expect(page.getByLabel('Aplicar ajustes del backup')).toBeChecked()
  await page.getByLabel('Aplicar ajustes del backup').uncheck()
  await page.getByRole('button', { name: 'Aplicar backup' }).click()
  await expect(page.getByText('Importadas 1 entradas')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByTestId('library-grid')).toContainText('Preview Probe')
  await expect(page.getByRole('button', { name: 'Deshacer backup' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer backup' }).click()
  await expect(page.getByText('Backup deshecho: 1 nuevas eliminadas')).toBeVisible()
  await expect(page.getByTestId('library-grid')).not.toContainText('Preview Probe')
})

test('settings can import backup entries without applying included settings', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByTestId('settings-confidence')).toContainText('Oscuro')
  await page.getByLabel('Importar backup JSON').setInputFiles({
    name: 'nexo-settings-skip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-03T00:00:00.000Z',
        settings: {
          theme: 'light',
          favoriteTags: ['skip-settings'],
          favoriteGenres: [],
          blockedTags: [],
          explorerDefaultType: 'book',
          libraryViewMode: 'list',
        },
        items: [
          {
            title: 'Settings Skip Probe',
            type: 'book',
            status: 'wishlist',
            genres: ['Ensayo'],
            tags: ['skip'],
            moodTags: [],
            weights: { priority: 1, surprise: 0.5, challenge: 0.5 },
            source: 'manual',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  })

  await expect(page.getByText('Backup preparado: 1 nueva / 0 actualizadas / ajustes')).toBeVisible()
  await expect(page.getByLabel('Aplicar ajustes del backup')).toBeChecked()
  await page.getByLabel('Aplicar ajustes del backup').uncheck()
  await page.getByRole('button', { name: 'Aplicar backup' }).click()
  await expect(page.getByText('Importadas 1 entradas desde backup')).toBeVisible()
  await expect(page.getByTestId('settings-confidence')).toContainText('Oscuro')
  await expect(page.getByRole('button', { name: 'Deshacer backup' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer backup' }).click()
  await expect(page.getByText('Backup deshecho: 1 nuevas eliminadas')).toBeVisible()
  await expect(page.getByTestId('settings-confidence')).toContainText('Oscuro')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Settings Skip Probe')
})

test('explorer searches public catalog and saves to private library', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Encuentra la proxima entrada' })).toBeVisible()
  await expect(page.getByLabel('Resumen del explorador')).toContainText('Cola')
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('game')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByLabel('Tipo por defecto')).toHaveValue('game')
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page.getByLabel('Tipo de busqueda en explorador')).toHaveValue('game')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Bandeja activa')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Odisea')
  await expect(page.getByRole('button', { name: /APIs/ })).toBeVisible()
  await page.getByRole('button', { name: /APIs/ }).click()
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('APIs activo')
  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByRole('button', { name: /Nexo/ }).click()
  await expect(page.getByRole('heading', { name: 'Sin resultados Nexo' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver todos los origenes' }).click()
  const odiseaSpotlight = page.getByTestId('candidate-spotlight')
  await expect(odiseaSpotlight).toContainText('Odisea')
  await expect(odiseaSpotlight).toContainText('Que hacer ahora')
  await expect(odiseaSpotlight).toContainText('Resultado externo')
  await expect(odiseaSpotlight).toContainText('Guardar o curar catalogo')
  await expect(odiseaSpotlight.getByLabel('Decidir Odisea')).toContainText('Guardar')
  await odiseaSpotlight.getByRole('button', { name: 'Descartar Odisea' }).click()
  await page.getByRole('tab', { name: /Descartados 1/ }).click()
  await expect(page.getByText('Apartado de tus pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Recuperar Odisea' }).click()
  await expect(page.getByRole('tab', { name: /En cola 1/ })).toBeVisible()
  await page.getByTestId('candidate-spotlight').getByRole('button', { name: 'Abrir ficha Odisea' }).click()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('En cola')
  await page.getByRole('button', { name: 'Guardar en Biblioteca' }).click()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).not.toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Hallazgo guardado')
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer guardado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer guardado' }).click()
  await expect(page.getByText('Odisea recuperado a la cola y eliminado de Biblioteca.')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Guardado deshecho')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Odisea')
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page.getByRole('tab', { name: /En cola 1/ })).toBeVisible()
  await page.getByTestId('candidate-spotlight').getByRole('button', { name: 'Guardar Odisea' }).click()
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await page.getByRole('button', { name: 'Afinar ficha guardada Odisea' }).click()
  const savedEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(savedEditor.getByLabel('Titulo')).toHaveValue('Odisea')
  await savedEditor.getByLabel('Notas').fill('Afinada desde Explorador.')
  await savedEditor.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Odisea afinada en Biblioteca.')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha afinada')
  await page.getByRole('tab', { name: /Guardados 1/ }).click()
  await expect(page.getByText('Ya esta en tu biblioteca')).toBeVisible()
  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('No hay hallazgos nuevos para esa busqueda.')).toBeVisible()
  await expect(page.getByRole('tab', { name: /En cola 0/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Guardados 1/ })).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
  await page.locator('.item-main').filter({ hasText: 'Odisea' }).click()
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(editor).toContainText('Origen')
  await expect(editor).toContainText('API externa')
  await expect(editor).toContainText('Esta ficha vive solo en tu biblioteca privada.')
})

test('explorer can clean a filtered queued view', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await page.getByRole('button', { name: /APIs/ }).click()
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('APIs activo')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Descartar vista')
  await page.getByRole('button', { name: 'Descartar vista' }).click()

  await expect(page.getByText('Odisea descartado de la vista APIs.')).toBeVisible()
  await expect(page.getByTestId('explorer-completion')).toContainText('Bandeja resuelta')
  await expect(page.getByTestId('explorer-completion')).toContainText('APIs limpio')
  await expect(page.getByTestId('explorer-completion')).toContainText('Ver descartes')
  await expect(page.getByRole('button', { name: 'Deshacer descarte' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados APIs' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer descarte' }).click()
  await expect(page.getByText('Odisea recuperado a la cola.')).toBeVisible()
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Odisea')
  await page.getByRole('button', { name: 'Descartar vista' }).click()
  await expect(page.getByText('Odisea descartado de la vista APIs.')).toBeVisible()
  await page.getByRole('button', { name: 'Ver todos los origenes' }).click()
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Nexo')
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Odisea')
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Ficha curada de Nexo')
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Guardar copia privada')
})

test('explorer can save a filtered queued view in bulk and undo it', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await page.getByRole('button', { name: /APIs/ }).click()
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('APIs activo')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Guardar vista')
  await page.getByRole('button', { name: 'Guardar vista' }).click()

  await expect(page.getByText('Odisea guardado desde la vista APIs.')).toBeVisible()
  await expect(page.getByTestId('explorer-completion')).toContainText('Bandeja resuelta')
  await expect(page.getByTestId('explorer-completion')).toContainText('APIs limpio')
  await page.getByTestId('explorer-completion').getByRole('button', { name: 'Ver guardados' }).click()
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer guardado de vista' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Guardados 1/ })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: 'Deshacer guardado de vista' }).click()
  await expect(page.getByText('Odisea recuperado a la cola y eliminado de Biblioteca.')).toBeVisible()
  await expect(page.getByRole('tab', { name: /En cola 2/ })).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Odisea')
})

test('library editor explains private copies from the Nexo catalog', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  const nexoSpotlight = page.getByTestId('candidate-spotlight')
  await expect(nexoSpotlight).toContainText('Nexo')
  await expect(nexoSpotlight).toContainText('Odisea')
  await nexoSpotlight.getByRole('button', { name: 'Guardar Odisea' }).click()

  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
  await page.locator('.item-main').filter({ hasText: 'Odisea' }).click()

  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(editor).toContainText('Catalogo Nexo')
  await expect(editor).toContainText('Tus notas, rating, estado, progreso y pesos del dado no cambian el catalogo publico.')
  await expect(editor).toContainText('Referencias')
})

test('moderator curation can create a public catalog item in demo mode', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Curacion' }).click()
  await expect(page.getByRole('heading', { name: 'Curacion' })).toBeVisible()
  await expect(page.getByTestId('catalog-diagnostics')).toContainText('Diagnostico')
  await expect(page.getByTestId('catalog-diagnostics')).toContainText('Portada')
  await expect(page.getByTestId('catalog-diagnostics')).toContainText('Descripcion')
  await page.getByTestId('catalog-diagnostics').getByRole('button', { name: /Portada/ }).click()
  await expect(page.getByTestId('catalog-diagnostics')).toContainText('Viendo sin portada')
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible()
  await page.getByRole('button', { name: 'Quitar foco' }).click()
  await expect(page.getByTestId('catalog-diagnostics')).not.toContainText('Viendo sin portada')
  await expect(page.getByRole('heading', { name: 'Revision prioritaria' })).toBeVisible()
  await expect(page.getByLabel('Revision prioritaria del catalogo')).toContainText('Sin portada')
  await page.getByRole('button', { name: 'Revisar Arrival' }).click()
  await expect(page.locator('.public-item-editor').getByLabel('Titulo')).toHaveValue('Arrival')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  const templateLauncher = page.getByRole('region', { name: 'Plantillas de curacion' })
  await expect(templateLauncher).toContainText('Empieza con generos predefinidos')
  await page.getByLabel('Medio de plantillas de curacion').selectOption('game')
  await expect(templateLauncher).toContainText('Survival craft')
  await page.getByRole('button', { name: 'Usar plantilla Survival craft para Juegos' }).click()
  const templatedEditor = page.locator('.public-item-editor')
  await expect(templatedEditor.getByLabel('Tipo')).toHaveValue('game')
  await expect(templatedEditor.getByLabel('Generos', { exact: true })).toHaveValue('Supervivencia, Crafting, Accion')
  await expect(templatedEditor.getByLabel('Tags', { exact: true })).toHaveValue('cooperativo, base building, mundo abierto')
  await expect(templatedEditor.getByLabel('Mood tags')).toHaveValue('intenso')
  await templatedEditor.getByLabel('Titulo').fill('Borrador temporal')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByLabel('Cambios sin guardar')).toContainText('Guarda la ficha')
  await page.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(templatedEditor.getByLabel('Titulo')).toHaveValue('Borrador temporal')
  await expect(templatedEditor.getByLabel('Mood tags')).toHaveValue('intenso')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Descartar cambios' }).click()

  const templateDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Plantilla', exact: true }).click()
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
          {
            title: 'Repair Probe',
            type: 'movie',
          },
        ],
      }),
    ),
  })
  await expect(page.getByText('Seed preparado: 2 nuevas / 0 actualizadas')).toBeVisible()
  await expect(page.getByLabel('Seed de catalogo preparado')).toContainText('public-catalog.seed.json')
  await expect(page.getByLabel('Seed de catalogo preparado')).toContainText('2 entradas revisadas antes de tocar el catalogo publico')
  await expect(page.getByRole('heading', { name: 'Moon' })).not.toBeVisible()
  await page.getByRole('button', { name: 'Aplicar lote' }).click()
  await expect(page.getByText('Importadas 2 entradas al catalogo')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Seed aplicado')
  await expect(page.getByRole('heading', { name: 'Moon' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Repair Probe' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Reparar seguras 1/ })).toBeVisible()
  await page.getByRole('button', { name: /Reparar seguras 1/ }).click()
  await expect(page.getByText(/Repair Probe reparado/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer reparacion' })).toBeVisible()
  await expect(page.getByText('Repair Probe combina Accion, Aventura, palomitas, visual')).toBeVisible()
  await expect(page.getByLabel('Revision prioritaria del catalogo')).toContainText('Sin portada')

  await page.getByRole('button', { name: 'Crear Libros' }).click()
  const editor = page.locator('.item-editor')
  await expect(editor.getByLabel('Tipo')).toHaveValue('book')
  await expect(editor.getByRole('group', { name: 'Medio publico de la entrada' })).toContainText('Libros')
  await expect(editor.getByLabel('Recetas rapidas para Libros')).toContainText('Ideas grandes')
  await expect(editor.getByLabel('Generos predefinidos para Libros')).toContainText('Mitologia')
  await editor.getByLabel('Titulo').fill('Solaris')
  await expect(editor.getByLabel('Curacion rapida')).toContainText('Falta Descripcion')
  await expect(editor.getByTestId('catalog-genre-shortcuts')).toContainText('Generos predefinidos')
  await expect(editor.getByTestId('catalog-genre-shortcuts')).toContainText('Mitologia')
  await editor.getByRole('button', { name: 'Completar minimo' }).click()
  await expect(editor.getByLabel('Descripcion')).toHaveValue(/Solaris combina/)
  await expect(editor.getByLabel('Generos', { exact: true })).toHaveValue('Clasico, Aventura, Mitologia')
  await expect(editor.getByLabel('Tags', { exact: true })).toHaveValue('clasico, epico, literatura')
  await expect(editor.getByLabel('Mood tags')).toHaveValue('denso')
  await expect(editor.getByLabel('Curacion rapida')).toContainText('3/4 listo')
  await editor.getByRole('button', { name: 'Guardar y crear otra' }).click()

  await expect(page.getByText('Solaris guardado en catalogo')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Catalogo actualizado')
  await expect(editor.getByLabel('Titulo')).toHaveValue('')
  await editor.getByLabel('Titulo').fill('Dune')
  await editor.getByLabel('Descripcion').fill('Politica, desierto y destino.')
  await editor.getByLabel('Generos predefinidos principales para Libros').getByRole('button', { name: 'Ciencia ficcion' }).click()
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
  await expect(page.getByTestId('session-activity')).toContainText('Entrada archivada')
  await expect(page.getByRole('button', { name: 'Deshacer archivado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer archivado' }).click()
  await expect(page.getByText('Solaris recuperado en catalogo')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Entrada recuperada')
  await expect(page.getByRole('button', { name: 'Editar Solaris' })).toBeVisible()
  await page.getByRole('button', { name: 'Archivar Solaris' }).click()
  await expect(page.getByRole('heading', { name: 'Archivar entrada publica' })).toBeVisible()
  await page.getByRole('button', { name: 'Archivar entrada' }).click()
  await expect(page.getByRole('button', { name: 'Editar Solaris' })).not.toBeVisible()
})

test('moderator can undo a public catalog seed import', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Curacion' }).click()

  await page.getByLabel('Importar lote de catalogo JSON').setInputFiles({
    name: 'public-catalog-rollback.seed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        items: [
          {
            title: 'Arrival',
            type: 'movie',
            description: 'Descripcion temporal para validar rollback de una ficha existente.',
            releaseYear: 2016,
            genres: ['Ciencia ficcion'],
            tags: ['rollback'],
            moodTags: ['temporal'],
          },
          {
            title: 'Rollback Moon',
            type: 'movie',
            description: 'Entrada temporal para comprobar rollback de seeds.',
            releaseYear: 2009,
            genres: ['Ciencia ficcion', 'Drama'],
            tags: ['rollback'],
            moodTags: ['melancolico'],
          },
        ],
      }),
    ),
  })

  await expect(page.getByText('Seed preparado: 1 nueva / 1 actualizada')).toBeVisible()
  await page.getByRole('button', { name: 'Aplicar lote' }).click()
  await expect(page.getByText('Importadas 2 entradas al catalogo')).toBeVisible()
  await expect(page.getByText('Descripcion temporal para validar rollback de una ficha existente.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rollback Moon' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer lote' })).toBeVisible()

  await page.getByRole('button', { name: 'Deshacer lote' }).click()
  await expect(page.getByText('Seed deshecho: 1 nueva archivada / 1 restaurada')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Seed deshecho')
  await expect(page.getByRole('heading', { name: 'Rollback Moon' })).not.toBeVisible()
  await expect(page.getByText('Ciencia ficcion contemplativa sobre lenguaje, duelo y tiempo.')).toBeVisible()
})

test('moderator can turn an explorer candidate into a public catalog item', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
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
  await openApp(page)
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await page.getByRole('button', { name: 'Mas acciones Mass Effect Legendary Edition' }).click()
  await page.getByRole('menuitem', { name: 'Borrar Mass Effect Legendary Edition' }).click()
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).toContainText('Mass Effect Legendary Edition')
  await page.getByRole('button', { name: 'Borrar entrada' }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Mass Effect Legendary Edition')
  await expect(page.getByRole('button', { name: 'Deshacer borrado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer borrado' }).click()
  await expect(page.getByText('Mass Effect Legendary Edition recuperado en Biblioteca')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Mass Effect Legendary Edition')

  await page.getByRole('button', { name: 'Borrar todo' }).click()
  await expect(page.getByRole('heading', { name: 'Borrar toda la biblioteca' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Borrar todo' }).last()).toBeDisabled()

  await page.getByLabel('Confirmacion').fill('BORRAR')
  await page.getByRole('button', { name: 'Borrar todo' }).last().click()

  await expect(page.getByText('Tu biblioteca ha sido borrada')).toBeVisible()
  await expect(page.getByText('Outer Wilds')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer borrado total' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer borrado total' }).click()
  await expect(page.getByText(/\d+ entradas recuperadas en Biblioteca/)).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
})

test('library cards stay legible at 1920x1080', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop geometry check')

  await page.setViewportSize({ width: 1920, height: 1080 })
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toBeVisible()

  const metrics = await page.getByTestId('library-grid').evaluate((grid) => {
    const cards = Array.from(grid.querySelectorAll('.item-card')).slice(0, 6)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      cards: cards.map((card) => {
        const cardElement = card as HTMLElement
        const mainElement = cardElement.querySelector('.item-main') as HTMLElement | null
        const actionsElement = cardElement.querySelector('.card-actions') as HTMLElement | null
        const coverElement = cardElement.querySelector('.cover-art') as HTMLElement | null
        const cardRect = cardElement.getBoundingClientRect()
        const mainRect = mainElement?.getBoundingClientRect()
        const actionsRect = actionsElement?.getBoundingClientRect()
        const coverRect = coverElement?.getBoundingClientRect()

        return {
          actionsHeight: actionsRect?.height ?? 0,
          actionsTop: actionsRect?.top ?? 0,
          coverHeight: coverRect?.height ?? 0,
          coverWidth: coverRect?.width ?? 0,
          mainBottom: mainRect?.bottom ?? 0,
          top: cardRect.top,
          width: cardRect.width,
        }
      }),
    }
  })
  const firstRowTop = metrics.cards[0]?.top ?? 0
  const firstRowCards = metrics.cards.filter((card) => Math.abs(card.top - firstRowTop) < 4)

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.cards.length).toBeGreaterThanOrEqual(4)
  expect(firstRowCards.length).toBeLessThanOrEqual(4)
  for (const card of firstRowCards) {
    expect(card.width).toBeGreaterThanOrEqual(335)
    expect(card.coverWidth).toBeGreaterThanOrEqual(100)
    expect(card.coverHeight).toBeLessThanOrEqual(180)
    expect(card.actionsHeight).toBeGreaterThanOrEqual(40)
    expect(card.mainBottom).toBeLessThanOrEqual(card.actionsTop + 1)
  }
})

test('library cards fit the mobile PWA viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile geometry check')

  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Biblioteca privada' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toBeVisible()

  const metrics = await page.getByTestId('library-grid').evaluate((grid) => {
    const gridRect = grid.getBoundingClientRect()
    const cards = Array.from(grid.querySelectorAll('.item-card')).slice(0, 3)
    return {
      gridWidth: gridRect.width,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      cards: cards.map((card) => {
        const cardElement = card as HTMLElement
        const actionsElement = cardElement.querySelector('.card-actions') as HTMLElement | null
        const primaryAction = cardElement.querySelector('.card-primary-action') as HTMLElement | null
        const cardRect = cardElement.getBoundingClientRect()
        const actionsRect = actionsElement?.getBoundingClientRect()
        const primaryRect = primaryAction?.getBoundingClientRect()

        return {
          actionsHeight: actionsRect?.height ?? 0,
          left: cardRect.left,
          primaryHeight: primaryRect?.height ?? 0,
          right: cardRect.right,
          width: cardRect.width,
        }
      }),
    }
  })

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  for (const card of metrics.cards) {
    expect(card.left).toBeGreaterThanOrEqual(0)
    expect(card.right).toBeLessThanOrEqual(metrics.viewportWidth + 1)
    expect(card.width).toBeGreaterThanOrEqual(metrics.gridWidth - 4)
    expect(card.actionsHeight).toBeGreaterThanOrEqual(44)
    expect(card.primaryHeight).toBeGreaterThanOrEqual(44)
  }

  await page.locator('.item-main').filter({ hasText: 'Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Entrada' })).toBeVisible()
  const dialogMetrics = await page.getByRole('dialog', { name: 'Entrada' }).evaluate((dialog) => {
    const backdrop = dialog.closest('.modal-backdrop') as HTMLElement | null
    const rect = dialog.getBoundingClientRect()
    const backdropStyle = backdrop ? window.getComputedStyle(backdrop) : undefined
    const dialogStyle = window.getComputedStyle(dialog)
    return {
      bottom: rect.bottom,
      documentScrollWidth: document.documentElement.scrollWidth,
      maxHeight: dialogStyle.maxHeight,
      paddingBottom: backdropStyle ? Number.parseFloat(backdropStyle.paddingBottom) : 0,
      paddingLeft: backdropStyle ? Number.parseFloat(backdropStyle.paddingLeft) : 0,
      paddingRight: backdropStyle ? Number.parseFloat(backdropStyle.paddingRight) : 0,
      paddingTop: backdropStyle ? Number.parseFloat(backdropStyle.paddingTop) : 0,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: document.documentElement.clientHeight,
      viewportWidth: document.documentElement.clientWidth,
      width: rect.width,
    }
  })
  const geometryTolerance = 2
  expect(dialogMetrics.documentScrollWidth).toBeLessThanOrEqual(dialogMetrics.viewportWidth + 1)
  expect(dialogMetrics.width).toBeLessThanOrEqual(dialogMetrics.viewportWidth)
  expect(dialogMetrics.paddingTop).toBeGreaterThanOrEqual(18)
  expect(dialogMetrics.paddingRight).toBeGreaterThanOrEqual(18)
  expect(dialogMetrics.paddingBottom).toBeGreaterThanOrEqual(18)
  expect(dialogMetrics.paddingLeft).toBeGreaterThanOrEqual(18)
  expect(dialogMetrics.maxHeight).not.toBe('none')
  expect(dialogMetrics.top).toBeGreaterThanOrEqual(dialogMetrics.paddingTop - geometryTolerance)
  expect(dialogMetrics.left).toBeGreaterThanOrEqual(dialogMetrics.paddingLeft - geometryTolerance)
  expect(dialogMetrics.right).toBeLessThanOrEqual(dialogMetrics.viewportWidth - dialogMetrics.paddingRight + geometryTolerance)
  expect(dialogMetrics.bottom).toBeLessThanOrEqual(dialogMetrics.viewportHeight - dialogMetrics.paddingBottom + geometryTolerance)
})

test('settings layout keeps the status area compact', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1920, height: 1080 })
  } else {
    await page.setViewportSize({ width: 390, height: 844 })
  }

  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByTestId('settings-confidence')).toBeVisible()

  const metrics = await page.locator('.settings-panel').evaluate((panel) => {
    const heading = panel.querySelector('.panel-heading') as HTMLElement | null
    const status = panel.querySelector('.settings-status') as HTMLElement | null
    const confidence = panel.querySelector('.settings-confidence-panel') as HTMLElement | null
    const headingRect = heading?.getBoundingClientRect()
    const statusRect = status?.getBoundingClientRect()
    const confidenceRect = confidence?.getBoundingClientRect()

    return {
      headingStatusGap: headingRect && statusRect ? statusRect.top - headingRect.bottom : 0,
      scrollWidth: document.documentElement.scrollWidth,
      statusConfidenceGap: statusRect && confidenceRect ? confidenceRect.top - statusRect.bottom : 0,
      statusHeight: statusRect?.height ?? 0,
      viewportWidth: document.documentElement.clientWidth,
    }
  })

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.headingStatusGap).toBeLessThanOrEqual(48)
  expect(metrics.statusHeight).toBeLessThanOrEqual(66)
  expect(metrics.statusConfidenceGap).toBeLessThanOrEqual(24)
})

test('core tabs have no serious accessibility violations', async ({ page }) => {
  await openApp(page)
  const coreTabs = ['Biblioteca', 'Dado', 'Explorador', 'Ajustes', 'Curacion']

  for (const tab of coreTabs) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))

    expect(seriousViolations, `${tab} has serious accessibility violations`).toEqual([])
  }
})

test('editors have no serious accessibility violations', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Anadir' }).first().click()
  await expectDialogAnimationsSettled(page.getByRole('dialog', { name: 'Entrada' }))
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  let seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
  expect(seriousViolations, 'private editor has serious accessibility violations').toEqual([])
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await page.getByRole('button', { name: 'Curacion' }).click()
  await page.getByRole('button', { name: 'Crear Libros' }).click()
  await expectDialogAnimationsSettled(page.locator('.public-item-editor'))
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
  expect(seriousViolations, 'public editor has serious accessibility violations').toEqual([])
})
