import { mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { Browser, BrowserContext, Page, Response } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, loginAs } from './helpers/page-watch'
import type { Envelope, Frame, PageProps } from './dashboards-agent.support'
import { SPEND_CAP_USD, boardFrame, catalogue, expectedChart, frameStatuses, openBoard, pageProps, renderedChart, renderedTable, spendStart, spentUsd, tableProblem } from './dashboards-agent.support'
import { publishPage } from './dashboards-wp5.support'
import { ProviderStopped, turnFailure } from './dashboards-run-failure'
import rc2Fixture from './fixtures/rc2-eval-pages.json'

/**
 * Demo: one prompt in the normal chat builds one dashboard (spec 6.9, section 10).
 * The chat agent "Ask Wippy" carries the trait wippy.dashboards.agent:trait. The new page joins the
 * app's own sidebar while the chat is open, and its link opens it inside the home page, next to
 * that sidebar. These tests call a real LLM, so they run only with RUN_LLM_DEMO=1. SHOTS_DIR saves
 * screenshots of each step.
 */
test.skip(process.env.RUN_LLM_DEMO !== '1', 'calls a real LLM; set RUN_LLM_DEMO=1 to run')
test.describe.configure({ mode: 'serial' })

const SHOTS = process.env.SHOTS_DIR
/**
 * The showcase request: one page with every tile kind (text, numbers, a select filter, bar, doughnut
 * and line charts, a table, and the two plugin tiles), a model filter, a day filter set by a bar
 * click, and the live user list. It asks for 11 tiles; a plan may hold at most 12.
 */
const ADMIN_PROMPT = process.env.DEMO_PROMPT
  || 'Build me an app overview dashboard. Start with a one-sentence summary of LLM token use. Then the numbers: '
  + 'total LLM tokens, LLM calls and chat sessions. Add a model filter that applies to the token number, the '
  + 'tokens-by-day chart and the model table, and a day filter that I set by clicking a bar in the tokens-by-day '
  + 'chart; the model table follows that day too. Charts: LLM tokens by day per model as bars, tokens by kind as '
  + 'a doughnut, and chat messages per day as a line. A table of calls and tokens by model. Also show the users '
  + 'with their live status and the latest workflow run as a tree. I confirm that the page may let admins change '
  + 'a user\'s status.'

/**
 * Each run asks for its own title, so the page it builds is new: the sidebar check then proves that
 * the page joined, not that an older page with the same title was already there.
 */
const RUN_TITLE = `App Overview ${new Date().toTimeString().slice(0, 8)}`

/** A page link the agent gives: into the home page (/home/dash/...), or a page's own route. */
const PAGE_LINK = 'a[href*="/dash/"]'

/** The ids of the pages this signed-in user may open, from the live page list. */
async function listedIds(page: Page): Promise<string[]> {
  const res = await api(page, 'GET', '/api/public/pages/list')
  expect(res.status, res.body).toBe(200)
  return (JSON.parse(res.body).pages as Array<{ id: string }>).map(p => p.id).sort()
}

/** The page a chat link points to: /home/dash/<slug> belongs to wippy.dashboards.pages:gen_<slug>. */
function pageIdOf(href: string): string {
  return `gen_${href.replace(/^.*\/dash\//, '').replace(/-/g, '_')}`
}

// The page the admin test built, removed after the suite from a fresh context.
let builtId: string | null = null
const extraBuiltIds: string[] = []
let budgetContext: BrowserContext
let budgetPage: Page
let secondEditor: { id: string, email: string, password: string } | undefined
let secondEditorCreated = false
test.beforeAll(async ({ browser }) => {
  budgetContext = await browser.newContext()
  budgetPage = await budgetContext.newPage()
  await loginAsAdmin(budgetPage)
  const id = `rc2_editor_${randomBytes(12).toString('hex')}`
  secondEditor = { id, email: `${id}@wippy.local`, password: randomBytes(32).toString('base64url') }
  const created = await api(budgetPage, 'POST', '/api/v1/users', {
    user_id: id, email: secondEditor.email, password: secondEditor.password, full_name: 'RC2 temporary publisher',
  })
  secondEditorCreated = created.status === 201
  expect(created.status, 'create the temporary publisher').toBe(201)
  expect(JSON.parse(created.body).success).toBe(true)
  // app.security:admin.all_access grants dashboards.publish. The demo has no narrower publisher group.
  const grouped = await api(budgetPage, 'PUT', `/api/v1/users/${id}/groups`, { groups: ['app.security:admin'] })
  expect(grouped.status, 'grant the temporary publisher its group').toBe(200)
  expect(JSON.parse(grouped.body).success).toBe(true)
  spendStart()
})

async function campaignCheck(page: Page, reserve = 0) {
  const spent = await spentUsd(budgetPage)
  test.skip(spent + reserve >= SPEND_CAP_USD, 'No verdict. The shared RC2 campaign cap was reached.')
  // Only a confirmed provider or cap stop has no verdict (the shared classifier of the eval and Researcher specs).
  // Any other failed turn (a dashboards, tool or session error) is a failure of the test.
  const failures = (await page.getByText(/Turn failed/i).allTextContents()).map(text => turnFailure(text.trim()))
  const real = failures.find(failure => !(failure instanceof ProviderStopped))
  if (real)
    throw real
  test.skip(failures.length > 0, 'No verdict. The model provider stopped the turn.')
}

test.afterEach(async ({ page }) => {
  await campaignCheck(page)
})

function campaignTest(title: string, run: (fixtures: { page: Page, browser: Browser }) => Promise<void>) {
  test(title, async ({ page, browser }) => {
    try {
      await run({ page, browser })
    }
    catch (error) {
      // Polling can turn a stopped turn into a wait failure. Classify it before reporting a verdict.
      await campaignCheck(page)
      throw error
    }
  })
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    try {
      for (const id of [...extraBuiltIds, ...(builtId ? [builtId] : [])]) {
        const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
        expect.soft([200, 404], removed.body).toContain(removed.status)
      }
    }
    finally {
      if (secondEditorCreated && secondEditor) {
        try {
          const ungrouped = await api(page, 'PUT', `/api/v1/users/${secondEditor.id}/groups`, { groups: [] })
          expect.soft(ungrouped.status, 'remove the temporary publisher from its group').toBe(200)
          expect.soft(JSON.parse(ungrouped.body).success).toBe(true)
        }
        finally {
          const removed = await api(page, 'DELETE', `/api/v1/users/${secondEditor.id}`)
          expect.soft(removed.status, 'delete the temporary publisher').toBe(200)
          expect.soft(JSON.parse(removed.body).success).toBe(true)
          secondEditor = undefined
        }
      }
    }
  }
  finally {
    await context.close()
    await budgetContext.close()
  }
})

function shell(page: Page) {
  return page.frameLocator('iframe[name="wippy:page:app.views:main"]')
}

function dashboardsGroup(page: Page) {
  return shell(page).getByRole('navigation', { name: 'Main navigation' }).getByRole('group', { name: 'Dashboards' })
}

async function shot(page: Page, name: string) {
  if (!SHOTS)
    return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** Opens the chat panel from the home page. */
async function openChat(page: Page) {
  // The sidebar's "Ask Wippy" button and the home card both live in the home app's iframe; the
  // chat panel opens in the Host page. Try each match until the message box shows.
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

async function send(page: Page, text: string) {
  await campaignCheck(page, 0.25)
  const box = page.getByPlaceholder('Type a message')
  await box.fill(text)
  await box.press('Enter')
}

campaignTest('one prompt in the chat builds one dashboard', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1400, height: 900 })
  await loginAsAdmin(page)
  // Works on a fresh database too: the list may hold no dashboard yet.
  const idsBefore = await listedIds(page)
  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  await send(page, `${ADMIN_PROMPT} Title the page "${RUN_TITLE}".`)

  // The agent answers with the link to the page it built.
  const links = page.locator(PAGE_LINK)
  await expect.poll(async () => { await campaignCheck(page); return links.count() }, { timeout: 180_000, intervals: [2000] }).toBeGreaterThan(before)
  const link = links.last()
  const href = await link.getAttribute('href') ?? ''
  const title = (await link.textContent())?.trim() ?? ''
  console.log('built', href, title)
  expect(href, 'the link opens the page inside the home page').toMatch(/^\/home\/dash\//)
  builtId = pageIdOf(href)
  expect(idsBefore, 'the page is new in this run').not.toContain(`wippy.dashboards.pages:${builtId}`)

  // The sidebar already lists the new page: the backend's `pages` signal, no reload.
  await expect(dashboardsGroup(page).getByRole('button', { name: title, exact: true })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  await shot(page, 'demo-1-chat')

  // The link opens the page inside the home page, next to the sidebar, with the page active.
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 20_000 })
  const board = shell(page).frameLocator('w-artifact[id^="wippy.dashboards.pages:gen_"] iframe')
  await expect.poll(() => board.locator('[data-tile-id]').count(), { timeout: 30_000 }).toBeGreaterThan(1)
  await expect(shell(page).locator('nav [aria-current="page"]')).toHaveText(title)
  await page.waitForTimeout(4000)
  await shot(page, 'demo-2-dashboard')
})

campaignTest('a viewer without publish rights gets no page', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1400, height: 900 })
  await loginAs(page, 'viewer@wippy.local')
  const idsBefore = await listedIds(page)
  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  await send(page, 'Build me a dashboard with the number of chat sessions and messages per day.')

  // The tool refuses for this user; the agent answers without a page link.
  const reply = page.getByText(/permission|not allowed|may not|can't publish|cannot publish|unable to publish|isn't allowed|don't have/i)
  await expect.poll(async () => { await campaignCheck(page); return reply.last().isVisible() }, { timeout: 180_000 }).toBe(true)
  expect(await page.locator(PAGE_LINK).count()).toBe(before)
  // And no page was published: the page list is the same as before the request.
  expect(await listedIds(page)).toEqual(idsBefore)
  await page.waitForTimeout(1500)
  await shot(page, 'demo-3-viewer-refused')
})

campaignTest('a title that a page already uses is refused, and the agent asks the user', async ({ page }) => {
  test.setTimeout(240_000)
  test.skip(!builtId, 'needs the page that the first test built')
  await page.setViewportSize({ width: 1400, height: 900 })
  await loginAsAdmin(page)
  const idsBefore = await listedIds(page)
  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  await send(page, `Build me a dashboard with the number of chat sessions. Title the page "${RUN_TITLE}".`)

  // A build never replaces a page (RC1 decision B): the tool answers page_exists and the agent asks.
  const reply = page.getByText(/already (exists|uses|taken)|another title|different title|new title|replace|what (would you like|do you want)/i)
  await expect.poll(async () => { await campaignCheck(page); return reply.last().isVisible() }, { timeout: 180_000 }).toBe(true)
  expect(await page.locator(PAGE_LINK).count()).toBe(before)
  // And nothing changed: the page list is the same as before the request.
  expect(await listedIds(page)).toEqual(idsBefore)
  await shot(page, 'demo-4-title-taken')
})

async function buildUsage(page: Page) {
  const title = `Chat Usage ${Date.now().toString(36)}`
  extraBuiltIds.push(`gen_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`)
  await loginAsAdmin(page)
  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  await send(page, `Build an LLM usage page titled "${title}". Show total tokens in a tile with id usage_tokens and tokens per day in a tile with id usage_by_day.`)
  await expect.poll(async () => { await campaignCheck(page); return page.locator(PAGE_LINK).count() }, { timeout: 180_000 }).toBeGreaterThan(before)
  const href = await page.locator(PAGE_LINK).last().getAttribute('href') ?? ''
  const id = pageIdOf(href)
  extraBuiltIds.push(id)
  const props = await pageProps(page, id) as ChatProps
  expect(props.tiles.usage_tokens).toBeTruthy()
  expect(props.tiles.usage_by_day).toBeTruthy()
  return { id, href, title, props }
}

interface LayoutNode { panel?: string, children?: LayoutNode[] }
type ChatProps = PageProps & { revision: number, layout: { layouts: Record<string, LayoutNode> } }

function panels(node: LayoutNode): string[] {
  return node.panel ? [node.panel] : (node.children ?? []).flatMap(panels)
}

async function expectModelTile(page: Page, id: string, before: ChatProps, after: ChatProps) {
  const added = Object.keys(after.tiles).filter(tile => !(tile in before.tiles))
  expect(added).toHaveLength(1)
  for (const tile of Object.keys(before.tiles))
    expect(after.tiles[tile]).toEqual(before.tiles[tile])
  for (const [name, layout] of Object.entries(before.layout.layouts)) {
    const keptRows = (tree: LayoutNode) => (tree.children ?? []).map(panels)
      .map(row => row.filter(tile => tile in before.tiles)).filter(row => row.length > 0)
    expect(after.layout.layouts[name], `keep layout ${name}`).toBeTruthy()
    expect(keptRows(after.layout.layouts[name]), `keep existing rows in ${name}`).toEqual(keptRows(layout))
  }
  const tileId = added[0]
  const tile = after.tiles[tileId]
  expect(['chart', 'table']).toContain(tile.tile)
  const fields = Object.values(tile.fields).flatMap(value => Array.isArray(value) ? value : [value])
  expect(fields).toEqual(expect.arrayContaining(['model_id', 'tokens']))
  const doc = await catalogue(page)
  const point = doc.points.find(point => point.id === 'demo.actor:usage_by_model')
  expect(point).toBeTruthy()
  expect(doc.points.filter(candidate => candidate.title === point!.title).map(candidate => candidate.id)).toEqual(['demo.actor:usage_by_model'])
  expect(tile.data.main).toBeTruthy()
  let read: Envelope | undefined
  const onResponse = async (response: Response) => {
    const path = new URL(response.url()).pathname
    if (path === `/api/v1/dashboards/pages/${id}/points/${tile.data.main.point}` && response.request().method() === 'GET' && response.status() === 200)
      read = await response.json() as Envelope
  }
  page.on('response', onResponse)
  try {
    await openBoard(page, id.replace(/^gen_/, '').replace(/_/g, '-'), id, Object.keys(after.tiles).length)
    await expect.poll(async () => (await frameStatuses(page, id))[tileId], { timeout: 30_000 }).toBe('ready')
    await expect.poll(() => read?.state, { timeout: 30_000 }).toBe('ready')
    expect(read!.source_title, 'the added tile reads usage_by_model').toBe(point!.title)
    const frame = read!.data as Frame
    expect(frame.fields.map(field => field.name)).toEqual(expect.arrayContaining(['model_id', 'tokens']))
    expect(frame.rows.length, 'the added tile has data').toBeGreaterThan(0)
    const board = await boardFrame(page, id)
    if (tile.tile === 'chart') {
      await expect.poll(() => renderedChart(board, tileId), { timeout: 30_000 }).toEqual(expectedChart(frame, tile.fields as { x: string, y: string[], series?: string }))
    }
    else {
      const locale = await page.evaluate(() => navigator.language)
      await expect.poll(async () => tableProblem(await renderedTable(board, tileId), frame, tile.fields.columns as string[] | undefined, locale), { timeout: 30_000 }).toBeNull()
    }
  }
  finally {
    page.off('response', onResponse)
  }
}

async function waitForChange(page: Page, id: string, revision: number, linksBefore: number) {
  await expect.poll(async () => {
    await campaignCheck(page)
    return (await pageProps(page, id) as { revision?: number } | null)?.revision
  }, { timeout: 180_000, intervals: [2000] }).toBe(revision)
  await expect.poll(async () => { await campaignCheck(page); return page.locator(PAGE_LINK).count() }, { timeout: 30_000 }).toBeGreaterThan(linksBefore)
}

campaignTest('a later turn adds a tile to the page the agent built', async ({ page }) => {
  test.setTimeout(420_000)
  const made = await buildUsage(page)
  const ids = await listedIds(page)
  const links = await page.locator(PAGE_LINK).count()
  await send(page, `Add a breakdown of tokens by model to my "${made.title}" page.`)
  await waitForChange(page, made.id, made.props.revision + 1, links)
  const after = await pageProps(page, made.id) as ChatProps
  expect(await listedIds(page)).toEqual(ids)
  expect(await page.locator(PAGE_LINK).last().getAttribute('href')).toBe(made.href)
  await expectModelTile(page, made.id, made.props, after)
})

campaignTest('after another user changed the page, the agent\'s change is based on the new revision', async ({ page, browser }) => {
  test.setTimeout(420_000)
  expect(secondEditorCreated).toBe(true)
  expect(secondEditor).toBeTruthy()
  const made = await buildUsage(page)
  const secondContext = await browser.newContext()
  const second = await secondContext.newPage()
  try {
    await second.goto('/')
    await second.getByLabel('Email').fill(secondEditor!.email)
    await second.getByLabel('Password').fill(secondEditor!.password)
    await second.getByRole('button', { name: /sign in/i }).click()
    await expect(second.locator('.managed-layout-shell, .wippy-host-app').first()).toBeVisible({ timeout: 15_000 })
    const fixture = JSON.parse(JSON.stringify(rc2Fixture.pages[0]))
    fixture.id = made.id
    fixture.title = made.title
    fixture.route = made.href.replace(/^\/home/, '')
    fixture.data.external_note = { kind: 'function', ref: 'wippy.dashboards.agent:note', args: { text: 'Another publisher added this note.' } }
    fixture.tiles.external_note = { type: 'text', data: { main: 'external_note' }, fields: { text: 'text' } }
    fixture.rows.push(['external_note'])
    const changed = await publishPage(second, fixture)
    expect(changed.status, changed.body).toBe(200)
    const external = await pageProps(page, made.id) as ChatProps
    const revision = JSON.parse(changed.body).revision as number
    const ids = await listedIds(page)
    const links = await page.locator(PAGE_LINK).count()
    await send(page, `Add a breakdown of tokens by model to my "${made.title}" page. Keep every existing tile.`)
    await waitForChange(page, made.id, revision + 1, links)
    const after = await pageProps(page, made.id) as ChatProps
    expect(await listedIds(page)).toEqual(ids)
    expect(await page.locator(PAGE_LINK).last().getAttribute('href')).toBe(made.href)
    await expectModelTile(page, made.id, external, after)
  }
  finally {
    await secondContext.close()
  }
})
