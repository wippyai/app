import type { ConfirmRequest, HttpResponse, SubscribeFn, TileDeps, TileHttp } from './types.ts'

/**
 * The real network layer: the authenticated API client and `on()` of `@wippy-fe/proxy`.
 * The proxy loads on first use, so the rest of the helper imports in Node without a Host.
 */

async function client() {
  const { api } = await import('@wippy-fe/proxy')
  return api
}

/** The authenticated client answers any HTTP status without throwing. Only a network failure throws. */
export const defaultHttp: TileHttp = {
  async get(url: string): Promise<HttpResponse> {
    const api = await client()
    const res = await api.get(url, { validateStatus: () => true })
    return { status: res.status, data: res.data as unknown }
  },
  async post(url: string, body: unknown): Promise<HttpResponse> {
    const api = await client()
    const res = await api.post(url, body, { validateStatus: () => true })
    return { status: res.status, data: res.data as unknown }
  },
}

/** `on(topic, callback)` returns the unsubscribe function. It may arrive after the caller already unsubscribed. */
export const defaultSubscribe: SubscribeFn = (topic, callback) => {
  let cancelled = false
  let off: (() => void) | null = null
  void import('@wippy-fe/proxy').then(({ on }) => {
    if (cancelled)
      return
    off = on(topic, () => callback())
  })
  return () => {
    cancelled = true
    off?.()
    off = null
  }
}

export function randomUuid(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function')
    return c.randomUUID()
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0F) | 0x40
  bytes[8] = (bytes[8] & 0x3F) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function pageIsVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

export function createDefaultDeps(confirm: (request: ConfirmRequest) => Promise<boolean>): TileDeps {
  return {
    http: defaultHttp,
    subscribe: defaultSubscribe,
    confirm,
    uuid: randomUuid,
    isVisible: pageIsVisible,
  }
}
