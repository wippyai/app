import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'
import { WIDE, pageFrame, publish, remove } from './dashboards-wp5.support'

/**
 * RC1-21 browser tests: the built-in `artifact` tile shows a fixture artifact by id and a fixture web
 * component by tag with fixed props, a missing artifact shows an error in the tile, the shown component runs
 * with the viewer's rights, and the publish checks refuse a bad tile.
 *
 * NOT RUN by the builder (the coordinator runs browser tests at integration). It needs the fixture
 * components of src/dashboards_fixture_tiles (make build-wc-fixture-tiles) and the publish checks of WP3.
 *
 * The fixture artifact is the plain page `app.views:iframe-demo` of this app, shown by id with type `page`.
 * The agent case (a page with an artifact tile is refused without `confirmed: true`) belongs to the agent
 * tests of WP6.
 */

const ARTIFACT_PAGE = {
  id: 'fx_artifact',
  title: 'Fixture artifact tile',
  route: '/fx/artifact',
  data: {},
  actions: {},
  tiles: {
    byid: { type: 'artifact', options: { artifact_id: 'app.views:iframe-demo', artifact_type: 'page' } },
    bytag: { type: 'artifact', options: { tag: 'fx-api', props: { 'thread-id': '42', 'readonly': true } } },
    missing: { type: 'artifact', options: { artifact_id: 'no-such-artifact-id', artifact_type: 'artifact' } },
  },
  rows: [['byid'], ['bytag', 'missing']],
}

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

test.describe('RC1-21: the artifact tile', () => {
  test('shows an artifact by id and a component by tag, and an error for a missing artifact', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, ARTIFACT_PAGE)
    try {
      await openInShell(page, ARTIFACT_PAGE.route)
      const f = pageFrame(page, ARTIFACT_PAGE.id)

      // By id: the Host's <w-artifact> with the id and the type of the page.
      const artifact = f.locator('[data-tile-id="byid"] dash-artifact')
      await expect(artifact).toHaveCount(1, { timeout: 20_000 })
      const host = artifact.evaluate(el => el.shadowRoot?.querySelector('w-artifact')?.outerHTML ?? '')
      expect(await host).toContain('app.views:iframe-demo')
      expect(await host).toContain('type="page"')

      // By tag: the installed component is created, with its props as attributes.
      await expect(f.locator('[data-tile-id="bytag"] dash-artifact')).toHaveCount(1)
      const props = await f.locator('[data-tile-id="bytag"] dash-artifact').evaluate((el) => {
        const inner = el.shadowRoot?.querySelector('fx-api')
        return inner ? { thread: inner.getAttribute('thread-id'), readonly: inner.getAttribute('readonly') } : null
      })
      expect(props).toEqual({ thread: '42', readonly: 'true' })

      // A missing artifact shows an error in the tile, not a blank space.
      const error = f.locator('[data-tile-id="missing"] dash-artifact').locator('[data-artifact-error]')
      await expect(error).toBeVisible({ timeout: 20_000 })
    }
    finally {
      await remove(page, ARTIFACT_PAGE.id)
    }
  })

  test('the shown component runs with the viewer\'s rights', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    await publish(admin, { ...ARTIFACT_PAGE, id: 'fx_artifact_rights', route: '/fx/artifact-rights', tiles: { api: { type: 'artifact', options: { tag: 'fx-api' } } }, rows: [['api']] })
    try {
      const status = (page: typeof admin) => pageFrame(page, 'fx_artifact_rights')
        .locator('[data-tile-id="api"] dash-artifact')
        .evaluate(el => el.shadowRoot?.querySelector('fx-api')?.shadowRoot?.querySelector('[data-fx-api-status]')?.getAttribute('data-fx-api-status') ?? '')
      await openInShell(admin, '/fx/artifact-rights')
      await expect.poll(() => status(admin), { timeout: 20_000 }).toBe('200')
      // The viewer calls the same API through the same component and gets a refusal.
      await openInShell(viewer, '/fx/artifact-rights')
      await expect.poll(() => status(viewer), { timeout: 20_000 }).toBe('403')
    }
    finally {
      await remove(admin, 'fx_artifact_rights')
    }
  })
})

test.describe('RC1-21: publish checks', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  const spec = (id: string, options: Record<string, unknown>) => ({
    spec: 'wippy.dashboard_page/v1',
    publish: true,
    id,
    title: id,
    route: `/fx/${id}`,
    data: {},
    actions: {},
    tiles: { a: { type: 'artifact', options } },
    rows: [['a']],
  })

  test('refuses an unknown tag, both artifact_id and tag, and props over 16 KiB', async ({ page }) => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['fx_art_unknown_tag', { tag: 'no-such-component' }],
      ['fx_art_both', { artifact_id: 'abc', artifact_type: 'page', tag: 'fx-api' }],
      ['fx_art_big', { tag: 'fx-api', props: { blob: 'x'.repeat(16 * 1024 + 1) } }],
    ]
    for (const [id, options] of cases) {
      const res = await api(page, 'POST', '/api/v1/dashboards/pages', spec(id, options))
      expect(res.status, `${id}: ${res.body}`).toBe(400)
    }
    // Each refusal left nothing behind.
    for (const [id] of cases)
      expect((await api(page, 'GET', `/api/v1/dashboards/pages/${id}/props`)).status).toBe(404)
  })

  test('accepts a tile that sets only the tag, and one that sets only the artifact id', async ({ page }) => {
    for (const [id, options] of [
      ['fx_art_ok_tag', { tag: 'fx-api' }],
      ['fx_art_ok_id', { artifact_id: 'app.views:iframe-demo', artifact_type: 'page' }],
    ] as Array<[string, Record<string, unknown>]>) {
      const res = await api(page, 'POST', '/api/v1/dashboards/pages', spec(id, options))
      expect(res.status, `${id}: ${res.body}`).toBe(200)
      await remove(page, id)
    }
  })
})
