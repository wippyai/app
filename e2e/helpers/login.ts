import type { ConsoleMessage, FrameLocator, Page, Response } from '@playwright/test'

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
 * Returns once the authenticated application shell is visible. Managed Web
 * Fragment layout may keep the outer URL at `/`, while other layouts redirect
 * to `/home`, so URL shape is not a portable authentication signal.
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

  const consoleSignals: string[] = []
  const failedResponses: string[] = []
  const onConsole = (message: ConsoleMessage) => {
    const text = message.text()
    if (text.startsWith('Facade initialization failed:'))
      consoleSignals.push('facade_initialization_failed')
    else if (text.startsWith('Wippy critical error:')) {
      consoleSignals.push('wippy_critical_error')
    }
    else if (text.startsWith('Failed to load extra script:'))
      consoleSignals.push('extra_script_failed')
    else if (message.type() === 'error')
      consoleSignals.push('unclassified_console_error')
  }
  const onResponse = (response: Response) => {
    if (response.status() < 400)
      return
    try {
      failedResponses.push(`${response.status()}:${new URL(response.url()).pathname}`)
    }
    catch {
      failedResponses.push(`${response.status()}:invalid-url`)
    }
  }
  page.on('console', onConsole)
  page.on('response', onResponse)

  await page.addInitScript(() => {
    const storageKey = '__wippy_e2e_bootstrap_classifications'
    const originalConsoleError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      if (args[0] === 'Wippy critical error:') {
        const candidate = args[1] as { name?: unknown, code?: unknown, issue?: { kind?: unknown } } | undefined
        const allowedNames = new Set([
          'AxiosError',
          'DOMException',
          'MountRouteConflictError',
          'ReferenceError',
          'SyntaxError',
          'TypeError',
        ])
        const allowedCodes = new Set([
          'ECONNABORTED',
          'ERR_BAD_REQUEST',
          'ERR_BAD_RESPONSE',
          'ERR_CANCELED',
          'ERR_NETWORK',
          'ETIMEDOUT',
        ])
        const allowedIssueKinds = new Set(['duplicate', 'syntax', 'system-conflict'])
        const name = typeof candidate?.name === 'string' && allowedNames.has(candidate.name)
          ? candidate.name
          : 'Other'
        const code = typeof candidate?.code === 'string' && allowedCodes.has(candidate.code)
          ? candidate.code
          : 'UNCLASSIFIED'
        const issueKind = typeof candidate?.issue?.kind === 'string'
          && allowedIssueKinds.has(candidate.issue.kind)
          ? candidate.issue.kind
          : undefined
        const classification = [name, code, issueKind].filter(Boolean).join(':')
        let existing: string[] = []
        try {
          const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')
          if (Array.isArray(parsed))
            existing = parsed.filter(value => typeof value === 'string')
        }
        catch {
          existing = []
        }
        sessionStorage.setItem(storageKey, JSON.stringify([...existing, classification].slice(-4)))
      }
      originalConsoleError(...args)
    }
  })

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  try {
    await page.locator('.managed-layout-shell, .wippy-host-app').first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })
  }
  catch (cause) {
    const browserState = await page.evaluate(() => {
      let tokenPresent = false
      const stored = localStorage.getItem('@wippy_token_info')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          tokenPresent = typeof parsed?.token === 'string' && parsed.token.length > 0
        }
        catch {
          tokenPresent = false
        }
      }
      return {
        bootstrapClassifications: (() => {
          try {
            const parsed = JSON.parse(sessionStorage.getItem('__wippy_e2e_bootstrap_classifications') ?? '[]')
            return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string').slice(-4) : []
          }
          catch {
            return []
          }
        })(),
        pathname: window.location.pathname,
        tokenPresent,
      }
    })
    const pageState = {
      ...browserState,
      consoleSignals: consoleSignals.slice(-8),
      failedResponses: failedResponses.slice(-8),
      hostIframeCount: await page.locator(HOST_IFRAME_SELECTOR).count(),
      loginFormVisible: await page.getByRole('form', { name: 'Sign in' }).isVisible().catch(() => false),
      loginErrorVisible: await page.locator('#error').isVisible().catch(() => false),
    }
    page.off('console', onConsole)
    page.off('response', onResponse)
    throw new Error(`Post-login application shell was not visible: ${JSON.stringify(pageState)}`, { cause })
  }
  page.off('console', onConsole)
  page.off('response', onResponse)
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
