import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, loginAs, monitor, newPage, openInShell, takeUnexpected } from './helpers/page-watch'

/**
 * Real-time checks of wippy/dashboards RC1 (real-time contract, docs/contracts/live-v1.md,
 * section 10, and RC1-19). The demo module `demo.live` (src/demo_live) provides a stream point with
 * audience page (`queue_length`, pushed once a second by a backend loop with `live.push`), a stream
 * point with audience viewer (`my_load`, pushed to the caller by `POST /api/v1/demo/live/push-me`)
 * and four test endpoints.
 *
 * The suite publishes two pages before the first test and removes them afterwards:
 *  - `live_demo` (/live-demo): the kpi tile `q` on queue_length and the kpi tile `m` on my_load;
 *  - `live_demo_other` (/live-demo-other): only the kpi tile `m`, so its viewer has no subscription
 *    to queue_length.
 *
 * Every test watches the page's requests and the frames that the relay sends to the browser. The
 * messages of a subscription arrive on a topic `dash:sub:<random>`.
 */

const PAGE = 'live_demo'
const OTHER = 'live_demo_other'

const LAYOUT = {
  breakpoints: { lg: 1024 },
  layouts: {
    default: { direction: 'vertical', children: [{ panel: 'q', size: '160px' }, { panel: 'm', size: '160px' }] },
    lg: { direction: 'horizontal', children: [{ panel: 'q', size: '50%' }, { panel: 'm', size: '50%' }] },
  },
}

const LIVE_SPEC = {
  spec: 'wippy.dashboard_page/v1',
  id: PAGE,
  title: 'Live demo',
  route: '/live-demo',
  data: {
    queue: { kind: 'function', ref: 'demo.live:queue_length', args: { queue: 'mail' } },
    mine: { kind: 'function', ref: 'demo.live:my_load' },
  },
  tiles: {
    q: { type: 'kpi', data: { main: 'queue' }, fields: { value: 'value' } },
    m: { type: 'kpi', data: { main: 'mine' }, fields: { value: 'value' } },
  },
  layout: LAYOUT,
  publish: true,
}

const OTHER_SPEC = {
  spec: 'wippy.dashboard_page/v1',
  id: OTHER,
  title: 'Live demo, other page',
  route: '/live-demo-other',
  data: { mine: { kind: 'function', ref: 'demo.live:my_load' } },
  tiles: { m: { type: 'kpi', data: { main: 'mine' }, fields: { value: 'value' } } },
  layout: {
    breakpoints: {},
    layouts: { default: { direction: 'vertical', children: [{ panel: 'm', size: '160px' }] } },
  },
  publish: true,
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAsAdmin(page)
    for (const spec of [LIVE_SPEC, OTHER_SPEC]) {
      const published = await api(page, 'POST', '/api/v1/dashboards/pages', spec)
      expect(published.status, published.body).toBe(200)
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
    await api(page, 'POST', '/api/v1/demo/live/withdraw', { on: false })
    for (const id of [PAGE, OTHER]) {
      const removed = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
      expect([200, 404], removed.body).toContain(removed.status)
    }
  }
  finally {
    await context.close()
  }
})

test.afterEach(async () => {
  expect(await takeUnexpected()).toEqual([])
})

interface Frame {
  topic: string
  data: Record<string, unknown>
  at: number
}

/** What a page asked for and what the relay sent it, for one page of the suite. */
function watch(page: Page, pageId: string) {
  const w = {
    /** Plain reads, by point name. */
    reads: {} as Record<string, number>,
    posts: [] as string[],
    puts: [] as Array<{ url: string, at: number }>,
    deletes: [] as string[],
    /** Responses to renewals, with their status and the time they came. */
    renewals: [] as Array<{ status: number, at: number, point: string }>,
    frames: [] as Frame[],
  }
  const pattern = new RegExp(`/dashboards/pages/${pageId}/points/([a-z_]+)(/subscriptions(?:/([0-9a-f]+))?)?`)
  page.on('request', (r) => {
    const m = new URL(r.url()).pathname.match(pattern)
    if (!m)
      return
    if (!m[2]) {
      w.reads[m[1]] = (w.reads[m[1]] ?? 0) + 1
    }
    else if (r.method() === 'POST') {
      w.posts.push(m[1])
    }
    else if (r.method() === 'PUT') {
      w.puts.push({ url: r.url(), at: Date.now() })
    }
    else if (r.method() === 'DELETE') {
      w.deletes.push(r.url())
    }
  })
  page.on('response', (res) => {
    const m = new URL(res.url()).pathname.match(pattern)
    if (m && m[2] && res.request().method() === 'PUT')
      w.renewals.push({ status: res.status(), at: Date.now(), point: m[1] })
  })
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      try {
        const message = JSON.parse(String(frame.payload)) as { topic?: unknown, data?: Record<string, unknown> }
        if (typeof message.topic === 'string' && message.topic.startsWith('dash:sub:') && message.data)
          w.frames.push({ topic: message.topic, data: message.data, at: Date.now() })
      }
      catch {
        // not a JSON frame
      }
    })
  })
  return w
}

function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

/** The number that a kpi tile shows, or null when it shows none. */
async function kpiValue(f: FrameLocator, tile: string): Promise<string | null> {
  const el = f.locator(`[data-tile-id="${tile}"] .dash-kpi__value`)
  if (await el.count() === 0)
    return null
  return (await el.first().textContent())?.trim() ?? null
}

/** The digits of a shown number without its grouping separators (the tiles show 4,242): the value must still be exact, with no rounding. */
function digitsOf(text: string | null): string {
  return (text ?? '').replace(/[,    ]/g, '')
}

async function openLive(page: Page, id = PAGE, route = '/live-demo') {
  await openInShell(page, route)
  return pageFrame(page, id)
}

/** The value of the first number in a frame message of the stream. */
function rowValue(frame: Frame): number | null {
  const data = frame.data.data as { rows?: unknown[][] } | undefined
  const value = data?.rows?.[0]?.[0]
  return typeof value === 'number' ? value : null
}

test.describe('streams and signals', () => {
  test.beforeEach(async ({ page }) => {
    await monitor(page, 'page')
  })

  test('a stream tile changes without a read for each message, and every message body is as the contract says', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    const w = watch(page, PAGE)
    await loginAsAdmin(page)
    const f = await openLive(page)
    const q = f.locator('[data-tile-id="q"] .dash-kpi__value')
    await expect(q).toBeVisible({ timeout: 20_000 })

    const seen = new Set<string>()
    const start = Date.now()
    while (Date.now() - start < 8000) {
      const v = await kpiValue(f, 'q')
      if (v)
        seen.add(v)
      await page.waitForTimeout(250)
    }
    expect(seen.size, `values seen: ${[...seen].join(', ')}`).toBeGreaterThanOrEqual(3)
    // The first data came from the subscription itself: no plain read, one subscribe, no renewal yet.
    expect(w.reads.queue ?? 0).toBe(0)
    expect(w.posts.filter(p => p === 'queue')).toHaveLength(1)
    expect(w.puts).toHaveLength(0)

    // A check of each message body.
    const queueFrames = w.frames.filter(fr => rowValue(fr) !== null)
    expect(queueFrames.length).toBeGreaterThanOrEqual(5)
    const lastSeq = new Map<string, number>()
    for (const fr of w.frames) {
      expect(fr.data.v).toBe(1)
      expect(fr.data.kind).toBe('stream')
      expect(fr.data.mode).toBe('replace')
      expect(fr.data.sent_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      const data = fr.data.data as { schema?: string, fields?: unknown[], rows?: unknown[][] }
      expect(data.schema).toBe('wippy.dashboard_frame/v1')
      expect(Array.isArray(data.fields)).toBe(true)
      expect(typeof data.rows?.[0]?.[0]).toBe('number')
      const seq = fr.data.seq as number
      expect(Number.isInteger(seq) && seq >= 1).toBe(true)
      // within one subscription the numbers rise, one by one
      const before = lastSeq.get(fr.topic)
      if (before !== undefined)
        expect(seq).toBe(before + 1)
      lastSeq.set(fr.topic, seq)
    }
  })

  test('ten signals within 250 ms give one read, and a viewer of another page gets nothing', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    const aw = watch(admin, PAGE)
    const vw = watch(viewer, OTHER)
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    const af = await openLive(admin)
    await expect(af.locator('[data-tile-id="q"] .dash-kpi__value')).toBeVisible({ timeout: 20_000 })
    const vf = await openLive(viewer, OTHER, '/live-demo-other')
    await expect(vf.locator('[data-tile-id="m"] .dash-kpi__value')).toBeVisible({ timeout: 20_000 })
    await admin.waitForTimeout(1000)

    const before = aw.reads.queue ?? 0
    const sent = await admin.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('@wippy_token_info') || 'null')?.token
      const answers = await Promise.all(Array.from({ length: 10 }, () => fetch('/api/v1/demo/live/signal', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })))
      return answers.map(a => a.status)
    })
    expect(sent).toEqual(Array.from({ length: 10 }, () => 200))
    await admin.waitForTimeout(1500)
    expect((aw.reads.queue ?? 0) - before).toBe(1)
    // The viewer of the other page has no subscription to this point: it asked for nothing.
    expect(vw.reads.queue ?? 0).toBe(0)
    expect(vw.frames.filter(fr => fr.data.kind === 'signal')).toHaveLength(0)
    // The signal carried no data.
    for (const fr of aw.frames.filter(fr => fr.data.kind === 'signal'))
      expect(fr.data.data).toBeUndefined()
  })

  test('a push for one viewer reaches only that viewer', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    const aw = watch(admin, PAGE)
    const vw = watch(viewer, PAGE)
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    const af = await openLive(admin)
    const vf = await openLive(viewer)
    await expect(af.locator('[data-tile-id="m"] .dash-kpi__value')).toBeVisible({ timeout: 20_000 })
    await expect(vf.locator('[data-tile-id="m"] .dash-kpi__value')).toBeVisible({ timeout: 20_000 })

    // A push without a user is refused by the live library, so the endpoint pushes to the caller only.
    expectFailures(admin, { status: 400, path: '/demo/live/push-me' })
    const bad = await api(admin, 'POST', '/api/v1/demo/live/push-me', { value: 'x' })
    expect(bad.status).toBe(400)

    const first = await api(admin, 'POST', '/api/v1/demo/live/push-me', { value: 4242 })
    expect(first.status, first.body).toBe(200)
    await expect.poll(async () => digitsOf(await kpiValue(af, 'm')), { timeout: 10_000 }).toBe('4242')
    await viewer.waitForTimeout(2500)
    expect(digitsOf(await kpiValue(vf, 'm'))).not.toBe('4242')
    expect(vw.frames.filter(fr => rowValue(fr) === 4242)).toHaveLength(0)

    const second = await api(viewer, 'POST', '/api/v1/demo/live/push-me', { value: 5151 })
    expect(second.status, second.body).toBe(200)
    await expect.poll(async () => digitsOf(await kpiValue(vf, 'm')), { timeout: 10_000 }).toBe('5151')
    await admin.waitForTimeout(2500)
    expect(digitsOf(await kpiValue(af, 'm'))).toBe('4242')
    expect(aw.frames.filter(fr => rowValue(fr) === 5151)).toHaveLength(0)
  })

  test('a forged subscription id, or a real one sent by another viewer, gets 404 and changes nothing', async ({ browser }) => {
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    expectFailures(admin, { status: 404, path: '/subscriptions' })
    expectFailures(viewer, { status: 404, path: '/subscriptions' })

    const base = `/api/v1/dashboards/pages/${PAGE}/points/mine/subscriptions`
    const made = await api(admin, 'POST', base, { args: {} })
    expect(made.status, made.body).toBe(200)
    const sub = JSON.parse(made.body) as { subscription: string, topic: string, renew_ms: number, seq: number }
    expect(sub.subscription).toMatch(/^[0-9a-f]+$/)
    expect(sub.topic).toMatch(/^dash:sub:[0-9a-f]+$/)
    expect(sub.renew_ms).toBe(30000)
    expect(sub.seq).toBe(0)

    const foreign = await api(viewer, 'PUT', `${base}/${sub.subscription}`, { args: {} })
    expect(foreign.status).toBe(404)
    const forged = await api(admin, 'PUT', `${base}/${'0'.repeat(32)}`, { args: {} })
    expect(forged.status).toBe(404)
    const foreignEnd = await api(viewer, 'DELETE', `${base}/${sub.subscription}?args=%7B%7D`)
    expect(foreignEnd.status).toBe(404)

    // The owner's subscription is untouched, and ends on request.
    const renewed = await api(admin, 'PUT', `${base}/${sub.subscription}`, { args: {} })
    expect(renewed.status, renewed.body).toBe(200)
    expect((JSON.parse(renewed.body) as { subscription: string }).subscription).toBe(sub.subscription)
    const ended = await api(admin, 'DELETE', `${base}/${sub.subscription}?args=%7B%7D`)
    expect(ended.status).toBe(200)
    const again = await api(admin, 'PUT', `${base}/${sub.subscription}`, { args: {} })
    expect(again.status).toBe(404)
  })

  test('a viewer whose access is withdrawn is denied at the next renewal, loses the data and gets no message', async ({ browser }) => {
    test.setTimeout(180_000)
    const admin = await newPage(browser, 'admin')
    const viewer = await newPage(browser, 'viewer')
    const vw = watch(viewer, PAGE)
    await loginAsAdmin(admin)
    await loginAs(viewer, 'viewer@wippy.local')
    expectFailures(viewer, { status: 403, path: '/dashboards/pages/' })
    const vf = await openLive(viewer)
    const q = vf.locator('[data-tile-id="q"] .dash-kpi__value')
    await expect(q).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => vw.frames.length, { timeout: 15_000 }).toBeGreaterThan(2)

    try {
      const withdrawn = await api(admin, 'POST', '/api/v1/demo/live/withdraw', { on: true })
      expect(withdrawn.status, withdrawn.body).toBe(200)
      expect(JSON.parse(withdrawn.body)).toEqual({ withdrawn: true })
      // The policy change applies to the viewer's next read: a direct read is refused at once.
      const direct = await api(viewer, 'GET', `/api/v1/dashboards/pages/${PAGE}/points/queue?args=${encodeURIComponent('{"queue":"mail"}')}`)
      expect(direct.status, direct.body).toBe(403)
      // The tile renews every 30 seconds: the renewal is refused, the data goes, the denied state shows.
      await expect(q).toHaveCount(0, { timeout: 60_000 })
      await expect(vf.locator('[data-tile-id="q"]')).toContainText(/access denied/i)
      // The page has two live tiles that renew on their own clocks; the refusal that ends the queue tile's
      // subscription is the renewal of its own point, not the first refusal of either tile.
      const denied = vw.renewals.find(r => r.status === 403 && r.point === 'queue')
      expect(denied, 'the queue renewal was answered with 403').toBeDefined()
      // No message of the ended subscription reaches the viewer after the refusal.
      await viewer.waitForTimeout(3000)
      const topicBefore = new Set(vw.frames.filter(fr => fr.at <= denied!.at).map(fr => fr.topic))
      const late = vw.frames.filter(fr => fr.at > denied!.at + 500 && topicBefore.has(fr.topic))
      expect(late).toHaveLength(0)
    }
    finally {
      const restored = await api(admin, 'POST', '/api/v1/demo/live/withdraw', { on: false })
      expect(restored.status, restored.body).toBe(200)
      expect(JSON.parse(restored.body)).toEqual({ withdrawn: false })
    }
    // The right is back at the next read, and the tile subscribes again by itself after the usual wait.
    const again = await api(viewer, 'GET', `/api/v1/dashboards/pages/${PAGE}/points/queue?args=${encodeURIComponent('{"queue":"mail"}')}`)
    expect(again.status, again.body).toBe(200)
    await expect(q).toBeVisible({ timeout: 60_000 })
  })

  test('after the engine process restarts, the stream tile subscribes again within 60 seconds and shows new pushes', async ({ page }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 1400, height: 900 })
    const w = watch(page, PAGE)
    await loginAsAdmin(page)
    const f = await openLive(page)
    const q = f.locator('[data-tile-id="q"] .dash-kpi__value')
    await expect(q).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => w.frames.length, { timeout: 15_000 }).toBeGreaterThan(2)
    // The renewal after the restart finds no subscription: 404 is the answer that makes the tile subscribe again.
    expectFailures(page, { status: 404, path: '/subscriptions/' })
    const subscribes = w.posts.filter(p => p === 'queue').length
    expect(subscribes).toBe(1)

    const restarted = await api(page, 'POST', '/api/v1/demo/live/restart-service', {})
    expect(restarted.status, restarted.body).toBe(200)
    const framesAtRestart = w.frames.length

    // The next renewal finds no subscription (404) and the tile subscribes again.
    await expect.poll(() => w.posts.filter(p => p === 'queue').length, { timeout: 60_000 }).toBe(2)
    await expect.poll(() => w.frames.length, { timeout: 30_000 }).toBeGreaterThan(framesAtRestart + 2)
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const v = await kpiValue(f, 'q')
      if (v)
        seen.add(v)
      await page.waitForTimeout(500)
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
    expect(w.reads.queue ?? 0).toBe(0)
  })
})
