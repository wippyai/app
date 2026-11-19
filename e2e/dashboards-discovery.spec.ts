import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, openInShell } from './helpers/page-watch'
import {
  SPEND_CAP_USD,
  SpendCapReached,
  assertBudget,
  boardFrame,
  catalogue,
  cellNumber,
  finishedRun,
  frameStatuses,
  pageProps,
  rawUsage,
  removePage,
  renderedChart,
  renderedTable,
  spendStart,
  spentUsd,
  toolCalls,
  toolNames,
} from './dashboards-agent.support'

/**
 * RC1-20, the Researcher test of discovery contract section 6. The demo's Researcher agent
 * (src/app/research) keeps its web tool and has the three dashboards tools DashboardCatalogue,
 * PreviewDataPoint and BuildDashboard. It gets the request "make a dashboard of token use by model"
 * through the research endpoint, which runs it as a dataflow. The test passes when all of these hold:
 *   1. the tool calls of the run include DashboardCatalogue before the first BuildDashboard, and the
 *      agent used the dashboard tools and not the web tool for this question;
 *   2. the build request uses only ids from the catalogue (points, tiles, mappers) and the page exists;
 *   3. the board draws a chart or a table of tokens grouped by model, and each model's drawn value
 *      equals the sum that this test computes from the raw rows of the app's own token_usage table (the
 *      numbers that the chart plots, or the cells of the table, not an API read). A tile that draws
 *      calls instead of tokens does not match;
 *   4. every tile of the board has the frame status ready: no error frame.
 * The test checks the tool calls, the request and the page, not the agent's wording.
 *
 * It calls a real LLM, so it runs only with RUN_LLM_DEMO=1, and it counts against the spend cap of
 * decision A ($5), shared with dashboards-eval.spec.ts through .local/tmp/dashboards-llm-spend.json.
 * The cap is checked before the run starts and on every poll of the run, which cancels the run when the
 * cap is reached. It passes in at least two of three runs: each run is one test of this file, and the
 * last test counts.
 *
 * The tool calls are read from GET /api/v1/dataflows/{id}: the "agent.action" records of the run
 * (support.toolCalls describes the shape, which comes from the wippy/dataflow source). A run that has no
 * such record makes the run fail with the keys that it has.
 */
test.skip(process.env.RUN_LLM_DEMO !== '1', 'calls a real LLM; set RUN_LLM_DEMO=1 to run')
test.describe.configure({ mode: 'serial' })

const RUNS = 3
const REQUEST = 'Make a dashboard of token use by model.'

const outcomes: Array<{ pass: boolean, skipped: boolean, reasons: string[] }> = []

/** The sums per model that a tile of tokens by model may draw, from the raw rows. */
function expectedSums(rows: Awaited<ReturnType<typeof rawUsage>>) {
  const out = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const m = out.get(r.model_id) ?? { prompt_tokens: 0, completion_tokens: 0, total: 0, total_tokens: 0, thinking_tokens: 0 }
    m.prompt_tokens += r.prompt_tokens
    m.completion_tokens += r.completion_tokens
    m.total += r.prompt_tokens + r.completion_tokens
    m.total_tokens += r.total_tokens
    m.thinking_tokens += r.thinking_tokens || 0
    out.set(r.model_id, m)
  }
  return out
}

/** The kinds of token sum that a tile may show. Calls are not among them. */
const TOKEN_KEYS = ['prompt_tokens', 'completion_tokens', 'total', 'total_tokens']

/** Does one column of drawn numbers, one for each model, equal one kind of token sum? */
function isTokenSum(models: string[], values: Array<number | null>, sums: Map<string, Record<string, number>>): boolean {
  if (models.length !== sums.size || models.length !== values.length)
    return false
  return TOKEN_KEYS.some(key => models.every((m, i) => sums.get(m)?.[key] === values[i]))
}

for (let run = 1; run <= RUNS; run++) {
  test(`the Researcher builds tokens by model from the catalogue (run ${run} of ${RUNS})`, async ({ page }) => {
    test.setTimeout(420_000)
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
    spendStart()

    const reasons: string[] = []
    const stamp = `${Date.now().toString(36)}${run}`
    const title = `Researcher Tokens ${stamp}`
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const pageId = `gen_${slug.replace(/-/g, '_')}`
    try {
      // The cap is checked before the model is asked, and again on every poll of the run.
      await assertBudget(page)
      const doc = await catalogue(page)
      const started = await api(page, 'POST', '/api/v1/research', { query: `${REQUEST} Title the page "${title}".` })
      expect(started.status, started.body).toBe(200)
      const dataflowId = JSON.parse(started.body).dataflow_id as string
      expect(dataflowId).toBeTruthy()
      const stored = await finishedRun(page, dataflowId, 360_000, async () => {
        await assertBudget(page, 0)
      })

      // 1. The catalogue before the first build, and the dashboard tools for this question.
      const calls = toolCalls(stored)
      const names = calls.map(c => c.name)
      const firstBuild = names.indexOf('BuildDashboard')
      expect(firstBuild, `calls: ${toolNames(stored).join(', ')}`).toBeGreaterThanOrEqual(0)
      const firstCatalogue = names.indexOf('DashboardCatalogue')
      expect(firstCatalogue, `calls: ${toolNames(stored).join(', ')}`).toBeGreaterThanOrEqual(0)
      expect(firstCatalogue, 'DashboardCatalogue comes before the first BuildDashboard').toBeLessThan(firstBuild)
      expect(toolNames(stored), 'the web tool is not used for a question about the app\'s own data').not.toContain('WebGet')

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
      const tileIds = Object.keys(props!.tiles)

      // 4 first, because 3 reads the board: the page opens on its own route, and every tile is ready.
      await openInShell(page, `/dash/${slug}`)
      await expect.poll(async () => Object.keys(await frameStatuses(page, pageId)).length, { timeout: 30_000 }).toBe(tileIds.length)
      await expect.poll(async () => Object.values(await frameStatuses(page, pageId)).every(s => s === 'ready'), { timeout: 30_000 }).toBe(true)

      // 3. What the board draws: tokens by model, equal to the raw sums.
      const sums = expectedSums(await rawUsage(page))
      const board = await boardFrame(page, pageId)
      let matched = ''
      const seen: string[] = []
      for (const [tileId, tile] of Object.entries(props!.tiles)) {
        if (tile.tile === 'chart') {
          const chart = await renderedChart(board, tileId)
          if (!chart)
            continue
          for (const set of chart.datasets) {
            seen.push(`${tileId}/${set.label}`)
            if (isTokenSum(chart.labels, set.data, sums))
              matched = `${tileId}/${set.label}`
          }
        }
        else if (tile.tile === 'table') {
          const rows = await renderedTable(board, tileId)
          const width = Math.max(0, ...rows.map(r => r.length))
          for (let col = 0; col < width; col++) {
            const models = rows.map(r => r.find(cell => sums.has(cell)) ?? '')
            const values = rows.map(r => (r[col] === undefined ? Number.NaN : cellNumber(r[col])))
            seen.push(`${tileId}/column ${col}`)
            if (!values.some(Number.isNaN) && isTokenSum(models, values, sums))
              matched = `${tileId}/column ${col}`
          }
        }
        if (matched)
          break
      }
      expect(matched, `no tile draws tokens by model equal to the raw sums; looked at ${seen.join(', ')}`).not.toBe('')
      outcomes.push({ pass: true, skipped: false, reasons })
    }
    catch (e) {
      // A run that fails is not a failed test: the last test counts the runs.
      reasons.push(String(e).slice(0, 600))
      outcomes.push({ pass: false, skipped: e instanceof SpendCapReached, reasons })
      console.log(`run ${run} ${e instanceof SpendCapReached ? 'not completed' : 'failed'}`, reasons.join(' '))
    }
    finally {
      await removePage(page, pageId)
      console.log(`spent $${(await spentUsd(page)).toFixed(3)} of $${SPEND_CAP_USD}`)
    }
  })
}

test('the Researcher test passes in at least two of three runs', () => {
  const passed = outcomes.filter(o => o.pass).length
  console.log('researcher runs', JSON.stringify(outcomes))
  expect(passed, `passed ${passed} of ${outcomes.length} runs`).toBeGreaterThanOrEqual(2)
})
