import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, monitor, openInShell, takeUnexpected } from './helpers/page-watch'
import type { Row, Slot } from './dashboards-wp5.support'
import {
  WIDE,
  answerReads,
  box,
  expectedWidths,
  frame,
  pageFrame,
  pageIframe,
  publish,
  ready,
  remove,
} from './dashboards-wp5.support'

/**
 * RC1-07 browser tests (tile contract section 8.3): the board picks its layout from its own width, each
 * tile's rectangle matches the generated layout, `size-class` and the `@container tile` rule agree, a
 * resize sends no read and keeps the tile element and its state, every built-in tile renders at 320 px,
 * `width.max` holds, the frame and the footer have the same geometry in every tile, and tall content
 * scrolls inside its tile.
 *
 * NOT RUN by the builder (the coordinator runs browser tests at integration). It needs the fixture
 * components of src/dashboards_fixture_tiles (make build-wc-fixture-tiles) and the engine's `rows` input
 * (WP3). The reads of the pages are answered by the tests, so the values do not depend on the fixture points.
 */

const POINT = (ref: string, args: Record<string, unknown> = {}) => ({ kind: 'function', ref: `app.dashboards_fixtures:${ref}`, args })

/** Page with every built-in tile and the layout fixtures, written as rows of tile ids (tile contract section 5.7). */
const LAYOUT_PAGE = {
  id: 'fx_layout',
  title: 'Fixture layout',
  route: '/fx/layout',
  params: { m: { type: 'select', label: 'Model', options: { data: 'o' } } },
  data: { n: POINT('numbers'), s: POINT('series'), o: POINT('options'), r: POINT('echo', { limit: 5 }) },
  actions: {},
  tiles: {
    k1: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
    k2: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
    k3: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
    k4: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
    c1: { type: 'chart', data: { main: 's' }, fields: { x: 'day', y: ['tokens'] }, options: { label: 'Chart' } },
    tb: { type: 'table', data: { main: 's' } },
    sel: { type: 'control.select', param: 'm' },
    txt: { type: 'text', data: { main: 'r' }, fields: { text: 'text' } },
    art: { type: 'artifact', options: { tag: 'fx-api' } },
    // k5 and tx2 share a row: a kpi has width.max 480, so at 1440 px it stops at 480 + 14 and the text takes the rest.
    k5: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
    tx2: { type: 'text', data: { main: 'r' }, fields: { text: 'text' } },
  },
  rows: [['k1', 'k2', 'k3', 'k4'], ['c1', 'tb'], ['sel', 'txt'], ['art'], ['k5', 'tx2']],
}

/**
 * Page with tiles that have size classes, each alone on its row, so that they all get the same content width:
 * the size fixture (480 and 800), the same fixture with content taller than its place (a scrollbar must not change
 * its container width), a chart (480 and 800) and a table (640 and 1000).
 */
const SIZE_PAGE = {
  id: 'fx_size',
  title: 'Fixture size',
  route: '/fx/size',
  data: { n: POINT('numbers'), s: POINT('series') },
  actions: {},
  tiles: {
    kp: { type: 'kpi', data: { main: 'n' }, fields: { value: 'value' } },
    sz: { type: 'fixture.size' },
    tl: { type: 'fixture.size', options: { tall: true } },
    ch: { type: 'chart', data: { main: 's' }, fields: { x: 'day', y: ['tokens'] } },
    tbl: { type: 'table', data: { main: 's' } },
  },
  rows: [['kp'], ['sz'], ['tl'], ['ch'], ['tbl']],
}

const TALL_PAGE = {
  id: 'fx_tall',
  title: 'Fixture tall tile',
  route: '/fx/tall',
  data: {},
  actions: {},
  tiles: { tall: { type: 'fixture.size', options: { tall: true } }, other: { type: 'fixture.size' } },
  rows: [['tall', 'other']],
}

async function answerLayoutReads(page: Page) {
  return answerReads(page, LAYOUT_PAGE.id, {
    n: ready('n', frame([{ name: 'value', type: 'number', role: 'measure' }], [[42]])),
    s: ready('s', frame([{ name: 'day', type: 'string' }, { name: 'tokens', type: 'number', role: 'measure' }], [['a', 1], ['b', 2], ['c', null]])),
    o: ready('o', frame([{ name: 'value', type: 'string' }, { name: 'label', type: 'string' }], [['one', 'One'], ['two', 'Two']])),
    r: ready('r', { text: 'Hello from the record' }),
  })
}

/** Gives the board of a page exactly `target` px: the width of the canvas is what @wippy-fe/layout measures. */
async function setBoardWidth(page: Page, id: string, target: number): Promise<number> {
  const iframe = pageIframe(page, id)
  let width = target
  for (let i = 0; i < 4; i++) {
    await iframe.evaluate((el: HTMLElement, w) => {
      el.style.width = `${w}px`
    }, width)
    const canvas = await box(pageFrame(page, id), '[data-board-canvas]')
    if (canvas && canvas.w === target)
      return target
    width += canvas ? target - canvas.w : 0
  }
  return width
}

async function breakpoint(page: Page, id: string): Promise<string | null> {
  return pageFrame(page, id).locator('[data-board-canvas]').getAttribute('data-breakpoint')
}

/** The slot rectangles of one layout tree for a board `width` px wide (the vertical tree of tile contract section 5.7). */
function slotRects(tree: { direction: string, children: Array<Row | Slot> }, width: number) {
  const rects: Record<string, { x: number, y: number, w: number, h: number }> = {}
  let y = 0
  for (const child of tree.children) {
    const h = Number.parseFloat((child as Row).size ?? (child as Slot).size)
    if ('panel' in child) {
      rects[child.panel] = { x: 0, y, w: width, h }
    }
    else {
      const widths = expectedWidths(child as Row, width)
      let x = 0
      for (const slot of (child as Row).children) {
        rects[slot.panel] = { x, y, w: widths[slot.panel] ?? 0, h }
        x += widths[slot.panel] ?? 0
      }
    }
    y += h
  }
  return rects
}

test.beforeEach(async ({ page }) => {
  await monitor(page, 'page')
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

test.describe('RC1-07: layouts follow the container', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE)
    await loginAsAdmin(page)
    for (const spec of [LAYOUT_PAGE, SIZE_PAGE, TALL_PAGE])
      await publish(page, spec)
  })

  test.afterEach(async ({ page }) => {
    for (const spec of [LAYOUT_PAGE, SIZE_PAGE, TALL_PAGE])
      await remove(page, spec.id)
  })

  test('the board picks its layout from its own width, and each tile matches the generated layout', async ({ page }) => {
    await answerLayoutReads(page)
    await openInShell(page, LAYOUT_PAGE.route)
    const f = pageFrame(page, LAYOUT_PAGE.id)
    await expect(f.locator('[data-tile-id="k1"]')).toBeVisible({ timeout: 20_000 })
    const props = JSON.parse((await api(page, 'GET', `/api/v1/dashboards/pages/${LAYOUT_PAGE.id}/props`)).body)
    expect(props.frame).toEqual({ x: 14, y: 38 })
    expect(props.widths).toEqual({ default: 0, md: 640, lg: 1024, xl: 1440 })

    // 1 px below, at and 1 px above each board width. The window stays at 1920 px.
    const cases: Array<[number, string]> = [
      [639, 'default'], [640, 'md'], [641, 'md'],
      [1023, 'md'], [1024, 'lg'], [1025, 'lg'],
      [1439, 'lg'], [1440, 'xl'], [1441, 'xl'],
    ]
    for (const [width, expected] of cases) {
      expect(await setBoardWidth(page, LAYOUT_PAGE.id, width), `board width ${width}`).toBe(width)
      await expect.poll(() => breakpoint(page, LAYOUT_PAGE.id), { message: `layout at ${width}`, timeout: 5000 }).toBe(expected)
      const rects = slotRects(props.layout.layouts[expected], width)
      const canvas = await box(f, '[data-board-canvas]')
      for (const [id, slot] of Object.entries(rects)) {
        // The frame has a margin of 6 px on each side of its slot.
        const b = await box(f, `[data-tile-id="${id}"]`)
        expect(b, `${id} at ${width}`).not.toBeNull()
        expect(Math.abs((b?.x ?? 0) - (canvas?.x ?? 0) - (slot.x + 6)), `${id}.x at ${width}`).toBeLessThanOrEqual(2)
        expect(Math.abs((b?.w ?? 0) - (slot.w - 12)), `${id}.w at ${width}`).toBeLessThanOrEqual(2)
        expect(Math.abs((b?.h ?? 0) - (slot.h - 12)), `${id}.h at ${width}`).toBeLessThanOrEqual(2)
      }
    }
  })

  test('a 600 px board in a 1440 px window shows the default layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await answerLayoutReads(page)
    await openInShell(page, LAYOUT_PAGE.route)
    const f = pageFrame(page, LAYOUT_PAGE.id)
    await expect(f.locator('[data-tile-id="k1"]')).toBeVisible({ timeout: 20_000 })
    await setBoardWidth(page, LAYOUT_PAGE.id, 600)
    await expect.poll(() => breakpoint(page, LAYOUT_PAGE.id)).toBe('default')
    const a = await box(f, '[data-tile-id="k1"]')
    const b = await box(f, '[data-tile-id="k2"]')
    expect(b?.x).toBe(a?.x)
    expect(b?.y).toBeGreaterThan(a?.y ?? 0)
  })

  test('size-class and the @container tile rule agree at each threshold, for the fixture, the same fixture with tall content, a chart and a table; a resize sends no read and keeps the tile', async ({ page }) => {
    const reads = await answerReads(page, SIZE_PAGE.id, {
      n: ready('n', frame([{ name: 'value', type: 'number', role: 'measure' }], [[7]])),
      s: ready('s', frame([{ name: 'day', type: 'string' }, { name: 'tokens', type: 'number', role: 'measure' }], [['a', 1], ['b', 2]])),
    })
    await openInShell(page, SIZE_PAGE.route)
    const f = pageFrame(page, SIZE_PAGE.id)
    const tile = (id: string) => f.locator(`[data-tile-id="${id}"] .frame__tile > *`)
    // The size classes of each tile (tile contract section 5.3), and the tag of its element.
    const tiles: Record<string, { medium: number, expanded: number }> = {
      sz: { medium: 480, expanded: 800 },
      tl: { medium: 480, expanded: 800 },
      ch: { medium: 480, expanded: 800 },
      tbl: { medium: 640, expanded: 1000 },
    }
    for (const id of Object.keys(tiles))
      await expect(tile(id)).toBeVisible({ timeout: 20_000 })
    const inner = (id: string) => tile(id).evaluate(el => el.shadowRoot?.querySelector('[data-fx-instance]')?.getAttribute('data-fx-instance'))
    const instances = { sz: await inner('sz'), tl: await inner('tl') }
    const requestIds = Object.fromEntries(await Promise.all(Object.keys(tiles).map(async id => [id, await tile(id).getAttribute('request-id')])))
    const readsBefore = reads.length

    /** The tile element's own content width, which the board measures and the container rule sees. */
    const width = (id: string) => tile(id).evaluate(el => (el as HTMLElement).clientWidth)
    const expectedClass = (w: number, t: { medium: number, expanded: number }) => (w >= t.expanded ? 'expanded' : w >= t.medium ? 'medium' : 'compact')
    const targets = [479, 480, 481, 639, 640, 641, 799, 800, 801, 999, 1000, 1001]
    for (const target of targets) {
      // A tile alone on its row fills the board less the frame (14 px): ask for that board width, then correct.
      let board = target + 14
      for (let i = 0; i < 4 && (await width('sz')) !== target; i++) {
        await setBoardWidth(page, SIZE_PAGE.id, board)
        board += target - (await width('sz'))
      }
      expect(await width('sz'), `tile width for ${target}`).toBe(target)
      for (const [id, thresholds] of Object.entries(tiles)) {
        // The tile with tall content has a scrollbar inside. It must not change the width that the container sees.
        const w = await width(id)
        await expect.poll(() => tile(id).getAttribute('size-class'), { message: `size-class of ${id} at ${w}` }).toBe(expectedClass(w, thresholds))
        if (id === 'sz' || id === 'tl') {
          await expect.poll(() => tile(id).evaluate(el => el.shadowRoot?.querySelector('[data-fx-instance]')?.getAttribute('data-fx-css')), { message: `container rule of ${id} at ${w}` }).toBe(expectedClass(w, thresholds))
          const container = await tile(id).evaluate(el => el.shadowRoot?.querySelector<HTMLElement>('[data-tile-root]')?.clientWidth)
          expect(container, `the container of ${id} is as wide as the tile element`).toBe(w)
        }
      }
    }
    // Resizing changed the width many times. It sent no read, kept the elements, their request-ids and their state.
    expect(reads.length).toBe(readsBefore)
    for (const id of Object.keys(tiles))
      expect(await tile(id).getAttribute('request-id')).toBe(requestIds[id])
    expect({ sz: await inner('sz'), tl: await inner('tl') }).toEqual(instances)
  })

  test('every built-in tile renders at 320 px and the frame stays inside the board', async ({ page }) => {
    await answerLayoutReads(page)
    await openInShell(page, LAYOUT_PAGE.route)
    const f = pageFrame(page, LAYOUT_PAGE.id)
    await expect(f.locator('[data-tile-id="k1"]')).toBeVisible({ timeout: 20_000 })
    await setBoardWidth(page, LAYOUT_PAGE.id, 320)
    const canvas = await box(f, '[data-board-canvas]')
    for (const id of ['k1', 'c1', 'tb', 'sel', 'txt', 'art']) {
      await expect(f.locator(`[data-tile-id="${id}"]`), id).toHaveAttribute('data-frame-status', 'ready', { timeout: 20_000 })
      const b = await box(f, `[data-tile-id="${id}"]`)
      expect(b?.w, `${id} width`).toBeGreaterThan(0)
      expect(b?.h, `${id} height`).toBeGreaterThan(0)
      // The frame (with its margin) fits the board: no sideways overflow.
      expect((b?.x ?? 0) + (b?.w ?? 0) + 6, `${id} right edge`).toBeLessThanOrEqual((canvas?.x ?? 0) + (canvas?.w ?? 0) + 1)
      const content = await f.locator(`[data-tile-id="${id}"] .frame__tile > *`).evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height }
      })
      expect(content.w, `${id} content width`).toBeGreaterThan(0)
      expect(content.h, `${id} content height`).toBeGreaterThan(0)
    }
  })

  test('the frame geometry holds: a 12 px gap in a row, the same footer height with and without text, and width.max stops growth', async ({ page }) => {
    await answerLayoutReads(page)
    await openInShell(page, LAYOUT_PAGE.route)
    const f = pageFrame(page, LAYOUT_PAGE.id)
    await expect(f.locator('[data-tile-id="k1"]')).toBeVisible({ timeout: 20_000 })
    await setBoardWidth(page, LAYOUT_PAGE.id, 1440)
    await expect.poll(() => breakpoint(page, LAYOUT_PAGE.id)).toBe('xl')
    const k1 = await box(f, '[data-tile-id="k1"]')
    const k2 = await box(f, '[data-tile-id="k2"]')
    // The margins of two frames in a row make the 12 px gap.
    expect((k2?.x ?? 0) - ((k1?.x ?? 0) + (k1?.w ?? 0))).toBe(12)
    // kpi: width.max is 480 px of content, so a frame is at most 480 + 14 px wide at the largest board width.
    expect(k1?.w ?? 0).toBeLessThanOrEqual(480 + 14 - 12)
    // k5 shares a row with a text tile and reaches its width.max: it stops at 480 + 14 (its slot) less the margins of 12 px,
    // and the text tile takes the rest of the row.
    const k5 = await box(f, '[data-tile-id="k5"]')
    const tx2 = await box(f, '[data-tile-id="tx2"]')
    const canvas = await box(f, '[data-board-canvas]')
    expect(k5?.w, 'k5 stops at width.max').toBe(480 + 14 - 12)
    expect((tx2?.w ?? 0), 'the text tile is wider than the capped kpi').toBeGreaterThan((k5?.w ?? 0) * 1.5)
    expect(Math.abs(((tx2?.x ?? 0) + (tx2?.w ?? 0) + 6) - ((canvas?.x ?? 0) + (canvas?.w ?? 0))), 'the text tile reaches the end of the row').toBeLessThanOrEqual(2)
    // The footer is one line of the same height in every tile, with or without text.
    const heights = await f.locator('[data-frame-footer]').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().height)))
    expect(new Set(heights)).toEqual(new Set([24]))
    const texts = await f.locator('[data-frame-footer]').evaluateAll(els => els.map(el => (el.textContent ?? '').trim()))
    expect(texts.some(t => t === ''), 'a footer without text').toBe(true)
    expect(texts.some(t => t !== ''), 'a footer with text').toBe(true)
  })

  test('content taller than its place scrolls inside the tile, and the frame and row keep their heights', async ({ page }) => {
    await openInShell(page, TALL_PAGE.route)
    const f = pageFrame(page, TALL_PAGE.id)
    await expect(f.locator('[data-fx-tall]')).toBeVisible({ timeout: 20_000 })
    const tall = f.locator('[data-tile-id="tall"]')
    const other = f.locator('[data-tile-id="other"]')
    const heights = async () => [(await tall.boundingBox())?.height, (await other.boundingBox())?.height]
    const [hTall, hOther] = await heights()
    expect(hTall).toBe(hOther)
    // The scrolling child of the TileRoot holds the content; the container itself does not scroll (tile contract section 5.4).
    const scrolls = await f.locator('[data-tile-id="tall"] fx-size').evaluate((el) => {
      const r = el.shadowRoot?.querySelector<HTMLElement>('[data-tile-scroll]')
      return r ? { scroll: r.scrollHeight, client: r.clientHeight } : null
    })
    expect(scrolls?.scroll ?? 0).toBeGreaterThan(scrolls?.client ?? 0)
    expect(await heights()).toEqual([hTall, hOther])
  })

  test('a page taller than the screen scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 500 })
    await answerLayoutReads(page)
    await openInShell(page, LAYOUT_PAGE.route)
    const f = pageFrame(page, LAYOUT_PAGE.id)
    await expect(f.locator('[data-tile-id="k1"]')).toBeVisible({ timeout: 20_000 })
    const board = await f.locator('[data-board]').evaluate((el) => {
      el.scrollTop = el.scrollHeight
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop }
    })
    expect(board.scrollHeight).toBeGreaterThan(board.clientHeight)
    expect(board.scrollTop).toBeGreaterThan(0)
  })
})
