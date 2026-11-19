import type { Page } from '@playwright/test'
import type { PersistedMessage } from './attention'
import { expect } from '@playwright/test'

/**
 * The stored messages of a chat, read through the messages API (GET
 * /api/v1/sessions/messages) with the token the signed-in page keeps.
 */
export async function sessionMessages(page: Page, sessionId: string): Promise<PersistedMessage[]> {
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
    params: { cursor: '', limit: 100, session_id: sessionId },
  })
  expect(response.status()).toBe(200)
  const body = await response.json() as { messages?: PersistedMessage[] }
  return body.messages ?? []
}