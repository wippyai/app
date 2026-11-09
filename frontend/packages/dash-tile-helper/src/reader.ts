import { buildReadUrl } from './attrs.ts'
import type { DataSource, HttpResponse, InputState, TileDeps, TileError } from './types.ts'

/** Live signals that arrive within this many milliseconds become one read (contracts section 8). */
export const LIVE_JOIN_MS = 250
/** Used when a `computing` result names no valid `retry_after_ms`. */
export const DEFAULT_RETRY_MS = 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function initialInputState(name: string): InputState {
  return {
    name,
    status: 'loading',
    data: null,
    stale: false,
    error: null,
    computedAt: null,
    dataAsOf: null,
    sourceTitle: null,
    completeness: null,
    settled: false,
  }
}

/** What one response means, before it is applied. */
type Outcome =
  | { kind: 'ready' | 'empty', env: Record<string, unknown> }
  | { kind: 'computing', env: Record<string, unknown>, operation: string, retryAfterMs: number }
  | { kind: 'denied' | 'error', error: TileError, env: Record<string, unknown> | null }

function envelopeError(env: Record<string, unknown> | null, fallback: TileError): TileError {
  const raw = env?.error
  if (!isRecord(raw))
    return fallback
  const error: TileError = {
    code: str(raw.code) ?? fallback.code,
    message: str(raw.message) ?? fallback.message,
  }
  const input = str(raw.input)
  const field = str(raw.field)
  if (input)
    error.input = input
  if (field)
    error.field = field
  return error
}

function readEnvelope(data: unknown): Record<string, unknown> | null {
  return isRecord(data) && typeof data.state === 'string' ? data : null
}

/**
 * Decide what a response means (contracts sections 3 and 7). Never lets a zero, an empty value or a
 * malformed body pass as `ready`: 403 is `denied`, `failed`, 5xx and network failures are `error`.
 */
export function classifyResponse(res: HttpResponse): Outcome {
  const env = readEnvelope(res.data)
  const status = res.status
  if (status === 403) {
    return { kind: 'denied', env, error: envelopeError(env, { code: 'denied', message: 'You may not see this data.' }) }
  }
  if (status < 200 || status >= 300) {
    const fallback: TileError = status >= 500
      ? { code: 'source_error', message: 'The data could not be read.' }
      : { code: `http_${status}`, message: 'The data request was refused.' }
    // A 404 answers with `{ error }` and no envelope state, so read the error from the body itself.
    const body = env ?? (isRecord(res.data) ? res.data : null)
    return { kind: 'error', env, error: envelopeError(body, fallback) }
  }
  if (!env)
    return { kind: 'error', env, error: { code: 'invalid_response', message: 'The server sent an unreadable answer.' } }
  switch (env.state) {
    case 'ready':
      if (env.data === undefined || env.data === null)
        return { kind: 'error', env, error: { code: 'invalid_response', message: 'The server sent a ready result without data.' } }
      return { kind: 'ready', env }
    case 'empty':
      return { kind: 'empty', env }
    case 'computing': {
      const operation = str(env.operation)
      if (!operation)
        return { kind: 'error', env, error: { code: 'invalid_response', message: 'The server sent a computing result without an operation.' } }
      const wait = env.retry_after_ms
      const retryAfterMs = typeof wait === 'number' && Number.isFinite(wait) && wait >= 0 ? wait : DEFAULT_RETRY_MS
      return { kind: 'computing', env, operation, retryAfterMs }
    }
    case 'denied':
      return { kind: 'denied', env, error: envelopeError(env, { code: 'denied', message: 'You may not see this data.' }) }
    case 'failed':
      return { kind: 'error', env, error: envelopeError(env, { code: 'source_error', message: 'The data could not be read.' }) }
    default:
      return { kind: 'error', env, error: { code: 'invalid_response', message: 'The server sent an unknown state.' } }
  }
}

export interface InputReader {
  /** Subscribe to the live topic and make the first read. */
  start: () => void
  /** Make one more read now. Joins nothing; live signals use their own 250 ms join. */
  read: () => void
  dispose: () => void
  state: () => InputState
}

/**
 * Reads one input of a tile for one `request-id`.
 *
 * - Reads are numbered. A response older than the last one applied is dropped, so polling, live
 *   signals and follow-up reads cannot overwrite newer data.
 * - `computing`: wait `retry_after_ms`, then read again with the same args and the operation token.
 *   An `expired` failure of such a read starts one fresh read.
 * - The previous value stays during a read. A failed read keeps it too, marked stale.
 */
export function createInputReader(
  name: string,
  source: DataSource,
  deps: Pick<TileDeps, 'http' | 'subscribe' | 'isVisible'>,
  onChange: (state: InputState) => void,
): InputReader {
  let state = initialInputState(name)
  let disposed = false
  let counter = 0
  let applied = 0
  let expiredRetried = false
  let followTimer: ReturnType<typeof setTimeout> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let joinTimer: ReturnType<typeof setTimeout> | undefined
  let topic: string | null = null
  let unsubscribe: (() => void) | null = null
  let refreshMs: number | null = source.refresh_ms

  function publish(patch: Partial<InputState>) {
    state = { ...state, ...patch }
    onChange(state)
  }

  function clear(timer: ReturnType<typeof setTimeout> | undefined) {
    if (timer !== undefined)
      clearTimeout(timer)
  }

  function syncTopic(next: string | null) {
    if (next === topic)
      return
    unsubscribe?.()
    unsubscribe = null
    topic = next
    if (next)
      unsubscribe = deps.subscribe(next, onSignal)
  }

  function onSignal() {
    if (disposed || joinTimer !== undefined)
      return
    joinTimer = setTimeout(() => {
      joinTimer = undefined
      read()
    }, LIVE_JOIN_MS)
  }

  function scheduleRefresh() {
    clear(refreshTimer)
    refreshTimer = undefined
    const wait = refreshMs
    if (disposed || wait === null || wait <= 0)
      return
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      if (disposed)
        return
      if (deps.isVisible())
        read()
      else
        scheduleRefresh()
    }, wait)
  }

  /** The metadata of a result that carries data, kept for the footer. */
  function metaOf(env: Record<string, unknown>): Partial<InputState> {
    return {
      computedAt: str(env.computed_at),
      dataAsOf: str(env.data_as_of),
      sourceTitle: str(env.source_title),
      completeness: str(env.completeness),
    }
  }

  /** A result may replace the declared refresh interval and topic (spec section 4.3). */
  function adoptHints(env: Record<string, unknown>) {
    const nextRefresh = env.refresh_ms
    refreshMs = typeof nextRefresh === 'number' && nextRefresh > 0 ? nextRefresh : source.refresh_ms
    syncTopic(str(env.live_topic) ?? source.live_topic)
  }

  function settle(patch: Partial<InputState>) {
    publish({ ...patch, settled: true })
    scheduleRefresh()
  }

  function apply(outcome: Outcome, operation: string | undefined) {
    clear(followTimer)
    followTimer = undefined
    switch (outcome.kind) {
      case 'ready':
        adoptHints(outcome.env)
        settle({ status: 'ready', data: outcome.env.data, stale: false, error: null, ...metaOf(outcome.env) })
        return
      case 'empty':
        adoptHints(outcome.env)
        settle({ status: 'empty', data: null, stale: false, error: null, ...metaOf(outcome.env) })
        return
      case 'computing': {
        // The result may carry the last good value, which then shows as stale.
        const carried = outcome.env.data !== undefined && outcome.env.data !== null
        const data = carried ? outcome.env.data : state.data
        publish({ status: 'computing', data, stale: data !== null && data !== undefined, error: null, ...(carried ? metaOf(outcome.env) : {}) })
        followTimer = setTimeout(() => {
          followTimer = undefined
          if (!disposed)
            void fetchOnce(outcome.operation)
        }, outcome.retryAfterMs)
        return
      }
      case 'denied':
        settle({ status: 'denied', data: null, stale: false, error: outcome.error })
        return
      case 'error':
        // An expired token of a follow-up read starts one fresh read, and only one.
        if (outcome.error.code === 'expired' && operation !== undefined && !expiredRetried) {
          expiredRetried = true
          void fetchOnce(undefined)
          return
        }
        settle({ status: 'error', stale: state.data !== null && state.data !== undefined, error: outcome.error })
    }
  }

  async function fetchOnce(operation: string | undefined) {
    const seq = ++counter
    let outcome: Outcome
    try {
      const res = await deps.http.get(buildReadUrl(source.url, source.args, operation))
      outcome = classifyResponse(res)
    }
    catch {
      outcome = { kind: 'error', env: null, error: { code: 'network_error', message: 'The data could not be reached.' } }
    }
    if (disposed || seq < applied)
      return
    applied = seq
    apply(outcome, operation)
  }

  function read() {
    if (disposed)
      return
    clear(followTimer)
    followTimer = undefined
    expiredRetried = false
    void fetchOnce(undefined)
  }

  function start() {
    if (disposed)
      return
    if (!source.url) {
      publish({ status: 'error', error: { code: 'invalid_config', message: 'The data source has no URL.' }, settled: true })
      return
    }
    syncTopic(source.live_topic)
    read()
  }

  function dispose() {
    disposed = true
    clear(followTimer)
    clear(refreshTimer)
    clear(joinTimer)
    unsubscribe?.()
    unsubscribe = null
    topic = null
  }

  return { start, read, dispose, state: () => state }
}
