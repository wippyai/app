import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregateStatus, createTileController } from './controller.ts'
import { parseTileAttributes } from './attrs.ts'
import type { HttpResponse, InputState, RenderStateDetail, TileDeps, TileHttp } from './types.ts'

const tick = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function ready(data: unknown = { text: 'hello' }, extra: Record<string, unknown> = {}): HttpResponse {
  return { status: 200, data: { state: 'ready', data, computed_at: '2026-11-09T12:00:00Z', source_title: 'Notes', ...extra } }
}

function setup(opts: {
  get?: Array<HttpResponse | Error>
  post?: Array<HttpResponse | Error>
  confirm?: (a: string, message?: string) => boolean
  sources?: Record<string, unknown>
  actions?: Record<string, unknown>
} = {}) {
  const getQueue = [...(opts.get ?? [])]
  const postQueue = [...(opts.post ?? [])]
  const urls: string[] = []
  const posts: Array<{ url: string, body: { args: unknown, idempotency_key: string } }> = []
  const emitted: Array<{ name: string, detail: Record<string, unknown> }> = []
  let uuidCounter = 0
  const http: TileHttp = {
    get: (url) => {
      urls.push(url)
      const next = getQueue.shift()
      if (!next)
        return Promise.reject(new Error('no response'))
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    },
    post: (url, body) => {
      posts.push({ url, body: body as { args: unknown, idempotency_key: string } })
      const next = postQueue.shift()
      if (!next)
        return Promise.reject(new Error('no response'))
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    },
  }
  const deps: TileDeps = {
    http,
    subscribe: () => () => {},
    confirm: async request => (opts.confirm ? opts.confirm(request.action, request.message) : true),
    uuid: () => `uuid-${++uuidCounter}`,
    isVisible: () => true,
  }
  const config = parseTileAttributes({
    'tile-id': 't',
    'request-id': 'r1:t',
    'data-sources': opts.sources ?? { main: { url: '/pts/main', args: {}, refresh_ms: null, live_topic: null } },
    'actions': opts.actions ?? {},
  })
  const controller = createTileController(config, deps, (name, detail) => emitted.push({ name, detail: detail as Record<string, unknown> }), () => {})
  const states = () => emitted.filter(e => e.name === 'render-state').map(e => e.detail as unknown as RenderStateDetail)
  return { controller, urls, posts, emitted, states }
}

describe('render-state reporting', () => {
  it('ends the first read in one ready state with the details', async () => {
    const { controller, states } = setup({ get: [ready({ text: 'hi' }, { data_as_of: '2026-11-09T00:00:00Z', completeness: 'complete' })] })
    controller.start()
    await tick()
    expect(states()).toEqual([{
      request_id: 'r1:t',
      status: 'ready',
      computed_at: '2026-11-09T12:00:00Z',
      data_as_of: '2026-11-09T00:00:00Z',
      source_title: 'Notes',
      completeness: 'complete',
    }])
    controller.dispose()
  })

  it('reports error for HTTP 500 and denied for HTTP 403, never ready', async () => {
    const a = setup({ get: [{ status: 500, data: null }] })
    a.controller.start()
    await tick()
    expect(a.states().map(s => s.status)).toEqual(['error'])
    expect(a.states()[0].error?.code).toBe('source_error')
    expect(a.states()[0].error?.input).toBe('main')

    const b = setup({ get: [{ status: 403, data: { state: 'denied', error: { code: 'denied', message: 'No.' } } }] })
    b.controller.start()
    await tick()
    expect(b.states().map(s => s.status)).toEqual(['denied'])
    expect(a.controller.snapshot().inputs.main.data).toBeNull()
    a.controller.dispose()
    b.controller.dispose()
  })

  it('reports computing first, then one terminal state', async () => {
    const { controller, states, urls } = setup({
      get: [
        { status: 200, data: { state: 'computing', operation: 'op', retry_after_ms: 300 } },
        ready(),
      ],
    })
    controller.start()
    await tick()
    expect(states().map(s => s.status)).toEqual(['computing'])
    await vi.advanceTimersByTimeAsync(300)
    expect(states().map(s => s.status)).toEqual(['computing', 'ready'])
    expect(urls[1]).toContain('operation=op')
    controller.dispose()
  })

  it('reports empty', async () => {
    const { controller, states } = setup({ get: [{ status: 200, data: { state: 'empty', computed_at: '2026-11-09T12:00:00Z' } }] })
    controller.start()
    await tick()
    expect(states().map(s => s.status)).toEqual(['empty'])
    controller.dispose()
  })

  it('reports later reads again, with stale on a failed refresh', async () => {
    const { controller, states } = setup({ get: [ready({ text: 'a' }), ready({ text: 'b' }, { computed_at: '2026-11-09T12:05:00Z' }), { status: 500, data: null }] })
    controller.start()
    await tick()
    controller.refresh()
    await tick()
    controller.refresh()
    await tick()
    const all = states()
    expect(all.map(s => s.status)).toEqual(['ready', 'ready', 'error'])
    expect(all[1].computed_at).toBe('2026-11-09T12:05:00Z')
    expect(all[2].stale).toBe(true)
    controller.dispose()
  })

  it('does not repeat an identical state', async () => {
    const { controller, states } = setup({ get: [ready(), ready()] })
    controller.start()
    await tick()
    controller.refresh()
    await tick()
    expect(states()).toHaveLength(1)
    controller.dispose()
  })

  it('waits for every input before the first terminal state', async () => {
    const sources = {
      a: { url: '/pts/a', args: {} },
      b: { url: '/pts/b', args: {} },
    }
    const { controller, states } = setup({ sources, get: [ready({ text: 'a' }), { status: 403, data: null }] })
    controller.start()
    await tick()
    expect(states().map(s => s.status)).toEqual(['denied'])
    controller.dispose()
  })

  it('reports ready at once for a tile without inputs', () => {
    const { controller, states } = setup({ sources: {} })
    controller.start()
    expect(states().map(s => s.status)).toEqual(['ready'])
    controller.dispose()
  })

  it('turns a ready value that fails validation into one error, never ready', async () => {
    const emitted: RenderStateDetail[] = []
    const config = parseTileAttributes({ 'request-id': 'r1:t', 'data-sources': { main: { url: '/u' } } })
    const checked = createTileController(
      config,
      {
        http: { get: () => Promise.resolve(ready({ other: 1 })), post: () => Promise.reject(new Error('unused')) },
        subscribe: () => () => {},
        confirm: () => Promise.resolve(true),
        uuid: () => 'u',
        isVisible: () => true,
      },
      (_n, detail) => emitted.push(detail as RenderStateDetail),
      () => {},
      { main: data => ((data as Record<string, unknown>).text === undefined ? { code: 'format_mismatch', message: 'No text.', field: 'text' } : null) },
    )
    checked.start()
    await tick()
    expect(emitted).toHaveLength(1)
    expect(emitted[0].status).toBe('error')
    expect(emitted[0].error).toEqual({ code: 'format_mismatch', message: 'No text.', field: 'text', input: 'main' })
    expect(checked.snapshot().inputs.main.data).toBeNull()
    checked.dispose()
  })

  it('stops reporting after dispose', async () => {
    const { controller, states } = setup({ get: [ready()] })
    controller.start()
    controller.dispose()
    await tick()
    expect(states()).toHaveLength(0)
  })
})

describe('aggregateStatus', () => {
  const input = (status: InputState['status'], settled = true): InputState => ({
    name: 'x', status, data: null, stale: false, error: null, computedAt: null, dataAsOf: null, sourceTitle: null, completeness: null, settled,
  })

  it('waits while any input is unsettled', () => {
    expect(aggregateStatus([input('ready'), input('loading', false)])).toBe('loading')
    expect(aggregateStatus([input('ready'), input('computing', false)])).toBe('computing')
  })

  it('ranks denied over error over empty over ready', () => {
    expect(aggregateStatus([input('ready'), input('empty'), input('error'), input('denied')])).toBe('denied')
    expect(aggregateStatus([input('ready'), input('empty'), input('error')])).toBe('error')
    expect(aggregateStatus([input('ready'), input('empty')])).toBe('empty')
    expect(aggregateStatus([input('ready')])).toBe('ready')
  })
})

describe('tile events', () => {
  it('emits tile-event with request_id, name and detail', () => {
    const { controller, emitted } = setup()
    controller.emitTileEvent('change', { value: 'x' })
    expect(emitted).toEqual([{ name: 'tile-event', detail: { request_id: 'r1:t', name: 'change', detail: { value: 'x' } } }])
  })
})

describe('actions', () => {
  const actions = { set_status: { url: '/acts/set_status', confirm: true }, plain: { url: '/acts/plain', confirm: false } }
  const done: HttpResponse = { status: 200, data: { state: 'done' } }

  it('posts args with a new idempotency key and emits action-done', async () => {
    const { controller, posts, emitted } = setup({ actions, post: [done] })
    const result = await controller.runAction('plain', { user_id: 'u1' })
    expect(posts).toEqual([{ url: '/acts/plain', body: { args: { user_id: 'u1' }, idempotency_key: 'uuid-1' } }])
    expect(result.status).toBe('done')
    expect(emitted).toEqual([{ name: 'tile-event', detail: { request_id: 'r1:t', name: 'action-done', detail: { action: 'plain', status: 'done' } } }])
  })

  it('asks first when confirm is true, and runs nothing after a refusal', async () => {
    const { controller, posts, emitted } = setup({ actions, post: [done], confirm: () => false })
    const result = await controller.runAction('set_status', { user_id: 'u1' })
    expect(result.status).toBe('cancelled')
    expect(posts).toHaveLength(0)
    expect(emitted).toHaveLength(0)
  })

  it('passes the question of the call to the confirmation', async () => {
    const messages: Array<string | undefined> = []
    const { controller } = setup({ actions, post: [done, done], confirm: (_a, message) => { messages.push(message); return true } })
    await controller.runAction('set_status', { user_id: 'u1' }, { confirmMessage: 'Disable Test Target?' })
    await controller.runAction('set_status', { user_id: 'u1' })
    expect(messages).toEqual(['Disable Test Target?', undefined])
  })

  it('runs after a confirmation', async () => {
    const seen: string[] = []
    const { controller, posts } = setup({ actions, post: [done], confirm: (a) => { seen.push(a); return true } })
    await controller.runAction('set_status', { user_id: 'u1' })
    expect(seen).toEqual(['set_status'])
    expect(posts).toHaveLength(1)
  })

  it('keeps the key when the same call is retried after an unknown outcome', async () => {
    const { controller, posts } = setup({ actions, post: [new Error('offline'), { status: 502, data: null }, done, done] })
    const first = await controller.runAction('plain', { a: 1 })
    expect(first.status).toBe('unknown')
    const second = await controller.runAction('plain', { a: 1 })
    expect(second.status).toBe('unknown')
    const third = await controller.runAction('plain', { a: 1 })
    expect(third.status).toBe('done')
    expect(posts.map(p => p.body.idempotency_key)).toEqual(['uuid-1', 'uuid-1', 'uuid-1'])
    // After a definite answer the next call is a new call.
    await controller.runAction('plain', { a: 1 })
    expect(posts[3].body.idempotency_key).toBe('uuid-2')
  })

  it('gives overlapping calls with the same args their own keys', async () => {
    const { controller, posts } = setup({ actions, post: [done, done] })
    await Promise.all([controller.runAction('plain', { a: 1 }), controller.runAction('plain', { a: 1 })])
    expect(posts.map(p => p.body.idempotency_key)).toEqual(['uuid-1', 'uuid-2'])
  })

  it('uses a new key for other args after an unknown outcome', async () => {
    const { controller, posts } = setup({ actions, post: [new Error('offline'), done] })
    await controller.runAction('plain', { a: 1 })
    await controller.runAction('plain', { a: 2 })
    expect(posts.map(p => p.body.idempotency_key)).toEqual(['uuid-1', 'uuid-2'])
  })

  it('maps 403 to denied and a failed envelope to failed, each with a definite answer', async () => {
    const { controller, posts } = setup({
      actions,
      post: [
        { status: 403, data: { state: 'denied', error: { code: 'dash.users.set_status', message: 'No.' } } },
        { status: 200, data: { state: 'failed', error: { code: 'self_target', message: 'Not yourself.' } } },
      ],
    })
    const denied = await controller.runAction('plain', {})
    const failed = await controller.runAction('plain', {})
    expect(denied.status).toBe('denied')
    expect(failed.status).toBe('failed')
    expect(failed.error?.code).toBe('self_target')
    expect(posts.map(p => p.body.idempotency_key)).toEqual(['uuid-1', 'uuid-2'])
  })

  it('refuses an undeclared action without a request', async () => {
    const { controller, posts } = setup({ actions })
    const result = await controller.runAction('nope', {})
    expect(result.status).toBe('failed')
    expect(result.error?.code).toBe('undeclared')
    expect(posts).toHaveLength(0)
  })
})
