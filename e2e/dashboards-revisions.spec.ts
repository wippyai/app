import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api, expectFailures, monitor, newPage, takeUnexpected } from './helpers/page-watch'
import { publishPage, storedRevision } from './dashboards-wp5.support'

/**
 * RC2-01: a change based on an old copy of a page is refused. Two editors read the same revision of a page
 * and each publishes a change that names it as `base_revision`. The first is applied and the page goes up one
 * revision; the second is refused with `409 revision_conflict` and the revision that the page has now, and the
 * page keeps the first editor's change. The second editor reads the page again and publishes on the new
 * revision. A publish of a page that exists with no `base_revision` is refused with `400 base_revision_required`.
 *
 * The Lua tests of the wippy/dashboards repository (test/src/revisions) decide the rule and the cases that a
 * browser cannot show (the rows, entries, operations and subscriptions that a refusal leaves alone, and two
 * publishes at one moment); this suite proves the path through the running app, with two signed-in sessions.
 */

const ID = 'e2e_revisions'
const ROUTE = '/e2e/revisions'
const PAGES = '/api/v1/dashboards/pages'

function spec(title: string, extra: Record<string, unknown> = {}) {
  return {
    spec: 'wippy.dashboard_page/v1',
    id: ID,
    title,
    route: ROUTE,
    layout: { layouts: { default: { direction: 'vertical', children: [] } } },
    publish: true,
    ...extra,
  }
}

async function titleOf(page: Page): Promise<string> {
  const entry = await api(page, 'GET', `${PAGES}/${ID}/props`)
  expect(entry.status, entry.body).toBe(200)
  return JSON.parse(entry.body).title ?? ''
}

test.beforeEach(async ({ page }) => {
  await monitor(page, 'editor-one')
  await loginAsAdmin(page)
  // A page of an earlier run would answer revision_conflict for the first publish below.
  await api(page, 'DELETE', `${PAGES}/${ID}`)
  expectFailures(page, { status: 404, path: `${PAGES}/${ID}` })
})

test.afterEach(async ({ page }) => {
  await api(page, 'DELETE', `${PAGES}/${ID}`)
  expect(await takeUnexpected()).toEqual([])
})

test.describe('RC2-01: a change based on an old copy of a page is refused', () => {
  test('two editors change one page and the second gets revision_conflict', async ({ page, browser }) => {
    const second = await newPage(browser, 'editor-two')
    await loginAsAdmin(second)

    const first = await publishPage(page, spec('Revisions: start'))
    expect(first.status, first.body).toBe(200)
    const start = JSON.parse(first.body).revision as number
    expect(await storedRevision(page, ID)).toBe(start)

    // Both editors have read the page at revision `start`.
    const readByTwo = await storedRevision(second, ID)
    expect(readByTwo).toBe(start)

    const one = await api(page, 'POST', PAGES, spec('Revisions: editor one', { base_revision: start }))
    expect(one.status, one.body).toBe(200)
    expect(JSON.parse(one.body).revision).toBe(start + 1)

    // The second editor still holds `start`: refused, with the revision that the page has now.
    expectFailures(second, { status: 409, path: PAGES })
    const two = await api(second, 'POST', PAGES, spec('Revisions: editor two', { base_revision: readByTwo }))
    expect(two.status, two.body).toBe(409)
    const refusal = JSON.parse(two.body)
    expect(refusal.error.code).toBe('revision_conflict')
    expect(refusal.error.current_revision).toBe(start + 1)

    // Nothing of the refused change is stored: the page is the first editor's.
    expect(await storedRevision(second, ID)).toBe(start + 1)
    expect(await titleOf(second)).toBe('Revisions: editor one')

    // The second editor reads the page again and changes it on the new revision.
    const retry = await api(second, 'POST', PAGES, spec('Revisions: editor two', { base_revision: start + 1 }))
    expect(retry.status, retry.body).toBe(200)
    expect(JSON.parse(retry.body).revision).toBe(start + 2)
    expect(await titleOf(page)).toBe('Revisions: editor two')
  })

  test('a publish of a page that exists with no base_revision is refused, and a new page needs none', async ({ page }) => {
    const made = await api(page, 'POST', PAGES, spec('Revisions: new'))
    expect(made.status, made.body).toBe(200)
    expectFailures(page, { status: 400, path: PAGES }, { status: 409, path: PAGES })
    const bare = await api(page, 'POST', PAGES, spec('Revisions: no base'))
    expect(bare.status, bare.body).toBe(400)
    expect(JSON.parse(bare.body).error.code).toBe('base_revision_required')
    expect(await titleOf(page)).toBe('Revisions: new')
    // A removed page is new again; a base other than 0 for a page that does not exist is a conflict at revision 0.
    await api(page, 'DELETE', `${PAGES}/${ID}`)
    const ghost = await api(page, 'POST', PAGES, spec('Revisions: ghost', { base_revision: 3 }))
    expect(ghost.status, ghost.body).toBe(409)
    expect(JSON.parse(ghost.body).error.current_revision).toBe(0)
  })
})
