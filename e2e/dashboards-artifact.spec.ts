import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'
import { WIDE, answerReads, frame, pageFrame, publish, ready, refreshShell, remove, routeOf } from './dashboards-wp5.support'

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
    missing: { type: 'artifact', options: { artifact_id: 'no-such-artifact-id', artifact_type: 'component' } },
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
    // The missing artifact is looked up and refused on purpose; the Host logs the failure.
    expectFailures(page, { status: 404, path: '/api/v1/artifact/no-such-artifact-id' }, { text: 'Artifact "no-such-artifact-id" failed to load' })
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
      // The Host loaded the fixture page: <w-artifact> is ready and its frame holds content.
      await expect(f.locator('[data-tile-id="byid"] w-artifact')).toHaveAttribute('status', 'ready', { timeout: 20_000 })
      await expect(f.frameLocator('[data-tile-id="byid"] w-artifact iframe').locator('body')).toHaveText(/\S/, { timeout: 20_000 })

      // By tag: the installed component is created, with its props as attributes.
      await expect(f.locator('[data-tile-id="bytag"] dash-artifact')).toHaveCount(1)
      const props = await f.locator('[data-tile-id="bytag"] dash-artifact').evaluate((el) => {
        const inner = el.shadowRoot?.querySelector('fx-api')
        return inner ? { thread: inner.getAttribute('thread-id'), readonly: inner.getAttribute('readonly') } : null
      })
      expect(props).toEqual({ thread: '42', readonly: 'true' })
      // The component loaded and ran: it answered its API call (the admin may use it), it is not pending.
      await expect.poll(() => f.locator('[data-tile-id="bytag"] dash-artifact').evaluate(el => el.shadowRoot?.querySelector('fx-api')?.shadowRoot?.querySelector('[data-fx-api-status]')?.textContent?.trim()), { timeout: 20_000 }).toBe('allowed')

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
    // The viewer is refused by the fixture API on purpose.
    expectFailures(viewer, { status: 403, path: '/dashboards-fixtures/restricted' })
    await publish(admin, { ...ARTIFACT_PAGE, id: 'fx_artifact_rights', route: '/fx/artifact-rights', tiles: { api: { type: 'artifact', options: { tag: 'fx-api' } } }, rows: [['api']] })
    try {
      const status = (page: typeof admin) => pageFrame(page, 'fx_artifact_rights')
        .locator('[data-tile-id="api"] dash-artifact')
        .evaluate(el => el.shadowRoot?.querySelector('fx-api')?.shadowRoot?.querySelector('[data-fx-api-status]')?.getAttribute('data-fx-api-status') ?? '')
      await openInShell(admin, '/fx/artifact-rights')
      await expect.poll(() => status(admin), { timeout: 20_000 }).toBe('200')
      // The viewer calls the same API through the same component and gets a refusal.
      await refreshShell(viewer)
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
    route: routeOf(id),
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
    // The three refusals and the three missing pages afterwards are what this test proves.
    expectFailures(page, { status: 400, path: '/api/v1/dashboards/pages' }, { status: 404, path: '/props' })
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

/**
 * RC2-08 browser test: an artifact tile takes its `artifact_id` from a page parameter. Choosing a value in the
 * picker shows another artifact, and only the inputs that are bound to the parameter read again. The tile has no
 * data input, so it reads nothing itself. The reads of the page are answered by the test and counted.
 *
 * NOT RUN by the builder. It needs the engine side of the bound tile (WP-READ: the claim, the publish check and the
 * `params` of the tile), so it passes only after wave 2.
 */
const POINT = (ref: string, args: Record<string, unknown> = {}) => ({ kind: 'function', ref: `app.dashboards_fixtures:${ref}`, args })
const param = (name: string) => ({ $param: name })

const BOUND_PAGE = {
  id: 'fx_artifact_bound',
  title: 'Fixture bound artifact',
  route: '/fx/artifact-bound',
  params: { pick: { type: 'select', label: 'Artifact', options: { data: 'o' } } },
  // o lists the artifacts to choose from, n is bound to nothing, sm is bound to the parameter.
  data: { o: POINT('options'), n: POINT('numbers'), sm: POINT('series', { model: param('pick') }) },
  actions: {},
  tiles: {
    sel: { type: 'control.select', param: 'pick' },
    kp: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' }, options: { label: 'Fixed number' } },
    tb: { type: 'table', data: { main: 'sm' } },
    art: { type: 'artifact', options: { artifact_id: param('pick'), artifact_type: 'page' } },
  },
  rows: [['sel', 'kp'], ['tb'], ['art']],
}

test.describe('RC2-08: the artifact tile bound to a parameter', () => {
  test('choosing a value shows another artifact, and only the bound inputs read again', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, BOUND_PAGE)
    try {
      const calls = await answerReads(page, BOUND_PAGE.id, {
        o: ready('o', frame([{ name: 'value', type: 'string' }, { name: 'label', type: 'string' }], [['app.views:iframe-demo', 'Demo'], ['app.views:iframe-demo-themed', 'Themed']])),
        n: ready('n', frame([{ name: 'value', type: 'number', role: 'measure' }], [[1]])),
        sm: ready('sm', frame([{ name: 'model', type: 'string' }, { name: 'n', type: 'number', role: 'measure' }], [['x', 1]])),
      })
      const counts = (list: Array<{ point: string }>) => {
        const out: Record<string, number> = {}
        for (const c of list)
          out[c.point] = (out[c.point] ?? 0) + 1
        return out
      }
      await openInShell(page, BOUND_PAGE.route)
      const f = pageFrame(page, BOUND_PAGE.id)
      for (const id of ['sel', 'kp', 'tb'])
        await expect(f.locator(`[data-tile-id="${id}"]`)).toHaveAttribute('data-frame-status', 'ready', { timeout: 20_000 })
      // No value yet: the artifact tile shows the empty state (not an error), and nothing is loaded.
      const art = f.locator('[data-tile-id="art"]')
      await expect(art).toHaveAttribute('data-frame-status', 'empty', { timeout: 20_000 })
      await expect(f.locator('[data-tile-id="art"] w-artifact')).toHaveCount(0)
      expect(counts(calls), 'the first load reads each input once, and the artifact tile reads nothing').toEqual({ o: 1, n: 1, sm: 1 })

      const pick = async (label: string) => {
        await f.locator('[data-tile-id="sel"] [role="combobox"]').click()
        await f.getByRole('option', { name: label }).click()
      }
      const choose = async (label: string, id: string) => {
        const before = calls.length
        await pick(label)
        await expect(f.locator('[data-tile-id="art"] w-artifact')).toHaveAttribute('id', id, { timeout: 20_000 })
        await expect(art).toHaveAttribute('data-frame-status', 'ready')
        await page.waitForTimeout(1500)
        // Only the input whose argument uses the parameter reads again, once. The picker's options, the kpi and the artifact read nothing.
        expect(counts(calls.slice(before))).toEqual({ sm: 1 })
      }
      await choose('Demo', 'app.views:iframe-demo')
      await choose('Themed', 'app.views:iframe-demo-themed')
    }
    finally {
      await remove(page, BOUND_PAGE.id)
    }
  })
})
