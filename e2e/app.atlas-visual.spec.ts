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

      await prepareReviewFixture(page)
      await expect(page.getByRole('heading', { name: 'Hallazgos por revisar' })).toBeVisible()
      await expect(page.locator('article.review-card').first()).toBeVisible()
      await attachAtlasSurfaceScreenshot(page, testInfo, theme, mobile, 'review')

      await page.goto('/?tab=library')
      await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
      const libraryGrid = page.getByTestId('library-grid')
      await expect(libraryGrid).toBeVisible()
      await expect(libraryGrid.getByRole('listitem').first()).toBeVisible()
      await attachAtlasSurfaceScreenshot(page, testInfo, theme, mobile, 'library')
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
      await ensurePosterInLaterShelf(page)
      await page.evaluate(async () => document.fonts.ready)

      const metrics = await readChromeMetrics(page)
      expect(metrics.scrollWidth, `${viewport.width}px genera overflow horizontal`).toBeLessThanOrEqual(viewport.width)
      expect(metrics.topbar.height).toBeCloseTo(56, 0)
      expect(metrics.summary.height).toBeLessThanOrEqual(72)
      expect(metrics.functionalFont).toContain('Inter Variable')
      expect(metrics.brandFont).toContain('Inter Variable')
      expect(metrics.interLoaded).toBe(true)
      expect(metrics.externalFontRequests).toEqual([])
      expect(metrics.laterColumnCount).toBe(viewport.kind === 'desktop' ? 5 : viewport.kind === 'tablet' ? 3 : 1)
      expect(metrics.laterCover.objectFit).toBe('contain')
      expect(metrics.laterCover.ratio).toBeCloseTo(2 / 3, 1)

      if (viewport.kind === 'desktop') {
        expect(metrics.navigation.position).toBe('fixed')
        expect(metrics.navigation.left).toBeCloseTo(0, 0)
        expect(metrics.navigation.top).toBeCloseTo(0, 0)
        expect(metrics.navigation.width).toBeCloseTo(96, 0)
        expect(metrics.topbar.left).toBeCloseTo(metrics.navigation.right, 0)
        expect(metrics.stage.left).toBeGreaterThanOrEqual(metrics.navigation.right - 1)
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
        if (viewport.width === 390) await expectMobileSafeAreaLayout(page, 47)
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
  await page.addInitScript(() => {
    Math.random = () => 0.125
  })
  await page.route(externalPosterPattern, async (route) => {
    await route.fulfill({
      body: atlasPoster,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      status: 200,
    })
  })
  await page.route(/\/catalog-proxy\/(?:v1\/catalog\/)?search(?:\?|$)/, async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { results: [] } })
  })
  await page.route('**/public-catalog**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { items: [] } })
  })
  await page.route(/\/catalog-proxy\/(?:v1\/catalog\/)?discover(?:\?|$)/, async (route) => {
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
    const laterList = document.querySelector<HTMLElement>('.atlas-timeline')
    const laterPoster = document.querySelector<HTMLImageElement>('.atlas-timeline-card .cover-art img')
    if (!shell || !navigation || !stage || !summary || !topbar || !functionalTitle || !brand || !laterList || !laterPoster) {
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
    const laterPosterBounds = laterPoster.getBoundingClientRect()
    const laterPosterStyle = getComputedStyle(laterPoster)
    return {
      brandFont: getComputedStyle(brand).fontFamily,
      externalFontRequests: performance
        .getEntriesByType('resource')
        .filter((entry) => (entry as PerformanceResourceTiming).initiatorType === 'font')
        .map((entry) => new URL(entry.name).origin)
        .filter((origin) => origin !== window.location.origin),
      functionalFont: getComputedStyle(functionalTitle).fontFamily,
      interLoaded: document.fonts.check('16px "Inter Variable"'),
      laterColumnCount: getComputedStyle(laterList).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      laterCover: {
        objectFit: laterPosterStyle.objectFit,
        ratio: laterPosterBounds.width / laterPosterBounds.height,
      },
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
  await page.goto('/?tab=home', { waitUntil: 'domcontentloaded' })

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
  expect(styles.functionalFont).toContain('Inter Variable')
  expect(styles.brandFont).toContain('Inter Variable')
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

async function ensurePosterInLaterShelf(page: Page) {
  const outerWilds = page.locator('.atlas-next article.roadmap-card').filter({ hasText: 'Outer Wilds' })
  if (await outerWilds.count()) {
    await outerWilds.getByLabel('Organizar Outer Wilds').click()
    await outerWilds.getByRole('button', { name: /Mover a M/ }).click()
  }
  const laterPoster = page.locator('.atlas-timeline-card .cover-art img').first()
  await expect(laterPoster).toBeVisible()
  await expect.poll(() => laterPoster.evaluate((image) => {
    const poster = image as HTMLImageElement
    return poster.complete && poster.naturalWidth > 0
  })).toBe(true)
  await page.evaluate(() => window.scrollTo({ left: 0, top: 0 }))
}

async function prepareReviewFixture(page: Page) {
  await page.goto('/?tab=discover&mode=queue')
  if (await page.locator('article.review-card').count()) return

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const palette = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await palette.getByLabel('Buscar en Nexo').fill('Recomendar desde mi estanteria')
  await palette.getByRole('button', { name: /^Ejecutar Recomendar desde mi estanteria$/ }).click()
  await expect(page).toHaveURL(/mode=queue/)
  await expect(page.locator('article.review-card').first()).toBeVisible()
  const toastClose = page.getByRole('button', { name: 'Cerrar notificacion' })
  if (await toastClose.count()) await toastClose.click()
}

async function expectCriticalActions(page: Page) {
  const actions = [
    { locator: page.getByRole('button', { name: 'Elegir con Dado' }), minHeight: 44 },
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

async function expectMobileSafeAreaLayout(page: Page, safeAreaTop: number) {
  const session = await page.context().newCDPSession(page)
  const createInsets = (top: number) => ({
    bottom: 0,
    bottomMax: 0,
    left: 0,
    leftMax: 0,
    right: 0,
    rightMax: 0,
    top,
    topMax: top,
  })
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: createInsets(safeAreaTop) })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  const metrics = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.tab-stage')
    const topbar = document.querySelector<HTMLElement>('.topbar')
    if (!stage || !topbar) throw new Error('Chrome movil incompleto')
    const topbarBounds = topbar.getBoundingClientRect()
    const stageBounds = stage.getBoundingClientRect()
    const controls = [...topbar.querySelectorAll<HTMLElement>('button, [role="button"]')].map((control) => {
      const bounds = control.getBoundingClientRect()
      return { bottom: bounds.bottom, height: bounds.height, top: bounds.top }
    })
    return {
      controls,
      stageTop: stageBounds.top,
      topbarBottom: topbarBounds.bottom,
      topbarHeight: topbarBounds.height,
    }
  })

  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: createInsets(0) })
  await session.detach()

  expect(metrics.topbarHeight).toBeCloseTo(56 + safeAreaTop, 0)
  expect(metrics.stageTop).toBeGreaterThanOrEqual(metrics.topbarBottom - 1)
  for (const control of metrics.controls) {
    expect(control.height).toBeGreaterThanOrEqual(30)
    expect(control.top).toBeGreaterThanOrEqual(safeAreaTop)
    expect(control.bottom).toBeLessThanOrEqual(metrics.topbarBottom + 1)
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

async function attachAtlasSurfaceScreenshot(
  page: Page,
  testInfo: TestInfo,
  theme: 'dark' | 'light',
  mobile: boolean,
  surface: 'library' | 'review',
) {
  const formFactor = mobile ? 'mobile-390x844' : 'desktop-1440x900'
  const name = `atlas-${surface}-${formFactor}-${theme}`
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: false, path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}
