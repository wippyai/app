import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, monitor, openInShell, takeUnexpected } from './helpers/page-watch'
import { publishPage, refreshShell } from './dashboards-wp5.support'

/**
 * RC1-12 two-phase restart check: generated pages come back after a real restart of the Wippy
 * runtime, from the stored pages, with no help from the test.
 *
 * The registry is in memory, so a restart loses every generated view.page entry; dash_pages
 * (the app database) keeps the pages. The page service of wippy/dashboards waits for its
 * migrations, reconciles at start and puts the entries back. The check has two runs of this file,
 * with a restart of the runtime between them that keeps `.wippy/app.db`:
 *
 *   1. WIPPY_DASHBOARDS_RESTART_PHASE=seed publishes two pages, removes one, and writes the state
 *      file;
 *   2. restart `wippy run` (same database, nothing wiped);
 *   3. WIPPY_DASHBOARDS_RESTART_PHASE=verify checks that the kept page is served again, that the
 *      removed page stays removed and its route can be used again, and that the route list of
 *      the Host answers 200 throughout.
 *
 * Run it with `playwright test -c playwright.dashboards-restart.config.ts`, which needs
 * WIPPY_DASHBOARDS_RESTART_PHASE and WIPPY_DASHBOARDS_RESTART_STATE_FILE (an absolute path of a
 * file that does not exist yet in the seed run). In a plain `playwright test` run, with no phase,
 * the tests below skip.
 *
 * A fresh-install start (an empty database, so the migrations and the page service start
 * together) is checked by starting the runtime on an empty `.wippy/app.db` and reading its log:
 * it must hold no "no such table" line. That part is a log check, not a browser check.
 */

const phase = process.env.WIPPY_DASHBOARDS_RESTART_PHASE
const stateFile = process.env.WIPPY_DASHBOARDS_RESTART_STATE_FILE

const LIVE = { id: 'restart_live', route: '/restart/live', tiles: ['r1', 'r2'] }
const GONE = { id: 'restart_gone', route: '/restart/gone', tiles: ['g1'] }
const REUSE = { id: 'restart_reuse', route: '/restart/gone', tiles: ['u1'] }

interface RestartState {
  schema: 'wippy.dashboards.restart.v1'
  seededAt: string
  live: typeof LIVE
  gone: typeof GONE
}

function spec(p: { id: string, route: string, tiles: string[] }) {
  const tiles = Object.fromEntries(p.tiles.map(t => [t, { type: 'placeholder' }]))
  return {
    spec: 'wippy.dashboard_page/v1',
    id: p.id,
    title: `Restart check ${p.id}`,
    route: p.route,
    params: {},
    data: {},
    actions: {},
    tiles,
    layout: {
      breakpoints: {},
      layouts: {
        default: {
          direction: 'vertical',
          children: p.tiles.map(t => ({ panel: t, size: '200px' })),
        },
      },
    },
    publish: true,
  }
}

function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

function absoluteStateFile(): string {
  if (!stateFile || !isAbsolute(stateFile))
    throw new Error('WIPPY_DASHBOARDS_RESTART_STATE_FILE must be an absolute path')
  return stateFile
}

/** The Host's route list: the status and the text. It must answer 200 whenever it is read. */
async function routeList(page: Page) {
  const r = await api(page, 'GET', '/api/public/pages/routes')
  expect(r.status, `GET /api/public/pages/routes: ${r.body.slice(0, 200)}`).toBe(200)
  return r.body
}

async function openAndCheckTiles(page: Page, p: { id: string, route: string, tiles: string[] }) {
  await openInShell(page, p.route)
  const frame = pageFrame(page, p.id)
  for (const tile of p.tiles)
    await expect(frame.locator(`[data-tile-id="${tile}"]`)).toBeVisible({ timeout: 20_000 })
}

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
  // The seed run removes a leftover page that may not exist, and the verify run reads the props of the
  // page it removed: both are 404 on purpose.
  expectFailures(page, { status: 404, path: '/dashboards/pages/restart_' })
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

test.describe('dashboards restart: seed', () => {
  test.skip(phase !== 'seed', 'WIPPY_DASHBOARDS_RESTART_PHASE is not seed')

  test('publishes two pages, removes one, and records the state for the verify run', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)

    for (const p of [LIVE, GONE]) {
      // A leftover page of an earlier run would answer duplicate_route.
      await api(page, 'DELETE', `/api/v1/dashboards/pages/${p.id}`)
      const published = await publishPage(page, spec(p))
      expect(published.status, published.body).toBe(200)
    }
    const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${GONE.id}`)
    expect(removed.status, removed.body).toBe(200)
    expect(JSON.parse(removed.body)).toMatchObject({ id: GONE.id, removed: true })

    const routes = await routeList(page)
    expect(routes).toContain(LIVE.route)
    expect(routes).not.toContain(GONE.route)

    // A running shell keeps the route list it loaded at start: reload it to see the new page.
    await refreshShell(page)
    await openAndCheckTiles(page, LIVE)

    const state: RestartState = {
      schema: 'wippy.dashboards.restart.v1',
      seededAt: new Date().toISOString(),
      live: LIVE,
      gone: GONE,
    }
    await writeFile(absoluteStateFile(), `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  })
})

test.describe('dashboards restart: verify', () => {
  test.skip(phase !== 'verify', 'WIPPY_DASHBOARDS_RESTART_PHASE is not verify')

  test('serves the kept page again after the restart, keeps the removed page removed, and frees its route', async ({ page }) => {
    const state = JSON.parse(await readFile(absoluteStateFile(), 'utf8')) as RestartState
    expect(state.schema).toBe('wippy.dashboards.restart.v1')

    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)

    // The page service reconciles at start, after the migrations. Until it has, the route is missing;
    // the route list answers 200 every time it is read.
    await expect.poll(async () => (await routeList(page)).includes(state.live.route), {
      timeout: 60_000,
      message: 'the kept page was not put back in the registry',
    }).toBe(true)
    expect(await routeList(page)).not.toContain(state.gone.route)

    const props = await api(page, 'GET', `/api/v1/dashboards/pages/${state.live.id}/props`)
    expect(props.status, props.body).toBe(200)
    const gone = await api(page, 'GET', `/api/v1/dashboards/pages/${state.gone.id}/props`)
    expect(gone.status, gone.body).toBe(404)

    await openAndCheckTiles(page, state.live)

    // The route of the removed page can be used by another page.
    const reused = await publishPage(page, spec(REUSE))
    expect(reused.status, reused.body).toBe(200)
    expect(await routeList(page)).toContain(REUSE.route)

    for (const id of [state.live.id, REUSE.id]) {
      const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
      expect(removed.status, removed.body).toBe(200)
    }
    const after = await routeList(page)
    expect(after).not.toContain(state.live.route)
    expect(after).not.toContain(REUSE.route)
  })
})
