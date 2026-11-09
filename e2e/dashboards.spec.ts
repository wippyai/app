import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

/**
 * Dashboards POC checks. Needs the POC pages published first:
 * stage B pages `coord_ph_one` (/coord/ph-one, five placeholder tiles, t5 silent)
 * and `coord_ph_two` (/coord/ph-two, two placeholder tiles).
 */

function pageFrame(page: Page, id: string): FrameLocator {
  return page.frameLocator(`iframe[name="wippy:page:wippy.dashboards.pages:${id}"]`)
}

/** Navigate inside the running shell, because deep links can race the shell's start. */
async function openInShell(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function boxes(frame: FrameLocator, ids: string[]) {
  const out: Record<string, { x: number, y: number, w: number, h: number }> = {}
  for (const id of ids) {
    const b = await frame.locator(`[data-tile-id="${id}"]`).boundingBox()
    if (b)
      out[id] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  return out
}

test.describe('stage B: page host and dashboard-layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loginAsAdmin(page)
  })

  test('reflow, kept state, scroll and timeout on one page', async ({ page }) => {
    await openInShell(page, '/coord/ph-one')
    const frame = pageFrame(page, 'coord_ph_one')
    await expect(frame.locator('[data-tile-id="t1"]')).toBeVisible({ timeout: 20_000 })

    // Wide board: lg layout, t1 to t3 share a row.
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2', 't3'])
      return b.t1 && b.t2 && b.t3 && b.t1.y === b.t2.y && b.t2.y === b.t3.y
    }, { timeout: 10_000 }).toBe(true)
    const wide = await boxes(frame, ['t1', 't2', 't3', 't4', 't5'])
    console.log('wide', JSON.stringify(wide))

    // Type into t2, then go narrow: default layout, one column.
    const input = frame.locator('dash-placeholder[tile-id="t2"] input')
    await input.fill('keep me')
    await page.setViewportSize({ width: 900, height: 900 })
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2'])
      return b.t1 && b.t2 && b.t2.y > b.t1.y && b.t1.x === b.t2.x
    }, { timeout: 10_000 }).toBe(true)
    console.log('narrow', JSON.stringify(await boxes(frame, ['t1', 't2', 't3'])))
    await page.setViewportSize({ width: 1400, height: 900 })
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2'])
      return b.t1 && b.t2 && b.t1.y === b.t2.y
    }, { timeout: 10_000 }).toBe(true)
    await expect(input).toHaveValue('keep me')

    // A 600 px container in a wide window: default layout.
    await page.locator('iframe[name="wippy:page:wippy.dashboards.pages:coord_ph_one"]').evaluate((el: HTMLElement) => {
      el.style.width = '600px'
    })
    await expect.poll(async () => {
      const b = await boxes(frame, ['t1', 't2'])
      return b.t1 && b.t2 && b.t2.y > b.t1.y && b.t1.w < 600
    }, { timeout: 10_000 }).toBe(true)
    console.log('container600', JSON.stringify(await boxes(frame, ['t1', 't2'])))
    await page.locator('iframe[name="wippy:page:wippy.dashboards.pages:coord_ph_one"]').evaluate((el: HTMLElement) => {
      el.style.width = ''
    })

    // The page is taller than the window: scroll to the end and see the last row whole.
    const scroll = await frame.locator('dashboard-layout').evaluate((el) => {
      const board = el.shadowRoot!.querySelector('.board') as HTMLElement
      board.scrollTop = board.scrollHeight
      const frames = [...el.shadowRoot!.querySelectorAll('[data-tile-id]')].map(n => n.getBoundingClientRect())
      return {
        scrollHeight: board.scrollHeight,
        clientHeight: board.clientHeight,
        lastBottom: Math.max(...frames.map(r => r.bottom)),
        boardBottom: board.getBoundingClientRect().bottom,
      }
    })
    console.log('scroll', JSON.stringify(scroll))
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
    expect(scroll.lastBottom).toBeLessThanOrEqual(scroll.boardBottom + 1)

    // The silent tile times out.
    await expect(frame.locator('[data-tile-id="t5"]')).toContainText('No response', { timeout: 15_000 })
    await expect(frame.locator('[data-tile-id="t1"]')).not.toContainText('No response')
  })

  test('two paths share one bundle, sub-path and history', async ({ page }) => {
    const bundles = new Set<string>()
    const seen: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (u.pathname.includes('dashboard-page') || u.pathname.includes('/pages/content/'))
        seen.push(u.pathname)
      if (u.pathname.includes('dashboard-page') && u.pathname.endsWith('.js'))
        bundles.add(u.pathname)
    })

    await openInShell(page, '/coord/ph-one/claude-haiku-4-5')
    const one = pageFrame(page, 'coord_ph_one')
    await expect(one.locator('[data-tile-id="t1"]')).toBeVisible({ timeout: 20_000 })
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/claude-haiku-4-5')
    await one.locator('dashboard-layout').evaluate((el: any) => { el.__probe = 'same' })

    await openInShell(page, '/coord/ph-one/other')
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/other')
    await page.goBack()
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/claude-haiku-4-5')
    await page.goForward()
    await expect(one.locator('dashboard-layout')).toHaveAttribute('sub-path', '/other')
    expect(await one.locator('dashboard-layout').evaluate((el: any) => el.__probe)).toBe('same')

    await openInShell(page, '/coord/ph-two')
    const two = pageFrame(page, 'coord_ph_two')
    await expect(two.locator('[data-tile-id="x1"]')).toBeVisible({ timeout: 20_000 })
    await expect(two.locator('[data-tile-id="t1"]')).toHaveCount(0)
    console.log('seen', JSON.stringify(seen))
    console.log('bundles', JSON.stringify([...bundles]))
    expect(bundles.size).toBe(1)
  })
})
