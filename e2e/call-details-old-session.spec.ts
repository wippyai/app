import { D, cards, detailRows, expect, gate, idle, newTag, openDetailsChat, SEL, sendMessage, test } from './helpers/call-details'

gate('old-session')

test('Session 0.7.3: no capability, legacy badges, no caret, completed turn and reload', async ({ page, capture }) => {
  const scope = await openDetailsChat(page, capture)
  await sendMessage(scope, `lookup one #${newTag()}`)
  await expect(scope.getByText(/^Looked up rec-/)).toBeVisible({ timeout: 30_000 })
  await idle(scope)
  await expect(scope.locator('.chat-tool-group__badge').filter({ hasText: 'Look up record' })).toHaveCount(1)
  await expect(scope.locator(`${D.toggle},${D.panel}`)).toHaveCount(0)
  await expect(cards(scope)).toHaveCount(0)
  expect((await detailRows(page))).toHaveLength(1)
  await page.reload()
  await expect(scope.locator(SEL.textarea)).toBeVisible()
  await expect(scope.locator('.chat-tool-group__badge').filter({ hasText: 'Look up record' })).toHaveCount(1)
  await expect(scope.locator(`${D.toggle},${D.panel}`)).toHaveCount(0)
})
