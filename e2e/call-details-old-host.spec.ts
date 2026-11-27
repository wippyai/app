import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AGENTS, D, MASK, action, approveWhenArmed, cards, detailRows, expect, gate, idle, newTag, openDetailsChat, SEL, sendMessage, sessionRead, test } from './helpers/call-details'

gate('old-host')

// Same exact top-document login stylesheet exemption as tool-approval-old-host.
const LOGIN_PAGE_PINS = new Set(['src/app/api/login.jet', 'static/login.html'].flatMap(file =>
  Array.from(readFileSync(resolve(__dirname, '..', file), 'utf8').matchAll(/href="(https:\/\/web-host\.wippy\.ai\/webcomponents-1\.0\.\d+\/[^\"]+)"/g), match => match[1])))

test('Host 1.0.72 only: legacy badges, approval cards, masked arguments and no private call', async ({ page, capture }) => {
  expect(LOGIN_PAGE_PINS.size).toBeGreaterThan(0)
  const versions = new Set<string>()
  const localBundles: string[] = []
  page.on('request', request => {
    if (request.frame() === page.mainFrame() && LOGIN_PAGE_PINS.has(request.url())) return
    const match = request.url().match(/web-host\.wippy\.ai\/webcomponents-(1\.0\.\d+)/)
    if (match) versions.add(match[1])
    if (/^https?:\/\/(localhost|127\.0\.0\.1):5173\//.test(request.url())) localBundles.push(request.url())
  })
  const scope = await openDetailsChat(page, capture, AGENTS.standard)
  await expect.poll(() => Array.from(versions)).toEqual(['1.0.72'])
  await sendMessage(scope, `approve one #${newTag()}`)
  await expect(cards(scope)).toHaveCount(1)
  await approveWhenArmed(cards(scope))
  await idle(scope)
  await expect(scope.locator('.chat-approval-decided')).toHaveCount(1)
  await sendMessage(scope, `masked email #${newTag()}`)
  await expect(scope.getByText('The details fixture finished.', { exact: true })).toBeVisible()
  await idle(scope)
  await expect(scope.locator(SEL.toolChip).filter({ hasText: 'Save masked email' })).toHaveCount(1)
  const rows = await detailRows(page)
  const masked = rows.find(row => row.metadata.function_name === 'masked_email')!
  expect(masked.data).toContain(MASK)
  // 1.0.72 displays masked text in its existing approval argument viewer.
  await sendMessage(scope, `masked approval #${newTag()}`)
  await expect(cards(scope)).toContainText(MASK)
  await approveWhenArmed(cards(scope))
  await idle(scope)
  const decided = scope.locator('.chat-approval-decided').filter({ hasText: 'Approve masked email' })
  await action(decided, 'details').click()
  await expect(decided).toContainText(MASK)
  await expect(scope.locator(`${D.toggle},${D.panel}`)).toHaveCount(0)
  await sendMessage(scope, `private details #${newTag()}`)
  await expect.poll(async () => (await detailRows(page)).length).toBe(3)
  await idle(scope)
  await expect(scope.getByText('B3 private details sentinel')).toHaveCount(0)
  await sessionRead(page, 'get')
  await page.reload()
  await expect(scope.locator(SEL.textarea)).toBeVisible()
  expect(Array.from(versions)).toEqual(['1.0.72'])
  expect(localBundles).toEqual([])
})
