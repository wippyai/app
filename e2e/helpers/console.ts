import type { Page } from '@playwright/test'

/**
 * Collects console errors and uncaught page errors from now on. Console
 * messages that match `ignore` are skipped. Clear the returned array with
 * `errors.length = 0` to drop earlier noise, such as the facade's errors
 * before login.
 */
export function collectConsoleErrors(page: Page, ignore?: RegExp): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignore?.test(message.text()))
      errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  return errors
}
