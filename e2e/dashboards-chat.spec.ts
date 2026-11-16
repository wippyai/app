import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { loginAs } from './helpers/page-watch'

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
const ADMIN_PROMPT = process.env.DEMO_PROMPT
  || 'Build me a dashboard of our LLM token use: total tokens and calls, tokens by day per model, tokens by kind as a doughnut, and a model filter.'

/** A page link the agent gives: into the home page (/home/dash/...), or a page's own route. */
const PAGE_LINK = 'a[href*="/dash/"]'

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
  await expect(dashboardsGroup(page).getByRole('button').first()).toBeVisible({ timeout: 20_000 })
  const itemsBefore = await dashboardsGroup(page).getByRole('button').count()
  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  await send(page, ADMIN_PROMPT)

  // The agent answers with the link to the page it built.
  const links = page.locator(PAGE_LINK)
  await expect.poll(() => links.count(), { timeout: 180_000, intervals: [2000] }).toBeGreaterThan(before)
  const link = links.last()
  const href = await link.getAttribute('href') ?? ''
  const title = (await link.textContent())?.trim() ?? ''
  console.log('built', href, title)
  expect(href, 'the link opens the page inside the home page').toMatch(/^\/home\/dash\//)

  // The sidebar already lists the new page: the backend's `pages` signal, no reload. A page with
  // the same title replaces the earlier one, so the count may stay the same.
  await expect(dashboardsGroup(page).getByRole('button', { name: title })).toBeVisible({ timeout: 10_000 })
  expect(await dashboardsGroup(page).getByRole('button').count()).toBeGreaterThanOrEqual(itemsBefore)
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
  await openChat(page)
  const before = await page.locator(PAGE_LINK).count()
  await send(page, 'Build me a dashboard with the number of chat sessions and messages per day.')

  // The tool refuses for this user; the agent answers without a page link.
  const reply = page.getByText(/permission|not allowed|may not|can't publish|cannot publish|unable to publish|isn't allowed|don't have/i)
  await expect(reply.last()).toBeVisible({ timeout: 180_000 })
  expect(await page.locator(PAGE_LINK).count()).toBe(before)
  await page.waitForTimeout(1500)
  await shot(page, 'demo-3-viewer-refused')
})
