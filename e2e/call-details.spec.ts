import { AGENTS, D, MASK, RecoveryFrames, SUMMARY_AGENT, action, approvalState, approveWhenArmed, assertRow, cards, detailRows, expand, expect, gate, idle, injectedUnknown, injectMissingResult, newTag, openDetailsChat, panelActions, phrase, reloadRow, SEL, sendMessage, sessionIdOf, sessionRead, test } from './helpers/call-details'

gate('current')

const fixtures = [
  { phrase: 'lookup one', status: 'done', label: 'Done', content: /"ran":\s*true/, reload: true },
  { phrase: 'fail one', status: 'failed', label: 'Failed', content: /TOOL_DETAILS_FIXTURE_FAILURE/, reload: true },
  { phrase: 'invalid details', status: 'not_run', label: 'Not run', note: 'Not run: invalid arguments', content: /Error/ },
  { phrase: 'masked email', status: 'done', label: 'Done', content: MASK },
  { phrase: 'sensitive result', status: 'done', label: 'Done', content: MASK },
  { phrase: 'empty details', status: 'done', label: 'Done', content: 'Done. No result.', copy: '""' },
  { phrase: 'null details', status: 'done', label: 'Done', content: 'null' },
  { phrase: 'hidden details', status: 'done', label: 'Done', content: 'Result hidden', copy: 'Arguments' },
  { phrase: 'text details', status: 'done', label: 'Done', content: '<script>window.__b3Executed=true</script>' },
] as const

for (const fixture of fixtures) {
  test(`${fixture.phrase}: collapsed icon, panel, Copy, dialog and keyboard`, async ({ page, capture }) => {
    const invalidRequests: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).hostname === 'invalid.example') invalidRequests.push(request.url())
    })
    const scope = await openDetailsChat(page, capture)
    const row = await phrase(page, scope, fixture.phrase, fixture.status)
    await assertRow(row, fixture.status, fixture.label, 'note' in fixture ? fixture.note : undefined)
    await expand(row, 'Enter')
    // Undecodable argument text is never echoed: its arguments part is not captured (contract 5.3).
    await expect(row.locator(D.panel)).toContainText(fixture.phrase === 'invalid details' ? 'Details are not available for this step.' : 'Arguments')
    await panelActions(page, row, fixture.content, 'copy' in fixture ? fixture.copy : fixture.content)
    await row.locator(D.toggle).press('Space')
    await expect(row.locator(D.panel)).toHaveCount(0)
    await expect(row.locator(D.toggle)).toBeFocused()
    await expand(row, 'Space')
    const rows = await detailRows(page)
    expect(rows).toHaveLength(1)
    if (fixture.phrase === 'invalid details') {
      expect(rows[0].metadata.outcome).toBe('invalid_arguments')
      expect(rows[0].details.arguments.availability).toBe('not_captured')
      await expect(row.locator(D.panel)).toContainText('Failed to parse arguments')
    }
    if (fixture.phrase === 'masked email') {
      expect(rows[0].details.arguments.masked_paths).toContain('/email')
      await expect(row.locator(D.panel)).toContainText('Public contact')
      await expect(row.locator('.chat-tool-panel__masked-note')).toHaveText('Some fields are hidden')
    }
    if (fixture.phrase === 'sensitive result') {
      expect(rows[0].details.result.masked_paths).toContain('/token')
      await expect(row.locator(D.panel)).toContainText('Public result')
      await expect(row.locator(D.panel)).toContainText('7')
    }
    if (fixture.phrase === 'empty details') {
      expect(rows[0].metadata.result).toBe('')
      expect(rows[0].details.result.availability).toBe('available')
      await expect(row.locator('[part="tool-panel-result"] pre')).toHaveText('""')
    }
    if (fixture.phrase === 'null details') {
      expect(rows[0].metadata.result).toBeNull()
      expect(rows[0].details.result.availability).toBe('available')
      await expect(row.locator('[part="tool-panel-result"] pre')).toHaveText('null')
    }
    if (fixture.phrase === 'text details') {
      const expected = String.raw`{"text":"<img src=\"https://invalid.example/b3.png\"><script>window.__b3Executed=true</script><artifact>plain</artifact>","unicode":"visible\u202etext\u200b"}`
      expect(await row.locator('[part="tool-panel-result"] pre').textContent()).toBe(expected)
      await panelActions(page, row, expected)
      await row.locator(D.dialogButton).click()
      const dialog = row.getByRole('dialog')
      await expect(dialog).toBeVisible()
      expect(await dialog.locator('[part="tool-panel-result"] pre').textContent()).toBe(expected)
      await expect(dialog.locator('img, script, artifact')).toHaveCount(0)
      await dialog.locator(D.copy).click()
      expect(await page.evaluate(() => (window as unknown as { __b3Copy: string }).__b3Copy)).toContain(`Result\n${expected}`)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(row.locator(`${D.panel} img,${D.panel} script,${D.panel} artifact`)).toHaveCount(0)
      expect(await page.evaluate(() => (window as unknown as { __b3Executed?: boolean }).__b3Executed)).toBeUndefined()
      expect(page.url()).not.toContain('invalid.example')
      const visible = await row.locator(D.panel).innerText()
      expect(visible).not.toContain('\u202e')
      expect(visible).not.toContain('\u200b')
      await page.waitForLoadState('networkidle')
      expect(invalidRequests).toEqual([])
    }
    await sessionRead(page, 'get')
    if ('reload' in fixture) await reloadRow(page, scope, row, fixture.content)
  })
}

test('slow one: running timer increases, pending result, then Ran for duration', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture)
  const row = await phrase(page, scope, 'slow one', 'running')
  await assertRow(row, 'running', 'Running')
  const initial = await row.locator(D.timer).innerText()
  await expect.poll(() => row.locator(D.timer).innerText(), { timeout: 5_000 }).not.toBe(initial)
  await expand(row, 'Enter')
  await expect(row.locator(D.panel)).toContainText('Result pending')
  await panelActions(page, row, 'Result pending')
  await idle(scope)
  await expect(row).toHaveAttribute('data-status', 'done')
  await expect(row.locator(D.duration)).toHaveText(/^Ran for 2\d\.\d s$/)
  await expect(row.locator(D.timer)).toHaveCount(0)
  await sessionRead(page, 'get')
  const rows = await detailRows(page)
  expect(rows[0].metadata.duration_ms).toBeGreaterThanOrEqual(19_000)
})

test('slow one plus Stop: stopped icon and permitted arguments', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture)
  const row = await phrase(page, scope, 'slow one', 'running')
  await scope.locator(SEL.stop).click()
  await idle(scope)
  await assertRow(row, 'stopped', 'Stopped')
  await expand(row)
  await panelActions(page, row, 'Arguments')
  expect((await detailRows(page))[0].metadata.outcome).toBe('cancelled')
  await sessionRead(page, 'get')
})

test('private details: no row, card, name, arguments or reference in REST or live frames', async ({ page, capture, wire }) => {
  const scope = await openDetailsChat(page, capture, AGENTS.standard)
  await sendMessage(scope, `private details #${newTag()}`)
  await expect(scope.getByText('The details fixture finished.', { exact: true })).toBeVisible()
  await idle(scope)
  await expect(scope.locator(D.row)).toHaveCount(0)
  await expect(cards(scope)).toHaveCount(0)
  expect(await detailRows(page)).toEqual([])
  await sessionRead(page, 'get')
  await capture.settled()
  await page.reload()
  await expect(scope.locator(SEL.textarea)).toBeVisible()
  await expect(scope.locator(D.row)).toHaveCount(0)
  expect(wire.frames.length).toBeGreaterThan(0)
})

test('agent summary layer: summary arguments/result; tool layer adds the hidden-part line', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture, SUMMARY_AGENT)
  const row = await phrase(page, scope, 'lookup one')
  await assertRow(row, 'done', 'Done')
  await expand(row)
  const stored = (await detailRows(page))[0]
  for (const part of ['arguments', 'result'] as const) {
    expect(stored.details[part].level).toBe('summary')
    expect(stored.details[part].preview).toBeNull()
    expect(stored.details[part].has_full).toBe(false)
    await expect(row.locator(`[part="tool-panel-${part}"] pre`)).toHaveText(stored.details[part].summary!)
  }
  expect(stored.data).toBeNull()
  expect(stored.metadata.result).toBeNull()
  await expect(row.locator(D.viewAll)).toHaveCount(0)
  await panelActions(page, row, stored.details.arguments.summary!)
  const hidden = await phrase(page, scope, 'hidden details')
  await expand(hidden)
  await expect(hidden.locator(D.hidden)).toHaveText('Result hidden')
  await sessionRead(page, 'get')
})

test('big result: cut preview, View all, full masked result, Copy and dialog', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture)
  const row = await phrase(page, scope, 'big result')
  await assertRow(row, 'done', 'Done')
  await expand(row)
  await expect(row.locator('.chat-tool-panel__cut-note')).toContainText('Showing the first 8 KB.')
  await expect(row.locator(D.viewAll)).toHaveAccessibleName('View all Result')
  await row.locator(D.viewAll).click()
  await expect(row.locator(D.viewAll)).toHaveCount(0)
  await expect(row.locator('[part="tool-panel-result"] pre')).toContainText('0123456789abcdefghij'.repeat(1024))
  await panelActions(page, row, '0123456789abcdefghij'.repeat(1024))
  await sessionRead(page, 'get')
  await detailRows(page)
})

test('hidden error: result full cannot disclose an error at none', async ({ page, capture, wire }) => {
  const scope = await openDetailsChat(page, capture)
  const row = await phrase(page, scope, 'hidden error', 'failed')
  await expand(row)
  await expect(row.locator(D.hidden)).toHaveText('Error hidden')
  const stored = (await detailRows(page))[0]
  expect(stored.details.result.level).toBe('full')
  expect(stored.details.error.level).toBe('none')
  expect(stored.metadata.result).toBeNull()
  expect(JSON.stringify(stored)).not.toContain('TOOL_DETAILS_FIXTURE_FAILURE')
  expect(wire.frames.join('\n')).not.toContain('TOOL_DETAILS_FIXTURE_FAILURE')
  await sessionRead(page, 'get')
})

test('summary approval after decision: summary remains, full argument copies are absent', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture, SUMMARY_AGENT)
  await sendMessage(scope, `approve one #${newTag()}`)
  await expect(cards(scope)).toHaveCount(1)
  await approveWhenArmed(cards(scope))
  await idle(scope)
  const row = scope.locator(D.row)
  await expand(row)
  const stored = (await detailRows(page))[0]
  expect(stored.data).toBeNull()
  expect(stored.details.arguments.level).toBe('summary')
  expect(stored.metadata.approval?.display.summary).toBeTruthy()
  for (const key of ['arguments', 'cut', 'numbers']) expect(stored.metadata.approval?.display[key]).toBeUndefined()
  await expect(row.locator(D.viewAll)).toHaveCount(0)
  await expect(row.locator('[part="tool-panel-arguments"] pre')).toHaveText(stored.details.arguments.summary!)
  await reloadRow(page, scope, row, stored.details.arguments.summary!)
})

test('masked approval: pending and decided previews never expose writeOnly values', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture, AGENTS.standard)
  await sendMessage(scope, `masked approval #${newTag()}`)
  await expect(cards(scope)).toContainText(MASK)
  await approveWhenArmed(cards(scope))
  await idle(scope)
  const row = scope.locator(D.row)
  await expand(row)
  await panelActions(page, row, MASK)
  await reloadRow(page, scope, row, MASK)
})

test('injected missing result: unavailable text is distinct from null and empty', async ({ page, capture }) => {
  const frames = new RecoveryFrames()
  await frames.install(page)
  const scope = await openDetailsChat(page, capture)
  const row = await phrase(page, scope, 'empty details')
  await injectMissingResult(page, row, frames)
  await assertRow(row, 'done', 'Done')
  await expand(row)
  await panelActions(page, row, 'Details are not available for this step.')
})

test('injected visibility revision: stale View all response cannot restore cleared content or dialog', async ({ page, capture }) => {
  const frames = new RecoveryFrames()
  await frames.install(page)
  const scope = await openDetailsChat(page, capture)
  const row = await phrase(page, scope, 'big result')
  await expand(row)
  const stored = (await detailRows(page))[0]
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route('**/api/v1/sessions/messages?*', async route => {
    const response = await route.fetch()
    requested = true
    await wait
    await route.fulfill({ response })
  })
  try {
    await row.locator(D.viewAll).click()
    await expect.poll(() => requested).toBe(true)
    await row.locator(D.dialogButton).click()
    await expect(row.getByRole('dialog')).toBeVisible()
    frames.revision(await sessionIdOf(page), stored.details_revision + 1)
    await expect(row.getByRole('dialog')).toBeHidden()
    await expect(row.locator(D.panel)).toHaveCount(0)
    release()
    await expect(row.locator(D.toggle)).toHaveCount(0)
  }
  finally { release(); await page.unrouteAll({ behavior: 'wait' }) }
  await expect(row.locator(D.panel)).toHaveCount(0)
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes('0123456789abcdefghij'.repeat(20)))).toBe(false)
  await sessionRead(page, 'get')
})

for (const state of ['pending', 'approved', 'denied', 'denied-reason', 'expired', 'auto', 'cancelled', 'superseded'] as const) {
  test(`approval ${state}: design B row, permitted panel and reload`, async ({ page, capture }) => {
    const { scope, row } = await approvalState(page, capture, state)
    if (state === 'pending') {
      const summary = await row.locator('.chat-approval__summary').innerText()
      const caret = row.getByRole('button', { name: /^Details for / })
      await caret.press('Enter')
      await expect(caret).toHaveAttribute('aria-expanded', 'true')
      await expect(row.getByRole('region', { name: 'Arguments', exact: true })).toBeVisible()
      await sessionRead(page, 'get'); await detailRows(page)
      await page.waitForLoadState('networkidle')
      await page.reload()
      await expect(cards(scope)).toHaveCount(1)
      await expect(cards(scope).locator('.chat-approval__summary')).toHaveText(summary, { useInnerText: true })
      await cards(scope).getByRole('button', { name: /^Details for / }).press('Space')
      await expect(cards(scope).getByRole('region', { name: 'Arguments', exact: true })).toBeVisible()
      return
    }
    const label = state === 'approved' ? 'Approved, done' : state === 'auto' ? 'Done' : state.startsWith('denied') ? 'Denied' : 'Not run'
    const note = state === 'denied-reason' ? '“Use the staging record instead”' : state === 'expired' ? 'Not run: request expired' : state === 'cancelled' ? 'Not run: you stopped the assistant' : state === 'superseded' ? 'Not run: you sent a message' : undefined
    await assertRow(row, ['approved', 'auto'].includes(state) ? 'done' : 'not_run', label, note, 'tabler:shield-off')
    if (state === 'auto') await expect(row.locator('.chat-tool-row__auto-text')).toHaveText('Auto-approved')
    await expand(row, 'Enter')
    const decision = row.locator('.chat-tool-panel__decision')
    await expect(decision).toBeVisible()
    if (state === 'approved') await expect(decision).toHaveText(/^Approved by you, \d{1,2}:\d{2}/)
    if (state.startsWith('denied')) await expect(decision).toContainText('Denied by you')
    await panelActions(page, row, 'Arguments')
    if (!['approved', 'auto'].includes(state)) {
      await expect(row.locator('[part="tool-panel-result"],[part="tool-panel-error"]')).toHaveCount(0)
      await expect(row.locator(D.duration)).toHaveCount(0)
    }
    await reloadRow(page, scope, row, 'Arguments')
  })
}

test('injected recovery: Checking has clock, running edge and no caret; REST settles it', async ({ page, capture }) => {
  const frames = new RecoveryFrames()
  await frames.install(page)
  const scope = await openDetailsChat(page, capture)
  const row = await phrase(page, scope, 'slow one', 'running')
  // Delay only automatic recovery reads, preserving the real pending REST body.
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/sessions/messages?*', async route => { await wait; await route.continue() })
  try {
    frames.idle(await sessionIdOf(page))
    await assertRow(row, 'checking', 'Checking', 'Checking…')
  }
  finally { release(); await page.unrouteAll({ behavior: 'wait' }) }
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await idle(scope)
  await sessionRead(page, 'get'); await detailRows(page)
})

test('injected recovery: Outcome unknown uses help icon, neutral edge and readable panel', async ({ page, capture }) => {
  const { row } = await injectedUnknown(page, capture)
  await assertRow(row, 'unknown', 'Outcome unknown', 'Outcome unknown')
  await expand(row, 'Space')
  await panelActions(page, row, 'Arguments')
  await sessionRead(page, 'get'); await detailRows(page)
})

test('fifty calls: 50 unique rows, reader scroll anchor and composer hold during arrival', async ({ page, capture }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  const frames = new RecoveryFrames(30)
  await frames.install(page)
  const scope = await openDetailsChat(page, capture)
  // Seed enough prior content to permit a reader to stay away from the bottom.
  for (let n = 0; n < 5; n++) await phrase(page, scope, 'many tools')
  const beforeCount = await scope.locator(D.row).count()
  const scroller = scope.locator('.chat-message-list')
  await sendMessage(scope, `fifty calls #${newTag()}`)
  await expect(scope.locator(D.row)).toHaveCount(beforeCount + 50, { timeout: 40_000 })
  await idle(scope)
  const stored = await detailRows(page)
  const fifty = stored.filter(row => row.data?.includes('fifty-'))
  expect(fifty).toHaveLength(50)
  expect(new Set(fifty.map(row => JSON.parse(row.data!).record)).size).toBe(50)
  expect(new Set(fifty.map(row => row.message_id)).size).toBe(50)
  // Second 50-call turn measures stability while live frames arrive.
  const snapshots = await scroller.evaluate(element => {
    const ancestor = (node: Element | null): HTMLElement => {
      if (!node) throw new Error('No scroll container')
      const style = getComputedStyle(node)
      return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight ? node as HTMLElement : ancestor(node.parentElement)
    }
    const scroll = ancestor(element)
    const reversed = getComputedStyle(scroll).flexDirection === 'column-reverse'
    const distance = Math.max(1, (scroll.scrollHeight - scroll.clientHeight) / 3)
    scroll.scrollTop = reversed ? -distance : distance
    const read = () => {
      const box = scroll.getBoundingClientRect()
      const visible = Array.from(element.querySelectorAll('.chat-tool-row')).filter(row => { const r = row.getBoundingClientRect(); return r.top >= box.top && r.bottom <= box.bottom })
      const last = visible.at(-1)
      const composer = document.querySelector('textarea.chat-input__textarea')!.getBoundingClientRect()
      return { top: scroll.scrollTop, offset: reversed ? scroll.scrollHeight - scroll.clientHeight + scroll.scrollTop : scroll.scrollTop, height: scroll.scrollHeight, last: last?.getAttribute('data-message-id'), y: last?.getBoundingClientRect().y, composerY: composer.y }
    }
    const data = { before: read(), during: [] as ReturnType<typeof read>[], after: read() }
    const observer = new MutationObserver(() => data.during.push(read()))
    observer.observe(element, { childList: true, subtree: true })
    ;(window as unknown as { __b3Scroll: { data: typeof data, reset: () => void, finish: () => typeof data } }).__b3Scroll = { data, reset: () => { data.before = read(); data.during.length = 0 }, finish: () => { observer.disconnect(); data.after = read(); return data } }
    return data.before
  })
  // Send via the real composer first, then restore the reader's position on the
  // next animation frame before the delayed arrival window measured below.
  await sendMessage(scope, `fifty calls #${newTag()}`)
  await scroller.evaluate((element, top) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) { node.scrollTop = top; break }
    }
  }, snapshots.top)
  await page.evaluate(() => (window as unknown as { __b3Scroll: { reset: () => void } }).__b3Scroll.reset())
  await expect(scope.locator(D.row)).toHaveCount(beforeCount + 100, { timeout: 40_000 })
  await idle(scope)
  const measurements = await page.evaluate(() => (window as unknown as { __b3Scroll: { finish: () => { before: { top: number, offset: number, last?: string | null, y?: number, composerY: number }, during: Array<{ top: number, offset: number, last?: string | null, y?: number, composerY: number }>, after: { top: number, offset: number, last?: string | null, y?: number, composerY: number } } } }).__b3Scroll.finish())
  await test.info().attach('scroll-measurements.json', { body: JSON.stringify({ rowCount: await scope.locator(D.row).count(), ...measurements }), contentType: 'application/json' })
  expect(measurements.before.last).toBeTruthy()
  expect(Math.abs(measurements.before.top), 'reader is away from the latest messages').toBeGreaterThan(100)
  expect(measurements.during.length).toBeGreaterThan(0)
  expect(Math.abs(measurements.after.offset - measurements.before.offset)).toBeLessThanOrEqual(2)
  expect(measurements.after.last).toBe(measurements.before.last)
  expect(Math.abs(measurements.after.y! - measurements.before.y!)).toBeLessThanOrEqual(2)
  expect(Math.abs(measurements.after.composerY - measurements.before.composerY)).toBeLessThanOrEqual(2)
  for (const during of measurements.during) {
    expect(Math.abs(during.offset - measurements.before.offset)).toBeLessThanOrEqual(2)
    expect(Math.abs(during.composerY - measurements.before.composerY)).toBeLessThanOrEqual(2)
  }
  await sessionRead(page, 'get')
})
