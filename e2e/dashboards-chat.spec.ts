import { mkdirSync, readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

/**
 * Demo: one prompt in the normal chat builds one dashboard (spec 6.9, section 10).
 * The chat agent "Ask Wippy" carries the trait wippy.dashboards.agent:trait. These tests call a
 * real LLM, so they run only with RUN_LLM_DEMO=1. SHOTS_DIR saves screenshots of each step.
 */
test.skip(process.env.RUN_LLM_DEMO !== '1', 'calls a real LLM; set RUN_LLM_DEMO=1 to run')
test.describe.configure({ mode: 'serial' })

const SHOTS = process.env.SHOTS_DIR
const ADMIN_PROMPT = process.env.DEMO_PROMPT
  || 'Build me a dashboard of our LLM token use: total tokens and calls, tokens by day per model, tokens by kind as a doughnut, and a model filter.'

function seededPassword(email: string): string {
  const text = readFileSync('src/demo_seed/_index.yaml', 'utf8')
  const at = text.indexOf(`email: ${email}`)
  const m = at >= 0 ? text.slice(at).match(/password:\s*(\S+)/) : null
  if (!m)
    throw new Error(`no seeded password for ${email}`)
  return m[1].replace(/^["']|["']$/g, '')
}

async function loginAs(page: Page, email: string) {
  const saved = [process.env.USERSPACE_USER_DEFAULT_ADMIN_EMAIL, process.env.USERSPACE_USER_DEFAULT_ADMIN_PASSWORD]
  process.env.USERSPACE_USER_DEFAULT_ADMIN_EMAIL = email
  process.env.USERSPACE_USER_DEFAULT_ADMIN_PASSWORD = seededPassword(email)
  try {
    await loginAsAdmin(page)
  }
  finally {
    process.env.USERSPACE_USER_DEFAULT_ADMIN_EMAIL = saved[0]
    process.env.USERSPACE_USER_DEFAULT_ADMIN_PASSWORD = saved[1]
  }
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
  const main = page.frameLocator('iframe[name="wippy:page:app.views:main"]')
  const box = page.getByPlaceholder('Type a message')
  const matches = main.getByText('Ask Wippy', { exact: true })
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
  await openChat(page)
  const before = await page.locator('a[href^="/dash/"]').count()
  await send(page, ADMIN_PROMPT)

  // The agent answers with the link to the page it built.
  const links = page.locator('a[href^="/dash/"]')
  await expect.poll(() => links.count(), { timeout: 180_000, intervals: [2000] }).toBeGreaterThan(before)
  const link = links.last()
  const href = await link.getAttribute('href')
  console.log('built', href, await link.textContent())
  await page.waitForTimeout(1500)
  await shot(page, 'demo-1-chat')

  // The link opens the page with a full load, so the Host knows the new route.
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 20_000 })
  const frame = page.frameLocator('iframe[name^="wippy:page:wippy.dashboards.pages:gen_"]')
  await expect.poll(() => frame.locator('[data-tile-id]').count(), { timeout: 30_000 }).toBeGreaterThan(1)
  await page.waitForTimeout(4000)
  await shot(page, 'demo-2-dashboard')
})

test('a viewer without publish rights gets no page', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1400, height: 900 })
  await loginAs(page, 'viewer@wippy.local')
  await openChat(page)
  const before = await page.locator('a[href^="/dash/"]').count()
  await send(page, 'Build me a dashboard with the number of chat sessions and messages per day.')

  // The tool refuses for this user; the agent answers without a page link.
  const reply = page.getByText(/permission|not allowed|may not|can't publish|cannot publish|unable to publish|isn't allowed|don't have/i)
  await expect(reply.last()).toBeVisible({ timeout: 180_000 })
  expect(await page.locator('a[href^="/dash/"]').count()).toBe(before)
  await page.waitForTimeout(1500)
  await shot(page, 'demo-3-viewer-refused')
})
