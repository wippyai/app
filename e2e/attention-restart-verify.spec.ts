import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import { attentionSnapshotFromAttachment } from './helpers/attention-v2'
import {
  attentionRuntimeCell,
  findVisibleRole,
  installAttentionWireTap,
  openPersistedSession,
  sendChatMessage,
  sessionAttentionContext,
  sessionMessages,
  waitForAgentText,
  waitForPersistedMessage,
} from './helpers/attention'
import {
  attentionRestartBrowser,
  readAttentionRestartState,
} from './helpers/attention-restart'

const cell = attentionRuntimeCell()

test.beforeEach(async ({ page }) => {
  await installAttentionWireTap(page)
})

test('recovers persisted Attention context after a real Wippy runtime restart', async ({ page }) => {
  const state = await readAttentionRestartState()
  expect({
    baseUrl: process.env.WIPPY_URL ?? 'http://localhost:8086',
    browser: attentionRestartBrowser(),
    engine: cell.engine,
    layout: cell.layout,
  }).toEqual({
    baseUrl: state.baseUrl,
    browser: state.browser,
    engine: state.engine,
    layout: state.layout,
  })

  await loginAsAdmin(page)
  const composer = await openPersistedSession(page, state.sessionId)
  const persisted = await waitForPersistedMessage(
    page,
    state.sessionId,
    message => message.message_id === state.messageId && message.type === 'user',
  )
  expect(persisted.metadata?.context_attachments).toEqual([state.attachment])
  expect(attentionSnapshotFromAttachment(state.attachment)).toEqual(expect.objectContaining({
    schema: 'wippy.attention.v1',
    snapshot_id: state.snapshotId,
  }))
  await expect(await waitForAgentText(page, state.expectedAssistantFragment)).toContainText(state.expectedTargetId)

  // The Session restores automatic context too. Disable it explicitly before
  // sending a history-only follow-up without a fresh pointing observation.
  const restoredContext = await sessionAttentionContext(page, state.sessionId)
  expect(restoredContext.enabled).toBe(true)
  const attachments = await findVisibleRole(page, 'button', /^Attachments/)
  await expect(attachments).toHaveAttribute('aria-label', /pointing context selected/)
  await attachments.click()
  await (await findVisibleRole(page, 'menuitem', 'Stop automatically attaching pointing context')).click()
  await expect(attachments).toHaveAttribute('aria-label', 'Attachments')
  expect(await sessionAttentionContext(page, state.sessionId)).toEqual(expect.objectContaining({
    enabled: false,
    revision: restoredContext.revision + 1,
  }))

  const followUp = await sendChatMessage(page, composer, 'Verify this session after the real runtime restart')
  expect(followUp.session_id).toBe(state.sessionId)
  expect(followUp.data.context_attachments).toBeUndefined()
  await waitForPersistedMessage(
    page,
    state.sessionId,
    message => message.message_id === followUp.persistedMessageId && message.type === 'user',
  )
  await expect(await waitForAgentText(page, 'ATTENTION_E2E_CONTEXT_MISSING')).not.toContainText(
    state.expectedAssistantFragment,
  )
  await waitForPersistedMessage(
    page,
    state.sessionId,
    message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_CONTEXT_MISSING'),
  )

  const recovered = await sessionMessages(page, state.sessionId)
  expect(recovered.filter(message => message.message_id === state.messageId)).toHaveLength(1)
  expect(recovered.filter(message => message.message_id === followUp.persistedMessageId)).toHaveLength(1)
})
