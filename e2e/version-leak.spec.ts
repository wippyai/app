/**
 * EE2-2313 release gate (2E/2G) — no stale Web Host version on the wire.
 *
 * Boots through the full facade flow (login page → shell → host iframe → app)
 * against the DEPLOYED CDN host, capturing every request to the host CDN. The
 * release requires that ONLY the new host version loads — a hardcoded CDN <link>
 * (login.html / login.jet) or a stale facade `fe_facade_url` would leak an old
 * `webcomponents-1.0.x` and is caught here, not in production.
 *
 * Engine-agnostic: runs under both render_engine=fragment and =iframe.
 */
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

const EXPECTED = process.env.WIPPY_HOST_VERSION || '1.0.46'

test(`only webcomponents-${EXPECTED} loads over the wire`, async ({ page }) => {
  const seen = new Set<string>()
  const stale: string[] = []
  page.on('request', (r) => {
    const m = r.url().match(/web-host\.wippy\.ai\/webcomponents-(1\.0\.\d+)/)
    if (m) {
      seen.add(m[1])
      if (m[1] !== EXPECTED)
        stale.push(`${m[1]} ${r.url()}`)
    }
  })

  await loginAsAdmin(page)
  await page.goto('/home/users')
  // Let the host bundle + engine (fragment realm or srcdoc) + all its assets load.
  await page.waitForSelector('iframe', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(6000)

  expect(Array.from(seen), `the CDN host bundle (${EXPECTED}) was actually requested`).toContain(EXPECTED)
  expect(stale, `no stale host version on the wire; saw: ${stale.slice(0, 8).join(' | ')}`).toEqual([])
})
