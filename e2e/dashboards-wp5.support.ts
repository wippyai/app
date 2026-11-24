import type { FrameLocator, Page, Route } from '@playwright/test'
import { expect } from '@playwright/test'
import { api } from './helpers/page-watch'

/**
 * Helpers of the WP5 browser specs (dashboards-layout, dashboards-states, dashboards-artifact): publish a
 * fixture page, answer its point reads from the test, and read the page, its frames and the log that the
 * fixture tiles keep in window.__fx.
 *
 * The specs answer the reads of a page themselves (page.route), so the values do not depend on the
 * fixture points of app.dashboards_fixtures: the points only have to be declared. A point that describes no
 * output makes the publish check `unavailable`, which lets the publish go ahead.
 */

export const SPEC = 'wippy.dashboard_page/v1'

/** The window of the layout tests: wide enough that the Host's own chrome never narrows the board. */
export const WIDE = { width: 1920, height: 900 }

/** The route of a fixture page: a page id uses underscores, a route segment only lower case letters, digits and hyphens. */
export const routeOf = (id: string) => `/fx/${id.replace(/_/g, '-')}`

export interface TestPage {
  id: string
  route: string
}

/** The srcdoc frame of a published page (the Host names it `wippy:page:<registry id>`). */
export function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

export function pageIframe(page: Page, id: string) {
  return page.locator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

/**
 * Reloads the shell of a signed-in page and waits for its route list. The server lists the route of a new page
 * at once (`/api/public/pages/routes`), but a shell that is already running keeps the list it loaded at its
 * start, so it shows nothing for a page that was published after that. A page that another user publishes needs
 * the same reload.
 */
export async function refreshShell(page: Page): Promise<void> {
  // Let the loads of the running shell end first: a reload would cancel them, and the watch counts a cancelled load.
  await page.waitForLoadState('networkidle')
  const routes = page.waitForResponse(r => r.url().includes('/api/public/pages/routes'))
  await page.reload()
  await routes
  await page.waitForLoadState('networkidle')
}

/**
 * Publishes a page spec as the signed-in user, expects it to be accepted, and reloads the shell so that it knows
 * the page's route.
 */
export async function publish(page: Page, spec: Record<string, unknown>): Promise<void> {
  const res = await publishPage(page, { spec: SPEC, publish: true, ...spec })
  expect(res.status, res.body).toBe(200)
  await refreshShell(page)
}

const PAGES = '/api/v1/dashboards/pages'

/**
 * The revision of a page that exists, which `GET .../props` carries, or undefined for a page that does not. The
 * read goes through the context's request client, not through the page, so the 404 of a page that is not
 * there yet is not counted as a failed request of the page under test.
 */
export async function storedRevision(page: Page, id: string): Promise<number | undefined> {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('@wippy_token_info') || 'null')?.token)
  const res = await page.request.get(`${new URL(page.url()).origin}${PAGES}/${id}/props`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status() !== 200)
    return undefined
  const revision = (await res.json()).revision
  return typeof revision === 'number' ? revision : undefined
}

/**
 * Posts a page body to the publish endpoint (RC2-01). A page that exists is published again with `base_revision`,
 * the revision that it has now, so a spec that leaves a page of an earlier test behind is replaced and not
 * refused; a page that does not exist, and a body that names its own `base_revision`, go as they are. The tests
 * of the conflict itself name the base themselves. Returns what `api` returns.
 */
export async function publishPage(page: Page, body: Record<string, unknown>) {
  let sent = body
  if (body.base_revision === undefined && typeof body.id === 'string') {
    const revision = await storedRevision(page, body.id)
    if (revision !== undefined)
      sent = { ...body, base_revision: revision }
  }
  return api(page, 'POST', PAGES, sent)
}

/**
 * A viewer who may not view a page (the policy denies `view` on `page:<registry id>`) never reaches the page app:
 * the Host checks the same right before it builds the frame. It answers the content request with 401
 * ("You do not have permission to view this page"), leaves the page out of its route list, and mounts no frame,
 * so the page's own "Access denied" text cannot show. The calling test declares the 401 with `expectFailures`.
 * (The page app shows that text when its props read answers 403 inside an open page.)
 */
export async function expectHostRefusesPage(page: Page, id: string): Promise<void> {
  const content = await api(page, 'GET', `/api/public/pages/content/wippy.dashboards.pages:${id}`)
  expect(content.status, content.body).toBe(401)
  expect(content.body).toContain('permission to view this page')
  await expect(pageIframe(page, id)).toHaveCount(0)
}

export async function remove(page: Page, id: string): Promise<void> {
  const res = await api(page, 'DELETE', `/api/v1/dashboards/pages/${id}`)
  expect([200, 404], res.body).toContain(res.status)
}

const NOW = '2026-11-19T12:00:00Z'

export interface FieldSpec {
  name: string
  type: 'string' | 'number' | 'decimal' | 'date' | 'time' | 'boolean'
  role?: 'dimension' | 'measure'
}

/** A table frame (data point contract section 5). A `null` cell is an empty cell. */
export function frame(fields: FieldSpec[], rows: unknown[][]) {
  return {
    schema: 'wippy.dashboard_frame/v1',
    fields: fields.map(f => ({ name: f.name, type: f.type, role: f.role ?? 'dimension', nullable: true })),
    rows,
  }
}

/** A result envelope (data point contract section 4.2). */
export function envelope(point: string, state: string, extra: Record<string, unknown> = {}) {
  return {
    point,
    state,
    computed_at: NOW,
    data_as_of: NOW,
    source_title: 'Fixture',
    args: {},
    completeness: 'complete',
    warnings: [],
    ...extra,
  }
}

export const ready = (point: string, data: unknown, extra: Record<string, unknown> = {}) => envelope(point, 'ready', { data, ...extra })

export type Answer = Record<string, unknown> | ((route: Route, url: URL) => unknown | Promise<unknown>)

/** One read the page sent: the point name and the query. */
export interface ReadCall {
  point: string
  args: string | null
  operation: string | null
}

/**
 * Answers the point reads of a page from the test. `answers` maps the page's point name to a JSON body or to a
 * function that returns one (it may wait, to hold a read). Every read is recorded in the returned list.
 * A function that returns `null` lets the request go to the server.
 */
export async function answerReads(page: Page, pageId: string, answers: Record<string, Answer>): Promise<ReadCall[]> {
  const calls: ReadCall[] = []
  await page.route(`**/api/v1/dashboards/pages/${pageId}/points/**`, async (route) => {
    const url = new URL(route.request().url())
    const point = decodeURIComponent(url.pathname.split('/points/')[1] ?? '').split('/')[0] ?? ''
    calls.push({ point, args: url.searchParams.get('args'), operation: url.searchParams.get('operation') })
    const answer = answers[point]
    if (answer === undefined) {
      await route.continue()
      return
    }
    const body = typeof answer === 'function' ? await (answer as (r: Route, u: URL) => unknown)(route, url) : answer
    if (body === null) {
      await route.continue()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return calls
}

/** What the fixture tiles recorded in the page (window.__fx), for one tile. */
export async function fixtureLog(frameLocator: FrameLocator, tileId: string) {
  return frameLocator.locator('body').evaluate((_body, id) => {
    const fx = (window as unknown as { __fx?: { states: Record<string, unknown[]>, reads: Record<string, unknown[]>, drawn: Record<string, string[]> } }).__fx
    return {
      states: (fx?.states[id] ?? []) as Array<Record<string, unknown>>,
      reads: (fx?.reads[id] ?? []) as Array<{ input: string, seq: number, outcome: string }>,
      drawn: fx?.drawn[id] ?? [],
    }
  }, tileId)
}

/** The rectangle of an element in the srcdoc frame, rounded to whole pixels. */
export async function box(frameLocator: FrameLocator, selector: string) {
  const b = await frameLocator.locator(selector).first().boundingBox()
  if (!b)
    return null
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

/** The rows of rectangles of a layout tree for a board of `width` px (tile contract section 5.7, step 6): `Nfr` slots share the row, `maxSize` caps a slot. */
export interface Slot { panel: string, size: string, maxSize?: string }
export interface Row { direction: string, size?: string, children: Slot[] }

export function expectedWidths(row: Row, width: number): Record<string, number> {
  const weight = (s: Slot) => Number.parseFloat(s.size)
  const cap = (s: Slot) => (s.maxSize ? Number.parseFloat(s.maxSize) : Number.POSITIVE_INFINITY)
  const out: Record<string, number> = {}
  let open = row.children.slice()
  let room = width
  // Flex: share the room by weight; a slot that reaches its maximum stops growing, and the others share the rest.
  for (;;) {
    const total = open.reduce((sum, s) => sum + weight(s), 0)
    const capped = open.filter(s => (room * weight(s)) / total > cap(s))
    if (capped.length === 0) {
      for (const s of open)
        out[s.panel] = (room * weight(s)) / total
      return out
    }
    for (const s of capped) {
      out[s.panel] = cap(s)
      room -= cap(s)
    }
    open = open.filter(s => !capped.includes(s))
    if (open.length === 0)
      return out
  }
}
