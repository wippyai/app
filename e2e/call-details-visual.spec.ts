import type { Shot } from './helpers/call-details'
import { D, RecoveryFrames, SUMMARY_AGENT, approvalState, cards, expand, expect, gate, idle, injectedUnknown, injectMissingResult, openDetailsChat, phrase, SEL, sessionIdOf, setTheme, sheets, shot, test } from './helpers/call-details'

gate('current')
test.describe.configure({ mode: 'serial', timeout: 600_000 })

const shots: Shot[] = []

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    test(`visual matrix: ${width} px, ${theme}, live and labelled injected phase 1 states`, async ({ page, capture }) => {
      const frames = new RecoveryFrames()
      await frames.install(page)
      await openDetailsChat(page, capture)
      await setTheme(page, theme)
      await page.setViewportSize({ width, height: 1000 })
      const take = (state: string, group: string, element: import('@playwright/test').Locator, injected = false) => shot(page, shots, state, group, width, theme, element, injected)

      for (const fixture of [
        { phrase: 'lookup one', state: 'done', status: 'done' },
        { phrase: 'fail one', state: 'failed', status: 'failed' },
        { phrase: 'invalid details', state: 'invalid-arguments', status: 'not_run' },
        { phrase: 'masked email', state: 'masked-arguments', status: 'done' },
        { phrase: 'sensitive result', state: 'masked-result', status: 'done' },
        { phrase: 'empty details', state: 'empty-string', status: 'done' },
        { phrase: 'null details', state: 'null-result', status: 'done' },
        { phrase: 'hidden error', state: 'hidden-error', status: 'failed' },
        { phrase: 'hidden details', state: 'hidden-part', status: 'done' },
        { phrase: 'text details', state: 'escaped-text', status: 'done' },
      ]) {
        const scope = await openDetailsChat(page, capture)
        const row = await phrase(page, scope, fixture.phrase, fixture.status)
        await take(`${fixture.state}-collapsed`, 'tool-rows', row)
        await expand(row)
        await take(`${fixture.state}-opened`, 'panels', row)
      }

      let scope = await openDetailsChat(page, capture)
      let missing = await phrase(page, scope, 'empty details')
      await injectMissingResult(page, missing, frames)
      await take('missing-result-injected-collapsed', 'recovery', missing, true)
      await expand(missing)
      await take('missing-result-injected-opened', 'recovery', missing, true)

      scope = await openDetailsChat(page, capture)
      let row = await phrase(page, scope, 'slow one', 'running')
      await expect(row.locator(D.timer)).toContainText('s')
      await take('running-collapsed', 'tool-rows', row)
      await expand(row)
      await expect(row.locator(D.panel)).toContainText('Result pending')
      await take('running-opened', 'panels', row)
      await idle(scope)
      await expect(row.locator(D.duration)).toContainText('Ran for')
      await take('duration-opened', 'panels', row)

      scope = await openDetailsChat(page, capture)
      row = await phrase(page, scope, 'slow one', 'running')
      await scope.locator(SEL.stop).click()
      await expect(row).toHaveAttribute('data-status', 'stopped')
      await take('stopped-collapsed', 'tool-rows', row)
      await expand(row)
      await take('stopped-opened', 'panels', row)

      for (const state of ['pending', 'approved', 'denied', 'denied-reason', 'expired', 'auto', 'cancelled', 'superseded'] as const) {
        const approval = await approvalState(page, capture, state)
        await take(`approval-${state}-collapsed`, 'approvals', approval.row)
        if (state === 'pending') {
          await approval.row.getByRole('button', { name: /^Details for / }).click()
          await take('approval-pending-opened', 'approvals', approval.row)
          // Retain the surface until the pending captures are complete, then
          // use the real Stop control before navigating to the next scenario.
          await approval.scope.locator(SEL.stop).click()
          await expect(cards(approval.scope)).toHaveCount(0)
        }
        else {
          await expand(approval.row)
          await take(`approval-${state}-opened`, 'approvals', approval.row)
        }
      }

      scope = await openDetailsChat(page, capture, SUMMARY_AGENT)
      row = await phrase(page, scope, 'lookup one')
      await expand(row)
      await take('summary-opened', 'panels', row)
      row = await phrase(page, scope, 'hidden details')
      await expand(row)
      await take('summary-hidden-part-opened', 'panels', row)

      scope = await openDetailsChat(page, capture)
      row = await phrase(page, scope, 'big result')
      await expand(row)
      await expect(row.locator(D.viewAll)).toBeVisible()
      await take('view-all-preview', 'panels', row)
      await row.locator(D.dialogButton).click()
      await take('dialog', 'dialogs', row.getByRole('dialog'))
      await page.keyboard.press('Escape')
      await row.locator(D.viewAll).click()
      await expect(row.locator(D.viewAll)).toHaveCount(0)
      await take('view-all-full', 'panels', row)

      // Loading is a delayed real read. Load failure is an injected successful
      // history envelope omitting the requested row, so no real HTTP/console
      // failures need to be excluded from the smoke invariants.
      scope = await openDetailsChat(page, capture)
      row = await phrase(page, scope, 'big result')
      await expand(row)
      const rowId = await row.getAttribute('data-message-id')
      let release!: () => void
      const wait = new Promise<void>(resolve => { release = resolve })
      let requested = false
      await page.route('**/api/v1/sessions/messages?*', async route => {
        const response = await route.fetch()
        const body = await response.json()
        requested = true
        await wait
        await route.fulfill({ response, json: { ...body, messages: body.messages.filter((item: { message_id: string }) => item.message_id !== rowId), pagination: { has_more: false, next_cursor: '', prev_cursor: '' } } })
      })
      try {
        await row.locator(D.viewAll).click()
        await expect.poll(() => requested).toBe(true)
        await expect(row.locator('.chat-tool-panel__loading')).toContainText('Loading details')
        await take('loading-injected-delay', 'load-states', row, true)
        release()
        await expect(row.locator('.chat-tool-panel__error')).toContainText('Could not load details.')
        await take('load-failed-injected-missing-row', 'load-states', row, true)
      }
      finally { release(); await page.unroute('**/api/v1/sessions/messages?*') }
      await row.locator('.chat-tool-panel__retry').click()
      await expect(row.locator('.chat-tool-panel__error')).toHaveCount(0)
      await take('load-retry-restored', 'load-states', row)

      scope = await openDetailsChat(page, capture)
      row = await phrase(page, scope, 'slow one', 'running')
      let resume!: () => void
      const readGate = new Promise<void>(resolve => { resume = resolve })
      await page.route('**/api/v1/sessions/messages?*', async route => { await readGate; await route.continue() })
      try {
        frames.idle(await sessionIdOf(page))
        await expect(row).toHaveAttribute('data-status', 'checking')
        await expect(row.locator(D.toggle)).toHaveCount(0)
        await take('checking-injected-collapsed', 'recovery', row, true)
      }
      finally { resume(); await page.unroute('**/api/v1/sessions/messages?*') }
      await idle(scope)

      // Install a fresh route for the next chat's new socket on navigation.
      const unknown = await injectedUnknown(page, capture)
      await take('outcome-unknown-injected-collapsed', 'recovery', unknown.row, true)
      await expand(unknown.row)
      await take('outcome-unknown-injected-opened', 'recovery', unknown.row, true)
    })
  }
}

test.afterAll(async ({ browser }) => {
  if (!shots.length) return
  const context = await browser.newContext()
  const page = await context.newPage()
  try { await sheets(page, shots) }
  finally { await context.close() }
  const failures = shots.flatMap(shot => [
    ...shot.measurements.controls.filter(control => control.clipped).map(control => `${shot.file}: clipped caret/Copy or focus ring: ${control.class}`),
    ...shot.measurements.contrasts.filter(text => text.ratio < 4.5).map(text => `${shot.file}: contrast ${text.ratio.toFixed(2)}: ${text.class}`),
  ])
  expect(failures, 'contact sheets and index are saved before reporting visual measurements').toEqual([])
})
