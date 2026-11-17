import { describe, expect, it } from 'vitest'
import { activeKey, isUnder, joinPath, matchPage, mountPrefix, normalizePath, pagePath, splitPath } from './match'
import type { NavItem, PageInfo } from './types'

const pages: PageInfo[] = [
  { id: 'app.views:main', title: 'Admin Panel', mountRoute: '/home/:part(.*)*' },
  { id: 'dash:llm', title: 'LLM usage', mountRoute: '/reports/llm-usage/:part(.*)*' },
  { id: 'dash:reports', title: 'Reports', mountRoute: '/reports/:part(.*)*' },
  { id: 'keeper:main', title: 'Keeper', mountRoute: null },
]

describe('paths', () => {
  it('normalizes slashes, query and hash', () => {
    expect(normalizePath('reports//x/?a=1#h')).toBe('/reports/x')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
  })

  it('takes the literal start of a mount route', () => {
    expect(mountPrefix('/reports/llm-usage/:part(.*)*')).toBe('/reports/llm-usage')
    expect(mountPrefix('/a/:id/b')).toBe('/a')
    expect(mountPrefix('/:part(.*)*')).toBe('/')
  })

  it('uses /page/<id> for a page without a usable mount route', () => {
    expect(pagePath({ id: 'keeper:main', mountRoute: null })).toBe('/page/keeper:main')
    expect(pagePath({ id: 'x', mountRoute: '/:part(.*)*' })).toBe('/page/x')
  })

  it('matches whole segments only', () => {
    expect(isUnder('/reports/llm-usage', '/reports')).toBe(true)
    expect(isUnder('/reportsx', '/reports')).toBe(false)
    expect(isUnder('/users', '/')).toBe(false)
    expect(isUnder('/', '/')).toBe(true)
  })

  it('joins a prefix and a sub-path', () => {
    expect(joinPath('/reports/llm-usage', '/')).toBe('/reports/llm-usage')
    expect(joinPath('/reports/llm-usage', '')).toBe('/reports/llm-usage')
    expect(joinPath('/reports/llm-usage', 'claude')).toBe('/reports/llm-usage/claude')
    expect(joinPath('/', '/x')).toBe('/x')
  })

  it('splits off and keeps a query and hash', () => {
    expect(splitPath('/a/b?x=1#h')).toEqual({ path: '/a/b', suffix: '?x=1#h' })
    expect(splitPath('/a#h')).toEqual({ path: '/a', suffix: '#h' })
    expect(splitPath('/a')).toEqual({ path: '/a', suffix: '' })
    expect(joinPath('/nested-nav', '/tab?filter=one#section')).toBe('/nested-nav/tab?filter=one#section')
    expect(joinPath('/nested-nav', '/?filter=one')).toBe('/nested-nav?filter=one')
  })
})

describe('matchPage', () => {
  it('picks the longest page path and returns the rest as sub-path', () => {
    expect(matchPage(pages, '/reports/llm-usage/claude-haiku-4-5')).toMatchObject({
      page: { id: 'dash:llm' },
      prefix: '/reports/llm-usage',
      subPath: '/claude-haiku-4-5',
    })
    expect(matchPage(pages, '/reports/other')?.page.id).toBe('dash:reports')
    expect(matchPage(pages, '/reports/llm-usage')?.subPath).toBe('/')
  })

  it('finds a page without mount route under /page/<id>', () => {
    expect(matchPage(pages, '/page/keeper:main/x')).toMatchObject({ page: { id: 'keeper:main' }, subPath: '/x' })
  })

  it('also finds a page with a mount route under /page/<id>', () => {
    expect(matchPage(pages, '/page/dash:llm/claude')).toMatchObject({ page: { id: 'dash:llm' }, prefix: '/page/dash:llm', subPath: '/claude' })
  })

  it('keeps the query and hash on the sub-path', () => {
    expect(matchPage(pages, '/reports/llm-usage/x?model=a#chart')?.subPath).toBe('/x?model=a#chart')
    expect(matchPage(pages, '/reports/llm-usage?model=a')?.subPath).toBe('/?model=a')
  })

  it('never matches an excluded page, such as the shell itself', () => {
    expect(matchPage(pages, '/home/users', { exclude: ['app.views:main'] })).toBeNull()
    expect(matchPage(pages, '/home/users')?.page.id).toBe('app.views:main')
  })

  it('returns null when no page lives at the path', () => {
    expect(matchPage(pages, '/nowhere')).toBeNull()
  })
})

describe('activeKey', () => {
  const items: NavItem[] = [
    { key: 'home', label: 'Home', target: { kind: 'route', path: '/' } },
    { key: 'users', label: 'Users', target: { kind: 'route', path: '/users' } },
    { key: 'reports', label: 'Reports', target: { kind: 'route', path: '/reports' } },
    { key: 'llm', label: 'LLM usage', target: { kind: 'route', path: '/reports/llm-usage' } },
    { key: 'keeper', label: 'Keeper', target: { kind: 'host', path: '/' } },
  ]

  it('matches the root only exactly', () => {
    expect(activeKey(items, '/')).toBe('home')
    expect(activeKey(items, '/nowhere')).toBeNull()
  })

  it('prefers the longest matching item', () => {
    expect(activeKey(items, '/reports/llm-usage/claude')).toBe('llm')
    expect(activeKey(items, '/reports/x')).toBe('reports')
    expect(activeKey(items, '/users/42')).toBe('users')
  })

  it('never activates an item that hands over to the Host', () => {
    expect(activeKey([items[4]], '/')).toBeNull()
  })

  it('activates a page item at /page/<page id> too', () => {
    const page: NavItem = { key: 'd:llm', label: 'LLM usage', pageId: 'd:llm', target: { kind: 'route', path: '/reports/llm-usage' } }
    expect(activeKey([items[0], page], '/page/d:llm')).toBe('d:llm')
    expect(activeKey([items[0], page], '/page/d:llm/claude?x=1')).toBe('d:llm')
    expect(activeKey([items[0], page], '/page/d:other')).toBeNull()
  })
})
