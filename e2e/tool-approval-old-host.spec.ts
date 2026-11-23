import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from './helpers/capture'
import {
  AGENTS,
  allRanRows,
  cardFor,
  cards,
  CELL,
  cellSkipReason,
  decidedLines,
  expectRows,
  FIXTURES_ON,
  FIXTURES_SKIP_REASON,
  newTag,
  openToolApprovalChat,
  recordName,
  SEL,
  sendMessage,
  sessionCapabilities,
  sessionIdOf,
  TEXT,
} from './helpers/tool-approval'

/**
 * Tool approval, scenario 16 of EE2-2713: an old Web Host with a new Session.
 *
 * The app boots with the Session that has tool approval, and the facade points
 * at the last Host without approval support, Web Host 1.0.71 on the CDN:
 *
 *   -o wippy.facade:fe_facade_url:default=https://web-host.wippy.ai/webcomponents-1.0.71
 *
 * That Host never declares an approval surface, so the Session settles a gated
 * call at once as not run and sends a notice. The turn must not hang.
 *
 * Runs only with `TOOL_APPROVAL_CELL=old-host` (and `WIPPY_HOST_VERSION`, which
 * defaults to 1.0.71). See e2e/README.md.
 */

test.skip(!FIXTURES_ON, FIXTURES_SKIP_REASON)
test.skip(CELL !== 'old-host', cellSkipReason('old-host'))
test.describe.configure({ timeout: 90_000 })

const OLD_HOST_VERSION = process.env.WIPPY_HOST_VERSION ?? '1.0.71'

/** The Host stylesheets that the login page pins, by exact URL, read from the two files (paths from the repository root). */
const LOGIN_PAGE_PINS = new Set(['src/app/api/login.jet', 'static/login.html'].flatMap(file =>
  Array.from(readFileSync(resolve(__dirname, '..', file), 'utf8').matchAll(/href="(https:\/\/web-host\.wippy\.ai\/webcomponents-1\.0\.\d+\/[^"]+)"/g), match => match[1])))

test.describe('Tool approval, old Host cell', () => {
  test('16. old Host: a gated call shows the unavailable notice and the chat does not hang', async ({ page, capture }) => {
    // The cell is what it claims to be: only the old Host version loads from the CDN.
    // Every request of every frame counts, the top-level document included: the facade
    // shell loads `import-map.json` and `module.js` from the facade URL in the top frame.
    // The one exception is the set of stylesheets that the app's own login page pins to
    // the Host release the app was built for (src/app/api/login.jet, static/login.html).
    // They are skipped only as top-document requests with their exact URL, read from those
    // two files, so the same URL loaded by a Host frame still counts.
    expect(LOGIN_PAGE_PINS.size, 'the login page pins were read from the two files').toBeGreaterThan(0)
    const hostVersions = new Set<string>()
    page.on('request', (request) => {
      if (request.frame() === page.mainFrame() && LOGIN_PAGE_PINS.has(request.url()))
        return
      const match = request.url().match(/web-host\.wippy\.ai\/webcomponents-(1\.0\.\d+)/)
      if (match)
        hostVersions.add(match[1])
    })

    const tag = newTag()
    const scope = await openToolApprovalChat(page, capture, AGENTS.standard)
    // The Session is the new one: it declares the capability that the old Host ignores.
    expect((await sessionCapabilities(page)).tool_approval, 'GET /api/v1/sessions/capabilities').toBe(1)
    await expect.poll(() => Array.from(hostVersions), { message: `only Web Host ${OLD_HOST_VERSION} loads from the CDN` }).toEqual([OLD_HOST_VERSION])

    await sendMessage(scope, `approve one #${tag}`)

    // The Host shows the Session's notice text. It never shows a card, a decided line or a composer status.
    await expect(scope.getByText(TEXT.unavailableNotice)).toBeVisible({ timeout: 30_000 })
    await expect(cardFor(scope, recordName('rec', 1, tag))).toHaveCount(0)
    await expect(cards(scope)).toHaveCount(0)
    await expect(decidedLines(scope)).toHaveCount(0)
    await expect(scope.locator(SEL.composerStatus)).toHaveCount(0)
    await expect(scope.locator(SEL.grants)).toHaveCount(0)

    // No hang: the turn ended, Send is available again, and the call did not run.
    await expect(scope.locator(SEL.stop)).toBeHidden({ timeout: 20_000 })
    const textarea = scope.locator(SEL.textarea)
    await expect(textarea).toBeEnabled()
    await expect(textarea).toHaveAttribute('placeholder', TEXT.idlePlaceholder)
    const sessionId = await sessionIdOf(page)
    const rows = await expectRows(page, sessionId, 'the gated call is settled', current => current.length === 1 && current[0].metadata?.status !== 'pending')
    expect(allRanRows(rows)).toHaveLength(0)

    // The chat still works: a call that needs no approval runs and is answered.
    await sendMessage(scope, `lookup one #${tag}`)
    await expect(scope.getByText(`Looked up ${recordName('rec', 1, tag)}.`, { exact: true })).toBeVisible({ timeout: 20_000 })

    // Still only the old Host after the whole run, not only after the load.
    expect(Array.from(hostVersions), `only Web Host ${OLD_HOST_VERSION} loaded from the CDN during the test`).toEqual([OLD_HOST_VERSION])
  })
})
