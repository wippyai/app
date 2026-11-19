import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, openInShell } from './helpers/page-watch'
import type { CatalogueDoc, Envelope, PageProps } from './dashboards-agent.support'
import {
  PAGE_LINK,
  SPEND_CAP_USD,
  catalogue,
  fixedArgs,
  frameStatuses,
  listedIds,
  openChat,
  pageIdOf,
  pageProps,
  readPoint,
  removePage,
  send,
  spendStart,
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

/** Reads every input of every tile of a page, as the tile does. */
async function readTiles(page: Page, pageId: string, props: PageProps, model: string | null): Promise<TileRead[]> {
  const out: TileRead[] = []
  for (const [id, tile] of Object.entries(props.tiles)) {
    const inputs: Record<string, Envelope> = {}
    for (const [input, source] of Object.entries(tile.data)) {
      const args = fixedArgs(source.args, model ? { model } : {})
      inputs[input] = await readPoint(page, pageId, source.point, args)
    }
    out.push({ id, tile, inputs })
  }
  return out
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

/** Checks request 3's filter in the browser: choosing a model re-reads exactly the bound inputs, once each. */
async function checkFilterRereads(page: Page, pageId: string, props: PageProps, reasons: string[]) {
  const picker = Object.entries(props.tiles).find(([, t]) => t.tile === 'control.select')
  if (!picker || !picker[1].param) {
    reasons.push('request 3: the page has no select tile with a filter')
    return
  }
  const param = picker[1].param as string
  const expected = new Set<string>()
  for (const tile of Object.values(props.tiles)) {
    for (const source of Object.values(tile.data)) {
      if (Object.values(source.args).some(v => (v as { $param?: string } | null)?.$param === param))
        expected.add(source.point)
    }
  }
  if (expected.size === 0) {
    reasons.push('request 3: no tile reads a point with the filter')
    return
  }
  const reads: string[] = []
  page.on('request', (r) => {
    const m = /\/points\/([^/?]+)/.exec(r.url())
    if (m && r.method() === 'GET')
      reads.push(m[1])
  })
  // The page's own route, so that the board is a frame of the Host whatever the app's outlet does.
  await openInShell(page, `/dash/${pageId.replace(/^gen_/, '').replace(/_/g, '-')}`)
  const frame = page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${pageId}"]`)
  const combo = frame.locator(`[data-tile-id="${picker[0]}"] [role="combobox"]`)
  await expect(combo).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(3000)
  reads.length = 0
  await combo.focus()
  await page.keyboard.press('Enter')
  const options = frame.locator('[role="option"]')
  await expect(options.first()).toBeVisible({ timeout: 5000 })
  // The first real model: the last option, so that it is not the "All" entry that clears the filter.
  await options.last().click()
  await page.waitForTimeout(4000)
  const counts = new Map<string, number>()
  for (const name of reads)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  const got = [...counts.keys()].sort()
  if (JSON.stringify(got) !== JSON.stringify([...expected].sort()))
    reasons.push(`request 3: the filter re-read ${JSON.stringify([...counts])}, expected exactly ${JSON.stringify([...expected])}`)
  for (const [name, n] of counts) {
    if (n !== 1)
      reasons.push(`request 3: ${name} was read ${n} times after the filter changed`)
  }
}

interface RunResult { request: number, run: number, pass: boolean, skipped: boolean, reasons: string[] }
const results: RunResult[] = []

async function evaluateRun(page: Page, req: Request, run: number, stamp: string, reasons: string[]) {
  const doc = await catalogue(page)
  const titles = req.pages.map(p => `${p.label} ${stamp}`)
  const idsBefore = await listedIds(page)

  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  const naming = titles.length === 1
    ? ` Title the page "${titles[0]}".`
    : ` Title the pages ${titles.map(t => `"${t}"`).join(', ')}, in that order.`
  await send(page, req.text + naming + (req.consent ? CONSENT : ''))

  // Every page it asked for: one link for each, in the reply.
  const links = page.locator(PAGE_LINK)
  try {
    await expect.poll(() => links.count(), { timeout: 180_000, intervals: [2000] }).toBeGreaterThanOrEqual(before + titles.length)
  }
  catch {
    reasons.push(`expected ${titles.length} page link(s) in the reply, got ${(await links.count()) - before}`)
    return
  }
  const found: Array<{ href: string, text: string }> = []
  const total = await links.count()
  for (let i = before; i < total; i++)
    found.push({ href: (await links.nth(i).getAttribute('href')) ?? '', text: ((await links.nth(i).textContent()) ?? '').trim() })

  const model = req.n === 3
    ? ((await directRead(page, 'usage_models', null)).data?.rows?.[0]?.[0] as string | undefined) ?? null
    : null

  for (let pi = 0; pi < req.pages.length; pi++) {
    const spec = req.pages[pi]
    const link = found.find(f => f.text.toLowerCase() === titles[pi].toLowerCase())
    if (!link) {
      reasons.push(`page "${titles[pi]}": no link with that title in the reply (links: ${found.map(f => f.text).join(', ')})`)
      continue
    }
    const pageId = pageIdOf(link.href)
    builtIds.push(pageId)
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
    }
    catch {
      reasons.push(`page "${titles[pi]}": the link did not open a board with every tile ready: ${JSON.stringify(await frameStatuses(page, pageId))}`)
    }

    // Every tile shows real data.
    const reads = await readTiles(page, pageId, props, model)
    for (const r of reads) {
      for (const [input, env] of Object.entries(r.inputs)) {
        if (env.state !== 'ready')
          reasons.push(`page "${titles[pi]}": tile ${r.id} input ${input} reads as ${env.state}${env.error ? ` (${env.error.code})` : ''}`)
      }
    }

    // Every required point, with its measure and grouping, and its values.
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

      // The values a tile reads equal a direct read of the point with the same arguments.
      const tile = shown[0]
      let direct = await directRead(page, need.point, need.bound ? model : null)
      let mine = tile.inputs.main
      if (JSON.stringify(direct.data) !== JSON.stringify(mine.data)) {
        // The data is live (the chat adds rows): read both again once before it counts as a difference.
        await page.waitForTimeout(1500)
        direct = await directRead(page, need.point, need.bound ? model : null)
        mine = (await readTiles(page, pageId, { ...props, tiles: { [tile.id]: tile.tile } }, model))[0].inputs.main
      }
      if (JSON.stringify(direct.data) !== JSON.stringify(mine.data))
        reasons.push(`${label}: the tile's data differs from a direct read of the point`)
    }

    if (req.n === 3)
      await checkFilterRereads(page, pageId, props, reasons)
  }
}

for (const req of REQUESTS) {
  for (let run = 1; run <= RUNS_PER_REQUEST; run++) {
    test(`request ${req.n}, run ${run}`, async ({ page }) => {
      test.setTimeout(420_000)
      await page.setViewportSize({ width: 1400, height: 900 })
      await loginAsAdmin(page)
      spendStart()
      const spent = await spentUsd(page)
      if (spent >= SPEND_CAP_USD) {
        console.log(`request ${req.n} run ${run} not run: the spend cap of $${SPEND_CAP_USD} is reached ($${spent.toFixed(2)})`)
        results.push({ request: req.n, run, pass: false, skipped: true, reasons: ['spend cap reached'] })
        return
      }
      const reasons: string[] = []
      const stamp = `${Date.now().toString(36).slice(-5)}${req.n}${run}`
      try {
        await evaluateRun(page, req, run, stamp, reasons)
      }
      catch (e) {
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
