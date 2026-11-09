import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIVE_JOIN_MS, classifyResponse, createInputReader } from './reader.ts'
import type { DataSource, HttpResponse, InputState, TileHttp } from './types.ts'

const SOURCE: DataSource = {
  url: '/api/v1/dashboards/pages/p/points/tokens',
  args: { model: 'm1' },
  refresh_ms: null,
  live_topic: null,
}

function ready(data: unknown = { text: 'hello' }, extra: Record<string, unknown> = {}): HttpResponse {
  return {
    status: 200,
    data: { point: 'tokens', state: 'ready', data, computed_at: '2026-11-09T12:00:00Z', source_title: 'Token use', ...extra },
  }
}

/** A fake transport. Each call returns a promise that the test settles by hand. */
function manualHttp() {
  const calls: Array<{ url: string, resolve: (r: HttpResponse) => void, reject: (e: Error) => void }> = []
  const http: TileHttp = {
    get: url => new Promise((resolve, reject) => { calls.push({ url, resolve, reject }) }),
    post: () => Promise.reject(new Error('unused')),
  }
  return { http, calls }
}

function scriptedHttp(responses: Array<HttpResponse | Error>) {
  const urls: string[] = []
  const http: TileHttp = {
    get: (url) => {
      urls.push(url)
      const next = responses.shift()
      if (!next)
        return Promise.reject(new Error('no more responses'))
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    },
    post: () => Promise.reject(new Error('unused')),
  }
  return { http, urls }
}

function deps(http: TileHttp, extra: { subscribe?: (topic: string, cb: () => void) => () => void, visible?: boolean } = {}) {
  return {
    http,
    subscribe: extra.subscribe ?? (() => () => {}),
    isVisible: () => extra.visible ?? true,
  }
}

function track() {
  const states: InputState[] = []
  return { states, onChange: (s: InputState) => states.push(s), last: () => states[states.length - 1] }
}

const tick = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('classifyResponse', () => {
  it('maps HTTP 403 to denied', () => {
    expect(classifyResponse({ status: 403, data: { state: 'denied', error: { code: 'denied', message: 'No.' } } }).kind).toBe('denied')
    expect(classifyResponse({ status: 403, data: null }).kind).toBe('denied')
  })

  it('maps HTTP 5xx, failed and malformed bodies to error', () => {
    expect(classifyResponse({ status: 500, data: 'oops' }).kind).toBe('error')
    expect(classifyResponse({ status: 503, data: { state: 'ready', data: {} } }).kind).toBe('error')
    expect(classifyResponse({ status: 200, data: { state: 'failed', error: { code: 'source_error', message: 'x' } } }).kind).toBe('error')
    expect(classifyResponse({ status: 200, data: 'not json' }).kind).toBe('error')
    expect(classifyResponse({ status: 200, data: { state: 'surprise' } }).kind).toBe('error')
  })

  it('never reports ready without data', () => {
    expect(classifyResponse({ status: 200, data: { state: 'ready' } }).kind).toBe('error')
    expect(classifyResponse({ status: 200, data: { state: 'ready', data: null } }).kind).toBe('error')
  })

  it('keeps a falsy but present value as ready', () => {
    expect(classifyResponse({ status: 200, data: { state: 'ready', data: 0 } }).kind).toBe('ready')
  })

  it('uses the error code of a 400 envelope', () => {
    const out = classifyResponse({ status: 400, data: { state: 'failed', error: { code: 'invalid_args', message: 'Bad.' } } })
    expect(out.kind).toBe('error')
    if (out.kind === 'error')
      expect(out.error.code).toBe('invalid_args')
  })

  it('uses the error code of a 404 body that has no envelope state', () => {
    const out = classifyResponse({ status: 404, data: { error: { code: 'not_found', message: 'Unknown page' } } })
    expect(out.kind).toBe('error')
    if (out.kind === 'error')
      expect(out.error.code).toBe('not_found')
  })
})

describe('input reader', () => {
  it('reads the url with args as one URL-encoded JSON value', async () => {
    const { http, urls } = scriptedHttp([ready()])
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    await tick()
    expect(urls).toEqual([`/api/v1/dashboards/pages/p/points/tokens?args=${encodeURIComponent('{"model":"m1"}')}`])
    expect(t.last().status).toBe('ready')
    expect(t.last().data).toEqual({ text: 'hello' })
    expect(t.last().sourceTitle).toBe('Token use')
    expect(t.last().computedAt).toBe('2026-11-09T12:00:00Z')
    reader.dispose()
  })

  it('goes to error on HTTP 500 and to denied on HTTP 403, and holds no value', async () => {
    for (const [res, expected] of [
      [{ status: 500, data: { error: { code: 'x' } } }, 'error'],
      [{ status: 403, data: { state: 'denied' } }, 'denied'],
    ] as const) {
      const { http } = scriptedHttp([res])
      const t = track()
      const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
      reader.start()
      await tick()
      expect(t.last().status).toBe(expected)
      expect(t.last().data).toBeNull()
      expect(t.last().settled).toBe(true)
      reader.dispose()
    }
  })

  it('goes to error on a network failure', async () => {
    const { http } = scriptedHttp([new Error('offline')])
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    await tick()
    expect(t.last().status).toBe('error')
    expect(t.last().error?.code).toBe('network_error')
    reader.dispose()
  })

  it('keeps the last value, marked stale, when a later read fails', async () => {
    const { http } = scriptedHttp([ready({ text: 'one' }), { status: 500, data: null }])
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    await tick()
    reader.read()
    await tick()
    expect(t.last().status).toBe('error')
    expect(t.last().stale).toBe(true)
    expect(t.last().data).toEqual({ text: 'one' })
    reader.dispose()
  })

  it('follows computing: waits retry_after_ms and sends the same args and the operation token', async () => {
    const { http, urls } = scriptedHttp([
      { status: 200, data: { state: 'computing', operation: 'tok 1/a', retry_after_ms: 2000 } },
      ready({ text: 'done' }),
    ])
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    await tick()
    expect(t.last().status).toBe('computing')
    expect(urls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(urls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(urls).toHaveLength(2)
    const args = `args=${encodeURIComponent('{"model":"m1"}')}`
    expect(urls[1]).toBe(`/api/v1/dashboards/pages/p/points/tokens?${args}&operation=${encodeURIComponent('tok 1/a')}`)
    expect(t.last().status).toBe('ready')
    expect(t.last().data).toEqual({ text: 'done' })
    expect(t.last().stale).toBe(false)
    reader.dispose()
  })

  it('shows a value carried by a computing result as stale', async () => {
    const { http } = scriptedHttp([
      { status: 200, data: { state: 'computing', operation: 't', retry_after_ms: 10, data: { text: 'old' } } },
    ])
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    await tick()
    expect(t.last().status).toBe('computing')
    expect(t.last().data).toEqual({ text: 'old' })
    expect(t.last().stale).toBe(true)
    reader.dispose()
  })

  it('starts one fresh read, without the token, when the operation expired', async () => {
    const expired = { status: 200, data: { state: 'failed', error: { code: 'expired', message: 'Gone.' } } }
    const { http, urls } = scriptedHttp([
      { status: 200, data: { state: 'computing', operation: 't1', retry_after_ms: 5 } },
      expired,
      ready({ text: 'fresh' }),
    ])
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    await vi.advanceTimersByTimeAsync(5)
    await tick()
    expect(urls).toHaveLength(3)
    expect(urls[2]).not.toContain('operation=')
    expect(t.last().status).toBe('ready')
    reader.dispose()
  })

  it('gives up after a second expired result', async () => {
    const expired = { status: 200, data: { state: 'failed', error: { code: 'expired', message: 'Gone.' } } }
    const { http, urls } = scriptedHttp([
      { status: 200, data: { state: 'computing', operation: 't1', retry_after_ms: 5 } },
      expired,
      { status: 200, data: { state: 'computing', operation: 't2', retry_after_ms: 5 } },
      expired,
    ])
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    await vi.advanceTimersByTimeAsync(5)
    await tick()
    await vi.advanceTimersByTimeAsync(5)
    await tick()
    expect(urls).toHaveLength(4)
    expect(t.last().status).toBe('error')
    expect(t.last().error?.code).toBe('expired')
    reader.dispose()
  })

  it('drops an older response that arrives after a newer one', async () => {
    const { http, calls } = manualHttp()
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start() // read 1
    reader.read() // read 2
    expect(calls).toHaveLength(2)
    calls[1].resolve(ready({ text: 'newer' }))
    await tick()
    expect(t.last().data).toEqual({ text: 'newer' })
    calls[0].resolve(ready({ text: 'older' }))
    await tick()
    expect(t.last().data).toEqual({ text: 'newer' })
    expect(t.states.every(s => (s.data as { text: string } | null)?.text !== 'older')).toBe(true)
    reader.dispose()
  })

  it('does not replace a newer value with an older error either', async () => {
    const { http, calls } = manualHttp()
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    reader.read()
    calls[1].resolve(ready({ text: 'newer' }))
    await tick()
    calls[0].resolve({ status: 500, data: null })
    await tick()
    expect(t.last().status).toBe('ready')
    reader.dispose()
  })

  it('applies responses in order when they arrive in order', async () => {
    const { http, calls } = manualHttp()
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    reader.read()
    calls[0].resolve(ready({ text: 'first' }))
    await tick()
    calls[1].resolve(ready({ text: 'second' }))
    await tick()
    expect(t.last().data).toEqual({ text: 'second' })
    reader.dispose()
  })

  it('ignores a response after dispose', async () => {
    const { http, calls } = manualHttp()
    const t = track()
    const reader = createInputReader('main', SOURCE, deps(http), t.onChange)
    reader.start()
    reader.dispose()
    calls[0].resolve(ready())
    await tick()
    expect(t.states).toHaveLength(0)
  })

  it('reports an error for a source without a url', () => {
    const { http, urls } = scriptedHttp([])
    const t = track()
    const reader = createInputReader('main', { ...SOURCE, url: '' }, deps(http), t.onChange)
    reader.start()
    expect(urls).toHaveLength(0)
    expect(t.last().status).toBe('error')
  })
})

describe('live signal', () => {
  function liveDeps(http: TileHttp) {
    const handlers: Array<() => void> = []
    const unsubscribed: string[] = []
    const subscribed: string[] = []
    return {
      handlers,
      unsubscribed,
      subscribed,
      deps: {
        http,
        isVisible: () => true,
        subscribe: (topic: string, cb: () => void) => {
          subscribed.push(topic)
          handlers.push(cb)
          return () => { unsubscribed.push(topic) }
        },
      },
    }
  }

  it('joins signals within 250 ms into one read and keeps the value during it', async () => {
    const { http, calls } = manualHttp()
    const live = liveDeps(http)
    const t = track()
    const reader = createInputReader('main', { ...SOURCE, live_topic: 'dash.users.changed' }, live.deps, t.onChange)
    reader.start()
    calls[0].resolve(ready({ text: 'one' }))
    await tick()
    expect(live.subscribed).toEqual(['dash.users.changed'])
    expect(calls).toHaveLength(1)

    live.handlers[0]()
    await vi.advanceTimersByTimeAsync(100)
    live.handlers[0]()
    await vi.advanceTimersByTimeAsync(100)
    live.handlers[0]()
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(LIVE_JOIN_MS - 200)
    expect(calls).toHaveLength(2)
    // During the read the tile keeps its last value and does not flash a loading state.
    expect(t.last().status).toBe('ready')
    expect(t.last().data).toEqual({ text: 'one' })
    calls[1].resolve(ready({ text: 'two' }))
    await tick()
    expect(t.last().data).toEqual({ text: 'two' })
    // A later signal starts a new window.
    live.handlers[0]()
    await vi.advanceTimersByTimeAsync(LIVE_JOIN_MS)
    expect(calls).toHaveLength(3)
    reader.dispose()
  })

  it('unsubscribes on dispose and cancels a pending joined read', async () => {
    const { http, calls } = manualHttp()
    const live = liveDeps(http)
    const reader = createInputReader('main', { ...SOURCE, live_topic: 't' }, live.deps, () => {})
    reader.start()
    calls[0].resolve(ready())
    await tick()
    live.handlers[0]()
    reader.dispose()
    expect(live.unsubscribed).toEqual(['t'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toHaveLength(1)
  })

  it('moves to the topic that a result names', async () => {
    const { http, calls } = manualHttp()
    const live = liveDeps(http)
    const reader = createInputReader('main', { ...SOURCE, live_topic: 'a' }, live.deps, () => {})
    reader.start()
    calls[0].resolve(ready({ text: 'x' }, { live_topic: 'b' }))
    await tick()
    expect(live.unsubscribed).toEqual(['a'])
    expect(live.subscribed).toEqual(['a', 'b'])
    reader.dispose()
    expect(live.unsubscribed).toEqual(['a', 'b'])
  })

  it('does not subscribe without a topic', async () => {
    const { http, calls } = manualHttp()
    const live = liveDeps(http)
    const reader = createInputReader('main', SOURCE, live.deps, () => {})
    reader.start()
    calls[0].resolve(ready())
    await tick()
    expect(live.subscribed).toEqual([])
    reader.dispose()
  })
})

describe('timed refresh', () => {
  it('reads again on the interval, and stops on dispose', async () => {
    const { http, urls } = scriptedHttp([ready(), ready(), ready()])
    const reader = createInputReader('main', { ...SOURCE, refresh_ms: 1000 }, deps(http), () => {})
    reader.start()
    await tick()
    expect(urls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(urls).toHaveLength(2)
    reader.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(urls).toHaveLength(2)
  })

  it('skips the read while the page is hidden', async () => {
    const { http, urls } = scriptedHttp([ready(), ready()])
    const reader = createInputReader('main', { ...SOURCE, refresh_ms: 1000 }, deps(http, { visible: false }), () => {})
    reader.start()
    await tick()
    await vi.advanceTimersByTimeAsync(3000)
    expect(urls).toHaveLength(1)
    reader.dispose()
  })
})
