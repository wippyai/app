import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useTile, usableData } from './use-tile.ts'
import type { HttpResponse, InputState, TileDeps } from './types.ts'

const tick = async () => {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function ready(text: string): HttpResponse {
  return { status: 200, data: { state: 'ready', data: { text }, computed_at: '2026-11-09T12:00:00Z' } }
}

function mount(responses: HttpResponse[]) {
  const urls: string[] = []
  const emitted: Array<{ name: string, detail: Record<string, unknown> }> = []
  const deps: Partial<TileDeps> = {
    http: {
      get: (url) => {
        urls.push(url)
        const next = responses.shift()
        return next ? Promise.resolve(next) : Promise.reject(new Error('offline'))
      },
      post: () => Promise.reject(new Error('unused')),
    },
  }
  const props = ref<Record<string, unknown>>({})
  const scope = effectScope()
  const tile = scope.run(() => useTile({
    props,
    emit: (name, detail) => emitted.push({ name, detail: detail as Record<string, unknown> }),
    deps,
  })) as ReturnType<typeof useTile>
  return { tile, props, urls, emitted, scope }
}

describe('useTile', () => {
  it('does nothing until request-id is set, then reads and reports ready', async () => {
    const { tile, props, urls, emitted } = mount([ready('hello')])
    props.value = { tileId: 't', dataSources: { main: { url: '/u', args: {} } } }
    await tick()
    expect(urls).toHaveLength(0)
    expect(emitted).toHaveLength(0)
    props.value = { ...props.value, requestId: 'r1:t' }
    await tick()
    expect(urls).toHaveLength(1)
    expect(tile.status.value).toBe('ready')
    expect(tile.data('main')).toEqual({ text: 'hello' })
    expect(emitted.map(e => e.detail.status)).toEqual(['ready'])
  })

  it('starts again on a new request-id and drops the old value', async () => {
    const { tile, props, urls, emitted } = mount([ready('one')])
    props.value = { tileId: 't', requestId: 'r1:t', dataSources: { main: { url: '/u', args: { a: 1 } } } }
    await tick()
    expect(tile.data('main')).toEqual({ text: 'one' })
    props.value = { ...props.value, requestId: 'r2:t', dataSources: { main: { url: '/u', args: { a: 2 } } } }
    await tick()
    // The second read fails (no response left): no stale value from the first request survives.
    expect(urls).toHaveLength(2)
    expect(tile.status.value).toBe('error')
    expect(tile.data('main')).toBeNull()
    expect(emitted.map(e => [e.detail.request_id, e.detail.status])).toEqual([['r1:t', 'ready'], ['r2:t', 'error']])
  })

  it('maps tile fields through the fields attribute', () => {
    const { tile, props } = mount([])
    props.value = { fields: { text: 'body' } }
    expect(tile.fieldName('text')).toBe('body')
    expect(tile.fieldName('other')).toBe('other')
  })

  it('stops reading when its scope stops', async () => {
    const { props, urls, scope } = mount([ready('a'), ready('b')])
    props.value = { requestId: 'r1:t', dataSources: { main: { url: '/u', args: {}, refresh_ms: 1000 } } }
    await tick()
    scope.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(urls).toHaveLength(1)
  })
})

describe('usableData', () => {
  const base: InputState = {
    name: 'main', status: 'ready', data: { text: 'x' }, stale: false, error: null,
    computedAt: null, dataAsOf: null, sourceTitle: null, completeness: null, settled: true,
  }

  it('returns data only for ready and computing', () => {
    expect(usableData(base)).toEqual({ text: 'x' })
    expect(usableData({ ...base, status: 'computing', stale: true })).toEqual({ text: 'x' })
    expect(usableData({ ...base, status: 'error' })).toBeNull()
    expect(usableData({ ...base, status: 'denied' })).toBeNull()
    expect(usableData({ ...base, status: 'empty' })).toBeNull()
    expect(usableData(undefined)).toBeNull()
  })
})
