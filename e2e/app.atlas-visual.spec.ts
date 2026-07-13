import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

const atlasPoster = readFileSync(new URL('./fixtures/atlas-poster.svg', import.meta.url))
const externalPosterPattern = /^https:\/\/(?:shared\.cloudflare\.steamstatic\.com|image\.tmdb\.org|covers\.openlibrary\.org|s4\.anilist\.co)\//

const themes = ['dark', 'light', 'rose', 'forest', 'ocean', 'mint', 'aurora'] as const
type AtlasTheme = (typeof themes)[number]

const themeExpectations: Record<'dark' | 'light', { colorScheme: 'dark' | 'light'; surface: string }> = {
  dark: { colorScheme: 'dark', surface: '#0b0f11' },
  light: { colorScheme: 'light', surface: '#f8faf9' },
}

const responsiveMatrix = [
  { height: 568, kind: 'mobile', width: 320 },
  { height: 844, kind: 'mobile', width: 390 },
  { height: 1024, kind: 'tablet', width: 768 },
  { height: 768, kind: 'tablet', width: 1024 },
  { height: 900, kind: 'desktop', width: 1440 },
  { height: 1080, kind: 'desktop', width: 1920 },
] as const

test.describe('Atlas visual determinista', () => {
  test.beforeEach(async ({ page }) => installDeterministicRoutes(page))

  test('mantiene una jerarquia compacta de Inicio y del shell en oscuro y claro', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile'
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }

    await page.setViewportSize(viewport)
    await page.goto('/?tab=home')

    for (const theme of ['dark', 'light'] as const) {
      await renderAtlasTheme(page, theme)
      await expectAtlasMilestones(page, theme, viewport, mobile ? 'mobile' : 'desktop')
      await attachAtlasScreenshot(page, testInfo, theme, mobile)
    }
  })

  test('no desborda y conserva acciones criticas en toda la matriz responsive', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'La matriz completa se ejecuta una vez en Chromium')
    test.setTimeout(120_000)

    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    for (const viewport of responsiveMatrix) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.goto('/?tab=home')
      await expectHomeReady(page)

      const metrics = await readChromeMetrics(page)
      expect(metrics.scrollWidth, `${viewport.width}px genera overflow horizontal`).toBeLessThanOrEqual(viewport.width)
      expect(metrics.topbar.height).toBeCloseTo(56, 0)
      expect(metrics.summary.height).toBeLessThanOrEqual(72)
      expect(metrics.functionalFont).not.toContain('Instrument Serif')
      expect(metrics.functionalFont).toMatch(/Inter|ui-sans-serif|system-ui|Segoe UI|sans-serif/i)

      if (viewport.kind === 'desktop') {
        expect(metrics.navigation.position).toBe('fixed')
        expect(metrics.navigation.left).toBeCloseTo(0, 0)
        expect(metrics.navigation.top).toBeCloseTo(0, 0)
        expect(metrics.navigation.width).toBeCloseTo(96, 0)
        expect(metrics.topbar.left).toBeCloseTo(metrics.navigation.right, 0)
        expect(metrics.stage.left).toBeGreaterThanOrEqual(metrics.navigation.right - 1)
        expect(metrics.brandFont).toContain('Instrument Serif')
      } else if (viewport.kind === 'tablet') {
        expect(metrics.navigation.position).toBe('sticky')
        expect(metrics.navigation.left).toBeCloseTo(0, 0)
        expect(metrics.navigation.width).toBeCloseTo(viewport.width, 0)
        expect(metrics.navigation.top).toBeCloseTo(56, 0)
        expect(metrics.stage.top).toBeGreaterThanOrEqual(metrics.navigation.bottom - 1)
      } else {
        expect(metrics.navigation.position).toBe('fixed')
        expect(metrics.navigation.left).toBeCloseTo(0, 0)
        expect(metrics.navigation.width).toBeCloseTo(viewport.width, 0)
        expect(metrics.navigation.bottom).toBeCloseTo(viewport.height, 0)
        expect(metrics.topbar.left).toBeCloseTo(0, 0)
        expect(metrics.topbar.width).toBeCloseTo(viewport.width, 0)
      }

      await expectCriticalActions(page)
      await expectLaneFlow(page, viewport.kind)
      await expectMoreMenuKeyboardContract(page, viewport.width)
    }
  })

  test('respeta contraste AA, foco visible y movimiento reducido en los siete temas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'La auditoria de temas se ejecuta una vez en Chromium')
    test.setTimeout(120_000)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.goto('/?tab=home')

    for (const theme of themes) {
      await renderAtlasTheme(page, theme)

      const feature = page.locator('.journey-feature-card').first()
      const primaryAction = feature.getByRole('button', { name: 'Actualizar progreso' })
      await primaryAction.focus()
      await expect(primaryAction).toBeFocused()

      const motionAndFocus = await page.evaluate(() => {
        const featureElement = document.querySelector<HTMLElement>('.journey-feature-card')
        const focused = document.activeElement as HTMLElement | null
        if (!featureElement || !focused) throw new Error('Inicio no esta listo para la auditoria visual')
        const featureStyle = getComputedStyle(featureElement)
        const focusStyle = getComputedStyle(focused)
        return {
          animationDuration: featureStyle.animationDuration,
          outlineStyle: focusStyle.outlineStyle,
          outlineWidth: focusStyle.outlineWidth,
          transitionDuration: focusStyle.transitionDuration,
        }
      })

      expect(Number.parseFloat(motionAndFocus.animationDuration)).toBeLessThanOrEqual(0.01)
      expect(Number.parseFloat(motionAndFocus.transitionDuration)).toBeLessThanOrEqual(0.01)
      expect(motionAndFocus.outlineStyle).not.toBe('none')
      expect(Number.parseFloat(motionAndFocus.outlineWidth)).toBeGreaterThanOrEqual(2)

      const audit = await new AxeBuilder({ page })
        .include('.topbar')
        .include('.tabbar')
        .include('.home-surface')
        .withRules(['color-contrast'])
        .analyze()
      expect(audit.violations, `Contraste insuficiente en el tema ${theme}`).toEqual([])
    }
  })
})

async function installDeterministicRoutes(page: Page) {
  await page.route(externalPosterPattern, async (route) => {
    await route.fulfill({
      body: atlasPoster,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      status: 200,
    })
  })
  await page.route('**/catalog-proxy/search**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { results: [] } })
  })
  await page.route('**/catalog-proxy/discover**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { result: null } })
  })
}

async function expectHomeReady(page: Page) {
  await expect(page.getByRole('region', { name: 'Tu ruta de obras' })).toBeVisible()
  await expect(page.locator('.journey-feature-card').first()).toContainText('Inception')
  await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page')
}

async function readChromeMetrics(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const navigation = document.querySelector<HTMLElement>('.tabbar')
    const stage = document.querySelector<HTMLElement>('.tab-stage')
    const summary = document.querySelector<HTMLElement>('.home-route-summary')
    const topbar = document.querySelector<HTMLElement>('.topbar')
    const functionalTitle = document.querySelector<HTMLElement>('.journey-feature-copy > strong')
    const brand = document.querySelector<HTMLElement>('.tabbar-brand strong')
    if (!shell || !navigation || !stage || !summary || !topbar || !functionalTitle || !brand) {
      throw new Error('Chrome o Inicio incompleto')
    }
    const toBounds = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      }
    }
    return {
      brandFont: getComputedStyle(brand).fontFamily,
      functionalFont: getComputedStyle(functionalTitle).fontFamily,
      navigation: { ...toBounds(navigation), position: getComputedStyle(navigation).position },
      scrollWidth: document.documentElement.scrollWidth,
      shell: toBounds(shell),
      stage: toBounds(stage),
      summary: toBounds(summary),
      topbar: toBounds(topbar),
    }
  })
}

async function renderAtlasTheme(page: Page, theme: AtlasTheme) {
  const colorScheme = theme === 'dark' || theme === 'forest' || theme === 'ocean' || theme === 'aurora'
    ? 'dark'
    : 'light'
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.evaluate((nextTheme) => window.localStorage.setItem('nexo-theme', nextTheme), theme)
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expectHomeReady(page)
  const heroPoster = page.locator('.journey-feature-card .cover-art img').first()
  await expect(heroPoster).toBeVisible()
  await expect.poll(() => heroPoster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(600)
  await page.evaluate(async () => document.fonts.ready)
}

async function expectAtlasMilestones(
  page: Page,
  theme: 'dark' | 'light',
  viewport: { width: number; height: number },
  formFactor: 'mobile' | 'desktop',
) {
  const shell = page.locator('.app-shell')
  const topbar = page.locator('.topbar')
  const navigation = page.getByRole('navigation', { name: 'Secciones de Nexo' })
  const journey = page.getByRole('region', { name: 'Tu ruta de obras' })
  const nowLane = page.locator('.atlas-now')
  const nextLane = page.locator('.atlas-next')
  const laterLane = page.locator('.atlas-later')

  await expect(shell).toBeVisible()
  await expect(topbar).toBeVisible()
  await expect(navigation).toBeVisible()
  await expect(journey).toBeVisible()
  await expect(nowLane).toBeVisible()
  await expect(nextLane).toBeVisible()
  await expect(laterLane).toBeAttached()
  await expect(page.locator('.home-atlas-title')).toHaveCount(0)
  await expectCriticalActions(page)

  const [shellBox, topbarBox, navigationBox, nowBox, nextBox, laterBox] = await Promise.all([
    requiredBox(shell),
    requiredBox(topbar),
    requiredBox(navigation),
    requiredBox(nowLane),
    requiredBox(nextLane),
    requiredBox(laterLane),
  ])
  const styles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const title = document.querySelector<HTMLElement>('.journey-feature-copy > strong')
    const brand = document.querySelector<HTMLElement>('.tabbar-brand strong')
    return {
      brandFont: brand ? getComputedStyle(brand).fontFamily : '',
      colorScheme: root.colorScheme,
      functionalFont: title ? getComputedStyle(title).fontFamily : '',
      motionReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollWidth: document.documentElement.scrollWidth,
      surface: root.getPropertyValue('--surface').trim(),
    }
  })

  expect(styles.surface).toBe(themeExpectations[theme].surface)
  expect(styles.colorScheme).toBe(themeExpectations[theme].colorScheme)
  expect(styles.motionReduced).toBe(true)
  expect(styles.functionalFont).not.toContain('Instrument Serif')
  expect(styles.brandFont).toContain('Instrument Serif')
  expect(styles.scrollWidth).toBeLessThanOrEqual(viewport.width)
  expect(shellBox.width).toBeCloseTo(viewport.width, 0)
  expect(topbarBox.y).toBeCloseTo(0, 0)
  expect(topbarBox.height).toBeCloseTo(56, 0)

  if (formFactor === 'mobile') {
    expect(topbarBox.x).toBeCloseTo(0, 0)
    expect(topbarBox.width).toBeCloseTo(viewport.width, 0)
    expect(navigationBox.x).toBeCloseTo(0, 0)
    expect(navigationBox.width).toBeCloseTo(viewport.width, 0)
    expect(navigationBox.y + navigationBox.height).toBeCloseTo(viewport.height, 0)
    expect(nextBox.y).toBeGreaterThan(nowBox.y + nowBox.height)
    expect(laterBox.y).toBeGreaterThan(nextBox.y + nextBox.height)
  } else {
    expect(navigationBox.x).toBeCloseTo(0, 0)
    expect(navigationBox.y).toBeCloseTo(0, 0)
    expect(navigationBox.width).toBeCloseTo(96, 0)
    expect(navigationBox.height).toBeGreaterThanOrEqual(viewport.height)
    expect(topbarBox.x).toBeCloseTo(navigationBox.width, 0)
    expect(topbarBox.width).toBeCloseTo(viewport.width - navigationBox.width, 0)
    expect(Math.abs(nowBox.y - nextBox.y)).toBeLessThanOrEqual(1)
    expect(nextBox.x).toBeGreaterThan(nowBox.x + nowBox.width)
    expect(laterBox.y).toBeGreaterThan(Math.max(nowBox.y + nowBox.height, nextBox.y + nextBox.height))
  }
}

async function expectCriticalActions(page: Page) {
  const actions = [
    { locator: page.getByRole('button', { name: 'Elegir con Dado' }), minHeight: 40 },
    {
      locator: page.locator('.journey-feature-actions').getByRole('button', { name: 'Actualizar progreso' }),
      minHeight: 44,
    },
    { locator: page.locator('.atlas-next').getByRole('button', { name: 'Empezar ahora' }).first(), minHeight: 44 },
    { locator: page.locator('.atlas-later').getByRole('button', { name: /Poner/ }).first(), minHeight: 44 },
  ]

  for (const { locator: action, minHeight } of actions) {
    await expect(action).toBeVisible()
    const box = await requiredBox(action)
    const label = await action.getAttribute('aria-label') ?? await action.innerText()
    expect.soft(box.width, `${label}: ancho tactil insuficiente`).toBeGreaterThanOrEqual(40)
    expect.soft(box.height, `${label}: alto tactil insuficiente`).toBeGreaterThanOrEqual(minHeight)
  }
}

async function expectLaneFlow(page: Page, formFactor: 'mobile' | 'tablet' | 'desktop') {
  const [nowBox, nextBox, laterBox] = await Promise.all([
    requiredBox(page.locator('.atlas-now')),
    requiredBox(page.locator('.atlas-next')),
    requiredBox(page.locator('.atlas-later')),
  ])

  if (formFactor === 'desktop') {
    expect(Math.abs(nowBox.y - nextBox.y)).toBeLessThanOrEqual(1)
    expect(nextBox.x).toBeGreaterThan(nowBox.x + nowBox.width)
  } else {
    expect(nextBox.y).toBeGreaterThan(nowBox.y + nowBox.height)
  }
  expect(laterBox.y).toBeGreaterThan(Math.max(nowBox.y + nowBox.height, nextBox.y + nextBox.height))
}

async function expectMoreMenuKeyboardContract(page: Page, viewportWidth: number) {
  const more = page.locator('details.tabbar-more')
  const summary = more.locator('summary')
  await summary.click()
  await summary.press('ArrowDown')
  const menuItems = more.getByRole('menuitem')
  await expect(menuItems.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menuItems.nth(1)).toBeFocused()

  const menuBox = await requiredBox(page.locator('.tabbar-more-menu'))
  expect(menuBox.x).toBeGreaterThanOrEqual(0)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewportWidth)
  await page.keyboard.press('Escape')
  await expect(more).not.toHaveAttribute('open', '')
  await expect(summary).toBeFocused()
}

async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box as NonNullable<typeof box>
}

async function attachAtlasScreenshot(page: Page, testInfo: TestInfo, theme: 'dark' | 'light', mobile: boolean) {
  const formFactor = mobile ? 'mobile-390x844' : 'desktop-1440x900'
  const name = `atlas-${formFactor}-${theme}`
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: false, path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}
