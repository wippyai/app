import type { ConsoleMessage, Page, Request, Response, TestInfo, WebSocket } from '@playwright/test'
import { test as base, expect } from '@playwright/test'

/**
 * Console and network capture for the tool approval specs. It keeps two things
 * for every page it watches:
 *
 *  - a full log (every console message, every HTTP response, every request
 *    that failed), which a test attaches as `console.log` and `network.log`;
 *  - a list of problems: a console error, an uncaught page error, a request
 *    that failed, or an HTTP response with status 400 or higher.
 *
 * The `capture` fixture below watches the test's own `page` from the start and
 * fails the test at its end when the list of problems is not empty. That is
 * scenario 19 of EE2-2713: no console errors and no network errors in any run.
 *
 * One kind of failed request is not a problem: `net::ERR_ABORTED`, which the
 * browser reports for a request that its own navigation cancelled (a reload in
 * the middle of a fetch). Everything else is, including a 404.
 *
 * A test can keep a narrow allowance for a known failure with `allow()` (in force
 * until the teardown check, whenever the line arrives) or remove an already
 * captured failure with `takeExpected()`.
 *
 * `reset()` drops what the capture holds so far. A test calls it once after
 * `loginAsAdmin`, because the facade's own requests before sign-in (and the
 * errors the login helper classifies) are not part of the scenario.
 */
export class Capture {
  private readonly problemList: string[] = []
  private readonly allowances: RegExp[] = []
  private readonly lookups: Promise<void>[] = []
  private readonly consoleLines: string[] = []
  private readonly networkLines: string[] = []

  /** Starts watching one page. Call it for every extra tab or context page. */
  watch(page: Page, label = 'page') {
    page.on('console', (message: ConsoleMessage) => {
      // The browser names the script or the resource a message belongs to. It is part of the
      // line, so an allowance can name the URL and not only the text.
      const source = message.location().url
      if (source || message.type() !== 'error') {
        this.recordConsole(label, message, source)
        return
      }
      // An error without a source (`console.error(text, error)` in a frame's own code): ask the
      // frame that logged it for its address, through the first argument's handle.
      const first = message.args()[0]
      const lookup = (first ? first.evaluate(() => location.href).catch(() => '') : Promise.resolve(''))
        .then(frame => this.recordConsole(label, message, frame))
      this.lookups.push(lookup)
    })
    page.on('pageerror', (error: Error) => {
      this.consoleLines.push(`[${label}] pageerror: ${error.message}`)
      this.problemList.push(`[${label}] page error: ${error.message}`)
    })
    page.on('response', (response: Response) => {
      const status = response.status()
      const request = `${response.request().method()} ${response.url()}`
      this.networkLines.push(`[${label}] ${status} ${request}`)
      if (status >= 400)
        this.problemList.push(`[${label}] HTTP ${status} ${request}`)
    })
    page.on('requestfailed', (request: Request) => {
      const failure = request.failure()?.errorText ?? 'unknown failure'
      // The frame that made the request is part of the line: a failure in the Host frame is not
      // the same as one in an isolated artifact frame (`about:srcdoc`).
      const frame = request.frame().url()
      this.networkLines.push(`[${label}] FAILED ${request.method()} ${request.url()} (${failure}) in frame ${frame}`)
      if (failure !== 'net::ERR_ABORTED')
        this.problemList.push(`[${label}] request failed: ${request.method()} ${request.url()} (${failure}) in frame ${frame}`)
    })
  }

  private recordConsole(label: string, message: ConsoleMessage, source: string) {
    const text = source ? `${message.text()} (at ${source})` : message.text()
    this.consoleLines.push(`[${label}] ${message.type()}: ${text}`)
    if (message.type() === 'error')
      this.problemList.push(`[${label}] console error: ${text}`)
  }

  /**
   * Resolves when every pending source lookup of a console error has put its line in the
   * capture, including lookups that start while it waits.
   */
  async idle() {
    let settled = -1
    while (settled !== this.lookups.length) {
      settled = this.lookups.length
      await Promise.all(this.lookups)
    }
  }

  /**
   * The problems so far, as one line each, without the ones an `allow()` pattern covers.
   * The teardown check of the `capture` fixture reads this list, so an allowed line that
   * arrives late (after the test body) is still covered.
   */
  problems(): string[] {
    return this.problemList.filter(problem => !this.allowances.some(pattern => pattern.test(problem)))
  }

  /**
   * Keeps a narrow allowance in force until the teardown check: a problem that matches any
   * of `patterns` does not fail the test, whenever it arrives. A test calls it for a known
   * failure that the scenario causes but that has no fixed time (a late console error of a
   * frame the Host owns). Every pattern must name the URL or the frame the line belongs to,
   * so a similar failure elsewhere still fails the test. The logs keep the lines. For a
   * failure the test asserts first, use `takeExpected`.
   */
  allow(...patterns: RegExp[]) {
    this.allowances.push(...patterns)
  }

  /**
   * Removes the problems captured so far that match any of `patterns` and returns them. A
   * test calls it for a failure that the scenario itself causes on purpose, after it has
   * checked that the failure happened. It does not cover a line that arrives later: use
   * `allow()` for that. The logs keep the lines.
   */
  takeExpected(...patterns: RegExp[]): string[] {
    const taken = this.problemList.filter(problem => patterns.some(pattern => pattern.test(problem)))
    for (const problem of taken)
      this.problemList.splice(this.problemList.indexOf(problem), 1)
    return taken
  }

  /** Forgets everything captured so far, problems and logs. */
  reset() {
    this.problemList.length = 0
    this.consoleLines.length = 0
    this.networkLines.length = 0
  }

  consoleLog(): string {
    return this.consoleLines.join('\n')
  }

  networkLog(): string {
    return this.networkLines.join('\n')
  }
}

/** Attaches the two logs to the test report. */
async function attachLogs(testInfo: TestInfo, capture: Capture) {
  await testInfo.attach('console.log', { body: capture.consoleLog() || '(no console messages)', contentType: 'text/plain' })
  await testInfo.attach('network.log', { body: capture.networkLog() || '(no requests)', contentType: 'text/plain' })
}

/**
 * `test` with an automatic `capture` fixture. Every test that imports this
 * `test` is checked for console and network errors when it ends, and gets the
 * two logs attached. A test that opens more pages calls `capture.watch(page)`
 * for each of them.
 */
export const test = base.extend<{ capture: Capture }>({
  capture: [async ({ page }, use, testInfo) => {
    const capture = new Capture()
    capture.watch(page)
    await use(capture)
    await capture.idle()
    await attachLogs(testInfo, capture)
    expect(capture.problems(), 'console errors, page errors, failed requests and HTTP errors').toEqual([])
  }, { auto: true }],
})

/** The text of every message a page's WebSockets sent, in order. */
export function recordSentFrames(page: Page): string[] {
  const sent: string[] = []
  page.on('websocket', (socket: WebSocket) => {
    socket.on('framesent', (frame) => {
      sent.push(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8'))
    })
  })
  return sent
}

export { expect } from '@playwright/test'
