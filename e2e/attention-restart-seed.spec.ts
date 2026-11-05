import { expect, test } from '@playwright/test'
import {
  attentionAttachment,
  attentionRuntimeCell,
  attentionSnapshot,
  bootAttentionTracer,
  enablePointingContext,
  installAttentionWireTap,
  pointerCandidates,
  sendChatMessage,
  startDeterministicAttentionChat,
  waitForAgentText,
  waitForPersistedMessage,
} from './helpers/attention'
import {
  attentionRestartBrowser,
  writeAttentionRestartState,
} from './helpers/attention-restart'

const cell = attentionRuntimeCell()

test.beforeEach(async ({ page }) => {
  await installAttentionWireTap(page)
})

test('seeds persisted Attention context before a real Wippy runtime restart', async ({ page }) => {
  expect(cell.mode).toBe('enabled')
  expect(cell.visualCapture).toBe(false)

  const fixture = await bootAttentionTracer(page, cell)
  const composer = await startDeterministicAttentionChat(page)
  await enablePointingContext(page)
  await fixture.leftTarget.hover()

  const command = await sendChatMessage(page, composer, 'What am I pointing at before the real runtime restart?')
  const attachment = attentionAttachment(command)
  const snapshot = attentionSnapshot(command)
  const pointed = pointerCandidates(snapshot)
  const intended = pointed.find(candidate => JSON.stringify(candidate.summary).includes('left nested target'))
  expect(intended).toBeDefined()

  const persisted = await waitForPersistedMessage(
    page,
    command.session_id,
    message => message.message_id === command.persistedMessageId && message.type === 'user',
  )
  expect(persisted.metadata?.context_attachments).toEqual([attachment])
  await expect(await waitForAgentText(page, 'ATTENTION_E2E_TARGET')).toContainText(intended!.target_id)
  await waitForPersistedMessage(
    page,
    command.session_id,
    message => message.type === 'assistant' && message.data.includes('ATTENTION_E2E_TARGET'),
  )

  await writeAttentionRestartState({
    attachment,
    baseUrl: process.env.WIPPY_URL ?? 'http://localhost:8086',
    browser: attentionRestartBrowser(),
    engine: cell.engine,
    expectedAssistantFragment: `ATTENTION_E2E_TARGET ${intended!.target_id}`,
    expectedTargetId: intended!.target_id,
    layout: cell.layout,
    messageId: command.persistedMessageId,
    requestId: command.request_id,
    schema: 'wippy.attention.restart.v1',
    seededAt: new Date().toISOString(),
    sessionId: command.session_id,
    snapshotId: snapshot.snapshot_id,
  })
})
