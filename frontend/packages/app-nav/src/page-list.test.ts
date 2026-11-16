import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { PAGES_LIST_URL, PAGES_TOPIC, RECONNECT_TOPIC, createPageList, parsePages, usePageList } from './page-list'
import type { PageInfo } from './types'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function harness() {
  const listeners = new Map<string, Set<() => void>>()
  const responses: Array<ReturnType<typeof deferred<{ data: unknown }>>> = []
  const api = {
    get: vi.fn((url: string) => {
      expect(url).toBe(PAGES_LIST_URL)
      const next = deferred<{ data: unknown }>()
      responses.push(next)
      return next.promise
    }),
  }
  const on = vi.fn((topic: string, callback: () => void) => {
    if (!listeners.has(topic))
      listeners.set(topic, new Set())
    listeners.get(topic)?.add(callback)
    return () => listeners.get(topic)?.delete(callback)
  })
  const emit = (topic: string) => listeners.get(topic)?.forEach(callback => callback())
  const listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
  return { api, on, emit, responses, listenerCount }
}

const page = (id: string): PageInfo => ({ id, title: id })
// Drains pending promise callbacks. setTimeout would never fire under fake timers.
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++)
    await Promise.resolve()
}

describe('parsePages', () => {
  it('keeps well-formed pages and drops the rest', () => {
    expect(parsePages({ pages: [page('a'), { id: '' }, null, { id: 'b' }, page('c')] }).map(p => p.id)).toEqual(['a', 'c'])
  })

  it('throws without a pages array', () => {
    expect(() => parsePages({ success: false })).toThrow()
  })
})

describe('createPageList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the list at once and becomes ready', async () => {
    const h = harness()
    const list = createPageList(h)
    expect(list.ready.value).toBe(false)
    h.responses[0].resolve({ data: { pages: [page('a')] } })
    await vi.waitFor(() => expect(list.ready.value).toBe(true))
    expect(list.pages.value.map(p => p.id)).toEqual(['a'])
    expect(list.error.value).toBeNull()
  })

  it('subscribes to the pages topic and to reconnect', () => {
    const h = harness()
    createPageList(h)
    expect(h.on.mock.calls.map(call => call[0])).toEqual([PAGES_TOPIC, RECONNECT_TOPIC])
  })

  it('reads once after a burst of signals', async () => {
    const h = harness()
    const list = createPageList({ ...h, debounceMs: 150 })
    h.responses[0].resolve({ data: { pages: [page('a')] } })
    await vi.waitFor(() => expect(list.ready.value).toBe(true))

    h.emit(PAGES_TOPIC)
    h.emit(PAGES_TOPIC)
    h.emit(RECONNECT_TOPIC)
    vi.advanceTimersByTime(149)
    expect(h.api.get).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(h.api.get).toHaveBeenCalledTimes(2)

    h.responses[1].resolve({ data: { pages: [page('a'), page('b')] } })
    await vi.waitFor(() => expect(list.pages.value.map(p => p.id)).toEqual(['a', 'b']))
  })

  it('queues one more read when a refresh comes during a read', async () => {
    const h = harness()
    const list = createPageList(h)
    void list.refresh()
    void list.refresh()
    expect(h.api.get).toHaveBeenCalledTimes(1)
    h.responses[0].resolve({ data: { pages: [page('old')] } })
    await vi.waitFor(() => expect(h.api.get).toHaveBeenCalledTimes(2))
    h.responses[1].resolve({ data: { pages: [page('new')] } })
    await vi.waitFor(() => expect(list.pages.value.map(p => p.id)).toEqual(['new']))
    expect(h.api.get).toHaveBeenCalledTimes(2)
  })

  it('keeps the last list and reports the error when a read fails', async () => {
    const h = harness()
    const list = createPageList(h)
    h.responses[0].resolve({ data: { pages: [page('a')] } })
    await vi.waitFor(() => expect(list.ready.value).toBe(true))

    const read = list.refresh()
    h.responses[1].reject(new Error('offline'))
    await read
    expect(list.pages.value.map(p => p.id)).toEqual(['a'])
    expect(list.ready.value).toBe(true)
    expect(String(list.error.value)).toContain('offline')
  })

  it('stays not ready when the first read fails', async () => {
    const h = harness()
    const list = createPageList(h)
    h.responses[0].resolve({ data: { nope: true } })
    await vi.waitFor(() => expect(list.error.value).not.toBeNull())
    expect(list.ready.value).toBe(false)
  })

  it('stops listening and ignores late answers after dispose', async () => {
    const h = harness()
    const list = createPageList(h)
    h.emit(PAGES_TOPIC)
    list.dispose()
    expect(h.listenerCount()).toBe(0)
    vi.advanceTimersByTime(1000)
    expect(h.api.get).toHaveBeenCalledTimes(1)
    h.responses[0].resolve({ data: { pages: [page('late')] } })
    await flush()
    expect(list.ready.value).toBe(false)
    expect(list.pages.value).toEqual([])
  })
})

describe('usePageList', () => {
  it('disposes with its effect scope', () => {
    const h = harness()
    const scope = effectScope()
    scope.run(() => usePageList(h))
    expect(h.listenerCount()).toBe(2)
    scope.stop()
    expect(h.listenerCount()).toBe(0)
  })
})
