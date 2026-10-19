import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { collectConsoleErrors } from './helpers/console'
import { loginAsAdmin, pageIframeSelector } from './helpers/login'

/**
 * Session Forms end-to-end checks. They drive the scripted fixture agent
 * (src/app/session_forms_demo/generate.lua), so the app must run with the
 * `session-forms-fixtures` profile (see e2e/README.md).
 */

const DEMO_PAGE_IFRAME_SELECTOR = pageIframeSelector('app.views:session-forms-demo')
const FIXTURE_REGISTRY_ID = 'app.session_forms_demo:fixture_agent'
const CHAT_INPUT_PLACEHOLDER = 'Type a message'
// The first form needs a tool call, an artifact and a component load.
const FORM_TIMEOUT = 15_000

const DELIVERY_OPTION_1 = 'Courier'
const DELIVERY_OPTION_2 = 'Pickup point'
// These replies must match generate.lua.
const ANSWERED_MESSAGE = 'Answered a question about delivery.'
const PROPOSE_ACTION_REPLY = 'I plan to book a courier pickup. I will only do it after you confirm.'
const LATE_ANSWER_REPLY = 'This answer arrived after the conversation moved on. Please confirm again before I act on it.'

/** Logs in and starts a new chat with the fixture agent from the Session Forms Demo page. */
async function openFixtureChat(page: Page) {
  await loginAsAdmin(page)
  // The page has no sidebar entry, so open it by URL.
  await page.goto('/session-forms-demo')

  const demoFrame = page.frameLocator(DEMO_PAGE_IFRAME_SELECTOR)
  // The titles share a prefix, so match the card by registry id.
  const fixtureCard = demoFrame.locator('.rounded-lg').filter({ hasText: FIXTURE_REGISTRY_ID })
  await expect(fixtureCard).toHaveCount(1, { timeout: 15_000 })
  await fixtureCard.getByRole('button', { name: /start chat/i }).click()

  // Start chat replaces the top-level route with /chat/:id, so later steps use page, not a frame.
  await expect(page.getByPlaceholder(CHAT_INPUT_PLACEHOLDER)).toBeVisible({ timeout: 15_000 })
}

async function sendChatMessage(page: Page, text: string) {
  const chatInput = page.getByPlaceholder(CHAT_INPUT_PLACEHOLDER)
  await chatInput.fill(text)
  await chatInput.press('Enter')
}

/** Asks the fixture agent for a form and returns the form once it can be answered. */
async function askForForm(page: Page) {
  await sendChatMessage(page, 'ask me')
  const formCard = page.locator('wippy-form')
  await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: FORM_TIMEOUT })
  return formCard
}

test.describe('Session Forms Fixture', () => {
  // The fixture agents exist only with the `session-forms-fixtures` profile,
  // which scripts/run-dev.mjs selects when SESSION_FORMS_DEV_FIXTURES=true.
  test.skip(
    process.env.SESSION_FORMS_DEV_FIXTURES !== 'true',
    'requires the Session Forms dev fixtures: start the app with SESSION_FORMS_DEV_FIXTURES=true and run this suite with the same value',
  )

  test('ask me -> pick an option -> answered, and it stays answered after reload', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    // Ignore console errors from login.
    consoleErrors.length = 0

    const formCard = await askForForm(page)
    await formCard.getByRole('radio', { name: DELIVERY_OPTION_1 }).click()

    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })

    await expect(page.getByText(ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(`Thanks, noted: ${DELIVERY_OPTION_1}.`, { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.reload()

    await expect(page.locator('wippy-form')).toHaveAttribute('card-state', 'answered', { timeout: 15_000 })
    await expect(page.getByText(ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(`Thanks, noted: ${DELIVERY_OPTION_1}.`, { exact: true })).toBeVisible()

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me -> propose action -> answering the stale form gets the late-answer reply', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page)

    await sendChatMessage(page, 'propose action')
    await expect(page.getByText(PROPOSE_ACTION_REPLY, { exact: true })).toBeVisible({ timeout: 10_000 })

    await formCard.getByRole('radio', { name: DELIVERY_OPTION_2 }).click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect(page.getByText(ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(LATE_ANSWER_REPLY, { exact: true })).toBeVisible({ timeout: 10_000 })

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })
})
