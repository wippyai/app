/**
 * End-to-end test for the proxy bridge API + <w-iframe> custom element
 * introduced in Wippy FE Host 1.0.33.
 *
 * The test exercises the bridge demo page (iframe-demo /bridge route).
 * The demo is a self-contained fixture: bridge.vue plays the PARENT
 * role; an inline `<w-iframe srcdoc="...">` it renders plays the CHILD
 * role. Every interaction is mirrored into `window.__bridgeLog` (a
 * string array) on the iframe-demo Window so tests can inspect history
 * without DOM scraping.
 *
 * Four bridge interactions exercised end-to-end:
 *   - parent → child request('add')        : assert sum returned
 *   - parent → child post('parent-fire')   : assert child HANDLER log
 *   - child → parent request('echo')       : assert child result span
 *   - child → parent post('child-fire')    : assert parent log
 *
 * Custom-element registration sanity check is performed alongside the
 * functional flow — the demo's `<w-iframe>` working at all proves the
 * element is registered in the host's child-iframe context.
 *
 * Run:
 *   npx playwright test e2e/bridge.spec.ts
 *
 * Requires `npx playwright install chromium` once on this machine.
 */
import { expect, test } from '@playwright/test'
import { DEMO_IFRAME_SELECTOR, HOST_IFRAME_SELECTOR, loginAsAdmin, navigateHostTo } from './helpers/login'

test.describe('proxy bridge round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('all four bridge interactions over the demo page', async ({ page }) => {
    await navigateHostTo(page, 'Iframe Demo')

    const hostFrame = page.frameLocator(HOST_IFRAME_SELECTOR)
    const demoFrame = hostFrame.frameLocator(DEMO_IFRAME_SELECTOR).first()

    // Switch the iframe-demo to its /bridge route. Anchor the name regex so a
    // future "Bridge Console"-style tab can't accidentally match.
    await demoFrame.getByRole('link', { name: /^bridge$/i }).click()
    await demoFrame.getByTestId('bridge-demo').waitFor({ state: 'visible' })

    // The deepest frame is the single <w-iframe>'s srcdoc child.
    const childFrame = demoFrame.frameLocator('w-iframe iframe').first()
    await childFrame.getByTestId('child-post-btn').waitFor({ state: 'visible', timeout: 15_000 })

    // ── parent → child request('add') ───────────────────────────────
    await demoFrame.getByTestId('parent-request-btn').click()
    await expect(demoFrame.getByTestId('bridge-event-log'))
      .toContainText(/REQUEST ← add: \d+ \+ \d+ = \d+/, { timeout: 10_000 })

    // ── parent → child post('parent-fire') ─────────────────────────
    await demoFrame.getByTestId('parent-post-btn').click()
    // Parent's own log captures the POST emission; child's HANDLER log
    // (inside the srcdoc) records receipt.
    await expect(demoFrame.getByTestId('bridge-event-log'))
      .toContainText('POST → parent-fire', { timeout: 5_000 })

    // ── child → parent post('child-fire') ──────────────────────────
    await childFrame.getByTestId('child-post-btn').click()
    await expect(demoFrame.getByTestId('bridge-event-log'))
      .toContainText('wippy-message: channel="child-fire" (post)', { timeout: 5_000 })

    // ── child → parent request('echo') ─────────────────────────────
    await childFrame.getByTestId('child-request-btn').click()
    await expect(childFrame.getByTestId('child-request-result'))
      .toContainText(/"echoed"/, { timeout: 5_000 })
    await expect(demoFrame.getByTestId('bridge-event-log'))
      .toContainText('wippy-message: channel="echo" (request)', { timeout: 5_000 })

    // ── Verify __bridgeLog window-scoped history matches the DOM log ──
    // bridge.vue mirrors every log line into window.__bridgeLog so tests
    // (and future tooling) can read it without scraping the <pre>.
    const windowLog = await demoFrame.locator('body').evaluate<string[]>(
      () => (window as unknown as { __bridgeLog?: string[] }).__bridgeLog ?? [],
    )
    expect(windowLog.length).toBeGreaterThan(0)
    expect(windowLog.some(l => /REQUEST ← add:/.test(l))).toBe(true)
    expect(windowLog.some(l => /channel="child-fire"/.test(l))).toBe(true)
    expect(windowLog.some(l => /channel="echo"/.test(l))).toBe(true)
  })

  test('<w-iframe> registered inside the host frame', async ({ page }) => {
    await navigateHostTo(page, 'Iframe Demo')
    const hostFrame = page.frameLocator(HOST_IFRAME_SELECTOR)
    // <w-iframe> is registered by the proxy inside the iframe-demo's window.
    const demoFrame = hostFrame.frameLocator(DEMO_IFRAME_SELECTOR).first()
    const wIframeRegistered = await demoFrame.locator('body').evaluate<boolean>(
      () => typeof customElements.get('w-iframe') === 'function',
    )
    expect(wIframeRegistered).toBe(true)
  })

  test('<w-artifact> registered inside the host frame', async ({ page }) => {
    await navigateHostTo(page, 'Iframe Demo')
    const hostFrame = page.frameLocator(HOST_IFRAME_SELECTOR)
    // <w-artifact> is the host's wrapper element; it must be registered
    // in the host-side document so the host can mount iframe-demo via it.
    const wArtifactRegistered = await hostFrame.locator('body').evaluate<boolean>(
      () => typeof customElements.get('w-artifact') === 'function',
    )
    expect(wArtifactRegistered).toBe(true)
  })
})
