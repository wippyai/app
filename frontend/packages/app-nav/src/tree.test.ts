import { describe, expect, it } from 'vitest'
import { buildNavTree } from './tree'
import type { NavItem, NavNode } from './types'

function item(key: string, fields: Partial<NavItem> = {}): NavItem {
  return { key, label: key, target: { kind: 'route', path: `/${key}` }, ...fields }
}

function shape(nodes: NavNode[]): unknown[] {
  return nodes.map(node => node.type === 'item'
    ? node.key
    : { [node.group.label]: node.group.items.map(entry => entry.key) })
}

describe('buildNavTree', () => {
  it('sorts items by order, then label', () => {
    const tree = buildNavTree([
      item('b', { order: 2 }),
      item('c', { order: 1 }),
      item('a', { order: 2 }),
    ])
    expect(shape(tree)).toEqual(['c', 'a', 'b'])
  })

  it('sorts an item without order as 9999', () => {
    const tree = buildNavTree([item('late'), item('early', { order: 9998 })])
    expect(shape(tree)).toEqual(['early', 'late'])
  })

  it('groups items that share a group, in item order', () => {
    const tree = buildNavTree([
      item('home', { order: 1 }),
      item('d2', { order: 90, group: 'Dashboards', groupOrder: 50 }),
      item('d1', { order: 50, group: 'Dashboards', groupOrder: 50 }),
      item('keeper', { order: 6 }),
    ])
    expect(shape(tree)).toEqual(['home', 'keeper', { Dashboards: ['d1', 'd2'] }])
  })

  it('places a group among loose items by its group order', () => {
    const tree = buildNavTree([
      item('a', { order: 10 }),
      item('g1', { order: 1, group: 'G', groupOrder: 20 }),
      item('b', { order: 30 }),
    ])
    expect(shape(tree)).toEqual(['a', { G: ['g1'] }, 'b'])
  })

  it('puts a group ahead of a loose item with the same order', () => {
    const tree = buildNavTree([item('x', { order: 50 }), item('g1', { group: 'G', groupOrder: 50 })])
    expect(shape(tree)).toEqual([{ G: ['g1'] }, 'x'])
  })

  it('sorts a group without group order as 9999', () => {
    const tree = buildNavTree([item('g1', { group: 'G', groupOrder: 0 }), item('x', { order: 9000 })])
    expect(shape(tree)).toEqual(['x', { G: ['g1'] }])
  })

  it('lets a later non-zero group order and icon replace the first', () => {
    const tree = buildNavTree([
      item('g1', { order: 1, group: 'G', groupOrder: 40, groupIcon: 'tabler:a' }),
      item('g2', { order: 2, group: 'G', groupOrder: 5 }),
      item('g3', { order: 3, group: 'G', groupIcon: 'tabler:b' }),
    ])
    const group = tree[0]
    expect(group.type).toBe('group')
    if (group.type === 'group') {
      expect(group.group.order).toBe(5)
      expect(group.group.icon).toBe('tabler:b')
      expect(group.key).toBe('group:G')
    }
  })

  it('returns an empty nav for no items', () => {
    expect(buildNavTree([])).toEqual([])
  })
})
