import { readFileSync } from 'node:fs'
import type { Browser, FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'

/**
 * The app's own sidebar as a live nav (frontend/packages/app-nav, src/app/pages) in the default
 * compat boot: the Host's built-in nav stays hidden, the home page `app.views:main` keeps its
 * sidebar, the registry pages of the Dashboards group join it live, and each opens inside the home
 * page with `<w-artifact nav-owner>`, so the sidebar never goes away.
 *
 * The two demo pages come from `POST /api/v1/demo/build`. The fixture pages that tests publish
 * (FIXTURE_IDS) are removed before the suite and again after it, each time from a fresh browser
 * context, so a failed or timed-out test leaves none behind.
 */

const FIXTURE_IDS = ['nav_live', 'deny_check']

const OWN_ITEMS = ['Home', 'Users', 'Components', 'Nested Nav', 'Web Research', 'Keeper']
const PLACEHOLDER = JSON.parse(readFileSync('e2e/fixtures/dashboards/coord_ph_two.json', 'utf8')) as Record<string, unknown>

/** The same two-tile fixture page under another id, route and title. */
function fixturePage(id: string, route: string, title: string) {
  return { ...PLACEHOLDER, id, route, title }
}

function shell(page: Page): FrameLocator {
  return page.frameLocator('iframe[name="wippy:page:app.views:main"]')
}

function sidebar(page: Page) {
  return shell(page).getByRole('navigation', { name: 'Main navigation' })
}

function dashboardsGroup(page: Page) {
  return sidebar(page).getByRole('group', { name: 'Dashboards' })
}

/** A registry page shown inside the home page. */
function hosted(page: Page, id: string): FrameLocator {
  return shell(page).frameLocator(`w-artifact[id="wippy.dashboards.pages:${id}"] iframe`)
}

async function navLabels(page: Page): Promise<string[]> {
  return (await sidebar(page).getByRole('button').allTextContents()).map(text => text.trim())
}

function active(page: Page) {
  return sidebar(page).locator('[aria-current="page"]')
}

/**
 * Waits until the home page runs: its sidebar shows and Home is active. Only then does its router
 * follow Host navigation, so an in-shell navigation sent earlier would be lost.
 */
async function shellReady(page: Page) {
  await expect(active(page)).toHaveText('Home')
}

/** Marks the home page's window, so a later check proves it was not reloaded. */
async function markShell(page: Page) {
  await shell(page).locator('body').evaluate(() => { (window as unknown as { __shellMark?: number }).__shellMark = 1 })
}

async function shellKept(page: Page): Promise<boolean> {
  return shell(page).locator('body').evaluate(() => (window as unknown as { __shellMark?: number }).__shellMark === 1)
}

/**
 * Waits until no new point read has started for 1.5 s, so every tile of a page has finished its
 * first read before a test counts what a signal causes.
 */
async function readsSettled(page: Page, reads: readonly string[]) {
  let seen = -1
  while (seen !== reads.length) {
    seen = reads.length
    await page.waitForTimeout(1500)
  }
}

/**
 * Waits until no tile frame of a hosted board is busy (loading its component or its data). Call it
 * after a tile shows, so the board has rendered its frames.
 */
async function boardSettled(page: Page, id: string) {
  await expect(hosted(page, id).locator('[data-tile-id][aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 })
}

/** Removes the fixture pages from a fresh, signed-in context. A page already gone answers 404. */
async function removeFixtures(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    for (const id of FIXTURE_IDS) {
      const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
      expect([200, 404], removed.body).toContain(removed.status)
    }
  }
  finally {
    await context.close()
  }
}

test.beforeAll(async ({ browser }) => {
  await removeFixtures(browser)
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    const build = await api(page, 'POST', '/api/v1/demo/build', {})
    expect(build.status, build.body).toBe(200)
  }
  finally {
    await context.close()
  }
})

test.afterAll(async ({ browser }) => {
  await removeFixtures(browser)
})

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

test.describe('app nav: the app\'s own sidebar lists registry pages live', () => {
  test('the sidebar keeps its own items and adds the Dashboards group; the Host nav stays hidden', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(dashboardsGroup(page).getByRole('button', { name: 'LLM usage', exact: true })).toBeVisible()
    const labels = await navLabels(page)
    expect(labels.slice(0, OWN_ITEMS.length)).toEqual(OWN_ITEMS)
    expect(labels).toContain('App activity')
    // Every Dashboards item comes after the app's own items, inside the group.
    const groupLabels = (await dashboardsGroup(page).getByRole('button').allTextContents()).map(t => t.trim())
    expect(labels.slice(OWN_ITEMS.length)).toEqual(groupLabels)
    await expect(active(page)).toHaveText('Home')
    // The Host marks its layout when hide_nav_bar hides the built-in nav, and that nav, which
    // would list the home page as "Admin Panel", is not drawn.
    await expect(page.locator('.layout--navbar_hidden')).toHaveCount(1)
    await expect(page.getByText('Admin Panel', { exact: true })).toHaveCount(0)
  })

  test('a dashboard opens inside the home page and the sidebar stays', async ({ page }) => {
    await loginAsAdmin(page)
    await shellReady(page)
    await markShell(page)
    await dashboardsGroup(page).getByRole('button', { name: 'LLM usage', exact: true }).click()
    await expect(page).toHaveURL(/\/home\/reports\/llm-usage$/)
    await expect(active(page)).toHaveText('LLM usage')
    await expect(hosted(page, 'llm_usage').locator('[data-tile-id="model_picker"]')).toBeVisible({ timeout: 20_000 })
    await expect(sidebar(page)).toBeVisible()
    expect(await shellKept(page)).toBe(true)
    // Leaving while a tile still reads aborts that read, which the page watch reports.
    await boardSettled(page, 'llm_usage')

    // An own item leaves the hosted page, still in the same home page.
    await sidebar(page).getByRole('button', { name: 'Users', exact: true }).click()
    await expect(page).toHaveURL(/\/home\/users$/)
    await expect(active(page)).toHaveText('Users')
    expect(await shellKept(page)).toBe(true)
  })

  test('a link with a sub-path sets the filter; back and forward move the active item', async ({ page }) => {
    await loginAsAdmin(page)
    await shellReady(page)
    await openInShell(page, '/home/reports/llm-usage/claude-haiku-4-5')
    const board = hosted(page, 'llm_usage')
    await expect(board.locator('[data-tile-id="model_picker"]')).toContainText('claude-haiku-4-5', { timeout: 20_000 })
    await expect(active(page)).toHaveText('LLM usage')
    await boardSettled(page, 'llm_usage')

    await sidebar(page).getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page).toHaveURL(/\/home\/?$/)
    await expect(active(page)).toHaveText('Home')

    await page.goBack()
    await expect(page).toHaveURL(/\/home\/reports\/llm-usage\/claude-haiku-4-5$/)
    await expect(active(page)).toHaveText('LLM usage')
    await expect(hosted(page, 'llm_usage').locator('[data-tile-id="model_picker"]')).toContainText('claude-haiku-4-5', { timeout: 20_000 })
    await boardSettled(page, 'llm_usage')

    await page.goForward()
    await expect(page).toHaveURL(/\/home\/?$/)
    await expect(active(page)).toHaveText('Home')
  })

  test('a page published while the app is open joins the sidebar, opens, and leaves when removed', async ({ page }) => {
    const id = 'nav_live'
    await loginAsAdmin(page)
    await shellReady(page)
    await markShell(page)
    const published = await api(page, 'POST', '/api/v1/dashboards/pages', fixturePage(id, '/coord/nav-live', 'Nav live check'))
    expect(published.status, published.body).toBe(200)
    // The backend sends `pages`; the sidebar reads the list again. No reload.
    const item = dashboardsGroup(page).getByRole('button', { name: 'Nav live check', exact: true })
    await expect(item).toBeVisible({ timeout: 5_000 })
    await item.click()
    await expect(page).toHaveURL(/\/home\/coord\/nav-live$/)
    await expect(active(page)).toHaveText('Nav live check')
    await expect(hosted(page, id).locator('[data-tile-id="x1"]')).toBeVisible()

    const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
    expect(removed.status, removed.body).toBe(200)
    await expect(item).toHaveCount(0, { timeout: 5_000 })
    await expect(shell(page).getByText('This page is no longer available')).toBeVisible()
    expect(await shellKept(page)).toBe(true)

    await shell(page).getByRole('button', { name: 'Go to Home', exact: true }).click()
    await expect(page).toHaveURL(/\/home\/?$/)
  })

  test('a path that no page owns goes Home', async ({ page }) => {
    await loginAsAdmin(page)
    await shellReady(page)
    await openInShell(page, '/home/no/such/page')
    await expect(page).toHaveURL(/\/home\/?$/)
    await expect(active(page)).toHaveText('Home')
  })

  test('each viewer sees only the pages they may open', async ({ page, browser }) => {
    // deny_check: a policy in src/dashboards/_index.yaml denies it to app.security:user.
    const id = 'deny_check'
    await loginAsAdmin(page)
    const published = await api(page, 'POST', '/api/v1/dashboards/pages', fixturePage(id, '/coord/deny-check', 'Denied check'))
    expect(published.status, published.body).toBe(200)
    await expect(dashboardsGroup(page).getByRole('button', { name: 'Denied check', exact: true })).toBeVisible({ timeout: 5_000 })

    const viewer = await newPage(browser, 'viewer')
    await loginAs(viewer, 'viewer@wippy.local')
    await shellReady(viewer)
    await expect(dashboardsGroup(viewer).getByRole('button', { name: 'LLM usage', exact: true })).toBeVisible()
    await expect(dashboardsGroup(viewer).getByRole('button', { name: 'Denied check', exact: true })).toHaveCount(0)
    // A direct link to the denied page finds no page for this viewer, even after a fresh read,
    // and goes Home.
    await openInShell(viewer, '/home/coord/deny-check')
    await expect(viewer).toHaveURL(/\/home\/?$/)
  })

  test('a live tile updates inside the hosted page', async ({ page }) => {
    await loginAsAdmin(page)
    const reads: string[] = []
    page.on('request', (r) => {
      const m = new URL(r.url()).pathname.match(/\/dashboards\/pages\/app_activity\/points\/([a-z_]+)/)
      if (m)
        reads.push(m[1])
    })
    await dashboardsGroup(page).getByRole('button', { name: 'App activity', exact: true }).click()
    await expect(hosted(page, 'app_activity').locator('[data-tile-id="users"]')).toBeVisible()
    await expect.poll(() => reads.filter(p => p === 'users').length).toBeGreaterThan(0)
    // Every tile has finished its first read; only what the signal causes counts from here.
    await readsSettled(page, reads)
    const before = reads.length

    const signal = await api(page, 'POST', '/api/v1/demo/signal/users')
    expect(signal.status, signal.body).toBe(200)
    // The tile that listens to dash.users.changed reads again, and no other tile does.
    await expect.poll(() => reads.slice(before)).toContain('users')
    await readsSettled(page, reads)
    expect(new Set(reads.slice(before))).toEqual(new Set(['users']))
  })
})
