/**
 * End-to-end tests for the facade theming endpoints:
 *   GET /api/public/facade/variables.css  — CSS variables as a stylesheet
 *   GET /api/public/facade/config          — full config with resolved theming
 *
 * Tests verify that `fs://` references in the css_variables and custom_css
 * requirements are resolved to actual file content at request time, using the
 * `content_fs` filesystem entry.
 *
 * Config is declarative in src/app/deps/_index.yaml (the `facade` dependency):
 *   - name: content_fs      value: app:app_fs
 *   - name: custom_css      value: "fs://custom-css.facade.css"
 *   - name: css_variables   value: "fs://css-variables.facade.json"
 * The fixture files live in ./static alongside login.html (served at /app), so
 * content_fs (app:app_fs → ./static) resolves them — and the same files could
 * also be <link>ed by a static page (login.html doesn't today, but can).
 *
 * `fs://`, not `file://`: the wippy loader interpolates `file://` at LOAD time
 * (reads it relative to the _index.yaml dir), so a `file://` written in a YAML
 * requirement param never reaches the facade. Just start wippy normally:
 *   ./wippy.exe run -c -o app:gateway:addr=:8086 \
 *     -o wippy.facade:fe_facade_url:default=http://localhost:5173
 */
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

const CSS_VARS_PATH = '/api/public/facade/variables.css'
const CONFIG_PATH = '/api/public/facade/config'

test.describe('facade theming: fs:// resolution', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('GET /facade/variables.css generates CSS from file-backed css-variables.facade.json', async ({ page }) => {
    const res = await page.request.get(CSS_VARS_PATH)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/css')

    const css = await res.text()

    // Root block generated from flat string keys
    expect(css).toContain(':root')
    expect(css).toContain('--e2e-primary: #e2e001;')
    expect(css).toContain('--e2e-secondary: #e2e002;')

    // @media dark block from nested @dark object
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain('--e2e-primary: #e2e003;')
  })

  test('GET /facade/variables.css carries Cache-Control header', async ({ page }) => {
    const res = await page.request.get(CSS_VARS_PATH)
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('public')
    expect(res.headers()['cache-control']).toContain('max-age=3600')
  })

  test('GET /facade/config resolves fs:// custom_css to file content', async ({ page }) => {
    const res = await page.request.get(CONFIG_PATH)
    expect(res.status()).toBe(200)

    const config = await res.json()
    const customCSS: string | undefined = config?.theming?.global?.customCSS

    // Must be file content, not the raw "fs://custom-css.facade.css" string
    expect(customCSS).toBeTruthy()
    expect(customCSS).not.toContain('fs://')
    // Must contain marker text from custom-css.facade.css
    expect(customCSS).toContain('E2E Test Font')
  })

  test('GET /facade/config resolves fs:// css_variables to parsed JSON object', async ({ page }) => {
    const res = await page.request.get(CONFIG_PATH)
    expect(res.status()).toBe(200)

    const config = await res.json()
    const cssVars = config?.theming?.global?.cssVariables

    // Must be the decoded JSON object, not a raw string
    expect(cssVars).toBeTruthy()
    expect(typeof cssVars).toBe('object')
    expect(cssVars['--e2e-primary']).toBe('#e2e001')
    expect(cssVars['--e2e-secondary']).toBe('#e2e002')

    // @dark nested object must be preserved through JSON decode
    expect(cssVars['@dark']).toBeTruthy()
    expect(cssVars['@dark']['--e2e-primary']).toBe('#e2e003')
  })
})
