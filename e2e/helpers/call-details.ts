import type { Locator, Page, WebSocketRoute } from '@playwright/test'
import type { Capture } from './capture'
import type { Scope } from './tool-approval'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test as base, expect } from './capture'
import { getHostFrame, loginAsAdmin, pageIframeSelector } from './login'
import { AGENTS, action, approveWhenArmed, cards, FIXTURES_ON, FIXTURES_SKIP_REASON, newTag, SEL, sendMessage, sessionCapabilities, sessionIdOf, settle } from './tool-approval'

export { expect, AGENTS, action, approveWhenArmed, cards, newTag, SEL, sendMessage, sessionIdOf }
export const CELL = process.env.CALL_DETAILS_CELL ?? 'current'
export const SUMMARY_AGENT = 'app.tool_approval_demo:summary_agent'
export const MASK = '[hidden: sensitive]'
export const D = {
  row: '.chat-tool-row', toggle: '.chat-tool-row__toggle', panel: '.chat-tool-row__panel',
  icon: '.chat-tool-row__icon', note: '.chat-tool-row__note', timer: '.chat-tool-row__timer',
  copy: '.chat-tool-panel__copy', dialogButton: '.chat-tool-panel__dialog-button',
  hidden: '.chat-tool-panel__hidden-note', value: '.chat-tool-panel__value',
  viewAll: '.chat-tool-panel__view-all', duration: '.chat-tool-panel__duration',
} as const

export interface Descriptor {
  level: 'none' | 'summary' | 'full'
  availability: 'available' | 'restricted' | 'not_captured' | 'pending'
  summary: string | null
  preview: { value: unknown, cut: string[], numbers: string[] } | null
  has_full: boolean
  masked_paths: string[]
}
export interface DetailRow {
  message_id: string
  type: string
  data: string | null
  details_revision: number
  details: Record<'arguments' | 'result' | 'error' | 'timing', Descriptor>
  metadata: { status?: string, outcome?: string | null, function_name?: string, registry_id?: string, call_id?: string, result?: unknown, duration_ms?: number, approval?: Record<string, any> }
}

const FORBIDDEN_KEYS = new Set(['signature', 'provider_metadata', 'control_operations', 'reasoning_details', 'thinking_blocks', 'metadata_json', 'checkpoint', 'checkpoint_summary', 'checkpoint_summaries'])
const FORBIDDEN_VALUES = ['b3-writeonly-41c9@example.test', 'B3_SENSITIVE_RESULT_8f02', 'B3_PRIVATE_ARGUMENT_61ad', 'private_details_sentinel', 'private_details_tool', 'B3 private details sentinel', 'B3_HIDDEN_RESULT_927c']

/** Inspect JSON recursively, including JSON encoded inside another string. */
export function disclosureProblems(input: unknown, path = '$'): string[] {
  if (typeof input === 'string') {
    const problems = FORBIDDEN_VALUES.filter(value => input.includes(value)).map(value => `${path}: forbidden fixture value ${value}`)
    const text = input.trim()
    if (text.startsWith('{') || text.startsWith('[')) {
      try { problems.push(...disclosureProblems(JSON.parse(text), `${path}(json)`)) }
      catch { /* Ordinary text, not encoded JSON. */ }
    }
    return problems
  }
  if (!input || typeof input !== 'object') return []
  return Object.entries(input).flatMap(([key, value]) => [
    ...(FORBIDDEN_KEYS.has(key) ? [`${path}.${key}: internal field`] : []),
    ...((key === 'type' && (value === 'tool_call' || value === 'checkpoint')) ? [`${path}.${key}: forbidden chunk/row`] : []),
    ...disclosureProblems(value, `${path}.${key}`),
  ])
}

/** Every received frame and history/session response, from before navigation. */
export class DetailsWire {
  readonly frames: string[] = []
  readonly bodies: Array<{ url: string, body: unknown }> = []
  readonly problems: string[] = []
  private pending: Promise<void>[] = []
  recordFrame(text: string) {
    this.frames.push(text)
    if (CELL === 'old-session') return
    let value: unknown = text
    try { value = JSON.parse(text) }
    catch { /* Heartbeat text is still inspected for fixture sentinels. */ }
    this.problems.push(...disclosureProblems(value))
  }
  recordBody(url: string, body: unknown) {
    this.bodies.push({ url, body })
    if (CELL !== 'old-session') this.problems.push(...disclosureProblems(body))
  }
  watch(page: Page) {
    page.on('websocket', socket => socket.on('framereceived', frame => this.recordFrame(frame.payload.toString())))
    page.on('response', response => {
      if (!/\/api\/v1\/sessions\/(messages|get)(?:\?|$)/.test(response.url())) return
      const read = response.text().then(text => {
        let body: unknown = text
        try { body = JSON.parse(text) }
        catch { this.problems.push(`Non-JSON history response: ${new URL(response.url()).pathname}`) }
        this.recordBody(new URL(response.url()).pathname, body)
      }).catch(error => {
        // Navigation can cancel a response body. Capture separately checks the request.
        if (!/aborted|closed|No resource with given identifier|No data found/i.test(String(error)))
          this.problems.push(`History body could not be recorded: ${String(error)}`)
      })
      this.pending.push(read)
    })
  }
  async idle() {
    let count = -1
    while (count !== this.pending.length) { count = this.pending.length; await Promise.all(this.pending) }
  }
}

const pageWires = new WeakMap<Page, DetailsWire>()
export const test = base.extend<{ wire: DetailsWire }>({
  wire: [async ({ page, capture }, use, info) => {
    const wire = new DetailsWire()
    pageWires.set(page, wire)
    wire.watch(page)
    await use(wire)
    await page.waitForLoadState('networkidle')
    await wire.idle()
    pageWires.delete(page)
    await mkdir(resolve('.local/b3/logs'), { recursive: true })
    const name = `${CELL}-${info.titlePath.join('-').replace(/[^a-z0-9-]/gi, '_').slice(-150)}-${info.retry}`
    await writeFile(resolve('.local/b3/logs', `${name}.json`), JSON.stringify({ lifecycle: 'completed', frames: wire.frames, bodies: wire.bodies, problems: wire.problems }, null, 2))
    expect(wire.problems, 'no internal fields, private calls, tool_call chunks or unmasked values in any incoming payload').toEqual([])
    expect(capture.networkLog().split('\n').filter(line => line.includes(' FAILED ')), 'no failed requests, including navigation cancellations').toEqual([])
  }, { auto: true }],
})

export function gate(cell: string) {
  test.skip(!FIXTURES_ON, FIXTURES_SKIP_REASON)
  test.skip(CELL !== cell, `requires CALL_DETAILS_CELL=${cell}; see e2e/README.md, Call details cells`)
  test.describe.configure({ timeout: 90_000 })
}

const signedInPages = new WeakSet<Page>()
export async function openDetailsChat(page: Page, capture: Capture, agent: string = AGENTS.plain): Promise<Scope> {
  const signedIn = signedInPages.has(page)
  if (!signedIn) {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')
    capture.reset()
  }
  await page.waitForLoadState('networkidle')
  const scope = await getHostFrame(page)
  signedInPages.add(page)
  if (agent === SUMMARY_AGENT) {
    // The existing demo deliberately lists a fixed set. Use its real proxy API
    // for the new fixture rather than changing production frontend assets.
    await page.goto('/session-forms-demo')
    await page.waitForLoadState('networkidle')
    await page.frameLocator(pageIframeSelector('app.views:session-forms-demo')).locator('body').evaluate(async () => {
      const wippy = (window as unknown as { $W: { instance: () => Promise<{ api: { get: (url: string) => Promise<{ data: { agents: Array<{ title: string, start_token: string }> } }> } }>, host: () => Promise<{ startChat: (token: string, options: { sidebar: boolean }) => void }> } }).$W
      const api = await wippy.instance()
      const response = await api.api.get('/api/v1/agents/list')
      const agent = response.data.agents.find(item => item.title === 'Call Details Summary Fixture')
      if (!agent?.start_token) throw new Error('Call Details Summary Fixture is not registered; restart the Demo')
      const host = await wippy.host()
      host.startChat(agent.start_token, { sidebar: false })
    })
    await expect(page.locator(SEL.textarea)).toBeVisible()
  }
  else {
    await page.goto('/session-forms-demo')
    const card = page.frameLocator(pageIframeSelector('app.views:session-forms-demo')).locator('.rounded-lg').filter({ hasText: agent })
    await expect(card).toHaveCount(1)
    await page.waitForLoadState('networkidle')
    await card.getByRole('button', { name: /start chat/i }).click()
    await expect(page.locator(SEL.textarea)).toBeVisible()
  }
  await page.waitForLoadState('networkidle')
  const capabilities = await sessionCapabilities(page)
  if (CELL === 'old-session') expect(capabilities.call_details).toBeUndefined()
  else {
    expect(capabilities.call_details).toBe(1)
    expect(capabilities.session_show_tool_details).toBe(CELL === 'switch-off' ? 'none' : 'full')
  }
  await sessionRead(page, 'get')
  await sessionRead(page, 'messages')
  return agent === SUMMARY_AGENT ? getHostFrame(page) : scope
}

/** Page-context fetches are recorded by the same response listener as Host reads. */
export async function sessionRead(page: Page, endpoint: 'get' | 'messages', sessionId?: string): Promise<any> {
  const id = sessionId ?? await sessionIdOf(page)
  return page.evaluate(async ({ endpoint, id }) => {
    const token = JSON.parse(localStorage.getItem('@wippy_token_info') ?? 'null')?.token
    if (!token) throw new Error('No signed-in token')
    const query = new URLSearchParams({ session_id: id, limit: '100', cursor: '' })
    const response = await fetch(`/api/v1/sessions/${endpoint}?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`)
    return response.json()
  }, { endpoint, id })
}
export async function detailRows(page: Page): Promise<DetailRow[]> {
  const body = await sessionRead(page, 'messages')
  return body.messages.filter((row: DetailRow) => ['function', 'delegation', 'private_function'].includes(row.type))
}
export async function idle(scope: Scope) {
  await expect(scope.locator(SEL.stop)).toBeHidden({ timeout: 45_000 })
  await expect(scope.locator(SEL.textarea)).toBeEnabled()
}
export async function phrase(page: Page, scope: Scope, text: string, status = 'done'): Promise<Locator> {
  const previous = await scope.locator(D.row).evaluateAll(rows => rows.map(row => row.getAttribute('data-message-id')))
  await sendMessage(scope, `${text} #${newTag()}`)
  await expect(scope.locator(D.row)).toHaveCount(previous.length + (text === 'many tools' ? 4 : 1), { timeout: 30_000 })
  if (status !== 'running') await idle(scope)
  const ids = await scope.locator(D.row).evaluateAll(rows => rows.map(row => row.getAttribute('data-message-id')))
  const id = ids.find(id => id && !previous.includes(id))
  expect(id, 'live row has a stable stored message ID').toBeTruthy()
  const row = scope.locator(`${D.row}[data-message-id="${id}"]`)
  await expect(row).toHaveAttribute('data-status', status, { timeout: 30_000 })
  return row
}

const ICONS: Record<string, string> = {
  Running: 'svg-spinners:gooey-balls-2', Checking: 'tabler:clock', Done: 'tabler:tool',
  Failed: 'tabler:alert-triangle', Stopped: 'tabler:player-stop', 'Outcome unknown': 'tabler:help-circle',
  'Approved, done': 'tabler:shield-check', Denied: 'tabler:shield-x',
}
export async function assertRow(row: Locator, status: string, label: string, note?: string, notRunIcon = 'tabler:ban') {
  await expect(row).toHaveAttribute('data-status', status)
  await expect(row).toHaveAttribute('data-display', 'compact')
  const icon = row.locator(D.icon)
  await expect(icon).toHaveAttribute('role', 'img')
  await expect(icon).toHaveAttribute('aria-label', label)
  await expect(icon).toHaveAttribute('title', label)
  await expect(icon.locator('svg')).toBeVisible()
  // Iconify's DOM class names only identify the collection. Its mounted Vue
  // component prop identifies the exact glyph, without altering any app state.
  if (status !== 'running') {
    await expect.poll(() => icon.locator('svg').evaluate(element => {
      type Instance = { props?: { icon?: unknown }, parent?: Instance }
      let instance = (element as unknown as { __vueParentComponent?: Instance }).__vueParentComponent
      while (instance) {
        if (typeof instance.props?.icon === 'string') return instance.props.icon
        instance = instance.parent
      }
      return null
    })).toBe(ICONS[label] ?? notRunIcon)
  }
  else await expect(icon.locator('.chat-details-loader')).toHaveCount(1)
  if (note) await expect(row.locator(D.note)).toHaveText(note)
  else await expect(row.locator(D.note)).toHaveCount(0)
  const edge = await row.evaluate((element, status) => {
    const style = getComputedStyle(element)
    const tone = element.getAttribute('data-decision') === 'denied' ? 'failed' : status === 'done' ? 'done' : ['running', 'checking'].includes(status) ? 'running' : status === 'failed' ? 'failed' : 'neutral'
    const probe = document.createElement('span')
    probe.style.color = `var(--wippy-host-tool-edge-${tone}, var(--_tool-${tone}))`
    element.append(probe)
    const expected = getComputedStyle(probe).color
    probe.remove()
    return { width: style.borderInlineStartWidth, color: style.borderInlineStartColor, expected }
  }, status)
  expect(edge.width).toBe('4px')
  expect(edge.color).toBe(edge.expected)
  await expect(row.locator(D.toggle)).toHaveCount(status === 'checking' ? 0 : 1)
}

export async function expand(row: Locator, key?: 'Enter' | 'Space') {
  const toggle = row.locator(D.toggle)
  await expect(toggle).toHaveAccessibleName(/^Details for /)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const id = await toggle.getAttribute('aria-controls')
  expect(id).toBeTruthy()
  if (key) { await toggle.focus(); await toggle.press(key) }
  else await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(row.locator(D.panel)).toHaveAttribute('id', id!)
  await expect(row.locator(D.panel)).toBeVisible()
}
export async function panelActions(page: Page, row: Locator, expected: string | RegExp, copyExpected: string | RegExp = expected) {
  const panel = row.locator(D.panel)
  await expect(panel).toContainText(expected)
  // Only clipboard is replaced. The content still comes from the real panel.
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text: string) => { (window as unknown as { __b3Copy: string }).__b3Copy = text } })
  })
  await panel.locator(D.copy).click()
  const copied = await page.evaluate(() => (window as unknown as { __b3Copy: string }).__b3Copy)
  expect(copied).toMatch(copyExpected)
  expect(disclosureProblems(copied)).toEqual([])
  const opener = panel.locator(D.dialogButton)
  await opener.click()
  const dialog = row.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(expected)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
}
export async function reloadRow(page: Page, scope: Scope, row: Locator, expected: string | RegExp) {
  const id = await row.getAttribute('data-message-id')
  expect(id).toBeTruthy()
  await sessionRead(page, 'get')
  const before = (await detailRows(page)).find(item => item.message_id === id)
  await page.waitForLoadState('networkidle')
  await page.reload()
  const restored = scope.locator(`${D.row}[data-message-id="${id}"]`)
  await expect(restored).toHaveAttribute('data-display', 'compact')
  await expand(restored)
  await expect(restored.locator(D.panel)).toContainText(expected)
  const after = (await detailRows(page)).find(item => item.message_id === id)
  expect(after?.metadata).toEqual(before?.metadata)
  return restored
}

export type ApprovalState = 'pending' | 'approved' | 'denied' | 'denied-reason' | 'expired' | 'auto' | 'cancelled' | 'superseded'
export async function approvalState(page: Page, capture: Capture, state: ApprovalState) {
  const scope = await openDetailsChat(page, capture, state === 'expired' ? AGENTS.expiry : AGENTS.standard)
  await sendMessage(scope, `${state === 'auto' ? 'grant tool' : 'approve one'} #${newTag()}`)
  const card = cards(scope).first()
  await expect(card).toBeVisible()
  if (state === 'pending') return { scope, row: card }
  if (state === 'approved') await approveWhenArmed(card)
  else if (state === 'denied-reason') {
    await settle(card); await action(card, 'reason').click()
    await card.locator(SEL.reasonInput).fill('Use the staging record instead')
    await settle(card); await action(card, 'send-reason').click()
  }
  else if (state === 'denied') { await settle(card); await action(card, 'deny').click() }
  else if (state === 'auto') { await settle(card); await action(card, 'approve_all').click() }
  else if (state === 'cancelled') await scope.locator(SEL.stop).click()
  else if (state === 'superseded') await sendMessage(scope, `steer: use a different record #${newTag()}`)
  await expect(cards(scope)).toHaveCount(0, { timeout: 45_000 })
  await idle(scope)
  const decision = state === 'denied-reason' ? 'denied' : state
  const row = scope.locator(`${D.row}[data-decision="${decision}"]`).last()
  await expect(row).toBeVisible()
  return { scope, row }
}

/** Recovery-only states. All other traffic uses the real facade connection. */
export class RecoveryFrames {
  private sockets = new Set<WebSocketRoute>()
  private wire?: DetailsWire
  constructor(private readonly deliveryDelay = 0) {}
  async install(page: Page) {
    this.wire = pageWires.get(page)
    await page.routeWebSocket(/\/api\/v1\/ws\/join/, socket => {
      const server = socket.connectToServer()
      this.sockets.add(socket)
      socket.onMessage(message => server.send(message))
      let queue = Promise.resolve()
      server.onMessage(message => {
        this.wire?.recordFrame(message.toString())
        if (!this.deliveryDelay) { socket.send(message); return }
        queue = queue.then(async () => {
          if (/"type"\s*:\s*"function_/.test(message.toString())) await new Promise(resolve => setTimeout(resolve, this.deliveryDelay))
          socket.send(message)
        })
      })
      socket.onClose(() => this.sockets.delete(socket))
    })
  }
  inject(sessionId: string, messageId: string, data: Record<string, unknown>) {
    expect(this.sockets.size, 'real facade socket connected before injected recovery frame').toBeGreaterThan(0)
    const frame = JSON.stringify({ topic: `session:${sessionId}:message:${messageId}`, data: { session_id: sessionId, message_id: messageId, function_name: 'lookup_record', ...data } })
    this.wire?.recordFrame(frame)
    for (const socket of this.sockets) socket.send(frame)
  }
  idle(sessionId: string) {
    expect(this.sockets.size).toBeGreaterThan(0)
    const frame = JSON.stringify({ topic: `session:${sessionId}`, data: { type: 'update', session_id: sessionId, status: 'idle' } })
    this.wire?.recordFrame(frame)
    for (const socket of this.sockets) socket.send(frame)
  }
  revision(sessionId: string, revision: number) {
    expect(this.sockets.size).toBeGreaterThan(0)
    const frame = JSON.stringify({ topic: `session:${sessionId}`, data: { type: 'update', session_id: sessionId, details_revision: revision } })
    this.wire?.recordFrame(frame)
    for (const socket of this.sockets) socket.send(frame)
  }
}

/** Reuse a real row's descriptors; inject only the otherwise unreachable outcome. */
export async function injectedUnknown(page: Page, capture: Capture) {
  const frames = new RecoveryFrames()
  await frames.install(page)
  const scope = await openDetailsChat(page, capture)
  const done = await phrase(page, scope, 'lookup one')
  const id = (await done.getAttribute('data-message-id'))!
  const stored = (await detailRows(page)).find(row => row.message_id === id)!
  frames.inject(await sessionIdOf(page), id, { type: 'function_error', outcome: 'unknown', error: 'Details are not available for this step.', details: stored.details, details_revision: stored.details_revision, duration_ms: null })
  const row = scope.locator(`${D.row}[data-message-id="${id}"]`)
  await expect(row).toHaveAttribute('data-status', 'unknown')
  return { scope, row, frames, stored }
}

export async function injectMissingResult(page: Page, row: Locator, frames: RecoveryFrames) {
  const id = (await row.getAttribute('data-message-id'))!
  const stored = (await detailRows(page)).find(item => item.message_id === id)!
  const details = { ...stored.details, result: { ...stored.details.result, availability: 'not_captured', summary: null, preview: null, has_full: false, masked_paths: [] } }
  frames.inject(await sessionIdOf(page), id, { type: 'function_success', function_name: stored.metadata.function_name, outcome: null, details, details_revision: stored.details_revision, duration_ms: stored.metadata.duration_ms ?? null })
}

/** The corrected malformed-JSON fixture needs a runtime restart. */
export async function injectInvalidArguments(page: Page, row: Locator, frames: RecoveryFrames) {
  const id = (await row.getAttribute('data-message-id'))!
  const stored = (await detailRows(page)).find(item => item.message_id === id)!
  const details = {
    ...stored.details,
    result: { ...stored.details.result, availability: 'not_captured', preview: null, summary: null, has_full: false },
    error: { ...stored.details.error, availability: 'available', preview: { value: 'Failed to parse arguments: injected malformed JSON', cut: [], numbers: [] }, has_full: false },
    timing: { ...stored.details.timing, availability: 'not_captured', preview: null, summary: null, has_full: false },
  }
  frames.inject(await sessionIdOf(page), id, { type: 'function_error', function_name: stored.metadata.function_name, outcome: 'invalid_arguments', details, details_revision: stored.details_revision, duration_ms: null })
  await expect(row).toHaveAttribute('data-status', 'not_run')
}

export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.waitForLoadState('networkidle')
  await page.goto('/home')
  const home = page.frameLocator(pageIframeSelector('app.views:main'))
  await home.getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).click()
  await expect(page.locator('.wippy-host-app')).toBeVisible()
}

export interface Shot { state: string, group: string, width: number, theme: string, injected: boolean, file: string, problems: string[], measurements: Awaited<ReturnType<typeof measure>> }
export async function measure(element: Locator) {
  return element.evaluate(root => {
    const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
    const parent = (node: Element): Element | null => node.parentElement ?? (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null)
    const visible = (node: Element) => {
      const box = rect(node)
      if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return false
      for (let n = parent(node); n; n = parent(n)) {
        const style = getComputedStyle(n), clip = rect(n)
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (box.bottom <= clip.y || box.y >= clip.bottom)) return false
      }
      return box.bottom > 0 && box.y < innerHeight
    }
    const rgba = (color: string): number[] => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).map(n => n / 255)
    }
    const over = (fg: number[], bg: number[]) => {
      const a = fg[3] + bg[3] * (1 - fg[3])
      return [0, 1, 2].map(i => a ? (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a : 0).concat(a)
    }
    const background = (node: Element) => {
      const chain: Element[] = []
      for (let n: Element | null = node; n; n = parent(n)) chain.unshift(n)
      return chain.reduce((bg, n) => over(rgba(getComputedStyle(n).backgroundColor), bg), [1, 1, 1, 1])
    }
    const luminance = (color: number[]) => color.slice(0, 3).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0)
    const controls = Array.from(root.querySelectorAll('.chat-tool-row__toggle,.chat-approval__details-toggle,.chat-tool-panel__copy')).filter(visible).map(node => {
      const bounds = rect(node)
      const clipping: string[] = []
      for (let n = parent(node); n; n = parent(n)) {
        const style = getComputedStyle(n), box = rect(n)
        if ((/(hidden|clip|auto|scroll)/.test(style.overflowX) && (bounds.x - 4 < box.x + n.clientLeft - 0.5 || bounds.right + 4 > box.x + n.clientLeft + n.clientWidth + 0.5))
          || (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (bounds.y - 4 < box.y + n.clientTop - 0.5 || bounds.bottom + 4 > box.y + n.clientTop + n.clientHeight + 0.5))) clipping.push(n.className.toString())
      }
      return { class: node.className, bounds, clipped: clipping.length > 0, clipping }
    })
    const contrasts = Array.from(root.querySelectorAll('.chat-tool-row__name,.chat-tool-row__note,.chat-tool-row__timer,.chat-tool-row__auto-text,.chat-tool-panel__duration,.chat-tool-panel__hidden-note,.chat-tool-panel__masked-note,.chat-tool-panel__cut-note,.chat-tool-panel__decision,.chat-tool-panel__value,.chat-tool-panel__heading,.chat-approval-key')).filter(visible).map(node => {
      const bg = background(node), fg = over(rgba(getComputedStyle(node).color), bg)
      const a = luminance(fg), b = luminance(bg)
      return { class: node.className, text: node.textContent?.trim(), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), color: getComputedStyle(node).color, background: bg }
    })
    const overlaps: string[] = []
    for (const line of root.querySelectorAll('.chat-tool-row__line,.chat-tool-panel__actions')) {
      const children = Array.from(line.children).filter(visible)
      children.forEach((a, i) => children.slice(i + 1).forEach(b => {
        const x = rect(a), y = rect(b)
        if (Math.min(x.right, y.right) - Math.max(x.x, y.x) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.y, y.y) > 1)
          overlaps.push(`${a.className} / ${b.className}`)
      }))
    }
    return { bounds: rect(root), rowHeight: root.matches('.chat-tool-row') ? rect(root).height : null, rowCount: root.querySelectorAll('.chat-tool-row').length + Number(root.matches('.chat-tool-row')), display: root.getAttribute('data-display'), themeClass: root.closest('[class*="w-theme-"]')?.className ?? null, controls, contrasts, overlaps }
  })
}

export async function shot(page: Page, shots: Shot[], state: string, group: string, width: number, theme: string, element: Locator, injected = false, capture?: Capture) {
  await mkdir(resolve('.local/b3/visual'), { recursive: true })
  await element.scrollIntoViewIfNeeded()
  if (await element.locator(D.icon).count()) await expect(element.locator(`${D.icon} svg`).first()).toBeVisible()
  await element.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const file = `${state}-${width}-${theme}.png`
  const measurements = await measure(element)
  await element.screenshot({ path: resolve('.local/b3/visual', file) })
  await capture?.idle()
  const problems = capture ? [...capture.problems(), ...capture.networkLog().split('\n').filter(line => line.includes(' FAILED '))] : []
  shots.push({ state, group, width, theme, injected, file, problems, measurements })
  await writeFile(resolve('.local/b3/visual/index.json'), JSON.stringify({ lifecycle: 'in-progress', shots }, null, 2))
}

/** Build sheets from PNGs, using a separate blank page with no app traffic. */
export async function sheets(page: Page, shots: Shot[]) {
  await mkdir(resolve('.local/b3/sheets'), { recursive: true })
  const gallery = await page.context().newPage()
  await gallery.setViewportSize({ width: 1600, height: 1000 })
  for (const group of new Set(shots.map(shot => shot.group))) {
    const images = await Promise.all(shots.filter(shot => shot.group === group).map(async shot => ({ ...shot, data: (await readFile(resolve('.local/b3/visual', shot.file))).toString('base64') })))
    await gallery.setContent(`<html lang="en"><meta charset="utf-8"><style>body{margin:24px;font:16px/1.5 Arial;color:#171717;background:#eee}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;padding:12px;background:#fff}img{display:block;max-width:100%;height:auto}figcaption{margin-bottom:8px}</style><body><h1>Call details: ${group}</h1><div class="grid">${images.map(shot => `<figure><figcaption>${shot.state}, ${shot.width} px, ${shot.theme}${shot.injected ? ', injected' : ''}</figcaption><img alt="${shot.state}" src="data:image/png;base64,${shot.data}"></figure>`).join('')}</div></body></html>`)
    await gallery.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())))
    await gallery.screenshot({ path: resolve('.local/b3/sheets', `${group}.png`), fullPage: true })
  }
  await gallery.close()
  await writeFile(resolve('.local/b3/visual/index.json'), JSON.stringify({ lifecycle: 'completed', shots }, null, 2))
}
