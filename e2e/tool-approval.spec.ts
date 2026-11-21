import type { Page } from '@playwright/test'
import type { Capture } from './helpers/capture'
import { expect, test } from './helpers/capture'
import { loginAsAdmin, pageIframeSelector } from './helpers/login'
import {
  action,
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
  ranRows,
  recordName,
  SEL,
  sendMessage,
  sessionCapabilities,
  sessionIdOf,
  settle,
  TEXT,
  TOOL_TITLE,
} from './helpers/tool-approval'

/**
 * Tool approval end-to-end checks (EE2-2713, scenarios 1 to 15 and 19). They
 * drive the scripted fixture agents of src/app/tool_approval_demo through the
 * facade flow: login, shell, Host chat. They never open the Host dev server
 * directly. The numbers in the test names are the scenarios of tickets 1.6.
 *
 * Needs the `current` cell: a Session with tool approval, the local Host build
 * and the fixtures profile (see e2e/README.md). Scenario 16 (old Host) and 17
 * (old Session) are in their own files, and scenario 18 is one manual run.
 *
 * Every test is checked for console and network errors when it ends, and gets
 * `console.log` and `network.log` attached (helpers/capture.ts). That is
 * scenario 19.
 */

test.skip(!FIXTURES_ON, FIXTURES_SKIP_REASON)
test.skip(CELL !== 'current', cellSkipReason('current'))
test.describe.configure({ timeout: 90_000 })

/** Starts a chat with a fixture agent, sends the phrase, and returns what a test needs. */
async function converse(page: Page, capture: Capture, agent: string, phrase: string) {
  const tag = newTag()
  const scope = await openToolApprovalChat(page, capture, agent)
  await sendMessage(scope, `${phrase} #${tag}`)
  return { tag, scope }
}

test.describe('Tool approval, current cell', () => {
  test('cell check: the Session declares tool_approval 1', async ({ page }) => {
    await loginAsAdmin(page)
    const capabilities = await sessionCapabilities(page)
    expect(capabilities.tool_approval, 'GET /api/v1/sessions/capabilities').toBe(1)
  })

  test('1. approve: the card shows Approved, the tool runs once, the assistant replies', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
    const record = recordName('rec', 1, tag)
    const card = cardFor(scope, record)
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card).toContainText(`Run ${TOOL_TITLE.delete}`)
    const sessionId = await sessionIdOf(page)
    // The call waits: nothing ran yet.
    expect(allRanRows(await expectRows(page, sessionId, 'the call row is stored', rows => rows.length === 1))).toHaveLength(0)

    await settle(card)
    await action(card, 'approve').click()

    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.approved)
    await expect(scope.getByText(`Done: delete_record ${record} ran.`, { exact: true })).toBeVisible({ timeout: 20_000 })
    const rows = await expectRows(page, sessionId, 'the tool ran once', current => ranRows(current, 'delete_record').length === 1)
    expect(allRanRows(rows)).toHaveLength(1)
  })

  test('2. Approve all with scope batch: one click approves three calls, the next step asks again', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.batch, 'approve three')
    const first = cardFor(scope, recordName('rec', 1, tag))
    await expect(first).toBeVisible({ timeout: 20_000 })
    for (const number of [1, 2, 3])
      await expect(cardFor(scope, recordName('rec', number, tag))).toBeVisible()
    await settle(first)
    await expect(action(first, 'approve_all')).toContainText(TEXT.approveAllBatch(3))

    await action(first, 'approve_all').click()

    // One decision, three decided lines. No grant: nothing in the chat lists one.
    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText([TEXT.approvedAll, TEXT.approvedAll, TEXT.approvedAll])
    await expect(scope.locator(SEL.grants)).toHaveCount(0)
    const sessionId = await sessionIdOf(page)
    await expectRows(page, sessionId, 'the three calls ran', rows => ranRows(rows, 'delete_record').length === 3)

    // The next step is a new request: it has its own pending card.
    const next = cardFor(scope, recordName('rec', 4, tag))
    await expect(next).toBeVisible({ timeout: 20_000 })
    expect(ranRows(await expectRows(page, sessionId, 'the fourth call waits', rows => rows.length === 4), 'delete_record')).toHaveLength(3)
    await settle(next)
    await action(next, 'approve').click()
    await expect(scope.getByText('Batch finished.', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expectRows(page, sessionId, 'the fourth call ran after its own approval', rows => ranRows(rows, 'delete_record').length === 4)
  })

  test('3. Approve all with scope tool: the next call runs without a card and shows Auto-approved, Revoke makes the next call ask again', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'grant tool')
    const first = cardFor(scope, recordName('inv', 1, tag))
    await expect(first).toBeVisible({ timeout: 20_000 })
    await settle(first)
    await expect(action(first, 'approve_all')).toContainText(TEXT.approveAllTool)
    await action(first, 'approve_all').click()

    // The second call of the tool runs at once: no card, the mark on its chip.
    await expect(scope.getByText('Invoices finished.', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(cardFor(scope, recordName('inv', 2, tag))).toHaveCount(0)
    await expect(scope.locator(SEL.autoApproved)).toHaveText(TEXT.autoApproved)
    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.allowedTool(TOOL_TITLE.invoice))
    const sessionId = await sessionIdOf(page)
    await expectRows(page, sessionId, 'both invoices ran', rows => ranRows(rows, 'send_invoice').length === 2)

    // The grants chip lists the grant. Revoke removes it, from committed server data.
    const chip = scope.locator(SEL.grantsChip)
    await expect(chip).toContainText(TEXT.grantsChip(TOOL_TITLE.invoice))
    await chip.click()
    await expect(scope.locator(SEL.grantItem)).toHaveCount(1)
    await scope.locator(SEL.grantRevoke).click()
    await expect(scope.locator(SEL.grants)).toHaveCount(0)

    // After the revoke the same tool asks again.
    await sendMessage(scope, `grant tool again #${tag}`)
    const again = cardFor(scope, recordName('inv', 3, tag))
    await expect(again).toBeVisible({ timeout: 20_000 })
    await settle(again)
    await action(again, 'approve').click()
    await expect(scope.getByText('Invoice finished.', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expectRows(page, sessionId, 'the third invoice ran after its own approval', rows => ranRows(rows, 'send_invoice').length === 3)
  })

  test('4. Approve all with scope session (second agent): later calls run without cards, except the tool that opts out', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.session, 'grant session')
    const first = cardFor(scope, recordName('rec', 1, tag))
    await expect(first).toBeVisible({ timeout: 20_000 })
    await settle(first)
    await expect(action(first, 'approve_all')).toContainText(TEXT.approveAllSession)
    await action(first, 'approve_all').click()
    await expect(decidedLines(scope).locator(SEL.decidedDecision).first()).toHaveText(TEXT.allowedSession)

    // The second step has two marked calls. The session grant covers both: no cards.
    const sessionId = await sessionIdOf(page)
    await expectRows(page, sessionId, 'the grant-approved calls ran', rows => ranRows(rows, 'delete_record').length === 2 && ranRows(rows, 'send_invoice').length === 1)
    await expect(cardFor(scope, recordName('rec', 2, tag))).toHaveCount(0)
    await expect(cardFor(scope, recordName('inv', 2, tag))).toHaveCount(0)
    await expect(scope.locator(SEL.autoApproved)).toHaveText([TEXT.autoApproved, TEXT.autoApproved])

    // The third step is Wire funds, which never offers Approve all: it still asks.
    const wire = cardFor(scope, recordName('acc', 1, tag))
    await expect(wire).toBeVisible({ timeout: 20_000 })
    await settle(wire)
    await expect(action(wire, 'approve')).toBeVisible()
    await expect(action(wire, 'approve_all')).toHaveCount(0)
    await action(wire, 'approve').click()
    await expect(scope.getByText('Session grant checked.', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expectRows(page, sessionId, 'Wire funds ran after its own approval', rows => ranRows(rows, 'wire_funds').length === 1)
  })

  test('5. Stop denial: nothing in the batch runs and the assistant stops', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'stop denial')
    const deleteCard = cardFor(scope, recordName('rec', 1, tag))
    const invoiceCard = cardFor(scope, recordName('inv', 1, tag))
    await expect(deleteCard).toBeVisible({ timeout: 20_000 })
    await expect(invoiceCard).toBeVisible()
    await settle(invoiceCard)
    await action(invoiceCard, 'approve').click()
    await expect(decidedLines(scope)).toHaveCount(1)

    // Deny the other call with Stop. The approved peer and the call that
    // needed no approval must not run either.
    await settle(deleteCard)
    await action(deleteCard, 'deny').click()
    await expect(decidedLines(scope)).toHaveCount(2)
    await expect(decidedLines(scope).locator(SEL.decidedDecision).filter({ hasText: new RegExp(`^${TEXT.denied}$`) })).toHaveCount(1)
    await expect(decidedLines(scope).locator(SEL.decidedDecision).filter({ hasText: TEXT.approvedNotRun })).toHaveCount(1)
    const sessionId = await sessionIdOf(page)
    await expectRows(page, sessionId, 'every call of the batch is settled', rows => rows.length === 3 && rows.every(row => !['pending', 'processing'].includes(row.metadata?.status ?? 'pending')))
    await expect(scope.locator(SEL.stop)).toBeHidden({ timeout: 20_000 })
    const rows = await expectRows(page, sessionId, 'the rows are final', current => current.length === 3)
    expect(allRanRows(rows)).toHaveLength(0)
    await expect(scope.getByText('Batch finished.', { exact: true })).toHaveCount(0)
  })

  test('6. Deny with a reason: the assistant follows the reason', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'deny reason')
    const card = cardFor(scope, recordName('rec', 1, tag))
    await expect(card).toBeVisible({ timeout: 20_000 })
    await settle(card)
    await action(card, 'reason').click()
    const reason = 'Use the staging record instead'
    await card.locator(SEL.reasonInput).fill(reason)
    await action(card, 'send-reason').click()

    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.deniedReason(reason))
    await expect(scope.getByText(`Following your instruction: ${reason}`, { exact: true })).toBeVisible({ timeout: 20_000 })
    const sessionId = await sessionIdOf(page)
    expect(allRanRows(await expectRows(page, sessionId, 'the denied call is settled', rows => rows.length === 1 && rows[0].metadata?.status !== 'pending'))).toHaveLength(0)
  })

  test('7. Expiry with a 30 s timeout: "Not run: no decision in time" and the assistant stops', async ({ page, capture }) => {
    test.setTimeout(150_000)
    const { tag, scope } = await converse(page, capture, AGENTS.expiry, 'approve one')
    await expect(cardFor(scope, recordName('rec', 1, tag))).toBeVisible({ timeout: 20_000 })

    // The only wait in the suite: the Session's own 30 s expiry. The test waits
    // for the expiry event on screen, with a bounded timeout, and does not sleep.
    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.expired, { timeout: 90_000 })
    await expect(cards(scope)).toHaveCount(0)
    await expect(scope.locator(SEL.stop)).toBeHidden({ timeout: 20_000 })
    const sessionId = await sessionIdOf(page)
    const rows = await expectRows(page, sessionId, 'the expired call is stored as expired', current => current.length === 1 && current[0].metadata?.approval?.state === 'expired')
    expect(allRanRows(rows)).toHaveLength(0)
    await expect(scope.getByText(/^Done: /)).toHaveCount(0)
  })

  test('8. Stop while waiting: the card shows it was stopped and nothing runs', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
    await expect(cardFor(scope, recordName('rec', 1, tag))).toBeVisible({ timeout: 20_000 })

    await scope.locator(SEL.stop).click()

    const decision = decidedLines(scope)
    await expect(decision).toHaveAttribute('data-state', 'cancelled', { timeout: 20_000 })
    await expect(decision.locator(SEL.decidedDecision)).toHaveText(TEXT.cancelled)
    await expect(cards(scope)).toHaveCount(0)
    const sessionId = await sessionIdOf(page)
    const rows = await expectRows(page, sessionId, 'the stopped call is settled', current => current.length === 1 && current[0].metadata?.status !== 'pending')
    expect(allRanRows(rows)).toHaveLength(0)
  })

  test('9. Reload while waiting: the same card is back and still works', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
    const record = recordName('rec', 1, tag)
    await expect(cardFor(scope, record)).toBeVisible({ timeout: 20_000 })
    const sessionId = await sessionIdOf(page)
    const before = await expectRows(page, sessionId, 'the call row is stored', rows => rows.length === 1)

    await page.reload()

    const card = cardFor(scope, record)
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(cards(scope)).toHaveCount(1)
    await expect(card).toHaveAttribute(SEL.phaseAttr, 'ready')
    await settle(card)
    await action(card, 'approve').click()
    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.approved)
    await expect(scope.getByText(`Done: delete_record ${record} ran.`, { exact: true })).toBeVisible({ timeout: 20_000 })
    const after = await expectRows(page, sessionId, 'the tool ran once', rows => ranRows(rows, 'delete_record').length === 1)
    expect(after.map(row => row.message_id), 'the card belongs to the same stored call').toEqual(before.map(row => row.message_id))
  })

  test('10. Two tabs: approving in one shows "Decided in another window" in the other', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
    const record = recordName('rec', 1, tag)
    await expect(cardFor(scope, record)).toBeVisible({ timeout: 20_000 })
    const sessionId = await sessionIdOf(page)

    const second = await page.context().newPage()
    capture.watch(second, 'tab2')
    await second.goto(`/chat/${sessionId}`)
    const secondCard = cardFor(second, record)
    await expect(secondCard).toBeVisible({ timeout: 20_000 })

    const card = cardFor(scope, record)
    await settle(card)
    await action(card, 'approve').click()

    const elsewhere = decidedLines(second)
    await expect(elsewhere.locator(SEL.decidedDecision)).toHaveText(TEXT.approved, { timeout: 20_000 })
    await expect(elsewhere.locator(SEL.decidedElsewhere)).toHaveText(TEXT.elsewhere)
    await expect(decidedLines(scope).locator(SEL.decidedElsewhere)).toHaveCount(0)
    await expect(cards(second)).toHaveCount(0)
    await expectRows(page, sessionId, 'the tool ran once', rows => ranRows(rows, 'delete_record').length === 1)
    await second.close()
  })

  test('11. Steering while waiting: "Skipped because you sent a message" and the assistant reads the message', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
    await expect(cardFor(scope, recordName('rec', 1, tag))).toBeVisible({ timeout: 20_000 })

    // The composer stays usable while a card waits. Its placeholder says that sending skips the approval.
    const textarea = scope.locator(SEL.textarea)
    await expect(textarea).toBeEnabled()
    await expect(textarea).toHaveAttribute('placeholder', TEXT.waitingPlaceholder)
    await sendMessage(scope, `steer: use rec-2 instead #${tag}`)

    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.superseded, { timeout: 20_000 })
    await expect(scope.getByText('Steering read: use rec-2 instead', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(cards(scope)).toHaveCount(0)
    const sessionId = await sessionIdOf(page)
    expect(allRanRows(await expectRows(page, sessionId, 'the superseded call is settled', rows => rows.length === 1 && rows[0].metadata?.status !== 'pending'))).toHaveLength(0)
  })

  test('12. require all with a private tool and a delegation call: both cards show and work', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.all, 'ask everything')
    const privateCard = cardFor(scope, recordName('audit', 1, tag))
    const delegationCard = cardFor(scope, recordName('task', 1, tag))
    const plainCard = cardFor(scope, recordName('rec', 1, tag))
    for (const card of [privateCard, delegationCard, plainCard])
      await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(cards(scope)).toHaveCount(3)
    await expect(privateCard).toContainText(`Run ${TOOL_TITLE.audit}`)
    // A private call has no tool chip while it waits.
    await expect(scope.locator(SEL.toolChip).filter({ hasText: /write_audit|audit entry/i })).toHaveCount(0)

    // Details of the delegation card name the agent that gets the task.
    await action(delegationCard, 'details').click()
    await expect(delegationCard).toContainText(TEXT.delegatesTo('Analyst'))

    for (const card of [privateCard, delegationCard, plainCard]) {
      await settle(card)
      await action(card, 'approve').click()
    }
    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText([TEXT.approved, TEXT.approved, TEXT.approved])
    await expect(scope.getByText('Everything ran.', { exact: true })).toBeVisible({ timeout: 40_000 })
    // An approved private call still shows no tool chip.
    await expect(scope.locator(SEL.toolChip).filter({ hasText: /write_audit|audit entry/i })).toHaveCount(0)
    const sessionId = await sessionIdOf(page)
    await expectRows(page, sessionId, 'the private and the delegation call were approved', rows =>
      rows.some(row => row.type === 'private_function' && row.metadata?.approval?.state === 'approved')
      && rows.some(row => row.type === 'delegation' && row.metadata?.approval?.state === 'approved'))
  })

  test('13. Host chat and an app-owned <wippy-chat> in an app page: both show the card, one decision updates both', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
    const record = recordName('rec', 1, tag)
    await expect(cardFor(scope, record)).toBeVisible({ timeout: 20_000 })

    // The Components page of the main app has a <wippy-chat> that follows the
    // session picked in its <wippy-session-selector>.
    const app = await page.context().newPage()
    capture.watch(app, 'app-page')
    await app.goto('/home/components')
    const main = app.frameLocator(pageIframeSelector('app.views:main'))
    await main.getByRole('tab', { name: 'Chat', exact: true }).click()
    await main.locator('wippy-session-selector').getByRole('combobox', { name: 'Select a session' }).click()
    // The session list is newest first: the chat this test started is the first option.
    await main.getByRole('option').first().click()
    const embedded = main.locator('wippy-chat')
    const embeddedCard = cardFor(embedded, record)
    await expect(embeddedCard).toBeVisible({ timeout: 20_000 })
    await expect(cardFor(scope, record)).toBeVisible()

    // One decision, in the Host chat. The <wippy-chat> shows the committed state.
    const card = cardFor(scope, record)
    await settle(card)
    await action(card, 'approve').click()
    const embeddedDecision = decidedLines(embedded)
    await expect(embeddedDecision.locator(SEL.decidedDecision)).toHaveText(TEXT.approved, { timeout: 20_000 })
    await expect(embeddedDecision.locator(SEL.decidedElsewhere)).toHaveText(TEXT.elsewhere)
    await expect(cards(embedded)).toHaveCount(0)
    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.approved)
    const sessionId = await sessionIdOf(page)
    await expectRows(page, sessionId, 'the tool ran once', rows => ranRows(rows, 'delete_record').length === 1)
    await app.close()
  })

  test.describe('14. phone width', () => {
    test.use({ viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

    test('375px: no horizontal scroll and usable buttons', async ({ page, capture }) => {
      const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
      const record = recordName('rec', 1, tag)
      const card = cardFor(scope, record)
      await expect(card).toBeVisible({ timeout: 20_000 })
      await settle(card)

      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }))
      expect(overflow.page, 'no horizontal page scroll').toBeLessThanOrEqual(0)
      expect(await card.evaluate(element => element.scrollWidth - element.clientWidth), 'the card does not overflow').toBeLessThanOrEqual(1)
      // Touch targets: at least 44px high.
      for (const name of ['approve', 'deny', 'reason', 'details'] as const) {
        const box = await action(card, name).boundingBox()
        expect(box?.height ?? 0, `${name} is at least 44px high`).toBeGreaterThanOrEqual(44)
      }

      await action(card, 'approve').tap()
      await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.approved)
      await expect(scope.getByText(`Done: delete_record ${record} ran.`, { exact: true })).toBeVisible({ timeout: 20_000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    })
  })

  test('15. Forged decision from an artifact script: nothing is approved', async ({ page, capture }) => {
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'forge decision')
    const record = recordName('rec', 1, tag)
    // The first step makes the artifact, the second step asks for a marked call
    // that waits while the artifact's script runs its attempts.
    const frame = page.frameLocator('iframe[sandbox*="allow-scripts"]').first()
    const log = frame.locator('#forge-log')
    await expect(log).toBeAttached({ timeout: 30_000 })
    const card = cardFor(scope, record)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(log).toHaveAttribute('data-forge', 'done', { timeout: 45_000 })

    // Every attempt ran and wrote its line. A blocked attempt is the expected outcome.
    const text = (await log.textContent()) ?? ''
    for (const attempt of ['click:', 'keys:', 'relay:', 'token:', 'socket:', 'api:', 'forge:complete'])
      expect(text, `the script ran its ${attempt} attempt`).toContain(attempt)
    expect(text, 'the script could not read the user token').not.toContain('token:exposed')

    // Nothing was approved: the card still waits and the call did not run.
    await expect(card).toBeVisible()
    await expect(decidedLines(scope)).toHaveCount(0)
    const sessionId = await sessionIdOf(page)
    const rows = await expectRows(page, sessionId, 'the marked call still waits', current => current.some(row => row.metadata?.function_name === 'delete_record'))
    const marked = rows.find(row => row.metadata?.function_name === 'delete_record')
    expect(marked?.metadata?.approval?.state).toBe('pending')
    expect(ranRows(rows, 'delete_record')).toHaveLength(0)

    // The card was not broken by the attempts: a real click still approves it.
    await settle(card)
    await action(card, 'approve').click()
    await expect(decidedLines(scope).locator(SEL.decidedDecision)).toHaveText(TEXT.approved)
    await expect(scope.getByText('Forge check finished.', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expectRows(page, sessionId, 'the tool ran once, after the real approval', current => ranRows(current, 'delete_record').length === 1)
  })

  test('19. console and network logs of a full approve run are clean, and the capture catches a deliberate failure', async ({ page, capture }) => {
    // The run itself: approve once through the facade flow.
    const { tag, scope } = await converse(page, capture, AGENTS.standard, 'approve one')
    const card = cardFor(scope, recordName('rec', 1, tag))
    await expect(card).toBeVisible({ timeout: 20_000 })
    await settle(card)
    await action(card, 'approve').click()
    await expect(scope.getByText(`Done: delete_record ${recordName('rec', 1, tag)} ran.`, { exact: true })).toBeVisible({ timeout: 20_000 })
    expect(capture.problems(), 'no console error and no network error during the run').toEqual([])
    expect(capture.networkLog(), 'the capture saw the run\'s API traffic').toContain('/api/v1/sessions')
    expect(capture.consoleLog(), 'the capture saw the console').not.toBe('')

    // Positive control: the same capture must see a console error and an HTTP
    // 404. Without it, an empty problem list above would prove nothing. The
    // reset keeps the deliberate failures out of the end-of-test check.
    await page.evaluate(async () => {
      console.error('capture probe')
      await fetch('/api/v1/capture-probe-not-found')
    })
    await expect.poll(() => capture.problems().join('\n'), { message: 'the capture records the probe' }).toContain('capture probe')
    expect(capture.problems().join('\n')).toMatch(/HTTP 404 .*capture-probe-not-found/)
    capture.reset()
  })
})
