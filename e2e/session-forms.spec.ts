import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { collectConsoleErrors } from './helpers/console'
import { loginAsAdmin, pageIframeSelector } from './helpers/login'

/**
 * Session Forms end-to-end checks. They drive the scripted fixture agent
 * (src/app/session_forms_demo/generate.lua), so the app must run with the
 * `session-forms-fixtures` profile (see e2e/README.md).
 */

const DEMO_PAGE_IFRAME_SELECTOR = pageIframeSelector('app.views:session-forms-demo')
// The fixture agent has both forms traits (ask_user and ask_user_fields). The
// steering fixture agent has only ask_user.
const FIXTURE_REGISTRY_ID = 'app.session_forms_demo:fixture_agent'
const STEERING_FIXTURE_REGISTRY_ID = 'app.session_forms_demo:steering_fixture_agent'
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

/** Sends a fixture phrase that asks for a form and returns the form once it can be answered. */
async function askForForm(page: Page, phrase = 'ask me') {
  await sendChatMessage(page, phrase)
  const formCard = page.locator('wippy-form')
  await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: FORM_TIMEOUT })
  return formCard
}

// The fixture agents exist only with the `session-forms-fixtures` profile,
// which scripts/run-dev.mjs selects when SESSION_FORMS_DEV_FIXTURES=true. The
// skip is at file level, so it covers every describe block below.
test.skip(
  process.env.SESSION_FORMS_DEV_FIXTURES !== 'true',
  'requires the Session Forms dev fixtures: start the app with SESSION_FORMS_DEV_FIXTURES=true and run this suite with the same value',
)

test.describe('Session Forms Fixture', () => {
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

/*
 * Standard fields: the fixture's "ask me delivery" and "ask me preferences"
 * forms, which it asks through the ask_user_fields tool (see generate.lua's
 * ASK_USER_DELIVERY_ARGUMENTS and ASK_USER_PREFERENCES_ARGUMENTS).
 *
 * The date box is typed into one key at a time (`typeDateKeyByKey`), because a
 * single `fill` never shows a box that rewrites itself between keys. The
 * locators rely on:
 *  - each control is reachable by its field label (`getByLabel`), a checkbox
 *    by role + label, a radio by role + option label;
 *  - the Submit button is named "Submit" (the fixtures set no `submit_label`);
 *  - a validation error is connected to its control through
 *    `aria-describedby` and `aria-invalid`, and the first invalid control gets
 *    focus after a user-initiated submit. A browser-side error sends nothing.
 *    A `pattern` is only checked by the server, so a mismatch is a request
 *    that comes back as a 422 with `pattern_mismatch`;
 *  - the answered read-only view prints each field's label followed by its
 *    value: text as typed, a number as its digits, a date as its stored ISO
 *    text, a checkbox as Yes/No, an unanswered field as "Skipped";
 *  - a fields form (any form that is not all-choice) reflects `card-state`
 *    "active" and then "answered" on the <wippy-form> host, like the card.
 *
 * The fixture's acknowledgement reply prints every answered field as
 * `<id>=<value>` (strings verbatim, numbers as their digits, booleans as
 * yes/no, an unanswered field left out), so comparing it to the typed values
 * is the check that the SAVED values equal what was entered.
 */
const DELIVERY_ANSWERED_MESSAGE = 'Sent my delivery details.'
const PREFERENCES_ANSWERED_MESSAGE = 'Answered questions about my delivery preferences.'

/** POST /artifact/:id/state, the endpoint a form answer is submitted to. */
const SUBMIT_ANSWER_URL = /\/artifact\/[^/]+\/state(?:[?#]|$)/

/** The delivery-details answers the test types in (all inside the fixture's fixed bounds and pattern). */
const DELIVERY_VALUES = {
  fullName: 'Zoë Lovelace',
  invalidEmail: 'not-an-email',
  email: 'zoe.lovelace@example.com',
  phone: '+44 20 7946 0958',
  deliveryDate: '2026-11-02',
  parcelCount: '7',
  notes: 'Leave it with the neighbour',
}

/** Text that is no phone number: the browser lets it through, the server's `pattern` refuses it. */
const NOT_A_PHONE_NUMBER = 'abc'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * One RegExp for a read-only form: every label followed, within a short gap,
 * by its value, in the order given. Playwright matches a RegExp against the
 * element's raw text (no whitespace between block elements), so the gap may be
 * empty. The tight gap ties each value to its own label.
 */
function readOnlyValues(pairs: ReadonlyArray<readonly [label: string, value: string | RegExp]>): RegExp {
  const source = pairs
    .map(([label, value]) => `${escapeRegExp(label)}[\\s\\S]{0,60}?(?:${typeof value === 'string' ? escapeRegExp(value) : value.source})`)
    .join('[\\s\\S]*?')
  return new RegExp(source)
}

/**
 * Types a date into the date box one key at a time, with real key events, and
 * checks after every key that the box holds exactly what was typed so far. A
 * date box that rewrites itself from its last accepted date loses each key as
 * it is typed, which `fill` (one input event, like a paste) never shows.
 */
async function typeDateKeyByKey(control: Locator, text: string) {
  await control.click()
  let typed = ''
  for (const key of text) {
    typed += key
    await control.pressSequentially(key)
    await expect(control).toHaveValue(typed)
  }
}

/** Selects what is in a box and types over it, key by key. */
async function retypeDate(control: Locator, text: string) {
  await control.click()
  await control.press('ControlOrMeta+A')
  await control.press('Backspace')
  await expect(control).toHaveValue('')
  await typeDateKeyByKey(control, text)
}

/** Counts answer submissions (POST /artifact/:id/state) the page makes. */
function watchAnswerSubmissions(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && SUBMIT_ANSWER_URL.test(request.url()))
      urls.push(request.url())
  })
  return urls
}

test.describe('Session Forms V2 standard fields', () => {
  test('ask me delivery -> an invalid email blocks submit -> the corrected details are saved exactly and survive a reload', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)
    const answerSubmissions = watchAnswerSubmissions(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me delivery')
    await expect(formCard.getByRole('heading', { name: 'Delivery details' })).toBeVisible()

    const fullName = formCard.getByLabel('Full name')
    const email = formCard.getByLabel('Email address')
    const phone = formCard.getByLabel('Phone number')
    const deliveryDate = formCard.getByLabel('Delivery date')
    const parcelCount = formCard.getByLabel('Number of parcels')
    const notes = formCard.getByLabel('Delivery notes')
    const consent = formCard.getByRole('checkbox', { name: /agree to be contacted about this delivery/i })
    const submit = formCard.getByRole('button', { name: /^submit$/i })

    // A default is a prefill, not an answer: the parcel count starts at 1, the
    // consent box starts unticked, and nothing has been sent.
    await expect(parcelCount).toHaveValue('1')
    await expect(consent).not.toBeChecked()
    expect(answerSubmissions).toHaveLength(0)

    await fullName.fill(DELIVERY_VALUES.fullName)
    await email.fill(DELIVERY_VALUES.invalidEmail)
    await phone.fill(DELIVERY_VALUES.phone)
    await typeDateKeyByKey(deliveryDate, DELIVERY_VALUES.deliveryDate)
    await parcelCount.fill(DELIVERY_VALUES.parcelCount)
    await notes.fill(DELIVERY_VALUES.notes)
    await consent.click()
    await expect(consent).toBeChecked()
    await submit.click()

    // Client-side validation: the invalid email blocks the submit. The error
    // is connected to the input (its accessible description), the input gets
    // focus, the other answers stay, and no request is sent. The email field
    // has no description of its own, so a non-empty description is the error.
    await expect(email).toHaveAccessibleDescription(/email/i)
    await expect(email).toBeFocused()
    await expect(fullName).toHaveValue(DELIVERY_VALUES.fullName)
    await expect(deliveryDate).toHaveValue(DELIVERY_VALUES.deliveryDate)
    await expect(parcelCount).toHaveValue(DELIVERY_VALUES.parcelCount)
    await expect(formCard).toHaveAttribute('card-state', 'active')
    await expect(page.getByText(DELIVERY_ANSWERED_MESSAGE, { exact: true })).toHaveCount(0)
    expect(answerSubmissions).toHaveLength(0)

    await email.fill(DELIVERY_VALUES.email)
    await submit.click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect.poll(() => answerSubmissions.length).toBe(1)

    // The saved values, as the agent received them in the answer record.
    const acknowledgement = `Thanks, noted: full_name=${DELIVERY_VALUES.fullName}; email=${DELIVERY_VALUES.email}; phone=${DELIVERY_VALUES.phone}; delivery_date=${DELIVERY_VALUES.deliveryDate}; parcel_count=${DELIVERY_VALUES.parcelCount}; notes=${DELIVERY_VALUES.notes}; consent=yes`
    await expect(page.getByText(DELIVERY_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(acknowledgement, { exact: true })).toBeVisible({ timeout: 10_000 })

    // The answered read-only view, after a reload, shows the same values and
    // has no controls left.
    const readOnly = readOnlyValues([
      ['Full name', DELIVERY_VALUES.fullName],
      ['Email address', DELIVERY_VALUES.email],
      ['Phone number', DELIVERY_VALUES.phone],
      ['Delivery date', DELIVERY_VALUES.deliveryDate],
      ['Number of parcels', DELIVERY_VALUES.parcelCount],
      ['Delivery notes', DELIVERY_VALUES.notes],
      ['I agree to be contacted about this delivery', 'Yes'],
    ])
    await page.reload()

    await expect(page.locator('wippy-form')).toHaveAttribute('card-state', 'answered', { timeout: 15_000 })
    await expect(page.locator('wippy-form')).toHaveText(readOnly)
    await expect(page.locator('wippy-form').getByRole('textbox')).toHaveCount(0)
    await expect(page.locator('wippy-form').getByRole('button', { name: /^submit$/i })).toHaveCount(0)
    await expect(page.getByText(DELIVERY_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(acknowledgement, { exact: true })).toBeVisible()
    expect(answerSubmissions).toHaveLength(1)

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me delivery -> a phone number that breaks the pattern is sent, refused by the server with a 422 under Phone, kept as typed, and the corrected number is saved', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)
    const answerSubmissions = watchAnswerSubmissions(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me delivery')

    const phone = formCard.getByLabel('Phone number')
    const phoneField = formCard.locator('.w-form__field').filter({ has: page.getByLabel('Phone number') })
    const submit = formCard.getByRole('button', { name: /^submit$/i })
    const status = formCard.getByRole('status')

    // Everything but the phone number is valid. The browser never checks a
    // `pattern` (see the form's "Checks before sending"), so "abc" goes out.
    await formCard.getByLabel('Full name').fill(DELIVERY_VALUES.fullName)
    await formCard.getByLabel('Email address').fill(DELIVERY_VALUES.email)
    await phone.fill(NOT_A_PHONE_NUMBER)
    await typeDateKeyByKey(formCard.getByLabel('Delivery date'), DELIVERY_VALUES.deliveryDate)
    await formCard.getByRole('checkbox', { name: /agree to be contacted about this delivery/i }).click()

    const refusal = page.waitForResponse(response => response.request().method() === 'POST' && SUBMIT_ANSWER_URL.test(response.url()))
    await submit.click()
    const response = await refusal
    expect(response.status()).toBe(422)
    const refused = await response.json() as { errors: Record<string, Array<{ code: string, message: string }>> }
    expect(refused.errors.phone.map(error => error.code)).toEqual(['pattern_mismatch'])
    expect(answerSubmissions).toHaveLength(1)

    // The server's error is shown under Phone, connected to the box, the box
    // keeps what was typed and gets focus, and the form is still open.
    await expect(phoneField.getByText(refused.errors.phone[0].message, { exact: true })).toBeVisible()
    await expect(phone).toHaveAccessibleDescription(refused.errors.phone[0].message)
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(phone).toHaveValue(NOT_A_PHONE_NUMBER)
    await expect(phone).toBeFocused()
    await expect(status).toHaveText('1 question needs attention.')
    await expect(formCard).toHaveAttribute('card-state', 'active')
    await expect(page.getByText(DELIVERY_ANSWERED_MESSAGE, { exact: true })).toHaveCount(0)

    // Corrected: the error goes, and the number that is sent is the saved one.
    await phone.fill(DELIVERY_VALUES.phone)
    await expect(phone).not.toHaveAttribute('aria-invalid', 'true')
    await expect(phoneField.getByText(refused.errors.phone[0].message, { exact: true })).toHaveCount(0)
    await submit.click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect.poll(() => answerSubmissions.length).toBe(2)

    const acknowledgement = `Thanks, noted: full_name=${DELIVERY_VALUES.fullName}; email=${DELIVERY_VALUES.email}; phone=${DELIVERY_VALUES.phone}; delivery_date=${DELIVERY_VALUES.deliveryDate}; parcel_count=1; consent=yes`
    await expect(page.getByText(acknowledgement, { exact: true })).toBeVisible({ timeout: 10_000 })

    // The browser logs the refused request itself as a console error. It is
    // the only error expected here.
    expect(consoleErrors.filter(message => !/status of 422/.test(message)), `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me delivery -> a typed date that is not a valid date stays in the box with its error until it is corrected, and the corrected date is saved', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)
    const answerSubmissions = watchAnswerSubmissions(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me delivery')

    const deliveryDate = formCard.getByLabel('Delivery date')
    const submit = formCard.getByRole('button', { name: /^submit$/i })
    const status = formCard.getByRole('status')

    // Everything but the date is valid (the parcel count starts at 1).
    await formCard.getByLabel('Full name').fill(DELIVERY_VALUES.fullName)
    await formCard.getByLabel('Email address').fill(DELIVERY_VALUES.email)
    await formCard.getByLabel('Phone number').fill(DELIVERY_VALUES.phone)
    await formCard.getByRole('checkbox', { name: /agree to be contacted about this delivery/i }).click()

    // A day that does not exist, typed one key at a time: the box keeps every
    // key, the submit names the date, and the text is still in the box after
    // the error appears, after the box is left, and after a second submit.
    await typeDateKeyByKey(deliveryDate, '2026-02-30')
    await submit.click()
    await expect(deliveryDate).toHaveAccessibleDescription(/valid date as YYYY-MM-DD/i)
    await expect(deliveryDate).toHaveAttribute('aria-invalid', 'true')
    await expect(deliveryDate).toBeFocused()
    await expect(deliveryDate).toHaveValue('2026-02-30')
    await expect(status).toHaveText('1 question needs attention.')
    expect(answerSubmissions).toHaveLength(0)

    await deliveryDate.press('Tab')
    await expect(deliveryDate).not.toBeFocused()
    await expect(deliveryDate).toHaveValue('2026-02-30')
    await submit.click()
    await expect(deliveryDate).toHaveValue('2026-02-30')
    expect(answerSubmissions).toHaveLength(0)

    // Text that is no date at all.
    await retypeDate(deliveryDate, 'next tuesday')
    await submit.click()
    await expect(deliveryDate).toHaveAccessibleDescription(/valid date as YYYY-MM-DD/i)
    await expect(deliveryDate).toHaveValue('next tuesday')

    // A real date outside the allowed range, on each side.
    await retypeDate(deliveryDate, '2025-12-31')
    await submit.click()
    await expect(deliveryDate).toHaveAccessibleDescription(/2026-01-01 or later/)
    await expect(deliveryDate).toHaveValue('2025-12-31')
    await retypeDate(deliveryDate, '2028-01-01')
    await submit.click()
    await expect(deliveryDate).toHaveAccessibleDescription(/2027-12-31 or earlier/)
    await expect(deliveryDate).toHaveValue('2028-01-01')
    expect(answerSubmissions).toHaveLength(0)

    // Corrected: the error and the status text go as soon as the question is fixed.
    await retypeDate(deliveryDate, '2026-12-24')
    await expect(status).toHaveText('')
    await expect(deliveryDate).not.toHaveAttribute('aria-invalid', 'true')
    await submit.click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect.poll(() => answerSubmissions.length).toBe(1)

    const acknowledgement = `Thanks, noted: full_name=${DELIVERY_VALUES.fullName}; email=${DELIVERY_VALUES.email}; phone=${DELIVERY_VALUES.phone}; delivery_date=2026-12-24; parcel_count=1; consent=yes`
    await expect(page.getByText(acknowledgement, { exact: true })).toBeVisible({ timeout: 10_000 })

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me delivery -> the date box can be edited in the middle of the text without the caret jumping to the end', async ({ page }) => {
    await openFixtureChat(page)
    const formCard = await askForForm(page, 'ask me delivery')
    const deliveryDate = formCard.getByLabel('Delivery date')

    await typeDateKeyByKey(deliveryDate, '2026-06-15')
    // Caret to just after "2026-", delete the month, and type another one.
    for (let i = 0; i < 5; i++)
      await deliveryDate.press('ArrowLeft')
    await deliveryDate.press('Delete')
    await deliveryDate.press('Delete')
    await expect(deliveryDate).toHaveValue('2026--15')
    await deliveryDate.pressSequentially('0')
    await expect(deliveryDate).toHaveValue('2026-0-15')
    await deliveryDate.pressSequentially('8')
    await expect(deliveryDate).toHaveValue('2026-08-15')
  })

  test('ask me delivery -> the calendar picks a date by mouse and by keyboard, and its panel is readable in both themes', async ({ page }) => {
    await openFixtureChat(page)
    const formCard = await askForForm(page, 'ask me delivery')
    const deliveryDate = formCard.getByLabel('Delivery date')
    const calendarButton = formCard.getByRole('button', { name: /choose date/i })
    const calendar = formCard.getByRole('dialog', { name: /choose date/i })

    // Typed text anchors the calendar on a known month.
    await typeDateKeyByKey(deliveryDate, '2026-06-15')

    // By mouse: the button opens it, a day picks it, the box shows it.
    await calendarButton.click()
    await expect(calendar).toBeVisible()
    await calendar.getByText('20', { exact: true }).click()
    await expect(deliveryDate).toHaveValue('2026-06-20')
    await expect(calendar).toBeHidden()

    // By keyboard: ArrowDown opens it, a second ArrowDown moves into the days,
    // the arrows move by day, Enter picks and gives focus back to the box.
    await deliveryDate.focus()
    await deliveryDate.press('ArrowDown')
    await expect(calendar).toBeVisible()
    await page.keyboard.press('ArrowDown')
    // Focus can pass over the panel's previous-month button before it reaches a
    // day, so wait until a day cell itself has focus, not any element of the
    // panel. Which day it enters on is PrimeVue's choice (the first cell of the
    // grid, which can be a greyed day of May), so the test moves one day on,
    // which is always a June day, and expects the box to show that day.
    const focusedDay = calendar.locator('td span:focus')
    await expect(focusedDay).toHaveCount(1)
    const entryDay = (await focusedDay.innerText()).trim()
    await page.keyboard.press('ArrowRight')
    // `.not.toHaveText` would pass while focus is between two days, so poll for the new day.
    await expect.poll(async () => (await focusedDay.innerText().catch(() => entryDay)).trim()).not.toBe(entryDay)
    const pickedDay = (await focusedDay.innerText()).trim()
    await page.keyboard.press('Enter')
    await expect(deliveryDate).toHaveValue(`2026-06-${pickedDay.padStart(2, '0')}`)
    await expect(calendar).toBeHidden()
    await expect(deliveryDate).toBeFocused()

    // The same pick again and again, with no wait between focus entering the
    // days and Enter. The picker re-renders and re-focuses its day cells for a
    // moment after a pick (a delayed focus that its own "focus is already in the
    // calendar" check misses inside a shadow root), and it used to take focus from
    // the box in about one run in four, so that the calendar closed with focus
    // dropped to the page. The box must hold focus in every round once the
    // calendar is gone.
    for (let round = 1; round <= 5; round++) {
      await deliveryDate.focus()
      await deliveryDate.press('ArrowDown')
      await expect(calendar, `round ${round}: the calendar opens`).toBeVisible()
      await page.keyboard.press('ArrowDown')
      await expect(focusedDay, `round ${round}: focus is on a day`).toHaveCount(1)
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await expect(calendar, `round ${round}: the calendar closes`).toBeHidden()
      await expect(deliveryDate, `round ${round}: focus is on the date box`).toBeFocused()
      await expect(deliveryDate).toHaveValue(/^2026-06-\d{2}$/)
    }

    // Escape closes it and keeps what the box holds.
    const keyboardPick = await deliveryDate.inputValue()
    await deliveryDate.press('ArrowDown')
    await expect(calendar).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(calendar).toBeHidden()
    await expect(deliveryDate).toHaveValue(keyboardPick)

    // The calendar's own colours follow the form's forced theme. It opens in the
    // theme plugin's overlay layer, outside the themed container, and that layer
    // takes the theme class of the control that opened it.
    const overlayLayer = calendar.locator('xpath=ancestor::*[@data-wippy-overlay-layer]')
    for (const mode of ['dark', 'light'] as const) {
      await formCard.evaluate((host, m) => {
        const root = host.shadowRoot!.querySelector('[data-wippy-theme-root]') as HTMLElement
        for (const el of [host as HTMLElement, root]) {
          el.classList.remove('w-theme-dark', 'w-theme-light')
          el.classList.add(`w-theme-${m}`)
        }
      }, mode)
      await calendarButton.click()
      await expect(calendar).toBeVisible()
      await expect(overlayLayer).toHaveClass(new RegExp(`w-theme-${mode}`))
      const luminance = await calendar.evaluate((el) => {
        // Chromium reports a colour as rgb (0 to 255) or as color(srgb) (0 to 1).
        const background = getComputedStyle(el).backgroundColor
        const scale = background.startsWith('color(') ? 1 : 255
        const [r, g, b] = background.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / scale
      })
      if (mode === 'dark')
        expect(luminance).toBeLessThan(0.3)
      else
        expect(luminance).toBeGreaterThan(0.7)
      await page.keyboard.press('Escape')
      await expect(calendar).toBeHidden()
    }
  })

  test('ask me preferences -> unticked checkboxes are saved as no, a skipped note stays skipped, and both survive a reload', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me preferences')
    await expect(formCard.getByRole('heading', { name: 'Preferences' })).toBeVisible()

    // A form that mixes a choice with the new fields is a fields form: the
    // radio is picked, then the form is sent with Submit (an all-choice form
    // would send on the click).
    const smsUpdates = formCard.getByRole('checkbox', { name: /send me sms updates/i })
    const emailUpdates = formCard.getByRole('checkbox', { name: /send me email updates/i })
    const leaveAtDoor = formCard.getByRole('checkbox', { name: /leave the parcel at the door/i })
    // Sent with nothing chosen: the group is in error, and the error is on the
    // radios themselves (`aria-invalid`), where a screen reader lands. The
    // status line says so and is emptied once a choice is made.
    await formCard.getByRole('button', { name: /^submit$/i }).click()
    await expect(formCard.getByRole('radio', { name: 'Courier' })).toHaveAttribute('aria-invalid', 'true')
    await expect(formCard.getByRole('radio', { name: 'Pickup point' })).toHaveAttribute('aria-invalid', 'true')
    await expect(formCard.getByRole('status')).toHaveText('1 question needs attention.')
    await formCard.getByRole('radio', { name: 'Courier' }).click()
    await expect(formCard.getByRole('radio', { name: 'Courier' })).not.toHaveAttribute('aria-invalid', 'true')
    await expect(formCard.getByRole('status')).toHaveText('')
    await smsUpdates.click()
    await expect(smsUpdates).toBeChecked()
    await expect(emailUpdates).not.toBeChecked()
    await expect(leaveAtDoor).not.toBeChecked()
    // The optional note is left empty on purpose.
    await formCard.getByRole('button', { name: /^submit$/i }).click()

    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })

    // An unticked optional checkbox is an answer (`no`); the skipped note has
    // no entry at all.
    const acknowledgement = 'Thanks, noted: delivery=Courier; sms_updates=yes; email_updates=no; leave_at_door=no'
    await expect(page.getByText(PREFERENCES_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(acknowledgement, { exact: true })).toBeVisible({ timeout: 10_000 })

    const readOnly = readOnlyValues([
      ['How should the parcel be delivered?', 'Courier'],
      ['Send me SMS updates', 'Yes'],
      ['Send me email updates', 'No'],
      ['Leave the parcel at the door', 'No'],
      ['Anything else we should know?', 'Skipped'],
    ])
    await page.reload()

    await expect(page.locator('wippy-form')).toHaveAttribute('card-state', 'answered', { timeout: 15_000 })
    await expect(page.locator('wippy-form')).toHaveText(readOnly)
    await expect(page.getByText(PREFERENCES_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(acknowledgement, { exact: true })).toBeVisible()

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })
})

/*
 * Limits: the fixture's "ask me limits" form (generate.lua's
 * ASK_USER_LIMITS_ARGUMENTS) reaches the rules the delivery form does not: a
 * floating `step` (0.25) with bounds, the text cap of 2000, the textarea cap of
 * 8000, and an optional email and date that can stay blank. The saved values
 * are read from the messages API (GET /api/v1/sessions/messages), where the
 * fixture's acknowledgement reply holds every answered field as `<id>=<value>`.
 */
const LIMITS_ANSWERED_MESSAGE = 'Sent my limits.'
const TEXT_CAP = 2000
const TEXTAREA_CAP = 8000

/** The stored messages of the chat the page shows, read through the messages API. */
async function storedMessages(page: Page): Promise<Array<{ type: string, data: string }>> {
  const sessionId = new URL(page.url()).pathname.match(/\/chat\/([^/?#]+)/)?.[1]
  expect(sessionId, `chat id in ${page.url()}`).toBeTruthy()
  const token = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('@wippy_token_info') ?? 'null')?.token as string | undefined
    }
    catch {
      return undefined
    }
  })
  expect(token, 'signed-in token in localStorage').toBeTruthy()
  const response = await page.request.get('/api/v1/sessions/messages', {
    headers: { Authorization: `Bearer ${token}` },
    params: { cursor: '', limit: 100, session_id: sessionId! },
  })
  expect(response.status()).toBe(200)
  const body = await response.json() as { messages?: Array<{ type: string, data: string }> }
  return body.messages ?? []
}

/** Waits until the stored replies hold exactly one acknowledgement and returns it. */
async function storedAcknowledgement(page: Page): Promise<string> {
  let acknowledgements: string[] = []
  await expect.poll(async () => {
    acknowledgements = (await storedMessages(page))
      .filter(message => message.type === 'assistant' && message.data.startsWith('Thanks, noted:'))
      .map(message => message.data)
    return acknowledgements.length
  }, { timeout: 15_000, message: 'one stored acknowledgement' }).toBe(1)
  return acknowledgements[0]
}

/**
 * The answer record the server stored for the form's answer row (the user
 * message that starts with the form's answered sentence), as parsed JSON:
 * each answer under `answers.<field id>.answer`, `null` when left unanswered.
 */
async function storedAnswers(page: Page): Promise<Record<string, { question: string, answer: unknown }>> {
  let row: { type: string, data: string } | undefined
  await expect.poll(async () => {
    row = (await storedMessages(page)).find(message => message.type === 'user' && message.data.startsWith(LIMITS_ANSWERED_MESSAGE))
    return Boolean(row)
  }, { timeout: 15_000, message: 'the stored form answer row' }).toBe(true)
  const record = row!.data.match(/<wippy-form-answers record='([\s\S]*)'>\s*<\/wippy-form-answers>\s*$/)?.[1]
  expect(record, 'answer record in the stored answer row').toBeTruthy()
  return (JSON.parse(record!) as { answers: Record<string, { question: string, answer: unknown }> }).answers
}

test.describe('Session Forms V2 limits', () => {
  test('ask me limits -> a step of 0.25 refuses 0.3 with its error and accepts 0.5, and the stored value is 0.5', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me limits')
    await expect(formCard.getByRole('heading', { name: 'Limits' })).toBeVisible()

    const quantity = formCard.getByLabel('Quantity')
    const submit = formCard.getByRole('button', { name: /^submit$/i })
    const status = formCard.getByRole('status')

    // 0.3 is inside the bounds but is not a multiple of 0.25.
    await quantity.fill('0.3')
    await submit.click()
    await expect(quantity).toHaveAttribute('aria-invalid', 'true')
    await expect(quantity).toHaveAccessibleDescription(/\S/)
    await expect(quantity).toBeFocused()
    await expect(quantity).toHaveValue('0.3')
    await expect(status).toHaveText('1 question needs attention.')
    await expect(formCard).toHaveAttribute('card-state', 'active')
    await expect(page.getByText(LIMITS_ANSWERED_MESSAGE, { exact: true })).toHaveCount(0)

    // 0.5 is a multiple of 0.25: the error goes and the answer is saved.
    await quantity.fill('0.5')
    await expect(quantity).not.toHaveAttribute('aria-invalid', 'true')
    await submit.click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect(page.getByText(LIMITS_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    expect(await storedAcknowledgement(page)).toBe('Thanks, noted: quantity=0.5')
    expect((await storedAnswers(page)).quantity.answer).toBe(0.5)

    expect(consoleErrors.filter(message => !/status of 422/.test(message)), `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me limits -> 2001 text and 8001 textarea characters are refused, 2000 and 8000 are accepted and stored in full', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me limits')

    const quantity = formCard.getByLabel('Quantity')
    const summary = formCard.getByLabel('Summary')
    const details = formCard.getByLabel('Details')
    const submit = formCard.getByRole('button', { name: /^submit$/i })
    const status = formCard.getByRole('status')

    // `fill` sets the whole text in one input event, not one key at a time.
    await quantity.fill('1')
    await summary.fill('s'.repeat(TEXT_CAP + 1))
    await details.fill('d'.repeat(TEXTAREA_CAP + 1))
    await submit.click()
    await expect(summary).toHaveAttribute('aria-invalid', 'true')
    await expect(summary).toHaveAccessibleDescription(/\S/)
    await expect(details).toHaveAttribute('aria-invalid', 'true')
    await expect(details).toHaveAccessibleDescription(/\S/)
    await expect(status).toHaveText('2 questions need attention.')
    await expect(summary).toHaveValue('s'.repeat(TEXT_CAP + 1))
    await expect(details).toHaveValue('d'.repeat(TEXTAREA_CAP + 1))
    await expect(formCard).toHaveAttribute('card-state', 'active')
    await expect(page.getByText(LIMITS_ANSWERED_MESSAGE, { exact: true })).toHaveCount(0)

    // Each error goes as soon as its own box is back at the cap.
    await summary.fill('s'.repeat(TEXT_CAP))
    await expect(summary).not.toHaveAttribute('aria-invalid', 'true')
    await expect(details).toHaveAttribute('aria-invalid', 'true')
    await details.fill('d'.repeat(TEXTAREA_CAP))
    await expect(details).not.toHaveAttribute('aria-invalid', 'true')
    await expect(status).toHaveText('')

    await submit.click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect(page.getByText(LIMITS_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    // The answer row stores both values in full. The agent's reply is not
    // checked here: the Session cuts the middle out of a model-visible answer
    // record of more than 6000 bytes (prompt_builder.lua's
    // checkpoint_request_excerpt), so the fixture cannot decode this record.
    const answers = await storedAnswers(page)
    expect(answers.quantity.answer).toBe(1)
    expect(answers.summary.answer).toBe('s'.repeat(TEXT_CAP))
    expect(answers.details.answer).toBe('d'.repeat(TEXTAREA_CAP))
    expect(answers.backup_email.answer).toBeNull()
    expect(answers.reminder_date.answer).toBeNull()

    expect(consoleErrors.filter(message => !/status of 422/.test(message)), `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me limits -> an optional email and date left blank submit, and both are stored as unanswered', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)
    const answerSubmissions = watchAnswerSubmissions(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    const formCard = await askForForm(page, 'ask me limits')

    // Only the required number is filled. Email and date are blank on purpose.
    await expect(formCard.getByLabel('Backup email')).toHaveValue('')
    await expect(formCard.getByLabel('Reminder date')).toHaveValue('')
    await formCard.getByLabel('Quantity').fill('2.75')
    await formCard.getByRole('button', { name: /^submit$/i }).click()

    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect.poll(() => answerSubmissions.length).toBe(1)
    await expect(page.getByText(LIMITS_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)

    // Stored: the number only. A blank optional field has no entry at all.
    const acknowledgement = await storedAcknowledgement(page)
    expect(acknowledgement).toBe('Thanks, noted: quantity=2.75')
    expect(acknowledgement).not.toMatch(/backup_email|reminder_date/)
    const answers = await storedAnswers(page)
    expect(answers.quantity.answer).toBe(2.75)
    for (const id of ['summary', 'details', 'backup_email', 'reminder_date'])
      expect(answers[id].answer, `${id} is stored as unanswered`).toBeNull()

    const readOnly = readOnlyValues([
      ['Quantity', '2.75'],
      ['Summary', 'Skipped'],
      ['Details', 'Skipped'],
      ['Backup email', 'Skipped'],
      ['Reminder date', 'Skipped'],
    ])
    await page.reload()
    await expect(page.locator('wippy-form')).toHaveAttribute('card-state', 'answered', { timeout: 15_000 })
    await expect(page.locator('wippy-form')).toHaveText(readOnly)
    expect(answerSubmissions).toHaveLength(1)

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me limits -> a slow send reads Sending…, spins, keeps focus on an enabled button, says so after 2 seconds, and then the form is answered', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    // The state POST is held for 3 seconds before it goes on to the server.
    await page.route(SUBMIT_ANSWER_URL, async (route) => {
      if (route.request().method() === 'POST')
        await new Promise(resolve => setTimeout(resolve, 3000))
      await route.continue()
    })

    const formCard = await askForForm(page, 'ask me limits')
    const status = formCard.getByRole('status')

    await formCard.getByLabel('Quantity').fill('1')
    const submit = formCard.getByRole('button', { name: /^submit$/i })
    await submit.click()

    // The same button, now labelled "Sending…", with its spinner. It keeps
    // focus and is not `disabled`, so a screen reader user does not lose their place.
    const sending = formCard.getByRole('button', { name: 'Sending…' })
    await expect(sending).toBeVisible()
    await expect(sending.locator('.animate-spin')).toBeVisible()
    await expect(sending).toBeFocused()
    await expect(sending).not.toHaveAttribute('disabled')
    await expect(status).toHaveText('')

    // The status region speaks only once the send has run for 2 seconds.
    await expect(status).toHaveText('Sending your answers.', { timeout: 2_900 })
    await expect(sending).toBeFocused()
    await expect(sending).not.toHaveAttribute('disabled')

    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect(page.getByText(LIMITS_ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    expect(await storedAcknowledgement(page)).toBe('Thanks, noted: quantity=1')

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })
})

// These replies must match generate.lua. The fixture quotes a tool result
// other than read_form on one line, so its reply shows what the agent was told.
const REFUSED_BY_ASK_USER_REPLY = /^Tool result from ask_user: .*unsupported_type/
const NO_FIELD_FORMS_REPLY = 'I can\'t create forms with these fields here.'

test.describe('Session Forms tools: ask_user and ask_user_fields', () => {
  test('steering fixture (ask_user only) -> a form with standard fields sent to ask_user is refused with unsupported_type, and the agent gets the refusal', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)

    await openFixtureChat(page, STEERING_FIXTURE_REGISTRY_ID)
    consoleErrors.length = 0

    // The server refuses the delivery-details form on ask_user, so no form is
    // created, and the agent's next reply quotes the refusal.
    await sendChatMessage(page, 'ask me delivery via ask_user')
    await expect(page.getByText(REFUSED_BY_ASK_USER_REPLY)).toBeVisible({ timeout: FORM_TIMEOUT })
    await expect(page.locator('wippy-form')).toHaveCount(0)

    // Without the ask_user_fields trait the agent is offered no tool for the
    // same form, so the fixture says so and makes no call.
    await sendChatMessage(page, 'ask me delivery')
    await expect(page.getByText(NO_FIELD_FORMS_REPLY, { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('wippy-form')).toHaveCount(0)

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })
})
