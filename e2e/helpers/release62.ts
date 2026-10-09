import type { Page } from '@playwright/test'

/** Scoped asset substitution for the local, pre-publish release gates. */
export async function useLocalReleaseAssets(page: Page) {
  if (process.env.RELEASE62_LOCAL_ASSETS !== '1') return
  const localHost = process.env.RELEASE62_HOST_URL || 'http://localhost:5175'
  await page.route('https://web-host.wippy.ai/webcomponents-1.0.*/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/webcomponents-1\.0\.\d+/, '')
    const response = await route.fetch({ url: `${localHost}${path}` })
    await route.fulfill({ response })
  })
}
