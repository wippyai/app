import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'
import {
  attentionRuntimeCell,
  installAttentionWireTap,
  openPersistedSession,
  sendChatMessage,
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
  expect(JSON.parse(state.attachment.content)).toEqual(expect.objectContaining({
    schema: 'wippy.attention.v1',
    snapshot_id: state.snapshotId,
  }))
  await expect(await waitForAgentText(page, state.expectedAssistantFragment)).toContainText(state.expectedTargetId)

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
