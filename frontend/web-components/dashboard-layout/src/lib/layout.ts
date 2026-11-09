import type { Component } from 'vue'
import type { LayoutProp, PanelSlotProp, PanelTreeProp } from '../types'

/**
 * Pure helpers between the compiled props and `@wippy-fe/layout`.
 * Nothing here imports the layout package, so the unit tests run without a DOM.
 */

/** Height of a row whose size is not a fixed pixel value (`Nfr`, `N%`, `auto` or missing). */
export const FLEXIBLE_ROW_PX = 240

export interface PanelEntry {
  component: Component
  props: { tileId: string }
}

/** The package expects Vue components in `panels`, so the board builds the map in the browser. */
export function buildPanels(tileIds: string[], component: Component): Record<string, PanelEntry> {
  const panels: Record<string, PanelEntry> = {}
  for (const id of tileIds)
    panels[id] = { component, props: { tileId: id } }
  return panels
}

export function layoutDeclaration(layout: LayoutProp, panels: Record<string, PanelEntry>) {
  const copy = JSON.parse(JSON.stringify(layout)) as LayoutProp
  return {
    layouts: copy.layouts,
    ...(copy.breakpoints ? { breakpoints: copy.breakpoints } : {}),
    panels,
  }
}

/** Every panel id a layout names, over all breakpoints. */
export function layoutPanelIds(layout: LayoutProp): string[] {
  const ids = new Set<string>()
  const walk = (node: PanelSlotProp | PanelTreeProp) => {
    if (isTree(node)) node.children.forEach(walk)
    else ids.add(node.panel)
  }
  Object.values(layout.layouts).forEach(walk)
  return [...ids]
}

export function isTree(node: PanelSlotProp | PanelTreeProp): node is PanelTreeProp {
  return Array.isArray((node as PanelTreeProp).children)
}

/** Pixel value of a `Npx` size, or null for `Nfr`, `N%`, `auto` and anything else. */
export function pixelSize(size: string | undefined): number | null {
  if (!size) return null
  const match = /^(\d+(?:\.\d+)?)px$/.exec(size.trim())
  return match ? Number(match[1]) : null
}

type Direction = PanelTreeProp['direction']

/** Height a child needs when its parent runs in `parent` direction. */
function childExtent(node: PanelSlotProp | PanelTreeProp, parent: Direction): number {
  if (parent === 'vertical') {
    const fixed = pixelSize(node.size)
    if (fixed !== null) return fixed
    const content = isTree(node) ? treeExtent(node) : 0
    return Math.max(content, FLEXIBLE_ROW_PX)
  }
  // In a row the child spans the row's height, so only its own content can ask for height.
  return isTree(node) ? treeExtent(node) : 0
}

function treeExtent(tree: PanelTreeProp): number {
  const extents = tree.children.map(child => childExtent(child, tree.direction))
  if (tree.direction === 'vertical')
    return extents.reduce((sum, h) => sum + h, 0)
  return extents.reduce((max, h) => Math.max(max, h), 0)
}

/**
 * Page height in pixels for one breakpoint's root tree. Rows with a `Npx` size count as given.
 * A row sized in `fr`, `%` or `auto` has no height the board can read, because the board
 * computes the height of the container those sizes refer to. Such a row counts as
 * `FLEXIBLE_ROW_PX`, or its content height when that is larger.
 * Returns 0 when the layout has no tree for the breakpoint.
 */
export function pageHeight(layout: LayoutProp | undefined, breakpoint: string): number {
  if (!layout) return 0
  const root = layout.layouts[breakpoint] ?? layout.layouts.default
  if (!root) return 0
  if (root.children.length === 0) return 0
  const height = treeExtent(root)
  // A row of slots has no height of its own, so give it the flexible row height.
  return height > 0 ? height : FLEXIBLE_ROW_PX
}
