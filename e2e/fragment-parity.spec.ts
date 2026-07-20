/**
 * EE2-2313 Phase 2 — fragment↔iframe parity assertions.
 *
 * Verifies the behaviours brought to parity in Phase 2 that the A–G/H–I PoC suite
 * (fragment-poc.spec.ts) does not cover: host-backed state, global error capture,
 * and title propagation. Runs against a fragment-mode boot
 * (`-o wippy.facade:render_engine:default=fragment`). The engine axis (running the
 * same shape under render_engine=iframe) is tracked in the Phase-2 plan §9.2d.
 */
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

test.describe('Web Fragment parity (EE2-2313)', () => {
  // Engine axis: this suite asserts the fragment path. Skip it under an iframe boot.
  test.skip(process.env.WIPPY_ENGINE === 'iframe', 'fragment engine only')

  test('state round-trips, error capture installed, title propagates', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/home/users')

    // The routed view.page renders as a reframed realm exposing $W.
    await page.waitForFunction(() => {
      const f = (window as any).frames[0]
      return !!document.querySelector('web-fragment') && !!(f && f.$W)
    }, { timeout: 20_000 })

    const result = await page.evaluate(async () => {
      const realm = (window as any).frames[0]
      const w = realm.$W

      // State: set → get round-trips through the host store (was a no-op stub).
      const state = await w.state()
      const key = '__wf_parity__'
      const val = { hello: 42, ts: 'probe' }
      await state.set(key, val)
      const got = await Promise.race([
        state.get(key),
        new Promise(r => setTimeout(() => r('__TIMEOUT__'), 6000)),
      ])
      const all = await Promise.race([
        state.getAll(),
        new Promise(r => setTimeout(() => r('__TIMEOUT__'), 6000)),
      ])
      const allHasKey = all && typeof all === 'object' && all !== '__TIMEOUT__'
        ? Object.prototype.hasOwnProperty.call(all, key)
        : all

      // Global error capture installed in the realm (was absent).
      const errorCaptureInstalled = typeof (realm as any).onerror === 'function'

      return { got, allHasKey, errorCaptureInstalled }
    })

    expect(result.got, 'state.get returns the value set (host round-trip, not the old null stub)').toEqual({ hello: 42, ts: 'probe' })
    expect(result.allHasKey, 'state.getAll includes the key').toBe(true)
    expect(result.errorCaptureInstalled, 'window.onerror installed in the realm').toBe(true)

    // Title propagates child→host: the host document.title is the app's title,
    // not the reframed stub sentinel.
    const hostTitle = await page.title()
    expect(hostTitle, 'host document.title is not the reframed sentinel').not.toBe('Web Fragments: reframed')
    expect(hostTitle, 'host document.title is non-empty').not.toBe('')
  })
})
