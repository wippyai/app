import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * The browser regression of the dashboards (RC2-12): the nine spec files of RC1 plus the spec files of
 * RC2, with no retry. `playwright.config.ts` allows one retry when `CI` is set, which would hide a
 * flaky test in a three-run proof, so this config sets `retries: 0` and records a trace for every
 * failure (the default `on-first-retry` records none without a retry).
 *
 * Run it from the repository root, against the running app (the default `http://localhost:8086`, or
 * `WIPPY_URL`):
 *
 *   npx playwright test -c playwright.regression.config.ts
 *
 * The same run without this file:
 *
 *   npx playwright test --retries=0 e2e/dashboards.spec.ts e2e/app-nav.spec.ts ...   (the RC1 files below)
 *
 * The restart test has two phases around a runtime restart and keeps its own config
 * (`playwright.dashboards-restart.config.ts`, which already has `retries: 0`). The LLM specs
 * (`dashboards-chat`, `dashboards-discovery`, `dashboards-eval`) are not listed: they need
 * `RUN_LLM_DEMO=1` and belong to the LLM campaign.
 */
const RC1_SPECS = [
  'dashboards',
  'app-nav',
  'dashboards-reads',
  'dashboards-plugins',
  'dashboards-layout',
  'dashboards-states',
  'dashboards-artifact',
  'dashboards-mappers',
  'dashboards-live',
]

/**
 * The new spec files of RC2 (names without `e2e/` and `.spec.ts`). Add each one when it lands.
 * `navigation-noise` needs no app and no browser: it proves the rule of the request watch.
 */
const RC2_SPECS: string[] = ['navigation-noise', 'dashboards-revisions']

export default defineConfig(base, {
  testMatch: [...RC1_SPECS, ...RC2_SPECS].map(name => `**/${name}.spec.ts`),
  retries: 0,
  use: {
    trace: 'retain-on-failure',
  },
})
