import type { FrameLocator, Page } from '@playwright/test'

/**
 * CSS selector for an outer wippy host iframe, for a build that wraps the
 * whole Web Host in `<iframe src="...iframe.html">`. Facade 0.6.41 (current)
 * instead mounts the Host as a top-level ESM module directly into the
 * page's own `#app` — no wrapper iframe at all; only child `view.page`
 * content gets its own (srcdoc) iframe (see managed-layout.spec.ts's
 * "Topology" note, and `getHostFrame` below, which detects which shape is
 * live instead of assuming one).
 */
export const HOST_IFRAME_SELECTOR = 'iframe[src*="iframe.html"]'

/**
 * CSS selector for the srcdoc iframe a routed view.page renders into
 * (w-page-iframe.vue names it `wippy:page:<registry id>`). Only matches a
 * page reached directly by its own route; the same page can also be
 * embedded as a nested `<w-artifact>` inside another app (e.g. the "main"
 * app's Iframe Theming tab embeds `app.views:iframe-demo`), which is a
 * different DOM shape this selector does not match.
 */
export function pageIframeSelector(registryId: string): string {
  return `iframe[name="wippy:page:${registryId}"]`
}

/** The srcdoc iframe `app.views:iframe-demo` renders into at its own route (`/demo`). */
export const DEMO_IFRAME_SELECTOR = pageIframeSelector('app.views:iframe-demo')

/** Same as `DEMO_IFRAME_SELECTOR`, for the themed variant (`/demo-themed`). */
export const THEMED_DEMO_IFRAME_SELECTOR = pageIframeSelector('app.views:iframe-demo-themed')

/**
 * Scope the Host chrome renders into: the outer iframe, for a build that
 * still wraps the Host (`HOST_IFRAME_SELECTOR`), or the top-level page
 * itself, for the current facade, which mounts the Host with no wrapper.
 * Checked at call time rather than hardcoded, so this keeps working if the
 * embedding changes again.
 */
export async function getHostFrame(page: Page): Promise<Page | FrameLocator> {
  const outer = page.locator(HOST_IFRAME_SELECTOR)
  return (await outer.count()) > 0 ? page.frameLocator(HOST_IFRAME_SELECTOR) : page
}

/**
 * Chain into the iframe-demo page's own srcdoc frame. Callers must navigate
 * to its route first (`page.goto('/demo')`) — it has no sidebar entry point
 * to click in the current build (see `navigateHostTo`).
 */
export async function getDemoFrame(page: Page): Promise<FrameLocator> {
  const host = await getHostFrame(page)
  return host.frameLocator(DEMO_IFRAME_SELECTOR).first()
}

/**
 * Sign in to the wippy host with the seeded admin credentials from `.env`.
 * Returns once the main app shell + iframe-host is visible at `/home`.
 *
 * `.env` is loaded by `playwright.config.ts` via `import 'dotenv/config'`. If
 * the env vars are missing we throw rather than silently substituting a
 * default — the silent fallback masked broken auth setups in early runs.
 */
export async function loginAsAdmin(page: Page) {
  const email = process.env.USERSPACE_USER_DEFAULT_ADMIN_EMAIL
  const password = process.env.USERSPACE_USER_DEFAULT_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Missing USERSPACE_USER_DEFAULT_ADMIN_EMAIL / _PASSWORD env vars. '
      + 'Copy app-template-raw/.env.example to .env and run the suite from '
      + 'the project root so playwright.config.ts (which imports '
      + '"dotenv/config") can load them.',
    )
  }

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/home/, { timeout: 15_000 })
}

/**
 * Click a Host chrome nav item by its accessible name, in whichever scope
 * the Host actually renders into (see `getHostFrame`). Sidebar entries may
 * render as links OR buttons depending on host build — `Locator.or()`
 * handles either without a count-then-branch race.
 *
 * Only useful for pages the Host's own sidebar links to. The current build
 * boots with the sidebar closed and the navbar hidden
 * (`layout--sidebar_closed layout--navbar_hidden`), so it renders no nav
 * items at all; a page without another way in (`app.views:iframe-demo`,
 * `app.views:session-forms-demo`) must be reached with `page.goto()` on its
 * registered mountRoute instead.
 */
export async function navigateHostTo(page: Page, label: string) {
  const host = await getHostFrame(page)
  await host
    .getByRole('button', { name: label, exact: true })
    .or(host.getByRole('link', { name: label, exact: true }))
    .first()
    .click()
}
