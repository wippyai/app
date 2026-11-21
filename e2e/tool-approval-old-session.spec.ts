import { expect, recordSentFrames, test } from './helpers/capture'
import {
  AGENTS,
  allRanRows,
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
  TOOL_TITLE,
} from './helpers/tool-approval'

/**
 * Tool approval, scenario 17 of EE2-2713: an old Session with the new Host.
 *
 * The app uses the published wippy/session 0.7.0 with no replacement, so the
 * Session has no tool approval capability. The new Host must show no change:
 * no approval UI and no approval command on the wire. The agent is the plain
 * fixture agent, because the others need the approval trait, which an old
 * Session does not have.
 *
 * Runs only with `TOOL_APPROVAL_CELL=old-session`. See e2e/README.md.
 */

test.skip(!FIXTURES_ON, FIXTURES_SKIP_REASON)
test.skip(CELL !== 'old-session', cellSkipReason('old-session'))
test.describe.configure({ timeout: 90_000 })

test.describe('Tool approval, old Session cell', () => {
  test('17. old Session: the new Host shows no change', async ({ page, capture }) => {
    const sent = recordSentFrames(page)
    const tag = newTag()
    const scope = await openToolApprovalChat(page, capture, AGENTS.plain)
    // The cell is what it claims to be: the Session does not declare the capability.
    const capabilities = await sessionCapabilities(page)
    expect(capabilities.tool_approval, 'GET /api/v1/sessions/capabilities has no tool_approval').toBeUndefined()

    await sendMessage(scope, `lookup one #${tag}`)

    // A normal tool call: its chip, its result, the reply.
    const record = recordName('rec', 1, tag)
    await expect(scope.getByText(`Looked up ${record}.`, { exact: true })).toBeVisible({ timeout: 20_000 })
    // The chip shows the resolved tool title; the alias shows only while the title loads (Host src/shared/ui/tool/tool-name.vue:12-17).
    await expect(scope.locator(SEL.toolChip).filter({ hasText: TOOL_TITLE.lookup })).toHaveCount(1)
    const sessionId = await sessionIdOf(page)
    const rows = await expectRows(page, sessionId, 'the tool ran once', current => ranRows(current, 'lookup_record').length === 1)
    expect(allRanRows(rows)).toHaveLength(1)

    // No approval UI of any kind.
    await expect(cards(scope)).toHaveCount(0)
    await expect(decidedLines(scope)).toHaveCount(0)
    await expect(scope.locator(SEL.composerStatus)).toHaveCount(0)
    await expect(scope.locator(SEL.grants)).toHaveCount(0)
    await expect(scope.locator(SEL.autoApproved)).toHaveCount(0)
    await expect(scope.locator(SEL.notRunOutcome)).toHaveCount(0)

    // No approval command and no surface declaration reached the Session.
    expect(sent.length, 'the page sent socket messages').toBeGreaterThan(0)
    expect(sent.filter(frame => frame.includes('tool_approval')), 'socket messages that mention tool_approval').toEqual([])
  })
})
