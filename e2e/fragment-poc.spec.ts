/**
 * Web Fragments PoC (EE2-2313).
 *
 * With FRAGMENT_MODE on in the Web Host, every iframe-destined view.page renders
 * as a <web-fragment> (reframed realm + shared DOM) served by the Lua fragment
 * gateway at /api/public/frag/{id}/..., instead of a srcdoc iframe.
 *
 * In compat mode the host direct-mounts into the facade-shell page (no host
 * iframe), so we inspect the main page. The reframed realm is a hidden iframe
 * named "wf:<id>"; the fragment DOM lives in the <web-fragment> shadow root.
 *
 * Prereqs (see EE2-2313 plan):
 *  - Backend: wippy.exe run -c -o app:gateway:addr=:8087 \
 *      -o wippy.facade:fe_facade_url:default=http://localhost:5173
 *    (wippy.lock replaces wippy/views with the local checkout).
 *  - Host bundle: pnpm exec vite --host --base=/   (on :5173)
 *  - Run: WIPPY_URL=http://localhost:8087 npx playwright test e2e/fragment-poc.spec.ts
 */
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

// Errors that occur on the pre-login facade shell (before auth) are expected.
const PRELOGIN_NOISE = /no token|Facade initialization failed/i

test.describe('Web Fragments PoC (EE2-2313)', () => {
  test('view.page renders as a <web-fragment> via the Lua gateway; proxy boots in-realm', async ({ page }) => {
    const logs: string[] = []
    const errors: string[] = []
    const apiResponses: string[] = []
    page.on('console', (m) => {
      logs.push(m.text())
      if (m.type() === 'error' && !PRELOGIN_NOISE.test(m.text()))
        errors.push(m.text())
    })
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
    page.on('response', (r) => {
      if (/\/api\/v1\//.test(r.url()))
        apiResponses.push(`${r.status()} ${r.url()}`)
    })

    await loginAsAdmin(page)

    // A) Rendered as a web-fragment (fragment mode), with reframed realm iframe.
    await expect(page.locator('web-fragment').first()).toBeAttached({ timeout: 20_000 })
    await expect(page.locator('iframe[name^="wf:"]').first()).toBeAttached({ timeout: 20_000 })

    // B) It is a web-fragment, NOT a legacy srcdoc iframe for this page.
    const srcdocForPage = await page.locator('iframe[srcdoc]').count()
    expect(srcdocForPage, 'no srcdoc iframe — page is delivered as a fragment').toBe(0)

    // C) The fragment proxy bootstrapped the Wippy API inside the realm.
    await expect
      .poll(() => logs.some(l => l.includes('[wf-probe]')), { timeout: 20_000, message: '[wf-probe] never logged' })
      .toBe(true)

    // D) The app SPA fully mounted its real UI into the fragment shadow root
    //    (not just its <wippy-loading> shell).
    await expect
      .poll(() => page.locator('web-fragment').first().evaluate((el) => {
        const host = (el as HTMLElement).shadowRoot?.querySelector('web-fragment-host') as HTMLElement | null
        const app = host?.shadowRoot?.querySelector('#app') as HTMLElement | null
        if (!app || app.querySelector('wippy-loading'))
          return ''
        return (app.innerText || '').replace(/\s+/g, ' ').trim()
      }), { timeout: 25_000, message: 'app SPA never mounted its real UI (still at loading shell)' })
      .toContain('Welcome to Wippy App')

    // E) No console / page errors during the fragment boot.
    expect(errors, errors.join('\n')).toHaveLength(0)

    // Informational (not gated): API traffic the fragment app produced.
    console.log('##API## ' + JSON.stringify(apiResponses.slice(0, 10)))

    await page.screenshot({ path: 'e2e/fragment-poc.png', fullPage: true })
  })
})
