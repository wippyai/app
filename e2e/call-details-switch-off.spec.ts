import { D, action, approvalState, cards, detailRows, expect, gate, idle, newTag, openDetailsChat, phrase, sendMessage, sessionRead, test } from './helpers/call-details'

gate('switch-off')

async function noDetails(scope: { locator: (selector: string) => import('@playwright/test').Locator }) {
  await expect(scope.locator(`${D.toggle},${D.panel},.chat-tool-panel__view-all`)).toHaveCount(0)
  await expect(scope.locator('.chat-approval-decided__details')).toHaveCount(0)
  await expect(scope.locator('button').filter({ hasText: /^View all arguments$/ })).toHaveCount(0)
}

for (const state of ['pending', 'approved', 'denied', 'denied-reason', 'expired', 'auto'] as const) {
  test(`switch none, approval ${state}: decision and reload do not disclose arguments`, async ({ page, capture }) => {
    const { scope, row } = await approvalState(page, capture, state)
    if (state === 'pending') {
      // Contract exception: a pending reviewer still sees a masked preview.
      await expect(cards(scope).locator('.chat-approval__summary')).toContainText('rec-')
      await page.reload()
      await expect(cards(scope)).toHaveCount(1)
      await expect(cards(scope).locator('.chat-approval__summary')).toContainText('rec-')
      return
    }
    await expect(row).toBeVisible()
    await noDetails(scope)
    await expect(row).not.toContainText(/rec-|inv-/)
    for (const stored of await detailRows(page)) {
      expect(stored.data).toBeNull()
      expect(stored.metadata.result).toBeNull()
      for (const descriptor of Object.values(stored.details)) {
        expect(descriptor.level).toBe('none')
        expect(descriptor.summary).toBeNull()
        expect(descriptor.preview).toBeNull()
      }
      const display = stored.metadata.approval?.display
      if (display) for (const key of ['arguments', 'summary', 'cut', 'numbers']) expect(display[key]).toBeUndefined()
    }
    await sessionRead(page, 'get')
    await page.reload()
    await expect(scope.locator(D.row)).toHaveCount(state === 'auto' ? 2 : 1)
    await noDetails(scope)
  })
}

for (const text of ['lookup one', 'fail one', 'masked email', 'sensitive result', 'big result'] as const) {
  test(`switch none, ${text}: no caret, panel or REST values`, async ({ page, capture }) => {
    const scope = await openDetailsChat(page, capture)
    await phrase(page, scope, text, text === 'fail one' ? 'failed' : 'done')
    await noDetails(scope)
    const rows = await detailRows(page)
    expect(rows).toHaveLength(1)
    expect(rows[0].data).toBeNull()
    expect(rows[0].metadata.result).toBeNull()
    await sessionRead(page, 'get')
    await page.reload()
    await expect(scope.locator(D.row)).toHaveCount(1)
    await noDetails(scope)
  })
}

test('switch none: private call remains absent', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture)
  await sendMessage(scope, `private details #${newTag()}`)
  await expect(scope.getByText('The details fixture finished.', { exact: true })).toBeVisible()
  await idle(scope)
  expect(await detailRows(page)).toEqual([])
  await expect(scope.locator(D.row)).toHaveCount(0)
  await sessionRead(page, 'get')
})
