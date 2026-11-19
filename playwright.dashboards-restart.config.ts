import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config of the two-phase restart check of the dashboards (e2e/dashboards-restart.spec.ts).
 *
 * Needs, in the environment:
 *  - WIPPY_DASHBOARDS_RESTART_PHASE: `seed` before the runtime restart, `verify` after it;
 *  - WIPPY_DASHBOARDS_RESTART_STATE_FILE: an absolute path. The seed run creates it (it fails when
 *    the file exists, so a stale file cannot pass for a fresh seed) and the verify run reads it.
 * The runtime restart in between must keep `.wippy/app.db`.
 */
const phase = process.env.WIPPY_DASHBOARDS_RESTART_PHASE
if (phase !== 'seed' && phase !== 'verify')
  throw new Error('WIPPY_DASHBOARDS_RESTART_PHASE must be seed or verify')
if (!process.env.WIPPY_DASHBOARDS_RESTART_STATE_FILE)
  throw new Error('WIPPY_DASHBOARDS_RESTART_STATE_FILE must be an absolute path')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/dashboards-restart.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  outputDir: `test-results/dashboards-restart-${phase}`,
  use: {
    baseURL: process.env.WIPPY_URL || 'http://localhost:8086',
    trace: 'retain-on-failure',
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
