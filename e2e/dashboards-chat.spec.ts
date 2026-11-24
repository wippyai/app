import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, loginAs } from './helpers/page-watch'

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
test.afterAll(async ({ browser }) => {
  if (!builtId)
    return
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${builtId}`)
    expect([200, 404], removed.body).toContain(removed.status)
  }
  finally {
    await context.close()
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
  const box = page.getByPlaceholder('Type a message')
  await box.fill(text)
  await box.press('Enter')
}

test('one prompt in the chat builds one dashboard', async ({ page }) => {
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
  await expect.poll(() => links.count(), { timeout: 180_000, intervals: [2000] }).toBeGreaterThan(before)
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

test('a viewer without publish rights gets no page', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1400, height: 900 })
  await loginAs(page, 'viewer@wippy.local')
  const idsBefore = await listedIds(page)
  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  await send(page, 'Build me a dashboard with the number of chat sessions and messages per day.')

  // The tool refuses for this user; the agent answers without a page link.
  const reply = page.getByText(/permission|not allowed|may not|can't publish|cannot publish|unable to publish|isn't allowed|don't have/i)
  await expect(reply.last()).toBeVisible({ timeout: 180_000 })
  expect(await page.locator(PAGE_LINK).count()).toBe(before)
  // And no page was published: the page list is the same as before the request.
  expect(await listedIds(page)).toEqual(idsBefore)
  await page.waitForTimeout(1500)
  await shot(page, 'demo-3-viewer-refused')
})
