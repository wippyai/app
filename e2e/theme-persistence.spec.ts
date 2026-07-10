import { expect, test } from '@playwright/test'

/**
 * Theme persistence e2e (facade theme_persist = "cookie", key "@wippy-theme-mode").
 *
 * Covers the parts that don't need the Wippy host bundle:
 *  - the generated /facade/theme-persist.js script (key + mode baked in),
 *  - /facade/config exposing themePersist / themeStorageKey,
 *  - server-side cookie rendering (Jet shell "/" + Jet login) — no-flash class on <html>,
 *  - the static + Jet login theme switchers persisting the choice across reload.
 *
 * The host-switcher -> themeChanged -> persist path needs the local gen-2-chat
 * dev server (:5173); it's covered by the gen-2-chat unit/lint and the shared
 * cookie below (a choice made on login is read by the host on next load).
 *
 * Prereq: wippy backend running with the LOCAL facade replacement and
 * theme_persist: cookie (see src/app/deps/_index.yaml + wippy.lock).
 */

const KEY = '@wippy-theme-mode'

test.describe('facade theme-persist endpoint + config', () => {
  test('theme-persist.js is served with the configured key and mode', async ({ request }) => {
    const res = await request.get('/api/public/facade/theme-persist.js')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/javascript')
    const body = await res.text()
    expect(body).toContain(`var KEY = "${KEY}"`)
    expect(body).toContain('MODE = "cookie"')
    expect(body).toContain('window.wippyThemePersist')
  })

  test('config exposes themePersist + themeStorageKey', async ({ request }) => {
    const res = await request.get('/api/public/facade/config')
    expect(res.status()).toBe(200)
    const cfg = await res.json()
    expect(cfg.themePersist).toBe('cookie')
    expect(cfg.themeStorageKey).toBe(KEY)
  })
})

test.describe('server-side cookie rendering (no flash)', () => {
  test('shell "/" bakes the theme class onto <html> from the cookie', async ({ request }) => {
    const dark = await (await request.get('/', { headers: { Cookie: `${KEY}=dark` } })).text()
    expect(dark).toMatch(/<html[^>]*class="w-theme-dark"[^>]*style="color-scheme: dark;"/)

    const light = await (await request.get('/', { headers: { Cookie: `${KEY}=light` } })).text()
    expect(light).toMatch(/<html[^>]*class="w-theme-light"/)

    const none = await (await request.get('/')).text()
    expect(none).not.toContain('w-theme-dark')
    expect(none).not.toContain('w-theme-light')
  })

  test('Jet login (/login) bakes the theme class onto <html> from the cookie', async ({ request }) => {
    // Use the canonical /login/ (GET /login 307-redirects to it); the redirect
    // would otherwise drop the manually-set Cookie header in the request API.
    const dark = await (await request.get('/login/', { headers: { Cookie: `${KEY}=dark` } })).text()
    expect(dark).toMatch(/<html[^>]*class="w-theme-dark"/)
    expect(dark).toContain('id="login-form"') // the Jet login page, not the shell

    // No cookie → plain <html> tag (the switcher JS mentions w-theme-* strings,
    // so assert the opening tag specifically rather than the whole document).
    const none = await (await request.get('/login/')).text()
    expect(none).toContain('<html lang="en">')
  })
})

test.describe('login theme switchers persist the choice', () => {
  test('static login: switch to dark, reload, theme persists', async ({ page }) => {
    await page.goto('/app/login.html')
    await page.getByRole('button', { name: 'Dark', exact: true }).click()

    await expect(page.locator('html')).toHaveClass(/w-theme-dark/)
    const cookies = await page.context().cookies()
    expect(cookies.find(c => c.name === KEY)?.value).toBe('dark')

    await page.reload()
    // Applied before paint by theme-persist.js reading the cookie.
    await expect(page.locator('html')).toHaveClass(/w-theme-dark/)

    // switch back so the shared cookie doesn't leak into other specs
    await page.getByRole('button', { name: 'Auto', exact: true }).click()
  })

  test('Jet login: switch to light, reload, server renders it', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/w-theme-light/)

    await page.reload()
    // On reload the server reads the cookie and ships class="w-theme-light".
    await expect(page.locator('html')).toHaveClass(/w-theme-light/)

    await page.getByRole('button', { name: 'Auto', exact: true }).click()
  })
})
