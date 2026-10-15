import type { Frame, Locator, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { expect } from '@playwright/test'
import { loginAsAdmin } from './login'
import { attentionSnapshotsFromAttachments } from './attention-v2'

export type AttentionEngine = 'iframe' | 'fragment'
export type AttentionLayout = 'compat' | 'managed'
export type AttentionMode = 'disabled' | 'enabled'
export type AttentionVisualMode = 'denied' | 'none'

export interface AttentionRuntimeCell {
  actionTtlSeconds: number
  engine: AttentionEngine
  layout: AttentionLayout
  mode: AttentionMode
  visualCapture: boolean
  visualMode: AttentionVisualMode
}

export interface ContextAttachment {
  attachment_id: string
  content: string
  content_bytes: number
  content_hash: string
  content_type: 'application/json'
  created_at: string
  expires_at?: string
  kind: string
  version: number
}

export interface AttentionPathSegment {
  artifact_id?: string
  generation: number
  kind: string
  mount_id: string
  package_id?: string
  page_id?: string
  panel_id?: string
  selector_hint?: string
  tag_name?: string
  [key: string]: unknown
}

export interface AttentionCandidate {
  action_ref?: {
    generation: number
    host_instance_id: string
    label?: string
    mount_id: string
    path_digest: string
    rect: { height: number, width: number, x: number, y: number }
    target_id: string
  }
  path: AttentionPathSegment[]
  rect?: { height: number, width: number, x: number, y: number }
  sample_point_ids: string[]
  summary?: { name?: string, role?: string, text?: string }
  target_id: string
}

export interface AttentionSnapshot {
  capture: {
    complete: boolean
    duration_ms: number
    grid_step_css_px: number
    points: Array<{ point_id: string, x: number, y: number }>
    radius_css_px: number
    sampled_points: number
  }
  candidates: AttentionCandidate[]
  coordinate_space: {
    device_pixel_ratio: number
    height: number
    kind: 'host-viewport'
    width: number
  }
  created_at: string
  focus?: {
    candidate_id?: string
    event_id: string
    focused_at: string
    path: AttentionPathSegment[]
    sequence: number
    summary?: { name?: string, role?: string, text?: string }
  }
  host_instance_id: string
  mount_generation: number
  omissions?: Array<{ capture_code?: string, mount_id?: string, point_id?: string, reason: string }>
  pointer?: {
    candidate_ids: string[]
    event_id: string
    observed_at: string
    point: { point_id: string, x: number, y: number }
    sequence: number
  }
  recent_events: Array<{ event_id: string, observed_at: string, sequence: number }>
  selection?: {
    selection_id: string
    selected_at: string
    kind: 'text'
    collapsed: false
    direction: 'forward' | 'backward' | 'none'
    text: string
    anchor_path: AttentionPathSegment[]
    focus_path: AttentionPathSegment[]
    ranges: Array<{
      rect: { x: number, y: number, width: number, height: number }
      coordinate_space: 'host-viewport' | { mount_id: string, generation: number }
    }>
  }
  schema: 'wippy.attention.v1'
  snapshot_id: string
}

export interface CapturedSessionMessage {
  data: {
    file_uuids?: string[]
    context_attachments?: ContextAttachment[]
    context_attachments_ref?: ContextAttachmentReference
    runtime_context?: {
      attention?: { agent_actions_enabled: boolean, host_instance_id: string }
    }
    text: string
  }
  message_id: string
  request_id: string
  session_id: string
  type: 'session_message'
}

export interface ContextAttachmentReference {
  version: 1
  id: string
  content_hash: string
  content_bytes: number
}

export interface HttpStageMetrics {
  at: number
  requestId?: string
  method: 'GET' | 'POST' | 'DELETE'
  requestBytes: number
  status?: number
  failed?: boolean
  attachmentCount: number
  attention: AttentionPayloadMetrics['attention']
}

const httpStages = new WeakMap<Page, HttpStageMetrics[]>()

export function capturedHttpStageMetrics(page: Page): HttpStageMetrics[] {
  return structuredClone(httpStages.get(page) ?? [])
}

export function canonicalContextValue(input: unknown): string {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value))
      return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object')
      return `{${Object.keys(value).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))).map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
    return JSON.stringify(value)
  }
  return canonical(input)
}

export function canonicalContextArray(attachments: ContextAttachment[]): string {
  return canonicalContextValue(attachments)
}

export interface AttentionPayloadMetrics {
  at: number
  requestId?: string
  socketId: string
  commandBytes: number
  attachmentArrayBytes: number
  attachmentCount: number
  attention: Array<{
    encodingVersion?: number
    pathDictionaryBytes?: number
    snapshotJsonBytes: number
    candidateCount: number
    pathSegmentCount: number
    uniquePathSegmentCount: number
    recentEventCount: number
    samplePointCount: number
    candidatesBytes: number
    candidatePathsBytes: number
    captureBytes: number
    focusBytes: number
    pointerBytes: number
    recentEventsBytes: number
  }>
}

export interface CapturedCorrelatedReply {
  attachmentsShape?: 'missing' | 'array' | 'object' | 'other'
  attachmentReceiptCount?: number
  context_attachments_transport?: { version: number, staging: boolean, max_context_bytes: number }
  context_attachments_capabilities_shape?: {
    shape: 'missing' | 'object' | 'array' | 'other'
    version?: number
    handler_count?: number
    handlers?: Array<{ kind?: string, versions?: number[] }>
  }
  attachments?: Array<{
    attachment_id: string
    content_hash: string
    kind: string
    version: number
  }>
  code?: string
  detail_code?: string
  message_id?: string
  request_id: string
  success: boolean
  socket_id: string
  received_at: number
  topic?: string
  type: 'command_response' | 'received' | 'error'
}

export interface AcknowledgedSessionMessage extends CapturedSessionMessage {
  receipt: CapturedCorrelatedReply
  persistedMessageId: string
  persistedContextAttachments?: ContextAttachment[]
}

export interface CapturedUiActionResult {
  data: {
    in_reply_to_action_id: string
    prepared_file?: { uuid: string, name: string, mime_type: string, byte_size: number, sha256: string, scope: string, [key: string]: unknown }
    selected_target?: {
      snapshot_id: string
      target_id: string
      host_instance_id: string
      mount_id: string
      generation: number
      path_digest: string
      rect: { height: number, width: number, x: number, y: number }
      label?: string
    }
    status: string
  }
  session_id: string
  type: 'session_ui_action_result'
}

export interface PersistedMessage {
  data: string
  message_id: string
  metadata?: {
    context_attachments?: ContextAttachment[]
    call_id?: string
    error_code?: string
    registry_id?: string
    result?: unknown
    source_id?: string
    status?: string
    system_action?: string
  }
  session_id: string
  type: string
}

/** The raw `session_ui_action_request` envelope a Host socket received. */
export interface CapturedUiActionRequestEnvelope {
  topic: string
  data: {
    action_id: string
    created_at: string
    expires_at: string
    host_instance_id: string
    message_type: string
    mode: string
    request_id: string
    session_id: string
    [key: string]: unknown
  }
}

/** One `ATTENTION_E2E_READ` answer from the deterministic agent. */
export interface AttentionReadReport {
  mode: string
  results: Array<Record<string, unknown> & {
    columns?: string[]
    continuation?: string
    event?: { candidate_ids?: string[] } | false
    host?: string
    mounts?: Array<[string, string, number]>
    nodes?: unknown[][]
    outcome?: string
    paths?: Array<Record<string, unknown>>
    raw?: string
    root?: [string, number]
    schema?: string
    status?: string
  }>
}

export const ATTENTION_E2E_AGENT = 'app.attention_e2e:agent'
export const ATTENTION_E2E_AGENT_WITHOUT_ATTENTION = 'app.attention_e2e:agent_without_attention'

export interface CapturedIncomingPacket {
  socket_id: string
  received_at: number
  topic: string
  type: string
  request_id?: string
  session_id?: string
  message_id?: string
  response_id?: string
  root_message_id?: string
  call_id?: string
  status?: string
  success?: boolean
  attachmentsShape?: 'missing' | 'array' | 'object' | 'other'
  attachmentReceiptCount?: number
}

interface AttentionSendLifecycle {
  at: number
  status: string
  request_id?: string
  session_id?: string
  message_id?: string
  composers: Array<{ session_id?: string, status: string }>
}

const sendLifecycles = new WeakMap<Page, AttentionSendLifecycle[]>()

export function capturedAttentionSendLifecycle(page: Page): AttentionSendLifecycle[] {
  return structuredClone(sendLifecycles.get(page) ?? [])
}

async function recordSendLifecycle(page: Page, status: string, identity: Partial<CapturedIncomingPacket> = {}): Promise<void> {
  const records = sendLifecycles.get(page)
  if (!records)
    return
  const id = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) ? value : undefined
  const composers = await composerDiagnostics(page).catch(() => [])
  records.push({
    at: Date.now(),
    status,
    request_id: id(identity.request_id),
    session_id: id(identity.session_id),
    message_id: id(identity.message_id),
    composers: composers.map(composer => ({
      session_id: id(composer.sessionId),
      status: !composer.connected ? 'detached'
        : !composer.visible ? 'hidden'
          : !composer.editable ? 'disabled'
            : composer.stopVisible ? 'stop-visible'
              : !composer.sendVisible ? 'send-hidden'
                : composer.sessionStatus ?? 'unknown',
    })),
  })
  if (records.length > 128)
    records.splice(0, records.length - 128)
}

/** Self-contained so the same allowlist can be checked without launching a browser. */
export function installAttentionIncomingDiagnostics(): void {
  const wire = window as typeof window & {
    __wippyAttentionE2EIncoming?: CapturedIncomingPacket[]
    __wippyAttentionE2ESanitizeIncoming?: (envelope: unknown, socketId: string, at: number) => CapturedIncomingPacket | undefined
  }
  wire.__wippyAttentionE2EIncoming = []
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  wire.__wippyAttentionE2ESanitizeIncoming = (envelope, socketId, at) => {
    if (!record(envelope) || !record(envelope.data) || !uuid(socketId) || !Number.isFinite(at) || typeof envelope.topic !== 'string')
      return undefined
    const topic = /^session:([^:]+)(?::message:([^:]+))?$/.exec(envelope.topic)
    if (!topic || !uuid(topic[1]) || (topic[2] !== undefined && !uuid(topic[2])))
      return undefined
    const data = envelope.data
    if (typeof data.type !== 'string' || !['command_response', 'session_open', 'session_closed', 'status', 'update', 'received', 'content', 'done', 'error', 'function_call', 'function_success', 'function_error', 'invalidate'].includes(data.type))
      return undefined
    const result: CapturedIncomingPacket = { socket_id: socketId, received_at: at, topic: envelope.topic, type: data.type }
    for (const key of ['request_id', 'session_id', 'message_id', 'response_id', 'root_message_id'] as const) {
      if (uuid(data[key]))
        result[key] = data[key]
    }
    if (typeof data.call_id === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(data.call_id))
      result.call_id = data.call_id
    if (typeof data.status === 'string' && ['idle', 'running', 'stopped', 'error', 'completed', 'pending', 'success'].includes(data.status))
      result.status = data.status
    if (typeof data.success === 'boolean')
      result.success = data.success
    if (data.type === 'received' || data.type === 'command_response') {
      const attachments = data.context_attachments ?? data.attachments
      result.attachmentsShape = attachments === undefined ? 'missing'
        : Array.isArray(attachments) ? 'array'
          : record(attachments) ? 'object' : 'other'
      if (Array.isArray(attachments))
        result.attachmentReceiptCount = Math.min(attachments.length, 9)
    }
    return result
  }
}

export interface RawSessionMessageResult {
  reply: CapturedCorrelatedReply
  outboundMessageId: string
  persistedMessageId?: string
  requestId: string
  socketId: string
}

export interface RawSessionMessageOptions {
  outboundMessageId?: string
  requestId?: string
  reference?: ContextAttachmentReference
  runtimeContext?: CapturedSessionMessage['data']['runtime_context']
  receiverCapabilityProbe?: boolean
  expectTransportClose?: boolean
}

export interface AttentionFixture {
  leftChild: Locator
  leftSafeText: Locator
  leftTarget: Locator
  rightChild: Locator
  rightSafeText: Locator
  rightTarget: Locator
}

type LocatorRoot = Page | Frame

let lastDisconnectedSockets: Array<{ realmId: string, url: string }> = []

interface AttentionSocketEvent {
  at: number
  code?: number
  event: string
  messageId?: string
  reason?: 'e2e_disconnect' | 'user_disconnect' | 'empty' | 'other_redacted'
  requestId?: string
  sessionId?: string
  sessionStatus?: string
  socketId: string
  state: number
  type?: string
  wasClean?: boolean
}

function requiredOption<T extends string>(name: string, allowed: readonly T[]): T {
  const value = process.env[name]
  if (!value || !allowed.includes(value as T))
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  return value as T
}

function booleanOption(name: string, fallback = false): boolean {
  const value = process.env[name]
  if (value === undefined)
    return fallback
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  throw new Error(`${name} must be true or false`)
}

function positiveIntegerOption(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined)
    return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`)
  return parsed
}

export function attentionRuntimeCell(): AttentionRuntimeCell {
  const mode = process.env.WIPPY_ATTENTION_MODE ?? 'enabled'
  if (mode !== 'enabled' && mode !== 'disabled')
    throw new Error('WIPPY_ATTENTION_MODE must be one of: enabled, disabled')
  const visualCapture = booleanOption('WIPPY_ATTENTION_VISUAL')
  const visualMode = process.env.WIPPY_ATTENTION_VISUAL_MODE ?? (visualCapture ? 'denied' : 'none')
  if (!['denied', 'none'].includes(visualMode))
    throw new Error('WIPPY_ATTENTION_VISUAL_MODE must be one of: denied, none')
  return {
    layout: requiredOption<AttentionLayout>('WIPPY_LAYOUT', ['compat', 'managed']),
    engine: requiredOption<AttentionEngine>('WIPPY_ENGINE', ['iframe', 'fragment']),
    mode,
    visualCapture,
    visualMode: visualMode as AttentionVisualMode,
    actionTtlSeconds: positiveIntegerOption('WIPPY_UI_ACTION_TTL_SECONDS', 120),
  }
}

function roots(page: Page): LocatorRoot[] {
  return [page, ...page.frames().filter(frame => frame !== page.mainFrame())]
}

const fragmentGatewayDiagnostics = new WeakMap<Page, {
  failureReasons: Record<string, number>
  failures: number
  navigationRequests: number
  requests: number
  resourceTypes: Record<string, number>
  statuses: Record<string, number>
}>()

async function fragmentBootstrapDiagnostics(page: Page) {
  const diagnostics: Array<Record<string, unknown>> = []
  for (const root of roots(page)) {
    const fragments = root.locator('web-fragment[fragment-id]')
    const fragmentCount = await fragments.count().catch(() => 0)
    const loadErrorCount = await root
      .locator('wippy-error[title="Failed to load page"]')
      .count()
      .catch(() => 0)
    for (let index = 0; index < fragmentCount; index++) {
      const occurrenceId = await fragments.nth(index).getAttribute('fragment-id').catch(() => null)
      const playwrightRealmExists = Boolean(
        occurrenceId && page.frames().some(frame => frame.name() === `wf:${occurrenceId}`),
      )
      const state = await fragments.nth(index).evaluate((fragment) => {
        const occurrenceId = fragment.getAttribute('fragment-id')
        const fragmentHost = fragment.shadowRoot?.querySelector('web-fragment-host') as (HTMLElement & {
          isInitialized?: boolean
        }) | null
        const ownerFragmentElementRegistered = Boolean(
          fragment.ownerDocument.defaultView?.customElements.get('web-fragment'),
        )
        const lifecycle = {
          fragmentConnected: fragment.isConnected,
          fragmentShadowRootExists: Boolean(fragment.shadowRoot),
          fragmentHostExists: Boolean(fragmentHost),
          fragmentHostConnected: Boolean(fragmentHost?.isConnected),
          fragmentHostInitialized: fragmentHost?.isInitialized === true,
          fragmentHostShadowRootExists: Boolean(fragmentHost?.shadowRoot),
        }
        const realm = occurrenceId
          ? [...fragment.ownerDocument.querySelectorAll<HTMLIFrameElement>('iframe[name]')]
              .find(frame => frame.name === `wf:${occurrenceId}`)
          : undefined
        if (!realm) {
          return {
            realmExists: false,
            realmAccessible: false,
            realmAppExists: false,
            configInstalled: false,
            apiInstalled: false,
            ownerFragmentElementRegistered,
            ...lifecycle,
          }
        }
        try {
          const realmWindow = realm.contentWindow as Window & {
            __WIPPY_APP_API__?: unknown
            __WIPPY_APP_CONFIG__?: unknown
          }
          return {
            realmExists: true,
            realmAccessible: Boolean(realm.contentDocument),
            realmAppExists: Boolean(realm.contentDocument?.querySelector('#app')),
            configInstalled: realmWindow.__WIPPY_APP_CONFIG__ !== undefined,
            apiInstalled: realmWindow.__WIPPY_APP_API__ !== undefined,
            ownerFragmentElementRegistered,
            ...lifecycle,
          }
        }
        catch {
          return {
            realmExists: true,
            realmAccessible: false,
            realmAppExists: false,
            configInstalled: false,
            apiInstalled: false,
            ownerFragmentElementRegistered,
            ...lifecycle,
          }
        }
      }).catch(() => ({ detached: true }))
      diagnostics.push({
        root: root === page ? 'page' : 'frame',
        index,
        loadErrorCount,
        playwrightRealmExists,
        ...state,
      })
    }
  }
  return {
    fragments: diagnostics,
    gateway: fragmentGatewayDiagnostics.get(page) ?? {
      failureReasons: {},
      failures: 0,
      navigationRequests: 0,
      requests: 0,
      resourceTypes: {},
      statuses: {},
    },
  }
}

export async function attentionOverlayCount(page: Page): Promise<number> {
  return (await Promise.all(
    roots(page).map(root => root.locator('[data-wippy-attention-overlay]').count()),
  )).reduce((total, count) => total + count, 0)
}

export async function findVisible(
  page: Page,
  create: (root: LocatorRoot) => Locator,
  description: string,
  timeout = 20_000,
): Promise<Locator> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const root of roots(page)) {
      const candidate = create(root)
      try {
        if (await candidate.count() === 1 && await candidate.isVisible())
          return candidate
      }
      catch {
        // A frame transition can detach a locator between discovery and use.
      }
    }
    await page.waitForTimeout(100)
  }
  const fragmentDiagnostics = await fragmentBootstrapDiagnostics(page)
  throw new Error(`Visible Attention E2E element not found: ${description}; fragment bootstrap: ${JSON.stringify(fragmentDiagnostics)}`)
}

export function findVisibleTestId(page: Page, testId: string, timeout?: number): Promise<Locator> {
  return findVisible(page, root => root.getByTestId(testId), `[data-testid="${testId}"]`, timeout)
}

export function findVisibleRole(
  page: Page,
  role: Parameters<LocatorRoot['getByRole']>[0],
  name: string | RegExp,
  timeout?: number,
): Promise<Locator> {
  return findVisible(page, root => root.getByRole(role, { name }), `${role} ${String(name)}`, timeout)
}

const compositionFailures = new WeakMap<Page, string[]>()

export function capturedCompositionFailures(page: Page): string[] {
  return [...(compositionFailures.get(page) ?? [])]
}

export async function installAttentionWireTap(page: Page): Promise<void> {
  sendLifecycles.set(page, [])
  await page.addInitScript(installAttentionIncomingDiagnostics)
  const fragmentGateway = {
    failureReasons: {} as Record<string, number>,
    failures: 0,
    navigationRequests: 0,
    requests: 0,
    resourceTypes: {} as Record<string, number>,
    statuses: {} as Record<string, number>,
  }
  fragmentGatewayDiagnostics.set(page, fragmentGateway)
  page.on('request', (request) => {
    if (!new URL(request.url()).pathname.startsWith('/@fragment/'))
      return
    fragmentGateway.requests++
    const resourceType = request.resourceType()
    fragmentGateway.resourceTypes[resourceType] = (fragmentGateway.resourceTypes[resourceType] ?? 0) + 1
    if (request.isNavigationRequest())
      fragmentGateway.navigationRequests++
  })
  page.on('response', (response) => {
    if (!new URL(response.url()).pathname.startsWith('/@fragment/'))
      return
    const status = String(response.status())
    fragmentGateway.statuses[status] = (fragmentGateway.statuses[status] ?? 0) + 1
  })
  page.on('requestfailed', (request) => {
    if (!new URL(request.url()).pathname.startsWith('/@fragment/'))
      return
    fragmentGateway.failures++
    const failureText = request.failure()?.errorText ?? ''
    const reason = ['ERR_ABORTED', 'ERR_FAILED', 'ERR_BLOCKED_BY_CLIENT', 'ERR_CONNECTION_RESET']
      .find(code => failureText.includes(code)) ?? 'other'
    fragmentGateway.failureReasons[reason] = (fragmentGateway.failureReasons[reason] ?? 0) + 1
  })
  const stages: HttpStageMetrics[] = []
  httpStages.set(page, stages)
  const requests = new WeakMap<import('@playwright/test').Request, HttpStageMetrics>()
  page.on('request', (request) => {
    const url = new URL(request.url())
    const method = request.method()
    if (url.pathname !== '/api/v1/sessions/context' || !['GET', 'POST', 'DELETE'].includes(method))
      return
    const body = request.postDataBuffer()
    const metric: HttpStageMetrics = {
      at: Date.now(),
      requestId: /^[0-9a-f-]{36}$/i.test(url.searchParams.get('request_id') ?? '') ? url.searchParams.get('request_id')! : undefined,
      method: method as HttpStageMetrics['method'],
      requestBytes: body?.byteLength ?? 0,
      attachmentCount: 0,
      attention: [],
    }
    if (body && body.byteLength <= 64 * 1024) {
      try {
        const attachments = JSON.parse(body.toString('utf8'))
        if (Array.isArray(attachments)) {
          metric.attachmentCount = attachments.length
          for (const attachment of attachments) {
            if (attachment?.kind !== 'wippy.attention' || ![1, 2, 3, 4].includes(attachment.version) || typeof attachment.content !== 'string')
              continue
            const snapshot = JSON.parse(attachment.content)
            if (!Array.isArray(snapshot.candidates) || !Array.isArray(snapshot.recent_events))
              continue
            const bytes = (value: unknown) => value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value))
            const paths = snapshot.candidates.map((candidate: AttentionCandidate & { path_indices?: number[] }) => [2, 3, 4].includes(attachment.version) ? candidate.path_indices ?? [] : candidate.path ?? [])
            metric.attention.push({
              encodingVersion: attachment.version,
              pathDictionaryBytes: bytes(snapshot.path_dictionary),
              snapshotJsonBytes: Buffer.byteLength(attachment.content),
              candidateCount: snapshot.candidates.length,
              pathSegmentCount: paths.flat().length,
              uniquePathSegmentCount: [2, 3, 4].includes(attachment.version) ? snapshot.path_dictionary?.length ?? 0 : new Set(paths.flat().map((segment: AttentionPathSegment) => JSON.stringify(segment))).size,
              recentEventCount: snapshot.recent_events.length,
              samplePointCount: attachment.version === 1 ? snapshot.capture?.points?.length ?? 0 : snapshot.capture?.sampled_points ?? 0,
              candidatesBytes: bytes(snapshot.candidates),
              candidatePathsBytes: paths.reduce((count: number, path: AttentionPathSegment[]) => count + bytes(path), 0),
              captureBytes: bytes(snapshot.capture),
              focusBytes: bytes(snapshot.focus),
              pointerBytes: bytes(snapshot.pointer),
              recentEventsBytes: bytes(snapshot.recent_events),
            })
          }
        }
      }
      catch {
        // Record size/status for malformed input, never its raw content.
      }
    }
    stages.push(metric)
    if (stages.length > 256)
      stages.shift()
    requests.set(request, metric)
  })
  page.on('response', (response) => {
    const metric = requests.get(response.request())
    if (metric)
      metric.status = response.status()
  })
  page.on('requestfailed', (request) => {
    const metric = requests.get(request)
    if (metric)
      metric.failed = true
  })
  const failures: string[] = []
  compositionFailures.set(page, failures)
  page.on('console', async (message) => {
    const rendered = message.text()
    if (!rendered.includes('Unable to collect or send message context'))
      return
    const sizeMatch = rendered.match(/context-transport-invalid-attachments-integrity-attachment-bytes-exceeded-(\d+)-limit-(\d+)/)
    if (sizeMatch && Number(sizeMatch[1]) <= 1_048_576 && Number(sizeMatch[2]) <= 1_048_576) {
      failures.push(sizeMatch[0])
      return
    }
    const v3BreakdownMatch = rendered.match(/attention-v3-byte-limit-(\d+)-limit-(\d+)-paths-(\d+)-candidates-(\d+)-capture-(\d+)-pointer-(\d+)-focus-(\d+)-events-(\d+)-omissions-(\d+)-omission-count-(\d+)-omission-groups-(\d+)-omission-points-(\d+)/)
    if (v3BreakdownMatch && v3BreakdownMatch.slice(1).every(value => Number(value) <= 1_048_576)) {
      failures.push(v3BreakdownMatch[0])
      return
    }
    const v3SizeMatch = rendered.match(/attention-v3-byte-limit-(\d+)-limit-(\d+)/)
    if (v3SizeMatch && Number(v3SizeMatch[1]) <= 1_048_576 && Number(v3SizeMatch[2]) <= 1_048_576) {
      failures.push(v3SizeMatch[0])
      return
    }
    const validationCode = ['array-required', 'too-many-attachments', 'total-bytes-exceeded', 'invalid-envelope', 'duplicate-attachment-id', 'attachment-bytes-exceeded', 'content-size-mismatch', 'invalid-content-hash', 'content-hash-mismatch', 'action-ref-path-digest-mismatch', 'noncanonical-content', 'forbidden-live-field', 'expired', 'invalid-attention-payload']
      .find(code => rendered.includes(`context-transport-invalid-attachments-integrity-${code}`))
    if (validationCode) {
      failures.push(`context-transport-invalid-attachments-integrity-${validationCode}`)
      return
    }
    const renderedCategory = [
      ['The active session receiver does not support staged context', 'receiver-staging-unsupported'],
      ['The active session receiver returned invalid context attachment capabilities', 'receiver-capabilities-invalid'],
      ['The active session receiver context attachment capabilities disagree with HTTP discovery', 'receiver-capabilities-mismatch'],
      ['The active session receiver does not support required Attention context version 2', 'receiver-attention-v2-unsupported'],
      ['The active session receiver does not support required Attention context version 3', 'receiver-attention-v3-unsupported'],
      ['Attention context could not be compacted because its semantic payload is invalid', 'attention-v1-compaction-input-invalid'],
      ['receiver-staging-unsupported', 'receiver-staging-unsupported'],
      ['receiver-capabilities-invalid', 'receiver-capabilities-invalid'],
      ['receiver-capabilities-mismatch', 'receiver-capabilities-mismatch'],
      ['receiver-attention-v2-unsupported', 'receiver-attention-v2-unsupported'],
      ['receiver-attention-v3-unsupported', 'receiver-attention-v3-unsupported'],
      ['attention-v3-byte-limit', 'attention-v3-byte-limit'],
      ['attention-v1-compaction-input-invalid', 'attention-v1-compaction-input-invalid'],
      ['context-transport-invalid-attachments-clone', 'context-transport-invalid-attachments-clone'],
      ['context-transport-invalid-attachments-integrity', 'context-transport-invalid-attachments-integrity'],
      ['context-transport-invalid-attachments-empty', 'context-transport-invalid-attachments-empty'],
      ['context-transport-invalid-attachments-canonical', 'context-transport-invalid-attachments-canonical'],
      ['context-transport-invalid-attachments-byte-limit', 'context-transport-invalid-attachments-byte-limit'],
      ['context-transport-invalid-attachments', 'context-transport-invalid-attachments'],
      ['context-lifecycle-cancelled', 'context-lifecycle-cancelled'],
      ['context-transport-unknown', 'context-transport-unknown'],
      ['[unknown]', 'unknown'],
    ].find(([needle]) => rendered.includes(needle))?.[1]
    if (renderedCategory) {
      failures.push(renderedCategory)
      return
    }
    for (const argument of message.args()) {
      const category = await argument.evaluate((value) => {
        const error = value && typeof value === 'object'
          ? value.error ?? value.extra?.error ?? value.data?.extra?.error
          : undefined
        const text = error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : error && typeof error === 'object' && typeof error.message === 'string'
              ? error.message
              : ''
        if (text.startsWith('Attention snapshot cannot fit'))
          return 'attachment-budget'
        if (text.startsWith('Invalid context attachments:'))
          return 'attachment-validation'
        if (text === 'The active session receiver does not support staged context')
          return 'receiver-staging-unsupported'
        if (text === 'The active session receiver returned invalid context attachment capabilities')
          return 'receiver-capabilities-invalid'
        if (text === 'The active session receiver context attachment capabilities disagree with HTTP discovery')
          return 'receiver-capabilities-mismatch'
        if (text === 'The active session receiver does not support required Attention context version 2')
          return 'receiver-attention-v2-unsupported'
        if (text === 'Attention context could not be compacted because its semantic payload is invalid')
          return 'attention-v1-compaction-input-invalid'
        if (text.startsWith('Attention snapshot'))
          return 'snapshot-identity'
        if (text === 'Message outcome is unconfirmed: attachment receipts did not match')
          return 'ack-attachment-receipts'
        if (text === 'Message outcome is unconfirmed: acknowledgement identity did not match'
          || text === 'Message outcome is unconfirmed: acknowledgement message identity did not match')
          return 'ack-message-identity'
        if (text.startsWith('Message outcome is unconfirmed:'))
          return 'ack-unconfirmed'
        if (text.startsWith('An earlier message is unconfirmed;'))
          return 'prior-message-unconfirmed'
        if (text === 'A message is already being sent for this session')
          return 'send-already-pending'
        if (text.startsWith('Message send was cancelled') || text.startsWith('Message context was cancelled'))
          return 'send-lifecycle-cancelled'
        return undefined
      }).catch(() => undefined)
      if (category && failures.length < 32)
        failures.push(category)
    }
    if (!failures.length)
      failures.push('unclassified-composition-failure')
  })
  await page.addInitScript(() => {
    const wire = window as typeof window & {
      __wippyAttentionE2ECommandResponses?: unknown[]
      __wippyAttentionE2ERealmId?: string
      __wippyAttentionE2ESocketEvents?: AttentionSocketEvent[]
      __wippyAttentionE2EDisconnectBaselineSocketIds?: string[]
      __wippyAttentionE2ESocket?: WebSocket
      __wippyAttentionE2ESockets?: WebSocket[]
      __wippyAttentionE2EProtocol?: unknown[]
      __wippyAttentionE2EWire?: unknown[]
      __wippyAttentionE2EPayloadMetrics?: AttentionPayloadMetrics[]
      __wippyAttentionE2EIncoming?: CapturedIncomingPacket[]
      __wippyAttentionE2ESanitizeIncoming?: (envelope: unknown, socketId: string, at: number) => CapturedIncomingPacket | undefined
      __wippyAttentionE2EUiActionRequests?: unknown[]
    }
    wire.__wippyAttentionE2EUiActionRequests = []
    wire.__wippyAttentionE2ECommandResponses = []
    wire.__wippyAttentionE2ERealmId = crypto.randomUUID()
    wire.__wippyAttentionE2ESocketEvents = []
    wire.__wippyAttentionE2EDisconnectBaselineSocketIds = []
    wire.__wippyAttentionE2ESockets = []
    wire.__wippyAttentionE2EProtocol = []
    wire.__wippyAttentionE2EWire = []
    wire.__wippyAttentionE2EPayloadMetrics = []
    const observedSockets = new WeakSet<WebSocket>()
    const socketEvent = (socket: WebSocket, event: string, detail: Partial<AttentionSocketEvent> = {}) => {
      const events = wire.__wippyAttentionE2ESocketEvents!
      events.push({
        ...detail,
        at: Date.now(),
        event,
        socketId: (socket as WebSocket & { __wippyAttentionE2EId: string }).__wippyAttentionE2EId,
        state: socket.readyState,
      })
      if (events.length > 256)
        events.splice(0, events.length - 256)
    }
    const safeReason = (reason?: string): AttentionSocketEvent['reason'] => {
      if (!reason)
        return 'empty'
      if (reason === 'Attention E2E reconnect')
        return 'e2e_disconnect'
      if (reason === 'User disconnected')
        return 'user_disconnect'
      return 'other_redacted'
    }
    const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    const safeText = (value: unknown): string | undefined => typeof value === 'string' && value.length <= 160 ? value : undefined
    const safeInteger = (value: unknown): number | undefined => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined
    const safeMountIds = (value: unknown): string[] | undefined => {
      if (!Array.isArray(value) || value.length > 32)
        return undefined
      const mountIds = value.map(item => record(item) ? item.mount_id : undefined)
        .filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 160)
      return mountIds.length ? mountIds : undefined
    }
    const safePathKinds = (value: unknown): string[] | undefined => {
      if (!Array.isArray(value) || value.length > 64)
        return undefined
      const kinds = value.map((item) => record(item) ? safeText(item.kind) : undefined)
      return kinds.every(Boolean) ? kinds as string[] : undefined
    }
    const safeOmissionReasons = (value: unknown): string[] | undefined => {
      if (!Array.isArray(value) || value.length > 32)
        return undefined
      const reasons = value.map(item => record(item) ? safeText(item.reason) : undefined)
      return reasons.every(Boolean) ? reasons as string[] : undefined
    }
    window.addEventListener('message', (event) => {
      if (typeof event.data !== 'string')
        return
      try {
        const envelope = JSON.parse(event.data)
        const message = envelope?.message
        if (envelope?.action !== 'attention-protocol' || !message)
          return
        const observations = record(message.observations) ? message.observations : undefined
        const focus = observations && record(observations.focus) ? observations.focus : undefined
        const focusState = observations && record(observations.focus_state) ? observations.focus_state : undefined
        wire.__wippyAttentionE2EProtocol!.push({
          accepted_at: new Date().toISOString(),
          focus_state: focusState ? {
            changed_at: safeText(focusState.changed_at),
            retained: focusState.retained === true,
            candidate_id: record(focusState.focus) ? safeText(focusState.focus.candidate_id) : null,
          } : undefined,
          budget_remaining_bytes: Number.isSafeInteger(message.budget?.remaining_bytes)
            ? message.budget.remaining_bytes
            : undefined,
          candidate_count: Array.isArray(message.candidates) ? message.candidates.length : undefined,
          candidate_occluded: Array.isArray(message.candidates)
            ? message.candidates.map((candidate: Record<string, unknown>) => candidate.occluded === true)
            : undefined,
          candidate_shapes: Array.isArray(message.candidates)
            ? message.candidates.slice(0, 8).map((candidate: Record<string, unknown>) => {
                const geometry = record(candidate.geometry) ? candidate.geometry : undefined
                const rect = record(candidate.rect)
                  ? candidate.rect
                  : geometry && record(geometry.border_box) ? geometry.border_box : undefined
                const path = Array.isArray(candidate.path) ? candidate.path : []
                return {
                  target_id: safeText(candidate.target_id),
                  final_tag: path.length && record(path.at(-1)) ? safeText(path.at(-1).tag_name) : undefined,
                  rect: rect
                    ? {
                        x: typeof rect.x === 'number' ? rect.x : undefined,
                        y: typeof rect.y === 'number' ? rect.y : undefined,
                        width: typeof rect.width === 'number' ? rect.width : undefined,
                        height: typeof rect.height === 'number' ? rect.height : undefined,
                      }
                    : undefined,
                  sample_count: Array.isArray(candidate.sample_point_ids) ? candidate.sample_point_ids.length : undefined,
                  branch_mount_ids: path
                    .filter(segment => record(segment) && ['artifact', 'page', 'iframe', 'web-fragment', 'web-component'].includes(String(segment.kind)))
                    .slice(0, 16)
                    .map(segment => record(segment) ? safeText(segment.mount_id) : undefined),
                }
              })
            : undefined,
          candidate_path_lengths: Array.isArray(message.candidates)
            ? message.candidates.map((candidate: Record<string, unknown>) => Array.isArray(candidate.path) ? candidate.path.length : undefined)
            : undefined,
          code: message.code,
          created_at: message.created_at,
          deadline_at: message.deadline_at,
          complete: typeof message.complete === 'boolean'
            ? message.complete
            : typeof observations?.complete === 'boolean' ? observations.complete : undefined,
          focus_present: Boolean(focus),
          focus_candidate_id_present: Boolean(focus && typeof focus.candidate_id === 'string'),
          focused_at: safeText(focus?.focused_at),
          focus_sequence: safeInteger(focus?.sequence),
          focus_final_tag: safeText(focus?.tag_name ?? focus?.tag ?? focus?.name),
          focus_final_path_kinds: safePathKinds(focus?.path),
          omission_reasons: safeOmissionReasons(message.omissions),
          omission_mount_ids: safeMountIds(message.omissions),
          message_type: message.message_type,
          safe_message: [
            'normalized-query-result-candidates-invalid',
            'normalized-query-result-completeness-invalid',
            'normalized-query-result-envelope-invalid',
            'normalized-query-result-observations-invalid',
            'normalized-query-result-omission-capture-code-invalid',
            'normalized-query-result-omission-detail-invalid',
            'normalized-query-result-omission-invalid',
            'normalized-query-result-omission-keys-invalid',
            'normalized-query-result-omission-mount-id-invalid',
            'normalized-query-result-omission-point-id-invalid',
            'normalized-query-result-omission-reason-invalid',
            'normalized-query-result-point-duplicate',
            'normalized-query-result-point-omission-count-invalid',
            'normalized-query-result-point-omission-invalid',
            'normalized-query-result-point-omission-value-invalid',
            'normalized-query-result-point-shape-invalid',
            'normalized-query-result-point-state-invalid',
            'normalized-query-result-mismatch',
          ].includes(message.message)
            ? message.message
            : undefined,
          observation_pointer: message.observations?.pointer
            ? {
                candidate_count: message.observations.pointer.candidate_ids?.length,
                observed_at: message.observations.pointer.observed_at,
                point: message.observations.pointer.point,
                type: message.observations.pointer.type,
              }
            : undefined,
          point_count: Array.isArray(message.points) ? message.points.length : undefined,
          result_bytes: message.message_type === 'query-result'
            ? new TextEncoder().encode(JSON.stringify(message)).byteLength
            : undefined,
          parent_request_id: message.parent_request_id,
          request_id: message.request_id,
          source_mount_id: message.source_mount?.mount_id,
          target_mount_id: message.target_mount?.mount_id,
        })
      }
      catch {
        // Non-JSON and unrelated messages are outside this diagnostic stream.
      }
    })
    const observeSocket = (socket: WebSocket) => {
      if (observedSockets.has(socket))
        return
      observedSockets.add(socket)
      Object.defineProperty(socket, '__wippyAttentionE2EId', {
        configurable: true,
        value: crypto.randomUUID(),
      })
      wire.__wippyAttentionE2ESockets!.push(socket)
      if (wire.__wippyAttentionE2ESockets!.length > 64)
        wire.__wippyAttentionE2ESockets!.shift()
      socketEvent(socket, 'observed')
      socket.addEventListener('open', () => socketEvent(socket, 'open'))
      socket.addEventListener('error', () => socketEvent(socket, 'error'))
      socket.addEventListener('close', event => socketEvent(socket, 'close', {
        code: event.code,
        reason: safeReason(event.reason),
        wasClean: event.wasClean,
      }))
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string')
          return
        try {
          const envelope = JSON.parse(event.data)
          const response = envelope?.data
          // Agent UI action requests carry only fixture prompts and target
          // references, so the whole envelope is kept for routing assertions.
          if (typeof envelope?.topic === 'string' && envelope.topic.startsWith('session_ui_action_request')) {
            const requests = wire.__wippyAttentionE2EUiActionRequests!
            requests.push(structuredClone(envelope))
            if (requests.length > 64)
              requests.splice(0, requests.length - 64)
          }
          const incoming = wire.__wippyAttentionE2ESanitizeIncoming?.(envelope,
            (socket as WebSocket & { __wippyAttentionE2EId: string }).__wippyAttentionE2EId, Date.now())
          if (incoming) {
            const packets = wire.__wippyAttentionE2EIncoming!
            packets.push(incoming)
            if (packets.length > 1024)
              packets.splice(0, packets.length - 1024)
          }
          socketEvent(socket, 'received', {
            messageId: typeof response?.message_id === 'string' ? response.message_id : undefined,
            requestId: typeof response?.request_id === 'string' ? response.request_id : undefined,
            sessionId: typeof response?.session_id === 'string' ? response.session_id : undefined,
            sessionStatus: ['idle', 'running', 'stopped', 'error', 'completed', 'pending'].includes(response?.status) ? response.status : undefined,
            type: ['received', 'error', 'command_response', 'welcome', 'session_open', 'session_closed', 'status', 'done'].includes(response?.type)
              ? response.type
              : 'other',
          })
          const isCorrelatedReply = typeof response?.request_id === 'string'
            && (response.type === 'received' || response.type === 'error'
              || (response.type === 'command_response' && typeof response.success === 'boolean'))
          if (!isCorrelatedReply)
            return
          const detailCode = typeof response.message === 'string'
            ? response.message.match(/^([a-z0-9-]+) at /)?.[1]
            : undefined
          const rawCapabilities = response.context_attachments_capabilities
          const capabilitiesShape: CapturedCorrelatedReply['context_attachments_capabilities_shape'] = rawCapabilities === undefined
            ? { shape: 'missing' }
            : rawCapabilities && typeof rawCapabilities === 'object' && !Array.isArray(rawCapabilities)
              ? {
                  shape: 'object',
                  version: Number.isSafeInteger(rawCapabilities.version) ? rawCapabilities.version : undefined,
                  handler_count: Array.isArray(rawCapabilities.handlers) ? rawCapabilities.handlers.length : undefined,
                  handlers: Array.isArray(rawCapabilities.handlers) && rawCapabilities.handlers.length <= 32
                    ? rawCapabilities.handlers.map((handler: unknown) => {
                        const item = handler && typeof handler === 'object' && !Array.isArray(handler)
                          ? handler as Record<string, unknown>
                          : undefined
                        return {
                          kind: typeof item?.kind === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(item.kind) ? item.kind : undefined,
                          versions: Array.isArray(item?.versions) && item.versions.length <= 16
                            && item.versions.every((version: unknown) => Number.isSafeInteger(version) && (version as number) >= 1 && (version as number) <= 65535)
                            ? item.versions as number[]
                            : undefined,
                        }
                      })
                    : undefined,
                }
              : { shape: Array.isArray(rawCapabilities) ? 'array' : 'other' }
          wire.__wippyAttentionE2ECommandResponses!.push({
            attachmentsShape: incoming?.attachmentsShape,
            attachmentReceiptCount: incoming?.attachmentReceiptCount,
            context_attachments_transport: response.context_attachments_transport?.version === 1
              && response.context_attachments_transport?.staging === true
              && response.context_attachments_transport?.max_context_bytes === 32768
              ? { version: 1, staging: true, max_context_bytes: 32768 }
              : undefined,
            context_attachments_capabilities_shape: capabilitiesShape,
            attachments: Array.isArray(response.context_attachments ?? response.attachments)
              ? (response.context_attachments ?? response.attachments).map((attachment: Record<string, unknown>) => ({
                  attachment_id: attachment.attachment_id,
                  content_hash: attachment.content_hash,
                  kind: attachment.kind,
                  version: attachment.version,
                }))
              : undefined,
            code: typeof response.code === 'string' ? response.code : undefined,
            detail_code: detailCode,
            message_id: typeof response.message_id === 'string' ? response.message_id : undefined,
            request_id: response.request_id,
            socket_id: (socket as WebSocket & { __wippyAttentionE2EId: string }).__wippyAttentionE2EId,
            received_at: Date.now(),
            success: response.type === 'received' || (response.type === 'command_response' && response.success),
            topic: typeof envelope.topic === 'string' ? envelope.topic : undefined,
            type: response.type,
          })
        }
        catch {
          // Only bounded reply metadata is retained by this E2E hook.
        }
      })
    }
    const NativeWebSocket = window.WebSocket
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, argumentsList) {
        const socket = Reflect.construct(target, argumentsList) as WebSocket
        observeSocket(socket)
        return socket
      },
    })
    const originalSend = NativeWebSocket.prototype.send
    const originalClose = NativeWebSocket.prototype.close
    NativeWebSocket.prototype.close = function patchedClose(code?: number, reason?: string) {
      observeSocket(this)
      socketEvent(this, 'local_close_call', { code, reason: safeReason(reason) })
      return Reflect.apply(originalClose, this, [code, reason])
    }
    NativeWebSocket.prototype.send = function patchedSend(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      observeSocket(this)
      wire.__wippyAttentionE2ESocket = this
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data)
          socketEvent(this, 'send', {
            messageId: typeof parsed?.message_id === 'string' ? parsed.message_id : undefined,
            requestId: typeof parsed?.request_id === 'string' ? parsed.request_id : undefined,
            sessionId: typeof parsed?.session_id === 'string' ? parsed.session_id : undefined,
            type: ['session_message', 'session_ui_action_result', 'session_open', 'session_command'].includes(parsed?.type) ? parsed.type : 'other',
          })
          if (parsed?.type === 'session_message' || parsed?.type === 'session_ui_action_result')
            wire.__wippyAttentionE2EWire!.push(structuredClone(parsed))
          if (parsed?.type === 'session_message') {
            const bytes = (value: unknown) => value === undefined ? 0 : new TextEncoder().encode(JSON.stringify(value)).byteLength
            const attachments = Array.isArray(parsed.data?.context_attachments) ? parsed.data.context_attachments : []
            const attention: AttentionPayloadMetrics['attention'] = []
            for (const attachment of attachments) {
              if (attachment?.kind !== 'wippy.attention' || ![1, 2, 3, 4].includes(attachment.version) || typeof attachment.content !== 'string')
                continue
              try {
                const snapshot = JSON.parse(attachment.content)
                if (!Array.isArray(snapshot.candidates) || !Array.isArray(snapshot.recent_events))
                  continue
                const paths = snapshot.candidates.map((candidate: AttentionCandidate & { path_indices?: number[] }) => [2, 3, 4].includes(attachment.version) ? candidate.path_indices ?? [] : Array.isArray(candidate.path) ? candidate.path : [])
                attention.push({
                  encodingVersion: attachment.version,
                  pathDictionaryBytes: bytes(snapshot.path_dictionary),
                  snapshotJsonBytes: new TextEncoder().encode(attachment.content).byteLength,
                  candidateCount: snapshot.candidates.length,
                  pathSegmentCount: paths.reduce((count: number, path: AttentionPathSegment[]) => count + path.length, 0),
                  uniquePathSegmentCount: [2, 3, 4].includes(attachment.version) ? snapshot.path_dictionary?.length ?? 0 : new Set(paths.flat().map((segment: AttentionPathSegment) => JSON.stringify(segment))).size,
                  recentEventCount: snapshot.recent_events.length,
                  samplePointCount: attachment.version === 1 ? (Array.isArray(snapshot.capture?.points) ? snapshot.capture.points.length : 0) : snapshot.capture?.sampled_points ?? 0,
                  candidatesBytes: bytes(snapshot.candidates),
                  candidatePathsBytes: paths.reduce((count: number, path: AttentionPathSegment[]) => count + bytes(path), 0),
                  captureBytes: bytes(snapshot.capture),
                  focusBytes: bytes(snapshot.focus),
                  pointerBytes: bytes(snapshot.pointer),
                  recentEventsBytes: bytes(snapshot.recent_events),
                })
              }
              catch {
                // Malformed payloads still have wire-byte metrics, never raw content.
              }
            }
            const metrics = wire.__wippyAttentionE2EPayloadMetrics!
            metrics.push({
              at: Date.now(),
              requestId: typeof parsed.request_id === 'string' ? parsed.request_id : undefined,
              socketId: (this as WebSocket & { __wippyAttentionE2EId: string }).__wippyAttentionE2EId,
              commandBytes: new TextEncoder().encode(data).byteLength,
              attachmentArrayBytes: bytes(parsed.data?.context_attachments),
              attachmentCount: attachments.length,
              attention,
            })
            if (metrics.length > 256)
              metrics.splice(0, metrics.length - 256)
          }
        }
        catch {
          // Non-JSON WebSocket traffic is outside this protocol assertion.
        }
      }
      return Reflect.apply(originalSend, this, [data])
    }
  })
}

export async function disconnectAttentionSockets(page: Page): Promise<number> {
  const closed = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => {
        const wire = window as typeof window & {
          __wippyAttentionE2EDisconnectBaselineSocketIds?: string[]
          __wippyAttentionE2ERealmId?: string
          __wippyAttentionE2ESockets?: WebSocket[]
        }
        const sockets = wire.__wippyAttentionE2ESockets ?? []
        wire.__wippyAttentionE2EDisconnectBaselineSocketIds = sockets.map(socket => (
          (socket as WebSocket & { __wippyAttentionE2EId?: string }).__wippyAttentionE2EId ?? ''
        ))
        const socket = [...sockets]
          .reverse()
          .find(candidate => candidate.readyState === WebSocket.OPEN && new URL(candidate.url).pathname === '/api/v1/ws/join')
        if (!socket)
          return undefined
        socket.close(4000, 'Attention E2E reconnect')
        const url = new URL(socket.url)
        return { realmId: wire.__wippyAttentionE2ERealmId ?? 'unidentified', url: `${url.origin}${url.pathname}` }
      })
    }
    catch {
      return undefined
    }
  }))
  lastDisconnectedSockets = closed
    .filter((item): item is { realmId: string, url: string } => Boolean(item))
  return lastDisconnectedSockets.length
}

interface AttentionSocketDiagnostic {
  baseline: boolean
  frame: string
  events: AttentionSocketEvent[]
  id: string
  readyState: number
  url: string
}

export async function attentionSocketDiagnostics(page: Page): Promise<AttentionSocketDiagnostic[]> {
  return (await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => {
        const wire = window as typeof window & {
          __wippyAttentionE2EDisconnectBaselineSocketIds?: string[]
          __wippyAttentionE2ERealmId?: string
          __wippyAttentionE2ESocketEvents?: AttentionSocketEvent[]
          __wippyAttentionE2ESockets?: WebSocket[]
        }
        const baseline = new Set(wire.__wippyAttentionE2EDisconnectBaselineSocketIds ?? [])
        return (wire.__wippyAttentionE2ESockets ?? []).map((socket) => {
          const id = (socket as WebSocket & { __wippyAttentionE2EId?: string }).__wippyAttentionE2EId ?? 'unidentified'
          const url = new URL(socket.url)
          return {
            baseline: baseline.has(id),
            frame: wire.__wippyAttentionE2ERealmId ?? 'unidentified',
            events: (wire.__wippyAttentionE2ESocketEvents ?? []).filter(event => event.socketId === id),
            id,
            readyState: socket.readyState,
            url: `${url.origin}${url.pathname}`,
          }
        })
      })
    }
    catch {
      return []
    }
  }))).flat()
}

export async function waitForAttentionSocketReplacement(page: Page, timeout = 20_000): Promise<void> {
  let diagnostics: AttentionSocketDiagnostic[] = []
  try {
    await expect.poll(async () => {
      diagnostics = await attentionSocketDiagnostics(page)
      return diagnostics.some(socket => (
        socket.readyState === 1
        && !socket.baseline
        && lastDisconnectedSockets.some(previous => previous.realmId === socket.frame && previous.url === socket.url)
      ))
    }, {
      message: 'open replacement Wippy session WebSocket',
      timeout,
    }).toBe(true)
  }
  catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}; socket diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}

export async function attentionProtocolDiagnostics(page: Page): Promise<unknown[]> {
  return (await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => ({
        frame: (window as typeof window & { __wippyAttentionE2ERealmId?: string }).__wippyAttentionE2ERealmId ?? 'unidentified',
        messages: structuredClone((window as typeof window & { __wippyAttentionE2EProtocol?: unknown[] }).__wippyAttentionE2EProtocol ?? []),
      }))
    }
    catch {
      return undefined
    }
  }))).filter(Boolean)
}

interface ComposerDiagnostic {
  frame: string
  connected: boolean
  editable: boolean
  sessionId?: string
  sessionStatus?: string
  sendVisible: boolean
  stopVisible: boolean
  visible: boolean
}

// Bind ownership at the public send/open boundary. Vue development internals
// are absent from the production bundles used by the release smoke tests.
const activeSessionComposers = new WeakMap<Page, { sessionId: string, composer: Locator }>()

export async function composerDiagnostics(page: Page): Promise<ComposerDiagnostic[]> {
  const diagnostics: ComposerDiagnostic[] = []
  for (const frame of page.frames()) {
    const composers = frame.locator('textarea[placeholder="Type a message"]')
    const count = await composers.count()
    for (let index = 0; index < count; index++) {
      const composer = composers.nth(index)
      const visible = await composer.isVisible().catch(() => false)
      const detail = await composer.evaluate((element) => {
        const root = element.closest('.chat-input')
        return {
          connected: element.isConnected,
          editable: !(element as HTMLTextAreaElement).disabled && !(element as HTMLTextAreaElement).readOnly,
          frame: (window as typeof window & { __wippyAttentionE2ERealmId?: string }).__wippyAttentionE2ERealmId ?? 'unidentified',
          sendVisible: Boolean(root?.querySelector('button[aria-label="Send message"]:not(:disabled)')?.getClientRects().length),
          stopVisible: Boolean(root?.querySelector('button[aria-label="Stop session"]')?.getClientRects().length),
        }
      }).catch(() => undefined)
      const owner = activeSessionComposers.get(page)
      const handle = await composer.elementHandle()
      const isOwner = owner && handle
        ? await owner.composer.evaluate((element, candidate) => element === candidate, handle).catch(() => false)
        : false
      await handle?.dispose()
      diagnostics.push({ connected: false, editable: false, frame: 'unidentified', sendVisible: false, stopVisible: false, ...detail, visible, sessionId: isOwner ? owner?.sessionId : undefined })
    }
  }
  return diagnostics
}

async function findSessionComposer(page: Page, sessionId: string, timeout = 20_000): Promise<Locator> {
  const owner = activeSessionComposers.get(page)
  if (owner?.sessionId !== sessionId)
    throw new Error(`No composer bound by a public send/open operation for session ${sessionId}`)
  await expect(owner.composer).toBeVisible({ timeout })
  return owner.composer
}

export async function waitForSessionComposerReady(page: Page, sessionId: string): Promise<Locator> {
  await recordSendLifecycle(page, 'readiness-started', { session_id: sessionId })
  try {
    await expect.poll(async () => {
      const diagnostics = await composerDiagnostics(page)
      return diagnostics.some(composer => composer.sessionId === sessionId
        && composer.connected && composer.visible && composer.editable
        && composer.sendVisible && !composer.stopVisible && composer.sessionStatus !== 'running')
    }, { timeout: 20_000, message: 'owning session composer is ready for a normal message' }).toBe(true)
  }
  catch (error) {
    await recordSendLifecycle(page, 'readiness-failed', { session_id: sessionId })
    throw error
  }
  await recordSendLifecycle(page, 'readiness-completed', { session_id: sessionId })
  return findSessionComposer(page, sessionId)
}

export function sendRawSessionMessage(
  page: Page,
  sessionId: string,
  text: string,
  contextAttachments: unknown,
  options: RawSessionMessageOptions & { expectTransportClose: true },
): Promise<{ requestId: string, socketId: string, closeCode: number }>
export function sendRawSessionMessage(
  page: Page,
  sessionId: string,
  text: string,
  contextAttachments: unknown,
  options?: RawSessionMessageOptions & { expectTransportClose?: false },
): Promise<RawSessionMessageResult>
export async function sendRawSessionMessage(
  page: Page,
  sessionId: string,
  text: string,
  contextAttachments: unknown,
  options: RawSessionMessageOptions = {},
): Promise<RawSessionMessageResult | { requestId: string, socketId: string, closeCode: number }> {
  const composer = await findSessionComposer(page, sessionId)
  const outboundMessageId = options.outboundMessageId ?? crypto.randomUUID()
  const requestId = options.requestId ?? crypto.randomUUID()
  const responsesBefore = await capturedCorrelatedReplies(page)
  const sent = await composer.evaluate((_element, { attachments, messageId, messageText, targetRequestId, targetSessionId, reference, runtimeContext, receiverCapabilityProbe }) => {
    const wire = window as typeof window & {
      __wippyAttentionE2ESockets?: WebSocket[]
      __wippyAttentionE2ESocketEvents?: AttentionSocketEvent[]
    }
    const previousSend = [...(wire.__wippyAttentionE2ESocketEvents ?? [])]
      .reverse()
      .find(event => event.event === 'send' && event.type === 'session_message' && event.sessionId === targetSessionId)
    const socket = [...(wire.__wippyAttentionE2ESockets ?? [])]
      .reverse()
      .find((candidate) => {
        if (candidate.readyState !== WebSocket.OPEN)
          return false
        const id = (candidate as WebSocket & { __wippyAttentionE2EId?: string }).__wippyAttentionE2EId
        const url = new URL(candidate.url)
        return previousSend?.socketId === id && url.pathname === '/api/v1/ws/join'
      })
    if (!socket)
      throw new Error('The seeded session has no open owning WebSocket in its composer realm')

    socket.send(JSON.stringify({
      data: receiverCapabilityProbe
        ? { command: 'context_transport_capabilities' }
        : {
            ...(reference ? { context_attachments_ref: reference } : { context_attachments: attachments }),
            ...(runtimeContext ? { runtime_context: runtimeContext } : {}),
            text: messageText,
          },
      message_id: messageId,
      request_id: targetRequestId,
      session_id: targetSessionId,
      type: receiverCapabilityProbe ? 'session_command' : 'session_message',
    }))
    const url = new URL(socket.url)
    return {
      outboundMessageId: messageId,
      readyState: socket.readyState,
      requestId: targetRequestId,
      socketId: (socket as WebSocket & { __wippyAttentionE2EId?: string }).__wippyAttentionE2EId ?? 'unidentified',
      socketUrl: `${url.origin}${url.pathname}`,
    }
  }, {
    attachments: contextAttachments,
    messageId: outboundMessageId,
    messageText: text,
    targetRequestId: requestId,
    targetSessionId: sessionId,
    reference: options.reference,
    runtimeContext: options.runtimeContext,
    receiverCapabilityProbe: options.receiverCapabilityProbe,
  })
  if (sent.readyState !== 1)
    throw new Error(`Owning session WebSocket was not open at send time: ${JSON.stringify(sent)}`)

  if (options.expectTransportClose) {
    await expect.poll(async () => {
      const socket = (await attentionSocketDiagnostics(page)).find(socket => socket.id === sent.socketId)
      expect(socket?.events.some(event => event.event === 'local_close_call')).toBe(false)
      return socket?.events.find(event => event.event === 'close')?.code
    }, { timeout: 20_000, message: 'native oversized WebSocket frame is rejected with close code 1009' }).toBe(1009)
    expect((await capturedCorrelatedReplies(page)).filter(response => response.request_id === requestId)).toHaveLength(0)
    return { requestId, socketId: sent.socketId, closeCode: 1009 }
  }

  const matchesResponse = (response: CapturedCorrelatedReply) => response.request_id === requestId
    && (response.topic === `session:${sessionId}` || response.topic === `session:${sessionId}:message:${response.message_id}`)
    && response.socket_id === sent.socketId
  const responseCountBefore = responsesBefore.filter(matchesResponse).length

  let response: CapturedCorrelatedReply | undefined
  try {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      response = (await capturedCorrelatedReplies(page))
        .filter(matchesResponse)[responseCountBefore]
      if (response)
        break

      await page.waitForTimeout(100)
    }
    if (!response)
      throw new Error(`Correlated reply for raw request ${requestId} timed out`)
  }
  catch (error) {
    const [composers, sockets] = await Promise.all([
      composerDiagnostics(page),
      attentionSocketDiagnostics(page),
    ])
    throw new Error(`${error instanceof Error ? error.message : String(error)}; owning send: ${JSON.stringify(sent)}; composer diagnostics: ${JSON.stringify(composers)}; socket diagnostics: ${JSON.stringify(sockets)}`)
  }
  return {
    reply: response!,
    outboundMessageId,
    persistedMessageId: response!.message_id,
    requestId,
    socketId: sent.socketId,
  }
}

export async function verifyContextStagingCapability(page: Page, sessionId: string): Promise<void> {
  const frame = await proxyFrame(page)
  const advertised = await frame.evaluate(async (id) => {
    const instance = await (window as any).getWippyApi()
    const result = await instance.api.get('/api/v1/sessions/context', { params: { session_id: id } })
    const capability = result.data?.context_attachments_transport
    return { status: result.status, supported: capability?.version === 1 && capability?.staging === true && capability?.max_context_bytes === 32768 }
  }, sessionId)
  expect(advertised.status).toBe(200)
  expect(advertised.supported).toBe(true)
  const receiver = await sendRawSessionMessage(page, sessionId, '', undefined, { receiverCapabilityProbe: true })
  expect(receiver.reply.success).toBe(true)
  expect(receiver.reply.context_attachments_transport).toEqual({ version: 1, staging: true, max_context_bytes: 32768 })
  expect((await capturedCorrelatedReplies(page)).filter(item => item.request_id === receiver.requestId)).toHaveLength(1)
  const socket = (await attentionSocketDiagnostics(page)).find(socket => socket.id === receiver.socketId)
  expect(socket?.events.filter(event => event.event === 'send' && event.type === 'session_command' && event.requestId === receiver.requestId)).toHaveLength(1)
}

export async function cancelStagedContextForTest(page: Page, sessionId: string, requestId: string, id: string): Promise<void> {
  const frame = await proxyFrame(page)
  const status = await frame.evaluate(async (params) => {
    const instance = await (window as any).getWippyApi()
    return (await instance.api.delete('/api/v1/sessions/context', { params })).status as number
  }, { session_id: sessionId, request_id: requestId, id })
  expect(status).toBeGreaterThanOrEqual(200)
  expect(status).toBeLessThan(300)
}

export async function stageContextAttachmentsForTest(page: Page, sessionId: string, requestId: string, attachments: ContextAttachment[]) {
  const content = canonicalContextArray(attachments)
  const frame = await proxyFrame(page)
  const result = await frame.evaluate(async ({ id, correlation, body }) => {
    const instance = await (window as any).getWippyApi()
    const response = await instance.api.post('/api/v1/sessions/context', body, {
      params: { session_id: id, request_id: correlation },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
      transformRequest: [(value: unknown) => value],
      validateStatus: () => true,
    })
    const error = response.data?.error
    const safeCode = (value: unknown) => {
      const allowed = [
        'INVALID_CONTEXT_ATTACHMENTS',
        'CONTEXT_BODY_TOO_LARGE',
        'CONTEXT_BODY_REJECTED',
        'INVALID_JSON',
        'NONCANONICAL_CONTEXT',
      ]
      return typeof value === 'string' && allowed.includes(value) ? value : undefined
    }
    const reference = response.data?.context_attachments_ref
    const validReference = reference?.version === 1
      && typeof reference.id === 'string' && /^[\w-]{1,128}$/.test(reference.id)
      && typeof reference.content_hash === 'string' && /^sha256:[a-f0-9]{64}$/.test(reference.content_hash)
      && Number.isInteger(reference.content_bytes) && reference.content_bytes >= 0 && reference.content_bytes <= 32768
    return {
      status: response.status as number,
      code: safeCode(error?.code),
      reference: validReference
        ? {
            version: reference.version,
            id: reference.id,
            content_hash: reference.content_hash,
            content_bytes: reference.content_bytes,
          } as ContextAttachmentReference
        : undefined,
      expiresAt: typeof response.data?.expires_at === 'string' && response.data.expires_at.length <= 64 && /^\d{4}-\d{2}-\d{2}T/.test(response.data.expires_at) ? response.data.expires_at : undefined,
    }
  }, { id: sessionId, correlation: requestId, body: content })
  if (result.status >= 200 && result.status < 300) {
    expect(result.reference).toEqual({
      version: 1,
      id: expect.stringMatching(/^[\w-]{1,128}$/),
      content_hash: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      content_bytes: Buffer.byteLength(content),
    })
    expect(Date.parse(result.expiresAt ?? '')).toBeGreaterThan(Date.now())
  }
  return { ...result, requestId }
}

export async function sendStagedSessionMessage(
  page: Page,
  sessionId: string,
  text: string,
  attachments: ContextAttachment[],
  options: Pick<RawSessionMessageOptions, 'requestId' | 'outboundMessageId' | 'runtimeContext'> = {},
): Promise<RawSessionMessageResult> {
  await verifyContextStagingCapability(page, sessionId)
  const requestId = options.requestId ?? crypto.randomUUID()
  const stage = await stageContextAttachmentsForTest(page, sessionId, requestId, attachments)
  if (stage.status < 200 || stage.status >= 300 || !stage.reference)
    throw new Error(`Context staging was rejected: HTTP ${stage.status} (${stage.code ?? 'unknown-code'})`)
  return sendRawSessionMessage(page, sessionId, text, undefined, { ...options, requestId, reference: stage.reference })
}

export async function sha256Attachment(
  page: Page,
  attachment: Omit<ContextAttachment, 'content_bytes' | 'content_hash'>,
): Promise<ContextAttachment> {
  return page.evaluate(async (value) => {
    const bytes = new TextEncoder().encode(value.content)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    return {
      ...value,
      content_bytes: bytes.byteLength,
      content_hash: `sha256:${hex}`,
    }
  }, attachment)
}

export async function denyAttentionCaptureProvider(page: Page): Promise<() => Promise<void>> {
  let restored = false
  for (const frame of page.frames()) {
    const found = await frame.evaluate(() => {
      const host = window as typeof window & {
        __WIPPY_ATTENTION_CAPTURE_PROVIDER__?: { captureFrame?: (...args: unknown[]) => unknown }
        __wippyAttentionCaptureOriginal?: (...args: unknown[]) => unknown
      }
      const provider = host.__WIPPY_ATTENTION_CAPTURE_PROVIDER__
      if (!provider || typeof provider.captureFrame !== 'function')
        return false
      host.__wippyAttentionCaptureOriginal = provider.captureFrame
      provider.captureFrame = async () => {
        throw new DOMException('Attention E2E capture denied', 'NotAllowedError')
      }
      return true
    }).catch(() => false)
    if (!found)
      continue
    return async () => {
      if (restored)
        return
      restored = true
      await frame.evaluate(() => {
        const host = window as typeof window & {
          __WIPPY_ATTENTION_CAPTURE_PROVIDER__?: { captureFrame?: (...args: unknown[]) => unknown }
          __wippyAttentionCaptureOriginal?: (...args: unknown[]) => unknown
        }
        if (host.__WIPPY_ATTENTION_CAPTURE_PROVIDER__ && host.__wippyAttentionCaptureOriginal)
          host.__WIPPY_ATTENTION_CAPTURE_PROVIDER__.captureFrame = host.__wippyAttentionCaptureOriginal
        delete host.__wippyAttentionCaptureOriginal
      })
    }
  }
  throw new Error('Host Attention capture provider was not available')
}

export async function bootAttentionTracer(page: Page, cell: AttentionRuntimeCell): Promise<AttentionFixture> {
  await loginAsAdmin(page)
  await page.goto('/home/attention-tracer')

  if (cell.layout === 'managed') {
    await expect(page.locator('.managed-layout-shell')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.wippy-host-app')).toHaveCount(0)
  }
  else {
    await expect(page.locator('.wippy-host-app')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.managed-layout-shell')).toHaveCount(0)
  }

  return {
    leftChild: await findVisibleTestId(page, 'attention-child-left'),
    rightChild: await findVisibleTestId(page, 'attention-child-right'),
    leftTarget: await findVisibleTestId(page, 'attention-target-left'),
    rightTarget: await findVisibleTestId(page, 'attention-target-right'),
    leftSafeText: await findVisibleTestId(page, 'attention-safe-text-left'),
    rightSafeText: await findVisibleTestId(page, 'attention-safe-text-right'),
  }
}

async function proxyFrame(page: Page): Promise<Frame> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        if (await frame.evaluate(() => typeof (window as any).getWippyApi === 'function'))
          return frame
      }
      catch {
        // Cross-realm teardown while the package changes route; retry.
      }
    }
    await page.waitForTimeout(100)
  }
  throw new Error('No injected Wippy proxy realm became available')
}

export async function prepareCssPagination(page: Page, target: Locator) {
  await target.evaluate((element) => {
    const container = element.parentElement
    if (!container)
      throw new Error('CSS pagination target has no parent element')
    if (container.querySelector('[data-testid="attention-css-pagination-fixture"]'))
      throw new Error('CSS pagination fixture already exists')

    const doc = element.ownerDocument
    const fixture = doc.createElement('div')
    fixture.dataset.testid = 'attention-css-pagination-fixture'
    fixture.style.cssText = 'position: fixed; top: 8px; right: 8px; z-index: 10000'
    const root = fixture.attachShadow({ mode: 'open' })
    for (const label of ['CSS page one', 'CSS page two']) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.setAttribute('aria-label', label)
      root.append(button)
    }
    container.append(fixture)
  })

  const fixture = await findVisibleTestId(page, 'attention-css-pagination-fixture')
  await expect(fixture.locator('button')).toHaveText(['CSS page one', 'CSS page two'])

  const frame = await proxyFrame(page)
  return frame.evaluate(async () => {
    type NodeRef = {
      host_instance_id: string
      node_id: string
      mount_id: string
      generation: number
    }

    const sameRef = (left: NodeRef | undefined, right: NodeRef) =>
      left?.host_instance_id === right.host_instance_id
      && left.node_id === right.node_id
      && left.mount_id === right.mount_id
      && left.generation === right.generation

    const instance = await (window as any).getWippyApi()
    const found = await instance.attention.find(
      { role: 'button', name: 'CSS page one' },
      { fromRoot: true, limit: 8 },
    )
    const matches = (found.data?.nodes ?? []).filter(
      (node: any) => node.summary?.role === 'button'
        && node.summary?.name === 'CSS page one',
    )
    if (matches.length !== 1 || !matches[0].parent)
      throw new Error(`CSS pagination root discovery failed: ${JSON.stringify(found)}`)

    const root = matches[0].parent as NodeRef
    const tree = await instance.attention.getTree({
      fromRoot: true,
      node: root,
      limit: 1,
      depth: 0,
    })
    const rootNode = (tree.data?.nodes ?? []).find(
      (node: any) => sameRef(node.ref, root),
    )
    if (!sameRef(tree.data?.root, root) || rootNode?.kind !== 'shadow-root')
      throw new Error(`CSS pagination scope is not the requested ShadowRoot: ${JSON.stringify(tree)}`)

    return root
  })
}

export async function startDeterministicAttentionChat(page: Page, agentName = ATTENTION_E2E_AGENT): Promise<Locator> {
  const frame = await proxyFrame(page)
  await frame.evaluate(async (name) => {
    const instance = await (window as any).getWippyApi()
    const response = await instance.api.get('/api/v1/agents/list')
    const agent = response.data?.agents?.find((candidate: any) => candidate.name === name)
    if (!agent?.start_token)
      throw new Error(`Deterministic Attention E2E agent is not registered: ${name}`)
    instance.host.startChat(agent.start_token, { sidebar: true })
  }, agentName)
  return findVisible(page, root => root.locator('textarea[placeholder="Type a message"]'), 'chat message textarea', 30_000)
}

/** Reads the persisted Session Attention control state through the public API. */
export async function sessionAttentionContext(page: Page, sessionId: string): Promise<{ enabled: boolean, revision: number, updated_by?: string }> {
  const frame = await proxyFrame(page)
  return frame.evaluate(async (id) => {
    const instance = await (window as any).getWippyApi()
    const response = await instance.api.get('/api/v1/sessions/get', { params: { session_id: id } })
    const state = response.data?.session?.attention_context
    if (!state || typeof state.enabled !== 'boolean' || typeof state.revision !== 'number')
      throw new Error('Session response has no attention_context state')
    return { enabled: state.enabled, revision: state.revision, updated_by: state.updated_by }
  }, sessionId)
}

/** Waits for the deterministic agent's `ATTENTION_E2E_READ` answer to one user message. */
export async function waitForReadReport(page: Page, sessionId: string, sourceMessageId: string, timeout = 30_000): Promise<AttentionReadReport> {
  const marker = 'ATTENTION_E2E_READ '
  const answer = await waitForPersistedMessage(page, sessionId, message => message.type === 'assistant'
    && message.metadata?.source_id === sourceMessageId && message.data.startsWith(marker), timeout)
  return JSON.parse(answer.data.slice(marker.length)) as AttentionReadReport
}

/**
 * The function calls of one user turn as the Session stored them when they
 * ran. A later prompt can withdraw an earlier read result from the model, but
 * the stored record keeps what the tool returned at the time.
 */
export async function turnFunctionCalls(page: Page, sessionId: string, userMessageId: string): Promise<Array<{
  arguments: Record<string, unknown>
  call_id?: string
  function_name?: string
  result: AttentionReadReport['results'][number]
  status?: string
}>> {
  const history = await sessionMessages(page, sessionId)
  const start = history.findIndex(message => message.message_id === userMessageId)
  if (start < 0)
    throw new Error(`User message ${userMessageId} is not in the session history`)
  const calls = []
  for (const message of history.slice(start + 1)) {
    if (message.type === 'user')
      break
    if (message.type !== 'function' && message.type !== 'private_function')
      continue
    const metadata = message.metadata as PersistedMessage['metadata'] & { function_name?: string }
    calls.push({
      arguments: JSON.parse(message.data || '{}') as Record<string, unknown>,
      call_id: metadata?.call_id,
      function_name: metadata?.function_name,
      result: metadata?.result as AttentionReadReport['results'][number],
      status: metadata?.status,
    })
  }
  return calls
}

/** Adds one ordinary file to the visible chat composer queue. */
export async function addComposerUpload(page: Page, file: { name: string, mimeType: string, buffer: Buffer }): Promise<void> {
  const input = await findVisible(page, root => root.locator('.chat-input:has(textarea[placeholder="Type a message"])'), 'chat composer', 30_000)
  await input.locator('input[type="file"]').setInputFiles(file)
}

export async function capturedUiActionRequests(page: Page): Promise<CapturedUiActionRequestEnvelope[]> {
  const perFrame = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => structuredClone((window as typeof window & {
        __wippyAttentionE2EUiActionRequests?: unknown[]
      }).__wippyAttentionE2EUiActionRequests ?? [])) as CapturedUiActionRequestEnvelope[]
    }
    catch {
      return []
    }
  }))
  return perFrame.flat()
}

export async function waitForUiActionRequest(page: Page, sessionId: string, mode: string, timeout = 20_000): Promise<CapturedUiActionRequestEnvelope> {
  let found: CapturedUiActionRequestEnvelope | undefined
  await expect.poll(async () => {
    found = (await capturedUiActionRequests(page)).find(envelope => envelope.data?.session_id === sessionId
      && envelope.data?.message_type === 'request' && envelope.data?.mode === mode)
    return Boolean(found)
  }, { timeout, message: `session_ui_action_request ${mode} for ${sessionId}` }).toBe(true)
  return found!
}

/**
 * Delivers one server envelope to this page's open Session socket exactly as
 * if the server had sent it. It models a request that reaches the wrong Host.
 */
export async function injectSessionSocketEnvelope(page: Page, envelope: unknown): Promise<void> {
  const delivered = await Promise.all(page.frames().map(async (frame): Promise<number> => {
    try {
      return await frame.evaluate((value) => {
        const wire = window as typeof window & { __wippyAttentionE2ESockets?: WebSocket[] }
        const socket = [...(wire.__wippyAttentionE2ESockets ?? [])]
          .reverse()
          .find(candidate => candidate.readyState === WebSocket.OPEN && new URL(candidate.url).pathname === '/api/v1/ws/join')
        if (!socket)
          return 0
        socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
        return 1
      }, envelope)
    }
    catch {
      return 0
    }
  }))
  expect(delivered.reduce((total, count) => total + count, 0), 'one open Session socket received the envelope').toBe(1)
}

export async function enablePointingContext(page: Page): Promise<void> {
  const attachments = await findVisibleRole(page, 'button', 'Attachments')
  if ((await attachments.getAttribute('aria-label'))?.match(/pointing context selected/))
    return
  await attachments.click()
  const pointing = await findVisibleRole(page, 'menuitem', 'Automatically attach pointing context')
  await pointing.click()
  await expect(attachments).toHaveAttribute('aria-label', /pointing context selected/)
}

export async function findVisibleUploadQueue(page: Page): Promise<Locator> {
  return findVisible(page, root => root.locator('.chat-input__upload-list, .message-input__files'), 'ordinary composer upload queue', 30_000)
}

export async function removeFirstUpload(page: Page): Promise<void> {
  const queue = await findVisibleUploadQueue(page)
  const remove = queue.locator('.w-file__item [aria-label*="remove" i], .w-file__item [aria-label*="delete" i], .w-file__item svg.iconify--tabler').last()
  await expect(remove).toBeVisible()
  await remove.click({ force: true })
}

export async function capturedPayloadMetrics(page: Page): Promise<AttentionPayloadMetrics[]> {
  const results = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => {
        const wire = window as typeof window & { __wippyAttentionE2EPayloadMetrics?: AttentionPayloadMetrics[] }
        return structuredClone(wire.__wippyAttentionE2EPayloadMetrics ?? [])
      })
    }
    catch {
      // Detached realms are reported through lifecycle diagnostics; never read traces.
      return []
    }
  }))
  return results.flat()
}

export async function capturedWireMessages(page: Page): Promise<Array<CapturedSessionMessage | CapturedUiActionResult>> {
  const perFrame = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => {
        const wire = window as typeof window & { __wippyAttentionE2EWire?: unknown[] }
        return structuredClone(wire.__wippyAttentionE2EWire ?? [])
      }) as Array<CapturedSessionMessage | CapturedUiActionResult>
    }
    catch {
      return []
    }
  }))
  return perFrame.flat()
}

export async function capturedCorrelatedReplies(page: Page): Promise<CapturedCorrelatedReply[]> {
  const perFrame = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => {
        const wire = window as typeof window & { __wippyAttentionE2ECommandResponses?: unknown[] }
        return structuredClone(wire.__wippyAttentionE2ECommandResponses ?? [])
      }) as CapturedCorrelatedReply[]
    }
    catch {
      return []
    }
  }))
  return perFrame.flat()
}

export async function capturedIncomingPackets(page: Page): Promise<CapturedIncomingPacket[]> {
  const perFrame = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => structuredClone((window as typeof window & {
        __wippyAttentionE2EIncoming?: CapturedIncomingPacket[]
      }).__wippyAttentionE2EIncoming ?? []))
    }
    catch {
      return []
    }
  }))
  return perFrame.flat().sort((left, right) => left.received_at - right.received_at).slice(-4096)
}

export async function waitForAssistantReply(page: Page, sessionId: string, messageId: string): Promise<PersistedMessage> {
  return waitForPersistedMessage(page, sessionId, message => message.type === 'assistant' && message.metadata?.source_id === messageId)
}

export async function sendChatMessage(
  page: Page,
  composer: Locator,
  text: string,
  options?: { beforeSubmit?: () => Promise<void>, submit?: () => Promise<void> },
): Promise<AcknowledgedSessionMessage> {
  await recordSendLifecycle(page, 'before-fill')
  await composer.fill(text)
  await recordSendLifecycle(page, 'before-enter')
  await options?.beforeSubmit?.()
  if (options?.submit)
    await options.submit()
  else
    await composer.press('Enter')
  await recordSendLifecycle(page, 'after-enter')

  let captured: CapturedSessionMessage | undefined
  try {
    await expect.poll(async () => {
      const messages = await capturedWireMessages(page)
      captured = [...messages].reverse().find((item): item is CapturedSessionMessage => (
        item.type === 'session_message' && item.data.text === text
      ))
      return Boolean(captured)
    }, { timeout: 20_000, message: 'outbound session_message for composer submission' }).toBe(true)
  }
  catch (error) {
    await recordSendLifecycle(page, 'outbound-failed')
    const [composers, sockets, responses] = await Promise.all([
      composerDiagnostics(page),
      attentionSocketDiagnostics(page),
      capturedCorrelatedReplies(page),
    ])
    throw new Error(`${error instanceof Error ? error.message : String(error)}; composition categories: ${JSON.stringify(compositionFailures.get(page) ?? [])}; command responses: ${JSON.stringify(responses)}; HTTP stages: ${JSON.stringify(capturedHttpStageMetrics(page))}; composer diagnostics: ${JSON.stringify(composers)}; socket diagnostics: ${JSON.stringify(sockets)}`)
  }

  activeSessionComposers.set(page, { sessionId: captured!.session_id, composer })
  await recordSendLifecycle(page, 'outbound-observed', captured!)

  let response: CapturedCorrelatedReply | undefined
  try {
    await expect.poll(async () => {
      response = (await capturedCorrelatedReplies(page)).find(item => item.request_id === captured!.request_id)
      return Boolean(response)
    }, { timeout: 20_000, message: `received response for ${captured!.request_id}` }).toBe(true)
  }
  catch (error) {
    await recordSendLifecycle(page, 'ack-failed', captured!)
    throw error
  }
  await recordSendLifecycle(page, response!.success ? 'ack-success' : 'ack-rejected', { ...captured!, message_id: response!.message_id })
  if (response!.type !== 'received' || !response!.success || !response!.message_id)
    throw new Error(`Session message ${captured!.request_id} was rejected (${response!.code ?? 'missing-message-id'})`)
  expect(response!.topic).toBe(`session:${captured!.session_id}:message:${response!.message_id}`)
  expect((await capturedCorrelatedReplies(page)).filter(item => item.request_id === captured!.request_id)).toHaveLength(1)
  const persisted = captured!.data.context_attachments_ref
    ? await waitForPersistedMessage(page, captured!.session_id, message => message.message_id === response!.message_id && message.type === 'user')
    : undefined
  if (captured!.data.context_attachments_ref) {
    expect(captured!.data.context_attachments).toBeUndefined()
    expect(persisted?.metadata?.context_attachments).toBeDefined()
    const canonical = canonicalContextArray(persisted!.metadata!.context_attachments!)
    expect(Buffer.byteLength(canonical)).toBe(captured!.data.context_attachments_ref.content_bytes)
    expect(`sha256:${createHash('sha256').update(canonical).digest('hex')}`).toBe(captured!.data.context_attachments_ref.content_hash)
  }
  return {
    ...captured!,
    receipt: response!,
    persistedMessageId: response!.message_id,
    ...(persisted ? { persistedContextAttachments: persisted.metadata!.context_attachments } : {}),
  }
}

export async function waitForUiActionResult(
  page: Page,
  sessionId: string,
  status: string,
  timeout = 20_000,
  excludeActionId?: string,
): Promise<CapturedUiActionResult> {
  let captured: CapturedUiActionResult | undefined
  await expect.poll(async () => {
    const messages = await capturedWireMessages(page)
    captured = [...messages].reverse().find((item): item is CapturedUiActionResult => (
      item.type === 'session_ui_action_result'
      && item.session_id === sessionId
      && item.data.status === status
      && item.data.in_reply_to_action_id !== excludeActionId
    ))
    return Boolean(captured)
  }, { timeout, message: `session_ui_action_result with status ${status}` }).toBe(true)
  return captured!
}

export async function terminalResultsForAction(page: Page, actionId: string): Promise<CapturedUiActionResult[]> {
  const messages = await capturedWireMessages(page)
  return messages.filter((item): item is CapturedUiActionResult => (
    item.type === 'session_ui_action_result' && item.data.in_reply_to_action_id === actionId
  ))
}

export async function sessionMessages(page: Page, sessionId: string): Promise<PersistedMessage[]> {
  const frame = await proxyFrame(page)
  return frame.evaluate(async (id) => {
    const instance = await (window as any).getWippyApi()
    const response = await instance.api.get('/api/v1/sessions/messages', {
      params: { cursor: '', limit: 100, session_id: id },
    })
    return response.data?.messages ?? []
  }, sessionId)
}

export async function waitForPersistedMessage(
  page: Page,
  sessionId: string,
  predicate: (message: PersistedMessage) => boolean,
  timeout = 30_000,
): Promise<PersistedMessage> {
  let found: PersistedMessage | undefined
  await expect.poll(async () => {
    found = (await sessionMessages(page, sessionId)).find(predicate)
    return Boolean(found)
  }, { timeout, message: `persisted session message for ${sessionId}` }).toBe(true)
  return found!
}

export async function waitForAgentText(page: Page, text: string | RegExp, timeout = 30_000): Promise<Locator> {
  const message = await findVisible(
    page,
    root => root.locator('.chat-message--agent-message').filter({ hasText: text }),
    `agent message ${String(text)}`,
    timeout,
  )
  await expect(message).toBeVisible()
  return message
}

export function resolvedContextAttachments(command: CapturedSessionMessage): ContextAttachment[] | undefined {
  return command.data.context_attachments
    ?? ('persistedContextAttachments' in command ? (command as AcknowledgedSessionMessage).persistedContextAttachments : undefined)
}

export function attentionAttachment(command: CapturedSessionMessage): ContextAttachment {
  const attachment = resolvedContextAttachments(command)?.find(item => item.kind === 'wippy.attention')
  if (!attachment)
    throw new Error('Outbound message has no wippy.attention attachment')
  return attachment
}

export function attentionSnapshot(command: CapturedSessionMessage): AttentionSnapshot {
  const snapshots = attentionSnapshotsFromAttachments(resolvedContextAttachments(command) ?? [])
  if (!snapshots.length)
    throw new Error('Message has no supported Attention semantic snapshot')
  return snapshots[0]
}

export function pointerCandidates(snapshot: AttentionSnapshot): AttentionCandidate[] {
  const ids = new Set(snapshot.pointer?.candidate_ids ?? [])
  return snapshot.candidates.filter(candidate => ids.has(candidate.target_id))
}

export async function moveToSiblingBoundary(page: Page, fixture: AttentionFixture): Promise<{ x: number, y: number }> {
  const [left, right] = await Promise.all([
    fixture.leftTarget.boundingBox(),
    fixture.rightTarget.boundingBox(),
  ])
  if (!left || !right)
    throw new Error('Both Attention boundary targets must have geometry')
  const x = (left.x + left.width + right.x) / 2
  const top = Math.max(left.y, right.y)
  const bottom = Math.min(left.y + left.height, right.y + right.height)
  const point = { x, y: top + (bottom - top) / 2 }
  await page.mouse.move(point.x, point.y)
  await Promise.all([
    page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))),
    fixture.leftTarget.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))),
    fixture.rightTarget.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))),
  ])
  return point
}

export async function openPersistedSession(page: Page, sessionId: string): Promise<Locator> {
  const frame = await proxyFrame(page)
  await frame.evaluate(async (id) => {
    const instance = await (window as any).getWippyApi()
    instance.host.openSession(id, { sidebar: true })
  }, sessionId)
  const composer = await findVisible(page, root => root.locator('textarea[placeholder="Type a message"]'), 'opened session composer', 30_000)
  activeSessionComposers.set(page, { sessionId, composer })
  return composer
}

export async function navigateAttentionHost(page: Page, path: string): Promise<void> {
  const frame = await proxyFrame(page)
  await frame.evaluate(async (targetPath) => {
    const instance = await (window as any).getWippyApi()
    instance.host.navigate(targetPath)
  }, path)
}
