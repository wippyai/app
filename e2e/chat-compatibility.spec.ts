import { Buffer } from 'node:buffer'
import { realpathSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  addComposerUpload,
  capturedCorrelatedReplies,
  capturedWireMessages,
  findVisible,
  findVisibleUploadQueue,
  installAttentionWireTap,
  openPersistedSession,
  sessionMessages,
  startDeterministicAttentionChat,
  waitForAgentText,
  waitForPersistedMessage,
} from './helpers/attention'
import { loginAsAdmin } from './helpers/login'
import { useLocalReleaseAssets } from './helpers/release62'

test.beforeEach(async ({ page }) => {
  await useLocalReleaseAssets(page)
  if (process.env.RELEASE62_LOCAL_ASSETS !== '1' && process.env.RELEASE62_PUBLISHED !== '1') return
  // This smoke changes models; its fixture explicitly enables that policy.
  await page.route('**/api/public/facade/config', async (route) => {
    const response = await route.fetch()
    const config = await response.json()
    await route.fulfill({ response, json: { ...config, allowSelectModel: true } })
  })
})

const cell = process.env.COMPATIBILITY_CELL || 'M15'
const sessionVersion = process.env.COMPATIBILITY_SESSION_VERSION || 'current'
const hostVersion = process.env.COMPATIBILITY_HOST_VERSION || 'current'
const steeringReceipt = hostVersion !== '1.0.58' && sessionVersion !== '0.1.31' && sessionVersion !== '0.6.2'

async function submit(page: Page, composer: Locator, text: string) {
  await composer.fill(text)
  await composer.press('Enter')
  let sessionId = ''
  let requestId: string | undefined
  await expect.poll(async () => {
    const commands = await capturedWireMessages(page)
    const matches = commands.filter(command => command.type === 'session_message' && command.data.text === text)
    expect(matches.length).toBeLessThanOrEqual(1)
    const sent = matches[0]
    if (!sent || sent.type !== 'session_message')
      return false
    sessionId = sent.session_id
    requestId = sent.request_id
    expect(sent.data.context_attachments).toBeUndefined()
    expect(sent.data.context_attachments_ref).toBeUndefined()
    if (!steeringReceipt) {
      expect(sent.request_id).toBeUndefined()
    }
    else
      expect(sent.request_id).toEqual(expect.any(String))
    return true
  }, { message: 'one outbound ordinary message' }).toBe(true)
  const user = await waitForPersistedMessage(page, sessionId, message => message.type === 'user' && message.data === text)
  if (steeringReceipt) {
    await expect.poll(async () => (await capturedCorrelatedReplies(page))
      .filter(reply => reply.request_id === requestId).length).toBe(1)
    const receipt = (await capturedCorrelatedReplies(page)).find(reply => reply.request_id === requestId)!
    expect(receipt.type).toBe('received')
    expect(receipt.success).toBe(true)
    expect(receipt.message_id).toBe(user.message_id)
  }
  await expect(composer).toHaveValue('')
  return { sessionId, user }
}

async function menuChoice(page: Page, trigger: string, menu: string, label: string) {
  const control = await findVisible(page, root => root.locator(trigger), trigger)
  if ((await control.innerText()).trim() === label)
    return
  await control.click()
  const option = await findVisible(page, root => root.locator(menu).getByRole('menuitem', { name: label, exact: true }), label)
  await option.click()
  await expect(control).toContainText(label)
}

test(`${cell}: ordinary files, agent/model changes, Stop and persisted history`, async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  let stopCommand: { request_id?: string, session_id: string } | undefined
  const stopReplies: Array<{ request_id?: string, session_id?: string, topic?: string, interaction?: { revision?: number, can_send?: boolean } }> = []
  const permissions = new Map<string, { revision: number, can_send: boolean }>()
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      let command
      try {
        command = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'))
      }
      catch {
        return
      }
      if (command?.type === 'session_command' && command.data?.command === 'stop')
        stopCommand = command
    })
    socket.on('framereceived', ({ payload }) => {
      try {
        const envelope = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'))
        const response = envelope.data ?? envelope
        if (response?.type === 'update' && typeof response.session_id === 'string'
          && Number.isInteger(response.interaction?.revision) && typeof response.interaction?.can_send === 'boolean') {
          const previous = permissions.get(response.session_id)
          if (!previous || response.interaction.revision >= previous.revision)
            permissions.set(response.session_id, response.interaction)
        }
        if (response?.type === 'update' && typeof response.request_id === 'string')
          stopReplies.push({ request_id: response.request_id, session_id: response.session_id, topic: envelope.topic, interaction: response.interaction })
      }
      catch {
        // Non-JSON frames do not belong to the command protocol.
      }
    })
  })
  await installAttentionWireTap(page)
  await loginAsAdmin(page)
  const layout = process.env.WIPPY_LAYOUT
  const engine = process.env.WIPPY_ENGINE
  if (layout && engine) {
    expect(['managed', 'compat']).toContain(layout)
    expect(['iframe', 'fragment']).toContain(engine)
    await page.goto('/home')
    await expect(page.locator(layout === 'managed' ? '.managed-layout-shell' : '.wippy-host-app')).toBeVisible()
    await expect(page.locator(layout === 'managed' ? '.wippy-host-app' : '.managed-layout-shell')).toHaveCount(0)
    const welcome = await findVisible(page, root => root.getByRole('heading', { name: 'Welcome to Wippy App', exact: true }), 'existing home page')
    await expect(welcome).toBeVisible()
    await expect.poll(() => page.frames().some(frame => frame.url().includes('/@fragment/app.views:main/')))
      .toBe(engine === 'fragment')
    if (engine === 'iframe') {
      await expect.poll(() => page.frames().some(frame => frame.name() === 'wippy:page:app.views:main' && frame.url() === 'about:srcdoc'))
        .toBe(true)
    }
    testInfo.annotations.push({ type: 'rendered-layout', description: `${layout}/${engine}` })
  }
  let composer = await startDeterministicAttentionChat(page, 'app.attention_compat:agent_a')
  const marker = `${cell}-${Date.now()}`
  const firstText = `${marker} ordinary chat: Zażółć gęślą jaźń. 日本語. 🙂`
  await addComposerUpload(page, {
    name: `${marker}-ordinary.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('Ordinary Unicode attachment: Zażółć gęślą jaźń. 日本語. 🙂\n'),
  })
  const queue = await findVisibleUploadQueue(page)
  await expect(queue).toContainText(`${marker}-ordinary.txt`)
  const queuedFile = queue.locator('.w-file').filter({ hasText: `${marker}-ordinary.txt` })
  await expect(queuedFile).toBeVisible()
  await expect(queuedFile).not.toHaveClass(/w-file--error/)
  await expect(queuedFile).not.toContainText(/Waiting\.\.\.|Uploading\.\.\.|Processing\.\.\./, { timeout: 30_000 })
  const sendControl = await findVisible(page, root => root.locator('.chat-input__send-button'), 'eligible Send')
  await expect(sendControl).not.toBeDisabled()
  const first = await submit(page, composer, firstText)
  const firstReply = await waitForAgentText(page, firstText)
  await expect(firstReply).toContainText('Compatibility reply complete.')
  await expect(firstReply).toContainText('agent=A')
  await expect(firstReply).toContainText('model=attention-compat-a')
  expect(first.user.metadata?.file_uuids).toHaveLength(1)

  await menuChoice(page, '.chat-meta-list__agent', '.agent-menu', 'Compatibility Agent B')
  await menuChoice(page, '.chat-meta-list__model', '.model-menu', 'Compatibility Model B')
  const secondText = `${marker} after agent and model change`
  await submit(page, composer, secondText)
  const secondReply = await waitForAgentText(page, secondText)
  await expect(secondReply).toContainText('Compatibility reply complete.')
  await expect(secondReply).toContainText('agent=B')
  await expect(secondReply).toContainText('model=attention-compat-b')

  const slowText = `${marker} compat slow for Stop`
  await submit(page, composer, slowText)
  const slowReply = await waitForAgentText(page, slowText)
  await expect(slowReply).not.toContainText('Compatibility reply complete.')
  const stop = await findVisible(page, root => root.locator('.chat-input__stop-button'), 'Stop during generation')
  await expect(stop).toBeVisible()
  if (hostVersion === 'current') {
    const permission = permissions.get(first.sessionId)
    if (steeringReceipt)
      expect(permission, 'authoritative running input permission').toBeDefined()
    if (permission?.can_send === true) {
      await expect(composer).toBeEnabled()
      await expect(sendControl).toBeVisible()
    }
    else {
      await expect(composer).toBeDisabled()
      await expect(sendControl).toBeHidden()
    }
  }
  await stop.click()
  await expect.poll(() => Boolean(stopCommand), {
    message: 'existing Stop command dispatched',
  }).toBe(true)
  if (steeringReceipt) {
    expect(stopCommand!.request_id).toEqual(expect.any(String))
    await expect.poll(() => stopReplies.some(reply => reply.request_id === stopCommand!.request_id
      && reply.session_id === stopCommand!.session_id
      && reply.topic === `session:${stopCommand!.session_id}`
      && Number.isInteger(reply.interaction?.revision)
      && reply.interaction!.revision! >= 0
      && reply.interaction.can_send === false), {
      message: 'existing correlated Stop update confirms acceptance',
    }).toBe(true)
  }
  else {
    expect(stopCommand!.request_id).toBeUndefined()
    testInfo.annotations.push({ type: 'legacy-stop', description: 'This test proves dispatch and recovery. The matrix requires the separate checkpoint-successor contrast to prove legacy Stop acceptance.' })
  }

  // Historical Stop can finish the active provider operation. It still stops
  // subsequent operations; a later send reopens the session when required.
  await expect(composer).toHaveValue('')
  await expect(composer).toBeEnabled({ timeout: 20_000 })
  await expect(sendControl).toBeVisible({ timeout: 20_000 })
  const recoveryText = `${marker} ordinary message after Stop`
  await submit(page, composer, recoveryText)
  const recovered = await waitForAgentText(page, recoveryText)
  await expect(recovered).toContainText('Compatibility reply complete.')
  await expect(recovered).toContainText('model=attention-compat-b')

  const before = await sessionMessages(page, first.sessionId)
  const finalCommands = await capturedWireMessages(page)
  const finalReceipts = await capturedCorrelatedReplies(page)
  for (const text of [firstText, secondText, slowText, recoveryText]) {
    const matchingCommands = finalCommands.filter(command => command.type === 'session_message' && command.data.text === text)
    const matchingUsers = before.filter(message => message.type === 'user' && message.data === text)
    expect(matchingCommands).toHaveLength(1)
    expect(matchingUsers).toHaveLength(1)
    const command = matchingCommands[0]
    if (steeringReceipt && command.type === 'session_message') {
      const matchingReceipts = finalReceipts.filter(reply => reply.request_id === command.request_id)
      expect(matchingReceipts).toHaveLength(1)
      expect(matchingReceipts[0].type).toBe('received')
      expect(matchingReceipts[0].message_id).toBe(matchingUsers[0].message_id)
    }
  }
  const beforeIds = before.map(message => message.message_id)
  expect(new Set(beforeIds).size).toBe(beforeIds.length)
  await page.reload()
  composer = await openPersistedSession(page, first.sessionId)
  const restored = await waitForAgentText(page, firstText)
  await expect(restored).toContainText('Compatibility reply complete.')
  await expect(composer).toBeEnabled()
  const after = await sessionMessages(page, first.sessionId)
  expect(after.map(message => message.message_id).sort()).toEqual(beforeIds.sort())
  if (sessionVersion === 'current') {
    const agent = await findVisible(page, root => root.locator('.chat-meta-list__agent'), 'restored agent')
    const model = await findVisible(page, root => root.locator('.chat-meta-list__model'), 'restored model')
    await expect(agent).toContainText('Compatibility Agent B')
    await expect(model).toContainText('Compatibility Model B')
  }
  await testInfo.attach('compatibility-result', {
    body: JSON.stringify({ cell, hostVersion, sessionVersion, sessionId: first.sessionId, userRows: after.filter(message => message.type === 'user').length, fileCount: first.user.metadata?.file_uuids?.length, messageCount: after.length }),
    contentType: 'application/json',
  })
})

const stopCells = {
  M02: ['1.0.58', '0.6.2'],
  M06: ['1.0.59', '0.1.31'],
  M07: ['1.0.59', '0.6.2'],
  M11: ['current', '0.1.31'],
  M12: ['current', '0.6.2'],
} as const

test(`${cell}: Stop suppresses checkpoint successor`, async ({ page }, testInfo) => {
  test.skip(!process.env.COMPATIBILITY_CELL || !(cell in stopCells), 'Requires an explicitly bound Stop matrix cell')
  test.setTimeout(90_000)
  const [expectedHost, expectedSession] = stopCells[cell as keyof typeof stopCells]
  expect(hostVersion).toBe(expectedHost)
  expect(sessionVersion).toBe(expectedSession)
  expect(process.env.COMPATIBILITY_DATABASE, 'explicit isolated database').toBeTruthy()
  const database = realpathSync(process.env.COMPATIBILITY_DATABASE!)
  const normalized = database.replaceAll('\\', '/').toLowerCase()
  expect(normalized).toContain('/.local/runtime/')
  expect(normalized).toContain(`/consumer-session-${expectedSession}/.wippy/`)
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(testInfo.project.use.baseURL!).hostname)
  const stopCommands: Array<{ session_id: string }> = []
  page.on('websocket', socket => socket.on('framesent', ({ payload }) => {
    try {
      const command = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'))
      if (command?.type === 'session_command' && command.data?.command === 'stop')
        stopCommands.push(command)
    }
    catch {
      // Non-JSON frames do not belong to the command protocol.
    }
  }))
  await installAttentionWireTap(page)
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    await loginAsAdmin(page)
    const composer = await startDeterministicAttentionChat(page, 'app.attention_compat:agent_a')
    const marker = `${cell}-checkpoint-${Date.now()}`
    const texts = [
      `${marker} positive checkpoint control`,
      `${marker} compat slow for Stop`,
      `${marker} normal work after Stop`,
    ]
    const control = await submit(page, composer, texts[0])
    const state = () => {
      const row = db.prepare('SELECT status,meta FROM sessions WHERE session_id=?')
        .get(control.sessionId) as { status: string, meta: string }
      const checkpoints = JSON.parse(row.meta).checkpoints ?? []
      expect(Array.isArray(checkpoints)).toBe(true)
      return { status: row.status, checkpoints: checkpoints.length }
    }
    await expect(await waitForAgentText(page, texts[0])).toContainText('Compatibility reply complete.')
    await expect.poll(state, { timeout: 30_000 }).toEqual({ status: 'idle', checkpoints: 1 })
    const controlState = state()
    const slow = await submit(page, composer, texts[1])
    expect(slow.sessionId).toBe(control.sessionId)
    await expect(await waitForAgentText(page, texts[1])).not.toContainText('Compatibility reply complete.')
    const stop = await findVisible(page, root => root.locator('.chat-input__stop-button'), 'Stop during slow turn')
    await stop.click()
    await expect.poll(() => stopCommands.filter(command => command.session_id === control.sessionId).length).toBe(1)
    await expect.poll(state, { timeout: 30_000 }).toEqual({ status: 'idle', checkpoints: 1 })
    const stoppedState = state()
    await expect(composer).toBeEnabled({ timeout: 30_000 })
    await findVisible(page, root => root.locator('.chat-input__send-button:not(:disabled)'), 'Send after Stop', 30_000)
    const resumed = await submit(page, composer, texts[2])
    expect(resumed.sessionId).toBe(control.sessionId)
    await expect(await waitForAgentText(page, texts[2])).toContainText('Compatibility reply complete.')
    await expect.poll(state, { timeout: 30_000 }).toEqual({ status: 'idle', checkpoints: 2 })
    const commands = await capturedWireMessages(page)
    const history = await sessionMessages(page, control.sessionId)
    for (const text of texts) {
      expect(commands.filter(command => command.type === 'session_message'
        && command.session_id === control.sessionId && command.data.text === text)).toHaveLength(1)
      expect(history.filter(message => message.type === 'user' && message.data === text)).toHaveLength(1)
    }
    const proof = { cell, hostVersion, sessionVersion, sessionId: control.sessionId, database,
      checkpoints: [controlState.checkpoints, stoppedState.checkpoints, state().checkpoints],
      terminalStatus: state().status, userRows: history.filter(message => message.type === 'user').length,
      stopCommands: stopCommands.length }
    await testInfo.attach('stop-successor-result', { body: JSON.stringify(proof), contentType: 'application/json' })
    console.log(`STOP_SUCCESSOR_PROOF ${JSON.stringify(proof)}`)
  }
  finally {
    db.close()
  }
})
