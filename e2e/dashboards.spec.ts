import { readFileSync } from 'node:fs'
import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, pathOf, takeUnexpected } from './helpers/page-watch'

/**
 * Dashboards POC checks. Generated pages are lost when the app restarts, so the suite publishes
 * them before the first test: the two demo pages through `POST /api/v1/demo/build`, and the
 * stage B pages from e2e/fixtures/dashboards: `coord_ph_one` (/coord/ph-one, five placeholder
 * tiles, t5 silent) and `coord_ph_two` (/coord/ph-two, two placeholder tiles). Each test signs
 * in afterwards in its own context, so the shell loads the routes of the published pages.
 */

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    const build = await api(page, 'POST', '/api/v1/demo/build', {})
    expect(build.status, build.body).toBe(200)
    for (const name of ['coord_ph_one', 'coord_ph_two']) {
      const spec: unknown = JSON.parse(readFileSync(`e2e/fixtures/dashboards/${name}.json`, 'utf8'))
      const published = await api(page, 'POST', '/api/v1/dashboards/pages', spec)
      expect(published.status, published.body).toBe(200)
    }
  }
  finally {
    await context.close()
  }
})

// The stage B test pages would otherwise stay in the Host's nav after the run.
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    for (const name of ['coord_ph_one', 'coord_ph_two']) {
      const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${name}`)
      expect([200, 404], removed.body).toContain(removed.status)
    }
  }
  finally {
    await context.close()
  }
})

/**
 * A window wide enough for the lg layout (1024 px of board) in both boot modes. In managed mode the
 * Host's nav and side panel take about 600 px, so 1400 px leaves the board narrow.
 */
const WIDE = { width: 1920, height: 900 }

function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
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

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

/**
 * Counts the bars a chart drew: the coloured runs along one pixel row just above the bars' base
 * line. Grid lines and text are grey, so they do not count. A chart with labels but no bars counts 0.
 */
async function drawnBars(frame: FrameLocator, tileId: string): Promise<number> {
  return frame.locator(`[data-tile-id="${tileId}"] wippy-chartjs canvas`).evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx || canvas.width === 0 || canvas.height === 0)
      return -1
    const { width, height } = canvas
    const px = ctx.getImageData(0, 0, width, height).data
    const coloured = (x: number, y: number) => {
      const i = (y * width + x) * 4
      return px[i + 3] > 200 && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > 80
    }
    let base = -1
    for (let y = height - 1; y >= 0 && base < 0; y--) {
      for (let x = 0; x < width; x++) {
        if (coloured(x, y)) {
          base = y
          break
        }
      }
    }
    if (base < 0)
      return 0
    // 12 CSS pixels above the base: above the tiny bars of a small series, below every real bar here.
    const y = base - Math.round(12 * height / canvas.clientHeight)
    let runs = 0
    let inRun = false
    for (let x = 0; x < width; x++) {
      const on = coloured(x, y)
      if (on && !inRun)
        runs++
      inRun = on
    }
    return runs
  })
}

/** The status cell of one user row, for an exact text check ("active" is inside "inactive"). */
function statusCell(frame: FrameLocator, userId: string) {
  return frame.locator(`[data-tile-id="users"] tr[data-user-id="${userId}"] [data-field="status"]`)
}

/** Waits until the action confirmation shows in the Host page or, as the fallback, in the frame. */
async function confirmation(page: Page, frame: FrameLocator) {
  const inPage = page.getByText('Please confirm').first()
  const inFrame = frame.getByText('Please confirm').first()
  await expect.poll(async () => (await inPage.isVisible()) || (await inFrame.isVisible()), { timeout: 10_000 }).toBe(true)
  return (await inPage.isVisible()) ? page : frame
}

async function chartLabels(frame: FrameLocator, tileId: string): Promise<number> {
  const data = await frame.locator(`[data-tile-id="${tileId}"] wippy-chartjs`).getAttribute('data')
  return data ? (JSON.parse(data).labels ?? []).length : -1
}

/**
 * The data is live: the app's own chat and LLM calls add rows to the tables the points read. So
 * the tests compare what a tile draws with what its point returns now, not with a fixed snapshot.
 */
interface Frame { fields: Array<{ name: string }>, rows: unknown[][] }

/** Reads a point of a page through the read endpoint, as the signed-in user, with no arguments. */
async function readPoint(page: Page, pageId: string, point: string): Promise<any> {
  const r = await api(page, 'GET', `/api/v1/dashboards/pages/${pageId}/points/${point}`)
  expect(r.status, `${pageId}/${point}: ${r.body}`).toBe(200)
  return JSON.parse(r.body).data
}

/** The values of one field of a frame, found by name. */
function column(frame: Frame, name: string): unknown[] {
  const i = frame.fields.findIndex(f => f.name === name)
  expect(i, `field ${name}`).toBeGreaterThanOrEqual(0)
  return frame.rows.map(r => r[i])
}

/** A whole number as a tile formats it, with or without a thousands separator. */
function numberPattern(n: unknown): RegExp {
  const digits = String(Math.round(Number(n)))
  const groups: string[] = []
  for (let i = digits.length; i > 0; i -= 3)
    groups.unshift(digits.slice(Math.max(0, i - 3), i))
  // No digit boundary: a table's text runs its cells together, so "5" calls then "162,186" reads "5162,186".
  return new RegExp(groups.join('[,.\\s\\u00a0\\u202f]?'))
}

/** How many values reach `share` of the largest one. */
function countAbove(values: number[], share: number): number {
  const max = Math.max(...values)
  return values.filter(v => v >= max * share).length
}

/**
 * Checks that a bar chart drew its bars. drawnBars counts the bars taller than 12 px, so every
 * value of at least 15% of the largest must show, and none under 3% can.
 */
async function expectBars(f: FrameLocator, tileId: string, values: number[]) {
  await expect.poll(() => drawnBars(f, tileId), { timeout: 10_000 }).toBeGreaterThanOrEqual(countAbove(values, 0.15))
  expect(await drawnBars(f, tileId)).toBeLessThanOrEqual(countAbove(values, 0.03))
}

/** The LLM usage page's points as they are now, and the numbers its tiles must show. */
async function readUsage(page: Page) {
  const tokens: Frame = await readPoint(page, 'llm_usage', 'tokens')
  const summary: { text: string } = await readPoint(page, 'llm_usage', 'summary')
  const byDay: Frame = await readPoint(page, 'llm_usage', 'by_day')
  const byModel: Frame = await readPoint(page, 'llm_usage', 'by_model')
  const models: Frame = await readPoint(page, 'llm_usage', 'models')
  const days = column(byDay, 'day') as string[]
  const dayModels = column(byDay, 'model') as string[]
  const dayTokens = (column(byDay, 'tokens') as number[]).map(Number)
  const modelIds = column(byModel, 'model_id') as string[]
  const modelTokens = (column(byModel, 'tokens') as number[]).map(Number)
  return {
    total: numberPattern(column(tokens, 'tokens')[0]),
    summary: summary.text,
    days: [...new Set(days)],
    dayTokens,
    byModelRows: byModel.rows.length,
    modelCount: models.rows.length,
    /** The tokens of one model over all days. */
    modelTotal: (model: string) => numberPattern(modelTokens[modelIds.indexOf(model)]),
    /** The tokens of one model on one day, and how many models ran that day. */
    onDay: (day: string, model: string) => ({
      tokens: numberPattern(dayTokens[days.findIndex((d, i) => d === day && dayModels[i] === model)]),
      models: days.filter(d => d === day).length,
    }),
  }
}

test.describe('stage C: built-in tiles with real data', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
  })

  test('LLM usage shows the real values', async ({ page }) => {
    const usage = await readUsage(page)
    await openInShell(page, '/reports/llm-usage')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(usage.total, { timeout: 20_000 })
    await expect(f.locator('[data-tile-id="text"]')).toContainText(usage.summary)
    // One label per day, and bars drawn on the canvas (a blank plot with labels fails).
    await expect.poll(() => chartLabels(f, 'by_day'), { timeout: 10_000 }).toBe(usage.days.length)
    await expectBars(f, 'by_day', usage.dayTokens)
    // The points send no data_as_of, so every frame says it is unknown (contracts section 7).
    await expect(f.locator('[data-tile-id="tokens"] [data-as-of]')).toHaveText('Data as of unknown')
    await expect(f.locator('[data-tile-id="by_model"] tbody tr')).toHaveCount(usage.byModelRows)
    await expect(f.locator('[data-tile-id="by_day"] figure[aria-label="Tokens by day"]')).toHaveCount(1)
    const canvas = await f.locator('[data-tile-id="by_day"] wippy-chartjs canvas').boundingBox()
    console.log('by_day canvas', JSON.stringify(canvas))
    expect(canvas!.height).toBeGreaterThan(200)

    // Keyboard: focus the select, open it, see all choices.
    const combo = f.locator('[data-tile-id="model_picker"] [role="combobox"]')
    await combo.focus()
    await page.keyboard.press('Enter')
    const options = f.locator('[role="option"]')
    // Every model, and "All".
    await expect(options).toHaveCount(usage.modelCount + 1, { timeout: 5_000 })
    const listBox = await f.locator('[role="listbox"]').boundingBox()
    const panel = await f.locator('[data-tile-id="model_picker"]').boundingBox()
    console.log('listbox', JSON.stringify(listBox), 'panel', JSON.stringify(panel))
    await page.keyboard.press('Escape')

    // Theme: dark scheme restyles the tiles.
    const lightColor = await f.locator('.dash-kpi__value').first().evaluate(el => getComputedStyle(el).color)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(async () => f.locator('.dash-kpi__value').first().evaluate(el => getComputedStyle(el).color), { timeout: 5_000 }).not.toBe(lightColor)
    await page.emulateMedia({ colorScheme: 'light' })
  })

  test('App activity shows the real values', async ({ page }) => {
    await openInShell(page, '/ops/app-activity')
    const f = pageFrame(page, 'app_activity')
    const sessions: Frame = await readPoint(page, 'app_activity', 'sessions')
    const messages: Frame = await readPoint(page, 'app_activity', 'messages')
    const byMonth: Frame = await readPoint(page, 'app_activity', 'sessions_by_month')
    const types: Frame = await readPoint(page, 'app_activity', 'message_types')
    await expect(f.locator('[data-tile-id="sessions"] .dash-kpi__value')).toContainText(numberPattern(sessions.rows[0][0]), { timeout: 20_000 })
    await expect(f.locator('[data-tile-id="messages"] .dash-kpi__value')).toContainText(numberPattern(messages.rows[0][0]))
    await expect.poll(() => chartLabels(f, 'sessions_by_month'), { timeout: 10_000 }).toBe(byMonth.rows.length)
    await expectBars(f, 'sessions_by_month', byMonth.rows.map(r => Number(r[1])))
    await expect(f.locator('[data-tile-id="message_types"] tbody tr')).toHaveCount(types.rows.length)
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

/**
 * Clicks the tallest bar of one category in a grouped bar chart. The chart's own data says how
 * many categories and series there are and which series is tallest at that label.
 */
async function clickCategoryBar(f: FrameLocator, tileId: string, label: string) {
  const chart = f.locator(`[data-tile-id="${tileId}"] wippy-chartjs`)
  const data = JSON.parse((await chart.getAttribute('data'))!) as { labels: string[], datasets: Array<{ data: Array<number | null> }> }
  const at = data.labels.indexOf(label)
  expect(at, `label ${label}`).toBeGreaterThanOrEqual(0)
  const heights = data.datasets.map(d => Number(d.data[at] ?? 0))
  const series = heights.indexOf(Math.max(...heights))
  // Chart.js gives each category 80% of its width for the bars, split evenly between the series.
  const centre = 0.5 + 0.8 * ((series + 0.5) / data.datasets.length - 0.5)
  const canvas = chart.locator('canvas')
  const box = (await canvas.boundingBox())!
  // The plot starts after the y axis (about 60 px). Try a few points across the bar, low in the plot.
  const plotLeft = 58
  const cat = (box.width - plotLeft) / data.labels.length
  for (const dx of [0, -0.04, 0.04, -0.08, 0.08]) {
    const x = plotLeft + cat * at + cat * (centre + dx)
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
    const usage = await readUsage(page)
    const reads = watchPointReads(page, 'llm_usage')
    await openInShell(page, '/reports/llm-usage')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(usage.total, { timeout: 20_000 })
    await expect(f.locator('[data-tile-id="text"]')).toContainText(usage.summary)
    await page.waitForTimeout(500)
    const before = reads.length

    await chooseModel(page, f, 'claude-sonnet-4-6')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(usage.modelTotal('claude-sonnet-4-6'), { timeout: 10_000 })
    await expect(f.locator('[data-selection="model"] [data-selection-value]')).toContainText('claude-sonnet-4-6')
    await page.waitForTimeout(500)
    const afterModel = reads.slice(before)
    console.log('reads after model', JSON.stringify(afterModel))
    expect(afterModel).not.toContain('summary')
    expect(afterModel).toContain('tokens')

    // Clear all: every tile returns to its value for no argument.
    await f.locator('[data-selections-clear-all]').click()
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(usage.total, { timeout: 10_000 })
    await expect(f.locator('[data-tile-id="by_model"] tbody tr')).toHaveCount(usage.byModelRows)
    await expect(f.locator('[data-tile-id="model_picker"] [role="combobox"]')).toContainText('All')
    await expect(f.locator('[data-selections]')).toHaveCount(0)
  })

  test('a bar click sets the day for the table only', async ({ page }) => {
    // 2026-08-31 is a seeded day with two models; the chat demo only adds later days.
    const usage = await readUsage(page)
    const day = usage.onDay('2026-08-31', 'claude-sonnet-4-6')
    const reads = watchPointReads(page, 'llm_usage')
    await openInShell(page, '/reports/llm-usage')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(usage.total, { timeout: 20_000 })
    await expect.poll(() => chartLabels(f, 'by_day'), { timeout: 10_000 }).toBe(usage.days.length)
    await page.waitForTimeout(800)
    const before = reads.length

    await clickCategoryBar(f, 'by_day', '2026-08-31')
    await expect(f.locator('[data-selection="day"] [data-selection-value]')).toContainText('2026-08-31')
    await expect(f.locator('[data-tile-id="by_model"] tbody tr')).toHaveCount(day.models)
    await expect(f.locator('[data-tile-id="by_model"]')).toContainText(day.tokens, { timeout: 10_000 })
    await page.waitForTimeout(500)
    const afterClick = reads.slice(before)
    console.log('reads after bar click', JSON.stringify(afterClick))
    expect(afterClick).toEqual(['by_model'])

    await f.locator('[data-selection-clear="day"]').click()
    await expect(f.locator('[data-tile-id="by_model"]')).toContainText(usage.modelTotal('claude-sonnet-4-6'), { timeout: 10_000 })
  })

  test('the model comes from the path on a direct link', async ({ page }) => {
    // Let the shell that sign-in opened finish loading, so this navigation cancels none of its loads.
    await page.waitForLoadState('networkidle')
    const usage = await readUsage(page)
    await page.goto('/reports/llm-usage/claude-haiku-4-5')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(usage.modelTotal('claude-haiku-4-5'), { timeout: 30_000 })
    await expect(f.locator('[data-selection="model"] [data-selection-value]')).toContainText('claude-haiku-4-5')
  })
})


test.describe('stage E: plugins and live data', () => {
  test('plugin 1 shows the latest run as a tree', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
    await openInShell(page, '/ops/app-activity')
    const run = pageFrame(page, 'app_activity').locator('[data-tile-id="run"]')
    await expect(run).toContainText('9.14 s', { timeout: 20_000 })
    // innerText stops at shadow roots, so collect the text through them.
    const text = (await run.evaluate((root) => {
      const parts: string[] = []
      const walk = (n: Node) => {
        const el = n as Element
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT')
          return
        if (n.nodeType === Node.TEXT_NODE)
          parts.push(n.textContent ?? '')
        if (el.shadowRoot)
          walk(el.shadowRoot)
        for (const c of Array.from(n.childNodes)) walk(c)
      }
      walk(root)
      return parts.join(' ')
    })).replace(/\s+/g, ' ')
    console.log('run tile', text.slice(0, 300))
    expect(text).toMatch(/workflow/)
    expect(text).toMatch(/completed/)
    expect(text).toMatch(/7\.17 s/)
    expect(text).toMatch(/1 ms/)
    // The rendered tree: two top-level nodes, agent and func, and one child of agent, tool.call.
    const rows = await run.locator('.run-timeline__node').evaluateAll(nodes => nodes.map(n => [
      n.querySelector('.run-timeline__name')?.textContent?.trim() ?? '',
      getComputedStyle(n).getPropertyValue('--depth').trim(),
    ]))
    expect(rows).toEqual([['agent', '0'], ['tool.call', '1'], ['func', '0']])
  })

  // The engine checks every read against the point's declared schema, so a plugin function whose
  // output stops matching its tile's schema turns these reads into `failed` / `format_mismatch`.
  test('plugin functions pass the engine schema check on a live read', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
    const run = JSON.parse((await api(page, 'GET', '/api/v1/dashboards/pages/app_activity/points/run')).body)
    expect(run.state).toBe('ready')
    expect(run.data.run.duration_ms).toBe(9139)
    expect(run.data.nodes).toHaveLength(2)
    expect(run.data.nodes[0].children).toHaveLength(1)
    expect(run.data.nodes[1].children).toEqual([])
    const users = JSON.parse((await api(page, 'GET', '/api/v1/dashboards/pages/app_activity/points/users')).body)
    expect(users.state).toBe('ready')
    expect(users.data.users).toHaveLength(3)
    expect(users.live_topic).toBe('dash.users.changed')
  })

  test('plugin 2 updates in another browser through the live signal', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    const reads = watchPointReads(viewer, 'app_activity')
    await openInShell(viewer, '/ops/app-activity')
    const vf = pageFrame(viewer, 'app_activity')
    await expect(vf.locator('[data-tile-id="users"] tr[data-user-id]')).toHaveCount(3, { timeout: 20_000 })
    const target = statusCell(vf, 'target@wippy.local')
    await expect(target).toHaveText('active')
    await viewer.evaluate(() => { (window as any).__noReload = 1 })
    await viewer.waitForTimeout(1000)

    try {
      // A change with no signal does not show: the point has no timed refresh.
      expect((await api(admin, 'PUT', '/api/v1/users/target%40wippy.local', { status: 'inactive' })).status).toBe(200)
      await viewer.waitForTimeout(1500)
      await expect(target).toHaveText('active')
      const before = reads.length
      expect((await api(admin, 'POST', '/api/v1/demo/signal/users', {})).status).toBe(200)
      await expect(target).toHaveText('inactive', { timeout: 10_000 })
      await viewer.waitForTimeout(800)
      console.log('reads after signal', JSON.stringify(reads.slice(before)))
      expect(reads.slice(before)).toEqual(['users'])
      expect(await viewer.evaluate(() => (window as any).__noReload)).toBe(1)

      // Five signals in one burst cause one read.
      const burstStart = reads.length
      await admin.evaluate(async () => {
        const token = JSON.parse(localStorage.getItem('@wippy_token_info') || 'null')?.token
        await Promise.all([1, 2, 3, 4, 5].map(() => fetch('/api/v1/demo/signal/users', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })))
      })
      await viewer.waitForTimeout(1500)
      console.log('reads after burst', JSON.stringify(reads.slice(burstStart)))
      expect(reads.slice(burstStart)).toEqual(['users'])
    }
    finally {
      await api(admin, 'PUT', '/api/v1/users/target%40wippy.local', { status: 'active' })
      await api(admin, 'POST', '/api/v1/demo/signal/users', {})
    }
  })
})

function newKey() {
  return `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const ACTION = '/api/v1/dashboards/pages/app_activity/actions/set_status'

async function targetStatus(page: Page): Promise<string> {
  const r = JSON.parse((await api(page, 'GET', '/api/v1/dashboards/pages/app_activity/points/users')).body)
  return r.data.users.find((u: { user_id: string }) => u.user_id === 'target@wippy.local').status
}

test.describe('stage F: plan section 7 checks not covered above', () => {
  test('a width change across 1024 changes the layout and sends no read', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    const usage = await readUsage(page)
    const reads = watchPointReads(page, 'llm_usage')
    await openInShell(page, '/reports/llm-usage')
    const f = pageFrame(page, 'llm_usage')
    await expect(f.locator('[data-tile-id="tokens"]')).toContainText(usage.total, { timeout: 20_000 })
    await page.waitForTimeout(800)
    const wide = await boxes(f, ['text', 'model_picker'])
    expect(wide.text.y).toBe(wide.model_picker.y)
    const before = reads.length
    await page.setViewportSize({ width: 900, height: 900 })
    await expect.poll(async () => {
      const b = await boxes(f, ['text', 'model_picker'])
      return b.model_picker.y > b.text.y
    }, { timeout: 10_000 }).toBe(true)
    await page.waitForTimeout(800)
    expect(reads.slice(before)).toEqual([])
  })

  test('the admin changes a status in the page, and the open viewer browser updates through the live signal', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    await openInShell(viewer, '/ops/app-activity')
    const viewerStatus = statusCell(pageFrame(viewer, 'app_activity'), 'target@wippy.local')
    await expect(viewerStatus).toHaveText('active', { timeout: 20_000 })
    await viewer.evaluate(() => { (window as any).__noReload = 1 })

    await openInShell(admin, '/ops/app-activity')
    const af = pageFrame(admin, 'app_activity')
    const adminStatus = statusCell(af, 'target@wippy.local')
    await expect(adminStatus).toHaveText('active', { timeout: 20_000 })
    const button = af.locator('[data-tile-id="users"] tr[data-user-id="target@wippy.local"] [data-action="set_status"]')
    const posts: string[] = []
    admin.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/actions/'))
        posts.push(pathOf(r.url()))
    })
    try {
      // Cancel sends nothing and changes nothing.
      await button.click()
      await (await confirmation(admin, af)).getByRole('button', { name: 'Cancel' }).click()
      await admin.waitForTimeout(1000)
      expect(posts).toEqual([])
      await expect(adminStatus).toHaveText('active')

      // Confirm sends one call. The admin's tile reads again, and the viewer's open page follows
      // through the live signal with no reload.
      await button.click()
      await (await confirmation(admin, af)).getByRole('button', { name: 'Confirm' }).click()
      await expect(adminStatus).toHaveText('inactive', { timeout: 10_000 })
      expect(posts).toEqual([ACTION])
      await expect(viewerStatus).toHaveText('inactive', { timeout: 10_000 })
      expect(await viewer.evaluate(() => (window as any).__noReload)).toBe(1)
    }
    finally {
      await api(admin, 'POST', ACTION, { args: { user_id: 'target@wippy.local', status: 'active' }, idempotency_key: newKey() })
    }
    await expect(viewerStatus).toHaveText('active', { timeout: 10_000 })
  })

  test('the admin sees the status controls and the viewer without the permission does not', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')

    // The props say per viewer whether the action may run.
    const adminProps = JSON.parse((await api(admin, 'GET', '/api/v1/dashboards/pages/app_activity/props')).body)
    const viewerProps = JSON.parse((await api(viewer, 'GET', '/api/v1/dashboards/pages/app_activity/props')).body)
    expect(adminProps.tiles.users.actions.set_status.allowed).toBe(true)
    expect(viewerProps.tiles.users.actions.set_status.allowed).toBe(false)

    await openInShell(admin, '/ops/app-activity')
    const adminUsers = pageFrame(admin, 'app_activity').locator('[data-tile-id="users"]')
    await expect(adminUsers.locator('tr[data-user-id="target@wippy.local"] [data-action="set_status"]')).toBeVisible({ timeout: 20_000 })

    await openInShell(viewer, '/ops/app-activity')
    const viewerUsers = pageFrame(viewer, 'app_activity').locator('[data-tile-id="users"]')
    await expect(viewerUsers.locator('tr[data-user-id]')).toHaveCount(3, { timeout: 20_000 })
    await expect(viewerUsers.locator('[data-action="set_status"]')).toHaveCount(0)
    await expect(viewerUsers.locator('.user-status__actions-head')).toHaveCount(0)
  })

  test('one key runs once, another value with that key is refused, the viewer is refused', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    expectFailures(admin, { status: 409, path: ACTION })
    expectFailures(viewer, { status: 403, path: ACTION })
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    // The viewer can read the users point but may not run the action.
    expect((await api(viewer, 'GET', '/api/v1/dashboards/pages/app_activity/points/users')).status).toBe(200)

    // Each run of the action sends the live signal, and the viewer's open page reads users once per
    // signal (signals within 250 ms join). So the viewer's reads count the runs.
    const reads = watchPointReads(viewer, 'app_activity')
    await openInShell(viewer, '/ops/app-activity')
    await expect(pageFrame(viewer, 'app_activity').locator('[data-tile-id="users"] tr[data-user-id]')).toHaveCount(3, { timeout: 20_000 })
    await viewer.waitForTimeout(1000)
    const runsSince = (mark: number) => reads.slice(mark).filter(point => point === 'users').length

    const key = newKey()
    try {
      let mark = reads.length
      const first = JSON.parse((await api(admin, 'POST', ACTION, { args: { user_id: 'target@wippy.local', status: 'inactive' }, idempotency_key: key })).body)
      expect(first.state).toBe('done')
      await expect.poll(() => runsSince(mark), { timeout: 10_000 }).toBe(1)
      await viewer.waitForTimeout(1500)
      expect(runsSince(mark)).toBe(1)

      // The same key again: the stored result comes back, and the action does not run.
      mark = reads.length
      const again = JSON.parse((await api(admin, 'POST', ACTION, { args: { user_id: 'target@wippy.local', status: 'inactive' }, idempotency_key: key })).body)
      expect(again.state).toBe('done')
      expect(again.replayed).toBe(true)
      // Another value with the same key: refused, and the action does not run.
      const other = await api(admin, 'POST', ACTION, { args: { user_id: 'target@wippy.local', status: 'active' }, idempotency_key: key })
      expect(other.status).toBe(409)
      expect(JSON.parse(other.body).error.code).toBe('idempotency_conflict')
      // The viewer is refused with the permission code, and the action does not run.
      const denied = await api(viewer, 'POST', ACTION, { args: { user_id: 'target@wippy.local', status: 'active' }, idempotency_key: newKey() })
      expect(denied.status).toBe(403)
      expect(JSON.parse(denied.body).error.code).toBe('dash.users.set_status')
      await viewer.waitForTimeout(2000)
      expect(runsSince(mark)).toBe(0)
      expect(await targetStatus(admin)).toBe('inactive')
    }
    finally {
      await api(admin, 'POST', ACTION, { args: { user_id: 'target@wippy.local', status: 'active' }, idempotency_key: newKey() })
    }
    expect(await targetStatus(admin)).toBe('active')
  })

  test('reserved, malformed and duplicate routes are refused and routes stay up', async ({ page }) => {
    expectFailures(page, { status: 400, path: '/api/v1/dashboards/pages' })
    await loginAsAdmin(page)
    const spec = (id: string, route: string) => ({
      spec: 'wippy.dashboard_page/v1',
      id,
      title: 'Route check',
      route,
      tiles: { a: { type: 'placeholder' } },
      layout: { layouts: { default: { direction: 'vertical', children: [{ panel: 'a', size: '200px' }] } } },
      publish: true,
    })
    const cases: Array<[string, string, string]> = [
      ['e2e_route_login', '/login/x', 'reserved_route'],
      ['e2e_route_upper', '/Reports/x', 'invalid_route'],
      ['e2e_route_dup', '/reports/llm-usage', 'duplicate_route'],
    ]
    for (const [id, route, code] of cases) {
      const r = await api(page, 'POST', '/api/v1/dashboards/pages', spec(id, route))
      expect(r.status, route).toBe(400)
      expect(JSON.parse(r.body).error.code, route).toBe(code)
    }
    // Parameter types are the board's names; `text` is not one (the fixture coord_ph_two uses `string`).
    const textParam = await api(page, 'POST', '/api/v1/dashboards/pages', {
      ...spec('e2e_param_text', '/e2e/param-text'),
      params: { q: { type: 'text', from_path: 0 } },
    })
    expect(textParam.status).toBe(400)
    expect(JSON.parse(textParam.body).error.code).toBe('invalid_spec')
    const routes = await api(page, 'GET', '/api/public/pages/routes')
    expect(routes.status).toBe(200)
    expect(JSON.parse(routes.body).routes['/reports/llm-usage/:part(.*)*']).toBe('wippy.dashboards.pages:llm_usage')
  })
})

test.describe('stage B: page host and dashboard-layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
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
    await page.setViewportSize(WIDE)
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
