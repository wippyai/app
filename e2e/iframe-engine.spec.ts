/**
 * EE2-2313 Phase 2 — legacy iframe engine (render_engine=iframe, the default).
 *
 * The zero-regression proof for the global engine switch: a packaged view.page
 * renders as a srcdoc iframe (NOT a web fragment), the views fragment gateway is
 * never hit, and the child API surface ($W) works — including state, which is the
 * reference implementation the fragment engine was brought to parity with.
 *
 * Requires an iframe-mode boot:
 *   wippy.exe run … (no render_engine override, or -o wippy.facade:render_engine:default=iframe)
 */
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

test.describe('Legacy iframe engine (EE2-2313)', () => {
  // Engine axis: this suite asserts the iframe path. Skip it under a fragment boot.
  test.skip(process.env.WIPPY_ENGINE === 'fragment', 'iframe engine only')

  test('renders srcdoc, gateway dormant, $W + state work', async ({ page }) => {
    const fragRequests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/public/frag'))
        fragRequests.push(r.url())
    })

    await loginAsAdmin(page)
    await page.goto('/home/users')

    // Renders as a legacy srcdoc iframe — NOT a reframed web fragment.
    await page.waitForFunction(() => !!document.querySelector('iframe[srcdoc]'), { timeout: 20_000 })
    const dom = await page.evaluate(() => ({
      hasSrcdoc: !!document.querySelector('iframe[srcdoc]'),
      hasWebFragment: !!document.querySelector('web-fragment'),
      hasRealm: !!document.querySelector('iframe[name^="wf:"]'),
    }))
    expect(dom.hasSrcdoc, 'page renders as a srcdoc iframe').toBe(true)
    expect(dom.hasWebFragment, 'no <web-fragment> in iframe mode').toBe(false)
    expect(dom.hasRealm, 'no reframed realm iframe in iframe mode').toBe(false)

    // The fragment gateway is dormant — the endpoint is never requested.
    expect(fragRequests, 'no /api/public/frag requests in iframe mode').toEqual([])

    // Real API content + state parity INSIDE the srcdoc iframe (same-origin).
    const result = await page.evaluate(async () => {
      const ifr = document.querySelector('iframe[srcdoc]') as HTMLIFrameElement
      const w = ifr.contentWindow as any
      const deadline = Date.now() + 10_000
      while (!(w && w.$W) && Date.now() < deadline)
        await new Promise(r => setTimeout(r, 100))
      // The Vue app fetches + renders its table after $W is ready — poll for it.
      const countRows = () => ifr.contentDocument?.querySelectorAll('table tr, .p-datatable-tbody tr, [role="row"]').length ?? 0
      let rows = 0
      const rowDeadline = Date.now() + 10_000
      while (rows === 0 && Date.now() < rowDeadline) {
        rows = countRows()
        if (rows === 0)
          await new Promise(r => setTimeout(r, 200))
      }
      const state = await w.$W.state()
      await state.set('__iframe_probe__', { ok: 1 })
      const got = await Promise.race([
        state.get('__iframe_probe__'),
        new Promise(r => setTimeout(() => r('__TIMEOUT__'), 5000)),
      ])
      return { rows, got }
    })
    expect(result.rows, 'real API-sourced content rendered in the srcdoc iframe').toBeGreaterThan(0)
    expect(result.got, 'state round-trips in iframe mode').toEqual({ ok: 1 })
  })
})
