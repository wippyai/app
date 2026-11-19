import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, openInShell } from './helpers/page-watch'
import type { CatalogueDoc, Envelope, PageProps } from './dashboards-agent.support'
import {
  PAGE_LINK,
  SPEND_CAP_USD,
  SpendCapReached,
  assertBudget,
  boardFrame,
  catalogue,
  chartProblem,
  expectedChart,
  fixedArgs,
  frameStatuses,
  listedIds,
  openChat,
  pageIdOf,
  pageProps,
  readPoint,
  removePage,
  renderedChart,
  renderedKpi,
  renderedTable,
  renderedText,
  sameNumber,
  send,
  spendStart,
  tableProblem,
  spentUsd,
} from './dashboards-agent.support'

/**
 * RC1-01 and decision A: the evaluation of the chat agent. Six written requests on the demo's data
 * (the "Evaluation request set" of docs/rc1-acceptance.md), each run three times (18 runs) with the
 * demo chat agent ("Ask Wippy", deepseek-v4.1-flash). The spend, together with the Researcher test
 * of dashboards-discovery.spec.ts, is capped at $5 (SPEND_CAP_USD), counted from the usage table of
 * the app; the runs stop when the cap is reached, and a run that did not happen counts as not passed.
 *
 * A run passes when it meets the RC1-01 check and the pages contain the expected content:
 *   - every page it asked for exists, and its link opens the page (the board draws every tile);
 *   - every tile shows real data: each of its inputs reads as `ready`, and the board's frame status of
 *     every tile is `ready` (no error frame);
 *   - every required point appears on the named page, in a tile that shows the measure and the grouping
 *     given in brackets in the request set (the tile's field mapping names those fields);
 *   - the data the tile reads equals a direct read of the point with the same arguments (through a
 *     reference page that this spec publishes, one data entry for each point);
 *   - a required filter re-reads only the tiles bound to it (request 3, in the browser);
 *   - no custom code or frontend build is involved: the pages only use the catalogue's tiles and points.
 * A request passes when at least two of its three runs pass; the evaluation passes when at least five
 * of the six requests pass. The last test of this file decides.
 *
 * The runs call a real LLM, so this file runs only with RUN_LLM_DEMO=1. It does not fail a run's test
 * when a run does not pass: the reasons go to the console, and the last test counts. Request 4 shows
 * the users tile, which lets admins change a status, so the prompt adds the user's consent sentence
 * that the agent needs before it may set confirmed: true (RC1-11).
 *
 * What the board drew is compared with the direct read, not only the API read: a number tile must draw
 * the number; a chart must plot the labels in order and every dataset's value label by label (the
 * algorithm of the chart tile, written again in the support file); a table must draw each row, and in
 * each shown column the cell that the value gives (a date only has to be filled, since it is drawn in the
 * viewer's format).
 *
 * Drawn values are compared with the responses that the board itself got for its tiles (the data is live,
 * and the evaluation's own LLM calls change it), and the direct read only checks the point, the fields and
 * the arguments that the agent chose. Request 3 chooses a model in the browser, because the page shows every
 * model until one is chosen. A turn that the model provider refuses ("Turn failed", for example a key limit)
 * stops the suite: it is no verdict on the agent. Known limit (accepted): the spend cap is a check
 * before each chat turn (and on every poll while it goes on) with one worker, not an atomic
 * reservation: two spec files that run at the same time can pass it together.
 */
test.skip(process.env.RUN_LLM_DEMO !== '1', 'calls a real LLM; set RUN_LLM_DEMO=1 to run')
test.describe.configure({ mode: 'serial' })

const RUNS_PER_REQUEST = 3
const CONSENT = ' I confirm that the page may let admins change a user\'s status.'

const P = {
  usage_tokens: 'demo.actor:usage_tokens',
  usage_by_day: 'demo.actor:usage_by_day',
  usage_by_model: 'demo.actor:usage_by_model',
  usage_models: 'demo.actor:usage_models',
  usage_summary: 'demo.actor:usage_summary',
  app_sessions: 'demo.actor:app_sessions',
  app_messages: 'demo.actor:app_messages',
  app_users: 'demo.actor:app_users',
  messages_by_day: 'demo.actor:messages_by_day',
  calls_by_day: 'demo.actor:calls_by_day',
  tokens_by_kind: 'demo.actor:tokens_by_kind',
  sessions_by_month: 'demo.actor:sessions_by_month',
  message_types: 'demo.actor:message_types',
  recent_sessions: 'demo.actor:recent_sessions',
  latest_run: 'demo.run_timeline:latest_run',
  users: 'demo.user_status:users',
} as const
type PointKey = keyof typeof P

/** A point that a page must show: the measure and grouping of the request set, in field names. */
interface Need {
  point: PointKey
  measure?: string
  group?: string
  /** The point's `model` argument follows the page's select filter. */
  bound?: boolean
  /** The point belongs to a plugin tile, which brings it by default. */
  plugin?: boolean
}

interface Request {
  n: number
  text: string
  consent?: boolean
  pages: Array<{ label: string, needs: Need[] }>
}

const REQUESTS: Request[] = [
  {
    n: 1,
    text: 'Show me LLM token use: the total, tokens per day, and a breakdown by model.',
    pages: [{ label: 'Tokens', needs: [
      { point: 'usage_tokens', measure: 'tokens' },
      { point: 'usage_by_day', measure: 'tokens', group: 'day' },
      { point: 'usage_by_model', measure: 'tokens', group: 'model_id' },
    ] }],
  },
  {
    n: 2,
    text: 'Make a page about chat activity: how many sessions and messages there are, and messages per day.',
    pages: [{ label: 'Chat', needs: [
      { point: 'app_sessions', measure: 'sessions' },
      { point: 'app_messages', measure: 'messages' },
      { point: 'messages_by_day', measure: 'messages', group: 'day' },
    ] }],
  },
  {
    n: 3,
    text: 'Token use for one model at a time: let me pick a model and see its token total and calls per day.',
    pages: [{ label: 'Model', needs: [
      { point: 'usage_models' },
      { point: 'usage_tokens', measure: 'tokens', bound: true },
      { point: 'calls_by_day', measure: 'calls', group: 'day', bound: true },
    ] }],
  },
  {
    n: 4,
    text: 'Show the latest workflow run and the list of users with their status.',
    consent: true,
    pages: [{ label: 'Run', needs: [
      { point: 'latest_run', plugin: true },
      { point: 'users', plugin: true },
    ] }],
  },
  {
    n: 5,
    text: 'Build two pages: one for LLM usage with tokens per day and tokens by kind, and one for chat with sessions by month and messages by type.',
    pages: [
      { label: 'Usage', needs: [
        { point: 'usage_by_day', measure: 'tokens', group: 'day' },
        { point: 'tokens_by_kind', measure: 'tokens', group: 'kind' },
      ] },
      { label: 'Chat', needs: [
        { point: 'sessions_by_month', measure: 'sessions', group: 'month' },
        { point: 'message_types', measure: 'messages', group: 'type' },
      ] },
    ],
  },
  {
    n: 6,
    text: 'Build an overview of three pages: users (how many, and the list), chat (sessions and the most recent ones), and LLM usage (a one-sentence summary and tokens by model).',
    consent: true,
    pages: [
      { label: 'Users', needs: [
        { point: 'app_users', measure: 'users' },
        { point: 'users', plugin: true },
      ] },
      { label: 'Chat', needs: [
        { point: 'app_sessions', measure: 'sessions' },
        { point: 'recent_sessions' },
      ] },
      { label: 'LLM', needs: [
        { point: 'usage_summary', measure: 'text' },
        { point: 'usage_by_model', measure: 'tokens', group: 'model_id' },
      ] },
    ],
  },
]

// ── reference pages: a direct read of each point ───────────────────────

const REF_PAGES = [
  { id: 'eval_ref_a', route: '/eval-ref/a', points: ['usage_tokens', 'usage_by_day', 'usage_by_model', 'usage_models', 'usage_summary', 'app_sessions', 'app_messages', 'app_users'] as PointKey[] },
  { id: 'eval_ref_b', route: '/eval-ref/b', points: ['messages_by_day', 'calls_by_day', 'tokens_by_kind', 'sessions_by_month', 'message_types', 'recent_sessions', 'latest_run', 'users'] as PointKey[] },
]
/** The points of the request set that take a model argument. */
const MODEL_POINTS = new Set<PointKey>(['usage_tokens', 'calls_by_day'])

const dataName = (key: PointKey) => key

function refSpec(ref: typeof REF_PAGES[number]) {
  const data: Record<string, unknown> = {}
  for (const key of ref.points) {
    data[dataName(key)] = { kind: 'function', ref: P[key], args: MODEL_POINTS.has(key) ? { model: { $param: 'model' } } : {} }
  }
  return {
    spec: 'wippy.dashboard_page/v1',
    publish: true,
    id: ref.id,
    title: `Evaluation reference ${ref.id}`,
    route: ref.route,
    params: { model: { type: 'string', label: 'Model' } },
    data,
    actions: {},
    tiles: {},
    layout: { layouts: { default: { direction: 'vertical', children: [] } } },
  }
}

function refPageOf(key: PointKey): string {
  return REF_PAGES.find(r => r.points.includes(key))!.id
}

/** A direct read of a point: through the reference page, with the same arguments. */
function directRead(page: Page, key: PointKey, model: string | null): Promise<Envelope> {
  return readPoint(page, refPageOf(key), dataName(key), model && MODEL_POINTS.has(key) ? { model } : undefined)
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    for (const ref of REF_PAGES) {
      await removePage(page, ref.id)
      const published = await api(page, 'POST', '/api/v1/dashboards/pages', refSpec(ref))
      expect(published.status, published.body).toBe(200)
    }
  }
  finally {
    await context.close()
  }
})

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    for (const ref of REF_PAGES)
      await removePage(page, ref.id)
    for (const id of builtIds)
      await removePage(page, id)
  }
  finally {
    await context.close()
  }
})

// ── checks of one run ──────────────────────────────────────────────────

const builtIds: string[] = []

/** The slot values of a tile's field mapping, flattened. */
function mappedFields(tile: PageProps['tiles'][string]): string[] {
  return Object.values(tile.fields).flat()
}

interface TileRead {
  id: string
  tile: PageProps['tiles'][string]
  /** Each input of the tile, read with the arguments the page fixes and the chosen model. */
  inputs: Record<string, Envelope>
}

/**
 * The point reads that the board itself made, as the browser saw them. What a tile draws is what it
 * read, so the drawn values are compared with these responses and not with a later read: the data is
 * live (the evaluation's own LLM calls add rows to it), and a later read differs by a turn or a message.
 */
class BoardReads {
  private latest = new Map<string, Envelope>()
  /** Every read in order, with the arguments it carried: for counting the re-reads of a filter. */
  readonly log: Array<{ pageId: string, point: string, args: Record<string, unknown> | undefined }> = []

  attach(page: Page) {
    page.on('response', async (r) => {
      const m = /\/api\/v1\/dashboards\/pages\/([^/]+)\/points\/([^/?]+)/.exec(r.url())
      if (!m || r.request().method() !== 'GET' || r.status() !== 200)
        return
      try {
        const env = await r.json() as Envelope
        this.latest.set(`${m[1]}/${m[2]}`, env)
        this.log.push({ pageId: m[1], point: m[2], args: env.args })
      }
      catch {}
    })
  }

  get(pageId: string, point: string): Envelope | undefined {
    return this.latest.get(`${pageId}/${point}`)
  }
}

/** The tiles of a page with the reads of their inputs that the board made. Inputs it did not read are left out. */
function tileReads(boardReads: BoardReads, pageId: string, props: PageProps): TileRead[] {
  return Object.entries(props.tiles).map(([id, tile]) => {
    const inputs: Record<string, Envelope> = {}
    for (const [input, source] of Object.entries(tile.data)) {
      const env = boardReads.get(pageId, source.point)
      if (env)
        inputs[input] = env
    }
    return { id, tile, inputs }
  })
}

/** Waits until the board has read every input of every tile of the page. */
async function untilRead(page: Page, boardReads: BoardReads, pageId: string, props: PageProps): Promise<void> {
  await expect.poll(() => tileReads(boardReads, pageId, props).every(r => Object.keys(r.inputs).length === Object.keys(r.tile.data).length), { timeout: 30_000 }).toBe(true)
}

/** The tiles of a page that show a needed point. */
function tilesFor(need: Need, reads: TileRead[], doc: CatalogueDoc): TileRead[] {
  const id = P[need.point]
  const pluginTypes = new Set(doc.tiles.filter(t => Object.keys(t.default_data ?? {}).length > 0).map(t => t.tile))
  if (need.plugin) {
    const type = doc.tiles.find(t => t.default_data?.main?.point === id)?.tile
    return reads.filter(r => r.tile.tile === type)
  }
  const title = doc.points.find(p => p.id === id)?.title
  return reads.filter(r => !pluginTypes.has(r.tile.tile) && r.inputs.main?.source_title === title)
}

function boundParams(tile: PageProps['tiles'][string]): string[] {
  const out: string[] = []
  for (const source of Object.values(tile.data)) {
    for (const value of Object.values(source.args)) {
      const param = (value as { $param?: string } | null)?.$param
      if (param)
        out.push(param)
    }
  }
  return out
}

/**
 * Request 3: the page shows every model until one is chosen, so the check chooses one in the browser, as a
 * viewer does. Returns the model that the bound inputs were then read with, or a reason. Choosing must
 * re-read exactly the inputs that use the filter, once each, and no other input.
 */
async function chooseModel(page: Page, boardReads: BoardReads, pageId: string, props: PageProps, reasons: string[]): Promise<string | null> {
  const picker = Object.entries(props.tiles).find(([, t]) => t.tile === 'control.select')
  if (!picker || !picker[1].param) {
    reasons.push('request 3: the page has no select tile with a filter')
    return null
  }
  const param = picker[1].param as string
  const bound = new Set<string>()
  for (const tile of Object.values(props.tiles)) {
    for (const source of Object.values(tile.data)) {
      if (Object.values(source.args).some(x => (x as { $param?: string } | null)?.$param === param))
        bound.add(source.point)
    }
  }
  if (bound.size === 0) {
    reasons.push('request 3: no tile reads a point with the filter')
    return null
  }
  const board = await boardFrame(page, pageId)
  const combo = board.locator(`[data-tile-id="${picker[0]}"] [role="combobox"]`)
  await expect(combo).toBeVisible({ timeout: 30_000 })
  const mark = boardReads.log.length
  await combo.focus()
  await page.keyboard.press('Enter')
  const options = board.locator('[role="option"]')
  await expect(options.first()).toBeVisible({ timeout: 5000 })
  // The last option is a model, not the entry that clears the filter.
  await options.last().click()
  await expect.poll(() => [...bound].every(point => typeof boardReads.get(pageId, point)?.args?.model === 'string'), { timeout: 20_000 }).toBe(true)
  await page.waitForTimeout(3000)
  const counts = new Map<string, number>()
  for (const read of boardReads.log.slice(mark).filter(x => x.pageId === pageId))
    counts.set(read.point, (counts.get(read.point) ?? 0) + 1)
  if (JSON.stringify([...counts.keys()].sort()) !== JSON.stringify([...bound].sort()))
    reasons.push(`request 3: choosing a model re-read ${JSON.stringify([...counts])}, expected exactly ${JSON.stringify([...bound])}`)
  for (const [name, n] of counts) {
    if (n !== 1)
      reasons.push(`request 3: ${name} was read ${n} times after the filter changed`)
  }
  return boardReads.get(pageId, [...bound][0])?.args?.model as string
}

/** The language of the browser, which is the locale that the tiles format numbers in. */
async function locale(page: Page): Promise<string> {
  return page.evaluate(() => navigator.language || 'en-US')
}

/** The index of a field in a frame, or -1. */
function fieldIndex(frame: { fields: Array<{ name: string }> }, name: string | undefined): number {
  return name === undefined ? -1 : frame.fields.findIndex(f => f.name === name)
}

/**
 * Compares what the board drew for a tile with the direct read of its point. Returns what differs, or
 * null. A kpi must draw its number, a chart must plot the numbers of its y fields and label the values
 * of its x field, a table must draw one row for each row of the data, and a text tile must draw its text.
 * Plugin tiles draw their own markup, and the API read stands for them.
 */
async function renderedProblem(page: Page, pageId: string, read: TileRead, direct: Envelope): Promise<string | null> {
  const data = direct.data
  if (!data || !Array.isArray(data.rows))
    return data && typeof data.text === 'string' && read.tile.tile === 'text'
      ? ((await renderedText(await boardFrame(page, pageId), read.id)).includes(data.text) ? null : `the text tile does not draw "${data.text}"`)
      : null
  const board = await boardFrame(page, pageId)
  const type = read.tile.tile
  const slot = (name: string): string[] => [read.tile.fields[name] ?? []].flat()
  if (type === 'kpi') {
    const col = fieldIndex(data, slot('value')[0])
    const value = col >= 0 ? data.rows[0]?.[col] : undefined
    if (value === undefined || value === null)
      return null
    // The whole text of the value, read back as a number in the viewer's locale: 150 is not 15.
    const text = await renderedKpi(board, read.id)
    if (typeof text !== 'string')
      return text === null ? `the number tile says it has no value, the data has ${value}` : 'the number tile drew no value'
    return sameNumber(text, value, await locale(page)) ? null : `the number tile draws "${text.slice(0, 60)}", not ${value}`
  }
  if (type === 'chart') {
    const chart = await renderedChart(board, read.id)
    if (!chart)
      return 'the chart tile drew no data'
    // The labels in order, and every dataset's value for every label, as the tile builds them.
    return chartProblem(chart, expectedChart(data, { x: slot('x')[0], y: slot('y'), series: slot('series')[0] ?? null }))
  }
  if (type === 'table')
    return tableProblem(await renderedTable(board, read.id), data, slot('columns'), await locale(page))
  return null
}

interface RunResult { request: number, run: number, pass: boolean, skipped: boolean, reasons: string[] }
const results: RunResult[] = []

/** The id that a page with this title gets (the plan's rule), so that a run cleans up its pages whatever the reply said. */
function pageIdOfTitle(title: string): string {
  return `gen_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`.slice(0, 41).replace(/_+$/, '')
}

/** The model provider refused a turn ("Turn failed: Key limit exceeded"): nothing after it can run. */
class LlmUnavailable extends Error {}
let llmDown: string | null = null

/** Does the chat show a failed turn? Returns its text. */
async function failedTurn(page: Page): Promise<string | null> {
  const failed = page.getByText(/Turn failed/i)
  return (await failed.count()) > 0 ? ((await failed.last().textContent()) ?? 'Turn failed').trim().slice(0, 300) : null
}

/**
 * What the data of a tile should look like in the direct read of its point: the same fields (so the
 * agent chose the right point and mapping), the same title, and for a bound input the argument that the
 * filter set. The values are not compared: the tile's own read is the data, and the direct read comes later.
 */
function structureProblem(direct: Envelope, mine: Envelope): string | null {
  if (direct.source_title !== mine.source_title)
    return `the tile reads "${mine.source_title}", the point is "${direct.source_title}"`
  const a = direct.data as { fields?: unknown, schema?: unknown } | undefined
  const b = mine.data as { fields?: unknown, schema?: unknown } | undefined
  if (a?.fields !== undefined || b?.fields !== undefined) {
    return JSON.stringify(a?.fields) === JSON.stringify(b?.fields) ? null : `the tile's fields ${JSON.stringify(b?.fields)} differ from the point's ${JSON.stringify(a?.fields)}`
  }
  return JSON.stringify(Object.keys(a ?? {}).sort()) === JSON.stringify(Object.keys(b ?? {}).sort()) ? null : 'the tile reads data of another format than the point'
}

async function evaluateRun(page: Page, req: Request, run: number, stamp: string, reasons: string[]) {
  const doc = await catalogue(page)
  const titles = req.pages.map(p => `${p.label} ${stamp}`)
  // Cleaned up after the suite whatever the reply says: the pages exist even when the reply never came.
  for (const t of titles)
    builtIds.push(pageIdOfTitle(t))
  const idsBefore = await listedIds(page)
  const boardReads = new BoardReads()
  boardReads.attach(page)

  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  const naming = titles.length === 1
    ? ` Title the page "${titles[0]}".`
    : ` Title the pages ${titles.map(t => `"${t}"`).join(', ')}, in that order.`
  // The cap is checked before each model request: this chat turn. The agent makes several model calls
  // inside the turn, so the check goes on while the turn runs, and the run is abandoned at the cap.
  await assertBudget(page)
  await send(page, req.text + naming + (req.consent ? CONSENT : ''))

  // Every page it asked for: one link for each, in the reply. A turn that the provider refuses ends the wait.
  const links = page.locator(PAGE_LINK)
  const deadline = Date.now() + 180_000
  while ((await links.count()) < before + titles.length && Date.now() < deadline) {
    await assertBudget(page, 0)
    const failed = await failedTurn(page)
    if (failed)
      throw new LlmUnavailable(failed)
    await page.waitForTimeout(3000)
  }
  if ((await links.count()) < before + titles.length) {
    reasons.push(`expected ${titles.length} page link(s) in the reply, got ${(await links.count()) - before}`)
    return
  }
  const found: Array<{ href: string, text: string }> = []
  const total = await links.count()
  for (let i = before; i < total; i++)
    found.push({ href: (await links.nth(i).getAttribute('href')) ?? '', text: ((await links.nth(i).textContent()) ?? '').trim() })

  for (let pi = 0; pi < req.pages.length; pi++) {
    const spec = req.pages[pi]
    const link = found.find(f => f.text.toLowerCase() === titles[pi].toLowerCase())
    if (!link) {
      reasons.push(`page "${titles[pi]}": no link with that title in the reply (links: ${found.map(f => f.text).join(', ')})`)
      continue
    }
    const pageId = pageIdOf(link.href)
    if (idsBefore.includes(`wippy.dashboards.pages:${pageId}`))
      reasons.push(`page "${titles[pi]}": the page existed before the run`)
    const props = await pageProps(page, pageId)
    if (!props) {
      reasons.push(`page "${titles[pi]}": ${pageId} does not exist`)
      continue
    }

    // The link opens the page, and the board draws every tile with no error frame.
    await openInShell(page, link.href)
    const tileIds = Object.keys(props.tiles)
    try {
      await expect.poll(async () => Object.keys(await frameStatuses(page, pageId)).length, { timeout: 30_000 }).toBe(tileIds.length)
      await expect.poll(async () => Object.values(await frameStatuses(page, pageId)).every(s => s === 'ready'), { timeout: 30_000 }).toBe(true)
      await untilRead(page, boardReads, pageId, props)
    }
    catch {
      reasons.push(`page "${titles[pi]}": the link did not open a board with every tile ready: ${JSON.stringify(await frameStatuses(page, pageId))}`)
      continue
    }

    // Request 3: the page shows every model until one is chosen, so choose one as a viewer does.
    let model: string | null = null
    if (req.n === 3) {
      model = await chooseModel(page, boardReads, pageId, props, reasons)
      if (model !== null)
        await expect.poll(async () => Object.values(await frameStatuses(page, pageId)).every(s => s === 'ready'), { timeout: 20_000 }).toBe(true)
    }

    // Every tile shows real data: what the board read for each input is ready.
    const reads = tileReads(boardReads, pageId, props)
    for (const r of reads) {
      for (const [input, env] of Object.entries(r.inputs)) {
        if (env.state !== 'ready')
          reasons.push(`page "${titles[pi]}": tile ${r.id} input ${input} reads as ${env.state}${env.error ? ` (${env.error.code})` : ''}`)
      }
    }

    // Every required point, with its measure and grouping.
    for (const need of spec.needs) {
      const tiles = tilesFor(need, reads, doc)
      const label = `page "${titles[pi]}": ${need.point}`
      if (tiles.length === 0) {
        reasons.push(`${label} is not shown by any tile`)
        continue
      }
      const shown = tiles.filter((t) => {
        const fields = mappedFields(t.tile)
        return (!need.measure || fields.includes(need.measure)) && (!need.group || fields.includes(need.group))
      })
      if (shown.length === 0) {
        reasons.push(`${label}: no tile maps ${[need.measure, need.group].filter(Boolean).join(' and ')} (tiles map ${tiles.map(t => mappedFields(t.tile).join('/')).join(', ')})`)
        continue
      }
      if (need.bound && !shown.some(t => boundParams(t.tile).length > 0))
        reasons.push(`${label}: the tile does not follow the model filter`)

      // The direct read checks that the agent chose the right point, mapping and arguments.
      const tile = shown[0]
      const direct = await directRead(page, need.point, need.bound ? model : null)
      const mine = tile.inputs.main
      const structure = structureProblem(direct, mine)
      if (structure)
        reasons.push(`${label}: ${structure}`)
      if (need.bound && model !== null && mine.args?.model !== model)
        reasons.push(`${label}: the tile read model ${JSON.stringify(mine.args?.model)}, the filter chose ${model}`)

      // What the board draws equals what the tile read: the numbers of a chart, the cells of a table, the
      // value of a number, the text of a note. A tile that reads again while this runs is looked at once more.
      let drawn = await renderedProblem(page, pageId, tile, mine)
      if (drawn) {
        await page.waitForTimeout(2500)
        const again = tileReads(boardReads, pageId, props).find(r => r.id === tile.id)
        drawn = again?.inputs.main ? await renderedProblem(page, pageId, again, again.inputs.main) : drawn
      }
      if (drawn)
        reasons.push(`${label}: ${drawn}`)
    }
  }
}

for (const req of REQUESTS) {
  for (let run = 1; run <= RUNS_PER_REQUEST; run++) {
    test(`request ${req.n}, run ${run}`, async ({ page }) => {
      test.setTimeout(420_000)
      await page.setViewportSize({ width: 1400, height: 900 })
      await loginAsAdmin(page)
      spendStart()
      const reasons: string[] = []
      if (llmDown) {
        results.push({ request: req.n, run, pass: false, skipped: true, reasons: [`the model provider refused an earlier turn: ${llmDown}`] })
        console.log(`request ${req.n} run ${run} not run: the model provider refused an earlier turn: ${llmDown}`)
        return
      }
      const stamp = `${Date.now().toString(36).slice(-5)}${req.n}${run}`
      try {
        await evaluateRun(page, req, run, stamp, reasons)
      }
      catch (e) {
        if (e instanceof LlmUnavailable) {
          // Not a verdict on the agent: the provider refused the turn (a key limit, for example), and every later run would too.
          llmDown = e.message
          console.log(`request ${req.n} run ${run} stopped: the model provider refused the turn: ${e.message}`)
          results.push({ request: req.n, run, pass: false, skipped: true, reasons: [e.message] })
          return
        }
        if (e instanceof SpendCapReached) {
          // The cap stops the run, and the runs after it: a run that did not complete does not pass.
          console.log(`request ${req.n} run ${run} stopped: ${e.message} (cap $${SPEND_CAP_USD})`)
          results.push({ request: req.n, run, pass: false, skipped: true, reasons: [e.message] })
          return
        }
        reasons.push(`error: ${String(e).slice(0, 400)}`)
      }
      results.push({ request: req.n, run, pass: reasons.length === 0, skipped: false, reasons })
      console.log(`request ${req.n} run ${run}: ${reasons.length === 0 ? 'PASS' : 'FAIL'} (spent $${(await spentUsd(page)).toFixed(3)})`, reasons.join(' | '))
    })
  }
}

test('the evaluation passes: two of three runs for five of the six requests', () => {
  const byRequest = REQUESTS.map((req) => {
    const mine = results.filter(r => r.request === req.n)
    return { request: req.n, passed: mine.filter(r => r.pass).length, ran: mine.filter(r => !r.skipped).length }
  })
  console.log('evaluation', JSON.stringify(byRequest), JSON.stringify(results.filter(r => !r.pass)))
  const passing = byRequest.filter(r => r.passed >= 2).length
  expect(passing, `requests with at least two passing runs: ${JSON.stringify(byRequest)}`).toBeGreaterThanOrEqual(5)
})
