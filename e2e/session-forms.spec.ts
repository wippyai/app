import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin, pageIframeSelector } from './helpers/login'

/**
 * E2E coverage for Session Forms V1 (EE2-2461), through the facade login
 * flow (see e2e/README.md and helpers/login.ts's `loginAsAdmin`).
 *
 * Drives the "Session Forms Fixture" agent (`app.session_forms_demo:fixture_agent`,
 * the SECOND card on the "Session Forms Demo" page) — a deterministic, fully
 * offline dev fixture (src/app/session_forms_demo/generate.lua). The real-model
 * "Forms demo" agent (first card) is never used here.
 *
 * Navigation note — "Session Forms Demo" (view.page `app.views:session-forms-demo`,
 * `mountRoute: /session-forms-demo/:part(.*)*`) has no sidebar entry anywhere
 * (the current build boots with its sidebar closed — see
 * `helpers/login.ts`'s `navigateHostTo` doc comment), so it's reached by
 * navigating the top-level URL directly to `/session-forms-demo`, same as
 * the sibling "Iframe Demo" page's `/demo`:
 *  - The Host runs as the TOP-LEVEL document directly, with no outer host
 *    iframe (see `helpers/login.ts`'s `getHostFrame`). Only child
 *    pages/artifacts get their own nested (srcdoc) iframe.
 *  - That page's own content renders in a nested srcdoc iframe named
 *    `wippy:page:app.views:session-forms-demo` (`pageIframeSelector`).
 *  - Clicking "Start chat" there calls `host.startChat(token, { sidebar: false })`,
 *    which navigates the TOP-level app to `/chat/:id`, replacing the demo
 *    page's iframe with the Host's own chat UI directly in the top document
 *    — so the rest of each test drives `page` directly, no frameLocator.
 *  - `<wippy-form>` is a web component mounted straight into the Host's DOM
 *    (web-component-package-loader.vue's imperative `document.createElement`
 *    path, not a nested <w-artifact> iframe), with an OPEN shadow root
 *    (@wippy-fe/webcomponent-core's base-element.ts defaults to
 *    `shadowMode: 'open'`). Playwright locators pierce open shadow roots
 *    automatically, so no special shadow-DOM handling is needed.
 *  - The question card reflects its own state onto the <wippy-form> HOST
 *    element as a `card-state` attribute ("loading" | "active" | "review" |
 *    "answered" | "unsupported" — use-host-reflection.ts), which is a far
 *    more stable wait condition than any timing or text content.
 *  - A single-question form (the fixture's "Delivery preference" form)
 *    submits directly on option click — no separate "Send answers" step
 *    (that only applies to the multi-question "ask me many" form, not used
 *    here).
 *  - The raw `<wippy-form-answers>` record tag embedded in the user's chat
 *    message is a hidden, zero-height custom element; the only visible text
 *    for the answer is the form's `answered_message`.
 */

const DEMO_PAGE_IFRAME_SELECTOR = pageIframeSelector('app.views:session-forms-demo')
const FIXTURE_REGISTRY_ID = 'app.session_forms_demo:fixture_agent'
const CHAT_INPUT_PLACEHOLDER = 'Type a message'

const DELIVERY_OPTION_1 = 'Courier'
const DELIVERY_OPTION_2 = 'Pickup point'
const ANSWERED_MESSAGE = 'Answered a question about delivery.'
const PROPOSE_ACTION_REPLY = 'I plan to book a courier pickup. I will only do it after you confirm.'
const LATE_ANSWER_REPLY = 'This answer arrived after the conversation moved on. Please confirm again before I act on it.'

/**
 * Logs in, opens the "Session Forms Demo" page by its own top-level route,
 * and starts a brand-new chat with the Session Forms Fixture agent (the
 * second of four cards — see
 * frontend/applications/session-forms-demo/src/app/app.vue's AGENTS list).
 * After this resolves, `page` itself shows the chat (the demo page's own
 * iframe is gone — the Host swapped its top-level route to `/chat/:id`).
 */
async function openFixtureChat(page: Page) {
  await loginAsAdmin(page)
  await page.goto('/session-forms-demo')

  const demoFrame = page.frameLocator(DEMO_PAGE_IFRAME_SELECTOR)
  // Filtered by the registry id (unique, unambiguous substring across all
  // four cards) rather than the title text alone — "Session Forms Fixture"
  // is also a substring-adjacent risk next to "Session Forms Steering
  // Fixture" / "Session Forms Plain Fixture" if the markup ever reflows.
  const fixtureCard = demoFrame.locator('.rounded-lg').filter({ hasText: FIXTURE_REGISTRY_ID })
  await expect(fixtureCard).toHaveCount(1, { timeout: 15_000 })
  await fixtureCard.getByRole('button', { name: /start chat/i }).click()

  await expect(page.getByPlaceholder(CHAT_INPUT_PLACEHOLDER)).toBeVisible({ timeout: 15_000 })
}

async function sendChatMessage(page: Page, text: string) {
  const chatInput = page.getByPlaceholder(CHAT_INPUT_PLACEHOLDER)
  await chatInput.fill(text)
  await chatInput.press('Enter')
}

test.describe('Session Forms Fixture (EE2-2461)', () => {
  test('ask me -> pick an option -> answered, and it stays answered after reload', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error')
        consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(e.message))

    await openFixtureChat(page)
    // loginAsAdmin's own pre-auth noise (facade boot with no token yet) is
    // over by the time the chat is visible; judge only from here on.
    consoleErrors.length = 0

    await sendChatMessage(page, 'ask me')

    const formCard = page.locator('wippy-form')
    // First form in a fresh session: tool-call round trip + artifact
    // creation + component-tag load, observed up to ~6s in prior runs.
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })
    await formCard.getByRole('radio', { name: DELIVERY_OPTION_1 }).click()

    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })

    // Exactly one visible user message for the answer — the raw
    // <wippy-form-answers> record is a hidden, zero-height tag, never a
    // second visible line.
    await expect(page.getByText(ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(`Thanks, noted: ${DELIVERY_OPTION_1}.`, { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.reload()

    await expect(page.locator('wippy-form')).toHaveAttribute('card-state', 'answered', { timeout: 15_000 })
    await expect(page.getByText(ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(`Thanks, noted: ${DELIVERY_OPTION_1}.`, { exact: true })).toBeVisible()

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })

  test('ask me -> propose action -> answering the stale form gets the late-answer reply', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error')
        consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(e.message))

    await openFixtureChat(page)
    consoleErrors.length = 0

    await sendChatMessage(page, 'ask me')
    const formCard = page.locator('wippy-form')
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })

    await sendChatMessage(page, 'propose action')
    await expect(page.getByText(PROPOSE_ACTION_REPLY, { exact: true })).toBeVisible({ timeout: 10_000 })

    // Answer the now-stale form: the fixture's dedicated late-answer branch
    // (generate.lua: parsed.late -> LATE_ANSWER_TEXT), distinct from the
    // ordinary "Thanks, noted: ..." reply in the first test.
    await formCard.getByRole('radio', { name: DELIVERY_OPTION_2 }).click()
    await expect(formCard).toHaveAttribute('card-state', 'answered', { timeout: 10_000 })
    await expect(page.getByText(ANSWERED_MESSAGE, { exact: true })).toHaveCount(1)
    await expect(page.getByText(LATE_ANSWER_REPLY, { exact: true })).toBeVisible({ timeout: 10_000 })

    expect(consoleErrors, `console errors: ${consoleErrors.slice(0, 8).join(' | ')}`).toEqual([])
  })
})

/*
 * Standard fields (EE2-2462): the fixture's "ask me delivery" and "ask me
 * preferences" forms (see generate.lua's ASK_USER_DELIVERY_ARGUMENTS and
 * ASK_USER_PREFERENCES_ARGUMENTS).
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

/**
 * Resolves once nothing inside `locator` has changed in the DOM (nodes or
 * attributes) for `quietFrames` animation frames in a row, which is the sign
 * that a component has finished the renders it queued.
 */
async function waitForQuietDom(locator: Locator, quietFrames = 4) {
  await locator.evaluate((element, frames) => new Promise<void>((resolve) => {
    let quiet = 0
    const observer = new MutationObserver(() => {
      quiet = 0
    })
    observer.observe(element, { subtree: true, childList: true, attributes: true })
    const onFrame = () => {
      quiet += 1
      if (quiet >= frames) {
        observer.disconnect()
        resolve()
      }
      else {
        requestAnimationFrame(onFrame)
      }
    }
    requestAnimationFrame(onFrame)
  }), quietFrames)
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

test.describe('Session Forms V2 standard fields (EE2-2462)', () => {
  test('ask me delivery -> an invalid email blocks submit -> the corrected details are saved exactly and survive a reload', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error')
        consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(e.message))
    const answerSubmissions = watchAnswerSubmissions(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    await sendChatMessage(page, 'ask me delivery')

    const formCard = page.locator('wippy-form')
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })
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
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error')
        consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(e.message))
    const answerSubmissions = watchAnswerSubmissions(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    await sendChatMessage(page, 'ask me delivery')

    const formCard = page.locator('wippy-form')
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })

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
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error')
        consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(e.message))
    const answerSubmissions = watchAnswerSubmissions(page)

    await openFixtureChat(page)
    consoleErrors.length = 0

    await sendChatMessage(page, 'ask me delivery')

    const formCard = page.locator('wippy-form')
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })

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
    await sendChatMessage(page, 'ask me delivery')

    const formCard = page.locator('wippy-form')
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })
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
    await sendChatMessage(page, 'ask me delivery')

    const formCard = page.locator('wippy-form')
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })
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
    // The picker re-renders and re-focuses cells for a moment after focus
    // enters the days. An Enter that lands in that window can lose the focus
    // the picker hands back to the box, so wait for the panel to go quiet.
    await waitForQuietDom(calendar)
    const entryDay = (await focusedDay.innerText()).trim()
    await page.keyboard.press('ArrowRight')
    // `.not.toHaveText` would pass while focus is between two days, so poll for the new day.
    await expect.poll(async () => (await focusedDay.innerText().catch(() => entryDay)).trim()).not.toBe(entryDay)
    const pickedDay = (await focusedDay.innerText()).trim()
    await page.keyboard.press('Enter')
    await expect(deliveryDate).toHaveValue(`2026-06-${pickedDay.padStart(2, '0')}`)
    await expect(calendar).toBeHidden()
    await expect(deliveryDate).toBeFocused()

    // Escape closes it and keeps what the box holds.
    const keyboardPick = await deliveryDate.inputValue()
    await deliveryDate.press('ArrowDown')
    await expect(calendar).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(calendar).toBeHidden()
    await expect(deliveryDate).toHaveValue(keyboardPick)

    // The calendar's own colours follow the form's forced theme (it opens in the
    // theme plugin's overlay layer, outside the themed container, so it needs
    // the container's class to read in the Dark theme).
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
      await expect(calendar).toHaveClass(new RegExp(`w-theme-${mode}`))
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
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error')
        consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(e.message))

    await openFixtureChat(page)
    consoleErrors.length = 0

    await sendChatMessage(page, 'ask me preferences')

    const formCard = page.locator('wippy-form')
    await expect(formCard).toHaveAttribute('card-state', 'active', { timeout: 15_000 })
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
