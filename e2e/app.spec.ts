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

async function expectLibraryGridAnimationsSettled(page: Page) {
  const grid = page.getByTestId('library-grid')
  await expect(grid).toBeVisible()
  await grid.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)))
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

async function openManualEntryEditor(page: Page) {
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await expect(quickSearch).toBeVisible()
  await quickSearch.getByLabel('Buscar en Nexo').fill('anadir entrada')
  await quickSearch.getByRole('button', { name: 'Ejecutar Anadir entrada' }).click()
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expectDialogAnimationsSettled(editor)
  return editor
}

async function fillLibraryTextSearch(page: Page, value: string) {
  await openLibraryAdvanced(page)
  await page.locator('details.library-advanced-panel').getByLabel('Buscar en biblioteca').fill(value)
}

async function selectLibraryItems(page: Page, ...titles: string[]) {
  await openLibraryAdvanced(page)
  for (const title of titles) {
    const checkbox = page.getByLabel(`Seleccionar ${title}`)
    await expect(checkbox).toBeVisible()
    await checkbox.check()
  }
}

async function openExplorerTools(page: Page) {
  const toolsPanel = page.locator('details.explorer-tools-panel').first()
  await expect(toolsPanel).toBeVisible()
  const isOpen = await toolsPanel.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    await toolsPanel.locator(':scope > summary').click()
  }
}

async function submitExplorerSearch(page: Page) {
  const searchForm = page.locator('details.explorer-tools-panel.explorer-history-panel form.explorer-search').first()
  await searchForm.locator('button[type="submit"]').click()
}

async function openExplorerFilters(page: Page) {
  await openExplorerTools(page)
  const filtersPanel = page.locator('details.explorer-history-panel details.explorer-tools-panel').first()
  await expect(filtersPanel).toBeVisible()
  const isOpen = await filtersPanel.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    await filtersPanel.locator(':scope > summary').click()
  }
}

async function expectLibrarySurface(page: Page) {
  await expect(page.getByTestId('library-masthead')).toContainText('Biblioteca')
}

async function expectNoVisibleTextClipping(page: Page) {
  const clippedElements = await page.evaluate(() => {
    const selector = [
      'button:not(.icon-button):not(.card-menu-trigger)',
      'summary',
      'h1',
      'h2',
      'h3',
      'h4',
      '.topbar-title',
      '.topbar-subtitle',
      '.brand-wordmark',
      '.pulse-summary span',
      '.pulse-summary strong',
      '.tab-label > span:first-child',
      '.item-identity h3',
      '.item-status',
      '.tag-row span',
      '.segment-option',
      '.primary-button',
      '.secondary-button',
      '.ghost-button',
      '.small-button',
      '.dice-button',
      '.source-filter-chip span',
      '.source-filter-chip small',
      '.stat-chip',
      '.status-chip-button',
      '.preset-chip',
      '.catalog-filter-chip',
      '.library-masthead-signal span',
      '.library-masthead-signal strong',
      '.library-masthead-signal small',
      '.library-search-copy h3',
      '.cover-art-type',
      '.cover-art-title',
      '.tool-mode-badge',
      '.tool-job-strip strong',
      '.tool-job-strip em',
      '.intent-flow span',
      '.tool-boundary',
      '.dice-readiness-card span',
      '.dice-readiness-card strong',
      '.dice-featured-copy small',
      '.dice-featured-copy strong',
      '.dice-featured-copy em',
      '.dice-featured-score small',
      '.dice-featured-score strong',
      '.dice-pool-detail summary strong',
      '.dice-pool-detail summary small',
      '.dice-candidate-main > strong',
      '.dice-candidate-main > small',
      '.score-card span',
      '.score-card strong',
      '.theme-option strong',
      '.theme-option small',
      '.theme-option-status',
      '.settings-drawer > summary strong',
      '.settings-drawer > summary small',
      '.settings-drawer > summary em',
      '.settings-confidence-facts span',
      '.settings-confidence-facts strong',
      '.settings-pending-badge',
      '.settings-confidence-rest',
      '.candidate-status',
      '.catalog-meta span',
      '.catalog-quality',
      '.detail-meta span',
      '.candidate-save-action strong',
      '.candidate-save-action small',
      '.candidate-primary-action',
      '.role-badge',
    ].join(',')

    return Array.from(document.querySelectorAll(selector)).flatMap((element) => {
      const node = element as HTMLElement
      const isDesktop = document.documentElement.clientWidth >= 901
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      const overflowX = node.scrollWidth - node.clientWidth
      const overflowY = node.scrollHeight - node.clientHeight
      const fontSize = Number.parseFloat(style.fontSize)
      const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.2 : Number.parseFloat(style.lineHeight)
      const lineHeightRatio = fontSize > 0 && lineHeight > 0 ? lineHeight / fontSize : 1.2
      const isTextButton =
        node.tagName === 'BUTTON' &&
        text.length > 3 &&
        !node.classList.contains('stat-chip') &&
        !node.classList.contains('preset-chip') &&
        !node.classList.contains('dice-expand-button')
      const isCrampedTextButton = isTextButton && rect.height < 41.5
      const isStrictReadableText = isDesktop && node.matches(
        [
          '.cover-art-type',
          '.cover-art-title',
          '.tool-mode-badge',
          '.tool-job-strip strong',
          '.tool-job-strip em',
          '.intent-flow span',
          '.tool-boundary',
          '.dice-readiness-card span',
          '.dice-readiness-card strong',
          '.dice-featured-copy small',
          '.dice-featured-copy strong',
          '.dice-featured-copy em',
          '.dice-featured-score small',
          '.dice-featured-score strong',
          '.score-card span',
          '.score-card strong',
          '.theme-option strong',
          '.theme-option small',
          '.theme-option-status',
          '.settings-drawer > summary strong',
          '.settings-confidence-facts span',
          '.settings-confidence-facts strong',
          '.settings-pending-badge',
          '.settings-confidence-rest',
          '.item-status',
          '.candidate-status',
          '.catalog-meta span',
          '.detail-meta span',
          '.role-badge',
        ].join(','),
      )
      const overflowYTolerance = isStrictReadableText ? 1 : 4
      const needsTextBreathingRoom =
        isDesktop && node.matches(
          'h1, h2, h3, h4, .brand-wordmark, .pulse-summary span, .pulse-summary strong, .tab-label > span:first-child, .library-masthead-signal span, .library-masthead-signal strong, .library-masthead-signal small, .library-search-copy h3, .cover-art-type, .cover-art-title, .tool-mode-badge, .tool-job-strip strong, .tool-job-strip em, .intent-flow span, .tool-boundary, .theme-option strong, .theme-option small',
        ) && lineHeightRatio < 1.18

      if (
        !text ||
        !isVisible ||
        (overflowX <= 1 && overflowY <= overflowYTolerance && !isCrampedTextButton && !needsTextBreathingRoom)
      ) {
        return []
      }

      return [
        {
          className: typeof node.className === 'string' ? node.className : '',
          crampedTextButton: isCrampedTextButton,
          height: Math.round(rect.height * 10) / 10,
          lineHeightRatio: Math.round(lineHeightRatio * 100) / 100,
          overflowX: Math.round(overflowX * 10) / 10,
          overflowY: Math.round(overflowY * 10) / 10,
          tag: node.tagName.toLowerCase(),
          text,
          width: Math.round(rect.width * 10) / 10,
        },
      ]
    })
  })

  expect(clippedElements).toEqual([])
}

async function mockOpenLibraryOdisea(page: Page) {
  const odiseaResult = {
    id: 'open-library--works-OL166894W',
    title: 'Odisea',
    type: 'book',
    source: 'openLibrary',
    sourceId: '/works/OL166894W',
    posterUrl: 'https://covers.openlibrary.org/b/id/531509-M.jpg',
    releaseYear: 1996,
    genres: ['Clasico', 'Aventura'],
    externalRefs: {
      openLibraryKey: '/works/OL166894W',
      sourceUrl: 'https://openlibrary.org/works/OL166894W',
    },
    createdAt: '2026-06-06T10:00:00.000Z',
  }

  await page.route('**/search**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/search' && url.searchParams.get('q')?.toLowerCase() === 'odisea') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-nexo-cache': 'hit' },
        json: { results: [odiseaResult] },
      })
      return
    }
    await route.fallback()
  })

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

  await page.route('https://graphql.anilist.co', async (route) => {
    const body = route.request().postDataJSON() as { variables?: { search?: string } } | undefined
    if (body?.variables?.search?.toLowerCase() !== 'odisea') {
      await route.fallback()
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          Page: {
            media: [
              {
                id: 166894,
                title: {
                  english: 'Odisea',
                  romaji: 'Odisea',
                  native: 'Odisea',
                },
                description: 'Resultado controlado para pruebas de explorador.',
                format: 'TV',
                genres: ['Aventura'],
                startDate: { year: 1996 },
                coverImage: { medium: odiseaResult.posterUrl },
              },
            ],
          },
        },
      },
    })
  })
}

async function mockEmptyAnimeMangaProviders(page: Page) {
  await page.route('https://api.jikan.moe/v4/**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })

  await page.route('https://api.mangadex.org/manga**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })

  await page.route('https://kitsu.io/api/edge/manga**', async (route) => {
    await route.fulfill({ contentType: 'application/vnd.api+json', json: { data: [] } })
  })
}

async function mockFrierenCatalog(page: Page) {
  const frierenResult = {
    id: 'anilist-154587',
    title: 'Frieren: Tras finalizar el viaje',
    type: 'anime',
    source: 'anilist',
    sourceId: '154587',
    overview: 'La elfa Frieren empieza un viaje tranquilo despues de derrotar al Rey Demonio.',
    posterUrl: 'https://img.anili.st/media/154587.jpg',
    releaseYear: 2023,
    genres: ['Animacion', 'Aventura', 'Drama'],
    externalRefs: {
      anilistId: '154587',
      sourceUrl: 'https://anilist.co/anime/154587',
    },
    createdAt: '2026-06-06T10:00:00.000Z',
  }

  await page.route('**/search**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/search' && url.searchParams.get('q')?.toLowerCase() === 'frieren') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-nexo-cache': 'hit' },
        json: { results: [frierenResult] },
      })
      return
    }
    await route.fallback()
  })

  await page.route('https://graphql.anilist.co', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          Page: {
            media: [
              {
                id: 154587,
                title: {
                  english: 'Frieren: Tras finalizar el viaje',
                  romaji: 'Sousou no Frieren',
                  native: 'Sousou no Frieren',
                },
                description: frierenResult.overview,
                format: 'TV',
                genres: frierenResult.genres,
                startDate: { year: 2023 },
                coverImage: { medium: frierenResult.posterUrl },
              },
            ],
          },
        },
      },
    })
  })

  await page.route('https://api.jikan.moe/v4/**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })
}

async function mockPaginatedCatalog(page: Page) {
  const firstResults = Array.from({ length: 10 }, (_, index) => paginationCandidate(index + 1))
  const secondResults = Array.from({ length: 9 }, (_, index) =>
    paginationCandidate(101 + index, `Second Pagination ${String(index + 1).padStart(2, '0')}`),
  )

  await page.route('**/search**', async (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q')?.toLowerCase()
    if (url.pathname === '/search' && query === 'pagination probe') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-nexo-cache': 'hit' },
        json: { results: firstResults },
      })
      return
    }
    if (url.pathname === '/search' && query === 'second pagination') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-nexo-cache': 'hit' },
        json: { results: secondResults },
      })
      return
    }
    await route.fallback()
  })

  await page.route('https://graphql.anilist.co', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: { Page: { media: [] } } } })
  })

  await page.route('https://api.jikan.moe/v4/anime**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })

  await page.route('https://api.jikan.moe/v4/manga**', async (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q')?.toLowerCase()
    const results = query === 'second pagination' ? secondResults : query === 'pagination probe' ? firstResults : []
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: results.map((result) => ({
          mal_id: Number(result.sourceId),
          title: result.title,
          title_english: result.title,
          synopsis: result.overview,
          type: 'Manga',
          published: { prop: { from: { year: result.releaseYear } } },
          images: { jpg: { image_url: result.posterUrl } },
          genres: result.genres.map((name) => ({ name })),
          url: result.externalRefs.sourceUrl,
        })),
      },
    })
  })

  await page.route('https://api.mangadex.org/manga**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })

  await page.route('https://kitsu.io/api/edge/manga**', async (route) => {
    await route.fulfill({ contentType: 'application/vnd.api+json', json: { data: [] } })
  })
}

function paginationCandidate(index: number, title = `Pagination Probe ${String(index).padStart(2, '0')}`) {
  return {
    id: `jikan-${7000 + index}`,
    title,
    type: 'manga',
    source: 'jikan',
    sourceId: String(7000 + index),
    overview: `Resultado paginado ${index}.`,
    posterUrl: `https://cdn.example.test/pagination-${index}.jpg`,
    releaseYear: 2020 + (index % 4),
    genres: ['Drama'],
    externalRefs: {
      malId: String(7000 + index),
      sourceUrl: `https://myanimelist.net/manga/${7000 + index}/${title.replace(/\s+/g, '_')}`,
    },
    createdAt: '2026-06-06T10:00:00.000Z',
  }
}

async function mockAnimeMangaCatalog(page: Page) {
  await page.route('https://graphql.anilist.co', async (route) => {
    const body = route.request().postDataJSON() as { variables?: { search?: string; type?: string } } | undefined
    const search = body?.variables?.search?.toLowerCase() ?? ''
    const type = body?.variables?.type

    if (type === 'MANGA' && search.includes('iruma')) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: {
            Page: {
              media: [
                {
                  id: 99324,
                  title: {
                    english: 'Welcome to Demon School! Iruma-kun',
                    romaji: 'Mairimashita! Iruma-kun',
                    native: '魔入りました！入間くん',
                  },
                  description: 'Iruma llega a una escuela de demonios con energia de comedia fantastica.',
                  format: 'MANGA',
                  countryOfOrigin: 'JP',
                  genres: ['Comedy', 'Fantasy'],
                  startDate: { year: 2017 },
                  coverImage: { medium: 'https://img.anili.st/media/99324.jpg' },
                },
              ],
            },
          },
        },
      })
      return
    }

    if (type === 'ANIME' && search.includes('isekai')) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: {
            Page: {
              media: [
                {
                  id: 197824,
                  title: {
                    english: 'Farming Life in Another World 2',
                    romaji: 'Isekai Nonbiri Nouka 2',
                    native: '異世界のんびり農家２',
                  },
                  description: 'Nueva temporada de vida rural tranquila en otro mundo.',
                  format: 'TV',
                  countryOfOrigin: 'JP',
                  genres: ['Fantasy', 'Slice of Life'],
                  startDate: { year: 2026 },
                  coverImage: { medium: 'https://img.anili.st/media/197824.jpg' },
                },
              ],
            },
          },
        },
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      json: { data: { Page: { media: [] } } },
    })
  })

  await page.route('https://api.jikan.moe/v4/**', async (route) => {
    const url = new URL(route.request().url())
    const search = url.searchParams.get('q')?.toLowerCase() ?? ''

    if (url.pathname === '/v4/manga' && search.includes('omniscient')) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: [
            {
              mal_id: 132214,
              title: "Omniscient Reader's Viewpoint",
              title_english: "Omniscient Reader's Viewpoint",
              synopsis: 'Apocalipsis literario y supervivencia desde el punto de vista del lector.',
              type: 'Manhwa',
              published: { prop: { from: { year: 2020 } } },
              images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/1/132214.jpg' } },
              genres: [{ name: 'Action' }, { name: 'Fantasy' }],
              url: 'https://myanimelist.net/manga/132214/Omniscient_Readers_Viewpoint',
            },
          ],
        },
      })
      return
    }

    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })

  await page.route('https://api.mangadex.org/manga**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })

  await page.route('https://kitsu.io/api/edge/manga**', async (route) => {
    await route.fulfill({ contentType: 'application/vnd.api+json', json: { data: [] } })
  })
}

async function openApp(page: Page) {
  await mockOpenLibraryOdisea(page)
  await page.goto('/')
}

async function openEditorAdvanced(editor: Locator) {
  const advancedPanel = editor.locator('details.editor-advanced-panel')
  await expect(advancedPanel).toBeVisible()
  const isOpen = await advancedPanel.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    await advancedPanel.evaluate((element) => {
      const details = element as HTMLDetailsElement
      details.open = true
    })
  }
}

async function openDiceTuning(page: Page) {
  const settingsPanel = page.locator('details.dice-settings-panel')
  if (await settingsPanel.count()) {
    await expect(settingsPanel).toBeVisible()
    const isSettingsOpen = await settingsPanel.evaluate((element) => (element as HTMLDetailsElement).open)
    if (!isSettingsOpen) {
      await page.getByLabel('Abrir modos de tirada').click()
      const opened = await settingsPanel.evaluate((element) => (element as HTMLDetailsElement).open)
      if (!opened) {
        await settingsPanel.evaluate((element) => {
          ;(element as HTMLDetailsElement).open = true
        })
      }
    }
  }

  const tuningPanel = page.locator('details.dice-tuning-panel')
  if (!(await tuningPanel.count())) return

  await expect(tuningPanel).toBeVisible()
  const isOpen = await tuningPanel.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    await tuningPanel.locator('summary').click()
  }
}

async function openSettingsDrawer(page: Page, testId: string) {
  const drawer = page.getByTestId(testId)
  await expect(drawer).toBeVisible()
  const isOpen = await drawer.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    await drawer.locator('summary').click()
  }
}

async function openCurationTools(page: Page) {
  const drawer = page.locator('details.curation-admin-drawer')
  await expect(drawer).toBeVisible()
  const isOpen = await drawer.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    await drawer.locator('summary').click()
  }
}

test('library starts with a focused search-first surface', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('library-masthead')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
  await expect(page.getByTestId('library-masthead')).toContainText('Biblioteca')
  await expect(page.getByTestId('library-masthead')).not.toContainText('Biblioteca personal')
  await expect(page.getByTestId('library-masthead')).not.toContainText('Tu mapa privado')
  await expect(page.getByTestId('library-masthead')).not.toContainText('Siguiente en tu mapa')
  await expect(page.getByRole('button', { name: 'Anadir', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('library-catalog-search')).toBeVisible()
  await expect(page.getByTestId('library-shelf-header')).toContainText('Todas')
  await expect(page.getByTestId('library-shelf-header')).toContainText('Guardadas')
  await expect(page.getByRole('button', { name: 'Mosaico' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tarjetas' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lista', exact: true })).toHaveCount(0)
  await expect(page.locator('.library-shelf-view-switch')).toHaveCount(0)
  const primaryLibraryControls = page.getByTestId('library-shelf-header')
  await expect(primaryLibraryControls.getByLabel('Filtrar por estado')).toBeVisible()
  await expect(primaryLibraryControls.getByLabel('Filtrar por tipo')).toBeVisible()
  await expect(primaryLibraryControls.getByLabel('Ordenar biblioteca')).toBeVisible()
  await expect(page.getByTestId('library-focus-shelf')).toBeVisible()
  await expect(page.getByTestId('library-spotlight')).not.toBeVisible()
  await expect(page.getByLabel('Buscar obra para guardar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Buscar obra' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fuentes' })).toBeVisible()
  const sourceCreditButtonWidth = await page.locator('.source-credit-trigger').evaluate((button) => button.getBoundingClientRect().width)
  expect(sourceCreditButtonWidth).toBeLessThanOrEqual(54)
  await expect(page.locator('details.library-advanced-panel')).not.toHaveAttribute('open', '')
  await expect(page.locator('.stats-row')).not.toBeVisible()
  await expect(page.locator('.library-selection-bar')).not.toBeVisible()
  await expect(page.getByTestId('library-overview')).not.toBeVisible()
  await expect(page.getByTestId('launch-guide')).not.toBeVisible()
  await expect(page.getByTestId('library-review-queue')).not.toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  const introGap = await page.evaluate(() => {
    const masthead = document.querySelector('[data-testid="library-masthead"]')?.getBoundingClientRect()
    const search = document.querySelector('[data-testid="library-catalog-search"]')?.getBoundingClientRect()
    if (!masthead || !search) return Number.POSITIVE_INFINITY
    return Math.max(0, search.bottom - masthead.bottom, masthead.top - search.top)
  })
  expect(introGap).toBe(0)
  const searchFieldFits = await page.getByTestId('library-catalog-search').evaluate((form) => {
    return form.scrollWidth <= form.clientWidth + 1
  })
  expect(searchFieldFits).toBe(true)
  const visibleMastheadCovers = await page.locator('.library-masthead-covers .cover-art').evaluateAll((covers) => {
    return covers.filter((cover) => {
      const rect = cover.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }).length
  })
  expect(visibleMastheadCovers).toBe(0)
  const focusGeometry = await page.getByTestId('library-focus-shelf').locator('.focus-item').evaluateAll((items) => {
    const firstItem = items[0]
    const cover = firstItem?.querySelector('.cover-art')?.getBoundingClientRect()
    const label = firstItem?.querySelector('.focus-item-main > span')?.getBoundingClientRect()
    const shelf = document.querySelector('[data-testid="library-focus-shelf"]')?.getBoundingClientRect()
    const shelfParent = document.querySelector('[data-testid="library-focus-shelf"]')?.parentElement?.getBoundingClientRect()
    const grid = document.querySelector('[data-testid="library-grid"]')?.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    let isVisualShelf = false
    if (cover && label) {
      isVisualShelf = cover.height >= 50 && Math.abs(cover.top - label.top) < 36
    }

    return {
      coverHeight: cover?.height ?? 0,
      focusAfterGrid: Boolean(shelf && grid && shelf.top > grid.top),
      gridTop: grid?.top ?? 0,
      isVisualShelf,
      shelfHeight: shelf?.height ?? 0,
      shelfWidth: shelf?.width ?? 0,
      shelfParentWidth: shelfParent?.width ?? 0,
      viewportWidth,
    }
  })
  if (focusGeometry.viewportWidth >= 760) {
    expect(focusGeometry.coverHeight).toBeGreaterThanOrEqual(50)
    expect(focusGeometry.coverHeight).toBeLessThanOrEqual(84)
    expect(focusGeometry.focusAfterGrid).toBe(true)
    expect(focusGeometry.isVisualShelf).toBe(true)
    expect(focusGeometry.shelfHeight).toBeLessThanOrEqual(180)
    expect(focusGeometry.shelfWidth).toBeGreaterThanOrEqual(Math.min(1200, focusGeometry.viewportWidth * 0.78))
    expect(focusGeometry.gridTop).toBeLessThanOrEqual(320)
  } else {
    expect(focusGeometry.coverHeight).toBeGreaterThan(56)
    expect(focusGeometry.shelfHeight).toBeLessThanOrEqual(240)
  }

  await openLibraryAdvanced(page)
  await expect(page.getByTestId('library-overview')).toContainText('Siguiente accion')
  await expect(page.getByTestId('launch-guide')).toContainText('Plan de arranque')
  await expect(page.getByTestId('library-review-queue')).toContainText('Repaso guiado')
})
test('shell navigation keeps clear labels without responsive overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await expect(page.getByTestId('library-masthead')).toContainText('Biblioteca')
  await expect(page.locator('.brand-wordmark')).toHaveText('Nexo')

  const desktopLabels = await page.locator('.tabbar .tab-label').evaluateAll((labels) =>
    labels.map((label) => (label as HTMLElement).innerText.trim()),
  )
  expect(desktopLabels).toEqual(
    expect.arrayContaining([
      'Estanteria',
      'Dado',
      'Explorar',
      'Ajustes',
      'Curar',
    ]),
  )
  const navRawText = await page.locator('.tabbar').evaluate((tabbar) => tabbar.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  expect(navRawText).not.toContain('Guardadas')
  expect(navRawText).not.toContain('De tus guardadas')
  expect(navRawText).not.toContain('Fuera de tu estanteria')
  expect(navRawText).not.toContain('Cuenta y temas')
  const visibleNavDescriptions = await page.locator('.tabbar .tab-label small').evaluateAll((descriptions) =>
    descriptions.filter((description) => {
      const rect = (description as HTMLElement).getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }).length,
  )
  expect(visibleNavDescriptions).toBe(0)
  const desktopShellGeometry = await page.evaluate(() => {
    const tabbar = document.querySelector('.tabbar') as HTMLElement | null
    const topbar = document.querySelector('.topbar') as HTMLElement | null
    const masthead = document.querySelector('[data-testid="library-masthead"]') as HTMLElement | null
    return {
      navWidth: tabbar?.getBoundingClientRect().width ?? 0,
      pageHasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      mastheadTop: masthead?.getBoundingClientRect().top ?? 0,
      topbarHeight: topbar?.getBoundingClientRect().height ?? 0,
      visibleModePills: Array.from(document.querySelectorAll('.topbar-actions .mode-pill')).filter((pill) => {
        const rect = (pill as HTMLElement).getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }).length,
    }
  })
  expect(desktopShellGeometry.navWidth).toBeLessThanOrEqual(188)
  expect(desktopShellGeometry.topbarHeight).toBeLessThanOrEqual(64)
  expect(desktopShellGeometry.mastheadTop).toBeLessThanOrEqual(96)
  expect(desktopShellGeometry.visibleModePills).toBe(0)
  expect(desktopShellGeometry.pageHasHorizontalOverflow).toBe(false)

  for (const surface of ['Biblioteca', 'Dado', 'Explorador', 'Ajustes']) {
    if (surface !== 'Biblioteca') {
      await page.getByRole('button', { name: surface, exact: true }).click()
    }
    await expectNoVisibleTextClipping(page)
  }
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expectLibrarySurface(page)
  await expect(page.locator('.topbar .brand-wordmark')).toBeVisible()
  await expect(page.locator('.topbar .brand-wordmark')).toHaveText('Nexo')
  await expect(page.locator('.topbar h1')).toBeHidden()

  const mobileGeometry = await page.locator('.tabbar').evaluate((tabbar) => {
    const labels = [...tabbar.querySelectorAll('.tab-label')].map((label) => {
      const visibleShortLabel = window.getComputedStyle(label, '::after').content.replace(/^"|"$/g, '')
      return visibleShortLabel || (label as HTMLElement).innerText.trim()
    })
    const tabbarRect = tabbar.getBoundingClientRect()
    const tabbarStyle = window.getComputedStyle(tabbar)
    const stageRect = document.querySelector('.tab-stage')?.getBoundingClientRect()
    const topbarRect = document.querySelector('.topbar')?.getBoundingClientRect()
    return {
      labels,
      pageHasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      stageTop: stageRect?.top ?? 0,
      tabbarHasHorizontalOverflow: tabbar.scrollWidth > tabbar.clientWidth + 1,
      tabbarBottomGap: Math.abs(window.innerHeight - tabbarRect.bottom),
      tabbarPosition: tabbarStyle.position,
      topbarHeight: topbarRect?.height ?? 0,
    }
  })
  expect(mobileGeometry.labels).toEqual(expect.arrayContaining(['Inicio', 'Dado', 'Explora', 'Ajustes']))
  expect(mobileGeometry.pageHasHorizontalOverflow).toBe(false)
  expect(mobileGeometry.tabbarHasHorizontalOverflow).toBe(false)
  expect(mobileGeometry.tabbarPosition).toBe('fixed')
  expect(mobileGeometry.tabbarBottomGap).toBeLessThanOrEqual(1)
  expect(mobileGeometry.topbarHeight).toBeLessThanOrEqual(72)
  expect(mobileGeometry.stageTop).toBeLessThanOrEqual(76)
  for (const surface of ['Biblioteca', 'Dado', 'Explorador', 'Ajustes']) {
    if (surface !== 'Biblioteca') {
      await page.getByRole('button', { name: surface, exact: true }).click()
    }
    await expectNoVisibleTextClipping(page)
  }
})

test('dice and explorer state clearly different jobs', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await openApp(page)

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.locator('.topbar-subtitle')).toHaveText('De tus guardadas')
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await expect(page.getByTestId('dice-job')).toContainText('Guardadas')
  await expect(page.getByTestId('dice-job')).toContainText('Tirada')
  await expect(page.getByTestId('dice-job')).toContainText('Empiezas')
  await expect(page.getByTestId('dice-job')).not.toContainText('Revisar')
  const diceStepMarkers = await page.getByTestId('dice-job').locator('span').evaluateAll((steps) =>
    steps.map((step) => window.getComputedStyle(step, '::before').content.replaceAll('"', '')),
  )
  expect(diceStepMarkers).toEqual(['1', '2', '3'])
  await expect(page.locator('.dice-featured-candidate .cover-art')).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Candidatas guardadas')
  await expect(page.locator('details.dice-settings-panel')).not.toHaveAttribute('open', '')
  await expect(page.getByLabel('Presets rapidos del dado')).not.toBeVisible()
  const desktopDiceStage = await page.evaluate(() => {
    const hero = document.querySelector('.dice-hero') as HTMLElement | null
    const copy = document.querySelector('.dice-hero-copy') as HTMLElement | null
    const readiness = document.querySelector('[data-testid="dice-readiness"]') as HTMLElement | null
    const action = document.querySelector('.dice-action-stage') as HTMLElement | null
    const orb = document.querySelector('.dice-orb') as HTMLElement | null
    const queue = document.querySelector('.dice-queue') as HTMLElement | null
    const copyRect = copy?.getBoundingClientRect()
    const readinessRect = readiness?.getBoundingClientRect()
    const actionRect = action?.getBoundingClientRect()

    return {
      actionAfterCopy: Boolean(copyRect && actionRect && actionRect.left > copyRect.left && actionRect.right > copyRect.right),
      actionHeight: actionRect?.height ?? 0,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      heroHeight: hero?.getBoundingClientRect().height ?? 0,
      orbHeight: orb?.getBoundingClientRect().height ?? 0,
      queueTop: queue?.getBoundingClientRect().top ?? 0,
      readinessHeight: readinessRect?.height ?? 0,
      readinessBelowCopy: Boolean(copyRect && readinessRect && readinessRect.top > copyRect.bottom),
    }
  })
  expect(desktopDiceStage.hasHorizontalOverflow).toBe(false)
  expect(desktopDiceStage.heroHeight).toBeLessThanOrEqual(390)
  expect(desktopDiceStage.actionAfterCopy).toBe(true)
  expect(desktopDiceStage.readinessBelowCopy).toBe(true)
  expect(desktopDiceStage.readinessHeight).toBeGreaterThanOrEqual(30)
  expect(desktopDiceStage.actionHeight).toBeGreaterThanOrEqual(250)
  expect(desktopDiceStage.orbHeight).toBeGreaterThanOrEqual(140)
  expect(desktopDiceStage.queueTop).toBeLessThanOrEqual(96)
  await page.getByLabel('Abrir modos de tirada').click()
  await expect(page.getByLabel('Presets rapidos del dado')).toBeVisible()

  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page.locator('.topbar-subtitle')).toHaveText('Fuera de tu estanteria')
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
  await expect(page.getByLabel('Tipo para descubrir')).toBeVisible()
  await expect(page.getByLabel('Duracion para descubrir')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sorprendeme' })).toBeVisible()
  await expect(page.locator('details.explorer-tools-panel').first()).not.toHaveAttribute('open', '')
  await expect(page.getByLabel('Buscar en explorador')).not.toBeVisible()

  const jobGeometry = await page.evaluate(() => {
    const diceJob = document.querySelector('[data-testid="dice-job"]') as HTMLElement | null
    const explorerCommand = document.querySelector('.explorer-command') as HTMLElement | null
    const explorerSearch = document.querySelector('.explorer-command-search') as HTMLElement | null
    const commandRect = explorerCommand?.getBoundingClientRect()
    const searchRect = explorerSearch?.getBoundingClientRect()
    return {
      diceHidden: !diceJob || diceJob.getBoundingClientRect().width === 0,
      searchInsideCommand: Boolean(commandRect && searchRect && searchRect.top > commandRect.top && searchRect.bottom <= commandRect.bottom + 1),
    }
  })
  expect(jobGeometry.diceHidden).toBe(true)
  expect(jobGeometry.searchInsideCommand).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()

  const mobileDiceGeometry = await page.evaluate(() => {
    const hero = document.querySelector('.dice-hero') as HTMLElement | null
    const readiness = document.querySelector('[data-testid="dice-readiness"]') as HTMLElement | null
    const queue = document.querySelector('.dice-queue') as HTMLElement | null
    const job = document.querySelector('[data-testid="dice-job"]') as HTMLElement | null
    const boundary = document.querySelector('.dice-boundary') as HTMLElement | null
    const eyebrow = document.querySelector('.dice-hero .eyebrow') as HTMLElement | null
    return {
      boundaryVisible: Boolean(boundary && boundary.getBoundingClientRect().width > 0 && boundary.getBoundingClientRect().height > 0),
      eyebrowVisible: Boolean(eyebrow && eyebrow.getBoundingClientRect().width > 0 && eyebrow.getBoundingClientRect().height > 0),
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      heroHeight: hero?.getBoundingClientRect().height ?? 0,
      jobHeight: job?.getBoundingClientRect().height ?? 0,
      queueTop: queue?.getBoundingClientRect().top ?? 0,
      readinessHeight: readiness?.getBoundingClientRect().height ?? 0,
      viewportHeight: document.documentElement.clientHeight,
    }
  })
  expect(mobileDiceGeometry.hasHorizontalOverflow).toBe(false)
  expect(mobileDiceGeometry.boundaryVisible).toBe(false)
  expect(mobileDiceGeometry.eyebrowVisible).toBe(false)
  expect(mobileDiceGeometry.heroHeight).toBeLessThanOrEqual(360)
  expect(mobileDiceGeometry.jobHeight).toBeLessThanOrEqual(40)
  expect(mobileDiceGeometry.readinessHeight).toBeLessThanOrEqual(130)
  expect(mobileDiceGeometry.queueTop).toBeLessThanOrEqual(mobileDiceGeometry.viewportHeight * 0.56)

  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()

  const mobileExplorerGeometry = await page.evaluate(() => {
    const command = document.querySelector('.explorer-command') as HTMLElement | null
    const search = document.querySelector('.explorer-command-search') as HTMLElement | null
    const commandRect = command?.getBoundingClientRect()
    const searchRect = search?.getBoundingClientRect()
    return {
      commandHeight: command?.getBoundingClientRect().height ?? 0,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      searchInsideCommand: Boolean(commandRect && searchRect && searchRect.top > commandRect.top && searchRect.bottom <= commandRect.bottom + 1),
    }
  })
  expect(mobileExplorerGeometry.hasHorizontalOverflow).toBe(false)
  expect(mobileExplorerGeometry.commandHeight).toBeLessThanOrEqual(340)
  expect(mobileExplorerGeometry.searchInsideCommand).toBe(true)
})

test('library mosaic starts as a poster-led shelf at 1920 desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop geometry check')

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await expectLibraryGridAnimationsSettled(page)

  const geometry = await page.getByTestId('library-grid').locator('.item-card').evaluateAll((cards) => {
    const focusShelf = document.querySelector('.library-focus-shelf')?.getBoundingClientRect()
    const gridElement = document.querySelector('[data-testid="library-grid"]')
    const grid = gridElement?.getBoundingClientRect()
    const shelfHeader = document.querySelector('[data-testid="library-shelf-header"]')?.getBoundingClientRect()
    const rects = cards.map((card) => card.getBoundingClientRect())
    const firstTop = rects[0]?.top ?? 0
    const firstRowCount = rects.filter((rect) => Math.abs(rect.top - firstTop) < 4).length
    const firstCard = cards[0]
    const firstCover = firstCard?.querySelector('.cover-art')?.getBoundingClientRect()
    const firstBody = firstCard?.querySelector('.item-body')?.getBoundingClientRect()
    const firstRect = rects[0]
    const firstRowRects = rects.filter((rect) => Math.abs(rect.top - firstTop) < 4)
    const fallbackCovers = cards
      .map((card) => card.querySelector('.cover-art.fallback-cover'))
      .filter((cover): cover is Element => Boolean(cover))
    const fullyVisibleCards = rects.filter(
      (rect) => rect.top >= 0 && rect.bottom <= document.documentElement.clientHeight,
    ).length
    let coverIsContained = false
    if (firstCover && firstBody && firstRect) {
      coverIsContained =
        firstCover.width <= firstRect.width * 0.44 &&
        firstCover.height <= firstRect.height * 0.82 &&
        firstBody.width >= firstCover.width
    }

    return {
      firstRowCount,
      firstCardHeight: firstRect?.height ?? 0,
      firstCoverHeight: firstCover?.height ?? 0,
      coverIsContained,
      fallbackCoverTitlesVisible: fallbackCovers.map((cover) => {
        const title = cover.querySelector('.cover-art-title') as HTMLElement | null
        const type = cover.querySelector('.cover-art-type') as HTMLElement | null
        const titleRect = title?.getBoundingClientRect()
        const typeRect = type?.getBoundingClientRect()
        return Boolean(titleRect && titleRect.width > 0 && titleRect.height > 0 && typeRect && typeRect.width > 0 && typeRect.height > 0)
      }),
      fullyVisibleCards,
      focusShelfHeight: focusShelf?.height ?? 0,
      gridTop: grid?.top ?? 0,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      isMosaic: gridElement?.classList.contains('mosaic-view') ?? false,
      maxFirstRowHeight: Math.max(...firstRowRects.map((rect) => rect.height)),
      minWidth: Math.min(...rects.map((rect) => rect.width)),
      shelfHeaderHeight: shelfHeader?.height ?? 0,
      shelfHeaderTop: shelfHeader?.top ?? 0,
    }
  })

  expect(geometry.hasHorizontalOverflow).toBe(false)
  expect(geometry.shelfHeaderHeight).toBeLessThanOrEqual(80)
  expect(geometry.focusShelfHeight).toBeLessThanOrEqual(180)
  expect(geometry.gridTop).toBeLessThanOrEqual(440)
  expect(geometry.fullyVisibleCards).toBeGreaterThanOrEqual(6)
  expect(geometry.isMosaic).toBe(true)
  expect(geometry.coverIsContained).toBe(true)
  expect(geometry.fallbackCoverTitlesVisible.length).toBeGreaterThan(0)
  expect(geometry.fallbackCoverTitlesVisible.every((visible) => !visible)).toBe(true)
  expect(geometry.firstCoverHeight).toBeGreaterThanOrEqual(170)
  expect(geometry.firstCoverHeight).toBeLessThanOrEqual(240)
  expect(geometry.firstCardHeight).toBeLessThanOrEqual(340)
  expect(geometry.maxFirstRowHeight).toBeLessThanOrEqual(340)
  expect(geometry.minWidth).toBeGreaterThanOrEqual(360)
  expect(geometry.firstRowCount).toBe(4)
  await expect(page.locator('details.library-advanced-panel')).not.toHaveAttribute('open', '')
})

test('library card density can switch between 4 5 and 6 desktop columns', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop geometry check')

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')

  const densitySelect = page.getByTestId('library-shelf-header').getByLabel('Tarjetas por fila')
  await expect(densitySelect).toHaveValue('4')

  async function expectFirstRowCount(expected: number) {
    await expect(page.getByTestId('library-grid')).toHaveAttribute('data-cards-per-row', String(expected))
    await expect
      .poll(async () =>
        page.getByTestId('library-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length),
      )
      .toBe(expected)
    await expectLibraryGridAnimationsSettled(page)
    const metrics = await page.getByTestId('library-grid').locator('.item-card').evaluateAll((cards) => {
      const rects = cards.map((card) => card.getBoundingClientRect())
      const firstTop = rects[0]?.top ?? 0
      const firstRow = rects.filter((rect) => Math.abs(rect.top - firstTop) < 4)
      const firstCover = cards[0]?.querySelector('.cover-art')?.getBoundingClientRect()
      const firstCard = rects[0]

      return {
        firstRowCount: firstRow.length,
        firstCardWidth: firstCard?.width ?? 0,
        firstCoverWidth: firstCover?.width ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }
    })

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
    expect(metrics.firstRowCount).toBe(expected)
    expect(metrics.firstCardWidth).toBeGreaterThanOrEqual(expected === 6 ? 240 : expected === 5 ? 280 : 360)
    expect(metrics.firstCoverWidth).toBeLessThan(metrics.firstCardWidth * 0.48)
  }

  await expectFirstRowCount(4)
  await densitySelect.selectOption('5')
  await expectFirstRowCount(5)
  await densitySelect.selectOption('6')
  await expectFirstRowCount(6)
})

test('library remains one column without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const geometry = await page.getByTestId('library-grid').locator('.item-card').evaluateAll((cards) => {
    const focusShelf = document.querySelector('.library-focus-shelf')?.getBoundingClientRect()
    const focusAction = document.querySelector('.library-focus-shelf .focus-item-action') as HTMLElement | null
    const focusActionRect = focusAction?.getBoundingClientRect()
    const grid = document.querySelector('[data-testid="library-grid"]')?.getBoundingClientRect()
    const masthead = document.querySelector('[data-testid="library-masthead"]')?.getBoundingClientRect()
    const searchHero = document.querySelector('[data-testid="library-catalog-search"]')?.getBoundingClientRect()
    const searchCopy = document.querySelector('.library-search-copy')?.getBoundingClientRect()
    const shelfHeader = document.querySelector('[data-testid="library-shelf-header"]')?.getBoundingClientRect()
    const shelfSubtitle = document.querySelector('.library-shelf-title p')?.getBoundingClientRect()
    const rects = cards.slice(0, 3).map((card) => card.getBoundingClientRect())
    const lefts = rects.map((rect) => Math.round(rect.left))
    return {
      focusActionText: focusAction?.textContent?.trim() ?? '',
      focusActionWidth: focusActionRect?.width ?? 0,
      focusShelfHeight: focusShelf?.height ?? 0,
      focusAfterGrid: Boolean(focusShelf && grid && focusShelf.top > grid.top),
      gridTop: grid?.top ?? 0,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      mastheadHeight: masthead?.height ?? 0,
      maxWidth: Math.max(...rects.map((rect) => rect.width)),
      sameColumn: lefts.every((left) => Math.abs(left - lefts[0]) <= 2),
      searchHeroHeight: searchHero?.height ?? 0,
      searchCopyVisible: Boolean(searchCopy && searchCopy.width > 0 && searchCopy.height > 0),
      shelfHeaderHeight: shelfHeader?.height ?? 0,
      shelfHeaderTop: shelfHeader?.top ?? 0,
      shelfSubtitleVisible: Boolean(shelfSubtitle && shelfSubtitle.width > 0 && shelfSubtitle.height > 0),
      stacked: rects.length < 2 || rects[1].top > rects[0].bottom,
    }
  })

  expect(geometry.hasHorizontalOverflow).toBe(false)
  expect(geometry.shelfHeaderHeight).toBeLessThanOrEqual(130)
  expect(geometry.focusShelfHeight).toBeLessThanOrEqual(240)
  expect(geometry.focusAfterGrid).toBe(true)
  expect(geometry.focusActionText.length).toBeGreaterThan(2)
  expect(geometry.focusActionWidth).toBeGreaterThanOrEqual(220)
  expect(geometry.mastheadHeight).toBeLessThanOrEqual(160)
  expect(geometry.searchHeroHeight).toBeLessThanOrEqual(125)
  expect(geometry.searchCopyVisible).toBe(false)
  expect(geometry.shelfSubtitleVisible).toBe(false)
  expect(geometry.gridTop).toBeLessThanOrEqual(460)
  expect(geometry.maxWidth).toBeLessThanOrEqual(390)
  expect(geometry.sameColumn).toBe(true)
  expect(geometry.stacked).toBe(true)
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
  await page
    .getByLabel('Resultados para guardar')
    .locator('article')
    .filter({ hasText: 'Dune - Frank Herbert' })
    .getByRole('button', { name: 'Guardar' })
    .click()
  await expect(page.getByRole('status').filter({ hasText: 'Dune - Frank Herbert guardado en Biblioteca' })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Dune - Frank Herbert')
  await page.getByRole('button', { name: 'Fuentes' }).click()
  await expect(page.getByRole('dialog', { name: 'Catalogos usados por Nexo' })).toContainText('TMDB')
  await expect(page.getByRole('dialog', { name: 'Catalogos usados por Nexo' })).toContainText('RAWG')
  await expect(page.getByRole('dialog', { name: 'Catalogos usados por Nexo' })).toContainText('Open Library')
})

test('library saves Frieren from external search without candidate permission noise', async ({ page }) => {
  await mockFrierenCatalog(page)

  await page.goto('/')
  await page.getByLabel('Buscar obra para guardar').fill('Frieren')
  await page.getByLabel('Tipo de obra para buscar').selectOption('anime')
  await page.getByRole('button', { name: 'Buscar obra' }).click()

  await expect(page.getByLabel('Resultados para guardar')).toContainText('Frieren: Tras finalizar el viaje')
  await expect(page.getByLabel('Resultados para guardar')).toContainText('AniList')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Frieren: Tras finalizar el viaje guardado en Biblioteca' })).toBeVisible()
  await expect(page.getByText(/Missing or insufficient permissions/i)).toHaveCount(0)
  await expect(page.getByTestId('library-grid')).toContainText('Frieren: Tras finalizar el viaje')

  await page.locator('.item-main').filter({ hasText: 'Frieren: Tras finalizar el viaje' }).click()
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(editor).toContainText('Metadatos protegidos')
  await expect(editor.getByLabel('Titulo')).toHaveCount(0)
  await expect(editor.getByLabel('Tipo')).toHaveCount(0)
  await expect(editor.getByLabel('Poster o portada')).toHaveCount(0)
  await expect(editor.getByLabel('Generos', { exact: true })).toHaveCount(0)

  await editor.getByRole('button', { name: 'Cambiar estado a En progreso' }).click()
  await editor.getByRole('textbox', { name: 'Progreso' }).fill('Episodio 4')
  await editor.getByRole('button', { name: 'Puntuar 4 estrellas (8/10)' }).click()
  await editor.getByLabel('Notas').fill('Mucho mas tranquila de lo que esperaba.')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Frieren: Tras finalizar el viaje guardada en Biblioteca' })).toBeVisible()
  await page.locator('.item-main').filter({ hasText: 'Frieren: Tras finalizar el viaje' }).click()
  const savedEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(savedEditor.getByRole('button', { name: 'Cambiar estado a En progreso' })).toHaveAttribute('aria-pressed', 'true')
  await expect(savedEditor.getByRole('textbox', { name: 'Progreso' })).toHaveValue('Episodio 4')
  await expect(savedEditor.getByRole('group', { name: 'Rating' })).toContainText('8/10')
  await expect(savedEditor.getByLabel('Notas')).toHaveValue('Mucho mas tranquila de lo que esperaba.')
})

test('library catalog search paginates results and saves from page two', async ({ page }) => {
  await openApp(page)
  await mockPaginatedCatalog(page)

  await page.getByLabel('Buscar obra para guardar').fill('pagination probe')
  await page.getByLabel('Tipo de obra para buscar').selectOption('manga')
  await page.getByRole('button', { name: 'Buscar obra' }).click()

  const results = page.getByLabel('Resultados para guardar')
  await expect(results).toContainText('Pagination Probe 01')
  await expect(results).not.toContainText('Pagination Probe 09')

  const pagination = page.getByTestId('library-catalog-pagination')
  await expect(pagination).toContainText('Mostrando 1-8 de 10')
  await pagination.getByRole('button', { name: 'Siguiente' }).click()
  await expect(pagination).toContainText('Mostrando 9-10 de 10')
  await expect(results).toContainText('Pagination Probe 09')

  const pageTwoCard = results.locator('article').filter({ hasText: 'Pagination Probe 09' })
  await pageTwoCard.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Pagination Probe 09 guardado en Biblioteca' })).toBeVisible()
  await expect(pageTwoCard.getByRole('button', { name: 'Guardado' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(pagination).toContainText('Mostrando 9-10 de 10')
  const catalogOverflow = await page.locator('.library-search-hero').evaluate((section) => {
    const viewportWidth = document.documentElement.clientWidth
    return Array.from(section.querySelectorAll('.library-catalog-pagination, .library-catalog-card, button, select')).flatMap((element) => {
      const node = element as HTMLElement
      const rect = node.getBoundingClientRect()
      const overflowX = Math.max(0, node.scrollWidth - node.clientWidth)
      const outsideViewport = rect.left < -1 || rect.right > viewportWidth + 1
      return overflowX > 1 || outsideViewport
        ? [{ className: node.className, overflowX, outsideViewport, text: node.textContent?.trim() }]
        : []
    })
  })
  expect(catalogOverflow).toEqual([])

  await page.getByLabel('Buscar obra para guardar').fill('second pagination')
  await page.getByRole('button', { name: 'Buscar obra' }).click()

  await expect(results).toContainText('Second Pagination 01')
  await expect(results).not.toContainText('Second Pagination 09')
  await expect(page.getByTestId('library-catalog-pagination')).toContainText('Mostrando 1-8 de 9')
})

test('library and explorer find current manga and manhwa through free sources', async ({ page }) => {
  await mockAnimeMangaCatalog(page)
  await openApp(page)

  await page.getByLabel('Buscar obra para guardar').fill('Omniscient reader')
  await page.getByLabel('Tipo de obra para buscar').selectOption('manhwa')
  await page.getByRole('button', { name: 'Buscar obra' }).click()
  await expect(page.getByLabel('Resultados para guardar')).toContainText("Omniscient Reader's Viewpoint")
  await expect(page.getByLabel('Resultados para guardar')).toContainText('Jikan')
  await page.getByLabel('Resultados para guardar').getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('status').filter({ hasText: "Omniscient Reader's Viewpoint guardado en Biblioteca" })).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText("Omniscient Reader's Viewpoint")

  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('manga')
  await page.getByLabel('Buscar en explorador').fill('Iruma-kun')
  await submitExplorerSearch(page)
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Welcome to Demon School! Iruma-kun')
  await expect(page.getByTestId('candidate-spotlight')).toContainText('AniList')
})

test('library toasts float without shifting the page', async ({ page }) => {
  await openApp(page)
  await expect(page.getByTestId('library-grid')).toBeVisible()
  const gridTopBefore = await page.getByTestId('library-grid').evaluate((grid) => grid.getBoundingClientRect().top + window.scrollY)

  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await page.getByRole('menuitem', { name: 'Copiar enlace Outer Wilds' }).click()

  const toastStack = page.getByLabel('Accion reciente de biblioteca Notificaciones')
  await expect(toastStack).toContainText(/Enlace de Outer Wilds/)
  const gridTopWithToast = await page.getByTestId('library-grid').evaluate((grid) => grid.getBoundingClientRect().top + window.scrollY)
  expect(Math.abs(gridTopWithToast - gridTopBefore)).toBeLessThanOrEqual(4)

  await expect(toastStack).not.toBeVisible({ timeout: 4500 })
  const gridTopAfterToast = await page.getByTestId('library-grid').evaluate((grid) => grid.getBoundingClientRect().top + window.scrollY)
  expect(Math.abs(gridTopAfterToast - gridTopBefore)).toBeLessThanOrEqual(4)
})

test('library and weighted dice work in demo mode', async ({ page }) => {
  await openApp(page)
  await expect(page.getByTestId('library-masthead')).toContainText('Biblioteca')
  await expect(page.getByTestId('shell-pulse')).toContainText('Biblioteca')
  await expect(page.getByTestId('shell-pulse')).toContainText('Dado')
  await expect(page.getByTestId('shell-pulse')).toContainText('Explorador')
  await expect(page.getByTestId('shell-pulse')).toContainText('Admin')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-overview')).not.toBeVisible()
  await expect(page.getByTestId('launch-guide')).not.toBeVisible()
  await expect(page.getByTestId('library-review-queue')).not.toBeVisible()
  await openLibraryAdvanced(page)
  await expect(page.getByTestId('library-overview')).toContainText('Siguiente accion')
  await expect(page.getByTestId('library-overview')).toContainText('Inception')
  await expect(page.getByTestId('library-overview')).toContainText('Explorador')
  await expect(page.getByTestId('library-next-plan')).toContainText('Plan rapido')
  await expect(page.getByTestId('library-next-plan')).toContainText('Continuar sin perder contexto')
  await expect(page.getByTestId('library-next-plan')).toContainText('Importacion')
  await expect(page.getByRole('button', { name: 'Afinar ficha' })).toBeVisible()
  await expect(page.getByTestId('launch-guide')).toContainText('Plan de arranque')
  await expect(page.getByTestId('launch-guide')).toContainText('Estanteria base')
  await expect(page.getByTestId('launch-guide')).toContainText('Dado elige guardadas')
  await expect(page.getByTestId('launch-guide')).toContainText('Explorar encuentra nuevas')
  await expect(page.getByTestId('library-focus-shelf')).toContainText('Sugerencias')
  await expect(page.getByTestId('library-focus-shelf')).toContainText('1984 - George Orwell')
  await expect(page.getByRole('button', { name: 'Todo 7' })).toBeVisible()
  await expect(page.getByTestId('library-review-queue')).toContainText('Repaso guiado')
  await expect(page.getByTestId('library-review-queue')).toContainText('Dar contexto')
  await expect(page.getByTestId('library-review-queue')).toContainText('Probar dado')
  await page.getByTestId('library-review-queue').getByRole('button', { name: 'Ver cola' }).click()
  await expect(page.getByText('Vista de repaso: Dar contexto')).toBeVisible()
  await expect(page.getByText('Vista: Sin contexto')).toBeVisible()
  await page.getByRole('button', { name: 'Restablecer vista' }).click()
  await openLibraryAdvanced(page)
  await expect(page.getByTestId('library-smart-views')).toContainText('Listas para dado')
  await expect(page.getByTestId('library-smart-views')).toContainText('Sin contexto')
  await expect(page.getByTestId('library-smart-views')).toContainText('En cooldown')
  await page.getByTestId('library-smart-views').getByRole('button', { name: /Sin contexto/ }).click()
  await expect(page.getByText('Vista: Sin contexto')).toBeVisible()
  await expect(page.getByText('4 de 7 entradas')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Inception')
  await expect(page.getByTestId('library-grid')).not.toContainText('Outer Wilds')
  await page.getByRole('button', { name: 'Restablecer vista' }).click()
  await expect(page.getByTestId('library-shelf-header').getByLabel('Ordenar biblioteca')).toHaveValue('focus')
  await page.getByTestId('library-shelf-header').getByLabel('Ordenar biblioteca').selectOption('title')
  await expect(page.getByText('Orden: Titulo')).toBeVisible()
  await expect(page.locator('[data-testid="library-grid"] .item-card').first()).toContainText('1984 - George Orwell')
  await page.getByRole('button', { name: 'Restablecer vista' }).click()
  await expect(page.getByTestId('library-shelf-header').getByLabel('Ordenar biblioteca')).toHaveValue('focus')
  await expect(page.getByRole('button', { name: 'Lista', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tarjetas' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mosaico' })).toHaveCount(0)
  await expect(page.getByTestId('library-grid')).toHaveClass(/mosaic-view/)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.locator('.tab-button').filter({ hasText: 'Estanteria' }).click()
  await expect(page.getByTestId('library-grid')).toHaveClass(/mosaic-view/)
  await openLibraryAdvanced(page)
  await page.locator('details.library-advanced-panel').getByLabel('Buscar en biblioteca').fill('zzzz no match')
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await expect(page.getByText('0 de 7 entradas')).toBeVisible()
  await expect(page.getByTestId('library-focus-shelf')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear entrada zzzz no match' })).toBeVisible()
  await page.getByRole('button', { name: 'Quitar filtros' }).click()
  await expect(page.getByTestId('library-focus-shelf')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  const outerWildsCard = page.locator('.item-card').filter({ hasText: 'Outer Wilds' })
  await expect(outerWildsCard).toContainText('Juegos / 12-20h')
  await expect(outerWildsCard).toContainText('Pendiente')
  await expect(outerWildsCard.locator('.item-signal-strip, .tag-row')).toHaveCount(0)
  await expect(outerWildsCard).not.toContainText('Importacion')
  const quickEditor = await openManualEntryEditor(page)
  await quickEditor.getByLabel('Titulo').fill('Manual de prueba')
  await openEditorAdvanced(quickEditor)
  await expect(quickEditor.getByTestId('personal-readiness')).toContainText('Preparacion')
  await expect(quickEditor.getByTestId('personal-readiness')).toContainText('Ficha por afinar')
  await expect(quickEditor.getByLabel('Inicio rapido de entrada')).toContainText('Parte de una receta')
  await quickEditor.getByLabel('Medio de inicio rapido').selectOption('book')
  await expect(quickEditor.getByLabel('Tipo')).toHaveValue('book')
  await quickEditor.getByRole('button', { name: 'Aplicar plantilla Ideas grandes para Libros' }).evaluate((button) => {
    const templateButton = button as HTMLButtonElement
    templateButton.click()
  })
  await expect(quickEditor.getByLabel('Generos', { exact: true })).toHaveValue('Ciencia ficcion, Distopia, Filosofia')
  await expect(quickEditor.getByLabel('Tags', { exact: true })).toHaveValue('introspectivo, politico, premiado')
  await expect(quickEditor.getByRole('button', { name: 'denso', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(quickEditor.getByRole('button', { name: 'raro', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await quickEditor.getByLabel('Notas').fill('Entrada manual con contexto inicial.')
  await expect(quickEditor.getByTestId('personal-readiness')).toContainText('Ficha lista')
  await quickEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText('Manual de prueba guardada en Biblioteca')).toBeVisible()
  await expect(page.getByTestId('session-continuity')).toContainText('Continuar sesion')
  await expect(page.getByTestId('session-continuity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-continuity')).toContainText('Biblioteca')
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-activity')).toContainText('Manual de prueba')
  const activityDockMetrics = await page.getByTestId('session-activity').evaluate((panel) => {
    const rect = panel.getBoundingClientRect()
    const continuity = panel.querySelector('[data-testid="session-continuity"]') as HTMLElement | null
    const continueButton = continuity?.querySelector('button') as HTMLButtonElement | null

    return {
      buttonLabel: continueButton?.textContent?.trim() ?? '',
      height: rect.height,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      position: getComputedStyle(panel).position,
      viewportWidth: document.documentElement.clientWidth,
      width: rect.width,
    }
  })
  expect(activityDockMetrics.horizontalOverflow).toBe(false)
  expect(activityDockMetrics.buttonLabel).toBe('Abrir')
  if (activityDockMetrics.viewportWidth >= 760) {
    expect(activityDockMetrics.position).toBe('static')
    expect(activityDockMetrics.width).toBeGreaterThanOrEqual(620)
    expect(activityDockMetrics.height).toBeLessThanOrEqual(90)
  } else {
    expect(activityDockMetrics.position).toBe('static')
    expect(activityDockMetrics.height).toBeLessThanOrEqual(110)
  }
  await page.getByTestId('session-activity').getByRole('button', { name: 'Limpiar' }).click()
  await expect(page.getByLabel('Accion reciente de actividad')).toContainText(/actividad(?:es)? limpiada/i)
  await expect(page.getByTestId('session-activity')).not.toContainText('Manual de prueba')
  await page.getByRole('button', { name: 'Deshacer limpieza' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')
  await expect(page.getByTestId('session-activity')).toContainText('Manual de prueba')
  await expect(page.getByTestId('library-grid')).toContainText('Manual de prueba')
  await page.locator('.item-main').filter({ hasText: 'Outer Wilds' }).click()
  const outerWildsEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(outerWildsEditor).toBeVisible()
  await expectDialogAnimationsSettled(outerWildsEditor)
  await expect(outerWildsEditor.locator('#item-editor-title')).toHaveText('Outer Wilds')
  const editorShellMetrics = await outerWildsEditor.evaluate((editor) => {
    const heading = editor.querySelector('.panel-heading')?.getBoundingClientRect()
    const headingCopy = editor.querySelector('.panel-heading > div:first-child')?.getBoundingClientRect()
    const hero = editor.querySelector('.editor-hero')?.getBoundingClientRect()
    const progressPanel = editor.querySelector('.editor-progress-panel')?.getBoundingClientRect()
    const progressControls = Array.from(editor.querySelectorAll('.editor-progress-fields > *')).map((field) => field.getBoundingClientRect())
    const statusControl = editor.querySelector('.status-control')?.getBoundingClientRect()
    const notesField = editor.querySelector('.editor-notes-field textarea')?.getBoundingClientRect()
    const advancedPanel = editor.querySelector('.editor-advanced-panel')?.getBoundingClientRect()
    const statusButtons = Array.from(editor.querySelectorAll('.status-chip-button')).map((button) => {
      const rect = button.getBoundingClientRect()

      return {
        clipped: button.scrollWidth > button.clientWidth + 2,
        width: rect.width,
      }
    })
    const actionRow = editor.querySelector(':scope > .action-row.end')?.getBoundingClientRect()
    const actionRowElement = editor.querySelector(':scope > .action-row.end') as HTMLElement | null
    const editorStyle = getComputedStyle(editor)
    const backgroundColor = editorStyle.backgroundColor
    const backgroundAlphaMatch = backgroundColor.match(/rgba?\(([^)]+)\)/)
    const backgroundAlpha =
      backgroundAlphaMatch && backgroundAlphaMatch[1]
        ? Number(backgroundAlphaMatch[1].split(',').map((part) => part.trim())[3] ?? 1)
        : 1
    return {
      actionTop: actionRow?.top ?? 0,
      actionAfterAdvanced: Boolean(actionRow && advancedPanel && actionRow.top >= advancedPanel.bottom - 1),
      actionAfterNotes: Boolean(actionRow && notesField && actionRow.top >= notesField.bottom + 8),
      actionPosition: actionRowElement ? getComputedStyle(actionRowElement).position : '',
      backgroundAlpha,
      backgroundColor,
      editorAnimationName: editorStyle.animationName,
      editorOpacity: Number(editorStyle.opacity),
      headingHeight: heading?.height ?? 0,
      headingCopyVisible: Boolean(headingCopy && headingCopy.width > 0 && headingCopy.height > 0),
      heroHeight: hero?.height ?? 0,
      heroTop: hero?.top ?? 0,
      headingBottom: heading?.bottom ?? 0,
      progressControlTops: progressControls.map((field) => Math.round(field.top)),
      progressHeadingText: editor.querySelector('.editor-progress-heading')?.textContent?.trim() ?? '',
      progressPanelHeight: progressPanel?.height ?? 0,
      statusButtonCount: statusButtons.length,
      statusButtonClipped: statusButtons.some((button) => button.clipped),
      statusButtonMinWidth: Math.min(...statusButtons.map((button) => button.width)),
      statusControlWidth: statusControl?.width ?? 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }
  })
  expect(editorShellMetrics.backgroundAlpha).toBe(1)
  expect(editorShellMetrics.backgroundColor).not.toContain('rgba')
  expect(editorShellMetrics.editorOpacity).toBe(1)
  expect(editorShellMetrics.headingHeight).toBeLessThanOrEqual(60)
  expect(editorShellMetrics.headingCopyVisible).toBe(false)
  expect(editorShellMetrics.heroHeight).toBeGreaterThan(editorShellMetrics.headingHeight)
  expect(editorShellMetrics.heroHeight).toBeLessThanOrEqual(290)
  expect(editorShellMetrics.heroTop - editorShellMetrics.headingBottom).toBeLessThanOrEqual(32)
  expect(editorShellMetrics.progressHeadingText).toContain('Progreso')
  expect(editorShellMetrics.actionTop).toBeLessThanOrEqual(editorShellMetrics.viewportHeight)
  expect(editorShellMetrics.statusButtonCount).toBe(5)
  expect(editorShellMetrics.statusButtonClipped).toBe(false)
  if (editorShellMetrics.viewportWidth >= 760) {
    expect(editorShellMetrics.progressPanelHeight).toBeLessThanOrEqual(340)
    expect(editorShellMetrics.statusControlWidth).toBeGreaterThanOrEqual(420)
    expect(editorShellMetrics.statusButtonMinWidth).toBeGreaterThanOrEqual(72)
    expect(new Set(editorShellMetrics.progressControlTops).size).toBe(1)
  } else {
    expect(editorShellMetrics.editorAnimationName).toContain('modal-enter-solid')
    expect(editorShellMetrics.actionPosition).toBe('static')
    expect(editorShellMetrics.actionAfterAdvanced).toBe(true)
    expect(editorShellMetrics.actionAfterNotes).toBe(true)
    expect(editorShellMetrics.progressPanelHeight).toBeLessThanOrEqual(380)
    expect(editorShellMetrics.statusButtonMinWidth).toBeGreaterThanOrEqual(54)
    expect(new Set(editorShellMetrics.progressControlTops).size).toBe(2)
  }
  await expect(outerWildsEditor.locator('.editor-personal-strip')).toHaveCount(0)
  await openEditorAdvanced(outerWildsEditor)
  await expect(outerWildsEditor.getByLabel('Titulo')).toHaveValue('Outer Wilds')
  await expect(page.getByTestId('personal-readiness')).toContainText('Preparacion')
  await expect(page.getByLabel('Prioridad')).toBeVisible()
  await expect(page.getByLabel('Sorpresa')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Progreso' }).fill('Cambio temporal guardado al cerrar.')
  await page.mouse.click(8, 8)
  await expect(page.getByRole('dialog', { name: 'Entrada' })).not.toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Outer Wilds guardada en Biblioteca' })).toBeVisible()
  await page.locator('.item-main').filter({ hasText: 'Outer Wilds' }).click()
  const savedOuterWildsEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(savedOuterWildsEditor.getByRole('textbox', { name: 'Progreso' })).toHaveValue('Cambio temporal guardado al cerrar.')
  await expect(savedOuterWildsEditor.getByRole('button', { name: 'Eliminar entrada' })).toBeVisible()
  await savedOuterWildsEditor.getByRole('button', { name: 'Eliminar entrada' }).click()
  await expect(savedOuterWildsEditor.getByLabel('Confirmar borrado de entrada')).toContainText('Outer Wilds')
  await savedOuterWildsEditor.getByRole('button', { name: 'Mantener' }).click()
  await expect(savedOuterWildsEditor.getByLabel('Confirmar borrado de entrada')).not.toBeVisible()
  await savedOuterWildsEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
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
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Listo para tirar')
  await expect(page.getByTestId('dice-readiness')).toContainText('Candidatas')
  await expect(page.getByTestId('dice-readiness')).toContainText('Ajustes')
  await expect(page.getByRole('heading', { name: 'Candidatas guardadas' })).toBeVisible()
  await expect(page.getByTestId('dice-candidate-list')).toContainText('#1')
  await expect(page.getByTestId('dice-candidate-list')).toContainText('Encaje')
  await page.getByText('Por que pueden salir').click()
  await expect(page.getByRole('button', { name: 'Ver 1 mas' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver 1 mas' }).click()
  await expect(page.getByRole('button', { name: 'Ver menos candidatas' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Elegibilidad' })).toBeVisible()
  await expect(page.getByText(/pueden salir ahora/)).toBeVisible()
  await expect(page.getByText('Pausados fuera')).toBeVisible()
  await expect(page.locator('details.dice-settings-panel')).not.toHaveAttribute('open', '')
  await expect(page.locator('details.dice-settings-panel > summary')).toContainText('Afinar tirada')
  await expect(page.locator('details.dice-settings-panel > summary')).toContainText('candidatas')
  await openDiceTuning(page)
  await page.getByLabel('Medio').selectOption('manhwa')
  await expect(page.getByTestId('dice-readiness')).toContainText('Sin tirada posible')
  await expect(page.getByTestId('dice-recovery')).toContainText('Abrir abanico')
  await expect(page.getByTestId('dice-recovery')).toContainText('Quitar tiempo')
  await expect(page.getByTestId('dice-recovery')).toContainText('Sorpresa amplia')
  await page.getByTestId('dice-recovery').getByRole('button', { name: /Abrir abanico/ }).click()
  await expect(page.getByLabel('Medio')).toHaveValue('any')
  await expect(page.getByLabel('Incluir pausados')).toBeChecked()
  await expect(page.getByTestId('dice-readiness')).toContainText('Listo para tirar')
  await openDiceTuning(page)
  await page.getByRole('button', { name: 'Aplicar preset Noche ligera' }).click()
  await expect(page.getByLabel('Energia')).toHaveValue('low')
  await expect(page.getByLabel('Porcentaje de sorpresa')).toHaveValue('15')
  await expect(page.getByTestId('dice-readiness')).toContainText('!')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await openDiceTuning(page)
  await page.getByLabel('Energia').selectOption('high')
  await openDiceTuning(page)
  await page.getByLabel('Incluir pausados').check()
  await expect(page.getByTestId('dice-readiness').getByText('Incluye pausados')).toBeVisible()
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await expect(page.locator('details.dice-settings-panel > summary')).toContainText('Pendiente')
  await openDiceTuning(page)
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar ajustes' }).click()
  await expect(page.getByText('Ajustes del dado guardados')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Preferencias guardadas')
  await expect(page.getByRole('button', { name: 'Deshacer ajustes del dado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer ajustes del dado' }).click()
  await expect(page.getByText('Ajustes del dado recuperados')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Preferencias recuperadas')
  await openDiceTuning(page)
  await expect(page.getByLabel('Energia')).toHaveValue('medium')
  await expect(page.getByLabel('Porcentaje de sorpresa')).toHaveValue('30')
  await expect(page.getByLabel('Incluir pausados')).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Ajustes guardados' })).toBeDisabled()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Encaje')
  await expect(page.getByTestId('recommendation-result')).toContainText('Modo')
  await expect(page.getByTestId('recommendation-result')).not.toContainText('Roll')
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
  await diceEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText(/afinada desde el dado\./)).toBeVisible()
  await expect(page.getByTestId('recent-rolls')).toContainText('Ahora mismo')
  await page.getByTestId('recent-rolls').getByRole('button', { name: /Afinar tirada reciente/ }).click()
  const recentEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(recentEditor.getByLabel('Notas')).toHaveValue('Afinada desde el dado.')
  await recentEditor.getByRole('textbox', { name: 'Progreso' }).fill('Revisada desde historial.')
  await recentEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
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
  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await expect(page.getByRole('menuitem', { name: 'Reactivar dado Outer Wilds' })).toBeVisible()

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
  await page.getByLabel('Medio').selectOption('game')
  await openDiceTuning(page)
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
  await expect(outerWildsCard).toContainText('En progreso')
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
  await openLibraryAdvanced(page)
  const diceQueue = page.getByTestId('library-review-queue').locator('.library-review-card', { hasText: 'Probar dado' })

  await expect(diceQueue).toContainText('Candidatas vivas')
  await diceQueue.getByRole('button', { name: 'Tirar dado' }).click()

  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await expect(page.getByTestId('session-activity')).toContainText('Tirada registrada')
})

test('library review session keeps guided queues actionable', async ({ page }) => {
  await openApp(page)
  await openLibraryAdvanced(page)
  await page.getByTestId('library-review-queue').getByRole('button', { name: 'Completar ficha' }).click()
  await expect(page.getByTestId('library-review-session')).toContainText('Repaso activo')
  await expect(page.getByTestId('library-review-session')).toContainText('Dar contexto')
  await expect(page.getByTestId('library-review-session')).toContainText('Siguiente:')
  await expect(page.getByLabel('Proximas entradas del repaso')).toContainText('Inception')
  await expect(page.getByRole('dialog', { name: 'Entrada' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await openLibraryAdvanced(page)
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
  await openLibraryAdvanced(page)
  await page.getByRole('button', { name: 'Borrar todo' }).click()
  await page.getByLabel('Confirmacion').fill('BORRAR')
  await page.getByRole('button', { name: 'Borrar todo' }).last().click()
  await expect(page.getByText('Tu biblioteca ha sido borrada')).toBeVisible()

  const draftEditor = await openManualEntryEditor(page)
  await draftEditor.getByLabel('Titulo').fill('Repaso Final')
  await openEditorAdvanced(draftEditor)
  await draftEditor.getByLabel('Generos', { exact: true }).fill('Drama')
  await draftEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText('Repaso Final guardada en Biblioteca')).toBeVisible()

  await openLibraryAdvanced(page)
  await page.getByTestId('library-review-queue').getByRole('button', { name: 'Completar ficha' }).click()
  const reviewEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(reviewEditor.locator('#item-editor-title')).toHaveText('Repaso Final')
  await reviewEditor.getByLabel('Notas').fill('Contexto suficiente para cerrar este repaso.')
  await reviewEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await openLibraryAdvanced(page)
  const completedReview = page.getByTestId('library-review-complete')
  await expect(completedReview).toContainText('Repaso completado')
  await expect(completedReview).toContainText('Dar contexto')
  await expect(completedReview.getByLabel('Pendientes en repaso')).toContainText('0')
  await completedReview.getByRole('button', { name: 'Cerrar' }).click()
  await expect(completedReview).not.toBeVisible()
})

test('mobile layout keeps the core controls reachable', async ({ page }) => {
  await openApp(page)
  await expect(page.getByTestId('library-overview')).not.toBeVisible()
  await expect(page.getByLabel('Buscar obra para guardar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explorador', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tirar dado ponderado' })).toBeVisible()
})

test('library empty search can create a prefilled item', async ({ page }) => {
  await openApp(page)
  await fillLibraryTextSearch(page, 'Manual sombra')
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await page.getByRole('button', { name: 'Crear entrada Manual sombra' }).click()

  const searchDraftEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(searchDraftEditor.getByLabel('Titulo')).toHaveValue('Manual sombra')
  await searchDraftEditor.getByLabel('Notas').fill('Creada desde una busqueda vacia.')
  await searchDraftEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await expect(page.getByText('Manual sombra guardada en Biblioteca')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Manual sombra')
})

test('library can update selected visible items in bulk', async ({ page }) => {
  await openApp(page)
  await openLibraryAdvanced(page)
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('Seleccion rapida')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 visibles en esta vista')
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 seleccionadas')
  await page.getByRole('button', { name: 'Quitar visibles' }).click()
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('Seleccion rapida')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('7 visibles en esta vista')
  await expect(page.getByLabel('Seleccion de biblioteca')).not.toContainText('seleccionadas')

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')

  const selectionBar = page.getByLabel('Seleccion de biblioteca')
  await expect(selectionBar).toContainText('2 seleccionadas')
  await fillLibraryTextSearch(page, 'zzzz no match')
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await expect(selectionBar).toContainText('2 seleccionadas')
  await expect(selectionBar.getByRole('button', { name: 'Seleccionar visibles' })).toBeDisabled()
  await fillLibraryTextSearch(page, '')
  await selectionBar.getByLabel('Tags para seleccion').fill('lote qa')
  await selectionBar.getByRole('button', { name: 'Añadir tags' }).click()
  await expect(page.getByText('2 entradas etiquetadas con lote qa')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Tags masivos actualizados')
  await fillLibraryTextSearch(page, 'lote qa')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await selectionBar.getByLabel('Tags para seleccion').fill('lote qa')
  await selectionBar.getByRole('button', { name: 'Quitar tags' }).click()
  await expect(page.getByText('2 entradas actualizadas sin lote qa')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer tags' }).click()
  await expect(page.getByText('2 tags recuperados')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await openLibraryAdvanced(page)
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await selectionBar.getByLabel('Tags para seleccion').fill('lote qa')
  await selectionBar.getByRole('button', { name: 'Quitar tags' }).click()
  await expect(page.getByText('2 entradas actualizadas sin lote qa')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await fillLibraryTextSearch(page, '')

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await expect(selectionBar).toContainText('2 seleccionadas')
  await selectionBar.getByLabel('Tipo de senal para seleccion').selectOption('genre')
  await selectionBar.getByLabel('Generos para seleccion').fill('manual genero')
  await selectionBar.getByRole('button', { name: 'Añadir generos' }).click()
  await expect(page.getByText('2 entradas actualizadas con manual genero')).toBeVisible()
  await fillLibraryTextSearch(page, 'manual genero')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer generos' }).click()
  await expect(page.getByText('2 generos recuperados')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await fillLibraryTextSearch(page, '')

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await expect(selectionBar).toContainText('2 seleccionadas')
  await selectionBar.getByLabel('Tipo de senal para seleccion').selectOption('mood')
  await selectionBar.getByLabel('Mood tags para seleccion').fill('manual mood')
  await selectionBar.getByRole('button', { name: 'Añadir mood tags' }).click()
  await expect(page.getByText('2 entradas actualizadas con manual mood')).toBeVisible()
  await fillLibraryTextSearch(page, 'manual mood')
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer mood tags' }).click()
  await expect(page.getByText('2 mood tags recuperados')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sin resultados' })).toBeVisible()
  await fillLibraryTextSearch(page, '')

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await selectionBar.getByLabel('Foco para seleccion').selectOption('high')
  await selectionBar.getByRole('button', { name: 'Aplicar foco' }).click()
  await expect(page.getByText('2 entradas ahora tienen Foco alto')).toBeVisible()
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer foco' }).click()
  await expect(page.getByText('2 focos recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).not.toContainText('Alta prioridad')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).not.toContainText('Alta prioridad')

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await selectionBar.getByRole('button', { name: 'Enfriar dado' }).click()
  await expect(page.getByText('2 entradas enfriadas para el dado')).toBeVisible()
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer dado' }).click()
  await expect(page.getByText('Dado deshecho: 2 reactivadas')).toBeVisible()

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await selectionBar.getByRole('button', { name: 'Enfriar dado' }).click()
  await expect(page.getByText('2 entradas enfriadas para el dado')).toBeVisible()
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await selectionBar.getByRole('button', { name: 'Reactivar dado' }).click()
  await expect(page.getByText('2 entradas reactivadas para el dado')).toBeVisible()
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer dado' }).click()
  await expect(page.getByText('Dado deshecho: 2 cooldowns recuperados')).toBeVisible()
})

test('library can export the current selection without private settings', async ({ page }) => {
  await openApp(page)
  await openLibraryAdvanced(page)
  const fullDownloadPromise = page.waitForEvent('download')
  await page.getByLabel('Herramientas de biblioteca').getByRole('button', { name: 'Exportar' }).click()
  const fullDownload = await fullDownloadPromise
  expect(fullDownload.suggestedFilename()).toMatch(/^nexo-export-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(page.getByRole('status').filter({ hasText: 'Backup JSON descargado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Backup privado exportado')

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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
  await page.getByTestId('library-shelf-header').getByLabel('Filtrar por tipo').selectOption('game')
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
  await openDiceTuning(page)
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

  await expectLibrarySurface(page)
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
  await selectLibraryItems(page, 'Outer Wilds')

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
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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
  await selectLibraryItems(page, 'Inception')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('1 seleccionada')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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

  await expectLibrarySurface(page)
  await expect(page.getByText('1 entrada ahora es Pendiente')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Inception' })).toContainText('Pendiente')
})

test('quick search updates dice cooldowns for the current library selection', async ({ page }) => {
  await openApp(page)
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion enfriada')

  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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
  await expect(page.getByTestId('session-activity')).toContainText('Seleccion reactivada')

  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer dado' }).click()
  await expect(page.getByText('Dado deshecho: 2 cooldowns recuperados')).toBeVisible()
})

test('quick search updates focus for the current library selection', async ({ page }) => {
  await openApp(page)
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
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
  await expect(page.getByTestId('session-activity')).toContainText('Foco masivo actualizado')

  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer foco' }).click()
  await expect(page.getByText('2 focos recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Outer Wilds' })).not.toContainText('Alta prioridad')
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).not.toContainText('Alta prioridad')

  await selectLibraryItems(page, 'Outer Wilds')
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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

  await expectLibrarySurface(page)
  await expect(page.getByText('1 entrada ahora tiene Foco bajo')).toBeVisible()
})

test('quick search adds known taxonomy signals to the current library selection', async ({ page }) => {
  await openApp(page)
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('seleccion tag sci-fi')
  const tagSelectionAction = quickSearch.getByRole('button', { name: 'Ejecutar Seleccion: tag sci-fi', exact: true })
  await expect(tagSelectionAction).toHaveAttribute('aria-current', 'true')
  await tagSelectionAction.click()

  await expect(page.getByText('1 entradas etiquetadas con sci-fi')).toBeVisible()
  await fillLibraryTextSearch(page, 'sci-fi')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')

  await selectLibraryItems(page, 'Vinland Saga')
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const removeQuickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await removeQuickSearch.getByLabel('Buscar en Nexo').fill('seleccion quitar tag sci-fi')
  const removeTagSelectionAction = removeQuickSearch.getByRole('button', { name: 'Ejecutar Seleccion: quitar tag sci-fi', exact: true })
  await expect(removeTagSelectionAction).toHaveAttribute('aria-current', 'true')
  await removeTagSelectionAction.click()

  await expect(page.getByText('1 entradas actualizadas sin sci-fi')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toHaveCount(0)

  await fillLibraryTextSearch(page, '')
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const genreQuickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await genreQuickSearch.getByLabel('Buscar en Nexo').fill('seleccion genero misterio')
  const genreSelectionAction = genreQuickSearch.getByRole('button', { name: 'Ejecutar Seleccion: genero misterio', exact: true })
  await expect(genreSelectionAction).toHaveAttribute('aria-current', 'true')
  await genreSelectionAction.click()

  await expect(page.getByText('1 entradas actualizadas con misterio')).toBeVisible()
  await fillLibraryTextSearch(page, 'misterio')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer generos' }).click()
  await expect(page.getByText('1 generos recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toHaveCount(0)

  await fillLibraryTextSearch(page, '')
  await selectLibraryItems(page, 'Outer Wilds', 'Vinland Saga')
  await expect(page.getByLabel('Seleccion de biblioteca')).toContainText('2 seleccionadas')

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const moodQuickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await moodQuickSearch.getByLabel('Buscar en Nexo').fill('seleccion mood intenso')
  const moodSelectionAction = moodQuickSearch.getByRole('button', { name: 'Ejecutar Seleccion: mood intenso', exact: true })
  await expect(moodSelectionAction).toHaveAttribute('aria-current', 'true')
  await moodSelectionAction.click()

  await expect(page.getByText('2 entradas actualizadas con intenso')).toBeVisible()
  await fillLibraryTextSearch(page, 'intenso')
  await expect(page.getByTestId('library-grid')).toContainText('Vinland Saga')
  await page.getByLabel('Accion reciente de biblioteca').getByRole('button', { name: 'Deshacer mood tags' }).click()
  await expect(page.getByText('2 mood tags recuperados')).toBeVisible()
  await expect(page.locator('.item-card', { hasText: 'Vinland Saga' })).toHaveCount(0)
})

test('quick search opens library items through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await openDiceTuning(page)
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
  await expect(page.getByRole('dialog', { name: 'Entrada' }).locator('#item-editor-title')).toHaveText('Outer Wilds')
})

test('quick search opens the active result from the keyboard', async ({ page }) => {
  await openApp(page)
  await expectLibrarySurface(page)
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
  await expect(page.getByRole('dialog', { name: 'Entrada' }).locator('#item-editor-title')).toHaveText('Outer Wilds')
})

test('quick search keyboard shortcuts avoid normal text entry', async ({ page }) => {
  await openApp(page)
  await expectLibrarySurface(page)

  const quickSearchButton = page.getByRole('button', { name: 'Busqueda rapida' })
  await quickSearchButton.click()
  let quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await expect(quickSearch).toBeVisible()
  await expect(quickSearch.getByLabel('Buscar en Nexo')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Abrir en Nexo' })).not.toBeVisible()
  await expect(quickSearchButton).toBeFocused()

  const librarySearch = page.getByLabel('Buscar obra para guardar')
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
  await expectLibrarySurface(page)

  let privateEditor = await openManualEntryEditor(page)
  await expect(privateEditor).toBeVisible()
  await expect(privateEditor.getByLabel('Titulo')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Entrada' })).not.toBeVisible()

  privateEditor = await openManualEntryEditor(page)
  await expect(privateEditor.getByLabel('Titulo')).toBeFocused()
  await privateEditor.getByLabel('Titulo').fill('Borrador con Escape')
  await privateEditor.getByRole('button', { name: 'Cerrar', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expectFocusWithin(privateEditor)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Entrada' })).not.toBeVisible()
  await expect(page.getByText('Borrador con Escape guardada en Biblioteca')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Borrador con Escape')

  await page.getByRole('button', { name: 'Mas acciones Outer Wilds' }).click()
  await page.getByRole('menuitem', { name: 'Borrar Outer Wilds' }).click()
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Borrar entrada' })).not.toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')

  await page.getByRole('button', { name: 'Curacion' }).click()
  await openCurationTools(page)
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
  await expect(page.getByRole('button', { name: 'Curacion' })).toBeVisible()
  await expect(page.getByText('Herramientas de catalogo')).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
})

test('quick search reviews dice instead of rolling when no candidates exist', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await expect(page.getByTestId('dice-readiness')).toContainText('Sin tirada posible')
  await expect(page.getByTestId('recommendation-result')).toHaveCount(0)
})

test('quick search can save pending dice preferences', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.locator('details.dice-settings-panel')).not.toHaveAttribute('open', '')
  await expect(page.locator('details.dice-settings-panel > summary')).toContainText('Afinar tirada')
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
  await expect(page.locator('.topbar-actions').getByRole('button', { name: /Elegir tema/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tema Rosa', exact: true })).toHaveClass(/active/)

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

test('settings theme controls stay in sync without a topbar theme menu', async ({ page }) => {
  await openApp(page)
  await expect(page.locator('.topbar-actions').getByRole('button', { name: /Elegir tema/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: 'Tema Rosa', exact: true }).click()

  const roseThemeButton = page.getByRole('button', { name: 'Tema Rosa', exact: true })
  await expect(roseThemeButton).toHaveClass(/active/)
  await expect(roseThemeButton.locator('.theme-option-status')).toContainText('Actual')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fff5f8')
  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Salida con cambios pendientes')).not.toBeVisible()

  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expectLibrarySurface(page)
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
  await openDiceTuning(page)
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

  await expectLibrarySurface(page)
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
  await openDiceTuning(page)
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

test('quick search keeps library on the single mosaic layout', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  const searchInput = quickSearch.getByLabel('Buscar en Nexo')

  for (const query of ['vista lista', 'vista tarjetas', 'vista mosaico']) {
    await searchInput.fill(query)
    await expect(quickSearch.getByRole('button', { name: 'Ejecutar Vista Lista', exact: true })).toHaveCount(0)
    await expect(quickSearch.getByRole('button', { name: 'Ejecutar Vista Tarjetas', exact: true })).toHaveCount(0)
    await expect(quickSearch.getByRole('button', { name: 'Ejecutar Vista Mosaico', exact: true })).toHaveCount(0)
  }

  await page.keyboard.press('Escape')
  await expectLibrarySurface(page)
  await expect(page.getByRole('button', { name: 'Lista', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tarjetas' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mosaico' })).toHaveCount(0)
  await expect(page.getByTestId('library-grid')).toHaveClass(/mosaic-view/)
})

test('quick search changes library sort through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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

  await expectLibrarySurface(page)
  await expect(page.getByTestId('library-shelf-header').getByLabel('Ordenar biblioteca')).toHaveValue('title')
  await expect(page.getByText('Orden: Titulo')).toBeVisible()
  await expect(page.locator('[data-testid="library-grid"] .item-card').first()).toContainText('1984 - George Orwell')
  await expect(page.getByRole('status').filter({ hasText: 'Orden Titulo aplicado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Orden de biblioteca aplicado')
})

test('quick search applies library filters through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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

  await expectLibrarySurface(page)
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

  await expect(page.getByTestId('library-shelf-header').getByLabel('Filtrar por tipo')).toHaveValue('game')
  await expect(page.getByText('Tipo: Juegos')).toBeVisible()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
  await expect(page.getByTestId('library-grid')).not.toContainText('Inception')
  await expect(page.getByRole('status').filter({ hasText: 'Tipo Juegos aplicado' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Filtro de tipo aplicado')
})

test('quick search resets the library view through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('library-shelf-header').getByLabel('Filtrar por tipo').selectOption('game')
  await page.getByTestId('library-shelf-header').getByLabel('Ordenar biblioteca').selectOption('title')
  await expect(page.getByText('Tipo: Juegos')).toBeVisible()
  await expect(page.getByText('Orden: Titulo')).toBeVisible()

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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

  await expectLibrarySurface(page)
  await expect(page.getByTestId('library-shelf-header').getByLabel('Filtrar por tipo')).toHaveValue('all')
  await expect(page.getByTestId('library-shelf-header').getByLabel('Ordenar biblioteca')).toHaveValue('focus')
  await expect(page.getByText('Tipo: Juegos')).not.toBeVisible()
  await expect(page.getByText('Orden: Titulo')).not.toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Vista de Biblioteca restablecida' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Vista de biblioteca restablecida')
})

test('quick search starts guided library review through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.getByRole('dialog', { name: 'Entrada' }).locator('#item-editor-title')).toHaveText('Inception')
})

test('quick search can start a specific guided review queue', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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

  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await expect(page.getByTestId('session-activity')).toContainText('Tirada registrada')
})

test('quick search applies the next library action through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await openDiceTuning(page)
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
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
})

test('quick search can start an explorer search through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await mockEmptyAnimeMangaProviders(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
  await openExplorerTools(page)
  await expect(page.getByLabel('Buscar en explorador')).toHaveValue('Odisea')
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Odisea')
})

test('quick search can add an explorer hint card through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByRole('button', { name: 'Busqueda rapida' }).click()
  const quickSearch = page.getByRole('dialog', { name: 'Abrir en Nexo' })
  await quickSearch.getByLabel('Buscar en Nexo').fill('recomendar estanteria')
  const recommendationAction = quickSearch.getByRole('button', { name: 'Ejecutar Recomendar desde mi estanteria' })
  await expect(recommendationAction).toHaveAttribute('aria-current', 'true')
  await recommendationAction.click()

  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()

  await expect(page).toHaveURL(/tab=explorer/)
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
  await openExplorerTools(page)
  await expect(page.getByLabel('Buscar en explorador')).toHaveValue('Outer Wilds')
  await expect(page.getByRole('status').filter({ hasText: 'hallazgos enviados a la cola' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Outer Wilds')
})

test('quick search can reopen explorer candidates through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('En cola')
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('Guardar en Biblioteca')
})

test('quick search can open the next explorer candidate through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await openExplorerTools(page)
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer guardado' })).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Odisea')
})

test('quick search can save a filtered explorer view through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Odisea')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Odisea')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await openDiceTuning(page)
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
  await createdEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText('Manual global guardada en Biblioteca')).toBeVisible()
})

test('activity entries navigate through the pending-change guard', async ({ page }) => {
  await openApp(page)
  const editor = await openManualEntryEditor(page)
  await editor.getByLabel('Titulo').fill('Actividad navegable')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await openDiceTuning(page)
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()

  await page.getByTestId('session-continuity').getByRole('button', { name: 'Continuar desde Ficha guardada en Biblioteca' }).click()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()

  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expectLibrarySurface(page)
  await expect(page).toHaveURL(/item=movie-actividad-navegable/)
  const focusedEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(focusedEditor.locator('#item-editor-title')).toHaveText('Actividad navegable')
})

test('quick search resumes recent activity through the pending-change guard', async ({ page }) => {
  await openApp(page)
  const editor = await openManualEntryEditor(page)
  await editor.getByLabel('Titulo').fill('Actividad paleta')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha guardada')

  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await openDiceTuning(page)
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
  await expect(page.getByRole('dialog', { name: 'Entrada' }).locator('#item-editor-title')).toHaveText('Actividad paleta')
})

test('quick search can clear and restore recent activity', async ({ page }) => {
  await openApp(page)
  const editor = await openManualEntryEditor(page)
  await editor.getByLabel('Titulo').fill('Actividad limpiable')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()
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
  await openDiceTuning(page)
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
  await page.locator('.settings-taste-panel summary').click()
  await expect(page.getByLabel('Generos favoritos')).toHaveValue('sci-fi')
  await expect(page.getByLabel('Tags favoritos')).toHaveValue('pelicula, sci-fi')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
})

test('quick search can repair private taxonomy through the pending-change guard', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await openSettingsDrawer(page, 'settings-private-data-drawer')
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
  await openDiceTuning(page)
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
  await openSettingsDrawer(page, 'settings-private-data-drawer')
  await expect(page.getByTestId('private-data-health')).toContainText('8/8')
  await expect(page.getByRole('button', { name: 'Deshacer taxonomia' })).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Taxonomia privada completada')
})

test('library item deep links open and close the focused editor', async ({ page }) => {
  await page.goto('/?item=game-outer-wilds')
  const editor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(editor.locator('#item-editor-title')).toHaveText('Outer Wilds')
  await expect(page).toHaveURL(/item=game-outer-wilds/)
  await editor.getByRole('button', { name: 'Copiar enlace a Outer Wilds' }).click()
  await expect(editor.getByLabel('Enlace de ficha')).toHaveValue(/item=game-outer-wilds/)

  await editor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Entrada' })).not.toBeVisible()
  await expect(page).not.toHaveURL(/item=game-outer-wilds/)

  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Entrada' }).locator('#item-editor-title')).toHaveText('Outer Wilds')
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
  const recommendedTitle = (await diceEditor.locator('#item-editor-title').textContent()) ?? ''
  await diceEditor.getByRole('textbox', { name: 'Progreso' }).fill('Vuelta desde actividad del dado.')
  await diceEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha afinada')

  await page
    .getByTestId('session-activity')
    .getByRole('button', { name: 'Abrir Ficha afinada en Biblioteca' })
    .click()
  await expect(page).toHaveURL(/item=/)
  await expect(page.getByRole('dialog', { name: 'Entrada' }).locator('#item-editor-title')).toHaveText(recommendedTitle)
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

  await expect(page.locator('.topbar-actions').getByRole('button', { name: /Elegir tema/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  const themeStage = page.getByTestId('settings-theme-stage')
  await expect(themeStage).toBeVisible()
  await expect(themeStage.locator('.theme-option')).toHaveCount(7)
  const themeStageBox = await themeStage.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportWidth: window.innerWidth,
    }
  })
  expect(themeStageBox.left).toBeGreaterThanOrEqual(-1)
  expect(themeStageBox.right).toBeLessThanOrEqual(themeStageBox.viewportWidth + 1)
  expect(themeStageBox.top).toBeGreaterThanOrEqual(-1)
  await themeStage.getByRole('button', { name: 'Tema Claro' }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8faf9')
  await themeStage.getByRole('button', { name: 'Tema Rosa' }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fff5f8')
  await themeStage.getByRole('button', { name: 'Tema Aurora' }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101113')

  await page.goto('/?tab=dice')
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page).toHaveURL(/tab=explorer/)
  await page.goBack()
  await expect(page).toHaveURL(/tab=dice/)
  await expect(page.getByRole('heading', { name: 'Que sigo ahora?' })).toBeVisible()
})

test('browser history asks before leaving pending dice preferences', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page).toHaveURL(/tab=explorer/)
  await page.goBack()
  await expect(page).toHaveURL(/tab=dice/)
  await openDiceTuning(page)
  await page.getByLabel('Energia').selectOption('high')
  await expect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Salida con cambios pendientes')).toContainText('Cambios pendientes en Dado')
  await expect(page).toHaveURL(/tab=dice/)
  await page.getByLabel('Salida con cambios pendientes').getByRole('button', { name: 'Descartar cambios' }).click()
  await expectLibrarySurface(page)
  await expect(page).not.toHaveURL(/tab=dice/)
})

test('settings show pending changes before saving preferences', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Guardado', exact: true })).toBeDisabled()
  await expect(page.getByTestId('settings-roles-drawer')).toBeVisible()
  await expect(page.getByTestId('settings-private-data-drawer')).toBeVisible()
  await expect(page.getByTestId('settings-beta-drawer')).toBeVisible()
  await expect(page.getByTestId('settings-roles-drawer')).not.toHaveAttribute('open', '')
  await expect(page.getByTestId('settings-private-data-drawer')).not.toHaveAttribute('open', '')
  await expect(page.getByRole('heading', { name: 'Roles' })).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Datos privados' })).not.toBeVisible()
  await openSettingsDrawer(page, 'settings-roles-drawer')
  await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
  await expect(page.getByLabel('Resumen de roles')).toContainText('Admin')
  await expect(page.getByLabel('Permisos de roles')).toContainText('Cambiar roles')
  await expect(page.getByLabel('Permisos de roles')).toContainText('Curar catalogo')
  await expect(page.getByTestId('settings-confidence')).toContainText('Cuenta lista')
  await expect(page.getByTestId('settings-confidence')).toContainText('Admin')
  await expect(page.getByTestId('settings-confidence')).toContainText('Entradas')
  await openSettingsDrawer(page, 'settings-private-data-drawer')
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
  await page.locator('.settings-taste-panel summary').click()
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
  await openSettingsDrawer(page, 'settings-private-data-drawer')
  await page.getByTestId('private-action-plan').getByRole('button', { name: /Tirar dado/ }).click()
  await expect(page).toHaveURL(/tab=dice/)
  await expect(page.getByTestId('recommendation-result')).toContainText('Decision')
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await openSettingsDrawer(page, 'settings-private-data-drawer')
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
  await openSettingsDrawer(page, 'settings-roles-drawer')
  await expect(page.getByLabel('Rol de Usuario demo')).toHaveValue('user')
  await page.getByLabel('Rol de Usuario demo').selectOption('admin')
  await expect(page.getByLabel('Cambio de rol preparado')).toContainText('Usuario demo')
  await expect(page.getByLabel('Cambio de rol preparado')).toContainText('Usuario -> Admin')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByLabel('Cambio de rol preparado')).not.toBeVisible()
  await expect(page.getByLabel('Rol de Usuario demo')).toHaveValue('user')
  await openSettingsDrawer(page, 'settings-roles-drawer')
  await page.getByLabel('Rol de Usuario demo').selectOption('moderator')
  await expect(page.getByLabel('Cambio de rol preparado')).toContainText('Usuario -> Moderador')
  await page.getByRole('button', { name: 'Aplicar rol' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Rol actualizado')
  await openSettingsDrawer(page, 'settings-roles-drawer')
  await expect(page.getByRole('button', { name: 'Deshacer rol' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer rol' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Rol recuperado')
  await expect(page.getByLabel('Rol de Usuario demo')).toHaveValue('user')
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
  await expectLibrarySurface(page)
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
  await openSettingsDrawer(page, 'settings-private-data-drawer')
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
  await openSettingsDrawer(page, 'settings-private-data-drawer')
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
  await openSettingsDrawer(page, 'settings-private-data-drawer')
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
  await openSettingsDrawer(page, 'settings-private-data-drawer')
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
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
  await expect(page.getByLabel('Tipo para descubrir')).toBeVisible()
  await expect(page.getByLabel('Duracion para descubrir')).toBeVisible()
  await expect(page.getByLabel('Buscar en explorador')).not.toBeVisible()
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('game')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByLabel('Tipo por defecto')).toHaveValue('game')
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerTools(page)
  await expect(page.getByLabel('Tipo de busqueda en explorador')).toHaveValue('game')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('session-activity')).toContainText('Busqueda en cola')

  await openExplorerFilters(page)
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Explorar')
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
  await expect(odiseaSpotlight).toContainText('Resultado listo')
  await expect(odiseaSpotlight).toContainText('Encontrado fuera de Nexo')
  await expect(odiseaSpotlight).toContainText('Guardar o pasar a catalogo')
  await expect(odiseaSpotlight.getByLabel('Decidir Odisea')).toContainText('Guardar')
  await odiseaSpotlight.getByRole('button', { name: 'Descartar Odisea' }).click()
  await openExplorerFilters(page)
  await page.getByRole('tab', { name: /Descartados 1/ }).click()
  await expect(page.getByText('Apartado de tus pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Recuperar Odisea' }).click()
  await openExplorerFilters(page)
  await expect(page.getByRole('tab', { name: /En cola 1/ })).toBeVisible()
  await page.getByTestId('candidate-spotlight').getByRole('button', { name: 'Abrir ficha Odisea' }).click()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).toContainText('En cola')
  await page.getByRole('button', { name: 'Guardar en Biblioteca' }).click()
  await expect(page.getByRole('dialog', { name: 'Odisea' })).not.toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Hallazgo guardado')
  await openExplorerTools(page)
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer guardado' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer guardado' }).click()
  await expect(page.getByText('Odisea recuperado a la cola y eliminado de Biblioteca.')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Guardado deshecho')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Odisea')
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerFilters(page)
  await expect(page.getByRole('tab', { name: /En cola 1/ })).toBeVisible()
  await page.getByTestId('candidate-spotlight').getByRole('button', { name: 'Guardar Odisea' }).click()
  await openExplorerTools(page)
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await page.getByRole('button', { name: 'Afinar ficha guardada Odisea' }).click()
  const savedEditor = page.getByRole('dialog', { name: 'Entrada' })
  await expect(savedEditor).toContainText('Metadatos protegidos')
  await expect(savedEditor.getByLabel('Titulo')).toHaveCount(0)
  await savedEditor.getByLabel('Notas').fill('Afinada desde Explorador.')
  await savedEditor.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText('Odisea afinada en Biblioteca.')).toBeVisible()
  await expect(page.getByTestId('session-activity')).toContainText('Ficha afinada')
  await openExplorerFilters(page)
  await page.getByRole('tab', { name: /Guardados 1/ }).click()
  await expect(page.getByText('Ya esta en tu biblioteca')).toBeVisible()
  await expect(page.getByText('Odisea').first()).toBeVisible()
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('No hay hallazgos nuevos para esa busqueda.')).toBeVisible()
  await openExplorerFilters(page)
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
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await openExplorerFilters(page)
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
  await openExplorerFilters(page)
  await page.getByRole('button', { name: 'Descartar vista' }).click()
  await expect(page.getByText('Odisea descartado de la vista APIs.')).toBeVisible()
  await openExplorerFilters(page)
  await page.getByRole('button', { name: 'Ver todos los origenes' }).click()
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Nexo')
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Odisea')
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Ficha curada de Nexo')
  await expect(page.getByTestId('candidate-spotlight')).toContainText('Guardar copia privada')
})

test('explorer can save a filtered queued view in bulk and undo it', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('book')
  await page.getByLabel('Buscar en explorador').fill('Odisea')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await openExplorerFilters(page)
  await page.getByRole('button', { name: /APIs/ }).click()
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('APIs activo')
  await expect(page.getByTestId('explorer-decision-panel')).toContainText('Guardar vista')
  await page.getByRole('button', { name: 'Guardar vista' }).click()

  await expect(page.getByText('Odisea guardado desde la vista APIs.')).toBeVisible()
  await expect(page.getByTestId('explorer-completion')).toContainText('Bandeja resuelta')
  await expect(page.getByTestId('explorer-completion')).toContainText('APIs limpio')
  await page.getByTestId('explorer-completion').getByRole('button', { name: 'Ver guardados' }).click()
  await openExplorerTools(page)
  await expect(page.getByRole('button', { name: 'Afinar ficha guardada Odisea' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deshacer guardado de vista' })).toBeVisible()
  await openExplorerFilters(page)
  await expect(page.getByRole('tab', { name: /Guardados 1/ })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: 'Deshacer guardado de vista' }).click()
  await expect(page.getByText('Odisea recuperado a la cola y eliminado de Biblioteca.')).toBeVisible()
  await openExplorerFilters(page)
  await expect(page.getByRole('tab', { name: /En cola 2/ })).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).not.toContainText('Odisea')
})

test('library editor explains private copies from the Nexo catalog', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await openExplorerTools(page)
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
  await expect(page.getByRole('heading', { name: 'Catalogo Nexo' })).toBeVisible()
  await expect(page.getByTestId('catalog-diagnostics')).not.toBeVisible()
  await openCurationTools(page)
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
  const reviewQueueGeometry = await page.getByLabel('Revision prioritaria del catalogo').locator('.catalog-review-item').first().evaluate((card) => {
    const rect = card.getBoundingClientRect()
    const cover = card.querySelector('.cover-art')?.getBoundingClientRect()

    return {
      coverHeight: cover?.height ?? 0,
      coverWidth: cover?.width ?? 0,
      height: rect.height,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      viewportWidth: document.documentElement.clientWidth,
    }
  })
  expect(reviewQueueGeometry.horizontalOverflow).toBe(false)
  if (reviewQueueGeometry.viewportWidth < 760) {
    expect(reviewQueueGeometry.height).toBeLessThanOrEqual(170)
    expect(reviewQueueGeometry.coverWidth).toBeLessThanOrEqual(72)
    expect(reviewQueueGeometry.coverHeight).toBeLessThanOrEqual(90)
  }
  await page.getByRole('button', { name: 'Revisar Arrival' }).click()
  await expect(page.locator('.public-item-editor').getByLabel('Titulo')).toHaveValue('Arrival')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await page.getByText('Herramientas de catalogo').click()
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

  await openCurationTools(page)
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

  await openCurationTools(page)
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
  await expect(page.getByRole('button', { name: 'Ver pendientes' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver pendientes' }).click()
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Outer Wilds' })).not.toBeVisible()
  await openCurationTools(page)
  await page.getByLabel('Filtrar catalogo por tipo').selectOption('manhwa')
  await expect(page.getByRole('heading', { name: 'Sin entradas con esos filtros' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver todo el catalogo' }).click()
  await expect(page.getByRole('heading', { name: 'Solaris' })).toBeVisible()
  await openCurationTools(page)
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
  await openExplorerTools(page)
  await page.getByLabel('Tipo de busqueda en explorador').selectOption('any')
  await page.getByLabel('Buscar en explorador').fill('V Rising')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByRole('button', { name: 'Crear catalogo V Rising' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Crear catalogo V Rising' }).click()

  const editor = page.locator('.public-item-editor')
  await expect(editor.getByLabel('Titulo')).toHaveValue('V Rising')
  await expect(editor.getByLabel('Descripcion')).toHaveValue(/Candidato de demostracion|video game developed by/i)
  const publicEditorType = await editor.getByLabel('Tipo').inputValue()

  if (publicEditorType === 'game') {
    await editor.getByRole('button', { name: 'Survival craft' }).click()
    await expect(editor.getByLabel('Generos', { exact: true })).toHaveValue(/Supervivencia, Crafting, Accion/)
    await expect(editor.getByLabel('Tags', { exact: true })).toHaveValue(/cooperativo, base building, mundo abierto/)
  } else {
    await expect(editor.getByLabel('Tipo')).toHaveValue('movie')
    await editor.getByRole('button', { name: 'Noche palomitas' }).click()
    await expect(editor.getByLabel('Generos', { exact: true })).toHaveValue('Accion, Aventura')
    await expect(editor.getByLabel('Tags', { exact: true })).toHaveValue('palomitas, visual')
  }
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

  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByTestId('settings-confidence')).toContainText('Entradas')
  await openSettingsDrawer(page, 'settings-private-data-drawer')
  await page.getByTestId('private-action-plan').getByRole('button', { name: /Borrar entradas/ }).click()
  const deleteAllDialog = page.getByRole('dialog', { name: 'Borrar entradas privadas' })
  await expect(deleteAllDialog).toContainText(/\d+ entradas privadas/)
  await expect(deleteAllDialog.getByRole('button', { name: 'Borrar entradas' })).toBeDisabled()

  await deleteAllDialog.getByLabel('Confirmacion').fill('BORRAR')
  await deleteAllDialog.getByRole('button', { name: 'Borrar entradas' }).click()

  await expect(page.getByText('Tus entradas privadas han sido borradas')).toBeVisible()
  await expect(page.getByLabel('Estado de datos privados')).toContainText('0')
  await expect(page.getByRole('button', { name: 'Deshacer borrado total' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer borrado total' }).click()
  await expect(page.getByText(/\d+ entradas recuperadas en Biblioteca/)).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByTestId('library-grid')).toContainText('Outer Wilds')
})

test('entry dialog locks background scroll while open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop scroll lock check')

  await page.setViewportSize({ width: 1024, height: 520 })
  await openApp(page)
  await expect(page.getByTestId('library-grid')).toContainText('Inception')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const scrollYBeforeOpen = await page.evaluate(() => window.scrollY)
  expect(scrollYBeforeOpen).toBeGreaterThan(0)

  await page.evaluate(() => {
    window.history.pushState({}, '', '/?item=movie-inception')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  const dialog = page.getByRole('dialog', { name: 'Entrada' })
  await expect(dialog).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.classList.contains('dialog-scroll-locked') &&
          document.body.classList.contains('dialog-scroll-locked'),
      ),
    )
    .toBe(true)
  const scrollYWhileOpen = await page.evaluate(() => window.scrollY)
  await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe(`-${scrollYBeforeOpen}px`)
  await page.mouse.move(8, 8)
  await page.mouse.wheel(0, 900)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollYWhileOpen)

  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dialog-scroll-locked'))).toBe(false)
  const scrollYAfterClose = await page.evaluate(() => window.scrollY)
  expect(Math.abs(scrollYAfterClose - scrollYBeforeOpen)).toBeLessThanOrEqual(1)
})

test('library cards stay legible at 1920x1080', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop geometry check')

  await page.setViewportSize({ width: 1920, height: 1080 })
  await openApp(page)
  await expect(page.getByTestId('library-masthead')).toContainText('Biblioteca')
  await expect(page.getByRole('button', { name: 'Tarjetas' })).toHaveCount(0)
  await expect(page.getByTestId('library-grid')).toBeVisible()
  await expectLibraryGridAnimationsSettled(page)

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
        const coverTitle = coverElement?.querySelector('.cover-art-title') as HTMLElement | null
        const coverType = coverElement?.querySelector('.cover-art-type') as HTMLElement | null
        const primaryAction = cardElement.querySelector('.card-primary-action') as HTMLElement | null
        const primaryLabel = primaryAction?.querySelector('span') as HTMLElement | null
        const cardRect = cardElement.getBoundingClientRect()
        const mainRect = mainElement?.getBoundingClientRect()
        const actionsRect = actionsElement?.getBoundingClientRect()
        const coverRect = coverElement?.getBoundingClientRect()
        const primaryRect = primaryAction?.getBoundingClientRect()
        const primaryLabelRect = primaryLabel?.getBoundingClientRect()
        const primaryLabelStyle = primaryLabel ? getComputedStyle(primaryLabel) : null
        const posterBackplateStyle = getComputedStyle(cardElement, '::after')

        return {
          actionsHeight: actionsRect?.height ?? 0,
          actionsTop: actionsRect?.top ?? 0,
          coverHeight: coverRect?.height ?? 0,
          coverTextVisible: Boolean(
            coverTitle &&
              coverTitle.getBoundingClientRect().width > 0 &&
              coverTitle.getBoundingClientRect().height > 0,
          ),
          coverTypeVisible: Boolean(
            coverType &&
              coverType.getBoundingClientRect().width > 0 &&
              coverType.getBoundingClientRect().height > 0,
          ),
          coverWidth: coverRect?.width ?? 0,
          backgroundRoom: cardRect.width - (coverRect?.width ?? 0),
          hasPosterBackplate: cardElement.classList.contains('has-poster'),
          title: cardElement.querySelector('.item-identity h3')?.textContent?.trim() ?? '',
          mainBottom: mainRect?.bottom ?? 0,
          posterBackplateImage: posterBackplateStyle.backgroundImage,
          posterBackplateOpacity: Number(posterBackplateStyle.opacity),
          primaryLabelOpacity: Number(primaryLabelStyle?.opacity ?? 1),
          primaryLabelWidth: primaryLabelRect?.width ?? 0,
          primaryLabelScrollWidth: primaryLabel?.scrollWidth ?? 0,
          primaryWidth: primaryRect?.width ?? 0,
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
  expect(firstRowCards.length).toBe(4)
  const posterCards = metrics.cards.filter((card) => card.hasPosterBackplate)
  expect(posterCards.length).toBeGreaterThan(0)
  for (const card of posterCards) {
    expect(card.posterBackplateImage).toContain('url(')
    expect(card.posterBackplateOpacity).toBeGreaterThanOrEqual(0.14)
  }
  const generatedBackplateCards = metrics.cards.filter((card) => !card.hasPosterBackplate)
  expect(generatedBackplateCards.length).toBeGreaterThan(0)
  for (const card of generatedBackplateCards) {
    expect(card.posterBackplateImage).not.toBe('none')
    expect(card.posterBackplateImage).toContain('radial-gradient')
    expect(card.posterBackplateOpacity).toBeGreaterThanOrEqual(0.12)
  }
  for (const card of firstRowCards) {
    expect(card.width).toBeGreaterThanOrEqual(360)
    expect(card.coverWidth).toBeGreaterThanOrEqual(100)
    expect(card.coverWidth).toBeLessThanOrEqual(160)
    expect(card.backgroundRoom).toBeGreaterThanOrEqual(220)
    expect(card.coverHeight).toBeGreaterThanOrEqual(170)
    expect(card.coverHeight).toBeLessThanOrEqual(240)
    if (card.hasPosterBackplate) {
      expect(card.coverTextVisible).toBe(false)
      expect(card.coverTypeVisible).toBe(false)
    } else {
      expect(card.coverTextVisible).toBe(false)
      expect(card.coverTypeVisible).toBe(false)
    }
    expect(card.actionsHeight).toBeGreaterThanOrEqual(40)
    expect(card.mainBottom).toBeLessThanOrEqual(card.actionsTop + 1)
    expect(card.primaryLabelOpacity).toBeGreaterThanOrEqual(0.9)
    expect(card.primaryLabelWidth).toBeGreaterThanOrEqual(42)
    expect(card.primaryWidth).toBeGreaterThanOrEqual(128)
  }

  const firstCard = page.getByTestId('library-grid').locator('.item-card').first()
  await firstCard.hover()
  await page.waitForTimeout(180)
  const hoverMetrics = await firstCard.evaluate((card) => {
    const primaryAction = card.querySelector('.card-primary-action') as HTMLElement | null
    const primaryLabel = primaryAction?.querySelector('span') as HTMLElement | null
    const primaryRect = primaryAction?.getBoundingClientRect()
    const primaryLabelRect = primaryLabel?.getBoundingClientRect()
    const primaryLabelStyle = primaryLabel ? getComputedStyle(primaryLabel) : null

    return {
      primaryLabelOpacity: Number(primaryLabelStyle?.opacity ?? 0),
      primaryLabelWidth: primaryLabelRect?.width ?? 0,
      primaryWidth: primaryRect?.width ?? 0,
    }
  })

  expect(hoverMetrics.primaryLabelOpacity).toBeGreaterThanOrEqual(0.9)
  expect(hoverMetrics.primaryLabelWidth).toBeGreaterThanOrEqual(42)
  expect(hoverMetrics.primaryWidth).toBeGreaterThanOrEqual(128)
  expect(hoverMetrics.primaryWidth).toBeLessThanOrEqual(360)
})

test('library cards fit the mobile PWA viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile geometry check')

  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await expectLibrarySurface(page)
  await expect(page.getByTestId('library-grid')).toBeVisible()

  const metrics = await page.getByTestId('library-grid').evaluate((grid) => {
    const gridRect = grid.getBoundingClientRect()
    const cards = Array.from(grid.querySelectorAll('.item-card')).slice(0, 3)
    return {
      gridWidth: gridRect.width,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: document.documentElement.clientHeight,
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
          top: cardRect.top,
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
  expect(metrics.cards[0]?.top).toBeLessThanOrEqual(metrics.viewportHeight)

  await page.locator('.item-main').filter({ hasText: 'Outer Wilds' }).click()
  const entryDialog = page.getByRole('dialog', { name: 'Entrada' })
  await expectDialogAnimationsSettled(entryDialog)
  const dialogMetrics = await entryDialog.evaluate((dialog) => {
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

test('explorer starts as a visual discovery surface', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1920, height: 1080 })
  } else {
    await page.setViewportSize({ width: 390, height: 844 })
  }

  await openApp(page)
  await page.getByRole('button', { name: 'Explorador', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sorprendeme' })).toBeVisible()
  await expect(page.getByLabel('Tipo para descubrir')).toBeVisible()
  await expect(page.getByLabel('Duracion para descubrir')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sorprendeme' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Descubrir' })).toHaveCount(0)
  await expect(page.getByLabel('Buscar en explorador')).not.toBeVisible()
  await expect(page.locator('details.explorer-tools-panel').first()).not.toHaveAttribute('open', '')

  const metrics = await page.evaluate(() => {
    const command = document.querySelector('.explorer-command') as HTMLElement | null
    const search = document.querySelector('.explorer-command-search') as HTMLElement | null
    const advanced = document.querySelector('details.explorer-tools-panel') as HTMLDetailsElement | null
    const visibleSearch = search ? search.getBoundingClientRect() : undefined

    return {
      advancedOpen: Boolean(advanced?.open),
      commandHeight: command?.getBoundingClientRect().height ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
      searchBottom: visibleSearch?.bottom ?? 0,
      searchRight: visibleSearch?.right ?? 0,
      searchWidth: visibleSearch?.width ?? 0,
      viewportHeight: document.documentElement.clientHeight,
      viewportWidth: document.documentElement.clientWidth,
    }
  })

  expect(metrics.advancedOpen).toBe(false)
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.searchRight).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.searchBottom).toBeLessThan(metrics.viewportHeight)

  if (testInfo.project.name === 'chromium') {
    expect(metrics.commandHeight).toBeLessThanOrEqual(240)
    expect(metrics.searchWidth).toBeGreaterThanOrEqual(820)
  } else {
    expect(metrics.commandHeight).toBeLessThanOrEqual(260)
    expect(metrics.searchWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  }
})

test('dice result owns the stage without mobile overflow', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1920, height: 1080 })
  } else {
    await page.setViewportSize({ width: 390, height: 844 })
  }

  await openApp(page)
  await page.getByRole('button', { name: 'Dado', exact: true }).click()
  await page.getByTestId('roll-button').click()
  await expect(page.getByTestId('recommendation-result')).toContainText('Dado eligio')

  const metrics = await page.evaluate(() => {
    const layout = document.querySelector('.dice-layout') as HTMLElement
    const hero = document.querySelector('.dice-hero') as HTMLElement
    const result = document.querySelector('.result-panel') as HTMLElement
    const head = document.querySelector('.recommendation-head') as HTMLElement
    const decision = document.querySelector('.recommendation-decision') as HTMLElement
    const resultRect = result.getBoundingClientRect()
    const layoutRect = layout.getBoundingClientRect()
    const heroRect = hero.getBoundingClientRect()
    const headRect = head.getBoundingClientRect()
    const decisionRect = decision.getBoundingClientRect()

    return {
      decisionBottom: decisionRect.bottom,
      decisionRight: decisionRect.right,
      headRight: headRect.right,
      heroWidth: heroRect.width,
      layoutWidth: layoutRect.width,
      resultWidth: resultRect.width,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: document.documentElement.clientHeight,
      viewportWidth: document.documentElement.clientWidth,
    }
  })

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.headRight).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.decisionRight).toBeLessThanOrEqual(metrics.viewportWidth + 1)

  if (testInfo.project.name === 'chromium') {
    expect(metrics.resultWidth).toBeGreaterThanOrEqual(metrics.layoutWidth - 4)
    expect(Math.abs(metrics.resultWidth - metrics.heroWidth)).toBeLessThanOrEqual(4)
  } else {
    expect(metrics.decisionBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1)
  }
})

test('settings layout keeps theme identity first and status compact', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1920, height: 1080 })
  } else {
    await page.setViewportSize({ width: 390, height: 844 })
  }

  await openApp(page)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByTestId('settings-theme-stage')).toBeVisible()
  await expect(page.getByTestId('settings-confidence')).toBeVisible()
  await expect(page.getByTestId('settings-account-drawer')).not.toHaveAttribute('open', '')
  await expect(page.getByTestId('settings-private-data-drawer')).not.toHaveAttribute('open', '')

  const metrics = await page.locator('.settings-panel').evaluate((panel) => {
    const heading = panel.querySelector('.panel-heading') as HTMLElement | null
    const status = panel.querySelector('.settings-status') as HTMLElement | null
    const themeStage = panel.querySelector('[data-testid="settings-theme-stage"]') as HTMLElement | null
    const themePreview = panel.querySelector('.settings-theme-preview') as HTMLElement | null
    const confidence = panel.querySelector('.settings-confidence-panel') as HTMLElement | null
    const tastePanel = panel.querySelector('.settings-taste-panel') as HTMLDetailsElement | null
    const headingRect = heading?.getBoundingClientRect()
    const statusRect = status?.getBoundingClientRect()
    const themeStageRect = themeStage?.getBoundingClientRect()
    const confidenceRect = confidence?.getBoundingClientRect()
    const themePreviewRect = themePreview?.getBoundingClientRect()
    const statusVisible = Boolean(statusRect && statusRect.width > 0 && statusRect.height > 0)
    const visibleThemeOptions = Array.from(panel.querySelectorAll('.theme-option')).filter((button) => {
      const rect = (button as HTMLElement).getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }).length
    const visibleTasteInputs = Array.from(panel.querySelectorAll('.settings-taste-content input')).filter((input) => {
      const rect = (input as HTMLElement).getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }).length

    return {
      headingConfidenceGap: headingRect && confidenceRect ? confidenceRect.top - headingRect.bottom : 0,
      headingStatusGap: headingRect && statusRect ? statusRect.top - headingRect.bottom : 0,
      headingThemeGap: headingRect && themeStageRect ? themeStageRect.top - headingRect.bottom : 0,
      scrollWidth: document.documentElement.scrollWidth,
      statusConfidenceGap: statusRect && confidenceRect ? confidenceRect.top - statusRect.bottom : 0,
      statusHeight: statusRect?.height ?? 0,
      statusVisible,
      themeBeforeConfidence: Boolean(themeStageRect && confidenceRect && themeStageRect.bottom <= confidenceRect.top),
      themeConfidenceGap: themeStageRect && confidenceRect ? confidenceRect.top - themeStageRect.bottom : 0,
      themePreviewVisible: Boolean(themePreviewRect && themePreviewRect.width > 0 && themePreviewRect.height > 0),
      themeStageHeight: themeStageRect?.height ?? 0,
      tastePanelOpen: Boolean(tastePanel?.open),
      viewportWidth: document.documentElement.clientWidth,
      visibleThemeOptions,
      visibleTasteInputs,
    }
  })

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.headingThemeGap).toBeLessThanOrEqual(48)
  expect(metrics.themeBeforeConfidence).toBe(true)
  expect(metrics.themeConfidenceGap).toBeLessThanOrEqual(24)
  expect(metrics.visibleThemeOptions).toBe(7)
  if (testInfo.project.name === 'chromium') {
    expect(metrics.themeStageHeight).toBeLessThanOrEqual(250)
    expect(metrics.themePreviewVisible).toBe(true)
  } else {
    expect(metrics.themeStageHeight).toBeLessThanOrEqual(160)
    expect(metrics.themePreviewVisible).toBe(false)
  }
  if (metrics.statusVisible) {
    expect(metrics.headingStatusGap).toBeLessThanOrEqual(48)
    expect(metrics.statusHeight).toBeLessThanOrEqual(66)
    expect(metrics.statusConfidenceGap).toBeLessThanOrEqual(24)
  } else {
    expect(metrics.headingConfidenceGap).toBeGreaterThan(metrics.headingThemeGap)
  }
  expect(metrics.tastePanelOpen).toBe(false)
  expect(metrics.visibleTasteInputs).toBe(0)

  const drawerMetrics = await page.locator('.settings-side').evaluate((side) => {
    const drawers = Array.from(side.querySelectorAll('.settings-drawer')).map((drawer) => {
      const rect = drawer.getBoundingClientRect()
      return {
        height: rect.height,
        open: (drawer as HTMLDetailsElement).open,
        width: rect.width,
      }
    })

    return {
      drawerCount: drawers.length,
      drawers,
      sideHeight: side.getBoundingClientRect().height,
    }
  })
  expect(drawerMetrics.drawerCount).toBeGreaterThanOrEqual(3)
  expect(drawerMetrics.drawers.every((drawer) => !drawer.open)).toBe(true)
  if (testInfo.project.name === 'chromium') {
    expect(drawerMetrics.sideHeight).toBeLessThanOrEqual(120)
  } else {
    expect(drawerMetrics.drawers.every((drawer) => drawer.height <= 104)).toBe(true)
  }
})

test('all themes keep core views legible without layout overflow', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000)

  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1920, height: 1080 })
  } else {
    await page.setViewportSize({ width: 390, height: 844 })
  }

  const themes = ['dark', 'light', 'rose', 'forest', 'ocean', 'mint', 'aurora']
  const tabs = ['Biblioteca', 'Dado', 'Explorador', 'Ajustes']

  await mockOpenLibraryOdisea(page)
  await page.goto('/')

  for (const theme of themes) {
    await page.evaluate((nextTheme) => {
      window.localStorage.setItem('nexo-theme', nextTheme)
      window.sessionStorage.removeItem('nexo-library-advanced')
    }, theme)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      await expect(page.getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
      await expectNoVisibleTextClipping(page)

      const geometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }))
      expect(geometry.scrollWidth, `${theme} ${tab} horizontal overflow`).toBeLessThanOrEqual(geometry.viewportWidth + 1)

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
      expect(seriousViolations, `${theme} ${tab} has serious accessibility violations`).toEqual([])
    }
  }
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
  await openManualEntryEditor(page)
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  let seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
  expect(seriousViolations, 'private editor has serious accessibility violations').toEqual([])
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await page.getByRole('button', { name: 'Curacion' }).click()
  await page.getByText('Herramientas de catalogo').click()
  await page.getByRole('button', { name: 'Crear Libros' }).click()
  await expectDialogAnimationsSettled(page.locator('.public-item-editor'))
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
  expect(seriousViolations, 'public editor has serious accessibility violations').toEqual([])
})
