import type { Ref } from 'vue'
import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import type { PageInfo } from './types'

/** wippy/views: the announced pages the caller may view. */
export const PAGES_LIST_URL = '/api/public/pages/list'
/**
 * The content-free WebSocket topic that says the page list changed. The Web
 * Host's built-in nav listens for it too.
 */
export const PAGES_TOPIC = 'pages'
/** Proxy event after the WebSocket reconnects; signals may have been missed. */
export const RECONNECT_TOPIC = '@reconnect'
/** The default waits between new tries while the first read keeps failing. */
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 10000]

export interface PageListDeps {
  /** The host's authenticated axios instance, or anything with the same `get`. */
  api: { get: (url: string) => Promise<{ data: unknown }> }
  /** Subscribes to a topic and returns the unsubscribe, like `on` from `@wippy-fe/proxy`. */
  on: (topic: string, callback: () => void) => () => void
  /** Signals that arrive closer together than this cause one read. Default 150 ms. */
  debounceMs?: number
  /**
   * Waits between new tries while the first read keeps failing, for example a
   * short outage at start. Default 1, 3 and 10 seconds; then it waits for a signal.
   */
  retryDelaysMs?: readonly number[]
}

export interface PageList {
  pages: Readonly<Ref<readonly PageInfo[]>>
  /** True after the first successful read. */
  ready: Readonly<Ref<boolean>>
  /** The error of the last read, or null after a successful one. */
  error: Readonly<Ref<unknown>>
  /**
   * True while the first read and all its tries have failed. A `pages` signal
   * or a reconnect can still bring the list later; a success clears it.
   */
  gaveUp: Readonly<Ref<boolean>>
  /** Reads the list now. A call during a read queues exactly one more read. */
  refresh: () => Promise<void>
  /** Stops listening. Reads that are under way no longer change the list. */
  dispose: () => void
}

function isPage(value: unknown): value is PageInfo {
  if (!value || typeof value !== 'object')
    return false
  const page = value as Record<string, unknown>
  return typeof page.id === 'string' && page.id !== '' && typeof page.title === 'string'
}

/** The `pages` array of a list response. Malformed items are dropped. */
export function parsePages(data: unknown): PageInfo[] {
  const pages = data && typeof data === 'object' ? (data as { pages?: unknown }).pages : undefined
  if (!Array.isArray(pages))
    throw new Error('The page list response has no pages array')
  return pages.filter(isPage)
}

/**
 * A live copy of the viewer's page list. It reads the list once, then again
 * after every `pages` signal and every WebSocket reconnect. Because each read
 * uses the viewer's own token, the server's access check decides what the
 * viewer sees, and the signal itself carries nothing.
 */
export function createPageList(deps: PageListDeps): PageList {
  const debounceMs = deps.debounceMs ?? 150
  const retryDelays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const pages = shallowRef<readonly PageInfo[]>([])
  const ready = ref(false)
  const error = shallowRef<unknown>(null)
  const gaveUp = ref(false)
  let running: Promise<void> | null = null
  let readAgain = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retries = 0
  let disposed = false

  // While the first read keeps failing, try again a few times on its own.
  function retryLater(): void {
    if (disposed || ready.value || retryTimer)
      return
    if (retries >= retryDelays.length) {
      gaveUp.value = true
      return
    }
    retryTimer = setTimeout(() => {
      retryTimer = null
      void refresh()
    }, retryDelays[retries++])
  }

  async function readOnce(): Promise<void> {
    try {
      const { data } = await deps.api.get(PAGES_LIST_URL)
      if (disposed)
        return
      pages.value = parsePages(data)
      error.value = null
      ready.value = true
      gaveUp.value = false
    }
    catch (err) {
      if (disposed)
        return
      error.value = err
      retryLater()
    }
  }

  function refresh(): Promise<void> {
    if (disposed)
      return Promise.resolve()
    if (running) {
      readAgain = true
      return running
    }
    running = (async () => {
      try {
        do {
          readAgain = false
          await readOnce()
        } while (readAgain && !disposed)
      }
      finally {
        // Cleared in the same step that ends the loop, so a refresh that comes
        // right after it starts a new read instead of joining a finished one.
        running = null
      }
    })()
    return running
  }

  function onSignal(): void {
    if (disposed)
      return
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void refresh()
    }, debounceMs)
  }

  const unsubscribes = [deps.on(PAGES_TOPIC, onSignal), deps.on(RECONNECT_TOPIC, onSignal)]
  void refresh()

  function dispose(): void {
    if (disposed)
      return
    disposed = true
    if (timer)
      clearTimeout(timer)
    if (retryTimer)
      clearTimeout(retryTimer)
    for (const unsubscribe of unsubscribes)
      unsubscribe()
  }

  return { pages, ready, error, gaveUp, refresh, dispose }
}

/** `createPageList` that disposes itself with the current effect scope, such as a component. */
export function usePageList(deps: PageListDeps): PageList {
  const list = createPageList(deps)
  if (getCurrentScope())
    onScopeDispose(list.dispose)
  return list
}
