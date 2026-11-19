import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
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

// ── the tool calls of an agent run ──────────────────────────────────────

export interface ToolCall { name: string, args: any }

const TOOLS = new Set(['DashboardCatalogue', 'PreviewDataPoint', 'BuildDashboard'])

/**
 * The calls to the three tools in a stored agent run, in order. The run is the JSON that
 * GET /api/v1/dataflows/{id} returns. A tool call is an object that names one of the three tools
 * (under `name`, `tool`, `tool_name` or `function.name`) and carries its input (under `arguments`,
 * `args` or `input`): the tool definitions in a prompt name the tools too, but carry a schema, not input.
 * Objects are read in document order, which is the order of the run.
 */
export function toolCalls(run: unknown): ToolCall[] {
  const calls: ToolCall[] = []
  const seen = new Set<string>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node === null || typeof node !== 'object')
      return
    const o = node as Record<string, any>
    const name = [o.name, o.tool, o.tool_name, o.function?.name].find(v => typeof v === 'string' && TOOLS.has(v))
    const rawArgs = o.arguments ?? o.args ?? o.input ?? o.function?.arguments
    if (name && rawArgs !== undefined && o.input_schema === undefined && o.parameters === undefined) {
      let args = rawArgs
      if (typeof rawArgs === 'string') {
        try {
          args = JSON.parse(rawArgs)
        }
        catch {
          args = rawArgs
        }
      }
      // The same call can sit in two places of the run (the step and the conversation); count it once.
      const key = `${o.id ?? o.call_id ?? o.tool_call_id ?? ''}|${name}|${JSON.stringify(args)}`
      if (!seen.has(key)) {
        seen.add(key)
        calls.push({ name, args })
      }
    }
    Object.values(o).forEach(walk)
  }
  walk(run)
  return calls
}

/** Waits for a dataflow to end and returns its stored run. */
export async function finishedRun(page: Page, dataflowId: string, timeoutMs: number): Promise<any> {
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
    await page.waitForTimeout(3000)
  }
  throw new Error(`dataflow ${dataflowId} did not end within ${timeoutMs} ms; last: ${JSON.stringify(last)?.slice(0, 300)}`)
}
