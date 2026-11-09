import { describe, expect, it } from 'vitest'
import type { LayoutProp } from '../types'
import { FLEXIBLE_ROW_PX, buildPanels, layoutDeclaration, layoutPanelIds, pageHeight, pixelSize } from './layout'

const Component = { name: 'Frame' }

const layout: LayoutProp = {
  breakpoints: { lg: 1024 },
  layouts: {
    default: {
      direction: 'vertical',
      children: [
        { panel: 'a', size: '200px' },
        { panel: 'b', size: '300px' },
        { panel: 'c', size: '1fr' },
      ],
    },
    lg: {
      direction: 'vertical',
      children: [
        { direction: 'horizontal', size: '400px', children: [{ panel: 'a', size: '30%' }, { panel: 'b', size: '70%' }] },
        { direction: 'horizontal', size: '350px', children: [{ panel: 'c', size: '50%' }, { panel: 'd', size: '50%' }] },
      ],
    },
  },
}

describe('buildPanels', () => {
  it('maps each tile id to the frame component with its id as a prop', () => {
    const panels = buildPanels(['a', 'b'], Component)
    expect(Object.keys(panels)).toEqual(['a', 'b'])
    expect(panels.a).toEqual({ component: Component, props: { tileId: 'a' } })
    expect(panels.b.props.tileId).toBe('b')
  })

  it('returns an empty map without tiles', () => {
    expect(buildPanels([], Component)).toEqual({})
  })
})

describe('layoutDeclaration', () => {
  it('copies layouts and breakpoints so the manager never mutates the prop', () => {
    const decl = layoutDeclaration(layout, buildPanels(['a'], Component))
    expect(decl.breakpoints).toEqual({ lg: 1024 })
    expect(decl.layouts).toEqual(layout.layouts)
    expect(decl.layouts).not.toBe(layout.layouts)
    expect(decl.panels.a.props.tileId).toBe('a')
  })

  it('leaves breakpoints out when the page sets none', () => {
    const decl = layoutDeclaration({ layouts: { default: layout.layouts.default } }, {})
    expect('breakpoints' in decl).toBe(false)
  })
})

describe('layoutPanelIds', () => {
  it('lists every panel id over all breakpoints, once', () => {
    expect(layoutPanelIds(layout).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('pixelSize', () => {
  it('reads Npx only', () => {
    expect(pixelSize('320px')).toBe(320)
    expect(pixelSize('12.5px')).toBe(12.5)
    expect(pixelSize('1fr')).toBeNull()
    expect(pixelSize('40%')).toBeNull()
    expect(pixelSize('auto')).toBeNull()
    expect(pixelSize(undefined)).toBeNull()
  })
})

describe('pageHeight', () => {
  it('sums fixed row heights of the active breakpoint', () => {
    expect(pageHeight(layout, 'lg')).toBe(750)
  })

  it('counts a flexible slot as the flexible row height', () => {
    expect(pageHeight(layout, 'default')).toBe(200 + 300 + FLEXIBLE_ROW_PX)
  })

  it('falls back to the default tree for an unknown breakpoint', () => {
    expect(pageHeight(layout, 'xl')).toBe(pageHeight(layout, 'default'))
  })

  it('takes the tallest column when the root runs horizontally', () => {
    const columns: LayoutProp = {
      layouts: {
        default: {
          direction: 'horizontal',
          children: [
            { direction: 'vertical', size: '50%', children: [{ panel: 'a', size: '100px' }, { panel: 'b', size: '150px' }] },
            { direction: 'vertical', size: '50%', children: [{ panel: 'c', size: '500px' }] },
          ],
        },
      },
    }
    expect(pageHeight(columns, 'default')).toBe(500)
  })

  it('gives a root of plain slots in a row the flexible row height', () => {
    const row: LayoutProp = {
      layouts: { default: { direction: 'horizontal', children: [{ panel: 'a', size: '1fr' }, { panel: 'b', size: '1fr' }] } },
    }
    expect(pageHeight(row, 'default')).toBe(FLEXIBLE_ROW_PX)
  })

  it('uses the content height of a flexible nested row when it is larger', () => {
    const nested: LayoutProp = {
      layouts: {
        default: {
          direction: 'vertical',
          children: [
            { direction: 'vertical', size: '1fr', children: [{ panel: 'a', size: '500px' }] },
          ],
        },
      },
    }
    expect(pageHeight(nested, 'default')).toBe(500)
  })

  it('returns 0 without a layout or without children', () => {
    expect(pageHeight(undefined, 'default')).toBe(0)
    expect(pageHeight({ layouts: { default: { direction: 'vertical', children: [] } } }, 'default')).toBe(0)
  })
})
