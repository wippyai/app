import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { FrameLocator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { api } from './helpers/page-watch'

/**
 * Helpers of the two LLM specs of the dashboards agent (dashboards-eval.spec.ts and
 * dashboards-discovery.spec.ts): the spend cap that the two specs share, the chat panel, the page
 * list, the catalogue and the tool calls of a Researcher run. Both specs call a real LLM, so they run
 * only with RUN_LLM_DEMO=1.
 */

/** The cap of decision A: the evaluation and the Researcher test together spend at most this much. */
export const SPEND_CAP_USD = 5

const SPEND_FILE = '.local/tmp/dashboards-llm-spend.json'

/**
 * Prices in USD per million tokens, input then output. The evaluation runs the chat agent's model
 * (deepseek-v4.1-flash through OpenRouter: $0.13 and $0.52). A model that is not listed is priced high
 * on purpose, so that the cap holds whichever model the Researcher's class resolves to.
 */
const PRICES: Array<[RegExp, [number, number]]> = [
  [/deepseek-v4\.1-flash/, [0.13, 0.52]],
]
const FALLBACK_PRICE: [number, number] = [3, 15]

/** The time the first LLM spec of this campaign started. Both specs count the spend from it. */
export function spendStart(): string {
  if (existsSync(SPEND_FILE)) {
    const saved = JSON.parse(readFileSync(SPEND_FILE, 'utf8')) as { started: string }
    return saved.started
  }
  mkdirSync('.local/tmp', { recursive: true })
  const started = new Date().toISOString()
  writeFileSync(SPEND_FILE, JSON.stringify({ started, cap_usd: SPEND_CAP_USD }, null, 2))
  return started
}

export interface RawUsageRow {
  timestamp: string
  model_id: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  thinking_tokens: number
}

/** The raw LLM calls of the app (administrators only). */
export async function rawUsage(page: Page): Promise<RawUsageRow[]> {
  const r = await api(page, 'GET', '/api/v1/demo/raw/usage-rows')
  expect(r.status, r.body).toBe(200)
  return (JSON.parse(r.body) as { rows: RawUsageRow[] }).rows
}

/** What the LLM calls since the campaign started cost, from the app's own usage table. */
export async function spentUsd(page: Page): Promise<number> {
  const since = Date.parse(spendStart())
  let total = 0
  for (const row of await rawUsage(page)) {
    const at = Date.parse(row.timestamp.includes('T') ? row.timestamp : `${row.timestamp.replace(' ', 'T')}Z`)
    if (!Number.isNaN(at) && at < since)
      continue
    const [input, output] = PRICES.find(([re]) => re.test(row.model_id))?.[1] ?? FALLBACK_PRICE
    total += (row.prompt_tokens * input + (row.completion_tokens + (row.thinking_tokens || 0)) * output) / 1e6
  }
  return total
}

/**
 * The most that one model request (one chat turn, or one Researcher run) is assumed to cost before it
 * starts. A turn starts only when the spend so far plus this is under the cap, so one turn cannot take
 * the campaign far past it.
 */
export const TURN_RESERVE_USD = 0.25

export class SpendCapReached extends Error {
  constructor(public readonly spent: number) {
    super(`the spend cap of $${SPEND_CAP_USD} is reached (spent $${spent.toFixed(3)})`)
  }
}

/** Throws SpendCapReached when another model request would not fit under the cap. Call it before each one. */
export async function assertBudget(page: Page, reserve = TURN_RESERVE_USD): Promise<number> {
  spendStart()
  const spent = await spentUsd(page)
  if (spent + reserve >= SPEND_CAP_USD)
    throw new SpendCapReached(spent)
  return spent
}

// ── the chat panel ──────────────────────────────────────────────────────

function shell(page: Page) {
  return page.frameLocator('iframe[name="wippy:page:app.views:main"]')
}

/** Opens the chat panel from the home page. */
export async function openChat(page: Page) {
  const box = page.getByPlaceholder('Type a message')
  const matches = shell(page).getByText('Ask Wippy', { exact: true })
  await expect(matches.first()).toBeVisible({ timeout: 20_000 })
  for (let attempt = 0; attempt < 6 && !(await box.isVisible()); attempt++) {
    const count = await matches.count()
    await matches.nth(attempt % Math.max(count, 1)).click()
    await page.waitForTimeout(2500)
  }
  await expect(box).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
}

export async function send(page: Page, text: string) {
  const box = page.getByPlaceholder('Type a message')
  await box.fill(text)
  await box.press('Enter')
}

/** A page link that the agent gives: into the home page (/home/dash/...), or a page's own route. */
export const PAGE_LINK = 'a[href*="/dash/"]'

/** The page a chat link points to: /home/dash/<slug> belongs to wippy.dashboards.pages:gen_<slug>. */
export function pageIdOf(href: string): string {
  return `gen_${href.replace(/^.*\/dash\//, '').replace(/-/g, '_')}`
}

/** The ids of the pages this signed-in user may open, from the live page list. */
export async function listedIds(page: Page): Promise<string[]> {
  const res = await api(page, 'GET', '/api/public/pages/list')
  expect(res.status, res.body).toBe(200)
  return (JSON.parse(res.body).pages as Array<{ id: string }>).map(p => p.id).sort()
}

// ── pages, points and the catalogue ─────────────────────────────────────

export interface Frame { schema?: string, fields: Array<{ name: string, type?: string, role?: string }>, rows: unknown[][] }

export interface Envelope {
  point: string
  state: string
  data?: any
  args?: Record<string, unknown>
  source_title?: string
  error?: { code: string, message: string }
}

export interface CatalogueDoc {
  tiles: Array<{ tile: string, default_data: Record<string, { point: string }>, default_actions: Record<string, string> }>
  points: Array<{ id: string, title: string, form: string }>
  mappers: Array<{ id: string }>
}

/** The catalogue document, as the signed-in user gets it. */
export async function catalogue(page: Page): Promise<CatalogueDoc> {
  const r = await api(page, 'GET', '/api/v1/dashboards/catalogue')
  expect(r.status, r.body).toBe(200)
  return JSON.parse(r.body)
}

export interface PageProps {
  title: string
  tiles: Record<string, { tag: string, tile: string, param?: string, fields: Record<string, string | string[]>, options: Record<string, unknown>, data: Record<string, { point: string, args: Record<string, unknown> }>, actions: Record<string, unknown> }>
  params: Record<string, unknown>
}

/** The compiled props of a published page; null when the page does not exist. */
export async function pageProps(page: Page, pageId: string): Promise<PageProps | null> {
  const r = await api(page, 'GET', `/api/v1/dashboards/pages/${pageId}/props`)
  if (r.status === 404)
    return null
  expect(r.status, r.body).toBe(200)
  return JSON.parse(r.body)
}

/** Reads one point of a page as the signed-in user. Arguments the page binds to a parameter go in `args`. */
export async function readPoint(page: Page, pageId: string, point: string, args?: Record<string, unknown>): Promise<Envelope> {
  const query = args && Object.keys(args).length > 0 ? `?args=${encodeURIComponent(JSON.stringify(args))}` : ''
  const r = await api(page, 'GET', `/api/v1/dashboards/pages/${pageId}/points/${point}${query}`)
  expect(r.status, `${pageId}/${point}: ${r.body}`).toBe(200)
  return JSON.parse(r.body)
}

/** The arguments of a tile input that a read sends: the fixed values, and `bound` for the parameters. */
export function fixedArgs(args: Record<string, unknown>, bound: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    const param = (value as { $param?: string } | null)?.$param
    if (param === undefined)
      out[key] = value
    else if (param in bound)
      out[key] = bound[param]
  }
  return out
}

/** Removes a page, ignoring one that is already gone. */
export async function removePage(page: Page, pageId: string) {
  const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${pageId}`)
  expect([200, 404], removed.body).toContain(removed.status)
}

/**
 * The frame status of every tile that a page drew in the browser, from the board's own attribute.
 * A page opens on its own route (its board is a top-level frame of the Host), or inside the home page
 * through the app's page outlet (a w-artifact inside the shell); this reads whichever one has tiles.
 */
export async function frameStatuses(page: Page, pageId: string): Promise<Record<string, string>> {
  const direct = page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${pageId}"]`)
  const nested = page.frameLocator('iframe[name="wippy:page:app.views:main"]').frameLocator(`w-artifact[id="wippy.dashboards.pages:${pageId}"] iframe`)
  for (const board of [direct, nested]) {
    try {
      const found = await board.locator('[data-tile-id]').evaluateAll(els =>
        Object.fromEntries(els.map(el => [el.getAttribute('data-tile-id') ?? '', el.getAttribute('data-frame-status') ?? ''])))
      if (Object.keys(found).length > 0)
        return found
    }
    catch {}
  }
  return {}
}

// ── what the board draws ─────────────────────────────────────────────────

/** The board of a page as a frame locator: on its own route, or inside the home page through the outlet. */
export async function boardFrame(page: Page, pageId: string): Promise<FrameLocator> {
  const direct = page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${pageId}"]`)
  const nested = page.frameLocator('iframe[name="wippy:page:app.views:main"]').frameLocator(`w-artifact[id="wippy.dashboards.pages:${pageId}"] iframe`)
  for (const board of [direct, nested]) {
    try {
      if (await board.locator('[data-tile-id]').count() > 0)
        return board
    }
    catch {}
  }
  return direct
}

export interface RenderedChart { labels: string[], datasets: Array<{ label: string, data: Array<number | null> }> }

/** What a chart tile hands to Chart.js: its labels and the plotted numbers of each dataset. */
export async function renderedChart(board: FrameLocator, tileId: string): Promise<RenderedChart | null> {
  const raw = await board.locator(`[data-tile-id="${tileId}"] wippy-chartjs`).first().getAttribute('data', { timeout: 5000 }).catch(() => null)
  if (!raw)
    return null
  const parsed = JSON.parse(raw) as RenderedChart
  return { labels: (parsed.labels ?? []).map(String), datasets: parsed.datasets ?? [] }
}

/** The text of every cell that a table tile drew, row by row. */
export async function renderedTable(board: FrameLocator, tileId: string): Promise<string[][]> {
  return board.locator(`[data-tile-id="${tileId}"] tbody tr`).evaluateAll(rows =>
    rows.map(row => Array.from(row.querySelectorAll('td')).map(cell => (cell.textContent ?? '').trim())))
}

/** The text a tile drew. */
export async function renderedText(board: FrameLocator, tileId: string): Promise<string> {
  return (await board.locator(`[data-tile-id="${tileId}"]`).first().innerText({ timeout: 5000 }).catch(() => '')).trim()
}

/** A number as a tile writes it: digits with an optional thousands separator of any kind. */
export function numberPattern(n: unknown): RegExp {
  const digits = String(Math.round(Number(n)))
  const groups: string[] = []
  for (let i = digits.length; i > 0; i -= 3)
    groups.unshift(digits.slice(Math.max(0, i - 3), i))
  return new RegExp(groups.join('[,.\\s\\u00a0\\u202f]?'))
}

/** The number that a cell of text holds, without its thousands separators; NaN when it holds none. */
export function cellNumber(text: string): number {
  return Number(text.replace(/[,\s\u00a0\u202f]/g, ''))
}

// ── the tool calls of an agent run ──────────────────────────────────────

export interface ToolCall { name: string, args: any }

const TOOLS = new Set(['DashboardCatalogue', 'PreviewDataPoint', 'BuildDashboard'])

function decode(value: unknown): any {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

/**
 * The calls to the three tools in a stored agent run, in the order they were made.
 *
 * The run is the JSON that GET /api/v1/dataflows/{id} returns (wippy/dataflow, api/get_dataflow.lua):
 * { success, dataflow, nodes, data }. Each LLM step of an agent node stores one data record of type
 * "agent.action" (node/agent/node.lua, store_agent_action): its key is "<iteration>_action" (the last
 * one "<iteration>_final"), its metadata holds the iteration number, and its content is JSON, stored as
 * text, of the form { result, tool_calls, delegate_calls }. Each tool call there is
 * { id, name, arguments, registry_id }, where name is the llm_alias of the tool. So the calls are read
 * from those records, ordered by the iteration, and within a step in the order the model made them.
 * A run without such a record is an error, not an empty list: the shape has changed.
 */
export function toolCalls(run: unknown): ToolCall[] {
  const calls: ToolCall[] = []
  for (const step of agentSteps(run)) {
    for (const call of step.calls) {
      const registryAlias = call.registry_id?.split(':').pop()
      const name = call.name && TOOLS.has(call.name)
        ? call.name
        : ({ catalogue: 'DashboardCatalogue', preview_point: 'PreviewDataPoint', build_dashboard: 'BuildDashboard' } as Record<string, string>)[registryAlias ?? '']
      if (name)
        calls.push({ name, args: decode(call.arguments) })
    }
  }
  return calls
}

interface RawCall { name?: string, arguments?: unknown, registry_id?: string }

/** The "agent.action" records of a run as steps, in the order of their iteration. */
function agentSteps(run: unknown): Array<{ calls: RawCall[] }> {
  const records = (run as { data?: unknown } | null)?.data
  if (!Array.isArray(records))
    throw new Error(`the run has no data records (keys: ${Object.keys((run as object) ?? {}).join(', ')})`)
  return records
    .map((record, index) => ({ record: record as Record<string, any>, index }))
    .filter(({ record }) => record?.type === 'agent.action')
    .map(({ record, index }) => {
      const metadata = decode(record.metadata) ?? {}
      const iteration = Number(metadata.iteration ?? /^(\d+)_/.exec(String(record.key ?? ''))?.[1])
      const content = decode(record.content)
      return { calls: (Array.isArray(content?.tool_calls) ? content.tool_calls : []) as RawCall[], iteration: Number.isNaN(iteration) ? Infinity : iteration, index }
    })
    .sort((x, y) => x.iteration - y.iteration || x.index - y.index)
}

/** The tools that a run used, in order, whatever they were (for a failure message). */
export function toolNames(run: unknown): string[] {
  return agentSteps(run).flatMap(step => step.calls.map(call => String(call.name)))
}

/**
 * Waits for a dataflow to end and returns its stored run. `stop` is asked on every poll: when it
 * throws (the spend cap), the dataflow is cancelled and the error goes on.
 */
export async function finishedRun(page: Page, dataflowId: string, timeoutMs: number, stop?: () => Promise<void>): Promise<any> {
  const end = Date.now() + timeoutMs
  let last: any
  while (Date.now() < end) {
    const r = await api(page, 'GET', `/api/v1/dataflows/${dataflowId}`)
    if (r.status === 200) {
      last = JSON.parse(r.body)
      const status = String(last.dataflow?.status ?? last.status ?? '').toLowerCase()
      if (['completed', 'complete', 'succeeded', 'success', 'failed', 'cancelled', 'canceled', 'terminated'].includes(status))
        return last
    }
    if (stop) {
      try {
        await stop()
      }
      catch (e) {
        await api(page, 'POST', `/api/v1/dataflows/${dataflowId}/cancel`)
        throw e
      }
    }
    await page.waitForTimeout(3000)
  }
  throw new Error(`dataflow ${dataflowId} did not end within ${timeoutMs} ms; last: ${JSON.stringify(last)?.slice(0, 300)}`)
}
