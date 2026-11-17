import { readFileSync } from 'node:fs'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { loginAsAdmin } from './login'

/**
 * Shared by the dashboards and app-nav suites: a strict watch on every page a test opens, API
 * calls with the page's own token, seeded sign-ins, and in-shell navigation.
 */

/** One problem a page reported. `status` and `path` are set when it concerns one HTTP response. */
export interface Problem {
  text: string
  status?: number
  path?: string
}

/** A failure that a test causes on purpose: this status on a path that contains `path`. */
export interface ExpectedFailure {
  status: number
  path: string
}

interface Watch {
  name: string
  problems: Problem[]
  aborted: string[]
  expected: ExpectedFailure[]
}

const watches = new Map<Page, Watch>()
const contexts: BrowserContext[] = []

/** The path of a URL, or the input itself when it is not a URL. */
export function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  }
  catch {
    return url
  }
}

/**
 * Turns off the HTTP cache and records console errors, page errors, error responses and failed
 * requests from the page and all its frames. It runs before the page signs in, so sign-in problems
 * count too. `takeUnexpected` returns every problem that no test declared.
 */
export async function monitor(page: Page, name: string): Promise<void> {
  // Playwright turns off the HTTP cache of a page that routes its requests.
  await page.route('**/*', route => route.continue().catch(() => {}))
  const watch: Watch = { name, problems: [], aborted: [], expected: [] }
  page.on('console', (m) => {
    if (m.type() !== 'error')
      return
    const status = /status of (\d{3})/.exec(m.text())
    watch.problems.push({
      text: `console: ${m.text().slice(0, 200)} @ ${pathOf(m.location().url)}`,
      status: status ? Number(status[1]) : undefined,
      path: status ? pathOf(m.location().url) : undefined,
    })
  })
  page.on('pageerror', e => watch.problems.push({ text: `pageerror: ${e.message.slice(0, 200)}` }))
  page.on('response', (r) => {
    if (r.status() >= 400)
      watch.problems.push({ text: `http ${r.status()} ${r.request().method()} ${pathOf(r.url())}`, status: r.status(), path: pathOf(r.url()) })
  })
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText ?? ''
    const path = pathOf(r.url())
    const line = `${r.method()} ${path} ${reason}`
    // The one expected failure: a navigation (sign-in, a direct link) cancels the Host's own module
    // loads under /webcomponents-<version>/. Any other aborted request, such as a point read, an API
    // call or a tile bundle, is a problem.
    if (reason === 'net::ERR_ABORTED' && r.method() === 'GET' && /^\/webcomponents-[\d.]+\//.test(path))
      watch.aborted.push(line)
    else
      watch.problems.push({ text: `failed: ${line}` })
  })
  watches.set(page, watch)
}

/** Declares failures the test causes on purpose, such as a refused call. */
export function expectFailures(page: Page, ...failures: ExpectedFailure[]) {
  watches.get(page)?.expected.push(...failures)
}

/** A new signed-out browser context and page, monitored from the start. */
export async function newPage(browser: Browser, name: string, viewport = { width: 1400, height: 900 }): Promise<Page> {
  const context = await browser.newContext({ viewport })
  contexts.push(context)
  const page = await context.newPage()
  await monitor(page, name)
  return page
}

/**
 * Every problem of every watched page that no test declared, since the last call. Closes the
 * contexts that `newPage` opened. Call it in `afterEach` and expect an empty list.
 */
export async function takeUnexpected(): Promise<string[]> {
  const unexpected: string[] = []
  for (const watch of watches.values()) {
    if (watch.aborted.length > 0)
      console.log(`${watch.name} aborted`, JSON.stringify(watch.aborted))
    for (const p of watch.problems) {
      const allowed = p.status !== undefined && p.path !== undefined
        && watch.expected.some(e => e.status === p.status && p.path!.includes(e.path))
      if (!allowed)
        unexpected.push(`${watch.name}: ${p.text}`)
    }
  }
  watches.clear()
  for (const context of contexts.splice(0))
    await context.close()
  return unexpected
}

/** Reads a seeded test account's password from src/demo_seed/_index.yaml (local test values). */
export function seededPassword(email: string): string {
  const text = readFileSync('src/demo_seed/_index.yaml', 'utf8')
  const at = text.indexOf(`email: ${email}`)
  const m = at >= 0 ? text.slice(at).match(/password:\s*(\S+)/) : null
  if (!m)
    throw new Error(`no seeded password for ${email}`)
  return m[1].replace(/^["']|["']$/g, '')
}

/** Signs in through the form as a seeded account, reusing the admin helper's flow. */
export async function loginAs(page: Page, email: string) {
  const saved = [process.env.USERSPACE_USER_DEFAULT_ADMIN_EMAIL, process.env.USERSPACE_USER_DEFAULT_ADMIN_PASSWORD]
  process.env.USERSPACE_USER_DEFAULT_ADMIN_EMAIL = email
  process.env.USERSPACE_USER_DEFAULT_ADMIN_PASSWORD = seededPassword(email)
  try {
    await loginAsAdmin(page)
  }
  finally {
    // Assigning undefined would store the text "undefined", so delete an unset variable.
    restoreEnv('USERSPACE_USER_DEFAULT_ADMIN_EMAIL', saved[0])
    restoreEnv('USERSPACE_USER_DEFAULT_ADMIN_PASSWORD', saved[1])
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined)
    delete process.env[name]
  else
    process.env[name] = value
}

/** Calls the app API from a signed-in page with that page's token. */
export async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const token = JSON.parse(localStorage.getItem('@wippy_token_info') || 'null')?.token
    const r = await fetch(path, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: r.status, body: await r.text() }
  }, { method, path, body })
}

/** Navigate inside the running Host, because deep links can race the Host's start. */
export async function openInShell(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}
