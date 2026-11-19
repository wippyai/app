import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, monitor, openInShell, takeUnexpected } from './helpers/page-watch'
import { refreshShell } from './dashboards-wp5.support'

/**
 * RC1-03: a plugin adds a tile with no engine change. The two demo plugins ship a tile claim on their
 * view.component entry (tile contract section 2). This suite publishes a page that names only
 * `{ "type": ... }` for each of them, with rows and no layout, and checks what the engine filled in,
 * what the board shows, what the catalogue lists, and what the publish checks refuse.
 *
 * The Lua tests in the wippy/dashboards repository decide the claim fixtures and the pass, fail and
 * unavailable outcomes; this suite proves the same path in a running app.
 */

const PAGE = 'e2e_plugin_default'
const ROUTE = '/e2e/plugin-default'
const WIDE = { width: 1920, height: 900 }

function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

function spec(id: string, route: string, tiles: Record<string, unknown>, rows: string[][], data: Record<string, unknown> = {}) {
  return {
    spec: 'wippy.dashboard_page/v1',
    id,
    title: `Plugin check ${id}`,
    route,
    data,
    tiles,
    rows,
    publish: true,
  }
}

/** The ids of the pages that the running test published, which afterEach removes. */
const created: string[] = []

async function publish(page: Page, body: { id: string }) {
  const r = await api(page, 'POST', '/api/v1/dashboards/pages', body)
  if (r.status === 200)
    created.push(body.id)
  return { status: r.status, json: r.body ? JSON.parse(r.body) : null }
}

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
  await page.setViewportSize(WIDE)
  await loginAsAdmin(page)
})

test.afterEach(async ({ page }) => {
  // The pages of this suite are lost on restart anyway; remove them so the Host's nav stays clean.
  for (const id of created.splice(0)) {
    const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
    expect([200, 404], removed.body).toContain(removed.status)
  }
  expect(await takeUnexpected()).toEqual([])
})

test.describe('RC1-03: a plugin tile with no engine change', () => {
  test('a page with only { type } gets the default point and action, and shows both plugin tiles', async ({ page }) => {
    const published = await publish(page, spec(PAGE, ROUTE, {
      run: { type: 'demo.run_timeline' },
      users: { type: 'demo.user_status' },
    }, [['run'], ['users']]))
    expect(published.status, JSON.stringify(published.json)).toBe(200)

    // The engine added the default points and the default action; the page named none.
    const props = await api(page, 'GET', `/api/v1/dashboards/pages/${PAGE}/props`)
    expect(props.status, props.body).toBe(200)
    const tiles = JSON.parse(props.body).tiles
    expect(tiles.run.tag).toBe('run-timeline')
    expect(tiles.run.tile).toBe('demo.run_timeline')
    expect(tiles.run.tile_major).toBe(1)
    expect(tiles.run.data.main.point).toBe('run')
    expect(tiles.users.tag).toBe('user-status')
    expect(tiles.users.data.main.point).toBe('users')
    expect(tiles.users.actions.set_status.action).toBe('set_status')

    // Both tiles read their data and draw it. The running shell learns the route of a new page when it reloads.
    await refreshShell(page)
    await openInShell(page, ROUTE)
    const frame = pageFrame(page, PAGE)
    const users = JSON.parse((await api(page, 'GET', `/api/v1/dashboards/pages/${PAGE}/points/users`)).body)
    expect(users.state).toBe('ready')
    await expect(frame.locator('[data-tile-id="users"]')).toContainText(users.data.users[0].name, { timeout: 20_000 })
    const run = JSON.parse((await api(page, 'GET', `/api/v1/dashboards/pages/${PAGE}/points/run`)).body)
    expect(run.state).toBe('ready')
    await expect(frame.locator('[data-tile-id="run"]')).toContainText(run.data.run.status, { timeout: 20_000 })
  })

  test('rows without a layout give a layout for each board width', async ({ page }) => {
    const published = await publish(page, spec('e2e_plugin_rows', '/e2e/plugin-rows', {
      run: { type: 'demo.run_timeline' },
      users: { type: 'demo.user_status' },
    }, [['run', 'users']]))
    expect(published.status, JSON.stringify(published.json)).toBe(200)
    const props = JSON.parse((await api(page, 'GET', '/api/v1/dashboards/pages/e2e_plugin_rows/props')).body)
    expect(Object.keys(props.layout.layouts).sort()).toEqual(['default', 'lg', 'md', 'xl'])
    expect(props.layout.breakpoints).toEqual({ md: 640, lg: 1024, xl: 1440 })
    // The run tree is a full-width tile, so it never shares a row.
    const lg = props.layout.layouts.lg
    expect(lg.children).toHaveLength(2)
    expect(lg.children[0].children).toHaveLength(1)
    expect(props.frame).toEqual({ x: 14, y: expect.any(Number) })
    expect(props.widths).toEqual({ default: 0, md: 640, lg: 1024, xl: 1440 })
  })

  test('a page that names an unknown tile type, or options the claim does not allow, is refused', async ({ page }) => {
    expectFailures(page, { status: 400, path: '/api/v1/dashboards/pages' })
    const unknown = await publish(page, spec(PAGE, ROUTE, { x: { type: 'demo.nothing' } }, [['x']]))
    expect(unknown.status).toBe(400)
    expect(unknown.json.error.code).toBe('unknown_tile')
    expect(unknown.json.error.message).toContain('demo.nothing')

    const options = await publish(page, spec(PAGE, ROUTE, {
      n: { type: 'kpi', options: { label: 5 }, data: { main: 'sessions' }, fields: { value: 'sessions' } },
    }, [['n']], { sessions: { kind: 'function', ref: 'demo.actor:app_sessions' } }))
    expect(options.status).toBe(400)
    expect(options.json.error.code).toBe('invalid_spec')
    expect(options.json.error.message).toContain("tile 'n'")
    expect(options.json.error.message).toContain('label')
  })
})

test.describe('RC1-20: the catalogue lists the plugin tiles', () => {
  test('GET /api/v1/dashboards/catalogue lists claims, filters by kind and q, and keeps diagnostics free of the demo', async ({ page }) => {
    const all = await api(page, 'GET', '/api/v1/dashboards/catalogue')
    expect(all.status, all.body).toBe(200)
    const doc = JSON.parse(all.body)
    expect(doc.schema).toBe('wippy.dashboards.catalogue/v1')
    const byTile = (name: string) => doc.tiles.find((t: { tile: string }) => t.tile === name)
    for (const name of ['text', 'kpi', 'control.select', 'chart', 'table', 'artifact', 'demo.run_timeline', 'demo.user_status'])
      expect(byTile(name), name).toBeTruthy()
    expect(byTile('demo.run_timeline').size.fit).toBe('full')
    expect(byTile('demo.run_timeline').size.size_classes.medium).toBe(640)
    expect(byTile('demo.user_status').default_actions.set_status).toBe('demo.user_status:set_status')
    expect(byTile('demo.user_status').size_line).toMatch(/^demo\.user_status \(any\)/)
    // A claim of the demo that is not valid would show here.
    expect(doc.diagnostics.filter((d: { entry: string }) => d.entry.startsWith('demo.'))).toEqual([])
    expect(doc.board.widths).toEqual({ default: 0, md: 640, lg: 1024, xl: 1440 })

    const tilesOnly = JSON.parse((await api(page, 'GET', '/api/v1/dashboards/catalogue?kind=tiles&q=workflow')).body)
    expect(tilesOnly.points).toBeUndefined()
    expect(tilesOnly.tiles.map((t: { tile: string }) => t.tile)).toContain('demo.run_timeline')
    expect(tilesOnly.tiles.map((t: { tile: string }) => t.tile)).not.toContain('kpi')

    expectFailures(page, { status: 400, path: '/api/v1/dashboards/catalogue' })
    const bad = await api(page, 'GET', '/api/v1/dashboards/catalogue?kind=nothing')
    expect(bad.status).toBe(400)

    // No function id reaches a browser: the demo's function ids are not in the document.
    for (const funcId of ['demo.run_timeline:read_latest_run', 'demo.user_status:list_users', 'demo.user_status:set_user_status'])
      expect(all.body).not.toContain(funcId)
  })
})
