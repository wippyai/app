/**
 * Managed layout, end to end through the REAL facade flow.
 *
 * The gen-2-chat harness (`bootManagedLayout`) already proves the shell's
 * behaviour, and it does so far faster. What it cannot prove is anything
 * on this side of the facade, because it hands the declaration to the host
 * as a live JavaScript object:
 *
 *   1. The facade delivers `host_config_layout` as a FLAT JSON STRING and
 *      the host parses it. A nested YAML block would arrive as a string of
 *      YAML and fail silently into "No layout declared".
 *   2. login → shell → host boots managed cleanly, with the real backend,
 *      real pages and real auth.
 *   3. Every declared panel LOADS AND RENDERS — present-in-DOM is not the
 *      same thing, and a panel that mounts empty is the failure mode this
 *      release is about.
 *   4. The declared coordinator and floating chrome are live.
 *
 * ## Topology — no host iframe
 *
 * The facade shell imports the host as an ESM module
 * (`await import(cfg.facade_url + cfg.module_file)`) and mounts it into
 * `#app` in the TOP document. There is no `iframe[src*="iframe.html"]`
 * wrapper, so everything here queries the page directly. The only iframes
 * on the page are the srcdoc frames of `kind: 'page'` panels.
 *
 * ## Running it
 *
 * Managed and compat boots are mutually exclusive — one wippy instance,
 * one shared `app.db` — so this is a SECOND, sequential pass:
 *
 *   ./make.bat clean-build
 *   # gen-2-chat: pnpm build && pnpm serve   (built host on :5173)
 *   ./wippy.exe run -c -o wippy.facade:fe_facade_url:default=http://localhost:5173 \
 *                     -o wippy.facade:fe_mode:default=managed
 *   pnpm test:e2e:managed
 *
 * `host_config_layout` itself is committed (see `src/app/deps/_index.yaml`)
 * and is inert under the default `fe_mode = compat`.
 */
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { collectConsoleErrors } from './helpers/console'
import { loginAsAdmin } from './helpers/login'

const SHELL = '.managed-layout-shell'

/** Wait for the managed shell and its panel content to settle. */
async function bootManaged(page: Page) {
  await loginAsAdmin(page)
  await expect(page.locator(SHELL)).toBeVisible({ timeout: 30_000 })
}

/** Read a page panel's srcdoc document — same-origin, so reachable. */
function panelDoc(page: Page, panelId: string) {
  return page.evaluate((id) => {
    const frame = document
      .querySelector(`[data-wippy-panel-mount="${id}"] iframe`) as HTMLIFrameElement | null
    const doc = frame?.contentDocument
    if (!doc)
      return null
    return { children: doc.body.children.length, text: (doc.body.textContent || '').trim() }
  }, panelId)
}

test.describe('managed layout — real facade flow', () => {
  test('boots the managed shell, not compat', async ({ page }) => {
    // MANDATORY FIRST ASSERTION. `fe_mode` is a process-level override
    // that nothing in this spec can see, so a run launched without it
    // would otherwise green-pass the compat chrome and report a parity
    // that was never tested.
    await bootManaged(page)
    await expect(page.locator('.wippy-host-app')).toHaveCount(0)
  })

  test('the flat JSON string reached the host as a parsed declaration', async ({ page }) => {
    // If the facade had passed a YAML block, or the host had failed to
    // parse the string, a `wippy-error` placeholder renders instead and
    // no panels exist.
    await bootManaged(page)

    await expect(page.locator('wippy-error')).toHaveCount(0)
    for (const id of ['nav', 'main', 'side'])
      await expect(page.locator(`[data-wippy-panel="${id}"]`)).toHaveCount(1)
  })

  test('every declared panel renders real content', async ({ page }) => {
    // Loaded is not rendered. Each assertion below is on something the
    // panel's own content had to produce.
    await bootManaged(page)

    // Builtin nav lists the app's announced pages.
    const nav = page.locator('[data-wippy-panel-mount="nav"]')
    await expect(nav).toContainText('Admin Panel', { timeout: 30_000 })
    await expect(nav).toContainText('Iframe Demo')

    // Both page panels paint a real document inside their srcdoc iframe.
    await expect(page.locator('[data-wippy-panel-mount="main"] iframe')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-wippy-panel-mount="side"] iframe')).toBeVisible({ timeout: 30_000 })

    await expect
      .poll(() => panelDoc(page, 'main').then(d => d?.text.length ?? 0), { timeout: 30_000 })
      .toBeGreaterThan(20)
    await expect
      .poll(() => panelDoc(page, 'side').then(d => d?.text.length ?? 0), { timeout: 30_000 })
      .toBeGreaterThan(20)
  })

  test('the declared coordinator and anchored edge tab are live', async ({ page }) => {
    await bootManaged(page)

    // The coordinator is headless; its marker element is the only DOM
    // signal that it mounted at all.
    await expect(page.locator('[data-wippy-compat-coordinator]')).toHaveCount(1, { timeout: 30_000 })
    // Addressed by id, not by class — with one float the class would pass
    // even if the declaration had named a different panel.
    await expect(page.locator('[data-wippy-floating="side-tab"]')).toBeVisible({ timeout: 30_000 })
  })

  test('the parity table reports nothing unwired', async ({ page }) => {
    // The host's own boot-time report of what the declaration failed to
    // wire. It prints nothing when clean, so anything here is a real gap
    // in the demo declaration.
    const parity: string[] = []
    page.on('console', (m) => {
      const t = m.text()
      if (t.includes('[managed-layout]') && t.includes('not wired up'))
        parity.push(t)
    })

    await bootManaged(page)
    await expect(page.locator('[data-wippy-compat-coordinator]')).toHaveCount(1, { timeout: 30_000 })

    expect(parity, `parity table reported unwired capabilities: ${parity.join(' | ')}`).toEqual([])
  })

  test('boots clean — no console errors, no failed requests', async ({ page }) => {
    // The smoke invariants, asserted rather than eyeballed.
    const errors = collectConsoleErrors(page)
    const failed: string[] = []
    page.on('response', (r) => {
      if (r.status() >= 400)
        failed.push(`${r.status()} ${r.url()}`)
    })

    await loginAsAdmin(page)
    // Judge the POST-AUTH boot only.
    //
    // `loginAsAdmin` starts at `/`, which the facade shell hits with no
    // token: it logs "Facade initialization failed: Error: no token" and
    // redirects to the login page. That is the facade's normal
    // unauthenticated path — noisy, but it happens before any host code
    // runs and says nothing about managed layout. The host module is
    // imported after this point, so nothing about its boot is lost.
    errors.length = 0
    failed.length = 0

    await expect(page.locator(SHELL)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-wippy-panel-mount="main"] iframe')).toBeVisible({ timeout: 30_000 })
    // Let late-loading panel content settle before judging.
    await page.waitForTimeout(5000)

    expect(errors, `console errors: ${errors.slice(0, 8).join(' | ')}`).toEqual([])
    expect(failed, `failed requests: ${failed.slice(0, 8).join(' | ')}`).toEqual([])
  })
})
