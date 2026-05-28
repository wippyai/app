/**
 * Runtime contract for `@wippy-fe/proxy` `installVueWarnSuppressor` in a
 * real Vite-built Vue app inside a wippy child iframe.
 */
import type { ConsoleMessage } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  DEMO_IFRAME_SELECTOR,
  HOST_IFRAME_SELECTOR,
  loginAsAdmin,
  navigateHostTo,
  THEMED_DEMO_IFRAME_SELECTOR,
} from './helpers/login'

const VUE_RESOLVE_RE = /\[Vue warn\]:\s*Failed to resolve component/i
const MARKER_KEY = '@wippy-fe/proxy/vue-warn-suppressor-installed'

// Funnel the bare specifier through a string so the e2e tsconfig doesn't
// try to resolve `@wippy-fe/proxy` against the e2e directory's
// node_modules — the real resolution happens via the iframe's importmap.
const PROXY_SPEC = '@wippy-fe/proxy'

// Per-route DOM signals — each route mounts a unique custom element.
// Reused by tests that traverse all routes.
const ROUTES: Array<{ tab: string, signal: string }> = [
  { tab: 'Chart', signal: 'example-chart-circle' },
  { tab: 'Counter', signal: 'example-counter-persist' },
  { tab: 'Mermaid', signal: 'example-mermaid' },
  { tab: 'Bridge', signal: '[data-testid="bridge-demo"]' },
]

test.describe('@wippy-fe/proxy installVueWarnSuppressor — runtime contract', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('no Vue resolve-component warnings during iframe-demo load + route traversal', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'warning' && VUE_RESOLVE_RE.test(m.text()))
        warnings.push(m.text())
    })

    await navigateHostTo(page, 'Iframe Demo')

    const hostFrame = page.frameLocator(HOST_IFRAME_SELECTOR)
    const demoFrame = hostFrame.frameLocator(DEMO_IFRAME_SELECTOR).first()

    for (const { tab, signal } of ROUTES) {
      await demoFrame.getByRole('link', { name: new RegExp(`^${tab}$`, 'i') }).click()
      await demoFrame.locator(signal).first().waitFor({ state: 'attached', timeout: 10_000 })
    }

    // One settle tick for any microtask-queued warnings.
    await page.waitForTimeout(100)

    expect(warnings, `Unexpected Vue resolve-component warnings:\n${warnings.join('\n')}`).toEqual([])
  })

  test('warnHandler is installed and idempotency marker is set', async ({ page }) => {
    await navigateHostTo(page, 'Iframe Demo')
    const demoFrame = page.frameLocator(HOST_IFRAME_SELECTOR).frameLocator(DEMO_IFRAME_SELECTOR).first()
    await demoFrame.locator('#app').waitFor({ state: 'attached' })

    const probe = await demoFrame.locator('#app').evaluate((el, markerKey) => {
      // Vue 3 stamps __vue_app__ on the mount-root element automatically.
      const vueApp = (el as HTMLElement & { __vue_app__?: { config?: Record<string | symbol, unknown> } }).__vue_app__
      return {
        hasHandler: typeof vueApp?.config?.warnHandler === 'function',
        hasMarker: vueApp?.config?.[Symbol.for(markerKey)] === true,
      }
    }, MARKER_KEY)

    expect(probe.hasHandler).toBe(true)
    expect(probe.hasMarker).toBe(true)
  })

  test('PascalCase typo passes through to console.warn (synthetic)', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'warning')
        warnings.push(m.text())
    })

    await navigateHostTo(page, 'Iframe Demo')
    const demoFrame = page.frameLocator(HOST_IFRAME_SELECTOR).frameLocator(DEMO_IFRAME_SELECTOR).first()
    await demoFrame.locator('#app').waitFor({ state: 'attached' })

    await demoFrame.locator('#app').evaluate((el) => {
      const vueApp = (el as HTMLElement & { __vue_app__?: { config?: { warnHandler?: (m: string, i: unknown, t: string) => void } } }).__vue_app__
      const handler = vueApp?.config?.warnHandler
      if (typeof handler !== 'function')
        throw new Error('warnHandler not installed')
      handler('Failed to resolve component: UsreCard', null, '   at <App>')
    })

    await expect.poll(() => warnings.some(w => /UsreCard/.test(w))).toBe(true)
  })

  test('second install is a true no-op (handler ref unchanged after re-invocation)', async ({ page }) => {
    await navigateHostTo(page, 'Iframe Demo')
    const demoFrame = page.frameLocator(HOST_IFRAME_SELECTOR).frameLocator(DEMO_IFRAME_SELECTOR).first()
    await demoFrame.locator('#app').waitFor({ state: 'attached' })

    const result = await demoFrame.locator('#app').evaluate(async (el, spec) => {
      const root = el as HTMLElement & { __vue_app__?: { config?: { warnHandler?: unknown } } }
      const vueApp = root.__vue_app__
      if (!vueApp?.config)
        throw new Error('Vue app not mounted on #app')
      const before = vueApp.config.warnHandler
      const proxy = await import(spec) as {
        installVueWarnSuppressor?: (app: { config: { warnHandler?: unknown } }) => void
      }
      if (typeof proxy.installVueWarnSuppressor !== 'function')
        throw new Error('installVueWarnSuppressor not exported from @wippy-fe/proxy')
      proxy.installVueWarnSuppressor(vueApp as { config: { warnHandler?: unknown } })
      const after = vueApp.config.warnHandler
      return {
        handlerStable: before === after,
        beforeIsFunction: typeof before === 'function',
        afterIsFunction: typeof after === 'function',
      }
    }, PROXY_SPEC)

    expect(result.beforeIsFunction).toBe(true)
    expect(result.afterIsFunction).toBe(true)
    expect(result.handlerStable).toBe(true)
  })

  test('exported marker constant equals the symbol planted on app.config', async ({ page }) => {
    await navigateHostTo(page, 'Iframe Demo')
    const demoFrame = page.frameLocator(HOST_IFRAME_SELECTOR).frameLocator(DEMO_IFRAME_SELECTOR).first()
    await demoFrame.locator('#app').waitFor({ state: 'attached' })

    const matches = await demoFrame.locator('#app').evaluate(async (el, spec) => {
      const root = el as HTMLElement & { __vue_app__?: { config?: Record<string | symbol, unknown> } }
      const proxy = await import(spec) as { VUE_WARN_SUPPRESSOR_INSTALLED_MARKER?: symbol }
      const exportedMarker = proxy.VUE_WARN_SUPPRESSOR_INSTALLED_MARKER
      if (!exportedMarker)
        throw new Error('VUE_WARN_SUPPRESSOR_INSTALLED_MARKER not exported')
      return root.__vue_app__?.config?.[exportedMarker] === true
    }, PROXY_SPEC)
    expect(matches).toBe(true)
  })

  test('coexistence: both side-by-side iframe-demos have independent suppressor markers', async ({ page }) => {
    // /home/iframe-demo mounts two <w-artifact> instances (default + themed).
    // Each is its own iframe → its own Vue app → its own marker.
    await navigateHostTo(page, 'Iframe Demo')
    const hostFrame = page.frameLocator(HOST_IFRAME_SELECTOR)
    const defaultDemo = hostFrame.frameLocator(DEMO_IFRAME_SELECTOR).first()
    const themedDemo = hostFrame.frameLocator(THEMED_DEMO_IFRAME_SELECTOR).first()

    await Promise.all([
      defaultDemo.locator('#app').waitFor({ state: 'attached', timeout: 15_000 }),
      themedDemo.locator('#app').waitFor({ state: 'attached', timeout: 15_000 }),
    ])

    const probe = (el: HTMLElement, markerKey: string) => {
      const vueApp = (el as HTMLElement & { __vue_app__?: { config?: Record<string | symbol, unknown> } }).__vue_app__
      return {
        hasMarker: vueApp?.config?.[Symbol.for(markerKey)] === true,
        hasHandler: typeof vueApp?.config?.warnHandler === 'function',
      }
    }
    const [d, t] = await Promise.all([
      defaultDemo.locator('#app').evaluate(probe, MARKER_KEY),
      themedDemo.locator('#app').evaluate(probe, MARKER_KEY),
    ])
    expect(d).toEqual({ hasMarker: true, hasHandler: true })
    expect(t).toEqual({ hasMarker: true, hasHandler: true })
  })

  test('Vue app instance is stable across route changes (no re-mount, no marker loss)', async ({ page }) => {
    // A routing regression that re-creates the app per route would silently
    // lose the suppressor on each new mount. Compare app identity before +
    // after a full traversal via evaluateHandle (preserves object identity
    // across evaluate calls per Playwright JSHandle contract).
    await navigateHostTo(page, 'Iframe Demo')
    const demoFrame = page.frameLocator(HOST_IFRAME_SELECTOR).frameLocator(DEMO_IFRAME_SELECTOR).first()
    await demoFrame.locator('#app').waitFor({ state: 'attached' })

    const beforeHandle = await demoFrame.locator('#app').evaluateHandle((el) => {
      return (el as HTMLElement & { __vue_app__?: object }).__vue_app__
    })

    for (const { tab, signal } of ROUTES) {
      await demoFrame.getByRole('link', { name: new RegExp(`^${tab}$`, 'i') }).click()
      await demoFrame.locator(signal).first().waitFor({ state: 'attached', timeout: 10_000 })
    }

    const stable = await demoFrame.locator('#app').evaluate((el, beforeApp) => {
      const after = (el as HTMLElement & { __vue_app__?: object }).__vue_app__
      return after === beforeApp && after !== undefined
    }, beforeHandle)
    expect(stable).toBe(true)
  })
})
