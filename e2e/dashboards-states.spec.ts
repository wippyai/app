import type { Page, Route } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'
import {
  WIDE,
  answerReads,
  envelope,
  fixtureLog,
  frame,
  pageFrame,
  expectHostRefusesPage,
  publish,
  refreshShell,
  ready,
  remove,
  routeOf,
} from './dashboards-wp5.support'

/**
 * Browser tests of the states of a tile and of the request lifecycle:
 *   RC1-05  states and the state display preference (tile contract section 4.4), for a tile whose states the
 *           board draws (a table) and for a fixture tile with `draws_states: true` (fx-states); computing,
 *           stale, expired and timeout; optional inputs
 *   RC1-06  the page says "access denied" for 403 and "not available" for 404
 *   RC1-13  empty cells, decimals and timestamps in every built-in tile
 *   RC1-14  new attributes, a newer request and a deadline end each request with one outcome
 *   RC1-15  a tile whose stored major version is not installed shows an incompatibility error
 *
 * NOT RUN by the builder (the coordinator runs browser tests at integration). It needs the fixture
 * components of src/dashboards_fixture_tiles (make build-wc-fixture-tiles). The reads of the pages are
 * answered by the tests (page.route), so each state is exact and the values do not depend on the fixture points.
 */

const POINT = (ref: string, args: Record<string, unknown> = {}) => ({ kind: 'function', ref: `app.dashboards_fixtures:${ref}`, args })
const param = (name: string) => ({ $param: name })

/** A page whose tiles read with the model from the path: `/fx/states/alpha` and then `/fx/states/beta` change the arguments. */
function statesPage(id: string, stateDisplay?: Record<string, string>) {
  return {
    id,
    title: `Fixture states ${id}`,
    route: routeOf(id),
    params: { q: { type: 'string', label: 'Q', from_path: 0, default: 'alpha' } },
    data: {
      s: POINT('series', { model: param('q') }),
      r: POINT('echo', { model: param('q'), limit: 5 }),
    },
    actions: {},
    tiles: {
      // The board draws the states of the table.
      tb: { type: 'table', data: { main: 's' }, ...(stateDisplay ? { state_display: stateDisplay } : {}) },
      // The fixture tile draws its own states.
      ds: { type: 'fixture.states', data: { main: 'r' }, fields: { text: 'text' }, ...(stateDisplay ? { state_display: stateDisplay } : {}) },
    },
    rows: [['tb', 'ds']],
  }
}

const REPLACE_ALL = { refreshing: 'replace', computing: 'replace', error: 'replace' }

/** The model that a read asks for, from its `args` query. */
function modelOf(url: URL): string {
  const args = JSON.parse(url.searchParams.get('args') ?? '{}') as { model?: string }
  return args.model ?? ''
}

/** A gate that holds the reads of one model until the test releases it. */
function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => { open = resolve })
  return { opened, open }
}

const seriesFor = (model: string) => frame([{ name: 'model', type: 'string' }, { name: 'n', type: 'number', role: 'measure' }], [[model, 1]])

/** Answers both points of a states page. `held` models wait for their gate; `special` models answer with the given body. */
async function answerStates(page: Page, id: string, options: {
  held?: Record<string, Promise<void>>
  special?: Record<string, (point: string) => unknown>
} = {}) {
  const answer = (point: 'series' | 's' | 'r') => async (_route: Route, url: URL) => {
    const model = modelOf(url)
    await options.held?.[model]
    const special = options.special?.[model]
    if (special)
      return special(point)
    return point === 'r'
      ? ready('r', { text: `${model}-data` })
      : ready('s', seriesFor(model))
  }
  return answerReads(page, id, { s: answer('s'), r: answer('r') })
}

const tileText = (f: ReturnType<typeof pageFrame>) => f.locator('[data-tile-id="ds"] .frame__tile > *').evaluate(el => el.shadowRoot?.querySelector('[data-fx-text]')?.textContent?.trim() ?? null)
const tileAttr = (f: ReturnType<typeof pageFrame>, name: string) =>
  f.locator('[data-tile-id="ds"] .frame__tile > *').evaluate((el, n) => el.shadowRoot?.querySelector(`[${n}]`)?.getAttribute(n) ?? null, name)

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

test.describe('RC1-05: states and the display preference', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, statesPage('fx_keep'))
    await publish(page, statesPage('fx_replace', REPLACE_ALL))
  })

  test.afterEach(async ({ page }) => {
    await remove(page, 'fx_keep')
    await remove(page, 'fx_replace')
  })

  test('refreshing with old data: a mark and the data under keep, a panel under replace', async ({ page }) => {
    for (const [id, keep] of [['fx_keep', true], ['fx_replace', false]] as const) {
      const hold = gate()
      await answerStates(page, id, { held: { beta: hold.opened } })
      await openInShell(page, `${routeOf(id)}/alpha`)
      const f = pageFrame(page, id)
      await expect(f.locator('[data-tile-id="tb"]')).toHaveAttribute('data-frame-status', 'ready', { timeout: 20_000 })
      await expect.poll(() => tileText(f)).toBe('alpha-data')

      // A new argument value: the old data is on screen while the new read runs.
      await openInShell(page, `${routeOf(id)}/beta`)
      if (keep) {
        await expect(f.locator('[data-tile-id="tb"] [data-frame-mark="refreshing"]')).toBeVisible()
        await expect(f.locator('[data-tile-id="tb"] [data-frame-panel]')).toHaveCount(0)
        await expect.poll(() => tileAttr(f, 'data-fx-mark')).toBe('refreshing')
        expect(await tileText(f)).toBe('alpha-data')
      }
      else {
        await expect(f.locator('[data-tile-id="tb"] [data-frame-panel="refreshing"]')).toBeVisible()
        await expect.poll(() => tileAttr(f, 'data-fx-panel')).toBe('refreshing')
        expect(await tileText(f)).toBeNull()
      }
      // render-state says refreshing, with has_data true.
      const states = (await fixtureLog(f, 'ds')).states
      expect(states.some(s => s.status === 'refreshing' && s.has_data === true)).toBe(true)

      hold.open()
      await expect.poll(() => tileText(f)).toBe('beta-data')
      await expect(f.locator('[data-tile-id="tb"]')).toHaveAttribute('data-frame-status', 'ready')
    }
  })

  test('computing and error with old data: keep and replace; without old data a panel; denied removes the data', async ({ page }) => {
    for (const [id, keep] of [['fx_keep', true], ['fx_replace', false]] as const) {
      const seen: number[] = []
      await answerStates(page, id, {
        special: {
          beta: (point) => {
            // The first read answers computing with the last good value; the follow-up read gets the result.
            seen.push(Date.now())
            return seen.length <= 2
              ? envelope(point, 'computing', { operation: 'tok', retry_after_ms: 1500, stale: true, data: point === 'r' ? { text: 'alpha-data' } : seriesFor('alpha') })
              : ready(point, point === 'r' ? { text: 'beta-data' } : seriesFor('beta'))
          },
          gamma: point => envelope(point, 'failed', { error: { code: 'source_error', message: 'The data could not be read.' } }),
          delta: point => envelope(point, 'denied', { error: { code: 'denied', message: 'No.' } }),
        },
      })
      await openInShell(page, `${routeOf(id)}/alpha`)
      const f = pageFrame(page, id)
      await expect.poll(() => tileText(f), { timeout: 20_000 }).toBe('alpha-data')

      await openInShell(page, `${routeOf(id)}/beta`)
      if (keep) {
        await expect(f.locator('[data-tile-id="tb"] [data-frame-mark="computing"]')).toBeVisible()
        expect(await tileText(f)).toBe('alpha-data')
      }
      else {
        await expect(f.locator('[data-tile-id="tb"] [data-frame-panel="computing"]')).toBeVisible()
        expect(await tileText(f)).toBeNull()
      }
      await expect.poll(() => tileText(f), { timeout: 15_000 }).toBe('beta-data')

      // A failed read with old data on screen.
      await openInShell(page, `${routeOf(id)}/gamma`)
      if (keep) {
        await expect(f.locator('[data-tile-id="tb"] [data-frame-mark="error"]')).toBeVisible()
        await expect.poll(() => tileAttr(f, 'data-fx-mark')).toBe('error')
        expect(await tileText(f)).toBe('beta-data')
      }
      else {
        await expect(f.locator('[data-tile-id="tb"] [data-frame-panel="error"]')).toBeVisible()
        expect(await tileText(f)).toBeNull()
      }

      // denied always removes the data, with keep too.
      await openInShell(page, `${routeOf(id)}/delta`)
      await expect(f.locator('[data-tile-id="tb"] [data-frame-panel="denied"]')).toBeVisible()
      await expect.poll(() => tileAttr(f, 'data-fx-panel')).toBe('denied')
      expect(await tileText(f)).toBeNull()
    }
  })

  test('without old data computing and error show a panel even under keep; a page that sets one state keeps the default of the others', async ({ page }) => {
    await publish(page, statesPage('fx_one', { computing: 'replace' }))
    try {
      await answerStates(page, 'fx_keep', {
        special: {
          alpha: point => envelope(point, 'computing', { operation: 'tok', retry_after_ms: 60_000 }),
        },
      })
      await openInShell(page, '/fx/fx-keep/alpha')
      const f = pageFrame(page, 'fx_keep')
      await expect(f.locator('[data-tile-id="tb"] [data-frame-panel="computing"]')).toBeVisible({ timeout: 20_000 })
      await expect.poll(() => tileAttr(f, 'data-fx-panel')).toBe('computing')
      await expect(f.locator('[data-tile-id="tb"] [data-frame-mark]')).toHaveCount(0)

      // fx_one sets only computing: refreshing stays keep.
      const hold = gate()
      await answerStates(page, 'fx_one', { held: { beta: hold.opened } })
      await openInShell(page, '/fx/fx-one/alpha')
      const g = pageFrame(page, 'fx_one')
      await expect.poll(() => tileText(g), { timeout: 20_000 }).toBe('alpha-data')
      await openInShell(page, '/fx/fx-one/beta')
      await expect(g.locator('[data-tile-id="tb"] [data-frame-mark="refreshing"]')).toBeVisible()
      hold.open()
    }
    finally {
      await remove(page, 'fx_one')
    }
  })

  test('an optional input that fails leaves the tile ready, with completeness partial and the input in missing_inputs', async ({ page }) => {
    await publish(page, {
      id: 'fx_optional',
      title: 'Fixture optional input',
      route: '/fx/fx-optional',
      data: { r: POINT('echo', { limit: 5 }), f: POINT('echo', { limit: 5 }) },
      actions: {},
      tiles: { ds: { type: 'fixture.states', data: { main: 'r', extra: 'f' }, fields: { text: 'text' } } },
      rows: [['ds']],
    })
    try {
      await answerReads(page, 'fx_optional', {
        r: ready('r', { text: 'main value' }),
        f: envelope('f', 'failed', { error: { code: 'source_error', message: 'The data could not be read.' } }),
      })
      await openInShell(page, '/fx/fx-optional')
      const f = pageFrame(page, 'fx_optional')
      await expect.poll(() => tileText(f), { timeout: 20_000 }).toBe('main value')
      await expect(f.locator('[data-tile-id="ds"]')).toHaveAttribute('data-frame-status', 'ready')
      await expect.poll(async () => (await fixtureLog(f, 'ds')).states.at(-1)).toMatchObject({
        status: 'ready',
        completeness: 'partial',
        missing_inputs: ['extra'],
      })
      // The board's footer says which input is missing.
      await expect(f.locator('[data-tile-id="ds"] [data-frame-footer]')).toContainText('extra')
    }
    finally {
      await remove(page, 'fx_optional')
    }
  })

  test('an expired token starts exactly one fresh read; a timeout error shows as an error', async ({ page }) => {
    // The first read without a token answers computing; the fresh read that follows the expired token answers ready.
    let plainReads = 0
    const calls = await answerReads(page, 'fx_keep', {
      s: (_route, url) => (url.searchParams.get('operation')
        ? envelope('s', 'failed', { error: { code: 'expired', message: 'Gone.' } })
        : ++plainReads === 1
          ? envelope('s', 'computing', { operation: 'tok', retry_after_ms: 1000 })
          : ready('s', seriesFor('fresh'))),
      r: ready('r', { text: 'x' }),
    })
    await openInShell(page, '/fx/fx-keep/alpha')
    await expect.poll(() => calls.filter(c => c.point === 's').length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    await page.waitForTimeout(3000)
    const reads = calls.filter(c => c.point === 's')
    // One read, one follow-up with the token (it expired), and then no more than one fresh read without the token.
    expect(reads.filter(c => c.operation !== null)).toHaveLength(1)
    expect(reads.filter(c => c.operation === null).length).toBeLessThanOrEqual(2)
  })
})

test.describe('RC1-05: more states', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
  })

  test('a page that sets one state inherits the non-default value of the claim for another and the default for the third', async ({ page }) => {
    // The claim of fixture.states_replace says computing is replace. The page sets only refreshing: keep.
    await publish(page, {
      id: 'fx_claim',
      title: 'Fixture claim preference',
      route: '/fx/fx-claim',
      params: { q: { type: 'string', label: 'Q', from_path: 0, default: 'alpha' } },
      data: { r: POINT('echo', { model: param('q'), limit: 5 }) },
      actions: {},
      tiles: { ds: { type: 'fixture.states_replace', data: { main: 'r' }, fields: { text: 'text' }, state_display: { refreshing: 'keep' } } },
      rows: [['ds']],
    })
    try {
      const hold = gate()
      await answerReads(page, 'fx_claim', {
        r: async (_route, url) => {
          const model = modelOf(url)
          if (model === 'beta')
            await hold.opened
          if (model === 'gamma')
            return envelope('r', 'computing', { operation: 'tok', retry_after_ms: 60_000, stale: true, data: { text: 'beta-data' } })
          if (model === 'delta')
            return envelope('r', 'failed', { error: { code: 'source_error', message: 'The data could not be read.' } })
          return ready('r', { text: `${model}-data` })
        },
      })
      await openInShell(page, '/fx/fx-claim/alpha')
      const f = pageFrame(page, 'fx_claim')
      await expect.poll(() => tileText(f), { timeout: 20_000 }).toBe('alpha-data')
      // refreshing: set by the page to keep -> a mark and the data.
      await openInShell(page, '/fx/fx-claim/beta')
      await expect.poll(() => tileAttr(f, 'data-fx-mark')).toBe('refreshing')
      expect(await tileText(f)).toBe('alpha-data')
      hold.open()
      await expect.poll(() => tileText(f)).toBe('beta-data')
      // error: set by neither -> the default keep -> a mark and the data.
      await openInShell(page, '/fx/fx-claim/delta')
      await expect.poll(() => tileAttr(f, 'data-fx-mark')).toBe('error')
      expect(await tileText(f)).toBe('beta-data')
      // computing: not set by the page -> the claim's replace -> a panel in place of the data.
      await openInShell(page, '/fx/fx-claim/gamma')
      await expect.poll(() => tileAttr(f, 'data-fx-panel')).toBe('computing')
      expect(await tileText(f)).toBeNull()
    }
    finally {
      await remove(page, 'fx_claim')
    }
  })

  test('an optional input that is computing or empty leaves the tile ready, with no partial mark', async ({ page }) => {
    await publish(page, {
      id: 'fx_optional2',
      title: 'Fixture optional input 2',
      route: '/fx/fx-optional2',
      data: { r: POINT('echo', { limit: 5 }), f: POINT('echo', { limit: 5 }) },
      actions: {},
      tiles: { ds: { type: 'fixture.states', data: { main: 'r', extra: 'f' }, fields: { text: 'text' } } },
      rows: [['ds']],
    })
    try {
      let first = true
      for (const extra of [
        envelope('f', 'computing', { operation: 'tok', retry_after_ms: 60_000 }),
        envelope('f', 'empty'),
      ]) {
        await page.unroute('**/api/v1/dashboards/pages/fx_optional2/points/**')
        await answerReads(page, 'fx_optional2', { r: ready('r', { text: 'main value' }), f: extra })
        // The first pass opens the page; the second reloads it, which clears the state log of the tile.
        if (first)
          await openInShell(page, '/fx/fx-optional2')
        else
          await refreshShell(page)
        first = false
        const f = pageFrame(page, 'fx_optional2')
        await expect.poll(() => tileText(f), { timeout: 20_000 }).toBe('main value')
        await expect(f.locator('[data-tile-id="ds"]')).toHaveAttribute('data-frame-status', 'ready')
        await page.waitForTimeout(500)
        const last = (await fixtureLog(f, 'ds')).states.at(-1)
        expect(last).toMatchObject({ status: 'ready' })
        // Nothing is missing, so the tile is complete: never partial.
        expect(last?.completeness).not.toBe('partial')
        expect(last?.missing_inputs ?? []).toEqual([])
      }
    }
    finally {
      await remove(page, 'fx_optional2')
    }
  })
})

test.describe('RC1-02: the exact reads of a dropdown and of a direct link', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, {
      id: 'fx_reads',
      title: 'Fixture reads',
      route: '/fx/fx-reads',
      params: { m: { type: 'select', label: 'Model', from_path: 0, options: { data: 'o' } } },
      data: {
        o: POINT('options'),
        sm: POINT('series', { model: param('m') }),
        sp: POINT('series'),
        n: POINT('numbers'),
      },
      actions: {},
      // tb reads sm, which is bound to m. t2, the kpi and the picker read nothing that depends on m.
      tiles: {
        sel: { type: 'control.select', param: 'm' },
        tb: { type: 'table', data: { main: 'sm' } },
        t2: { type: 'table', data: { main: 'sp' } },
        kp: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
        note: { type: 'fixture.size' },
      },
      rows: [['sel', 'kp'], ['tb', 't2'], ['note']],
    })
  })

  test.afterEach(async ({ page }) => {
    await remove(page, 'fx_reads')
  })

  const answers = {
    o: ready('o', frame([{ name: 'value', type: 'string' }, { name: 'label', type: 'string' }], [['one', 'One'], ['two', 'Two']])),
    sm: ready('sm', seriesFor('x')),
    sp: ready('sp', seriesFor('y')),
    n: ready('n', frame([{ name: 'value', type: 'number', role: 'measure' }], [[1]])),
  }
  const count = (calls: Array<{ point: string }>) => {
    const out: Record<string, number> = {}
    for (const c of calls)
      out[c.point] = (out[c.point] ?? 0) + 1
    return out
  }

  test('a filter change re-reads exactly the input bound to it, once', async ({ page }) => {
    const calls = await answerReads(page, 'fx_reads', answers)
    await openInShell(page, '/fx/fx-reads')
    const f = pageFrame(page, 'fx_reads')
    for (const id of ['tb', 'kp', 'sel', 't2'])
      await expect(f.locator(`[data-tile-id="${id}"]`)).toHaveAttribute('data-frame-status', 'ready', { timeout: 20_000 })
    expect(count(calls), 'the first load reads each input once').toEqual({ o: 1, sm: 1, sp: 1, n: 1 })

    const before = calls.length
    await f.locator('[data-tile-id="sel"] [role="combobox"]').click()
    await f.getByRole('option', { name: 'Two' }).click()
    await expect.poll(() => calls.length, { timeout: 10_000 }).toBeGreaterThan(before)
    await page.waitForTimeout(1500)
    // Only the input whose argument uses the parameter reads again, once. The picker, the kpi and the other table read nothing.
    expect(count(calls.slice(before))).toEqual({ sm: 1 })
  })

  test('a direct link with an argument applies it on the first load, and each input reads once', async ({ page }) => {
    const calls = await answerReads(page, 'fx_reads', answers)
    await openInShell(page, '/fx/fx-reads/two')
    const f = pageFrame(page, 'fx_reads')
    await expect(f.locator('[data-tile-id="tb"]')).toHaveAttribute('data-frame-status', 'ready', { timeout: 20_000 })
    await page.waitForTimeout(1500)
    expect(count(calls)).toEqual({ o: 1, sm: 1, sp: 1, n: 1 })
    expect(JSON.parse(calls.find(c => c.point === 'sm')?.args ?? '{}')).toEqual({ model: 'two' })
  })
})

test.describe('RC1-13: empty cells, decimals and timestamps', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, {
      id: 'fx_values',
      title: 'Fixture values',
      route: '/fx/values',
      params: { m: { type: 'select', label: 'Model', options: { data: 'o' } } },
      data: { n: POINT('numbers'), s: POINT('series'), r: POINT('echo', { limit: 5 }), c: POINT('series'), o: POINT('options'), t: POINT('series') },
      actions: {},
      tiles: {
        kp: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
        tb: { type: 'table', data: { main: 's' } },
        tx: { type: 'text', data: { main: 'r' }, fields: { text: 'text' } },
        ch: { type: 'chart', data: { main: 'c' }, fields: { x: 'day', y: ['tokens'] } },
        sl: { type: 'control.select', param: 'm' },
        tv: { type: 'table', data: { main: 't' } },
      },
      rows: [['kp', 'tx'], ['tb'], ['ch', 'sl'], ['tv']],
    })
  })

  test.afterEach(async ({ page }) => {
    await remove(page, 'fx_values')
  })

  test('an empty cell shows as missing in a kpi, a table and a text, never as 0 or an empty text', async ({ page }) => {
    await answerReads(page, 'fx_values', {
      n: ready('n', frame([{ name: 'value', type: 'number', role: 'measure' }], [[null]])),
      s: ready('s', frame([
        { name: 'name', type: 'string' },
        { name: 'count', type: 'number', role: 'measure' },
        { name: 'exact', type: 'decimal', role: 'measure' },
        { name: 'at', type: 'time' },
      ], [
        ['a', null, '12345678901234567890', '2026-11-19T12:00:00+01:00'],
        [null, 5, '-0.10', '2026-11-19T12:00:00-05:30'],
      ])),
      r: ready('r', {}),
      // A chart: an empty x and an empty y. A select: an empty label and an empty value.
      c: ready('c', frame([{ name: 'day', type: 'string' }, { name: 'tokens', type: 'number', role: 'measure' }], [['a', 1], [null, 2], ['c', null]])),
      o: ready('o', frame([{ name: 'value', type: 'string' }, { name: 'label', type: 'string' }], [['a', null], [null, 'Nothing'], ['c', 'C']])),
      // Every nullable type: string, number, decimal, date, time and boolean. Row 1 has all of them empty.
      t: ready('t', frame([
        { name: 's', type: 'string' },
        { name: 'n', type: 'number', role: 'measure' },
        { name: 'd', type: 'decimal', role: 'measure' },
        { name: 'dt', type: 'date' },
        { name: 'tm', type: 'time' },
        { name: 'b', type: 'boolean' },
      ], [
        [null, null, null, null, null, null],
        ['x', 0, '0', '2026-11-19', '2026-11-19T00:00:00Z', false],
      ])),
    })
    await openInShell(page, '/fx/values')
    const f = pageFrame(page, 'fx_values')
    await expect(f.locator('[data-tile-id="kp"] [data-missing]')).toHaveText('No value', { timeout: 20_000 })
    await expect(f.locator('[data-tile-id="kp"]')).not.toContainText(/^0$/)
    await expect(f.locator('[data-tile-id="tx"] [data-missing]')).toHaveText('No value')

    const cells = await f.locator('[data-tile-id="tb"] tbody tr').evaluateAll(rows => rows.map(r => Array.from(r.querySelectorAll('td')).map(td => ({
      missing: td.hasAttribute('data-missing'),
      text: (td.textContent ?? '').trim(),
    }))))
    // Row 1: the empty count is missing. Row 2: the empty name is missing.
    expect(cells[0][1].missing).toBe(true)
    expect(cells[0][1].text).toBe('No value')
    expect(cells[1][0].missing).toBe(true)
    // Decimals and timestamps show their exact value.
    expect(cells[0][2].text.replace(/[,.\s  ]/g, '')).toBe('12345678901234567890')
    expect(cells[1][2].text).toMatch(/^-0[.,]10$/)
    expect(cells[0][3].text).toBe('2026-11-19T12:00:00+01:00')
    expect(cells[1][3].text).toBe('2026-11-19T12:00:00-05:30')

    // Every nullable type: all six cells of row 1 are missing and say so; row 2 shows 0, "0" and false as values.
    const typed = await f.locator('[data-tile-id="tv"] tbody tr').evaluateAll(rows => rows.map(r => Array.from(r.querySelectorAll('td')).map(td => ({
      missing: td.hasAttribute('data-missing'),
      text: (td.textContent ?? '').trim(),
    }))))
    expect(typed[0].map(c => c.missing)).toEqual([true, true, true, true, true, true])
    expect(typed[0].map(c => c.text)).toEqual(Array(6).fill('No value'))
    expect(typed[1].map(c => c.missing)).toEqual([false, false, false, false, false, false])
    expect(typed[1].map(c => c.text)).toEqual(['x', '0', '0', '2026-11-19', '2026-11-19T00:00:00Z', 'false'])

    // A chart: the empty x has the label No value, and the empty y is a gap (a missing value in the text alternative), never 0.
    const chartRows = await f.locator('[data-tile-id="ch"] table tbody tr').evaluateAll(rows => rows.map(r => Array.from(r.children).map(c => (c.textContent ?? '').trim()).join(' ')))
    expect(chartRows).toEqual(['a 1', 'No value 2', 'c No value'])
    const plotted = JSON.parse(await f.locator('[data-tile-id="ch"] wippy-chartjs').getAttribute('data') ?? '{}')
    expect(plotted.datasets[0].data).toEqual([1, 2, null])
    expect(plotted.labels).toEqual(['a', 'No value', 'c'])

    // A select: a row with an empty label shows its value, a row with an empty value is left out.
    await f.locator('[data-tile-id="sl"] [role="combobox"]').click()
    const options = await f.getByRole('option').allTextContents()
    expect(options.map(o => o.trim())).toEqual(['All', 'a', 'C'])
  })
})

test.describe('RC1-06: the page says why it cannot show', () => {
  test('access denied for a 403 and not available for a 404', async ({ page }) => {
    // The page answers 403 and then 404 on purpose.
    expectFailures(page, { status: 403, path: '/dashboards/pages/fx_page_state/props' }, { status: 404, path: '/dashboards/pages/fx_page_state/props' })
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, { id: 'fx_page_state', title: 'Fixture page state', route: '/fx/page-state', data: {}, actions: {}, tiles: { sz: { type: 'fixture.size' } }, rows: [['sz']] })
    try {
      let status = 403
      await page.route('**/api/v1/dashboards/pages/fx_page_state/props', route => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: status === 403 ? 'denied' : 'not_found', message: 'x' } }),
      }))
      await openInShell(page, '/fx/page-state')
      const f = pageFrame(page, 'fx_page_state')
      await expect(f.locator('[data-page-state="denied"]')).toContainText('Access denied', { timeout: 20_000 })
      await expect(f.locator('[data-page-state="denied"]')).not.toContainText('not available')
      status = 404
      await refreshShell(page)
      await expect(f.locator('[data-page-state="unavailable"]')).toContainText('not available', { timeout: 20_000 })
    }
    finally {
      await page.unroute('**/api/v1/dashboards/pages/fx_page_state/props')
      await remove(page, 'fx_page_state')
    }
  })

  test('a viewer who may not view a page gets 403 from the real endpoint, and the Host mounts no frame for it', async ({ browser }) => {
    test.setTimeout(90_000)
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    expectFailures(viewer, { status: 403, path: '/dashboards/pages/deny_check/props' }, { status: 401, path: '/api/public/pages/content/wippy.dashboards.pages:deny_check' })
    // The fixture policy of app.dashboards_fixtures denies the page deny_check to regular users.
    await publish(admin, { id: 'deny_check', title: 'Deny check', route: '/fx/deny-check', data: {}, actions: {}, tiles: { sz: { type: 'fixture.size' } }, rows: [['sz']] })
    try {
      const props = await api(viewer, 'GET', '/api/v1/dashboards/pages/deny_check/props')
      expect(props.status).toBe(403)
      await refreshShell(viewer)
      await openInShell(viewer, '/fx/deny-check')
      // The page's own "Access denied" text needs a frame; the Host refuses before it builds one (see expectHostRefusesPage).
      await viewer.waitForTimeout(3000)
      await expectHostRefusesPage(viewer, 'deny_check')
    }
    finally {
      await remove(admin, 'deny_check')
    }
  })
})

test.describe('RC1-15: a tile that no installed claim can show', () => {
  test('shows an incompatibility error and mounts nothing', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, { id: 'fx_incompat', title: 'Fixture incompatible', route: '/fx/incompat', data: {}, actions: {}, tiles: { sz: { type: 'fixture.size' }, ok: { type: 'fixture.size' } }, rows: [['sz', 'ok']] })
    try {
      // Props as the engine answers them when the stored major version of `sz` has no installed tag.
      await page.route('**/api/v1/dashboards/pages/fx_incompat/props', async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        body.tiles.sz = { ...body.tiles.sz, tile: 'fixture.size', tile_major: 2, incompatible: { reason: 'fixture.size version 2 is not installed.' } }
        await route.fulfill({ response, json: body })
      })
      await openInShell(page, '/fx/incompat')
      const f = pageFrame(page, 'fx_incompat')
      await expect(f.locator('[data-tile-id="sz"] [data-frame-panel="incompatible"]')).toContainText('version 2', { timeout: 20_000 })
      await expect(f.locator('[data-tile-id="sz"] fx-size')).toHaveCount(0)
      // The other tile of the page is not affected.
      await expect(f.locator('[data-tile-id="ok"] fx-size')).toHaveCount(1)
    }
    finally {
      await page.unroute('**/api/v1/dashboards/pages/fx_incompat/props')
      await remove(page, 'fx_incompat')
    }
  })
})

test.describe('RC1-14: the request lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, statesPage('fx_life'))
  })

  test.afterEach(async ({ page }) => {
    await remove(page, 'fx_life')
  })

  test('new attributes and a newer request: a superseded result never shows, and each read ends with one outcome', async ({ page }) => {
    const holdBeta = gate()
    const holdGamma = gate()
    await answerStates(page, 'fx_life', { held: { beta: holdBeta.opened, gamma: holdGamma.opened } })
    await openInShell(page, '/fx/fx-life/alpha')
    const f = pageFrame(page, 'fx_life')
    await expect.poll(() => tileText(f), { timeout: 20_000 }).toBe('alpha-data')

    // Two new argument values one after the other: beta is superseded by gamma while its read is in flight.
    await openInShell(page, '/fx/fx-life/beta')
    await expect(f.locator('[data-tile-id="tb"] [data-frame-mark="refreshing"]')).toBeVisible()
    await openInShell(page, '/fx/fx-life/gamma')
    // gamma answers first, beta (the superseded request) answers after it.
    holdGamma.open()
    await expect.poll(() => tileText(f)).toBe('gamma-data')
    holdBeta.open()
    await page.waitForTimeout(1000)
    expect(await tileText(f)).toBe('gamma-data')

    const log = await fixtureLog(f, 'ds')
    // The result of beta never reached the screen.
    expect(log.drawn.some(line => line.includes('beta-data'))).toBe(false)
    // Every read of the tile has exactly one outcome, and none of them is shown twice.
    // The id of a read is unique in the tile, so each read has exactly one outcome.
    const ids = log.reads.map(r => r.seq)
    expect(new Set(ids).size).toBe(ids.length)
    expect(log.reads.length).toBeGreaterThanOrEqual(3)
    expect(log.reads.filter(r => r.outcome === 'applied').length).toBeGreaterThanOrEqual(2)
    expect(log.reads.some(r => r.outcome === 'cancelled' || r.outcome === 'superseded')).toBe(true)

    // The browser aborted the request of the superseded read. That is expected here, and only here.
    const rest = (await takeUnexpected()).filter(line => !/points\/.*ERR_ABORTED/.test(line))
    expect(rest).toEqual([])
  })

  test('a disconnection ends the request in flight: the read is cancelled and its late result never shows', async ({ page }) => {
    const hold = gate()
    await answerStates(page, 'fx_life', { held: { beta: hold.opened } })
    await openInShell(page, '/fx/fx-life/alpha')
    const f = pageFrame(page, 'fx_life')
    await expect.poll(() => tileText(f), { timeout: 20_000 }).toBe('alpha-data')
    await openInShell(page, '/fx/fx-life/beta')
    await expect(f.locator('[data-tile-id="tb"] [data-frame-mark="refreshing"]')).toBeVisible()
    // The tile element leaves the page while its read is in flight.
    await f.locator('[data-tile-id="ds"] .frame__tile > *').evaluate(el => el.remove())
    hold.open()
    await page.waitForTimeout(1000)
    const log = await fixtureLog(f, 'ds')
    expect(log.reads.at(-1)?.outcome).toBe('cancelled')
    expect(log.drawn.some(line => line.includes('beta-data'))).toBe(false)
    const rest = (await takeUnexpected()).filter(line => !/points\/.*ERR_ABORTED/.test(line))
    expect(rest).toEqual([])
  })

  test('a passed deadline ends the request: the frame shows no response', async ({ page }) => {
    test.setTimeout(60_000)
    const never = gate()
    await answerStates(page, 'fx_life', { held: { alpha: never.opened } })
    await openInShell(page, '/fx/fx-life/alpha')
    const f = pageFrame(page, 'fx_life')
    await expect(f.locator('[data-tile-id="tb"]')).toHaveAttribute('data-frame-status', 'timeout', { timeout: 30_000 })
    await expect(f.locator('[data-tile-id="tb"] [data-frame-panel="timeout"]')).toContainText('No response')
    never.open()
  })
})

/**
 * RC2-06: a point with a source and a mapper, and an open point, follow the slow-result rules through the whole
 * read path. The fixture source (app.dashboards_fixtures:slow_rows_fn) takes 5 seconds. The reads here are real
 * (nothing is answered by the test): the tile shows `computing`, then the mapped rows. The engine's own rules
 * (one run for the token, a new run without it, the timeout after 15 minutes) are proved by the Lua tests
 * test/src/reads/slow_mapped_test.lua of wippy/dashboards.
 */
const SLOW_SUM = { ref: 'mock.mappers:sum_by', params: { by: 'model_id', values: ['prompt_tokens', 'completion_tokens'] } }
const SLOW_OUTPUT = {
  shape: 'category',
  fields: [
    { name: 'model_id', type: 'string', role: 'dimension', nullable: false },
    { name: 'prompt_tokens', type: 'number', role: 'measure', additive: true, nullable: false },
    { name: 'completion_tokens', type: 'number', role: 'measure', additive: true, nullable: false },
  ],
}

/** A page with one table tile that reads a slow point: `slow_mapped` (a declared mapper) or `slow_open` (the page picks the mapper). */
function slowPage(id: string, open: boolean) {
  return {
    id,
    title: `Fixture slow ${id}`,
    route: routeOf(id),
    params: {},
    data: {
      rows: open
        ? { ...POINT('slow_open'), mapper: SLOW_SUM, output: SLOW_OUTPUT }
        : POINT('slow_mapped'),
    },
    actions: {},
    tiles: { tb: { type: 'table', data: { main: 'rows' } } },
    rows: [['tb']],
  }
}

test.describe('RC2-06: slow mapped and open points', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    await publish(page, slowPage('fx_slow_mapped', false))
    await publish(page, slowPage('fx_slow_open', true))
  })

  test.afterEach(async ({ page }) => {
    await remove(page, 'fx_slow_mapped')
    await remove(page, 'fx_slow_open')
  })

  /** The tile is computing first, and about 5 seconds later it shows the two mapped rows: a 40 and 20, b 20 and 10. */
  async function expectComputingThenRows(page: Page, id: string) {
    await openInShell(page, routeOf(id))
    const tile = pageFrame(page, id).locator('[data-tile-id="tb"]')
    await expect(tile).toHaveAttribute('data-frame-status', 'computing', { timeout: 20_000 })
    await expect(tile).toHaveAttribute('data-frame-status', 'ready', { timeout: 30_000 })
    await expect(tile.locator('tbody tr')).toHaveCount(2)
    const rows = tile.locator('tbody tr')
    await expect(rows.nth(0)).toContainText('a')
    await expect(rows.nth(0)).toContainText('40')
    await expect(rows.nth(0)).toContainText('20')
    await expect(rows.nth(1)).toContainText('b')
    await expect(rows.nth(1)).toContainText('10')
  }

  test('a slow mapped point shows computing, then its rows', async ({ page }) => {
    test.setTimeout(90_000)
    await expectComputingThenRows(page, 'fx_slow_mapped')
  })

  test('a slow open point shows computing, then its rows', async ({ page }) => {
    test.setTimeout(90_000)
    await expectComputingThenRows(page, 'fx_slow_open')
  })
})
