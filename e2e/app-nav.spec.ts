import { readFileSync } from 'node:fs'
import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'

/**
 * The app's own sidebar as a live nav (frontend/packages/app-nav, src/app/pages) in the default
 * compat boot: the Host's built-in nav stays hidden, the home page `app.views:main` keeps its
 * sidebar, the registry pages of the Dashboards group join it live, and each opens inside the home
 * page with `<w-artifact nav-owner>`, so the sidebar never goes away.
 *
 * The two demo pages come from `POST /api/v1/demo/build`. Fixture pages published here are removed
 * again, even when a test fails.
 */

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

/** Removes a fixture page if it is still there. A page already gone answers 404. */
async function removePage(page: Page, id: string) {
  expectFailures(page, { status: 404, path: `/api/v1/dashboards/pages/${id}` })
  const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
  expect([200, 404], removed.body).toContain(removed.status)
}

test.beforeAll(async ({ browser }) => {
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

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

test.describe('app nav: the app\'s own sidebar lists registry pages live', () => {
  test('the sidebar keeps its own items and adds the Dashboards group; the Host nav stays hidden', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(dashboardsGroup(page).getByRole('button', { name: 'LLM usage' })).toBeVisible()
    const labels = await navLabels(page)
    expect(labels.slice(0, OWN_ITEMS.length)).toEqual(OWN_ITEMS)
    expect(labels).toContain('App activity')
    // Every Dashboards item comes after the app's own items, inside the group.
    const groupLabels = (await dashboardsGroup(page).getByRole('button').allTextContents()).map(t => t.trim())
    expect(labels.slice(OWN_ITEMS.length)).toEqual(groupLabels)
    await expect(active(page)).toHaveText('Home')
    // The Host's built-in nav would list the home page as "Admin Panel".
    await expect(page.getByText('Admin Panel', { exact: true })).toHaveCount(0)
  })

  test('a dashboard opens inside the home page and the sidebar stays', async ({ page }) => {
    await loginAsAdmin(page)
    await markShell(page)
    await dashboardsGroup(page).getByRole('button', { name: 'LLM usage' }).click()
    await expect(page).toHaveURL(/\/home\/reports\/llm-usage$/)
    await expect(active(page)).toHaveText('LLM usage')
    await expect(hosted(page, 'llm_usage').locator('[data-tile-id="model_picker"]')).toBeVisible()
    await expect(sidebar(page)).toBeVisible()
    expect(await shellKept(page)).toBe(true)

    // An own item leaves the hosted page, still in the same home page.
    await sidebar(page).getByRole('button', { name: 'Users' }).click()
    await expect(page).toHaveURL(/\/home\/users$/)
    await expect(active(page)).toHaveText('Users')
    expect(await shellKept(page)).toBe(true)
  })

  test('a link with a sub-path sets the filter; back and forward move the active item', async ({ page }) => {
    await loginAsAdmin(page)
    await shellReady(page)
    await openInShell(page, '/home/reports/llm-usage/claude-haiku-4-5')
    const board = hosted(page, 'llm_usage')
    await expect(board.locator('[data-tile-id="model_picker"]')).toContainText('claude-haiku-4-5')
    await expect(active(page)).toHaveText('LLM usage')

    await sidebar(page).getByRole('button', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/home\/?$/)
    await expect(active(page)).toHaveText('Home')

    await page.goBack()
    await expect(page).toHaveURL(/\/home\/reports\/llm-usage\/claude-haiku-4-5$/)
    await expect(active(page)).toHaveText('LLM usage')
    await expect(hosted(page, 'llm_usage').locator('[data-tile-id="model_picker"]')).toContainText('claude-haiku-4-5')

    await page.goForward()
    await expect(page).toHaveURL(/\/home\/?$/)
    await expect(active(page)).toHaveText('Home')
  })

  test('a page published while the app is open joins the sidebar, opens, and leaves when removed', async ({ page }) => {
    const id = 'nav_live'
    await loginAsAdmin(page)
    await markShell(page)
    try {
      const published = await api(page, 'POST', '/api/v1/dashboards/pages', fixturePage(id, '/coord/nav-live', 'Nav live check'))
      expect(published.status, published.body).toBe(200)
      // The backend sends `pages`; the sidebar reads the list again. No reload.
      const item = dashboardsGroup(page).getByRole('button', { name: 'Nav live check' })
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

      await shell(page).getByRole('button', { name: 'Go to Home' }).click()
      await expect(page).toHaveURL(/\/home\/?$/)
    }
    finally {
      await removePage(page, id)
    }
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
    try {
      const published = await api(page, 'POST', '/api/v1/dashboards/pages', fixturePage(id, '/coord/deny-check', 'Denied check'))
      expect(published.status, published.body).toBe(200)
      await expect(dashboardsGroup(page).getByRole('button', { name: 'Denied check' })).toBeVisible({ timeout: 5_000 })

      const viewer = await newPage(browser, 'viewer')
      await loginAs(viewer, 'viewer@wippy.local')
      await shellReady(viewer)
      await expect(dashboardsGroup(viewer).getByRole('button', { name: 'LLM usage' })).toBeVisible()
      await expect(dashboardsGroup(viewer).getByRole('button', { name: 'Denied check' })).toHaveCount(0)
      // A direct link to the denied page finds no page for this viewer and goes Home.
      await openInShell(viewer, '/home/coord/deny-check')
      await expect(viewer).toHaveURL(/\/home\/?$/)
    }
    finally {
      await removePage(page, id)
    }
  })

  test('a live tile updates inside the hosted page', async ({ page }) => {
    await loginAsAdmin(page)
    const reads: string[] = []
    page.on('request', (r) => {
      const m = new URL(r.url()).pathname.match(/\/dashboards\/pages\/app_activity\/points\/([a-z_]+)/)
      if (m)
        reads.push(m[1])
    })
    await dashboardsGroup(page).getByRole('button', { name: 'App activity' }).click()
    await expect(hosted(page, 'app_activity').locator('[data-tile-id="users"]')).toBeVisible()
    await expect.poll(() => reads.filter(p => p === 'users').length).toBeGreaterThan(0)
    const before = reads.length

    const signal = await api(page, 'POST', '/api/v1/demo/signal/users')
    expect(signal.status, signal.body).toBe(200)
    // Only the tile that listens to dash.users.changed reads again.
    await expect.poll(() => reads.slice(before)).toContain('users')
    expect(new Set(reads.slice(before))).toEqual(new Set(['users']))
  })
})
