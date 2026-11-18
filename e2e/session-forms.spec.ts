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
const TICK_ANSWER_ERROR = 'Tick at least one answer, or type your own.'
// What the card says when the turn that read the answer ended without a reply.
const INTERRUPTED_STATUS = 'The assistant stopped before answering. Send a message to continue.'
const QUICK_JOB_TOOL = 'quick_job'
const FAIL_START_TEXT = 'Starting the quick job.'
const FAIL_ERROR_TEXT = 'Session Forms fixture: scripted provider failure after the quick job.'
const LIMIT_START_TEXT = 'Starting the quick job again.'
const LIMIT_ERROR_TEXT = 'Turn stopped: 1 agent steps without a final answer (limit 1).'
const NOTE_TEXT = 'A short note written by the Session Forms fixture.'
const LIMIT_FIXTURE_REGISTRY_ID = 'app.session_forms_demo:limit_fixture_agent'

/** Logs in and starts a new chat with a fixture agent from the Session Forms Demo page. */
async function openFixtureChat(page: Page, registryId = FIXTURE_REGISTRY_ID) {
  await loginAsAdmin(page)
  // The page has no sidebar entry, so open it by URL.
  await page.goto('/session-forms-demo')

  const demoFrame = page.frameLocator(DEMO_PAGE_IFRAME_SELECTOR)
  // The titles share a prefix, so match the card by registry id.
  const fixtureCard = demoFrame.locator('.rounded-lg').filter({ hasText: registryId })
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

/** Asks the fixture agent for a form and returns the form once it can be answered. `phrase` picks which one. */
async function askForForm(page: Page, phrase = 'ask me') {
  await sendChatMessage(page, phrase)
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

  // The job phrases below run through the same turn code as the form tests. The
  // `slow tool` phrase has no case here, because its tool sleeps 25 seconds.

  /** Answers a fresh "ask me several" form by typing `phrase` as its Other text. */
  async function answerWithOtherText(page: Page, phrase: string) {
    const formCard = await askForForm(page, 'ask me several')
    const other = formCard.locator('textarea')
    await other.fill(phrase)
    await other.press('Enter')
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    return formCard
  }

  test('ask me several -> Enter with nothing ticked asks to tick an answer and sends nothing', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me several')
    const firstOption = formCard.getByRole('checkbox', { name: 'Gift wrap' })
    await firstOption.focus()
    await firstOption.press('Enter')

    await expect(formCard.getByText(TICK_ANSWER_ERROR)).toBeVisible()
    await expect(formCard).toHaveAttribute('card-state', 'active')
    await expect(page.getByText('Answered a question about delivery extras.', { exact: true })).toHaveCount(0)

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('fail after text -> the text and the tool call stay, the error follows, and the card is not complete', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await answerWithOtherText(page, 'fail after text')

    await expect(page.getByText(FAIL_START_TEXT, { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(QUICK_JOB_TOOL).first()).toBeVisible()
    await expect(page.getByText(FAIL_ERROR_TEXT)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Quick job finished.', { exact: true })).toHaveCount(0)
    await expect(formCard).toContainText(INTERRUPTED_STATUS, { timeout: 10_000 })

    // The provider error is the scripted outcome, so it is not a console failure.
    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('limit after text -> the text and the tool call stay, the turn limit follows, and the card is not complete', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page, LIMIT_FIXTURE_REGISTRY_ID)
    consoleErrors.length = 0

    const formCard = await answerWithOtherText(page, 'limit after text')

    await expect(page.getByText(LIMIT_START_TEXT, { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(QUICK_JOB_TOOL).first()).toBeVisible()
    await expect(page.getByText(LIMIT_ERROR_TEXT)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Quick job finished.', { exact: true })).toHaveCount(0)
    await expect(formCard).toContainText(INTERRUPTED_STATUS, { timeout: 10_000 })

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('artifact and ask -> the note and the form share one round, and the note shows once before and after the answer', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'artifact and ask')
    await expect(page.getByText(NOTE_TEXT, { exact: true })).toHaveCount(1)

    await formCard.getByRole('radio', { name: DELIVERY_OPTION_1 }).click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect(page.getByText(`Thanks, noted: ${DELIVERY_OPTION_1}.`, { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(NOTE_TEXT, { exact: true })).toHaveCount(1)

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })
})