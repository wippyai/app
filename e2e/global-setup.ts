import type { FullConfig } from '@playwright/test'
import { chromium } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { api } from './helpers/page-watch'

/** Prepare the demo database before any spec, using the suite's normal admin sign-in. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL)
    throw new Error('Demo seed requires the Playwright baseURL')

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()
    await loginAsAdmin(page)
    for (const [path, field] of [
      ['/api/v1/demo/seed-users', 'users'],
      ['/api/v1/demo/seed-history', 'inserted'],
    ]) {
      const response = await api(page, 'POST', path, {})
      if (response.status !== 200)
        throw new Error(`Demo seed ${path} returned HTTP ${response.status}`)
      let body: Record<string, unknown>
      try {
        body = JSON.parse(response.body)
      }
      catch {
        throw new Error(`Demo seed ${path} did not return JSON`)
      }
      if (!body || typeof body !== 'object' || !Object.hasOwn(body, field))
        throw new Error(`Demo seed ${path} did not return ${field}`)
    }
  }
  finally {
    await browser.close()
  }
}
