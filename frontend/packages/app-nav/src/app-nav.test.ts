import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { pageNavItems, useAppNav, visibleItems } from './app-nav'
import type { NavItem, NavNode, PageInfo } from './types'

const own: NavItem[] = [
  { key: 'home', label: 'Home', order: 1, target: { kind: 'route', path: '/' } },
  { key: 'users', label: 'Users', order: 2, target: { kind: 'route', path: '/users' } },
  { key: 'keeper', label: 'Keeper', order: 6, pageId: 'keeper:main', target: { kind: 'host', path: '/c/keeper:main' } },
]

const listed: PageInfo[] = [
  { id: 'app.views:main', title: 'Admin Panel', order: 0, mountRoute: '/home/:part(.*)*' },
  { id: 'app.views:iframe-demo', title: 'Iframe Demo', order: 3, mountRoute: '/demo/:part(.*)*' },
  { id: 'keeper:main', title: 'Keeper', order: 5, mountRoute: null },
  { id: 'keeper.git:main', title: 'Git', order: 2, group: 'develop', mountRoute: null },
  { id: 'd:app', title: 'App activity', order: 60, group: 'Dashboards', groupOrder: 50, groupIcon: 'tabler:layout-dashboard', mountRoute: '/ops/app-activity/:part(.*)*' },
  { id: 'd:llm', title: 'LLM usage', order: 50, group: 'Dashboards', groupOrder: 50, groupIcon: 'tabler:layout-dashboard', icon: 'tabler:chart-bar', mountRoute: '/reports/llm-usage/:part(.*)*' },
  { id: 'd:inline', title: 'Inline', order: 1, group: 'Dashboards', hidden: 1, mountRoute: '/inline/:part(.*)*' },
]

function labels(nodes: NavNode[]): unknown[] {
  return nodes.map(node => node.type === 'item'
    ? node.item.label
    : { [node.group.label]: node.group.items.map(item => item.label) })
}

describe('pageNavItems', () => {
  it('keeps only non-inline pages of the chosen groups and opens them in the shell', () => {
    const items = pageNavItems(listed, ['Dashboards'])
    expect(items.map(item => item.key)).toEqual(['page:d:app', 'page:d:llm'])
    expect(items[1]).toMatchObject({
      label: 'LLM usage',
      icon: 'tabler:chart-bar',
      pageId: 'd:llm',
      target: { kind: 'route', path: '/reports/llm-usage' },
    })
  })

  it('adds nothing for an empty group list', () => {
    expect(pageNavItems(listed, [])).toEqual([])
  })

  it('leaves out excluded pages', () => {
    expect(pageNavItems(listed, ['Dashboards'], { exclude: ['d:llm'] }).map(item => item.key)).toEqual(['page:d:app'])
  })

  it('opens a page at /page/<id> when the shell already owns its path', () => {
    const items = pageNavItems(listed, ['Dashboards'], { isTaken: path => path === '/ops/app-activity' })
    expect(items.find(item => item.pageId === 'd:app')?.target).toEqual({ kind: 'route', path: '/page/d:app' })
    expect(items.find(item => item.pageId === 'd:llm')?.target).toEqual({ kind: 'route', path: '/reports/llm-usage' })
  })
})

describe('visibleItems', () => {
  it('shows an item bound to a page only when the loaded list holds it', () => {
    expect(visibleItems(own, listed, true).map(item => item.key)).toEqual(['home', 'users', 'keeper'])
    expect(visibleItems(own, listed, false).map(item => item.key)).toEqual(['home', 'users'])
    expect(visibleItems(own, listed.filter(page => page.id !== 'keeper:main'), true).map(item => item.key)).toEqual(['home', 'users'])
  })
})

describe('useAppNav', () => {
  function setup() {
    const pages = shallowRef<readonly PageInfo[]>([])
    const ready = ref(false)
    const currentPath = ref('/')
    const navigate = { route: vi.fn(), host: vi.fn() }
    const nav = useAppNav({ items: own, pageList: { pages, ready }, groups: ['Dashboards'], currentPath, navigate })
    return { pages, ready, currentPath, navigate, nav }
  }

  it('shows the app items first and adds the group when the list arrives', () => {
    const { pages, ready, nav } = setup()
    expect(labels(nav.tree.value)).toEqual(['Home', 'Users'])
    pages.value = listed
    ready.value = true
    expect(labels(nav.tree.value)).toEqual(['Home', 'Users', 'Keeper', { Dashboards: ['LLM usage', 'App activity'] }])
  })

  it('follows the list live: a removed page leaves, an added one joins', () => {
    const { pages, ready, nav } = setup()
    pages.value = listed
    ready.value = true
    pages.value = listed.filter(page => page.id !== 'd:app').concat({ id: 'd:new', title: 'New board', order: 90, group: 'Dashboards', mountRoute: '/dash/new/:part(.*)*' })
    expect(labels(nav.tree.value).at(-1)).toEqual({ Dashboards: ['LLM usage', 'New board'] })
  })

  it('marks the item of the current path', () => {
    const { pages, ready, currentPath, nav } = setup()
    pages.value = listed
    ready.value = true
    expect(nav.activeKey.value).toBe('home')
    currentPath.value = '/reports/llm-usage/claude-haiku-4-5'
    expect(nav.activeKey.value).toBe('page:d:llm')
    currentPath.value = '/users'
    expect(nav.activeKey.value).toBe('users')
  })

  it('shows a page once when an own item already stands for it', () => {
    const pages = shallowRef<readonly PageInfo[]>(listed)
    const ready = ref(true)
    const pinned: NavItem = { key: 'pinned', label: 'Pinned LLM', order: 7, pageId: 'd:llm', target: { kind: 'route', path: '/reports/llm-usage' } }
    const nav = useAppNav({ items: [...own, pinned], pageList: { pages, ready }, groups: ['Dashboards'], currentPath: ref('/'), navigate: { route: vi.fn(), host: vi.fn() } })
    const keys = nav.items.value.map(item => item.key)
    expect(keys).toContain('pinned')
    expect(keys).not.toContain('page:d:llm')
    expect(keys).toContain('page:d:app')
  })

  it('opens route items in the shell and host items through the Host', () => {
    const { pages, ready, navigate, nav } = setup()
    pages.value = listed
    ready.value = true
    const llm = nav.items.value.find(item => item.key === 'page:d:llm')
    const keeper = nav.items.value.find(item => item.key === 'keeper')
    if (!llm || !keeper)
      throw new Error('items missing')
    nav.open(llm)
    nav.open(keeper)
    expect(navigate.route).toHaveBeenCalledWith('/reports/llm-usage')
    expect(navigate.host).toHaveBeenCalledWith('/c/keeper:main')
  })
})
