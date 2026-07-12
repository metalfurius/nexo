import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

const atlasPoster = readFileSync(new URL('./fixtures/atlas-poster.svg', import.meta.url))
const externalPosterPattern = /^https:\/\/(?:shared\.cloudflare\.steamstatic\.com|image\.tmdb\.org|covers\.openlibrary\.org|s4\.anilist\.co)\//

type AtlasTheme = 'dark' | 'light'

const themeExpectations: Record<AtlasTheme, { colorScheme: AtlasTheme; surface: string }> = {
  dark: { colorScheme: 'dark', surface: '#0b0f11' },
  light: { colorScheme: 'light', surface: '#f8faf9' },
}

test.describe('Atlas visual determinista', () => {
  test('conserva la jerarquia de Inicio y del shell en oscuro y claro', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile'
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
    let interceptedPosterCount = 0

    await page.setViewportSize(viewport)
    await page.route(externalPosterPattern, async (route) => {
      interceptedPosterCount += 1
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

    await page.goto('/?tab=home')

    for (const theme of ['dark', 'light'] as const) {
      await renderAtlasTheme(page, theme)
      await expectAtlasMilestones(page, theme, viewport, mobile)
      await attachAtlasScreenshot(page, testInfo, theme, mobile)
    }

    expect(interceptedPosterCount).toBeGreaterThan(0)
  })

  test('mantiene el chrome fuera del contenido a 320, 768, 1280 bajo y en reflow equivalente a zoom 200%', async ({ page }) => {
    test.setTimeout(90_000)
    const viewports = [
      { height: 720, kind: 'mobile' as const, width: 320 },
      { height: 900, kind: 'mobile' as const, width: 640 },
      { height: 1024, kind: 'rail' as const, width: 768 },
      { height: 720, kind: 'desktop-low' as const, width: 1280 },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.goto('/?tab=home')
      await expect(page.getByRole('heading', { name: 'Tu ruta', exact: true })).toBeVisible()

      const metrics = await readChromeMetrics(page)
      expect(metrics.scrollWidth).toBeLessThanOrEqual(viewport.width)
      if (viewport.kind === 'rail' || viewport.kind === 'desktop-low') {
        expect(metrics.shellDisplay).toBe('grid')
        expect(metrics.topbar.left).toBeGreaterThanOrEqual(metrics.navigation.right - 1)
        expect(metrics.stage.left).toBeGreaterThanOrEqual(metrics.navigation.right - 1)
      } else {
        expect(metrics.navigation.left).toBeGreaterThanOrEqual(0)
        expect(metrics.navigation.right).toBeLessThanOrEqual(viewport.width)
        expect(metrics.navigation.bottom).toBeCloseTo(viewport.height, 0)
      }

      if (viewport.kind === 'desktop-low') {
        const heroAction = await requiredBox(page.locator('.journey-feature-actions').first())
        expect(heroAction.y + heroAction.height).toBeLessThanOrEqual(viewport.height)
      }

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
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width)
      await page.keyboard.press('Escape')
      await expect(more).not.toHaveAttribute('open', '')
      await expect(summary).toBeFocused()

      await summary.click()
      await page.locator('.topbar').click({ position: { x: 2, y: 2 } })
      await expect(more).not.toHaveAttribute('open', '')

      if (viewport.width !== 640) {
        const audit = await new AxeBuilder({ page })
          .include('.topbar')
          .include('.tabbar')
          .withRules(['color-contrast'])
          .analyze()
        expect(audit.violations).toEqual([])
      }
    }
  })
})

async function readChromeMetrics(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const navigation = document.querySelector<HTMLElement>('.tabbar')
    const stage = document.querySelector<HTMLElement>('.tab-stage')
    const topbar = document.querySelector<HTMLElement>('.topbar')
    if (!shell || !navigation || !stage || !topbar) throw new Error('Chrome incompleto')
    const toBounds = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top }
    }
    return {
      navigation: toBounds(navigation),
      scrollWidth: document.documentElement.scrollWidth,
      shellDisplay: getComputedStyle(shell).display,
      stage: toBounds(stage),
      topbar: toBounds(topbar),
    }
  })
}

async function renderAtlasTheme(page: Page, theme: AtlasTheme) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.evaluate((nextTheme) => window.localStorage.setItem('nexo-theme', nextTheme), theme)
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.getByRole('heading', { name: 'Tu ruta', exact: true })).toBeVisible()
  await expect(page.locator('.journey-feature-card').first()).toContainText('Inception')
  const heroPoster = page.locator('.journey-feature-card .cover-art img').first()
  await expect(heroPoster).toBeVisible()
  await expect.poll(() => heroPoster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(600)
  await page.evaluate(async () => document.fonts.ready)
}

async function expectAtlasMilestones(
  page: Page,
  theme: AtlasTheme,
  viewport: { width: number; height: number },
  mobile: boolean,
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
  await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page')

  const [shellBox, topbarBox, navigationBox, journeyBox, nowBox, nextBox, laterBox] = await Promise.all([
    requiredBox(shell),
    requiredBox(topbar),
    requiredBox(navigation),
    requiredBox(journey),
    requiredBox(nowLane),
    requiredBox(nextLane),
    requiredBox(laterLane),
  ])
  const styles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const topbarElement = document.querySelector<HTMLElement>('.topbar')
    const navigationElement = document.querySelector<HTMLElement>('.tabbar')
    const titleElement = document.querySelector<HTMLElement>('.home-atlas-title h2')
    return {
      colorScheme: root.colorScheme,
      displayFont: titleElement ? getComputedStyle(titleElement).fontFamily : '',
      motionReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      navigationPosition: navigationElement ? getComputedStyle(navigationElement).position : '',
      scrollWidth: document.documentElement.scrollWidth,
      surface: root.getPropertyValue('--surface').trim(),
      topbarBackground: topbarElement ? getComputedStyle(topbarElement).backgroundColor : '',
    }
  })

  expect(styles.surface).toBe(themeExpectations[theme].surface)
  expect(styles.colorScheme).toBe(themeExpectations[theme].colorScheme)
  expect(styles.motionReduced).toBe(true)
  expect(styles.displayFont).toContain('Instrument Serif')
  expect(styles.navigationPosition).toBe('fixed')
  expect(styles.topbarBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(styles.scrollWidth).toBeLessThanOrEqual(viewport.width)
  expect(shellBox.width).toBeCloseTo(viewport.width, 0)
  expect(topbarBox.y).toBeCloseTo(0, 0)
  expect(journeyBox.width).toBeGreaterThan(300)

  if (mobile) {
    expect(topbarBox.x).toBeCloseTo(0, 0)
    expect(topbarBox.width).toBeCloseTo(viewport.width, 0)
    expect(navigationBox.x).toBeCloseTo(0, 0)
    expect(navigationBox.width).toBeCloseTo(viewport.width, 0)
    expect(navigationBox.y + navigationBox.height).toBeCloseTo(viewport.height, 0)
    expect(nextBox.y).toBeGreaterThan(nowBox.y + nowBox.height)
    expect(laterBox.y).toBeGreaterThan(nextBox.y + nextBox.height)
    expect(Math.abs(nowBox.x - nextBox.x)).toBeLessThanOrEqual(1)
  } else {
    expect(navigationBox.x).toBeCloseTo(0, 0)
    expect(navigationBox.y).toBeCloseTo(0, 0)
    expect(navigationBox.width).toBeCloseTo(264, 0)
    expect(navigationBox.height).toBeGreaterThanOrEqual(viewport.height)
    expect(topbarBox.x).toBeCloseTo(navigationBox.width, 0)
    expect(topbarBox.width).toBeCloseTo(viewport.width - navigationBox.width, 0)
    expect(Math.abs(nowBox.y - nextBox.y)).toBeLessThanOrEqual(1)
    expect(nextBox.x).toBeGreaterThan(nowBox.x + nowBox.width)
    expect(laterBox.y).toBeGreaterThan(Math.max(nowBox.y + nowBox.height, nextBox.y + nextBox.height))
  }
}

async function requiredBox(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box as NonNullable<typeof box>
}

async function attachAtlasScreenshot(page: Page, testInfo: TestInfo, theme: AtlasTheme, mobile: boolean) {
  const formFactor = mobile ? 'mobile-390x844' : 'desktop-1440x900'
  const name = `atlas-${formFactor}-${theme}`
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: false, path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}
