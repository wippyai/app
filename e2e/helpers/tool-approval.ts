import type { FrameLocator, Locator, Page } from '@playwright/test'
import type { Capture } from './capture'
import process from 'node:process'
import { expect } from '@playwright/test'
import { getHostFrame, loginAsAdmin, pageIframeSelector } from './login'
import { sessionMessages } from './session-messages'

/**
 * Helpers of the tool approval specs (`e2e/tool-approval*.spec.ts`).
 *
 * The selectors and texts below belong to the Wippy Web Host approval card.
 * They are copied from Host commit 3583fc38 (branch feat/ee2-2711-tool-approval,
 * MR !67) and each one names its source line there. Do not invent a selector:
 * change it here when the Host changes, in one place.
 */

// ── Gates ────────────────────────────────────────────────────────────────────

/** The fixtures flag. The fixture agents exist only with the `tool-approval-fixtures` profile. */
export const FIXTURES_ON = process.env.TOOL_APPROVAL_DEV_FIXTURES === 'true'

/**
 * Which runtime cell the run proves: `current` (Session with tool approval and
 * the local Host, scenarios 1 to 15 and 19), `old-host` (scenario 16) or
 * `old-session` (scenario 17). See e2e/README.md.
 */
export const CELL = process.env.TOOL_APPROVAL_CELL ?? 'current'

export const FIXTURES_SKIP_REASON = 'requires the tool approval dev fixtures: start the app with TOOL_APPROVAL_DEV_FIXTURES=true and run this suite with the same value'

export function cellSkipReason(cell: string) {
  return `runs only in the ${cell} cell: set TOOL_APPROVAL_CELL=${cell} (see e2e/README.md)`
}

// ── Fixture agents (src/app/tool_approval_demo/_index.yaml) ─────────────────

export const AGENTS = {
  /** Agent A: the trait with its defaults. */
  standard: 'app.tool_approval_demo:agent',
  /** `approve_all: batch` (scenario 2). */
  batch: 'app.tool_approval_demo:batch_agent',
  /** Agent B, `approve_all: session` (scenario 4). */
  session: 'app.tool_approval_demo:session_agent',
  /** `timeout_seconds: 30` (scenario 7). */
  expiry: 'app.tool_approval_demo:expiry_agent',
  /** `require: all` with a private tool and a delegate (scenario 12). */
  all: 'app.tool_approval_demo:all_agent',
  /** No approval trait. */
  plain: 'app.tool_approval_demo:plain_agent',
} as const

// ── Host selectors ───────────────────────────────────────────────────────────

/** Source: Host src/shared/ui/tool-approval/ at 3583fc38 unless a line names another file. */
export const SEL = {
  /** A pending card: tool-approval-card.vue:287. One per waiting call; a decided call has none. */
  card: '[data-message-part="approval"]',
  /** tool-approval-card.vue:284. `true` once the card stood still for 500 ms. Buttons ignore activation before. */
  armedAttr: 'data-armed',
  /** tool-approval-card.vue:282. ready, sending, failed, not_confirmed, offline. */
  phaseAttr: 'data-phase',
  /** Buttons of the card: data-approval-action at tool-approval-card.vue:300 (details), :316 (approve), :330 (approve_all), :346 (deny), :359 (reason), :383 (retry), :411 (send-reason). */
  action: (name: 'approve' | 'approve_all' | 'deny' | 'reason' | 'details' | 'retry' | 'send-reason') => `[data-approval-action="${name}"]`,
  /** The reason box: tool-approval-card.vue:396-401 (an `<input type="text">`). */
  reasonInput: '.chat-approval__reason-input',
  /** The one-line argument summary of a card: tool-approval-card.vue:294. */
  summary: '.chat-approval__summary code',
  /** A decided call: tool-approval-decided.vue:101 (class), :106 (data-state), :115 (decision text), :116 (elsewhere label), :117 (run status), :120 (details toggle). */
  decided: '.chat-approval-decided',
  decidedDecision: '.chat-approval-decided__decision',
  decidedElsewhere: '.chat-approval-decided__elsewhere',
  decidedStatus: '.chat-approval-decided__status',
  /** The grants chip and its list: tool-approval-grants-chip.vue:65 (root), :68 (chip button), :79 (item), :92 (Revoke button). */
  grants: '.chat-approval-grants',
  grantsChip: '.chat-approval-grants__chip',
  grantItem: '.chat-approval-grants__item',
  grantRevoke: '.chat-approval-grants__revoke',
  /** The composer status line: tool-approval-composer.vue:126 (line), :131 (Review button). */
  composerStatus: '.chat-approval-composer__status',
  composerReview: '.chat-approval-composer__review',
  /** The composer textarea: message-input.vue:566. Its placeholder is `Type a message`, or the approval text while a card waits (:567). */
  textarea: 'textarea.chat-input__textarea',
  /** The Stop button: message-input.vue:578. */
  stop: '.chat-input__stop-button',
  /**
   * The tool chips: chat-message-list.vue:271 (group), :288 (chip), :312 (Auto-approved mark text), :314 (Not run outcome).
   * A decided approval line also carries the class `chat-tool-group__badge` (tool-approval-decided.vue:101) and prints the
   * tool title (:114), so a chip is a badge that is not a decided line.
   */
  toolGroup: '.chat-tool-group',
  toolChip: '.chat-tool-group__badge:not(.chat-approval-decided)',
  autoApproved: '.chat-tool-group__auto-text',
  notRunOutcome: '.chat-tool-group__outcome',
} as const

// ── Host texts ───────────────────────────────────────────────────────────────

/** Source: Host src/i18n/default/text.json at 3583fc38, keys under `chat.toolApproval`. */
export const TEXT = {
  /** `decided.approved`, line 89. */
  approved: 'Approved',
  /** `decided.approvedNotRun`, line 94. The peer of a call that was denied with Stop. */
  approvedNotRun: 'Approved, but not run',
  /** `decided.approvedAll`, line 90. Approve all with scope `batch`. */
  approvedAll: 'Approved with Approve all',
  /** `decided.allowedTool`, line 91, with the tool title. */
  allowedTool: (tool: string) => `Allowed ${tool} for this session`,
  /** `decided.allowedSession`, line 92. */
  allowedSession: 'Allowed for this session',
  /** `decided.autoApproved`, line 93, and `autoApproved`, line 128. The mark on a tool chip that a grant allowed. */
  autoApproved: 'Auto-approved',
  /** `decided.deniedReason`, line 96. */
  deniedReason: (reason: string) => `Denied: ${reason}`,
  /** `decided.denied`, line 95. */
  denied: 'Denied',
  /** `decided.expired`, line 97. */
  expired: 'Not run: no decision in time',
  /** `decided.cancelled`, line 98. Stop while a card waits. */
  cancelled: 'Not run: you stopped the assistant',
  /** `decided.superseded`, line 99. A steering message while a card waits. */
  superseded: 'Skipped because you sent a message',
  /** `decided.elsewhere`, line 103. */
  elsewhere: 'Decided in another window',
  /** `status.stopped`, line 110. */
  stopped: 'Stopped',
  /** `approveAll.tool.label`, line 44. */
  approveAllTool: 'Approve all: this tool',
  /** `approveAll.session.label`, line 49. */
  approveAllSession: 'Approve all: this session',
  /** `approveAll.batch.label`, line 39, with the count. */
  approveAllBatch: (count: number) => `Approve all ${count}`,
  /** `grants.chip`, line 142, with the tools. */
  grantsChip: (tools: string) => `Auto-approve: ${tools}`,
  /** `delegatesTo`, line 31, shown in Details of a delegation card. */
  delegatesTo: (agent: string) => `Hands the task to ${agent}`,
  /** `composer.placeholder`, line 138. */
  waitingPlaceholder: 'Sending skips the approval',
  /** The placeholder of the composer at rest: message-input.vue:567. */
  idlePlaceholder: 'Type a message',
  /** The unavailable notice: Host test-support session_error_unavailable.json. Shown by a Host that knows the code. */
  unavailableNotice: 'A tool call needs your approval, but no open chat window can show it. The assistant stopped.',
} as const

/**
 * The decision text of a state that carries the decision time: `<label>, <h:mm>`.
 * Host tool-approval-decided.vue:47-51 adds the time to an approved decision (every
 * kind of approval) and to a plain denial. It does not add it to a denial with a
 * reason, expiry, Stop, supersession, interruption, unavailable or limit.
 * The Host test tool-approval-decided.test.ts:66 matches `/^Approved, \d{1,2}:\d{2}/`.
 */
export function withTime(label: string): RegExp {
  return new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, \\d{1,2}:\\d{2}`)
}

// ── Names the scripted model uses (src/app/tool_approval_demo/generate.lua) ──

/** The titles of the fixture tools (meta.title in _index.yaml). The card reads `Run <title>`. */
export const TOOL_TITLE = {
  delete: 'Delete record',
  invoice: 'Send invoice',
  wire: 'Wire funds',
  lookup: 'Look up record',
  audit: 'Write audit entry',
} as const

/** The names the model gives a tool (llm_alias in _index.yaml), as the stored rows carry them. */
export type ToolAlias = 'delete_record' | 'send_invoice' | 'wire_funds' | 'lookup_record' | 'write_audit' | 'make_forger'

/** A tag for one test, so its records differ from those of any other test in a shared database. */
export function newTag(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** The name of record `number` of a script, as generate.lua builds it (`<prefix>-<n>-<tag>`). */
export function recordName(prefix: 'rec' | 'inv' | 'acc' | 'audit' | 'task', number: number, tag: string): string {
  return `${prefix}-${number}-${tag}`
}

// ── Opening a chat ───────────────────────────────────────────────────────────

const DEMO_PAGE_IFRAME_SELECTOR = pageIframeSelector('app.views:session-forms-demo')

/** Where an approval card is looked up: a page, a frame, or an element such as a `<wippy-chat>`. All have `locator()`. */
export type Scope = Page | FrameLocator | Locator

/**
 * Logs in through the facade, opens the demo page and starts a chat with a
 * fixture agent. Returns the scope the Host renders into (the page itself with
 * the current facade). The capture is reset after sign-in.
 */
export async function openToolApprovalChat(page: Page, capture: Capture, registryId: string): Promise<Scope> {
  await loginAsAdmin(page)
  capture.reset()
  // The page has no sidebar entry, so open it by URL.
  await page.goto('/session-forms-demo')
  const demo = page.frameLocator(DEMO_PAGE_IFRAME_SELECTOR)
  // The agent cards share a title prefix, so match the card by registry id.
  const agentCard = demo.locator('.rounded-lg').filter({ hasText: registryId })
  await expect(agentCard, `the demo page lists ${registryId}: start the app with TOOL_APPROVAL_DEV_FIXTURES=true`).toHaveCount(1, { timeout: 15_000 })
  await agentCard.getByRole('button', { name: /start chat/i }).click()
  // Start chat replaces the top-level route with /chat/:id, so later steps use the page, not a frame.
  await expect(page.getByPlaceholder(TEXT.idlePlaceholder)).toBeVisible({ timeout: 15_000 })
  return getHostFrame(page)
}

/** Types a message in the composer and sends it with Enter. */
export async function sendMessage(scope: Scope, text: string) {
  const textarea = scope.locator(SEL.textarea)
  await textarea.fill(text)
  await textarea.press('Enter')
}

/** The ID of the session a page shows, from its `/chat/:id` route. Waits for the route. */
export async function sessionIdOf(page: Page): Promise<string> {
  await expect.poll(() => new URL(page.url()).pathname, { message: 'the page shows /chat/<session id>' }).toMatch(/^\/chat\/[^/]+/)
  return new URL(page.url()).pathname.split('/')[2]
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** Every pending card of the chat. */
export function cards(scope: Scope): Locator {
  return scope.locator(SEL.card)
}

/** The pending card of the call that has `text` (a record name) in its argument summary. */
export function cardFor(scope: Scope, text: string): Locator {
  return cards(scope).filter({ hasText: text })
}

/** A button of a card. */
export function action(card: Locator, name: Parameters<typeof SEL.action>[0]): Locator {
  return card.locator(SEL.action(name))
}

/** Waits until the card stood still for the 500 ms its buttons ignore activation. */
export async function settle(card: Locator) {
  await expect(card).toHaveAttribute(SEL.armedAttr, 'true')
}

/**
 * Clicks Approve on a card once and waits until the card is gone (its decided
 * line replaces it). `data-armed` is refreshed once per animation frame, so
 * right after another card was decided and the layout moved, a card can still
 * read `true` for a frame while the Host already counts it as moving. The step
 * therefore scrolls the button into view, waits for `true`, waits two animation
 * frames in the page, checks that the card is still armed, and clicks exactly once.
 * There is no retry: a click that a card armed for two frames still drops is a Host
 * defect, and the step reports it by failing on the card that stays. The step also fails when
 * the card is ever in the phase `failed` or `not_confirmed` (the Host could not
 * send, or did not get the confirmation).
 */
export async function approveWhenArmed(card: Locator) {
  // A scroll moves the buttons, and the Host restarts its 500 ms wait on any move. Playwright
  // scrolls the button into view by itself right before it clicks, and the Host then counts
  // that scroll as a move and drops the click. So the button is brought into view first.
  await action(card, 'approve').scrollIntoViewIfNeeded()
  await settle(card)
  await card.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(card, 'the card is still armed two animation frames later').toHaveAttribute(SEL.armedAttr, 'true')
  // Records the bad phases from now on, even ones that last only a moment. The array
  // lives in the page and stays readable after the card left the DOM.
  const badPhases = await card.evaluateHandle((element, attribute) => {
    const seen: string[] = []
    const read = () => {
      const phase = element.getAttribute(attribute)
      if (phase === 'failed' || phase === 'not_confirmed')
        seen.push(phase)
    }
    read()
    new MutationObserver(read).observe(element, { attributes: true, attributeFilter: [attribute] })
    return seen
  }, SEL.phaseAttr)
  await action(card, 'approve').click()
  const gone = await expect(card).toHaveCount(0).then(() => true, () => false)
  expect(await badPhases.jsonValue(), 'the card was never in phase failed or not_confirmed').toEqual([])
  expect(gone, 'the card took the approval click and went away').toBe(true)
}

/** The decided lines of the chat (a call that had a card and now has a decision). */
export function decidedLines(scope: Scope): Locator {
  return scope.locator(SEL.decided)
}

/** The Session capabilities (`GET /api/v1/sessions/capabilities`) with the token the signed-in page keeps. */
export async function sessionCapabilities(page: Page): Promise<Record<string, unknown>> {
  const token = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('@wippy_token_info') ?? 'null')?.token as string | undefined
    }
    catch {
      return undefined
    }
  })
  expect(token, 'signed-in token in localStorage').toBeTruthy()
  const response = await page.request.get('/api/v1/sessions/capabilities', { headers: { Authorization: `Bearer ${token}` } })
  expect(response.status()).toBe(200)
  const body = await response.json() as { capabilities?: Record<string, unknown> }
  return body.capabilities ?? {}
}

// ── Stored rows ──────────────────────────────────────────────────────────────

/** A stored tool call row of the messages API (`GET /api/v1/sessions/messages`), as far as the specs read it. */
export interface ToolRow {
  message_id: string
  type: string
  data: string
  metadata?: {
    status?: string
    call_id?: string
    function_name?: string
    registry_id?: string
    outcome?: string
    result?: unknown
    approval?: {
      approval_id?: string
      state?: string
      revision?: number
      intent_digest?: string
      disposition?: string | null
      decided_via?: string | null
      then?: string | null
      reason?: string | null
    }
  }
}

/** The stored result of a call as text, for a check that a result holds a marker. */
export function resultText(row: ToolRow): string {
  const raw = row.metadata?.result
  return typeof raw === 'string' ? raw : JSON.stringify(raw ?? null)
}

/** The tool call rows of a session: public, private and delegation calls. */
export async function toolRows(page: Page, sessionId: string): Promise<ToolRow[]> {
  const rows = await sessionMessages(page, sessionId) as unknown as ToolRow[]
  return rows.filter(row => row.type === 'function' || row.type === 'private_function' || row.type === 'delegation')
}

function resultOf(row: ToolRow): Record<string, unknown> | undefined {
  const raw = row.metadata?.result
  if (raw && typeof raw === 'object')
    return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
    }
    catch {
      return undefined
    }
  }
  return undefined
}

/**
 * The calls of one tool that ran: rows whose stored result is the fixture
 * tool's own `{ ran: true, tool, record }` (tools.lua). A call that did not run
 * has the Session's `{ executed: false, ... }` result instead.
 */
export function ranRows(rows: ToolRow[], alias: ToolAlias): ToolRow[] {
  return rows.filter((row) => {
    const result = resultOf(row)
    return result?.ran === true && result.tool === alias
  })
}

/** Every call that ran, whatever the tool. */
export function allRanRows(rows: ToolRow[]): ToolRow[] {
  return rows.filter(row => resultOf(row)?.ran === true)
}

/** Polls the stored rows until `check` is true for them, and returns them. */
export async function expectRows(page: Page, sessionId: string, description: string, check: (rows: ToolRow[]) => boolean, timeout = 15_000): Promise<ToolRow[]> {
  let latest: ToolRow[] = []
  await expect.poll(async () => {
    latest = await toolRows(page, sessionId)
    return check(latest)
  }, { message: description, timeout }).toBe(true)
  return latest
}
