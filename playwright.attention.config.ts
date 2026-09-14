import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

const WIPPY_URL = process.env.WIPPY_URL || 'http://127.0.0.1:8086'
const attentionMetricsFile = process.env.WIPPY_ATTENTION_METRICS_FILE

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/attention-tracer.spec.ts', '**/attention-agent.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: attentionMetricsFile
    ? [['list'], ['./e2e/attention-metrics-reporter.ts']]
    : 'list',
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: WIPPY_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'chromium-touch',
      grep: /trusted touch pointer/,
      use: { ...devices['Desktop Chrome'], hasTouch: true },
    },
  ],
})
