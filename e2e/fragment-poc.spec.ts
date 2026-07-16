/**
 * Web Fragments PoC (EE2-2313).
 *
 * With FRAGMENT_MODE on in the Web Host, every iframe-destined view.page renders
 * as a <web-fragment> (reframed realm + shared DOM) served by the Lua fragment
 * gateway at /api/public/frag/{id}/..., instead of a srcdoc iframe.
 *
 * Prereqs (see the plan / EE2-2313):
 *  - Backend: wippy.exe run -c -o app:gateway:addr=:8087 \
 *      -o wippy.facade:fe_facade_url:default=http://localhost:5173
 *    (with wippy.lock replacing wippy/views with the local checkout).
 *  - Host: pnpm exec vite --host --base=/   (on :5173)
 *  - Run: WIPPY_URL=http://localhost:8087 npx playwright test e2e/fragment-poc.spec.ts
 */
import { expect, test } from '@playwright/test'
import { HOST_IFRAME_SELECTOR, loginAsAdmin, navigateHostTo } from './helpers/login'

test.describe('Web Fragments PoC (EE2-2313)', () => {
  test('a view.page renders as a <web-fragment> via the Lua gateway', async ({ page }) => {
    const logs: string[] = []
    const errors: string[] = []
    page.on('console', (msg) => {
      const t = msg.text()
      logs.push(t)
      if (msg.type() === 'error')
        errors.push(t)
    })
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))

    await loginAsAdmin(page)
    await navigateHostTo(page, 'Iframe Demo')

    const hostFrame = page.frameLocator(HOST_IFRAME_SELECTOR)

    // A) Rendered as a web-fragment (fragment mode), not a srcdoc iframe.
    await expect(hostFrame.locator('web-fragment').first()).toBeAttached({ timeout: 20_000 })

    // A2) reframed created the hidden realm iframe (name="wf:<id>").
    await expect(hostFrame.locator('iframe[name^="wf:"]').first()).toBeAttached({ timeout: 20_000 })

    // B) The fragment's DOM is reflected into a shadow root (real content, not empty).
    const shadowChildren = await hostFrame.locator('web-fragment').first().evaluate((el) => {
      const direct = (el as HTMLElement).shadowRoot
      const host = direct?.querySelector('web-fragment-host') as HTMLElement | null
      return host?.shadowRoot?.childElementCount ?? direct?.childElementCount ?? 0
    })
    expect(shadowChildren, 'fragment shadow root should have rendered content').toBeGreaterThan(0)

    // C) The fragment proxy booted in-realm (probe breadcrumb from any frame).
    await expect
      .poll(() => logs.some(l => l.includes('[wf-probe]')), { timeout: 20_000, message: '[wf-probe] breadcrumb never logged' })
      .toBe(true)

    // D) No console / page errors during boot.
    expect(errors, errors.join('\n')).toHaveLength(0)

    await page.screenshot({ path: 'e2e/fragment-poc.png', fullPage: true })
  })
})
