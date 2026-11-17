import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { useHostedPage } from './hosted-page'
import type { PageInfo } from './types'

const shell: PageInfo = { id: 'app.views:main', title: 'Admin Panel', mountRoute: '/home/:part(.*)*' }
const llm: PageInfo = { id: 'd:llm', title: 'LLM usage', mountRoute: '/reports/llm-usage/:part(.*)*' }
const fresh: PageInfo = { id: 'd:new', title: 'New board', mountRoute: '/dash/new/:part(.*)*' }

// Lets pending promise callbacks run.
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++)
    await Promise.resolve()
}

function setup(path = '/reports/llm-usage') {
  const pages = shallowRef<readonly PageInfo[]>([])
  const ready = ref(false)
  const error = shallowRef<unknown>(null)
  const current = ref(path)
  // What the next fresh read returns; null keeps the list as it is.
  let nextRead: readonly PageInfo[] | null = null
  // When set, fresh reads fail with this error, as the real list records it.
  let failWith: unknown = null
  const refresh = vi.fn(async () => {
    if (failWith) {
      error.value = failWith
      return
    }
    error.value = null
    if (nextRead)
      pages.value = nextRead
  })
  const state = useHostedPage({ pageList: { pages, ready, error, refresh }, path: current, exclude: [shell.id] })
  return {
    pages,
    ready,
    error,
    current,
    state,
    refresh,
    readReturns: (list: readonly PageInfo[]) => { nextRead = list },
    readFails: (err: unknown) => { failWith = err },
  }
}

describe('useHostedPage', () => {
  it('waits for the first list', () => {
    const { state } = setup()
    expect(state.value).toEqual({ status: 'loading' })
  })

  it('reports a failed first read', () => {
    const { error, state } = setup()
    error.value = new Error('offline')
    expect(state.value.status).toBe('error')
  })

  it('resolves the page and its sub-path, keeping a query and hash', () => {
    const { pages, ready, current, state } = setup('/reports/llm-usage/claude-haiku-4-5')
    pages.value = [shell, llm]
    ready.value = true
    expect(state.value).toMatchObject({ status: 'ready', match: { page: { id: 'd:llm' }, prefix: '/reports/llm-usage', subPath: '/claude-haiku-4-5' } })
    current.value = '/reports/llm-usage'
    expect(state.value).toMatchObject({ status: 'ready', match: { subPath: '/' } })
    current.value = '/reports/llm-usage/x?tab=2#top'
    expect(state.value).toMatchObject({ status: 'ready', match: { subPath: '/x?tab=2#top' } })
  })

  it('checks an unknown path with one fresh read before it says none', async () => {
    const { pages, ready, state, refresh } = setup('/nowhere')
    pages.value = [shell, llm]
    ready.value = true
    expect(state.value).toEqual({ status: 'loading' })
    expect(refresh).toHaveBeenCalledTimes(1)
    await flush()
    expect(state.value).toEqual({ status: 'none' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('says error, not none, when the fresh read fails', async () => {
    const { pages, ready, state, readFails } = setup('/dash/new')
    pages.value = [shell, llm]
    readFails(new Error('offline'))
    ready.value = true
    await flush()
    expect(state.value.status).toBe('error')
  })

  it('settles a failed check with the next successful read', async () => {
    const { pages, ready, error, state, readFails } = setup('/nowhere')
    pages.value = [shell, llm]
    readFails(new Error('offline'))
    ready.value = true
    await flush()
    expect(state.value.status).toBe('error')
    // A `pages` signal or a reconnect reads the list again, and it works.
    error.value = null
    expect(state.value).toEqual({ status: 'none' })
  })

  it('reads a checked path again on a later visit', async () => {
    const { pages, ready, current, state, refresh, readReturns } = setup('/dash/new')
    pages.value = [shell, llm]
    ready.value = true
    await flush()
    expect(state.value).toEqual({ status: 'none' })
    current.value = '/reports/llm-usage'
    readReturns([shell, llm, fresh])
    current.value = '/dash/new'
    await flush()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(state.value).toMatchObject({ status: 'ready', match: { page: { id: 'd:new' } } })
  })

  it('finds a page published after the cached read', async () => {
    const { pages, ready, state, readReturns } = setup('/dash/new')
    pages.value = [shell, llm]
    readReturns([shell, llm, fresh])
    ready.value = true
    await flush()
    expect(state.value).toMatchObject({ status: 'ready', match: { page: { id: 'd:new' } } })
  })

  it('never hosts the shell itself', async () => {
    const { pages, ready, state } = setup('/home/users')
    pages.value = [shell, llm]
    ready.value = true
    await flush()
    expect(state.value).toEqual({ status: 'none' })
  })

  it('says gone when the open page leaves the list', () => {
    const { pages, ready, state } = setup('/reports/llm-usage/x')
    pages.value = [shell, llm]
    ready.value = true
    expect(state.value.status).toBe('ready')
    pages.value = [shell]
    expect(state.value).toEqual({ status: 'gone', pageId: 'd:llm' })
  })

  it('forgets a removed page once the path leaves it', async () => {
    const { pages, ready, current, state } = setup('/reports/llm-usage')
    pages.value = [shell, llm]
    ready.value = true
    pages.value = [shell]
    expect(state.value.status).toBe('gone')
    current.value = '/'
    await flush()
    current.value = '/reports/llm-usage'
    await flush()
    expect(state.value).toEqual({ status: 'none' })
  })

  it('opens the page again when it comes back', () => {
    const { pages, ready, state } = setup()
    pages.value = [llm]
    ready.value = true
    pages.value = []
    expect(state.value.status).toBe('gone')
    pages.value = [llm]
    expect(state.value.status).toBe('ready')
  })

  it('answers at /page/<id> for a page that has a mount route', () => {
    const { pages, ready, state } = setup('/page/d:llm/x')
    pages.value = [shell, llm]
    ready.value = true
    expect(state.value).toMatchObject({ status: 'ready', match: { page: { id: 'd:llm' }, prefix: '/page/d:llm', subPath: '/x' } })
  })
})
