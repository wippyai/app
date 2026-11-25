import { readFileSync } from 'node:fs'
import type { Browser, BrowserContext, Frame, Page, Request } from '@playwright/test'
import { loginAsAdmin } from './login'
import type { FrameEvents } from './navigation-noise'
import { cancelledByNavigation } from './navigation-noise'

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
  /** Set both `status` and `path` for an HTTP failure, or only `text` for a console message that has no status. */
  status?: number
  path?: string
  /** A console or page message that contains this text. */
  text?: string
}

/** An aborted request of a Host module bundle, decided when the test ends (see `takeUnexpected`). */
interface Cancelled {
  line: string
  frame: Frame | undefined
  startedAt: number
  failedAt: number
}

interface Watch extends FrameEvents<Frame> {
  name: string
  problems: Problem[]
  aborted: string[]
  cancelled: Cancelled[]
  expected: ExpectedFailure[]
}

/** The page function that every new document of every frame calls (see `monitor`). */
const DOCUMENT_BINDING = '__wippyWatchDocumentStarted'

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
  const watch: Watch = { name, problems: [], aborted: [], cancelled: [], documents: new Map(), detached: new Map(), expected: [] }
  const startedAt = new WeakMap<Request, number>()
  page.on('request', r => startedAt.set(r, Date.now()))
  page.on('framedetached', f => watch.detached.set(f, Date.now()))
  // A new document in a frame. Playwright's `framenavigated` also fires for a history change inside
  // one document, which cancels nothing, so it is not used. An init script runs once for each new
  // document of each frame (also a srcdoc iframe) and never for a history change.
  await page.exposeBinding(DOCUMENT_BINDING, (source) => {
    watch.documents.set(source.frame, [...(watch.documents.get(source.frame) ?? []), Date.now()])
  })
  await page.addInitScript((binding) => {
    const call = (window as unknown as Record<string, unknown>)[binding]
    if (typeof call === 'function')
      void (call as () => Promise<void>)()
  }, DOCUMENT_BINDING)
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
    // The expected failures: a navigation (sign-in, a direct link) cancels the Host's own loads, its
    // modules under /webcomponents-<version>/ and, since Host 1.0.69, its Iconify icon sets at the
    // site root (/tabler.json). This app serves no such file, so that request gets the app's HTML;
    // a cancelled one is still the Host's, not the app's. The module bundles that the Host loads from
    // a module's static files (/@static-<org>/<module>/..., such as the mermaid renderer) are
    // cancelled the same way, but only when the frame that asked for one got a new document or was
    // removed while it loaded (a history change inside one document is not that). That is decided
    // when the test ends, because the new document can report after the abort. Any other aborted
    // request, such as a point read, an API call or a tile bundle, is a problem.
    const hostLoad = /^\/webcomponents-[\d.]+\//.test(path) || /^\/[a-z0-9-]+\.json$/.test(path)
    const hostModule = /^\/@static-[a-z0-9-]+\/[^/]+\//.test(path)
    if (reason === 'net::ERR_ABORTED' && r.method() === 'GET' && hostLoad) {
      watch.aborted.push(line)
    }
    else if (reason === 'net::ERR_ABORTED' && r.method() === 'GET' && hostModule) {
      let frame: Frame | undefined
      try {
        frame = r.frame()
      }
      catch {
        frame = undefined
      }
      watch.cancelled.push({ line, frame, startedAt: startedAt.get(r) ?? 0, failedAt: Date.now() })
    }
    else {
      watch.problems.push({ text: `failed: ${line}` })
    }
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
    for (const c of watch.cancelled) {
      if (cancelledByNavigation(watch, c))
        watch.aborted.push(c.line)
      else
        watch.problems.push({ text: `failed: ${c.line}` })
    }
    if (watch.aborted.length > 0)
      console.log(`${watch.name} aborted`, JSON.stringify(watch.aborted))
    for (const p of watch.problems) {
      const allowed = watch.expected.some(e => e.text !== undefined && p.text.includes(e.text))
        || (p.status !== undefined && p.path !== undefined
        && watch.expected.some(e => e.status !== undefined && e.path !== undefined && e.status === p.status && p.path!.includes(e.path)))
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

/**
 * Navigate inside the running Host, because deep links can race the Host's start. With `dashboardPageId`, the
 * navigation is sent again while that page's frame is not attached.
 */
export async function openInShell(page: Page, path: string, dashboardPageId?: string) {
  const navigate = () => page.evaluate((p) => {
    history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  if (!dashboardPageId) {
    await navigate()
    return
  }
  // Right after sign-in the Host can still be starting, and a navigation sent then is lost (the shell stays on
  // Home). Send it again while the page frame is not attached: a lost navigation mounted nothing and read nothing,
  // so repeating it changes no count a test checks. The caller's own assertions report a final failure.
  const frame = page.locator(`iframe[name="wippy:page:wippy.dashboards.pages:${dashboardPageId}"]`)
  for (let attempt = 0; attempt < 4; attempt++) {
    await navigate()
    try {
      await frame.waitFor({ state: 'attached', timeout: 5000 })
      return
    }
    catch {}
  }
}
