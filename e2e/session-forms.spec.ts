import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin, pageIframeSelector } from './helpers/login'

/**
 * E2E coverage for Session Forms V1 (EE2-2461), through the facade login
 * flow (see e2e/README.md and helpers/login.ts's `loginAsAdmin`).
 *
 * Drives the "Session Forms Fixture" agent (`app.session_forms_demo:fixture_agent`,
 * the SECOND card on the "Session Forms Demo" page) — a deterministic, fully
 * offline dev fixture (src/app/session_forms_demo/generate.lua). The real-model
 * "Forms demo" agent (first card) is never used here. The fixture agents exist
 * only when the app runs with the `session-forms-fixtures` profile
 * (SESSION_FORMS_DEV_FIXTURES=true with `make run-dev`; see e2e/README.md).
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
