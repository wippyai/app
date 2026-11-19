import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'

/**
 * Mappers (RC1-18). The demo's points read rows from a source and map them with the example mappers
 * of src/mock_mappers; the page `llm_calls` maps the open point `usage_rows` three ways.
 *
 * The expected values are computed here, in TypeScript, from the raw rows of the app's own tables
 * (`GET /api/v1/demo/raw/usage-rows`, administrators only), never from another mapped output. The
 * data is live (the chat demo adds rows), so nothing is a fixed snapshot. The exact values of the
 * tiles are checked by dashboards.spec.ts, which is unchanged.
 *
 * Note: the declared points count every row of token_usage, while the open point's source leaves out
 * a row with no timestamp or no model. The seeded data has no such row, and the totals below would
 * show the difference at once.
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

interface RawRow {
  timestamp: string
  day: string
  model_id: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  thinking_tokens: number
}

interface Raw {
  rows: RawRow[]
  counts: {
    sessions: number
    messages: number
    users: number
    sessions_by_month: Array<{ month: string, n: number }>
    messages_by_type: Array<{ type: string, n: number }>
  }
}

/** The raw rows and counts, as the signed-in administrator. */
async function readRaw(page: Page): Promise<Raw> {
  const r = await api(page, 'GET', '/api/v1/demo/raw/usage-rows')
  expect(r.status, r.body).toBe(200)
  return JSON.parse(r.body)
}

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

/** A frame as an array of objects keyed by field name, in row order. */
function records(frame: Frame): Array<Record<string, unknown>> {
  return frame.rows.map(row => Object.fromEntries(frame.fields.map((f, i) => [f.name, row[i]])))
}

const bytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Per model: calls and the sums of the token columns, from raw rows. */
function perModel(rows: RawRow[]) {
  const out = new Map<string, { calls: number, prompt: number, completion: number, total: number }>()
  for (const r of rows) {
    const m = out.get(r.model_id) ?? { calls: 0, prompt: 0, completion: 0, total: 0 }
    m.calls += 1
    m.prompt += r.prompt_tokens
    m.completion += r.completion_tokens
    m.total += r.total_tokens
    out.set(r.model_id, m)
  }
  return out
}

/** Per day: the sum of total_tokens, from raw rows, in date order. */
function perDay(rows: RawRow[]): Array<[string, number]> {
  const out = new Map<string, number>()
  for (const r of rows)
    out.set(r.day, (out.get(r.day) ?? 0) + r.total_tokens)
  return [...out.entries()].sort((a, b) => bytes(a[0], b[0]))
}

/**
 * The five largest calls, largest first, ties in input order (Array.sort is stable), and one row
 * "Other" with the sum of the rest when there are more than five.
 */
function largest(rows: RawRow[], n = 5): Array<[string, number]> {
  const ranked = [...rows].sort((a, b) => b.total_tokens - a.total_tokens)
  const top: Array<[string, number]> = ranked.slice(0, n).map(r => [r.timestamp, r.total_tokens])
  if (ranked.length > n)
    top.push(['Other', ranked.slice(n).reduce((sum, r) => sum + r.total_tokens, 0)])
  return top
}

test.describe('the example mappers', () => {
  test('the self-test runs every example, expected failure and conformance check, and every demo point', async ({ page }) => {
    await loginAsAdmin(page)
    const r = await api(page, 'GET', '/api/v1/demo/mappers/selftest')
    expect(r.status, r.body).toBe(200)
    const result = JSON.parse(r.body) as {
      ok: boolean
      mappers: Array<{
        id: string
        mock: boolean
        ok: boolean
        examples?: number
        passed?: number
        failures?: unknown[]
        expected_failures?: number
        expected_failures_passed?: number
        negative_failures?: unknown[]
        conformance: { ok: boolean, error?: string }
      }>
      points: Array<{ id: string, ok: boolean, error?: string }>
    }
    // Any installed mapper must pass the generic conformance check; the five of this module must
    // also meet the demo's own rules (three examples, expected failures).
    for (const m of result.mappers) {
      expect(m.conformance, `${m.id} conformance`).toEqual({ ok: true })
      expect(m.ok, m.id).toBe(true)
    }
    const mocks = result.mappers.filter(m => m.mock)
    expect(mocks.map(m => m.id)).toEqual(MAPPERS)
    for (const m of mocks) {
      expect(m.examples, `${m.id} examples`).toBeGreaterThanOrEqual(3)
      expect(m.passed, `${m.id} passed`).toBe(m.examples)
      expect(m.failures, `${m.id} failures`).toEqual([])
      expect(m.expected_failures, `${m.id} expected failures`).toBeGreaterThanOrEqual(2)
      expect(m.expected_failures_passed, `${m.id} expected failures passed`).toBe(m.expected_failures)
      expect(m.negative_failures, `${m.id} negative failures`).toEqual([])
      expect(m.conformance, `${m.id} conformance`).toEqual({ ok: true })
      expect(m.ok, m.id).toBe(true)
    }
    // Every demo point with a source and a mapper, and the open point.
    expect(result.points.length).toBeGreaterThanOrEqual(15)
    expect(result.points.map(p => p.id)).toContain('demo.actor:usage_rows')
    for (const p of result.points)
      expect(p.ok, `${p.id}: ${p.error}`).toBe(true)
    expect(result.ok).toBe(true)
  })

  test('only an administrator may run the self-test or read the raw rows', async ({ browser }) => {
    const viewer = await newPage(browser, 'viewer')
    expectFailures(viewer, { status: 403, path: '/demo/mappers/selftest' }, { status: 403, path: '/demo/raw/usage-rows' })
    await loginAs(viewer, 'viewer@wippy.local')
    const selftest = await api(viewer, 'GET', '/api/v1/demo/mappers/selftest')
    expect(selftest.status, selftest.body).toBe(403)
    const raw = await api(viewer, 'GET', '/api/v1/demo/raw/usage-rows')
    expect(raw.status, raw.body).toBe(403)
  })
})

test.describe('the demo points, now with sources and mappers', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('LLM usage shows the values that the raw rows give', async ({ page }) => {
    const raw = await readRaw(page)
    expect(raw.rows.length).toBeGreaterThan(0)
    const models = perModel(raw.rows)
    const total = raw.rows.reduce((sum, r) => sum + r.total_tokens, 0)

    const tokens = records(await readFrame(page, 'llm_usage', 'tokens'))
    expect(tokens).toEqual([{ tokens: total, calls: raw.rows.length }])

    // Token use by model: every model once, with its calls and tokens, as the raw rows add up.
    const byModel = records(await readFrame(page, 'llm_usage', 'by_model'))
    expect(byModel.map(r => r.model_id).sort(bytes)).toEqual([...models.keys()].sort(bytes))
    for (const row of byModel) {
      const expected = models.get(String(row.model_id))!
      expect(row, String(row.model_id)).toEqual({ model_id: row.model_id, calls: expected.calls, tokens: expected.total })
    }
    // Largest first.
    const tokensColumn = byModel.map(r => Number(r.tokens))
    expect(tokensColumn).toEqual([...tokensColumn].sort((a, b) => b - a))

    // Token use by day: one row per day and model.
    const byDay = records(await readFrame(page, 'llm_usage', 'by_day'))
    const dayModel = new Map<string, number>()
    for (const r of raw.rows) {
      const key = `${r.day}|${r.model_id}`
      dayModel.set(key, (dayModel.get(key) ?? 0) + r.total_tokens)
    }
    expect(byDay.length).toBe(dayModel.size)
    for (const row of byDay)
      expect(dayModel.get(`${row.day}|${row.model}`), `${row.day} ${row.model}`).toBe(Number(row.tokens))

    // The models for the filter, with the label that the source writes.
    const options = records(await readFrame(page, 'llm_usage', 'models'))
    expect(options).toEqual([...models.entries()].sort((a, b) => bytes(a[0], b[0])).map(([id, m]) => ({ value: id, label: `${id} (${m.calls} calls)` })))
  })

  test('LLM usage: the summary is the sentence that the raw rows give', async ({ page }) => {
    const raw = await readRaw(page)
    const models = perModel(raw.rows)
    const total = raw.rows.reduce((sum, r) => sum + r.total_tokens, 0)
    const best = Math.max(...[...models.values()].map(m => m.total))
    const share = Math.floor(best / total * 1000 + 0.5) / 10
    // With a tie for the top model, either may be named.
    const tops = [...models.entries()].filter(([, m]) => m.total === best).map(([id]) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const summary = (await readEnvelope(page, 'llm_usage', 'summary')).data as { text: string }
    expect(summary.text).toMatch(new RegExp(`^${raw.rows.length} calls used ${total} tokens\\. (${tops.join('|')}) used ${String(share).replace('.', '\\.')}% of them\\.$`))
  })

  test('App activity shows the counts that the raw tables give', async ({ page }) => {
    const { counts } = await readRaw(page)
    const sessions = records(await readFrame(page, 'app_activity', 'sessions'))
    expect(sessions).toEqual([{ sessions: counts.sessions }])
    const messages = records(await readFrame(page, 'app_activity', 'messages'))
    expect(messages).toEqual([{ messages: counts.messages }])
    const byMonth = records(await readFrame(page, 'app_activity', 'sessions_by_month'))
    expect(byMonth).toEqual(counts.sessions_by_month.map(r => ({ month: r.month, sessions: r.n })))
    const types = records(await readFrame(page, 'app_activity', 'message_types'))
    const byType = new Map(types.map(r => [String(r.type), Number(r.messages)]))
    expect(byType).toEqual(new Map(counts.messages_by_type.map(r => [r.type, r.n])))
    // Largest first (the order of the source).
    const sizes = types.map(r => Number(r.messages))
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
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

  test('the three mappings give the values that the raw rows give', async ({ page }) => {
    const raw = await readRaw(page)
    expect(raw.rows.length).toBeGreaterThan(0)
    const models = perModel(raw.rows)

    // sum_by: one row per model, in byte order, with the sums of both token columns.
    const byModel = records(await readFrame(page, 'llm_calls', 'by_model'))
    expect(byModel).toEqual([...models.entries()].sort((a, b) => bytes(a[0], b[0])).map(([id, m]) => ({
      model_id: id,
      prompt_tokens: m.prompt,
      completion_tokens: m.completion,
    })))

    // bucket_by_time on the day column: one row per day, in date order.
    const days = records(await readFrame(page, 'llm_calls', 'per_day'))
    expect(days).toEqual(perDay(raw.rows).map(([day, tokens]) => ({ day, total_tokens: tokens })))

    // top_n with other: the five largest calls and one row for the rest.
    const top = records(await readFrame(page, 'llm_calls', 'largest'))
    expect(top).toEqual(largest(raw.rows).map(([timestamp, tokens]) => ({ timestamp, total_tokens: tokens })))
  })

  test('a model filter reaches the source and the mapper', async ({ page }) => {
    const raw = await readRaw(page)
    const model = [...new Set(raw.rows.map(r => r.model_id))].sort(bytes).at(-1)!
    const mine = raw.rows.filter(r => r.model_id === model)
    const byModel = records(await readFrame(page, 'llm_calls', 'by_model', { model }))
    expect(byModel).toEqual([{
      model_id: model,
      prompt_tokens: mine.reduce((s, r) => s + r.prompt_tokens, 0),
      completion_tokens: mine.reduce((s, r) => s + r.completion_tokens, 0),
    }])
    const top = records(await readFrame(page, 'llm_calls', 'largest', { model }))
    expect(top).toEqual(largest(mine).map(([timestamp, tokens]) => ({ timestamp, total_tokens: tokens })))
  })

  test('a column that rows_schema leaves out never reaches the browser', async ({ page }) => {
    // The source does return it: the raw rows hold it, so its absence below means something.
    const raw = await readRaw(page)
    expect(raw.rows.every(r => 'thinking_tokens' in r)).toBe(true)

    for (const point of ['models', 'by_model', 'largest', 'per_day']) {
      const r = await api(page, 'GET', `/api/v1/dashboards/pages/llm_calls/points/${point}`)
      expect(r.status).toBe(200)
      expect(r.body, point).not.toContain('thinking_tokens')
    }
    // The compiled page and, when the catalogue endpoint exists, the catalogue.
    const props = await api(page, 'GET', '/api/v1/dashboards/pages/llm_calls/props')
    expect(props.body).not.toContain('thinking_tokens')
    const catalogue = await api(page, 'GET', '/api/v1/dashboards/catalogue')
    if (catalogue.status === 200)
      expect(catalogue.body).not.toContain('thinking_tokens')
  })

  test('the page draws a chart per model, a chart per day and a table of the largest calls', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    const raw = await readRaw(page)
    const modelCount = new Set(raw.rows.map(r => r.model_id)).size
    const dayCount = perDay(raw.rows).length
    await openInShell(page, '/reports/llm-calls')
    const f: FrameLocator = page.frameLocator('iframe[name="wippy:page:wippy.dashboards.pages:llm_calls"]')
    await expect(f.locator('[data-tile-id="largest"] tbody tr')).toHaveCount(largest(raw.rows).length, { timeout: 20_000 })
    const labels = async (tileId: string) => {
      const data = await f.locator(`[data-tile-id="${tileId}"] wippy-chartjs`).getAttribute('data')
      return data ? (JSON.parse(data).labels ?? []).length : -1
    }
    await expect.poll(() => labels('by_model'), { timeout: 10_000 }).toBe(modelCount)
    await expect.poll(() => labels('per_day'), { timeout: 10_000 }).toBe(dayCount)
  })
})
