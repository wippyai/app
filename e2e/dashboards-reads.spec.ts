import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'

/**
 * Engine reads, access and actions of wippy/dashboards (RC1-05, RC1-06, RC1-08 and RC1-13, browser
 * side), on the fixtures of src/dashboards_fixtures. The suite publishes four pages before the first
 * test, as the admin, and removes them afterwards:
 *   reads_states  /reads/states  one data entry for each row of the state table of the data point
 *                                contract (ready, empty, failed, wrong data, slow, timeout, mapper)
 *   reads_values  /reads/values  value cases: decimals, big integers, time offsets, empty cells in each
 *                                type, malformed values; two table tiles show the valid and empty cases
 *   reads_denied  /reads/denied  a policy denies it to regular users (RC1-06)
 *   reads_toggle  /reads/toggle  a policy that the endpoint /api/v1/dashboards-fixtures/access flips
 *                                between allow and deny at run time (RC1-08); a slow point and a slow action
 * The API checks call the engine's endpoints as the admin and as the viewer account. Each blocked call
 * is declared with expectFailures, because the page watch counts every response of 400 and above.
 */

const BASE = '/api/v1/dashboards/pages'
const PAGES = ['reads_states', 'reads_values', 'reads_denied', 'reads_toggle']

function param(name: string) {
  return { $param: name }
}

function point(ref: string, args?: Record<string, unknown>) {
  return { kind: 'function', ref: `app.dashboards_fixtures:${ref}`, ...(args ? { args } : {}) }
}

/** A page with the tiles in one column of 200 px rows. */
function pageSpec(id: string, route: string, extra: Record<string, unknown>, tileIds: string[]) {
  return {
    spec: 'wippy.dashboard_page/v1',
    publish: true,
    id,
    title: `Reads ${id}`,
    route,
    params: {},
    data: {},
    actions: {},
    tiles: {},
    layout: {
      layouts: {
        default: { direction: 'vertical', children: tileIds.map(t => ({ panel: t, size: '220px' })) },
      },
    },
    ...extra,
  }
}

const SPECS: Record<string, unknown> = {
  reads_states: pageSpec('reads_states', '/reads/states', {
    params: { model: { type: 'string' } },
    data: {
      ok: point('numbers'),
      empty: point('empty_series'),
      failing: point('fails'),
      wrong: point('wrong_shape'),
      badcell: point('bad_cell'),
      sleepy: point('sleepy'),
      slow: point('slow'),
      nullstrict: point('null_strict'),
      mapper: point('bad_mapper'),
      blockedmapper: point('blocked_mapper'),
      refuse: point('refuse'),
      echo: point('echo', { model: param('model'), limit: 5 }),
    },
    tiles: {
      ok_kpi: { type: 'kpi', data: { main: 'ok' }, fields: { value: 'value' }, options: { label: 'Fixed number' } },
      wrong_kpi: { type: 'kpi', data: { main: 'wrong' }, fields: { value: 'value' }, options: { label: 'Wrong data' } },
    },
  }, ['ok_kpi', 'wrong_kpi']),
  reads_values: pageSpec('reads_values', '/reads/values', {
    data: {
      valid: point('values', { case: 'valid' }),
      nulls: point('values', { case: 'empty_cells' }),
      norows: point('values', { case: 'no_rows' }),
      changed: point('values', { case: 'changed_format' }),
      numstr: point('values', { case: 'number_as_string' }),
      bignum: point('values', { case: 'big_number' }),
      baddec: point('values', { case: 'bad_decimal' }),
      baddate: point('values', { case: 'bad_date' }),
      badtime: point('values', { case: 'bad_time' }),
      markerx: point('values', { case: 'marker_extra_key' }),
      record: point('record_nulls'),
      schema: point('schema_nulls'),
    },
    tiles: {
      t_valid: { type: 'table', data: { main: 'valid' } },
      t_nulls: { type: 'table', data: { main: 'nulls' } },
    },
  }, ['t_valid', 't_nulls']),
  reads_denied: pageSpec('reads_denied', '/reads/denied', {
    data: { ok: point('numbers') },
    actions: { noop: point('noop') },
    tiles: { ok_kpi: { type: 'kpi', data: { main: 'ok' }, fields: { value: 'value' } } },
  }, ['ok_kpi']),
  reads_toggle: pageSpec('reads_toggle', '/reads/toggle', {
    data: {
      ok: point('numbers'),
      slow: point('slow'),
      // The users point of the demo has a live signal (dash.users.changed), which the signal test sends.
      users: { kind: 'function', ref: 'demo.user_status:users' },
    },
    actions: { slow: point('slow_action') },
    tiles: {
      ok_kpi: { type: 'kpi', data: { main: 'ok' }, fields: { value: 'value' }, options: { label: 'Fixed number' } },
      slow_kpi: { type: 'kpi', data: { main: 'slow' }, fields: { value: 'value' }, options: { label: 'Slow number' } },
      users_tile: { type: 'demo.user_status', data: { main: 'users' } },
    },
  }, ['ok_kpi', 'slow_kpi', 'users_tile']),
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    await setAccess(page, true)
    for (const id of PAGES) {
      const published = await api(page, 'POST', BASE, SPECS[id])
      expect(published.status, `${id}: ${published.body}`).toBe(200)
    }
  }
  finally {
    await context.close()
  }
})

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    await setAccess(page, true)
    for (const id of PAGES) {
      const removed = await api(page, 'DELETE', `${BASE}/${id}`)
      expect([200, 404], removed.body).toContain(removed.status)
    }
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

// ── helpers ──────────────────────────────────────────────────────────

interface Answer {
  status: number
  raw: string
  body: any
}

async function call(page: Page, method: string, path: string, body?: unknown): Promise<Answer> {
  const r = await api(page, method, path, body)
  let parsed: any = {}
  try {
    parsed = r.body ? JSON.parse(r.body) : {}
  }
  catch {
    parsed = { text: r.body }
  }
  return { status: r.status, raw: r.body, body: parsed }
}

/** Reads a point of a page through the read endpoint with the signed-in user's token. */
function read(page: Page, pageId: string, name: string, args?: Record<string, unknown>, operation?: string) {
  const query: string[] = []
  if (args)
    query.push(`args=${encodeURIComponent(JSON.stringify(args))}`)
  if (operation)
    query.push(`operation=${encodeURIComponent(operation)}`)
  return call(page, 'GET', `${BASE}/${pageId}/points/${name}${query.length ? `?${query.join('&')}` : ''}`)
}

function runAction(page: Page, pageId: string, name: string, key: string, args: Record<string, unknown> = {}) {
  return call(page, 'POST', `${BASE}/${pageId}/actions/${name}`, { args, idempotency_key: key })
}

let keyCounter = 0
function newKey(prefix: string): string {
  keyCounter += 1
  return `${prefix}-${Date.now()}-${keyCounter}-${Math.floor(Math.random() * 1e6)}`
}

/** Allows or withdraws the right of regular users to view the page reads_toggle (admin call). */
async function setAccess(admin: Page, allow: boolean) {
  const r = await call(admin, 'POST', '/api/v1/dashboards-fixtures/access', { allow })
  expect(r.status, r.raw).toBe(200)
}

function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

async function signedIn(browser: any, who: 'admin' | 'viewer', name: string): Promise<Page> {
  const page = await newPage(browser, name)
  if (who === 'admin')
    await loginAsAdmin(page)
  else
    await loginAs(page, 'viewer@wippy.local')
  return page
}

// ── RC1-13: values and empty cells ───────────────────────────────────

test.describe('values keep their meaning from point to tile (RC1-13)', () => {
  test('valid values arrive unchanged: decimals as text, three offsets, big numbers as decimals', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const r = await read(admin, 'reads_values', 'valid')
    expect(r.status).toBe(200)
    expect(r.body.state).toBe('ready')
    const rows = r.body.data.rows
    expect(rows.map((row: unknown[]) => row[3])).toEqual(['12345678901234567890', '-0.10', '+7'])
    expect(rows.map((row: unknown[]) => row[1])).toEqual([
      '2026-11-19T12:00:00+01:00',
      '2026-11-19T12:00:00-05:30',
      '2026-11-19T12:00:00Z',
    ])
    expect(rows[0][2]).toBe(1.5)
    // the raw text carries the decimal as a quoted string, never as a number
    expect(r.raw).toContain('"12345678901234567890"')
    // a text cell that holds "$null" is plain text
    expect(rows[1][4]).toBe('$null')
    expect(rows[2][4]).toBe('a "quoted" {"$null":true}')
  })

  test('an empty cell in a nullable field of each type is JSON null on the wire', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const r = await read(admin, 'reads_values', 'nulls')
    expect(r.status).toBe(200)
    expect(r.body.state).toBe('ready')
    expect(r.raw).toContain('[null,"2026-11-19T12:00:00Z",1,"1.5","x",true]')
    expect(r.raw).toContain('["2026-11-19","2026-11-19T12:00:00Z",null,"1.5",null,true]')
    expect(r.raw).toContain('["2026-11-19",null,2,null,"y",null]')
    expect(r.raw).toContain('[null,null,null,null,null,null]')
    expect(r.raw).not.toContain('$null')
    expect(r.body.data.rows[3]).toEqual([null, null, null, null, null, null])
  })

  test('records and schema data write an empty cell as null', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const record = await read(admin, 'reads_values', 'record')
    expect(record.body.state).toBe('ready')
    expect(record.body.data.note).toBeNull()
    expect(record.body.data.nested.count).toBe(2)
    const schema = await read(admin, 'reads_values', 'schema')
    expect(schema.body.state).toBe('ready')
    expect(schema.body.data.items[0].extra).toBeNull()
    expect(schema.body.data.items[1].label).toBeNull()
  })

  test('an empty result is empty, and each invalid value is a data error that names the field', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const empty = await read(admin, 'reads_values', 'norows')
    expect(empty.body.state).toBe('empty')
    const cases: Array<[string, string, string]> = [
      ['changed', 'reads_values', 'n'],
      ['numstr', 'reads_values', 'n'],
      ['bignum', 'reads_values', 'n'],
      ['baddec', 'reads_values', 'dec'],
      ['baddate', 'reads_values', 'd'],
      ['badtime', 'reads_values', 't'],
      ['markerx', 'reads_values', 'n'],
    ]
    for (const [name, pageId, field] of cases) {
      const r = await read(admin, pageId, name)
      expect(r.status, name).toBe(200)
      expect(r.body.state, name).toBe('failed')
      expect(r.body.error.code, name).toBe('format_mismatch')
      expect(r.body.error.input, name).toBe('main')
      expect(r.body.error.field, name).toBe(field)
      expect(r.body.data, name).toBeUndefined()
    }
    // a scalar with two rows, an empty cell in a required field
    const two = await read(admin, 'reads_states', 'wrong')
    expect(two.body.error.code).toBe('format_mismatch')
    expect(two.body.error.field).toBe('rows')
    const strict = await read(admin, 'reads_states', 'nullstrict')
    expect(strict.body.error.code).toBe('format_mismatch')
    expect(strict.body.error.field).toBe('value')
  })

  test('the table tile shows an empty cell as missing, never as 0 or text, and keeps decimals exact', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 })
    await loginAsAdmin(page)
    await openInShell(page, '/reads/values')
    const frame = pageFrame(page, 'reads_values')

    const valid = frame.locator('[data-tile-id="t_valid"]')
    await expect(valid.locator('tbody tr')).toHaveCount(3, { timeout: 20_000 })
    await expect(valid).toContainText('12345678901234567890')
    await expect(valid).toContainText('-0.10')

    const nulls = frame.locator('[data-tile-id="t_nulls"]')
    await expect(nulls.locator('tbody tr')).toHaveCount(4, { timeout: 20_000 })
    // the last row is empty in every column; the first column of the first row too
    const last = nulls.locator('tbody tr').nth(3).locator('td')
    const cells = await last.allInnerTexts()
    expect(cells.length).toBeGreaterThan(0)
    for (const text of cells)
      expect(text.trim()).toBe('')
    expect((await nulls.locator('tbody tr').nth(0).locator('td').first().innerText()).trim()).toBe('')
    const all = await nulls.locator('tbody td').allInnerTexts()
    for (const text of all) {
      expect(text.trim()).not.toBe('null')
      expect(text.trim()).not.toBe('undefined')
    }
    // the cell that holds 0 is not there: the one empty cell of the number column shows nothing
    expect((await nulls.locator('tbody tr').nth(1).locator('td').nth(2).innerText()).trim()).toBe('')
  })
})

// ── RC1-05: errors and slow data ─────────────────────────────────────

test.describe('errors and slow data show the right state (RC1-05)', () => {
  test('each row of the state table answers its state and code', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    expectFailures(admin, { status: 400, path: '/api/v1/dashboards/pages/reads_states/points/' })
    const ok = await read(admin, 'reads_states', 'ok')
    expect(ok.status).toBe(200)
    expect(ok.body.state).toBe('ready')
    expect(ok.body.data.rows).toEqual([[42]])

    const empty = await read(admin, 'reads_states', 'empty')
    expect(empty.body.state).toBe('empty')

    const failing = await read(admin, 'reads_states', 'failing')
    expect(failing.status).toBe(200)
    expect(failing.body.state).toBe('failed')
    expect(failing.body.error.code).toBe('source_error')
    expect(failing.raw).not.toContain('SECRET')

    const badcell = await read(admin, 'reads_states', 'badcell')
    expect(badcell.body.error.code).toBe('format_mismatch')
    expect(badcell.body.error.field).toBe('tokens')

    const mapper = await read(admin, 'reads_states', 'mapper')
    expect(mapper.body.state).toBe('failed')
    expect(mapper.body.error.code).toBe('mapping_failed')

    const expired = await read(admin, 'reads_states', 'ok', undefined, 'no-such-token')
    expect(expired.status).toBe(200)
    expect(expired.body.error.code).toBe('expired')

    // the page binds limit; a key it does not bind is refused with 400
    const bad = await read(admin, 'reads_states', 'echo', { model: 'alpha', other: 1 })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('invalid_args')
    expect(bad.body.error.field).toBe('other')
    const outside = await read(admin, 'reads_states', 'echo', { model: 'gamma' })
    expect(outside.status).toBe(400)
    // a fixed key sent with another value reads with the page's value
    const fixed = await read(admin, 'reads_states', 'echo', { model: 'alpha', limit: 99 })
    expect(fixed.status).toBe(200)
    expect(fixed.body.data.limit).toBe(5)
  })

  test('a mapper that blocks ends at its deadline, and a function that refuses the viewer answers denied', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    expectFailures(admin, { status: 403, path: '/api/v1/dashboards/pages/reads_states/points/refuse' })
    const started = Date.now()
    const blocked = await read(admin, 'reads_states', 'blockedmapper')
    expect(blocked.status).toBe(200)
    expect(blocked.body.state).toBe('failed')
    expect(blocked.body.error.code).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(2900)

    const refused = await read(admin, 'reads_states', 'refuse')
    expect(refused.status).toBe(403)
    expect(refused.body.state).toBe('denied')
    expect(refused.body.data).toBeUndefined()
    expect(refused.raw).not.toContain('SECRET')
  })

  test('a read that takes longer than its deadline answers timeout', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const started = Date.now()
    const r = await read(admin, 'reads_states', 'sleepy')
    expect(r.status).toBe(200)
    expect(r.body.state).toBe('failed')
    expect(r.body.error.code).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(2900)
  })

  test('a slow point answers computing within 1 s, repeated reads follow one run, and it ends with the result', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const viewer = await signedIn(browser, 'viewer', 'viewer')
    const started = Date.now()
    const first = await read(admin, 'reads_toggle', 'slow', {})
    expect(Date.now() - started).toBeLessThan(1000)
    expect(first.status).toBe(200)
    expect(first.body.state).toBe('computing')
    expect(typeof first.body.operation).toBe('string')
    expect(first.body.retry_after_ms).toBeGreaterThanOrEqual(100)
    const token: string = first.body.operation

    const second = await read(admin, 'reads_toggle', 'slow', {}, token)
    expect(second.body.state).toBe('computing')
    expect(second.body.operation).toBe(token)

    // the token is bound to the viewer and to the page
    const otherViewer = await read(viewer, 'reads_toggle', 'slow', {}, token)
    expect(otherViewer.body.error.code).toBe('expired')
    const otherPage = await read(admin, 'reads_states', 'slow', {}, token)
    expect(otherPage.body.error.code).toBe('expired')

    await expect.poll(async () => (await read(admin, 'reads_toggle', 'slow', {}, token)).body.state, {
      timeout: 20_000,
      intervals: [first.body.retry_after_ms],
    }).toBe('ready')
    const done = await read(admin, 'reads_toggle', 'slow', {}, token)
    expect(done.body.data.rows).toEqual([[7]])
    // the kept result answers again
    expect((await read(admin, 'reads_toggle', 'slow', {}, token)).body.state).toBe('ready')
  })

  test('a slow action answers computing with a token, repeated calls with its key follow one run, then done', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const key = newKey('slow-action')
    const started = Date.now()
    const first = await runAction(admin, 'reads_toggle', 'slow', key)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(first.status).toBe(200)
    expect(first.body.state).toBe('computing')
    const token: string = first.body.operation
    expect(typeof token).toBe('string')

    const second = await runAction(admin, 'reads_toggle', 'slow', key)
    expect(second.body.state).toBe('computing')
    expect(second.body.operation).toBe(token)

    await expect.poll(async () => (await runAction(admin, 'reads_toggle', 'slow', key)).body.state, {
      timeout: 20_000,
      intervals: [first.body.retry_after_ms],
    }).toBe('done')
    const again = await runAction(admin, 'reads_toggle', 'slow', key)
    expect(again.body.state).toBe('done')
    expect(again.body.replayed).toBe(true)
  })

  test('the tile shows the slow result when it arrives, and an error state for wrong data', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 })
    await loginAsAdmin(page)
    await openInShell(page, '/reads/toggle')
    const frame = pageFrame(page, 'reads_toggle')
    await expect(frame.locator('[data-tile-id="ok_kpi"]')).toContainText('42', { timeout: 20_000 })
    // computing first, then the result after about 5 s
    await expect(frame.locator('[data-tile-id="slow_kpi"]')).toContainText('7', { timeout: 25_000 })

    await openInShell(page, '/reads/states')
    const states = pageFrame(page, 'reads_states')
    await expect(states.locator('[data-tile-id="ok_kpi"]')).toContainText('42', { timeout: 20_000 })
    const wrong = states.locator('[data-tile-id="wrong_kpi"]')
    await expect(wrong).toBeVisible({ timeout: 20_000 })
    // an error never turns into a number that looks valid
    await expect(wrong).not.toHaveText(/^\s*[12]\s*$/)
    await expect(wrong).toContainText(/error|failed|could not|not match|invalid/i, { timeout: 20_000 })
  })
})

// ── RC1-06: access ───────────────────────────────────────────────────

test.describe('a user without access is refused by the page and by the API (RC1-06)', () => {
  test('props, reads, actions, publish and delete answer 403 for the viewer, and the page records its author', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const viewer = await signedIn(browser, 'viewer', 'viewer')
    expectFailures(viewer, { status: 403, path: '/api/v1/dashboards/pages' })
    expectFailures(admin, { status: 404, path: '/api/v1/dashboards/pages/reads_missing' })

    const adminProps = await call(admin, 'GET', `${BASE}/reads_denied/props`)
    expect(adminProps.status).toBe(200)
    expect(typeof adminProps.body.author).toBe('string')
    expect(adminProps.body.author.length).toBeGreaterThan(0)

    const props = await call(viewer, 'GET', `${BASE}/reads_denied/props`)
    expect(props.status).toBe(403)
    expect(props.body.error.code).toBe('denied')

    const readDenied = await read(viewer, 'reads_denied', 'ok')
    expect(readDenied.status).toBe(403)
    expect(readDenied.body.state).toBe('denied')

    const actionDenied = await runAction(viewer, 'reads_denied', 'noop', newKey('denied'))
    expect(actionDenied.status).toBe(403)

    const publish = await call(viewer, 'POST', BASE, { ...(SPECS.reads_denied as object), id: 'reads_viewer_publish', route: '/reads/viewer-publish' })
    expect(publish.status).toBe(403)
    const removed = await call(viewer, 'DELETE', `${BASE}/reads_denied`)
    expect(removed.status).toBe(403)
    expect((await call(admin, 'GET', `${BASE}/reads_denied/props`)).status).toBe(200)

    // "access denied" and "not available" are different answers
    const missing = await call(admin, 'GET', `${BASE}/reads_missing/props`)
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('not_found')
    expect(missing.body.error.code).not.toBe(props.body.error.code)
  })

  test('the page says "access denied" to the viewer', async ({ browser }) => {
    const viewer = await signedIn(browser, 'viewer', 'viewer')
    expectFailures(viewer, { status: 403, path: '/api/v1/dashboards/pages/reads_denied' })
    await openInShell(viewer, '/reads/denied')
    await expect(pageFrame(viewer, 'reads_denied').locator('body')).toContainText(/access denied/i, { timeout: 20_000 })
  })
})

// ── RC1-08: withdrawn access ─────────────────────────────────────────

test.describe('withdrawn access is refused on every read path (RC1-08)', () => {
  test('a policy change at run time applies to the next read, props, action and running operation', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const viewer = await signedIn(browser, 'viewer', 'viewer')
    expectFailures(viewer, { status: 403, path: '/api/v1/dashboards/pages/reads_toggle' })

    // The viewer may read, and starts a slow read that is still running when access is withdrawn.
    expect((await call(viewer, 'GET', `${BASE}/reads_toggle/props`)).status).toBe(200)
    expect((await read(viewer, 'reads_toggle', 'ok')).status).toBe(200)
    const running = await read(viewer, 'reads_toggle', 'slow', {})
    expect(running.body.state).toBe('computing')
    const token: string = running.body.operation

    await setAccess(admin, false)
    try {
      const props = await call(viewer, 'GET', `${BASE}/reads_toggle/props`)
      expect(props.status).toBe(403)
      expect(props.body.error.code).toBe('denied')

      const direct = await read(viewer, 'reads_toggle', 'ok')
      expect(direct.status).toBe(403)
      expect(direct.body.state).toBe('denied')
      expect(direct.body.data).toBeUndefined()

      // the read that a signal triggers is this same read
      const again = await read(viewer, 'reads_toggle', 'ok')
      expect(again.status).toBe(403)

      const action = await runAction(viewer, 'reads_toggle', 'slow', newKey('withdrawn'))
      expect(action.status).toBe(403)

      const next = await read(viewer, 'reads_toggle', 'slow', {}, token)
      expect(next.status).toBe(403)
      expect(next.body.state).toBe('denied')
      expect(next.body.data).toBeUndefined()
    }
    finally {
      await setAccess(admin, true)
    }

    // access is back: the same operation continues to its result
    await expect.poll(async () => (await read(viewer, 'reads_toggle', 'slow', {}, token)).body.state, { timeout: 20_000 }).toBe('ready')
  })

  test('the read that a live signal triggers is refused after the withdrawal', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const viewer = await signedIn(browser, 'viewer', 'viewer')
    expectFailures(viewer, { status: 403, path: '/api/v1/dashboards/pages/reads_toggle/points/users' })
    await viewer.setViewportSize({ width: 1920, height: 1000 })
    await openInShell(viewer, '/reads/toggle')
    const rows = pageFrame(viewer, 'reads_toggle').locator('[data-tile-id="users_tile"] tr[data-user-id]')
    await expect(rows.first()).toBeVisible({ timeout: 20_000 })

    // From here on, record every answer to a read of the users point that the open page sends.
    const answers: number[] = []
    viewer.on('response', (r) => {
      if (r.url().includes('/pages/reads_toggle/points/users'))
        answers.push(r.status())
    })
    await setAccess(admin, false)
    try {
      // The signal carries no data: the page reads the point again, as the viewer, and is refused.
      const sent = await call(admin, 'POST', '/api/v1/demo/signal/users', {})
      expect(sent.status, sent.raw).toBe(200)
      await expect.poll(() => answers, { timeout: 15_000 }).toContain(403)
      expect(answers.filter(status => status === 200)).toEqual([])
    }
    finally {
      await setAccess(admin, true)
    }
  })

  test('an open page is refused on reload after the withdrawal', async ({ browser }) => {
    const admin = await signedIn(browser, 'admin', 'admin')
    const viewer = await signedIn(browser, 'viewer', 'viewer')
    expectFailures(viewer, { status: 403, path: '/api/v1/dashboards/pages/reads_toggle' })
    await viewer.setViewportSize({ width: 1920, height: 1000 })
    await openInShell(viewer, '/reads/toggle')
    await expect(pageFrame(viewer, 'reads_toggle').locator('[data-tile-id="ok_kpi"]')).toContainText('42', { timeout: 20_000 })
    await setAccess(admin, false)
    try {
      await viewer.reload()
      await openInShell(viewer, '/reads/toggle')
      await expect(pageFrame(viewer, 'reads_toggle').locator('body')).toContainText(/access denied/i, { timeout: 20_000 })
    }
    finally {
      await setAccess(admin, true)
    }
  })
})
