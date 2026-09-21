import { Buffer } from 'node:buffer'
import { expect, test, type Page } from '@playwright/test'
import {
  attentionAttachment,
  attentionOverlayCount,
  attentionProtocolDiagnostics,
  attentionRuntimeCell,
  attentionSnapshot,
  bootAttentionTracer,
  cancelStagedContextForTest,
  canonicalContextValue,
  capturedCommandResponses,
  capturedAttentionSendLifecycle,
  capturedCompositionFailures,
  capturedHttpStageMetrics,
  capturedIncomingPackets,
  capturedPayloadMetrics,
  capturedWireMessages,
  disconnectAttentionSockets,
  enablePointingContext,
  findVisible,
  findVisibleRole,
  findVisibleUploadQueue,
  installAttentionWireTap,
  denyAttentionCaptureProvider,
  moveToSiblingBoundary,
  navigateAttentionHost,
  openPersistedSession,
  pointerCandidates,
  requestDispatchStatus,
  resolvedContextAttachments,
  removeFirstUpload,
  sendChatMessage,
  sendRawSessionMessage,
  sendStagedSessionMessage,
  sessionMessages,
  sha256Attachment,
  stageContextAttachmentsForTest,
  startDeterministicAttentionChat,
  terminalResultsForAction,
  verifyContextStagingCapability,
  waitForAgentText,
  waitForAttentionSocketReplacement,
  waitForPersistedMessage,
  waitForSessionComposerReady,
  waitForTerminalDispatch,
  waitForUiActionResult,
} from './helpers/attention'

const cell = attentionRuntimeCell()
const describeCell = `${cell.layout}/${cell.engine}/${cell.mode}${cell.visualCapture ? '/visual' : ''}`
const FIXTURE_JSON_NUMERIC_TOLERANCE = 0.5
const PATH_IDENTITY_FIELDS = [
  'kind',
  'mount_id',
  'generation',
  'label',
  'panel_id',
  'artifact_id',
  'page_id',
  'package_id',
  'tag_name',
  'frame_origin',
  'selector_hint',
  'coordinate_quality',
] as const
type AttentionPath = ReturnType<typeof pointerCandidates>[number]['path']
type AttentionCandidate = ReturnType<typeof pointerCandidates>[number]
type SelectedAttentionTarget = NonNullable<Awaited<ReturnType<typeof waitForUiActionResult>>['data']['selected_target']>
interface FixturePathRect {
  height: number
  width: number
  x: number
  y: number
}
interface FixturePathTransform {
  convention: string
  direction: string
  matrix: number[]
}

function expectCompleteNestedPath(
  path: ReturnType<typeof pointerCandidates>[number]['path'],
  diagnostics?: string,
  finalTagName = 'button',
): void {
  const kinds = path.map(segment => segment.kind)
  const rendererKind = cell.engine === 'fragment' ? 'web-fragment' : 'iframe'
  expect(kinds[0], diagnostics).toBe('host')
  expect(kinds.at(-1), diagnostics).toBe('element')
  expect(kinds.filter(kind => kind === rendererKind), diagnostics).toHaveLength(3)
  expect(kinds.filter(kind => kind === 'page'), diagnostics).toHaveLength(3)
  expect(kinds.filter(kind => kind === 'web-component'), diagnostics).toHaveLength(3)
  expect(kinds.filter(kind => kind === 'shadow-root').length, diagnostics).toBeGreaterThanOrEqual(3)
  expect(kinds.indexOf('panel'), diagnostics).toBeGreaterThan(kinds.indexOf('host'))
  expect(kinds.indexOf('page'), diagnostics).toBeGreaterThan(kinds.indexOf('panel'))
  for (const segment of path) {
    expect(segment.mount_id, diagnostics).toBeTruthy()
    expect(segment.generation, diagnostics).toBeGreaterThanOrEqual(0)
  }
  expect(path.some(segment => segment.kind === 'panel' && Boolean(segment.panel_id)), diagnostics).toBe(true)
  expect(path.some(segment => segment.kind === 'page' && Boolean(segment.page_id)), diagnostics).toBe(true)
  expect(path.filter(segment => segment.kind === 'page' && Boolean(segment.page_id)), diagnostics).toHaveLength(3)
  expect(path.some(segment => segment.kind === 'web-component' && Boolean(segment.tag_name)), diagnostics).toBe(true)
  expect(path.at(-1), diagnostics).toEqual(expect.objectContaining({
    kind: 'element',
    tag_name: finalTagName,
  }))
}

async function extractAgentPath(answer: Awaited<ReturnType<typeof waitForAgentText>>): Promise<AttentionPath> {
  const text = await answer.textContent() ?? ''
  const marker = ' PATH '
  const markerIndex = text.indexOf(marker)
  expect(markerIndex, `agent response did not contain a PATH marker: ${text}`).toBeGreaterThanOrEqual(0)
  const jsonStart = text.indexOf('[', markerIndex + marker.length)
  expect(jsonStart, `agent response did not contain a PATH array: ${text}`).toBeGreaterThanOrEqual(0)
  let depth = 0
  let inString = false
  let escaped = false
  let jsonEnd = -1
  for (let index = jsonStart; index < text.length; index++) {
    const character = text[index]
    if (inString) {
      if (escaped)
        escaped = false
      else if (character === '\\')
        escaped = true
      else if (character === '"')
        inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '[')
      depth++
    else if (character === ']')
      depth--
    if (depth === 0) {
      jsonEnd = index + 1
      break
    }
  }
  expect(jsonEnd, `agent response PATH array was incomplete: ${text}`).toBeGreaterThan(jsonStart)
  const encodedPath = text.slice(jsonStart, jsonEnd)
  let parsed: unknown
  try {
    parsed = JSON.parse(encodedPath)
  }
  catch (error) {
    throw new Error(`agent PATH line was not valid JSON: ${String(error)}`)
  }
  expect(Array.isArray(parsed), `agent PATH payload was not an array: ${encodedPath}`).toBe(true)
  return parsed as AttentionPath
}

function expectOptionalRect(
  actual: FixturePathRect | undefined,
  expected: FixturePathRect | undefined,
  field: 'rect' | 'clip_rect',
  segmentIndex: number,
): void {
  if (!expected) {
    expect(actual, `PATH segment ${segmentIndex} unexpectedly contained ${field}`).toBeUndefined()
    return
  }
  expect(actual, `PATH segment ${segmentIndex} omitted ${field}`).toBeDefined()
  for (const scalar of ['x', 'y', 'width', 'height'] as const) {
    expect(Number.isFinite(actual![scalar]), `PATH segment ${segmentIndex} ${field}.${scalar} was not finite`).toBe(true)
    expect(
      Math.abs(actual![scalar] - expected[scalar]),
      `PATH segment ${segmentIndex} ${field}.${scalar} exceeded fixture JSON normalization tolerance`,
    ).toBeLessThanOrEqual(FIXTURE_JSON_NUMERIC_TOLERANCE)
  }
}

function expectOptionalTransform(
  actual: FixturePathTransform | undefined,
  expected: FixturePathTransform | undefined,
  segmentIndex: number,
): void {
  if (!expected) {
    expect(actual, `PATH segment ${segmentIndex} unexpectedly contained local_to_parent`).toBeUndefined()
    return
  }
  expect(actual, `PATH segment ${segmentIndex} omitted local_to_parent`).toBeDefined()
  expect(actual?.convention, `PATH segment ${segmentIndex} transform convention`).toBe(expected.convention)
  expect(actual?.direction, `PATH segment ${segmentIndex} transform direction`).toBe(expected.direction)
  expect(actual?.matrix, `PATH segment ${segmentIndex} transform matrix length`).toHaveLength(expected.matrix.length)
  expected.matrix.forEach((scalar, matrixIndex) => {
    const actualScalar = actual!.matrix[matrixIndex]
    expect(Number.isFinite(actualScalar), `PATH segment ${segmentIndex} matrix[${matrixIndex}] was not finite`).toBe(true)
    expect(
      Math.abs(actualScalar - scalar),
      `PATH segment ${segmentIndex} matrix[${matrixIndex}] exceeded fixture JSON normalization tolerance`,
    ).toBeLessThanOrEqual(FIXTURE_JSON_NUMERIC_TOLERANCE)
  })
}

function expectAgentPathMatches(actual: AttentionPath, expected: AttentionPath): void {
  expect(actual, 'agent PATH segment count').toHaveLength(expected.length)
  expected.forEach((expectedSegment, segmentIndex) => {
    const actualSegment = actual[segmentIndex]
    expect(actualSegment, `agent PATH omitted segment ${segmentIndex}`).toBeDefined()
    for (const field of PATH_IDENTITY_FIELDS) {
      expect(
        actualSegment[field],
        `agent PATH segment ${segmentIndex} changed ${field}`,
      ).toEqual(expectedSegment[field])
    }
    expectOptionalRect(actualSegment.rect as FixturePathRect | undefined, expectedSegment.rect as FixturePathRect | undefined, 'rect', segmentIndex)
    expectOptionalRect(actualSegment.clip_rect as FixturePathRect | undefined, expectedSegment.clip_rect as FixturePathRect | undefined, 'clip_rect', segmentIndex)
    expectOptionalTransform(
      actualSegment.local_to_parent as FixturePathTransform | undefined,
      expectedSegment.local_to_parent as FixturePathTransform | undefined,
      segmentIndex,
    )
  })
}

async function expectNoAttentionDebugChat(page: Page, sessionId: string): Promise<void> {
  const history = await sessionMessages(page, sessionId)
  const markers = ['ATTENTION_E2E_HIGHLIGHT_REQUESTED', 'ATTENTION_E2E_ACTION_RESULT']
  expect(history.filter(message => message.type === 'assistant'
    && markers.some(marker => message.data.includes(marker)))).toHaveLength(0)
  const visibleCount = (await Promise.all([
    page,
    ...page.frames(),
  ].map(root => root.locator('.chat-message--agent-message')
    .filter({ hasText: /ATTENTION_E2E_(?:HIGHLIGHT_REQUESTED|ACTION_RESULT)/ })
    .count().catch(() => 0)))).reduce((total, count) => total + count, 0)
  expect(visibleCount).toBe(0)
}

async function expectCompletedWithoutAttentionDebugChat(
  page: Page,
  command: Awaited<ReturnType<typeof sendChatMessage>>,
): Promise<void> {
  const terminal = await waitForTerminalDispatch(page, command.session_id, command.persistedMessageId)
  expect(terminal.dispatch?.state).toBe('completed')
  await expectNoAttentionDebugChat(page, command.session_id)
}

function expectFreshSelectionMatchesCandidate(
  selected: SelectedAttentionTarget,
  candidate: AttentionCandidate,
  safeLabel: string,
  selectedPoint: { x: number, y: number },
): void {
  const expected = candidate.action_ref
  expect(expected).toBeDefined()
  const side = safeLabel.trim().split(/\s+/)[0]
  expect(selected).toEqual(expect.objectContaining({
    snapshot_id: expect.any(String),
    target_id: expect.any(String),
    host_instance_id: expected!.host_instance_id,
    mount_id: expected!.mount_id,
    generation: expected!.generation,
    path_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    label: expect.stringMatching(new RegExp(`\\b${side}\\b`, 'i')),
    rect: expect.objectContaining({
      height: expect.any(Number),
      width: expect.any(Number),
      x: expect.any(Number),
      y: expect.any(Number),
    }),
  }))
  expect(selectedPoint.x).toBeGreaterThanOrEqual(selected.rect.x - FIXTURE_JSON_NUMERIC_TOLERANCE)
  expect(selectedPoint.x).toBeLessThanOrEqual(selected.rect.x + selected.rect.width + FIXTURE_JSON_NUMERIC_TOLERANCE)
  expect(selectedPoint.y).toBeGreaterThanOrEqual(selected.rect.y - FIXTURE_JSON_NUMERIC_TOLERANCE)
  expect(selectedPoint.y).toBeLessThanOrEqual(selected.rect.y + selected.rect.height + FIXTURE_JSON_NUMERIC_TOLERANCE)
}

test.beforeEach(async ({ page }) => {
  await installAttentionWireTap(page)
})

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('attention-payload-metrics', {
    body: Buffer.from(JSON.stringify({
      schema: 'wippy.attention.e2e.payload-metrics.v1',
      cell,
      renderedMetricsAvailable: false,
      sends: await capturedPayloadMetrics(page),
      httpStages: capturedHttpStageMetrics(page),
      incoming: await capturedIncomingPackets(page),
      sendLifecycle: capturedAttentionSendLifecycle(page),
      compositionFailureCategories: capturedCompositionFailures(page),
    })),
    contentType: 'application/json',
  })
})

test.describe(`Attention agent acceptance: ${describeCell}`, () => {
  test('persists the explicit point and selection context and answers from the complete nested path', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    const selectedText = (await fixture.rightSafeText.textContent())?.trim()
    expect(selectedText).toBeTruthy()
    await fixture.rightSafeText.evaluate((element) => {
      const selection = element.ownerDocument.getSelection()
      if (!selection)
        throw new Error('document selection is unavailable')
      const range = element.ownerDocument.createRange()
      range.selectNodeContents(element)
      selection.removeAllRanges()
      selection.addRange(range)
      element.ownerDocument.dispatchEvent(new Event('selectionchange'))
    })
    await fixture.rightTarget.hover()

    const command = await sendChatMessage(page, composer, 'What am I pointing at, and what text is selected?', {
      beforeSubmit: async () => {
        await fixture.leftTarget.focus()
        await expect(fixture.leftTarget).toBeFocused()
      },
    })
    expect(attentionAttachment(command).version).toBe(4)
    const snapshot = attentionSnapshot(command)
    const pointed = pointerCandidates(snapshot)
    const pointerDiagnostics = `attention snapshot: ${JSON.stringify({
      capture: snapshot.capture,
      omissions: snapshot.omissions,
      pointer: snapshot.pointer,
      selection: snapshot.selection,
      pointerCandidates: pointed.map(candidate => ({
        kinds: candidate.path.map(segment => segment.kind),
        path: candidate.path,
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
      protocol: await attentionProtocolDiagnostics(page),
      retainedCandidates: snapshot.candidates.map(candidate => ({
        path_length: candidate.path.length,
        sample_point_ids: candidate.sample_point_ids,
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
      recentEvents: snapshot.recent_events,
    }, null, 2)}`

    expect(pointed.length, pointerDiagnostics).toBeGreaterThan(0)
    const right = pointed.find(candidate => JSON.stringify(candidate.summary).includes('right nested target'))
    expect(right, pointerDiagnostics).toBeDefined()
    expect(right!.path.length).toBeLessThanOrEqual(32)
    expectCompleteNestedPath(right!.path, pointerDiagnostics)
    expect(snapshot.host_instance_id).toBe(command.data.runtime_context?.attention?.host_instance_id)
    expect(snapshot.mount_generation).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(snapshot.created_at))).toBe(false)
    expect(snapshot.pointer).toEqual(expect.objectContaining({
      candidate_ids: expect.arrayContaining([right!.target_id]),
      observed_at: expect.any(String),
      sequence: expect.any(Number),
    }))
    expect(Date.parse(snapshot.pointer!.observed_at)).toBeLessThanOrEqual(Date.parse(snapshot.created_at))
    const focusDiagnostics = `attention protocol focus diagnostics: ${JSON.stringify((await attentionProtocolDiagnostics(page)).map((entry) => {
      const frame = entry as { frame?: unknown, messages?: unknown[] }
      return {
        frame: frame.frame,
        messages: (frame.messages ?? []).filter((message) => {
          const item = message as Record<string, unknown>
          return item.message_type === 'query-result'
            || item.message_type === 'error'
            || item.focus_present === true
            || (Array.isArray(item.omission_reasons) && item.omission_reasons.length > 0)
        }).map((message) => {
          const item = message as Record<string, unknown>
          return {
            message_type: item.message_type,
            request_id: item.request_id,
            parent_request_id: item.parent_request_id,
            source_mount_id: item.source_mount_id,
            target_mount_id: item.target_mount_id,
            complete: item.complete,
            focus_present: item.focus_present,
            focus_candidate_id_present: item.focus_candidate_id_present,
            focused_at: item.focused_at,
            focus_sequence: item.focus_sequence,
            focus_final_tag: item.focus_final_tag,
            focus_final_path_kinds: item.focus_final_path_kinds,
            omission_reasons: item.omission_reasons,
            omission_mount_ids: item.omission_mount_ids,
          }
        }),
        final_snapshot: {
          focus_path_kinds: snapshot.focus?.path.slice(0, 32).map(segment => segment.kind),
          omissions: snapshot.omissions?.slice(0, 32).map(omission => ({
            reason: omission.reason,
            mount_id: omission.mount_id,
            point_id: omission.point_id,
          })),
        },
      }
    }), null, 2)}`
    expect(snapshot.focus, focusDiagnostics).toEqual(expect.objectContaining({
      focused_at: expect.any(String),
      path: expect.any(Array),
      sequence: expect.any(Number),
    }))
    expect(snapshot.focus!.path.length).toBeGreaterThanOrEqual(2)
    expect(snapshot.focus!.path.at(-1)?.kind).toBe('element')
    expectCompleteNestedPath(snapshot.focus!.path, focusDiagnostics)
    expect(JSON.stringify(snapshot.focus!.summary)).toContain('left nested target')
    expect(Date.parse(snapshot.focus!.focused_at)).toBeLessThanOrEqual(Date.parse(snapshot.created_at))
    const selectionDiagnostics = `attention selection diagnostics: ${JSON.stringify({
      selection: snapshot.selection,
      omissions: snapshot.omissions,
      protocol: await attentionProtocolDiagnostics(page),
    }, null, 2)}`
    expect(snapshot.selection, selectionDiagnostics).toEqual(expect.objectContaining({
      selection_id: expect.any(String),
      selected_at: expect.any(String),
      kind: 'text',
      collapsed: false,
      text: expect.stringContaining(selectedText!),
      anchor_path: expect.any(Array),
      focus_path: expect.any(Array),
      ranges: expect.any(Array),
    }))
    expect(Buffer.byteLength(snapshot.selection!.text, 'utf8'), selectionDiagnostics).toBeLessThanOrEqual(1024)
    expect(Date.parse(snapshot.selection!.selected_at), selectionDiagnostics).toBeLessThanOrEqual(Date.parse(snapshot.created_at))
    expect(snapshot.selection!.anchor_path.length, selectionDiagnostics).toBeLessThanOrEqual(32)
    expect(snapshot.selection!.focus_path.length, selectionDiagnostics).toBeLessThanOrEqual(32)
    expectCompleteNestedPath(snapshot.selection!.anchor_path, selectionDiagnostics, 'span')
    expectCompleteNestedPath(snapshot.selection!.focus_path, selectionDiagnostics, 'span')
    expect(snapshot.selection!.ranges.length, selectionDiagnostics).toBeGreaterThan(0)
    expect(snapshot.selection!.ranges.length, selectionDiagnostics).toBeLessThanOrEqual(4)
    expect(snapshot.coordinate_space).toEqual(expect.objectContaining({
      device_pixel_ratio: expect.any(Number),
      kind: 'host-viewport',
    }))
    expect(command.data.runtime_context?.attention?.agent_actions_enabled).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(resolvedContextAttachments(command)), 'utf8')).toBeLessThanOrEqual(32 * 1024)
    expect(command.data.context_attachments).toBeUndefined()
    expect(command.data.context_attachments_ref).toBeDefined()
    const metrics = (await capturedPayloadMetrics(page)).filter(metric => metric.requestId === command.request_id)
    expect(metrics).toHaveLength(1)
    expect(metrics[0].attachmentArrayBytes).toBe(0)
    expect(metrics[0].commandBytes).toBeLessThan(4096)
    const stages = capturedHttpStageMetrics(page).filter(metric => metric.method === 'POST' && metric.requestId === command.request_id)
    expect(stages).toHaveLength(1)
    expect(stages[0].requestBytes).toBe(command.data.context_attachments_ref!.content_bytes)
    expect(stages[0].attention).toHaveLength(1)
    expect(stages[0].attention[0]).toEqual(expect.objectContaining({
      snapshotJsonBytes: Buffer.byteLength(attentionAttachment(command).content, 'utf8'),
      candidateCount: snapshot.candidates.length,
      recentEventCount: snapshot.recent_events.length,
      samplePointCount: snapshot.capture.points.length,
    }))

    const answer = await waitForAgentText(page, 'ATTENTION_E2E_TARGET')
    await expect(answer).toContainText(`PATH_SEGMENTS ${right!.path.length}`)
    await expect(answer).toContainText('Safe text for the right nested target')
    await expect(answer).toContainText(`SELECTION_TEXT ${selectedText}`)
    await expect(answer).toContainText(right!.target_id)
    expectAgentPathMatches(await extractAgentPath(answer), right!.path)

    const persisted = await waitForPersistedMessage(
      page,
      command.session_id,
      message => message.type === 'user'
        && message.message_id === command.persistedMessageId
        && message.data === command.data.text
        && message.metadata?.context_attachments?.some(item => (
          item.attachment_id === attentionAttachment(command).attachment_id
          && item.content_hash === attentionAttachment(command).content_hash
        )) === true,
    )
    const persistedAttachment = persisted.metadata?.context_attachments?.find(item => item.kind === 'wippy.attention')
    expect(persistedAttachment).toEqual(attentionAttachment(command))
  })

  test('records the current Host panel after a real Send click moves focus out of the nested document', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await fixture.rightTarget.hover()

    const command = await sendChatMessage(page, composer, 'What is focused after Send?', {
      beforeSubmit: async () => {
        await fixture.leftTarget.focus()
        await expect(fixture.leftTarget).toBeFocused()
      },
      submit: async () => {
        await page.locator('.chat-input__send-button').click()
      },
    })
    const snapshot = attentionSnapshot(command)
    expect(snapshot.focus).toEqual(expect.objectContaining({
      focused_at: expect.any(String),
      path: expect.any(Array),
      sequence: expect.any(Number),
    }))
    expect(snapshot.focus!.path.map(segment => segment.kind)).toEqual(['host', 'panel'])
    expect(JSON.stringify(snapshot.focus!.summary)).not.toContain('left nested target')

    const persisted = await waitForPersistedMessage(
      page,
      command.session_id,
      message => message.type === 'user' && message.message_id === command.persistedMessageId,
    )
    const persistedAttachment = persisted.metadata?.context_attachments?.find(item => item.kind === 'wippy.attention')
    expect(persistedAttachment).toEqual(attentionAttachment(command))
  })

  test('discovers both edge children and completes the projected confirmation overlay', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await moveToSiblingBoundary(page, fixture)

    const command = await sendChatMessage(page, composer, 'Please confirm the boundary — is that it?')
    const snapshot = attentionSnapshot(command)
    expect(snapshot.capture, JSON.stringify({
      capture: snapshot.capture,
      omissions: snapshot.omissions,
      candidates: snapshot.candidates.map(candidate => ({
        path: candidate.path,
        sample_point_ids: candidate.sample_point_ids,
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
    }, null, 2)).toEqual(expect.objectContaining({
      grid_step_css_px: 5,
      radius_css_px: 20,
      sampled_points: 49,
    }))
    if (!snapshot.capture.complete)
      expect(snapshot.omissions).toContainEqual(expect.objectContaining({ reason: 'response-budget' }))
    expect(snapshot.capture.points).toHaveLength(snapshot.capture.sampled_points)
    expect(new Set(snapshot.capture.points.map(point => point.point_id)).size).toBe(snapshot.capture.sampled_points)

    const leftCandidate = snapshot.candidates.find(candidate => JSON.stringify(candidate.summary).includes('left nested target'))!
    const rightCandidate = snapshot.candidates.find(candidate => JSON.stringify(candidate.summary).includes('right nested target'))!
    const candidateDiagnostics = JSON.stringify({
      omissions: snapshot.omissions,
      pointer: snapshot.pointer,
      protocol: await attentionProtocolDiagnostics(page),
      retained: snapshot.candidates.map(candidate => ({
        path_length: candidate.path.length,
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
    }, null, 2)
    expect(leftCandidate, candidateDiagnostics).toBeDefined()
    expect(rightCandidate, candidateDiagnostics).toBeDefined()
    expect(leftCandidate.target_id).not.toBe(rightCandidate.target_id)
    expect(leftCandidate.sample_point_ids.length).toBeGreaterThan(0)
    expect(rightCandidate.sample_point_ids.length).toBeGreaterThan(0)
    const validSampleIds = new Set([
      ...snapshot.capture.points.map(point => point.point_id),
      ...snapshot.recent_events.map(event => event.event_id),
      ...(snapshot.pointer ? [snapshot.pointer.event_id] : []),
      ...(snapshot.focus ? [snapshot.focus.event_id] : []),
    ])
    expect(leftCandidate.sample_point_ids.every(id => validSampleIds.has(id))).toBe(true)
    expect(rightCandidate.sample_point_ids.every(id => validSampleIds.has(id))).toBe(true)
    const persisted = await waitForPersistedMessage(
      page,
      command.session_id,
      message => message.type === 'user' && message.message_id === command.persistedMessageId,
    )
    expect(persisted.metadata?.context_attachments).toEqual(resolvedContextAttachments(command))
    const overlay = await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'Attention confirmation overlay', 30_000)
    const targets = overlay.locator('button[data-wippy-attention-target]')
    await expect(targets).toHaveCount(2)
    const left = targets.nth(0)
    const right = targets.nth(1)
    await expect(left).toHaveAttribute('data-wippy-attention-target')
    await expect(right).toHaveAttribute('data-wippy-attention-target')
    const projectedLeft = await left.evaluate(element => ({
      height: Number.parseFloat(element.style.height),
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
    }))
    expect(projectedLeft.height).toBeCloseTo(Math.max(1, leftCandidate.action_ref!.rect.height), 3)
    expect(projectedLeft.left).toBeCloseTo(leftCandidate.action_ref!.rect.x, 3)
    expect(projectedLeft.top).toBeCloseTo(leftCandidate.action_ref!.rect.y, 3)
    expect(projectedLeft.width).toBeCloseTo(Math.max(1, leftCandidate.action_ref!.rect.width), 3)
    const projectedRight = await right.evaluate(element => ({
      height: Number.parseFloat(element.style.height),
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
    }))
    expect(projectedRight.height).toBeCloseTo(Math.max(1, rightCandidate.action_ref!.rect.height), 3)
    expect(projectedRight.left).toBeCloseTo(rightCandidate.action_ref!.rect.x, 3)
    expect(projectedRight.top).toBeCloseTo(rightCandidate.action_ref!.rect.y, 3)
    expect(projectedRight.width).toBeCloseTo(Math.max(1, rightCandidate.action_ref!.rect.width), 3)

    const acceptedRoot = command.command_response.dispatch
    expect(acceptedRoot).toBeDefined()
    expect(acceptedRoot!.message_id).toBe(command.persistedMessageId)
    const pendingFunction = await (async () => {
      try {
        return await waitForPersistedMessage(page, command.session_id, message => message.type === 'private_function'
          && message.metadata?.call_id === 'attention-e2e-confirm-1' && message.metadata.status === 'pending')
      }
      catch (error) {
        const [history, incoming] = await Promise.all([
          sessionMessages(page, command.session_id),
          capturedIncomingPackets(page),
        ])
        const rootDispatchId = acceptedRoot?.dispatch_id
        const relevantHistory = history
          .filter(message => message.type === 'private_function' || message.message_id === command.persistedMessageId)
          .slice(-16)
          .map(message => ({
            call_id: message.metadata?.call_id,
            message_id: message.message_id,
            observed_at: new Date().toISOString(),
            session_id: message.session_id,
            status: message.metadata?.status,
            type: message.type,
          }))
        const relevantIncoming = incoming
          .filter(packet => packet.call_id === 'attention-e2e-confirm-1'
            || packet.root_message_id === command.persistedMessageId
            || packet.dispatch?.dispatch_id === rootDispatchId)
          .slice(-32)
          .map(packet => ({
            call_id: packet.call_id,
            dispatch_id: packet.dispatch?.dispatch_id,
            dispatch_state: packet.dispatch?.state,
            message_id: packet.message_id,
            received_at: packet.received_at,
            root_message_id: packet.root_message_id,
            session_id: packet.session_id,
            status: packet.status,
            type: packet.type,
          }))
        throw new Error(`${error instanceof Error ? error.message : String(error)}; sanitized pending-function lifecycle: ${JSON.stringify({
          expected_call_id: 'attention-e2e-confirm-1',
          function_call_observed: relevantIncoming.some(packet => packet.type === 'function_call'),
          function_success_observed: relevantIncoming.some(packet => packet.type === 'function_success'),
          history: relevantHistory,
          incoming: relevantIncoming,
          root_dispatch_id: rootDispatchId,
          root_message_id: command.persistedMessageId,
          session_id: command.session_id,
          terminal_dispatch_observed: relevantIncoming.some(packet => packet.type === 'dispatch_status'
            && ['completed', 'interrupted', 'cancelled'].includes(packet.dispatch_state ?? '')),
        })}`)
      }
    })()
    expect(pendingFunction.message_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(pendingFunction.message_id).not.toBe(pendingFunction.metadata!.call_id)
    expect((await capturedIncomingPackets(page)).filter(packet => packet.call_id === pendingFunction.metadata!.call_id
      && ['function_call', 'function_success', 'function_error'].includes(packet.type))).toHaveLength(0)
    expect((await Promise.all(page.frames().map(frame => frame.locator(`[data-message-part="tool"][data-message-id="${pendingFunction.message_id}"]`).count())))
      .reduce((total, count) => total + count, 0)).toBe(0)

    await right.click()
    await expect(right).toHaveAttribute('aria-pressed', 'true')
    await (await findVisibleRole(page, 'button', 'Yes, that’s it')).click()

    const result = await waitForUiActionResult(page, command.session_id, 'confirmed')
    expect(result.data.selected_target?.target_id).toBe(rightCandidate.target_id)
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    const terminal = await waitForTerminalDispatch(page, command.session_id, command.persistedMessageId)
    if (terminal.dispatch?.state !== 'completed') {
      const [history, incoming] = await Promise.all([
        sessionMessages(page, command.session_id),
        capturedIncomingPackets(page),
      ])
      throw new Error(`sanitized terminal dispatch failure: ${JSON.stringify({
        dispatch: terminal.dispatch,
        history: history.slice(-16).map(message => ({
          call_id: message.metadata?.call_id,
          message_id: message.message_id,
          session_id: message.session_id,
          source_id: message.metadata?.source_id,
          status: message.metadata?.status,
          type: message.type,
        })),
        incoming: incoming
          .filter(packet => packet.root_message_id === command.persistedMessageId || packet.dispatch?.dispatch_id === acceptedRoot!.dispatch_id)
          .slice(-24)
          .map(packet => ({
            dispatch_id: packet.dispatch?.dispatch_id,
            dispatch_state: packet.dispatch?.state,
            message_id: packet.message_id,
            root_message_id: packet.root_message_id,
            status: packet.status,
            type: packet.type,
          })),
        root_message_id: command.persistedMessageId,
        session_id: command.session_id,
      })}`)
    }
    expect(terminal.dispatch).toEqual(expect.objectContaining({
      dispatch_id: acceptedRoot!.dispatch_id,
      message_id: command.persistedMessageId,
      response_id: acceptedRoot!.response_id,
      state: 'completed',
      terminal_code: 'DISPATCH_COMPLETED',
    }))
    expect((await Promise.all(page.frames().map(frame => frame.locator(`[data-message-part="tool"][data-message-id="${pendingFunction.message_id}"]`).count())))
      .reduce((total, count) => total + count, 0)).toBe(0)
    const lifecycle = (await capturedIncomingPackets(page)).filter(packet => packet.call_id === pendingFunction.metadata!.call_id)
    expect(lifecycle.filter(packet => ['function_call', 'function_success', 'function_error'].includes(packet.type))).toHaveLength(0)
    expect((await capturedIncomingPackets(page)).filter(packet => packet.type === 'dispatch_status'
      && packet.topic === `session:${command.session_id}` && packet.dispatch?.message_id === command.persistedMessageId
      && ['completed', 'interrupted', 'cancelled'].includes(packet.dispatch.state))).toHaveLength(1)
    const history = await sessionMessages(page, command.session_id)
    const functions = history.filter(message => message.type === 'private_function' && message.metadata?.call_id === pendingFunction.metadata!.call_id)
    expect(functions).toHaveLength(1)
    expect(functions[0].message_id).toBe(pendingFunction.message_id)
    expect(functions[0].metadata?.status).toBe('success')
    expect(history.filter(message => message.type === 'assistant'
      && message.data.includes('ATTENTION_E2E_ACTION_RESULT'))).toHaveLength(0)
    await expectNoAttentionDebugChat(page, command.session_id)
  })

  test('selects an unoffered area with a pointer and explicit confirmation', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await fixture.leftTarget.hover()
    const targetBox = await fixture.leftTarget.boundingBox()
    expect(targetBox).not.toBeNull()
    const pointerDownsBefore = Number(await fixture.leftTarget.getAttribute('data-pointer-down-count') ?? 0)

    const command = await sendChatMessage(page, composer, 'Click the area I meant using the pointer')
    const snapshot = attentionSnapshot(command)
    const pointed = pointerCandidates(snapshot)
    const intended = pointed.find(candidate => (
      JSON.stringify(candidate.summary).includes('left nested target')
    ))
    expect(intended, `attention snapshot: ${JSON.stringify({
      capture: snapshot.capture,
      omissions: snapshot.omissions,
      pointer: snapshot.pointer,
      pointerCandidates: pointed.map(candidate => ({
        kinds: candidate.path.map(segment => segment.kind),
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
      protocol: await attentionProtocolDiagnostics(page),
      retainedCandidates: snapshot.candidates.map(candidate => ({
        path_length: candidate.path.length,
        sample_point_ids: candidate.sample_point_ids,
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
      recentEvents: snapshot.recent_events,
    }, null, 2)}`).toBeDefined()
    const overlay = await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'Attention selection overlay', 30_000)
    await page.mouse.click(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2)
    expect(Number(await fixture.leftTarget.getAttribute('data-pointer-down-count') ?? 0)).toBe(pointerDownsBefore)
    await expect(overlay.getByRole('button', { name: 'Use this area' })).toBeVisible()
    await overlay.getByRole('button', { name: 'Use this area' }).click()

    const result = await waitForUiActionResult(page, command.session_id, 'selected')
    expectFreshSelectionMatchesCandidate(result.data.selected_target!, intended!, 'left nested target', {
      x: targetBox!.x + targetBox!.width / 2,
      y: targetBox!.y + targetBox!.height / 2,
    })
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    await expectCompletedWithoutAttentionDebugChat(page, command)
  })

  test('highlights the exact pointer target through the dedicated agent action', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await fixture.rightTarget.hover()

    const command = await sendChatMessage(page, composer, 'Highlight what I am pointing at')
    const snapshot = attentionSnapshot(command)
    const intendedTargetId = snapshot.pointer?.candidate_ids[0]
    const intended = snapshot.candidates.find(candidate => candidate.target_id === intendedTargetId)
    expect(intendedTargetId).toBeTruthy()
    expect(intended?.action_ref).toEqual(expect.objectContaining({
      target_id: intendedTargetId,
      label: expect.any(String),
    }))
    expect(JSON.stringify(intended?.summary)).toContain('right nested target')
    const target = await findVisible(
      page,
      root => root.locator('[data-wippy-attention-overlay] [data-wippy-attention-target]'),
      'highlighted Attention target',
      30_000,
    )
    await expect(target).toHaveAccessibleName(intended!.action_ref!.label!)
    const projected = await target.evaluate(element => ({
      height: Number.parseFloat(element.style.height),
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
    }))
    expect(projected.height).toBeCloseTo(Math.max(1, intended!.action_ref!.rect.height), 3)
    expect(projected.left).toBeCloseTo(intended!.action_ref!.rect.x, 3)
    expect(projected.top).toBeCloseTo(intended!.action_ref!.rect.y, 3)
    expect(projected.width).toBeCloseTo(Math.max(1, intended!.action_ref!.rect.width), 3)
    await expect(await findVisibleRole(page, 'heading', 'Highlighted area')).toBeVisible()
    await (await findVisibleRole(page, 'button', 'Done')).click()

    const result = await waitForUiActionResult(page, command.session_id, 'confirmed')
    expect(result.data.selected_target?.target_id).toBe(intended!.target_id)
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    await expectCompletedWithoutAttentionDebugChat(page, command)
  })

  test('selects the current pointer area entirely by keyboard', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await fixture.rightTarget.hover()
    const targetBox = await fixture.rightTarget.boundingBox()
    expect(targetBox).not.toBeNull()
    await composer.focus()

    const command = await sendChatMessage(page, composer, 'Click the area I meant using the keyboard')
    const snapshot = attentionSnapshot(command)
    const pointed = pointerCandidates(snapshot)
    const intended = pointed.find(candidate => (
      JSON.stringify(candidate.summary).includes('right nested target')
    ))
    expect(intended, `attention snapshot: ${JSON.stringify({
      capture: snapshot.capture,
      omissions: snapshot.omissions,
      pointer: snapshot.pointer,
      pointerCandidates: pointed.map(candidate => ({
        kinds: candidate.path.map(segment => segment.kind),
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
      protocol: await attentionProtocolDiagnostics(page),
      retainedCandidates: snapshot.candidates.map(candidate => ({
        path_length: candidate.path.length,
        sample_point_ids: candidate.sample_point_ids,
        summary: candidate.summary,
        target_id: candidate.target_id,
      })),
      recentEvents: snapshot.recent_events,
    }, null, 2)}`).toBeDefined()
    const useCurrent = await findVisibleRole(page, 'button', 'Use current pointer area', 30_000)
    await expect(useCurrent).toBeFocused()
    await page.keyboard.press('Enter')
    const useArea = await findVisibleRole(page, 'button', 'Use this area')
    await useArea.focus()
    await page.keyboard.press('Enter')

    const result = await waitForUiActionResult(page, command.session_id, 'selected')
    expectFreshSelectionMatchesCandidate(result.data.selected_target!, intended!, 'right nested target', {
      x: targetBox!.x + targetBox!.width / 2,
      y: targetBox!.y + targetBox!.height / 2,
    })
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    await expectCompletedWithoutAttentionDebugChat(page, command)
  })

  test('cancels with Escape and restores composer focus', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await composer.focus()

    const command = await sendChatMessage(page, composer, 'Click the area I meant, then cancel')
    await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'Attention selection overlay', 30_000)
    await page.keyboard.press('Escape')

    const result = await waitForUiActionResult(page, command.session_id, 'cancelled')
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    await expect(composer).toBeFocused()
    await expectCompletedWithoutAttentionDebugChat(page, command)
  })

  test('invalidates a live target when viewport geometry changes', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await moveToSiblingBoundary(page, fixture)

    const command = await sendChatMessage(page, composer, 'Please confirm the boundary — is that it?')
    await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'Attention confirmation overlay', 30_000)
    const viewport = page.viewportSize() ?? { height: 720, width: 1280 }
    await page.setViewportSize({ height: viewport.height + 1, width: viewport.width })

    const result = await waitForUiActionResult(page, command.session_id, 'stale')
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    await expectCompletedWithoutAttentionDebugChat(page, command)
  })

  test('returns one stale result when Host navigation invalidates a pending action', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)

    const command = await sendChatMessage(page, composer, 'Click the area I meant before navigation')
    await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'Attention selection overlay', 30_000)
    await navigateAttentionHost(page, '/')

    const result = await waitForUiActionResult(page, command.session_id, 'stale')
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    await expectCompletedWithoutAttentionDebugChat(page, command)
  })

  test('expires through the real broker and host timer in a short-TTL runtime cell', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    test.skip(cell.actionTtlSeconds > 10, 'launch Wippy with ui_action_ttl_seconds <= 10 for the timeout cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)

    const command = await sendChatMessage(page, composer, 'Click the area I meant and let it time out')
    await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'Attention selection overlay', 30_000)
    const result = await waitForUiActionResult(page, command.session_id, 'expired', (cell.actionTtlSeconds + 10) * 1000)
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    await expectCompletedWithoutAttentionDebugChat(page, command)
  })

  test('disconnects a pending action and recovers the same session after reconnect', async ({ page }) => {
    test.skip(cell.mode !== 'enabled', 'requires the enabled Attention runtime cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)

    const command = await sendChatMessage(page, composer, 'Click the area I meant across disconnect and reconnect')
    await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'Attention selection overlay', 30_000)
    const pendingFunction = await waitForPersistedMessage(
      page,
      command.session_id,
      message => message.type === 'private_function'
        && message.metadata?.call_id === 'attention-e2e-select-1'
        && message.metadata.status === 'pending',
    )
    expect(await disconnectAttentionSockets(page)).toBeGreaterThan(0)
    await expect.poll(async () => {
      try {
        return await attentionOverlayCount(page)
      }
      catch {
        return 0
      }
    }, { timeout: 20_000 }).toBe(0)

    await waitForAttentionSocketReplacement(page)
    const reopenedComposer = await openPersistedSession(page, command.session_id)
    const lifecycle = await waitForPersistedMessage(
      page,
      command.session_id,
      message => message.message_id === pendingFunction.message_id
        && message.type === 'private_function'
        && message.metadata?.status !== 'pending',
      45_000,
    )
    expect(lifecycle.metadata?.status).toBe('success')
    expect(lifecycle.metadata?.result).toEqual(expect.objectContaining({
      in_reply_to_action_id: expect.any(String),
      session_id: command.session_id,
      status: 'disconnected',
    }))
    const completedFunctions = (await sessionMessages(page, command.session_id)).filter(message => (
      message.message_id === pendingFunction.message_id
      && message.type === 'private_function'
      && message.metadata?.status === 'success'
    ))
    expect(completedFunctions).toHaveLength(1)
    const terminal = await requestDispatchStatus(page, command.session_id, command.command_response.dispatch!.dispatch_id)
    expect(terminal).toEqual(expect.objectContaining({
      dispatch_id: command.command_response.dispatch?.dispatch_id,
      message_id: command.persistedMessageId,
      response_id: command.command_response.dispatch?.response_id,
      state: 'completed',
      terminal_code: 'DISPATCH_COMPLETED',
    }))
    await expectNoAttentionDebugChat(page, command.session_id)

    const reconnected = await sendChatMessage(page, reopenedComposer, 'Verify the session WebSocket after reconnect')
    expect(reconnected.session_id).toBe(command.session_id)
    await waitForPersistedMessage(
      page,
      command.session_id,
      message => message.message_id === reconnected.persistedMessageId && message.type === 'user',
    )
    const freshAnswer = await waitForAgentText(page, 'ATTENTION_E2E_CONTEXT_MISSING')
    await expect(freshAnswer).not.toContainText('ATTENTION_E2E_ACTION_RESULT disconnected')
    await waitForPersistedMessage(
      page,
      command.session_id,
      message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'),
    )
  })

  test('preserves semantic context when the Host capture provider denies the request', async ({ page }) => {
    test.skip(cell.mode !== 'enabled' || cell.visualMode !== 'denied', 'requires the visual-capture denial runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await fixture.leftTarget.hover()

    const restoreProvider = await denyAttentionCaptureProvider(page)
    try {
      const command = await sendChatMessage(page, composer, 'prepare screenshot of this area')
      expect(resolvedContextAttachments(command)).toHaveLength(1)
      expect(resolvedContextAttachments(command)?.some(item => item.kind === 'wippy.attention.visual')).toBe(false)
      const overlay = await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'visual capture overlay', 30_000)
      await overlay.getByRole('button', { name: 'Add image to message', exact: true }).click()
      const denied = await waitForUiActionResult(page, command.session_id, 'denied')
      expect(await terminalResultsForAction(page, denied.data.in_reply_to_action_id)).toHaveLength(1)
      expect(await attentionOverlayCount(page)).toBe(0)
      await expect(page.locator('.chat-input__upload-list, .message-input__files')).toHaveCount(0)
    }
    finally {
      await restoreProvider()
    }

    await enablePointingContext(page)
    await fixture.leftTarget.hover()
    const semantic = await sendChatMessage(page, composer, 'What am I pointing at after denied capture?')
    const semanticSnapshot = attentionSnapshot(semantic)
    expect(semanticSnapshot.omissions).not.toContainEqual(expect.objectContaining({ capture_code: 'permission-denied' }))
    const left = pointerCandidates(semanticSnapshot).find(candidate => JSON.stringify(candidate.summary).includes('left nested target'))
    expect(left).toBeDefined()
    expectCompleteNestedPath(left!.path)
    const answerPath = await extractAgentPath(await waitForAgentText(page, 'ATTENTION_E2E_TARGET'))
    expectCompleteNestedPath(answerPath)
    expectAgentPathMatches(answerPath, left!.path)
  })

  test('prepares a removable target capture and attaches it only on later Send', async ({ page }) => {
    test.skip(cell.mode !== 'enabled' || !cell.visualCapture, 'requires the enabled visual-capture runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await fixture.leftTarget.hover()

    const command = await sendChatMessage(page, composer, 'prepare screenshot of this area')
    expect(resolvedContextAttachments(command)).toHaveLength(1)
    const snapshot = attentionSnapshot(command)
    const intended = pointerCandidates(snapshot).find(candidate => JSON.stringify(candidate.summary).includes('left nested target'))
    expect(intended).toBeDefined()
    const overlay = await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'visual capture overlay', 30_000)
    const selectedArea = overlay.getByRole('button', { name: 'Selected area', exact: true })
    const viewport = overlay.getByRole('button', { name: 'Entire app viewport', exact: true })
    await expect(selectedArea).toHaveAttribute('aria-pressed', 'true')
    await expect(viewport).toHaveAttribute('aria-pressed', 'false')
    await overlay.getByRole('button', { name: 'Add image to message', exact: true }).click()

    const result = await waitForUiActionResult(page, command.session_id, 'prepared')
    expect(result.data.prepared_file?.uuid).toMatch(/^[\w-]+$/)
    expect(result.data.prepared_file?.mime_type).toMatch(/^image\//)
    expect(result.data.prepared_file?.name).toBeTruthy()
    expect(result.data.prepared_file?.byte_size).toBeGreaterThan(0)
    expect(result.data.prepared_file?.sha256).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(result.data.prepared_file?.scope).toBe('target')
    expect(await terminalResultsForAction(page, result.data.in_reply_to_action_id)).toHaveLength(1)
    const queue = await findVisibleUploadQueue(page)
    await expect(queue).toHaveCount(1)
    await expect(queue).toContainText(result.data.prepared_file!.name!)
    expect(await capturedWireMessages(page)).not.toContainEqual(expect.objectContaining({
      type: 'session_message',
      data: expect.objectContaining({ context_attachments: expect.arrayContaining([expect.objectContaining({ kind: 'wippy.attention.visual' })]) }),
    }))

    const sentMessagesBeforeRemoval = (await capturedWireMessages(page))
      .filter(message => message.type === 'session_message').length
    await removeFirstUpload(page)
    await expect(queue).toHaveCount(0)
    await page.waitForTimeout(250)
    expect((await capturedWireMessages(page))
      .filter(message => message.type === 'session_message')).toHaveLength(sentMessagesBeforeRemoval)

    await enablePointingContext(page)
    await fixture.leftTarget.hover()
    const recapture = await sendChatMessage(page, composer, 'prepare screenshot of this area again')
    const recaptureOverlay = await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'second visual capture overlay', 30_000)
    await recaptureOverlay.getByRole('button', { name: 'Add image to message', exact: true }).click()
    const prepared = await waitForUiActionResult(
      page,
      recapture.session_id,
      'prepared',
      20_000,
      result.data.in_reply_to_action_id,
    )
    expect(prepared.data.prepared_file?.uuid).toMatch(/^[\w-]+$/)
    const recaptureQueue = await findVisibleUploadQueue(page)
    await expect(recaptureQueue).toContainText(prepared.data.prepared_file!.name!)
    const sent = await sendChatMessage(page, composer, 'What am I pointing at with a successful screenshot?')
    expect((resolvedContextAttachments(sent) ?? []).some(item => item.kind === 'wippy.attention.visual')).toBe(false)
    expect(sent.data.file_uuids).toContain(prepared.data.prepared_file!.uuid)
    const answer = await waitForAgentText(page, 'ATTENTION_E2E_VISUAL')
    await expect(answer).toContainText('image/png')
  })

  test('rejects one malformed attachment atomically and keeps normal chat usable', async ({ page }) => {
    test.skip(cell.mode !== 'enabled' || cell.visualCapture, 'requires the standard enabled runtime cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    const seed = await sendChatMessage(page, composer, 'Seed the single malformed attachment regression')
    const seedAck = (await capturedIncomingPackets(page)).find(packet => packet.type === 'command_response'
      && packet.request_id === seed.request_id)
    expect(seedAck, 'plain-message ACK must carry a real empty receipt array').toEqual(expect.objectContaining({
      attachmentReceiptCount: 0,
      attachmentsShape: 'array',
      dispatch: expect.objectContaining({ message_id: seed.persistedMessageId }),
    }))
    await waitForPersistedMessage(page, seed.session_id, message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'))
    await waitForSessionComposerReady(page, seed.session_id)
    const malformed = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'wippy.attention',
      version: 1,
      content_type: 'application/json',
      content: '{',
      created_at: new Date().toISOString(),
    })
    const rejectedText = 'ATTENTION_INVALID_single-malformed-atomic-rejection'
    const rejected = await sendRawSessionMessage(page, seed.session_id, rejectedText, [malformed])
    expect(rejected.commandResponse).toEqual(expect.objectContaining({
      code: 'invalid_context_attachments',
      detail_code: 'invalid-json',
      request_id: rejected.requestId,
      socket_id: rejected.socketId,
      topic: `session:${seed.session_id}`,
      success: false,
    }))
    expect(rejected.commandResponse.message_id).toBeUndefined()
    const assertSingleRejection = async () => {
      expect((await capturedWireMessages(page)).filter(message => message.type === 'session_message'
        && message.request_id === rejected.requestId)).toHaveLength(1)
      const responses = (await capturedCommandResponses(page)).filter(response => response.request_id === rejected.requestId)
      expect(responses).toHaveLength(1)
      expect(responses[0]).toEqual(rejected.commandResponse)
      expect((await sessionMessages(page, seed.session_id)).filter(message => message.data === rejectedText)).toHaveLength(0)
    }
    await assertSingleRejection()
    const previousAssistantIds = new Set((await sessionMessages(page, seed.session_id))
      .filter(message => message.type === 'assistant')
      .map(message => message.message_id))
    const readyComposer = await waitForSessionComposerReady(page, seed.session_id)
    const followup = await sendChatMessage(page, readyComposer, 'Verify normal chat after the single malformed attachment rejection')
    expect(followup.session_id).toBe(seed.session_id)
    await waitForPersistedMessage(page, seed.session_id, message => message.message_id === followup.persistedMessageId)
    await waitForPersistedMessage(page, seed.session_id, message => message.type === 'assistant'
      && !previousAssistantIds.has(message.message_id) && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'))
    await waitForSessionComposerReady(page, seed.session_id)
    await assertSingleRejection()
  })

  test('retries a context message idempotently and rejects conflicting reuse', async ({ page }) => {
    test.skip(cell.mode !== 'enabled' || cell.visualCapture, 'requires the standard enabled runtime cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    const seed = await sendChatMessage(page, composer, 'Seed the explicit context idempotency regression')
    await waitForPersistedMessage(page, seed.session_id, message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'))
    await waitForSessionComposerReady(page, seed.session_id)
    const context = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'example.future-context',
      version: 99,
      content_type: 'application/json',
      content: JSON.stringify({ note: 'explicit idempotency regression' }),
      created_at: new Date().toISOString(),
    })
    const text = 'ATTENTION_EXPLICIT_IDEMPOTENT_MESSAGE'
    const first = await sendRawSessionMessage(page, seed.session_id, text, [context])
    expect(first.commandResponse.success).toBe(true)
    expect(first.persistedMessageId).toEqual(expect.any(String))
    const retry = await sendRawSessionMessage(page, seed.session_id, text, [context], { requestId: first.requestId })
    expect(retry.commandResponse).toEqual(expect.objectContaining({ success: true, message_id: first.persistedMessageId }))
    const conflictText = 'ATTENTION_IDEMPOTENCY_CONFLICT_MUST_NOT_OVERWRITE'
    const conflict = await sendRawSessionMessage(page, seed.session_id, conflictText, [context], { requestId: first.requestId })
    expect(conflict.commandResponse).toEqual(expect.objectContaining({ code: 'request_conflict', success: false }))
    expect(conflict.commandResponse.message_id).toBeUndefined()
    const terminal = await waitForTerminalDispatch(page, seed.session_id, first.persistedMessageId!)
    expect(terminal.dispatch?.state).toBe('completed')
    const history = await sessionMessages(page, seed.session_id)
    expect(history.filter(message => message.data === conflictText)).toHaveLength(0)
    const persisted = history.filter(message => message.message_id === first.persistedMessageId)
    expect(persisted).toHaveLength(1)
    expect(persisted[0].data).toBe(text)
    expect(persisted[0].metadata?.context_attachments).toEqual([context])
    expect(history.filter(message => message.type === 'assistant' && message.metadata?.source_id === first.persistedMessageId)).toHaveLength(1)
  })

  for (const arrayBytes of [8, 16, 24, 32].map(kib => kib * 1024)) {
    test(`accepts a valid ${arrayBytes}-byte attachment array without crossing the documented quota`, async ({ page }) => {
      test.skip(cell.mode !== 'enabled' || cell.visualCapture, 'requires the standard enabled runtime cell')
      await bootAttentionTracer(page, cell)
      const composer = await startDeterministicAttentionChat(page)
      const seed = await sendChatMessage(page, composer, 'Seed the synthetic valid attachment quota boundary')
      await waitForPersistedMessage(page, seed.session_id, message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'))
      await waitForSessionComposerReady(page, seed.session_id)
      const metadata = {
        attachment_id: crypto.randomUUID(),
        kind: 'example.future-context',
        version: 99,
        content_type: 'application/json' as const,
        created_at: new Date().toISOString(),
      }
      // Artificial inert filler isolates the generic wire boundary; it is not an
      // estimate of real Attention payload size. Nothing is sent during sizing.
      let fillerBytes = arrayBytes - 1024
      let attachment = await sha256Attachment(page, { ...metadata, content: JSON.stringify({ note: 'x'.repeat(fillerBytes) }) })
      fillerBytes += arrayBytes - Buffer.byteLength(JSON.stringify([attachment]), 'utf8')
      attachment = await sha256Attachment(page, { ...metadata, content: JSON.stringify({ note: 'x'.repeat(fillerBytes) }) })
      expect(Buffer.byteLength(JSON.stringify([attachment]), 'utf8')).toBe(arrayBytes)
      const sent = await sendStagedSessionMessage(page, seed.session_id, `ATTENTION_VALID_QUOTA_${arrayBytes}`, [attachment], { runtimeContext: seed.data.runtime_context })
      expect(sent.commandResponse).toEqual(expect.objectContaining({
        success: true,
        request_id: sent.requestId,
        socket_id: sent.socketId,
        topic: `session:${seed.session_id}`,
      }))
      const persisted = await waitForPersistedMessage(page, seed.session_id, message => message.message_id === sent.persistedMessageId)
      expect(persisted.metadata?.context_attachments).toEqual([attachment])
      const metrics = (await capturedPayloadMetrics(page)).filter(metric => metric.requestId === sent.requestId)
      expect(metrics).toHaveLength(1)
      expect(metrics[0].attachmentArrayBytes).toBe(0)
      expect(metrics[0].commandBytes).toBeLessThan(4096)
      const stages = capturedHttpStageMetrics(page).filter(metric => metric.method === 'POST' && metric.requestId === sent.requestId)
      expect(stages).toHaveLength(1)
      expect(stages[0].requestBytes).toBe(arrayBytes)
      const wire = (await capturedWireMessages(page)).find(message => message.type === 'session_message' && message.request_id === sent.requestId)
      expect(wire?.data).not.toHaveProperty('context_attachments')
      expect(wire?.data).toHaveProperty('context_attachments_ref.content_bytes', arrayBytes)
      expect((await capturedCommandResponses(page)).filter(response => response.request_id === sent.requestId)).toHaveLength(1)
      await waitForSessionComposerReady(page, seed.session_id)
    })
  }

  test('rejects one logically oversized HTTP attachment without a message and leaves the session usable', async ({ page }) => {
    test.skip(cell.mode !== 'enabled' || cell.visualCapture, 'requires the standard enabled runtime cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    const seed = await sendChatMessage(page, composer, 'Seed the synthetic oversized attachment rejection')
    await waitForPersistedMessage(page, seed.session_id, message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'))
    await waitForSessionComposerReady(page, seed.session_id)
    const oversized = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'example.future-context',
      version: 99,
      content_type: 'application/json',
      content: JSON.stringify({ note: 'x'.repeat(33 * 1024) }),
      created_at: new Date().toISOString(),
    })
    const rejectedText = 'ATTENTION_INVALID_oversized-bytes'
    await verifyContextStagingCapability(page, seed.session_id)
    const rejected = await stageContextAttachmentsForTest(page, seed.session_id, crypto.randomUUID(), [oversized])
    expect(rejected.status).toBeGreaterThanOrEqual(400)
    expect(rejected.status).toBeLessThan(500)
    expect(rejected.status).toBe(413)
    expect(rejected.code).toBe('CONTEXT_BODY_TOO_LARGE')
    expect(rejected.reference).toBeUndefined()
    const previousAssistantIds = new Set((await sessionMessages(page, seed.session_id))
      .filter(message => message.type === 'assistant')
      .map(message => message.message_id))
    const readyComposer = await waitForSessionComposerReady(page, seed.session_id)
    const followup = await sendChatMessage(page, readyComposer, 'Verify normal chat after oversized attachment rejection')
    expect(followup.session_id).toBe(seed.session_id)
    await waitForPersistedMessage(page, seed.session_id, message => message.message_id === followup.persistedMessageId)
    await waitForPersistedMessage(page, seed.session_id, message => message.type === 'assistant'
      && !previousAssistantIds.has(message.message_id) && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'))
    expect((await sessionMessages(page, seed.session_id)).filter(message => message.data === rejectedText)).toHaveLength(0)
    expect((await capturedPayloadMetrics(page)).filter(metric => metric.requestId === rejected.requestId)).toHaveLength(0)
    expect((await capturedCommandResponses(page)).filter(response => response.request_id === rejected.requestId)).toHaveLength(0)
    expect(capturedHttpStageMetrics(page).filter(metric => metric.method === 'POST' && metric.requestId === rejected.requestId)).toHaveLength(1)
    await waitForSessionComposerReady(page, seed.session_id)
  })

  test('rejects deliberate oversized raw WebSocket abuse with native close code 1009', async ({ page }) => {
    test.skip(cell.mode !== 'enabled' || cell.visualCapture, 'requires the standard enabled runtime cell')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    const seed = await sendChatMessage(page, composer, 'Seed the native WebSocket frame limit probe')
    await waitForPersistedMessage(page, seed.session_id, message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'))
    await waitForSessionComposerReady(page, seed.session_id)
    const oversized = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'example.future-context',
      version: 99,
      content_type: 'application/json',
      content: JSON.stringify({ note: 'x'.repeat(33 * 1024) }),
      created_at: new Date().toISOString(),
    })
    const text = 'ATTENTION_NATIVE_OVERSIZED_WIRE_PROBE'
    const closed = await sendRawSessionMessage(page, seed.session_id, text, [oversized], { expectTransportClose: true })
    expect(closed.closeCode).toBe(1009)
    expect((await capturedPayloadMetrics(page)).filter(metric => metric.requestId === closed.requestId)).toHaveLength(1)
    expect((await sessionMessages(page, seed.session_id)).filter(message => message.data === text)).toHaveLength(0)
  })

  test('rejects invalid attachments, isolates forged visual references, and preserves forward-compatible envelopes', async ({ page }) => {
    test.skip(cell.mode !== 'enabled' || cell.visualCapture, 'requires the standard enabled runtime cell')
    const fixture = await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)
    await enablePointingContext(page)
    await fixture.leftTarget.hover()
    const seed = await sendChatMessage(page, composer, 'Create the valid Attention attachment seed')
    await waitForPersistedMessage(page, seed.session_id, message => message.message_id === seed.persistedMessageId)
    await waitForAgentText(page, 'ATTENTION_E2E_TARGET')
    await waitForTerminalDispatch(page, seed.session_id, seed.persistedMessageId)
    const validAttention = attentionAttachment(seed)
    const now = new Date()
    const future = new Date(now.getTime() + 300_000).toISOString()

    const expired = {
      ...validAttention,
      attachment_id: crypto.randomUUID(),
      expires_at: '2000-01-01T00:00:00.000Z',
    }
    const corruptedHash = {
      ...validAttention,
      attachment_id: crypto.randomUUID(),
      content_hash: `sha256:${'0'.repeat(64)}`,
    }
    const unauthorizedVisualContent = JSON.stringify({
      authorization: {
        audience: 'agent-context',
        expires_at: future,
        scope: 'session',
        session_id: 'another-session',
      },
      candidate_ids: ['unauthorized-target'],
      capture_id: crypto.randomUUID(),
      created_at: now.toISOString(),
      expires_at: future,
      host_instance_id: 'unauthorized-host',
      media: {
        content_bytes: 4,
        content_hash: `sha256:${'0'.repeat(64)}`,
        content_type: 'image/png',
        pixel_height: 10,
        pixel_width: 10,
      },
      redactions_applied: 1,
      reference: { kind: 'upload', opaque_id: 'unauthorized-upload' },
      region: { height: 10, width: 10, x: 0, y: 0 },
      schema: 'wippy.attention.visual.v1',
      snapshot_id: 'unauthorized-snapshot',
    })
    const unauthorized = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'wippy.attention.visual',
      version: 1,
      content_type: 'application/json',
      content: unauthorizedVisualContent,
      created_at: now.toISOString(),
      expires_at: future,
    })
    const unknownWithBearer = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'example.future-context',
      version: 99,
      content_type: 'application/json',
      content: JSON.stringify({ authorization: { bearer: 'must-not-pass' } }),
      created_at: now.toISOString(),
    })
    const excessive = await Promise.all(Array.from({ length: 17 }, async (_, index) => sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'example.future-context',
      version: 99,
      content_type: 'application/json',
      content: JSON.stringify({ index }),
      created_at: now.toISOString(),
    })))
    const duplicateId = crypto.randomUUID()
    const duplicate = await sha256Attachment(page, {
      attachment_id: duplicateId,
      kind: 'example.future-context',
      version: 99,
      content_type: 'application/json',
      content: JSON.stringify({ note: 'duplicate ID must reject atomically' }),
      created_at: now.toISOString(),
    })
    const malformedCurrentV2 = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'wippy.attention',
      version: 2,
      content_type: 'application/json',
      content: JSON.stringify({ schema: 'wippy.attention.v2' }),
      created_at: now.toISOString(),
    })
    const invalidCases = [
      { attachments: [corruptedHash], detailCode: 'content-hash-mismatch', label: 'corrupted-content-hash' },
      { attachments: excessive, detailCode: 'too-many-attachments', label: 'excessive-count' },
      { attachments: [duplicate, duplicate], detailCode: 'duplicate-attachment-id', label: 'duplicate-attachment-ids' },
      { attachments: [expired], detailCode: 'expired', label: 'expired' },
      { attachments: [unauthorized], detailCode: 'visual-session-mismatch', label: 'unauthorized' },
      { attachments: [unknownWithBearer], detailCode: 'forbidden-live-field', label: 'unknown-bearer' },
      { attachments: [malformedCurrentV2], detailCode: 'invalid-attention-payload', label: 'malformed-current-v2' },
    ]
    const invalidTexts: string[] = []
    const invalidRequestIds: string[] = []
    await verifyContextStagingCapability(page, seed.session_id)
    for (const invalid of invalidCases) {
      const text = `ATTENTION_INVALID_${invalid.label}`
      const result = await stageContextAttachmentsForTest(
        page,
        seed.session_id,
        crypto.randomUUID(),
        invalid.attachments,
      )
      expect(result.status, invalid.label).toBe(422)
      expect(result.code, invalid.label).toBe('INVALID_CONTEXT_ATTACHMENTS')
      expect(result.reference).toBeUndefined()
      expect(capturedHttpStageMetrics(page).filter(metric => metric.method === 'POST' && metric.requestId === result.requestId)).toHaveLength(1)
      invalidRequestIds.push(result.requestId)
      invalidTexts.push(text)
    }

    const attentionPayload = attentionSnapshot(seed)
    const forgedVisual = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'wippy.attention.visual',
      version: 1,
      content_type: 'application/json',
      content: JSON.stringify({
        authorization: {
          audience: 'agent-context',
          expires_at: future,
          scope: 'session',
          session_id: seed.session_id,
        },
        candidate_ids: attentionPayload.pointer?.candidate_ids ?? [],
        capture_id: crypto.randomUUID(),
        created_at: now.toISOString(),
        expires_at: future,
        host_instance_id: attentionPayload.host_instance_id,
        media: {
          content_bytes: 4,
          content_hash: `sha256:${'0'.repeat(64)}`,
          content_type: 'image/png',
          pixel_height: 1,
          pixel_width: 1,
        },
        redactions_applied: 0,
        reference: { kind: 'upload', opaque_id: `forged-${crypto.randomUUID()}` },
        region: { height: 1, width: 1, x: 0, y: 0 },
        schema: 'wippy.attention.visual.v1',
        snapshot_id: attentionPayload.snapshot_id,
      }),
      created_at: now.toISOString(),
      expires_at: future,
    })
    const forgedVisualText = 'ATTENTION_INVALID_forged-visual-reference'
    // Keep a genuine complete pointed path but remove unrelated observations so
    // this case exercises visual authorization rather than the combined quota.
    const minimalSnapshot = structuredClone(attentionPayload)
    const target = pointerCandidates(minimalSnapshot).sort((a, b) => b.path.length - a.path.length)[0]
    expect(target).toBeDefined()
    minimalSnapshot.candidates = [target]
    minimalSnapshot.pointer!.candidate_ids = [target.target_id]
    minimalSnapshot.recent_events = []
    delete minimalSnapshot.focus
    const pointIds = new Set([...minimalSnapshot.capture.points.map(point => point.point_id), minimalSnapshot.pointer!.event_id])
    target.sample_point_ids = target.sample_point_ids.filter(id => pointIds.has(id))
    minimalSnapshot.capture.complete = false
    minimalSnapshot.omissions = [...(minimalSnapshot.omissions ?? []).slice(0, 127), { reason: 'response-budget' }]
    const minimalAttention = await sha256Attachment(page, {
      ...validAttention,
      version: 1,
      content: canonicalContextValue(minimalSnapshot),
    })
    const semanticControl = await stageContextAttachmentsForTest(page, seed.session_id, crypto.randomUUID(), [minimalAttention])
    expect(semanticControl.reference).toBeDefined()
    await cancelStagedContextForTest(page, seed.session_id, semanticControl.requestId, semanticControl.reference!.id)
    const boundedForgedVisual = await sha256Attachment(page, {
      ...forgedVisual,
      content: canonicalContextValue({ ...JSON.parse(forgedVisual.content), candidate_ids: [target.target_id] }),
    })
    expect(Buffer.byteLength(canonicalContextValue([minimalAttention, boundedForgedVisual]))).toBeLessThanOrEqual(32768)
    const forgedVisualResult = await stageContextAttachmentsForTest(
      page,
      seed.session_id,
      crypto.randomUUID(),
      [minimalAttention, boundedForgedVisual],
    )
    expect(forgedVisualResult.status).toBe(422)
    expect(forgedVisualResult.code).toBe('INVALID_CONTEXT_ATTACHMENTS')
    expect(forgedVisualResult.reference).toBeUndefined()
    invalidRequestIds.push(forgedVisualResult.requestId)
    invalidTexts.push(forgedVisualText)

    const inertUnknown = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'example.future-context',
      version: 99,
      content_type: 'application/json',
      content: JSON.stringify({ note: 'preserve but do not render' }),
      created_at: now.toISOString(),
    })
    const barrier = await sendRawSessionMessage(
      page,
      seed.session_id,
      'ATTENTION_UNKNOWN_FORWARD_COMPAT_BARRIER',
      [inertUnknown],
    )
    expect(barrier.commandResponse).toEqual(expect.objectContaining({
      message_id: expect.any(String),
      request_id: barrier.requestId,
      success: true,
    }))
    const persistedBarrier = await waitForPersistedMessage(
      page,
      seed.session_id,
      message => message.message_id === barrier.persistedMessageId && message.type === 'user',
    )
    expect(persistedBarrier.metadata?.context_attachments).toEqual([inertUnknown])
    await waitForTerminalDispatch(page, seed.session_id, barrier.persistedMessageId!)

    const knownKindNewerVersion = await sha256Attachment(page, {
      attachment_id: crypto.randomUUID(),
      kind: 'wippy.attention',
      version: 4,
      content_type: 'application/json',
      content: JSON.stringify({ schema: 'wippy.attention.v4' }),
      created_at: now.toISOString(),
    })
    const newerVersion = await sendRawSessionMessage(
      page,
      seed.session_id,
      'ATTENTION_KNOWN_KIND_NEWER_VERSION_BARRIER',
      [knownKindNewerVersion],
    )
    expect(newerVersion.commandResponse).toEqual(expect.objectContaining({
      message_id: expect.any(String),
      request_id: newerVersion.requestId,
      success: true,
    }))
    await waitForPersistedMessage(
      page,
      seed.session_id,
      message => message.message_id === newerVersion.persistedMessageId && message.type === 'user',
    )
    await waitForTerminalDispatch(page, seed.session_id, newerVersion.persistedMessageId!)
    const finalBarrier = await sendRawSessionMessage(
      page,
      seed.session_id,
      'ATTENTION_FORWARD_COMPAT_PROCESSING_BARRIER',
      [inertUnknown],
    )
    await waitForPersistedMessage(
      page,
      seed.session_id,
      message => message.message_id === finalBarrier.persistedMessageId && message.type === 'user',
    )
    await waitForTerminalDispatch(page, seed.session_id, finalBarrier.persistedMessageId!)
    const history = await sessionMessages(page, seed.session_id)
    expect((await capturedPayloadMetrics(page)).filter(metric => invalidRequestIds.includes(metric.requestId ?? ''))).toHaveLength(0)
    expect(history.filter(message => invalidTexts.includes(message.data))).toHaveLength(0)
    const persistedNewerVersion = history.filter(message => message.message_id === newerVersion.persistedMessageId)
    expect(persistedNewerVersion).toHaveLength(1)
    expect(persistedNewerVersion[0].metadata?.context_attachments).toEqual([knownKindNewerVersion])
  })
})

test.describe(`Attention disabled acceptance: ${describeCell}`, () => {
  test('sends no context and never installs an active overlay', async ({ page }) => {
    test.skip(cell.mode !== 'disabled', 'requires a runtime launched with Attention disabled')
    await bootAttentionTracer(page, cell)
    const composer = await startDeterministicAttentionChat(page)

    const attachments = await findVisibleRole(page, 'button', 'Attachments')
    await attachments.click()
    await expect.poll(async () => {
      try {
        await findVisibleRole(page, 'menuitem', 'Include what I’m pointing at', 250)
        return true
      }
      catch {
        return false
      }
    }).toBe(false)
    await page.keyboard.press('Escape')

    const pointing = await sendChatMessage(page, composer, 'What am I pointing at while Attention is disabled?')
    expect(pointing.data.context_attachments).toBeUndefined()
    expect(pointing.data.context_attachments_ref).toBeUndefined()
    expect(capturedHttpStageMetrics(page).filter(metric => metric.method === 'POST')).toHaveLength(0)
    expect(pointing.data.runtime_context).toBeUndefined()

    await sendChatMessage(page, composer, 'Click the area I meant while Attention is disabled')
    await expect.poll(async () => {
      try {
        await findVisible(page, root => root.locator('[data-wippy-attention-overlay]'), 'disabled overlay', 250)
        return true
      }
      catch {
        return false
      }
    }, { timeout: 2_000 }).toBe(false)
  })
})
