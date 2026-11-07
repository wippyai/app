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
 * With `WIPPY_ENGINE=fragment` the same flow runs in the fragment engine, plus
 * the Demo's Nested Nav route, where the page sits one realm deeper.
 *
 * Run:
 *   npx playwright test e2e/bridge.spec.ts
 *
 * Requires `npx playwright install chromium` once on this machine.
 */
import type { FrameLocator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { getDemoScope, getHostFrame, loginAsAdmin } from './helpers/login'

const FRAGMENT_ENGINE = process.env.WIPPY_ENGINE === 'fragment'

async function exerciseBridge(demo: Page | FrameLocator) {
  await demo.getByTestId('bridge-demo').waitFor({ state: 'visible' })

  // The deepest frame is the single <w-iframe>'s srcdoc child.
  const childFrame = demo.frameLocator('w-iframe iframe').first()
  await childFrame.getByTestId('child-post-btn').waitFor({ state: 'visible', timeout: 15_000 })

  // ── parent → child request('add') ───────────────────────────────
  await demo.getByTestId('parent-request-btn').click()
  await expect(demo.getByTestId('bridge-event-log'))
    .toContainText(/REQUEST ← add: \d+ \+ \d+ = \d+/, { timeout: 10_000 })

  // ── parent → child post('parent-fire') ─────────────────────────
  await demo.getByTestId('parent-post-btn').click()
  // Parent's own log captures the POST emission; child's HANDLER log
  // (inside the srcdoc) records receipt.
  await expect(demo.getByTestId('bridge-event-log'))
    .toContainText('POST → parent-fire', { timeout: 5_000 })

  // ── child → parent post('child-fire') ──────────────────────────
  await childFrame.getByTestId('child-post-btn').click()
  await expect(demo.getByTestId('bridge-event-log'))
    .toContainText('wippy-message: channel="child-fire" (post)', { timeout: 5_000 })

  // ── child → parent request('echo') ─────────────────────────────
  await childFrame.getByTestId('child-request-btn').click()
  await expect(childFrame.getByTestId('child-request-result'))
    .toContainText(/"echoed"/, { timeout: 5_000 })
  await expect(demo.getByTestId('bridge-event-log'))
    .toContainText('wippy-message: channel="echo" (request)', { timeout: 5_000 })
}

/**
 * bridge.vue writes `window.__bridgeLog` in the window its code runs in: the
 * srcdoc frame in the iframe engine, the realm in the fragment engine. The realm
 * is not the window of the reflected DOM, so it is found by its frame name.
 */
async function readBridgeLog(page: Page, demo: Page | FrameLocator): Promise<string[]> {
  if (!FRAGMENT_ENGINE) {
    return demo.locator('body').evaluate(
      () => (window as unknown as { __bridgeLog?: string[] }).__bridgeLog ?? [],
    )
  }
  for (const frame of page.frames()) {
    if (!frame.name().startsWith('wf:'))
      continue
    const log = await frame.evaluate(() => (window as unknown as { __bridgeLog?: string[] }).__bridgeLog)
    if (log)
      return log
  }
  return []
}

test.describe('proxy bridge round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    // `app.views:iframe-demo` has no sidebar entry point in the current
    // build (the Host boots with its sidebar closed, see
    // `navigateHostTo`'s doc comment) — reach it by its own registered
    // mountRoute instead.
    await page.goto('/demo')
  })

  test('all four bridge interactions over the demo page', async ({ page }) => {
    const demo = await getDemoScope(page)

    // Switch the iframe-demo to its /bridge route. Anchor the name regex so a
    // future "Bridge Console"-style tab can't accidentally match. A managed
    // layout can show this page in more than one panel.
    await demo.getByRole('link', { name: /^bridge$/i }).first().click()
    await exerciseBridge(demo)

    // ── Verify __bridgeLog window-scoped history matches the DOM log ──
    // bridge.vue mirrors every log line into window.__bridgeLog so tests
    // (and future tooling) can read it without scraping the <pre>.
    const windowLog = await readBridgeLog(page, demo)
    expect(windowLog.length).toBeGreaterThan(0)
    expect(windowLog.some(l => /REQUEST ← add:/.test(l))).toBe(true)
    expect(windowLog.some(l => /channel="child-fire"/.test(l))).toBe(true)
    expect(windowLog.some(l => /channel="echo"/.test(l))).toBe(true)
  })

  test('all four bridge interactions in a page nested in a fragment page', async ({ page }) => {
    test.skip(!FRAGMENT_ENGINE, 'fragment engine only')

    await page.goto('/home/nested-nav/bridge')

    await exerciseBridge(await getHostFrame(page))
  })

  test('<w-iframe> registered inside the host frame', async ({ page }) => {
    // <w-iframe> is registered by the proxy inside the iframe-demo's window.
    const demo = await getDemoScope(page)
    await demo.locator('body').waitFor({ timeout: 15_000 })
    const wIframeRegistered = await demo.locator('body').evaluate(
      () => typeof customElements.get('w-iframe') === 'function',
    )
    expect(wIframeRegistered).toBe(true)
  })

  test('<w-artifact> registered inside the host frame', async ({ page }) => {
    // <w-artifact> is the Host's own wrapper element (used to embed pages
    // and artifacts generally, not specifically to mount this page — see
    // `DEMO_IFRAME_SELECTOR`'s doc comment); it registers on the Host's own
    // document. Wait for the demo page to settle first so the check does
    // not race the Host's own boot sequence.
    const demo = await getDemoScope(page)
    await demo.locator('body').waitFor({ timeout: 15_000 })
    const hostFrame = await getHostFrame(page)
    const wArtifactRegistered = await hostFrame.locator('body').evaluate(
      () => typeof customElements.get('w-artifact') === 'function',
    )
    expect(wArtifactRegistered).toBe(true)
  })
})
