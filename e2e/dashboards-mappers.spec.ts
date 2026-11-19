import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'

/**
 * Mappers (RC1-18). The demo's points read rows from a source and map them with the example mappers
 * of src/mock_mappers; the page `llm_calls` maps the open point `usage_rows` three ways. The checks
 * compare what the mapped points return with each other and with the self-test, so they hold for
 * whatever data the app holds now (the chat demo adds rows). The exact values of the tiles are checked
 * by dashboards.spec.ts, which is unchanged.
 */

const MAPPERS = [
  'mock.mappers:bucket_by_time',
  'mock.mappers:first_row_to_record',
  'mock.mappers:rows_to_frame',
  'mock.mappers:sum_by',
  'mock.mappers:top_n',
]

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    const build = await api(page, 'POST', '/api/v1/demo/build', {})
    expect(build.status, build.body).toBe(200)
  }
  finally {
    await context.close()
  }
})

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

interface Frame { fields: Array<{ name: string }>, rows: unknown[][] }

/** Reads a point of a published page as the signed-in user and returns the whole envelope. */
async function readEnvelope(page: Page, pageId: string, point: string, args?: Record<string, unknown>): Promise<any> {
  const query = args ? `?args=${encodeURIComponent(JSON.stringify(args))}` : ''
  const r = await api(page, 'GET', `/api/v1/dashboards/pages/${pageId}/points/${point}${query}`)
  expect(r.status, `${pageId}/${point}: ${r.body}`).toBe(200)
  return JSON.parse(r.body)
}

async function readFrame(page: Page, pageId: string, point: string, args?: Record<string, unknown>): Promise<Frame> {
  const envelope = await readEnvelope(page, pageId, point, args)
  expect(envelope.state, `${pageId}/${point}`).toBe('ready')
  return envelope.data
}

function column(frame: Frame, name: string): unknown[] {
  const i = frame.fields.findIndex(f => f.name === name)
  expect(i, `field ${name}`).toBeGreaterThanOrEqual(0)
  return frame.rows.map(r => r[i])
}

function sum(values: unknown[]): number {
  return (values as number[]).reduce((a, b) => a + Number(b), 0)
}

test.describe('the example mappers', () => {
  test('the self-test runs every example of the five mappers, each with at least three', async ({ page }) => {
    await loginAsAdmin(page)
    const r = await api(page, 'GET', '/api/v1/demo/mappers/selftest')
    expect(r.status, r.body).toBe(200)
    const result = JSON.parse(r.body) as { ok: boolean, mappers: Array<{ id: string, examples: number, passed: number, failures: unknown[] }> }
    expect(result.mappers.map(m => m.id)).toEqual(MAPPERS)
    for (const m of result.mappers) {
      expect(m.examples, `${m.id} examples`).toBeGreaterThanOrEqual(3)
      expect(m.passed, `${m.id} passed`).toBe(m.examples)
      expect(m.failures, `${m.id} failures`).toEqual([])
    }
    expect(result.ok).toBe(true)
  })

  test('only an administrator may run the self-test', async ({ browser }) => {
    const viewer = await newPage(browser, 'viewer')
    expectFailures(viewer, { status: 403, path: '/demo/mappers/selftest' })
    await loginAs(viewer, 'viewer@wippy.local')
    const r = await api(viewer, 'GET', '/api/v1/demo/mappers/selftest')
    expect(r.status, r.body).toBe(403)
  })
})

test.describe('the demo points, now with sources and mappers', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('LLM usage: the mapped points agree with each other', async ({ page }) => {
    const tokens = await readFrame(page, 'llm_usage', 'tokens')
    const byModel = await readFrame(page, 'llm_usage', 'by_model')
    const byDay = await readFrame(page, 'llm_usage', 'by_day')
    const models = await readFrame(page, 'llm_usage', 'models')
    const summary = (await readEnvelope(page, 'llm_usage', 'summary')).data as { text: string }

    const total = Number(column(tokens, 'tokens')[0])
    const calls = Number(column(tokens, 'calls')[0])
    expect(total).toBeGreaterThan(0)
    expect(sum(column(byModel, 'tokens'))).toBe(total)
    expect(sum(column(byModel, 'calls'))).toBe(calls)
    expect(sum(column(byDay, 'tokens'))).toBe(total)
    expect(models.rows.length).toBe(byModel.rows.length)
    // The record mapper kept the sentence that the source wrote, with the same numbers.
    const modelTokens = column(byModel, 'tokens').map(Number)
    const top = String(column(byModel, 'model_id')[modelTokens.indexOf(Math.max(...modelTokens))])
    expect(summary.text).toMatch(new RegExp(`^${calls} calls used ${total} tokens\\. ${top.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} used [\\d.]+% of them\\.$`))
  })

  test('App activity: the mapped points agree with each other', async ({ page }) => {
    const sessions = await readFrame(page, 'app_activity', 'sessions')
    const messages = await readFrame(page, 'app_activity', 'messages')
    const byMonth = await readFrame(page, 'app_activity', 'sessions_by_month')
    const types = await readFrame(page, 'app_activity', 'message_types')
    expect(sum(column(byMonth, 'sessions'))).toBe(Number(sessions.rows[0][0]))
    expect(sum(column(types, 'messages'))).toBe(Number(messages.rows[0][0]))
  })

  test('a model that made no call gives an empty frame, never a zero', async ({ page }) => {
    const envelope = await readEnvelope(page, 'llm_usage', 'tokens', { model: 'no-such-model' })
    expect(envelope.state).toBe('empty')
    expect(envelope.data.rows).toEqual([])
  })
})

test.describe('an open point mapped by a page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('the three mappings add up to the same totals as the declared points', async ({ page }) => {
    const tokens = await readFrame(page, 'llm_usage', 'tokens')
    const byDayDeclared = await readFrame(page, 'llm_usage', 'by_day')
    const total = Number(column(tokens, 'tokens')[0])
    const calls = Number(column(tokens, 'calls')[0])

    // sum_by: one row per model, sorted by model id in byte order.
    const byModel = await readFrame(page, 'llm_calls', 'by_model')
    const ids = column(byModel, 'model_id') as string[]
    expect(ids).toEqual([...ids].sort())
    expect(sum(column(byModel, 'prompt_tokens')) + sum(column(byModel, 'completion_tokens'))).toBe(total)

    // bucket_by_time: one row per day, in date order, with the same days as the declared point.
    const perDay = await readFrame(page, 'llm_calls', 'per_day')
    const days = column(perDay, 'day') as string[]
    expect(days).toEqual([...days].sort())
    expect(days).toEqual([...new Set(column(byDayDeclared, 'day') as string[])].sort())
    expect(sum(column(perDay, 'total_tokens'))).toBe(total)

    // top_n with other: the five largest calls, largest first, and one row that sums the rest.
    const largest = await readFrame(page, 'llm_calls', 'largest')
    const values = column(largest, 'total_tokens').map(Number)
    const names = column(largest, 'timestamp') as string[]
    if (calls > 5) {
      expect(largest.rows.length).toBe(6)
      expect(names[5]).toBe('Other')
      expect(values.slice(0, 5)).toEqual([...values.slice(0, 5)].sort((a, b) => b - a))
    }
    else {
      expect(largest.rows.length).toBe(calls)
      expect(names).not.toContain('Other')
    }
    expect(sum(values)).toBe(total)
  })

  test('a model filter reaches the source and the mapper', async ({ page }) => {
    const models = await readFrame(page, 'llm_calls', 'models')
    const model = String(column(models, 'value').at(-1))
    const filtered = await readFrame(page, 'llm_calls', 'by_model', { model })
    expect(column(filtered, 'model_id')).toEqual([model])
    const declared = await readFrame(page, 'llm_usage', 'tokens', { model })
    expect(sum(column(filtered, 'prompt_tokens')) + sum(column(filtered, 'completion_tokens'))).toBe(Number(column(declared, 'tokens')[0]))
  })

  test('a field that rows_schema leaves out never reaches the browser', async ({ page }) => {
    for (const point of ['models', 'by_model', 'largest', 'per_day']) {
      const r = await api(page, 'GET', `/api/v1/dashboards/pages/llm_calls/points/${point}`)
      expect(r.status).toBe(200)
      expect(r.body, point).not.toContain('thinking_tokens')
    }
    const props = await api(page, 'GET', '/api/v1/dashboards/pages/llm_calls/props')
    expect(props.body).not.toContain('thinking_tokens')
  })

  test('the page draws a chart per model, a chart per day and a table of the largest calls', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    const byModel = await readFrame(page, 'llm_calls', 'by_model')
    const largest = await readFrame(page, 'llm_calls', 'largest')
    await openInShell(page, '/reports/llm-calls')
    const f: FrameLocator = page.frameLocator('iframe[name="wippy:page:wippy.dashboards.pages:llm_calls"]')
    await expect(f.locator('[data-tile-id="largest"] tbody tr')).toHaveCount(largest.rows.length, { timeout: 20_000 })
    const labels = async (tileId: string) => {
      const data = await f.locator(`[data-tile-id="${tileId}"] wippy-chartjs`).getAttribute('data')
      return data ? (JSON.parse(data).labels ?? []).length : -1
    }
    await expect.poll(() => labels('by_model'), { timeout: 10_000 }).toBe(byModel.rows.length)
    await expect.poll(() => labels('per_day'), { timeout: 10_000 }).toBeGreaterThan(0)
  })
})
