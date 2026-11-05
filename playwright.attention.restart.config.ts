import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'
import {
  attentionRestartBrowser,
  attentionRestartPhase,
  attentionRestartStateFile,
} from './e2e/helpers/attention-restart'

const browser = attentionRestartBrowser()
const phase = attentionRestartPhase()
attentionRestartStateFile()

const deviceNames = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
} as const

export default defineConfig({
  testDir: './e2e',
  testMatch: `**/attention-restart-${phase}.spec.ts`,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  outputDir: `test-results/attention-restart-${phase}-${browser}`,
  use: {
    baseURL: process.env.WIPPY_URL || 'http://127.0.0.1:8086',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: browser,
      use: { ...devices[deviceNames[browser]] },
    },
  ],
})
