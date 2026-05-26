import type { FrameLocator, Page } from '@playwright/test'

/** CSS selector for the outermost wippy host iframe (chat shell). */
export const HOST_IFRAME_SELECTOR = 'iframe[src*="iframe.html"]'

/** CSS selector for the iframe inside the default-theme iframe-demo artifact. */
export const DEMO_IFRAME_SELECTOR = 'w-artifact[id="app.views:iframe-demo"] iframe'

/** CSS selector for the iframe inside the configOverrides-themed artifact. */
export const THEMED_DEMO_IFRAME_SELECTOR = 'w-artifact[id="app.views:iframe-demo-themed"] iframe'

/** Chain into the iframe-demo's Vue app frame. */
export function getDemoFrame(page: Page): FrameLocator {
  return page.frameLocator(HOST_IFRAME_SELECTOR).frameLocator(DEMO_IFRAME_SELECTOR).first()
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
 * Helper: navigate inside the wippy host iframe to a sidebar tab by label.
 * The host UI lives in an iframe; sidebar entries may render as links OR
 * buttons depending on host build — `Locator.or()` handles either without
 * a count-then-branch race.
 */
export async function navigateHostTo(page: Page, label: string) {
  const hostFrame = page.frameLocator('iframe').first()
  await hostFrame
    .getByRole('button', { name: label, exact: true })
    .or(hostFrame.getByRole('link', { name: label, exact: true }))
    .first()
    .click()
}
