import { describe, expect, it } from 'vitest'
import { ref, shallowRef } from 'vue'
import { useHostedPage } from './hosted-page'
import type { PageInfo } from './types'

const shell: PageInfo = { id: 'app.views:main', title: 'Admin Panel', mountRoute: '/home/:part(.*)*' }
const llm: PageInfo = { id: 'd:llm', title: 'LLM usage', mountRoute: '/reports/llm-usage/:part(.*)*' }

function setup(path = '/reports/llm-usage') {
  const pages = shallowRef<readonly PageInfo[]>([])
  const ready = ref(false)
  const error = shallowRef<unknown>(null)
  const current = ref(path)
  const state = useHostedPage({ pageList: { pages, ready, error }, path: current, exclude: [shell.id] })
  return { pages, ready, error, current, state }
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

  it('resolves the page and its sub-path', () => {
    const { pages, ready, current, state } = setup('/reports/llm-usage/claude-haiku-4-5')
    pages.value = [shell, llm]
    ready.value = true
    expect(state.value).toMatchObject({ status: 'ready', match: { page: { id: 'd:llm' }, prefix: '/reports/llm-usage', subPath: '/claude-haiku-4-5' } })
    current.value = '/reports/llm-usage'
    expect(state.value).toMatchObject({ status: 'ready', match: { subPath: '/' } })
  })

  it('treats an unknown path, or the shell itself, as not found', () => {
    const { pages, ready, current, state } = setup('/nowhere')
    pages.value = [shell, llm]
    ready.value = true
    expect(state.value).toEqual({ status: 'none' })
    current.value = '/home/users'
    expect(state.value).toEqual({ status: 'none' })
  })

  it('says gone when the open page leaves the list', () => {
    const { pages, ready, current, state } = setup('/reports/llm-usage/x')
    pages.value = [shell, llm]
    ready.value = true
    expect(state.value.status).toBe('ready')
    pages.value = [shell]
    expect(state.value).toEqual({ status: 'gone', pageId: 'd:llm' })
    current.value = '/elsewhere'
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
})
