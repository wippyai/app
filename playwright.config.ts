import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the app-template-raw e2e suite.
 *
 * Expects:
 *  - wippy server running on :8086 (or whatever `WIPPY_URL` is set to)
 *    See `make.ps1` / Makefile in this repo to build the FE bundles.
 *  - gen-2-chat dev server on :5173 (for the iframe-host UI). Run from
 *    `Projects/gen-2-chat` with `pnpm dev`.
 *
 * Auth: the suite uses the seeded admin credentials from `.env`
 * (`USERSPACE_USER_DEFAULT_ADMIN_EMAIL` / `_PASSWORD`). The `dotenv/config`
 * import above auto-loads `.env` from the cwd before defineConfig runs, so
 * the values land in `process.env` for the helpers in `e2e/helpers/login.ts`.
 */
const WIPPY_URL = process.env.WIPPY_URL || 'http://localhost:8086'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Wippy session is stateful; serialize for now.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: WIPPY_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
