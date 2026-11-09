import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

/**
 * Dashboards POC checks. Needs the POC pages published first:
 * stage B pages `coord_ph_one` (/coord/ph-one, five placeholder tiles, t5 silent)
 * and `coord_ph_two` (/coord/ph-two, two placeholder tiles).
 */

function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

/** Navigate inside the running shell, because deep links can race the shell's start. */
async function openInShell(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function boxes(frame: FrameLocator, ids: string[]) {
  const out: Record<string, { x: number, y: number, w: number, h: number }> = {}
  for (const id of ids) {
    const b = await frame.locator(`[data-tile-id="${id}"]`).boundingBox()
    if (b)
      out[id] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  return out
}

/** Collects console errors and failed requests from the page and all its frames. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error')
      errors.push(`console: ${m.text().slice(0, 200)}`)
  })
  page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('response', (r) => {
    if (r.status() >= 400)
      errors.push(`http ${r.status()}: ${new URL(r.url()).pathname}`)
  })
  page.on('requestfailed', (r) => {
    // A navigation cancels the previous page's open requests; built-in pages show the same.
    if (r.failure()?.errorText !== 'net::ERR_ABORTED')
      errors.push(`failed: ${new URL(r.url()).pathname} ${r.failure()?.errorText ?? ''}`)
  })
  return errors
}

async function chartLabels(frame: FrameLocator, tileId: string): Promise<number> {
  const data = await frame.locator(`[data-tile-id="${tileId}"] wippy-chartjs`).getAttribute('data')
  return data ? (JSON.parse(data).labels ?? []).length : -1
}

test.describe('stage C: built-in tiles with real data', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
  })

  test('LLM usage shows the real values', async ({ page }) => {
    const errors = watchErrors(page)
    await openInShell(page, '/reports/llm-usage')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(/550[,.   ]?135/, { timeout: 20_000 })
    await expect(f.locator('[data-tile-id="text"]')).toContainText('38 calls used 550135 tokens. claude-sonnet-4-6 used 97.1% of them.')
    await expect.poll(() => chartLabels(f, 'by_day'), { timeout: 10_000 }).toBe(5)
    await expect(f.locator('[data-tile-id="by_model"] tbody tr')).toHaveCount(2)
    await expect(f.locator('[data-tile-id="by_day"] figure[aria-label="Tokens by day"]')).toHaveCount(1)
    const canvas = await f.locator('[data-tile-id="by_day"] wippy-chartjs canvas').boundingBox()
    console.log('by_day canvas', JSON.stringify(canvas))
    expect(canvas!.height).toBeGreaterThan(200)

    // Keyboard: focus the select, open it, see all choices.
    const combo = f.locator('[data-tile-id="model_picker"] [role="combobox"]')
    await combo.focus()
    await page.keyboard.press('Enter')
    const options = f.locator('[role="option"]')
    await expect(options).toHaveCount(3, { timeout: 5_000 })
    const listBox = await f.locator('[role="listbox"]').boundingBox()
    const panel = await f.locator('[data-tile-id="model_picker"]').boundingBox()
    console.log('listbox', JSON.stringify(listBox), 'panel', JSON.stringify(panel))
    await page.keyboard.press('Escape')

    // Theme: dark scheme restyles the tiles.
    const lightColor = await f.locator('.dash-kpi__value').first().evaluate(el => getComputedStyle(el).color)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(async () => f.locator('.dash-kpi__value').first().evaluate(el => getComputedStyle(el).color), { timeout: 5_000 }).not.toBe(lightColor)
    await page.emulateMedia({ colorScheme: 'light' })
    console.log('errors', JSON.stringify(errors))
    expect(errors).toEqual([])
  })

  test('App activity shows the real values', async ({ page }) => {
    const errors = watchErrors(page)
    await openInShell(page, '/ops/app-activity')
    const f = pageFrame(page, 'app_activity')
    await expect(f.locator('[data-tile-id="sessions"]')).toContainText('14', { timeout: 20_000 })
    await expect(f.locator('[data-tile-id="messages"]')).toContainText('107')
    await expect.poll(() => chartLabels(f, 'sessions_by_month'), { timeout: 10_000 }).toBe(3)
    await expect(f.locator('[data-tile-id="message_types"] tbody tr')).toHaveCount(6)
    console.log('errors', JSON.stringify(errors))
    expect(errors).toEqual([])
  })
})

/** Records point reads of one page as `<point>` names, in order. */
function watchPointReads(page: Page, pageId: string) {
  const reads: string[] = []
  page.on('request', (r) => {
    const m = new URL(r.url()).pathname.match(new RegExp(`/dashboards/pages/${pageId}/points/([a-z_]+)`))
    if (m)
      reads.push(m[1])
  })
  return reads
}

async function chooseModel(page: Page, f: FrameLocator, label: string) {
  await f.locator('[data-tile-id="model_picker"] [role="combobox"]').click()
  await f.locator('[role="option"]', { hasText: label }).first().click()
}

/** Clicks the tallest bar of the last category in a two-series bar chart. */
async function clickLastCategoryBar(f: FrameLocator, tileId: string) {
  const canvas = f.locator(`[data-tile-id="${tileId}"] wippy-chartjs canvas`)
  const box = (await canvas.boundingBox())!
  // The plot starts after the y axis (about 60 px) and has five categories; the second bar of a
  // category sits right of its centre. Try a few points across that bar, low in the plot.
  for (const fx of [0.68, 0.72, 0.64, 0.76]) {
    const plotLeft = 58
    const cat = (box.width - plotLeft) / 5
    const x = plotLeft + cat * 4 + cat * fx
    await canvas.click({ position: { x, y: box.height - 45 } })
    if (await f.locator('dashboard-layout').evaluate(el => !!el.shadowRoot!.querySelector('[data-selection="day"]')))
      return
  }
  throw new Error('no bar was hit')
}

test.describe('stage D: arguments and interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
  })

  test('choosing a model updates only the dependent tiles, and clear restores them', async ({ page }) => {
    const errors = watchErrors(page)
    const reads = watchPointReads(page, 'llm_usage')
    await openInShell(page, '/reports/llm-usage')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(/550[,.   ]?135/, { timeout: 20_000 })
    await expect(f.locator('[data-tile-id="text"]')).toContainText('38 calls used')
    await page.waitForTimeout(500)
    const before = reads.length

    await chooseModel(page, f, 'claude-sonnet-4-6')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(/534[,.   ]?297/, { timeout: 10_000 })
    await expect(f.locator('[data-selection="model"] [data-selection-value]')).toContainText('claude-sonnet-4-6')
    await page.waitForTimeout(500)
    const afterModel = reads.slice(before)
    console.log('reads after model', JSON.stringify(afterModel))
    expect(afterModel).not.toContain('summary')
    expect(afterModel).toContain('tokens')

    // Clear all: every tile returns to its value for no argument.
    await f.locator('[data-selections-clear-all]').click()
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(/550[,.   ]?135/, { timeout: 10_000 })
    await expect(f.locator('[data-tile-id="by_model"] tbody tr')).toHaveCount(2)
    await expect(f.locator('[data-tile-id="model_picker"] [role="combobox"]')).toContainText('All')
    await expect(f.locator('[data-selections]')).toHaveCount(0)
    console.log('errors', JSON.stringify(errors))
    expect(errors).toEqual([])
  })

  test('a bar click sets the day for the table only', async ({ page }) => {
    const errors = watchErrors(page)
    const reads = watchPointReads(page, 'llm_usage')
    await openInShell(page, '/reports/llm-usage')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(/550[,.   ]?135/, { timeout: 20_000 })
    await expect.poll(() => chartLabels(f, 'by_day'), { timeout: 10_000 }).toBe(5)
    await page.waitForTimeout(800)
    const before = reads.length

    await clickLastCategoryBar(f, 'by_day')
    await expect(f.locator('[data-selection="day"] [data-selection-value]')).toContainText('2026-08-31')
    await expect(f.locator('[data-tile-id="by_model"] tbody tr')).toHaveCount(2)
    await expect(f.locator('[data-tile-id="by_model"]')).toContainText(/162[,.   ]?186/, { timeout: 10_000 })
    await page.waitForTimeout(500)
    const afterClick = reads.slice(before)
    console.log('reads after bar click', JSON.stringify(afterClick))
    expect(afterClick).toEqual(['by_model'])

    await f.locator('[data-selection-clear="day"]').click()
    await expect(f.locator('[data-tile-id="by_model"]')).toContainText(/534[,.   ]?297/, { timeout: 10_000 })
    console.log('errors', JSON.stringify(errors))
    expect(errors).toEqual([])
  })

  test('the model comes from the path on a direct link', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/reports/llm-usage/claude-haiku-4-5')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(/15[,.   ]?838/, { timeout: 30_000 })
    await expect(f.locator('[data-selection="model"] [data-selection-value]')).toContainText('claude-haiku-4-5')
    console.log('errors', JSON.stringify(errors))
    expect(errors).toEqual([])
  })
})

test.describe('stage B: page host and dashboard-layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
  })

  test('reflow, kept state, scroll and timeout on one page', async ({ page }) => {
    await openInShell(page, '/coord/ph-one')
    const frame = pageFrame(page, 'coord_ph_one')
    await expect(frame.locator('[data-tile-id="t1"]')).toBeVisible({ timeout: 20_000 })

    // Wide board: lg layout, t1 to t3 share a row.
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2', 't3'])
      return b.t1 && b.t2 && b.t3 && b.t1.y === b.t2.y && b.t2.y === b.t3.y
    }, { timeout: 10_000 }).toBe(true)
    const wide = await boxes(frame, ['t1', 't2', 't3', 't4', 't5'])
    console.log('wide', JSON.stringify(wide))

    // Type into t2, then go narrow: default layout, one column.
    const input = frame.locator('dash-placeholder[tile-id="t2"] input')
    await input.fill('keep me')
    await page.setViewportSize({ width: 900, height: 900 })
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2'])
      return b.t1 && b.t2 && b.t2.y > b.t1.y && b.t1.x === b.t2.x
    }, { timeout: 10_000 }).toBe(true)
    console.log('narrow', JSON.stringify(await boxes(frame, ['t1', 't2', 't3'])))
    await page.setViewportSize({ width: 1400, height: 900 })
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2'])
      return b.t1 && b.t2 && b.t1.y === b.t2.y
    }, { timeout: 10_000 }).toBe(true)
    await expect(input).toHaveValue('keep me')

    // A 600 px container in a wide window: default layout.
    await page.locator('iframe[name="wippy:page:wippy.dashboards.pages:coord_ph_one"]').evaluate((el: HTMLElement) => {
      el.style.width = '600px'
    })
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2'])
      return b.t1 && b.t2 && b.t2.y > b.t1.y && b.t1.w < 600
    }, { timeout: 10_000 }).toBe(true)
    console.log('container600', JSON.stringify(await boxes(frame, ['t1', 't2'])))
    await page.locator('iframe[name="wippy:page:wippy.dashboards.pages:coord_ph_one"]').evaluate((el: HTMLElement) => {
      el.style.width = ''
    })

    // The page is taller than the window: scroll to the end and see the last row whole.
    const scroll = await frame.locator('dashboard-layout').evaluate((el) => {
      const board = el.shadowRoot!.querySelector('.board') as HTMLElement
      board.scrollTop = board.scrollHeight
      const frames = [...el.shadowRoot!.querySelectorAll('[data-tile-id]')].map(n => n.getBoundingClientRect())
      return {
        scrollHeight: board.scrollHeight,
        clientHeight: board.clientHeight,
        lastBottom: Math.max(...frames.map(r => r.bottom)),
        boardBottom: board.getBoundingClientRect().bottom,
      }
    })
    console.log('scroll', JSON.stringify(scroll))
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
    expect(scroll.lastBottom).toBeLessThanOrEqual(scroll.boardBottom + 1)

    // The silent tile times out.
    await expect(frame.locator('[data-tile-id="t5"]')).toContainText('No response', { timeout: 15_000 })
    await expect(frame.locator('[data-tile-id="t1"]')).not.toContainText('No response')
  })

  test('two paths share one bundle, sub-path and history', async ({ page }) => {
    const bundles = new Set<string>()
    const seen: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (u.pathname.includes('dashboard-page') || u.pathname.includes('/pages/content/'))
        seen.push(u.pathname)
      if (u.pathname.includes('dashboard-page') && u.pathname.endsWith('.js'))
        bundles.add(u.pathname)
    })

    await openInShell(page, '/coord/ph-one/claude-haiku-4-5')
    const one = pageFrame(page, 'coord_ph_one')
    await expect(one.locator('[data-tile-id="t1"]')).toBeVisible({ timeout: 20_000 })
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/claude-haiku-4-5')
    await one.locator('dashboard-layout').evaluate((el: any) => { el.__probe = 'same' })

    await openInShell(page, '/coord/ph-one/other')
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/other')
    await page.goBack()
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/claude-haiku-4-5')
    await page.goForward()
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/other')
    expect(await one.locator('dashboard-layout').evaluate((el: any) => el.__probe)).toBe('same')

    await openInShell(page, '/coord/ph-two')
    const two = pageFrame(page, 'coord_ph_two')
    await expect(two.locator('[data-tile-id="x1"]')).toBeVisible({ timeout: 20_000 })
    await expect(two.locator('[data-tile-id="t1"]')).toHaveCount(0)
    console.log('seen', JSON.stringify(seen))
    console.log('bundles', JSON.stringify([...bundles]))
    expect(bundles.size).toBe(1)
  })
})
