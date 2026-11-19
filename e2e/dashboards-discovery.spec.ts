import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, openInShell } from './helpers/page-watch'
import type { Frame } from './dashboards-agent.support'
import {
  SPEND_CAP_USD,
  catalogue,
  finishedRun,
  frameStatuses,
  pageProps,
  rawUsage,
  readPoint,
  removePage,
  spendStart,
  spentUsd,
  toolCalls,
} from './dashboards-agent.support'

/**
 * RC1-20, the Researcher test of discovery contract section 6. The demo's Researcher agent
 * (src/app/research) has only DashboardCatalogue, PreviewDataPoint and BuildDashboard. It gets the
 * request "make a dashboard of token use by model" through the research endpoint, which runs it as a
 * dataflow. The test passes when all of these hold:
 *   1. the tool calls of the run include DashboardCatalogue before the first BuildDashboard;
 *   2. the build request uses only ids from the catalogue (points, tiles, mappers) and the page exists;
 *   3. the page has a tile that shows tokens grouped by model, and each model's value equals the sum
 *      that this test computes from the raw rows of the app's own token_usage table;
 *   4. no tile of the page shows an error frame in the browser.
 * The test checks the tool calls, the request and the page, not the agent's wording.
 *
 * It calls a real LLM, so it runs only with RUN_LLM_DEMO=1, and it counts against the spend cap of
 * decision A ($5), shared with dashboards-eval.spec.ts through .local/tmp/dashboards-llm-spend.json.
 * It passes in at least two of three runs: each run is one test of this file, and the last test counts.
 *
 * The part of the run that shows the tool calls is read from GET /api/v1/dataflows/{id}
 * (support.toolCalls describes how a call is recognised). If a Wippy release stores runs in another
 * shape, the first assertion fails with the keys that the run has; adjust toolCalls, not the checks.
 */
test.skip(process.env.RUN_LLM_DEMO !== '1', 'calls a real LLM; set RUN_LLM_DEMO=1 to run')
test.describe.configure({ mode: 'serial' })

const RUNS = 3
const REQUEST = 'Make a dashboard of token use by model.'

const outcomes: Array<{ pass: boolean, reasons: string[] }> = []

/** The sums per model that a tile of tokens by model may show, from the raw rows. */
function expectedSums(rows: Awaited<ReturnType<typeof rawUsage>>) {
  const out = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const m = out.get(r.model_id) ?? { prompt_tokens: 0, completion_tokens: 0, total: 0, total_tokens: 0, thinking_tokens: 0, calls: 0 }
    m.prompt_tokens += r.prompt_tokens
    m.completion_tokens += r.completion_tokens
    m.total += r.prompt_tokens + r.completion_tokens
    m.total_tokens += r.total_tokens
    m.thinking_tokens += r.thinking_tokens || 0
    m.calls += 1
    out.set(r.model_id, m)
  }
  return out
}

for (let run = 1; run <= RUNS; run++) {
  test(`the Researcher builds tokens by model from the catalogue (run ${run} of ${RUNS})`, async ({ page }) => {
    test.setTimeout(420_000)
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
    spendStart()
    const spent = await spentUsd(page)
    if (spent >= SPEND_CAP_USD) {
      test.skip(true, `the spend cap of $${SPEND_CAP_USD} is reached ($${spent.toFixed(2)})`)
      return
    }

    const reasons: string[] = []
    const stamp = `${Date.now().toString(36)}${run}`
    const title = `Researcher Tokens ${stamp}`
    const pageId = `gen_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    const doc = await catalogue(page)

    const started = await api(page, 'POST', '/api/v1/research', { query: `${REQUEST} Title the page "${title}".` })
    expect(started.status, started.body).toBe(200)
    const dataflowId = JSON.parse(started.body).dataflow_id as string
    expect(dataflowId).toBeTruthy()
    const stored = await finishedRun(page, dataflowId, 360_000)

    try {
      // 1. The catalogue before the first build.
      const calls = toolCalls(stored)
      const names = calls.map(c => c.name)
      expect(names.length, `no tool calls found in the run; its keys: ${Object.keys(stored).join(', ')}`).toBeGreaterThan(0)
      const firstBuild = names.indexOf('BuildDashboard')
      expect(firstBuild, `calls: ${names.join(', ')}`).toBeGreaterThanOrEqual(0)
      const firstCatalogue = names.indexOf('DashboardCatalogue')
      expect(firstCatalogue, `calls: ${names.join(', ')}`).toBeGreaterThanOrEqual(0)
      expect(firstCatalogue, 'DashboardCatalogue comes before the first BuildDashboard').toBeLessThan(firstBuild)

      // 2. Only ids from the catalogue, in every build request.
      const points = new Set(doc.points.map(p => p.id))
      const tiles = new Set(doc.tiles.map(t => t.tile))
      const mappers = new Set(doc.mappers.map(m => m.id))
      for (const call of calls.filter(c => c.name === 'BuildDashboard')) {
        const request = call.args as { pages?: unknown[] } & Record<string, any>
        const pages = request.pages ?? [request]
        for (const p of pages as Array<{ filters?: any[], tiles?: any[] }>) {
          for (const f of p.filters ?? []) {
            if (f.options_point)
              expect(points.has(f.options_point), `filter point ${f.options_point}`).toBe(true)
          }
          for (const t of p.tiles ?? []) {
            expect(tiles.has(t.type), `tile type ${t.type}`).toBe(true)
            const refs = [t, ...Object.values(t.data ?? {})] as any[]
            for (const r of refs) {
              if (r.point)
                expect(points.has(r.point), `point ${r.point}`).toBe(true)
              if (r.mapper?.ref)
                expect(mappers.has(r.mapper.ref), `mapper ${r.mapper.ref}`).toBe(true)
            }
          }
        }
      }
      const props = await pageProps(page, pageId)
      expect(props, `the page ${pageId} was published`).not.toBeNull()

      // 3. A tile with tokens by model, and each model's value equal to the sum from the raw rows.
      const sums = expectedSums(await rawUsage(page))
      let matched = ''
      const seen: string[] = []
      for (const [tileId, tile] of Object.entries(props!.tiles)) {
        for (const input of Object.values(tile.data)) {
          const env = await readPoint(page, pageId, input.point)
          if (env.state !== 'ready' || env.data?.schema !== 'wippy.dashboard_frame/v1')
            continue
          const frame = env.data as Frame
          const dim = frame.fields.findIndex(f => f.type === 'string' && frame.rows.length > 0 && frame.rows.every(r => sums.has(String(r[frame.fields.indexOf(f)]))))
          if (dim < 0)
            continue
          const models = new Set(frame.rows.map(r => String(r[dim])))
          if (models.size !== sums.size)
            continue
          const keys = ['prompt_tokens', 'completion_tokens', 'total', 'total_tokens']
          const measures = frame.fields.map((f, i) => ({ f, i })).filter(({ f }) => f.role === 'measure' || f.type === 'number')
          for (const { f, i } of measures) {
            seen.push(`${tileId}.${f.name}`)
            // One consistent kind of sum for every model: the same key for each row.
            const ok = keys.some(k => frame.rows.every(r => sums.get(String(r[dim]))![k] === Number(r[i])))
            if (ok) {
              matched = `${tileId}.${f.name}`
              break
            }
          }
          if (matched)
            break
        }
        if (matched)
          break
      }
      expect(matched, `no tile shows tokens by model equal to the raw sums; looked at ${seen.join(', ')}`).not.toBe('')

      // 4. No error frame in the browser.
      await openInShell(page, `/dash/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
      await expect.poll(async () => Object.keys(await frameStatuses(page, pageId)).length, { timeout: 30_000 }).toBe(Object.keys(props!.tiles).length)
      await expect.poll(async () => Object.values(await frameStatuses(page, pageId)).every(s => s === 'ready'), { timeout: 30_000 }).toBe(true)
      outcomes.push({ pass: true, reasons })
    }
    catch (e) {
      // A run that fails is not a failed test: the last test counts the runs.
      reasons.push(String(e).slice(0, 600))
      outcomes.push({ pass: false, reasons })
      console.log(`run ${run} failed`, reasons.join(' '))
    }
    finally {
      await removePage(page, pageId)
    }
  })
}

test('the Researcher test passes in at least two of three runs', () => {
  const passed = outcomes.filter(o => o.pass).length
  console.log('researcher runs', JSON.stringify(outcomes))
  expect(passed, `passed ${passed} of ${outcomes.length} runs`).toBeGreaterThanOrEqual(2)
})
