/**
 * Web Fragments PoC — Phase-1 acceptance (EE2-2313).
 *
 * With FRAGMENT_MODE on in the Web Host, every iframe-destined view.page renders
 * as a <web-fragment> (reframed realm + shared DOM) served by the Lua fragment
 * gateway at /api/public/frag/{id}/..., instead of a srcdoc iframe.
 *
 * In compat mode the host direct-mounts into the facade-shell page (no host
 * iframe), so we inspect the main page. The reframed realm is a hidden iframe
 * named "wf:<id>"; the fragment DOM lives in the <web-fragment> shadow root.
 * All three (the <web-fragment>, its shadow root, the hidden realm iframe) are
 * same-origin here, so page.evaluate can reach into every layer.
 *
 * This test asserts the full plan checklist A–G in one boot:
 *   A rendered as a fragment (not srcdoc)     E JS isolation (host ↔ realm)
 *   B API + real content                       F real URL routing + back
 *   C WebSocket round-trip (send→server→recv)  G no console/page errors
 *   D theming (full-height layout, dark-in-shadow on boot AND at runtime)
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
  test('A–G: fragment renders with API, WS, theming, routing, isolation', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !PRELOGIN_NOISE.test(m.text()))
        errors.push(m.text())
    })
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))

    await loginAsAdmin(page)

    // ── A) Rendered as a web-fragment with a reframed realm, NOT a srcdoc iframe.
    await expect(page.locator('web-fragment').first()).toBeAttached({ timeout: 20_000 })
    await expect(page.locator('iframe[name^="wf:"]').first()).toBeAttached({ timeout: 20_000 })
    expect(await page.locator('iframe[srcdoc]').count(), 'no srcdoc iframe — page is a fragment').toBe(0)

    // ── B) The app SPA fully mounted its real UI (not just the <wippy-loading> shell).
    await expect
      .poll(() => page.locator('web-fragment').first().evaluate((el) => {
        const host = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot?.querySelector('web-fragment-host') as (Element & { shadowRoot: ShadowRoot | null }) | null
        const app = host?.shadowRoot?.querySelector('#app') as HTMLElement | null
        if (!app || app.querySelector('wippy-loading'))
          return ''
        return (app.innerText || '').replace(/\s+/g, ' ').trim()
      }), { timeout: 25_000, message: 'app SPA never mounted its real UI' })
      .toContain('Welcome to Wippy App')

    // ── D.1) Theming — full-height layout (the reframed element tree defaults to
    // no size; the app must fill the <web-fragment>, not collapse to content).
    const layout = await page.locator('web-fragment').first().evaluate((el) => {
      const wfH = (el as HTMLElement).getBoundingClientRect().height
      const host = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot?.querySelector('web-fragment-host') as (Element & { shadowRoot: ShadowRoot | null }) | null
      const app = host?.shadowRoot?.querySelector('#app') as HTMLElement | null
      return { wfH, appH: app ? app.getBoundingClientRect().height : 0 }
    })
    expect(layout.wfH, 'fragment has a real (non-zero) height').toBeGreaterThan(400)
    expect(layout.appH, 'app fills the fragment height — no vertical collapse').toBeGreaterThan(layout.wfH * 0.9)

    // ── D.2) Theming — the reflected <wf-html> theme class matches the resolved
    // config themeMode on boot. This is the invariant the boot-race fix restores:
    // reframed streams the app <html> in after the proxy boots, wiping a class set
    // during boot, so without the re-apply the app renders the wrong mode.
    const boot = await page.evaluate(() => {
      const realmWin = (document.querySelector('iframe[name^="wf:"]') as HTMLIFrameElement).contentWindow as unknown as { __WIPPY_APP_CONFIG__?: { themeMode?: string } }
      const hsr = (document.querySelector('web-fragment') as Element & { shadowRoot: ShadowRoot }).shadowRoot.querySelector('web-fragment-host') as Element & { shadowRoot: ShadowRoot }
      const wfhtml = hsr.shadowRoot.querySelector('wf-html') as HTMLElement | null
      return { mode: realmWin.__WIPPY_APP_CONFIG__?.themeMode, wfClass: wfhtml?.className ?? '' }
    })
    if (boot.mode === 'dark')
      expect(boot.wfClass, 'dark config → wf-html.w-theme-dark on boot').toContain('w-theme-dark')
    else if (boot.mode === 'light')
      expect(boot.wfClass, 'light config → wf-html.w-theme-light on boot').toContain('w-theme-light')

    // ── D.3) Theming — toggling dark at runtime flips the class inside the shadow
    // (guards the `:root.w-theme-dark`-in-shadow gotcha: the class must land on
    // wf-html, an ancestor of the app content, for the `.w-theme-dark` token rules
    // and Tailwind `dark:` utilities to match).
    const toggled = await page.locator('web-fragment').first().evaluate((el) => {
      const hsr = ((el as Element & { shadowRoot: ShadowRoot }).shadowRoot.querySelector('web-fragment-host') as Element & { shadowRoot: ShadowRoot }).shadowRoot
      const btn = [...hsr.querySelectorAll('button,[role=radio],label')].find(b => /^dark$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim())) as HTMLElement | undefined
      btn?.click()
      return !!btn
    })
    expect(toggled, 'dark theme toggle present in the fragment UI').toBe(true)
    // Generous timeout: the toggle round-trips app → host → @theme → proxy, which
    // can be slow on the suite's first test while vite compiles modules cold.
    await expect
      .poll(() => page.locator('web-fragment').first().evaluate((el) => {
        const hsr = ((el as Element & { shadowRoot: ShadowRoot }).shadowRoot.querySelector('web-fragment-host') as Element & { shadowRoot: ShadowRoot }).shadowRoot
        return (hsr.querySelector('wf-html') as HTMLElement | null)?.className ?? ''
      }), { timeout: 15_000, message: 'runtime dark toggle applies inside the shadow' })
      .toContain('w-theme-dark')

    // ── C) WebSocket round-trip through the fragment bridge: a command sent via
    // the realm's $W.ws reaches the server (same-origin relay to the host WS) and
    // the server's response is delivered back into the realm via on('@message').
    const wsResponse = await page.evaluate(async () => {
      const realmWin = (document.querySelector('iframe[name^="wf:"]') as HTMLIFrameElement).contentWindow as unknown as { $W: { on: () => Promise<(topic: string, cb: (m: unknown) => void) => void>, ws: () => Promise<{ send: (c: unknown) => void }> } }
      const on = await realmWin.$W.on()
      const ws = await realmWin.$W.ws()
      let received: unknown = null
      on('@message', (m) => { received ??= m })
      ws.send({ type: '__wf_e2e_probe__' })
      const start = Date.now()
      while (!received && Date.now() - start < 10000)
        await new Promise(r => setTimeout(r, 100))
      return received ? JSON.stringify(received).slice(0, 200) : null
    })
    expect(wsResponse, 'WS: send reached the server and a response event returned to the realm').toBeTruthy()

    // ── E) JS isolation — host globals are invisible in the realm and vice-versa;
    // the realm has its own $W (the fragment proxy), the host does not.
    const iso = await page.evaluate(() => {
      const realmWin = (document.querySelector('iframe[name^="wf:"]') as HTMLIFrameElement).contentWindow as unknown as Record<string, unknown>
      ;(window as unknown as Record<string, unknown>).__wfHostMarker = 'H'
      realmWin.__wfRealmMarker = 'R'
      return {
        hostInRealm: String(realmWin.__wfHostMarker),
        realmOnHost: String((window as unknown as Record<string, unknown>).__wfRealmMarker),
        realmHasW: typeof realmWin.$W,
        hostHasW: typeof (window as unknown as Record<string, unknown>).$W,
      }
    })
    expect(iso.hostInRealm, 'host global not visible in the realm').toBe('undefined')
    expect(iso.realmOnHost, 'realm global not leaked to the host').toBe('undefined')
    expect(iso.realmHasW, 'realm has its own $W').toBe('object')
    expect(iso.hostHasW, 'host has no child $W').toBe('undefined')

    // ── F) Real URL routing — a child nav syncs the host history (the srcdoc
    // routing dead-end is solved by reframed); browser back reverts the fragment.
    const pathBefore = new URL(page.url()).pathname
    await page.locator('web-fragment').first().evaluate((el) => {
      const hsr = ((el as Element & { shadowRoot: ShadowRoot }).shadowRoot.querySelector('web-fragment-host') as Element & { shadowRoot: ShadowRoot }).shadowRoot
      const link = [...hsr.querySelectorAll('a,button')].find(a => /^users$/i.test((a.textContent || '').trim())) as HTMLElement | undefined
      link?.click()
    })
    await expect
      .poll(() => new URL(page.url()).pathname, { message: 'child route synced to host URL' })
      .toContain('/users')
    await page.goBack()
    await expect
      .poll(() => new URL(page.url()).pathname, { message: 'browser back reverts the fragment route' })
      .toBe(pathBefore)

    // ── G) No console / page errors across the whole flow.
    expect(errors, errors.join('\n')).toHaveLength(0)

    await page.screenshot({ path: 'e2e/fragment-poc.png', fullPage: true })
  })

  test('H-I: host CSS survives the reframed stream + nested <w-artifact> embeds render', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !PRELOGIN_NOISE.test(m.text()))
        errors.push(m.text())
    })
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))

    await loginAsAdmin(page)
    await expect(page.locator('web-fragment').first()).toBeAttached({ timeout: 20_000 })

    // ── H) The four host stylesheets the app INHERITS (theme-config tokens+fonts,
    // primevue = Tailwind utilities + PrimeVue CSS, iframe, markdown) survive the
    // reframed stream — reflected into the shadow — AND the token layer resolves.
    // Guards the regression where they were injected into the stub head then wiped.
    await expect
      .poll(() => page.locator('web-fragment').first().evaluate((el) => {
        const hsr = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot?.querySelector('web-fragment-host') as (Element & { shadowRoot: ShadowRoot | null }) | null
        const inner = hsr?.shadowRoot
        if (!inner)
          return false
        const roles = ['theme-config', 'iframe', 'primevue', 'markdown']
        const allPresent = roles.every(r => !!inner.querySelector(`link[data-role="wippy-host-styles-${r}"]`))
        const app = inner.querySelector('#app') as HTMLElement | null
        const primary = app ? getComputedStyle(app).getPropertyValue('--p-primary').trim() : ''
        return allPresent && primary.length > 0
      }), { timeout: 20_000, message: 'all four host CSS links reflected in shadow + --p-primary resolves' })
      .toBe(true)

    // ── I) Nested <w-artifact> embeds render inside the realm. "Nested Nav" embeds
    // the iframe-demo view.page as a nav-owner; without <w-artifact>/<w-iframe>
    // registered in the fragment proxy the panel was blank.
    await page.locator('web-fragment').first().evaluate((el) => {
      const inner = ((el as Element & { shadowRoot: ShadowRoot }).shadowRoot.querySelector('web-fragment-host') as Element & { shadowRoot: ShadowRoot }).shadowRoot
      const link = [...inner.querySelectorAll('a,button,[role=link]')].find(a => /nested\s*nav/i.test((a.textContent || '').trim())) as HTMLElement | undefined
      link?.click()
    })
    await expect
      .poll(() => page.locator('web-fragment').first().evaluate((el) => {
        const inner = ((el as Element & { shadowRoot: ShadowRoot }).shadowRoot.querySelector('web-fragment-host') as Element & { shadowRoot: ShadowRoot }).shadowRoot
        const wa = inner.querySelector('#app w-artifact') as (Element & { shadowRoot: ShadowRoot | null }) | null
        const wiframe = wa?.shadowRoot?.querySelector('w-iframe') as (Element & { shadowRoot: ShadowRoot | null }) | null
        const nested = wiframe?.shadowRoot?.querySelector('iframe') as HTMLIFrameElement | null
        if (!nested)
          return ''
        try {
          const body = nested.contentDocument?.body
          return body ? (body.innerText || '').replace(/\s+/g, ' ').trim() : ''
        }
        catch {
          return ''
        }
      }), { timeout: 20_000, message: 'nested <w-artifact> iframe renders real content in the realm' })
      .toContain('Iframe Demo')

    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})
