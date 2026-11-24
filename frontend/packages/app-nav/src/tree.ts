import type { NavGroup, NavItem, NavNode } from './types'

/** The order of anything that has none, as in the Host nav and in wippy/views. */
export const DEFAULT_ORDER = 9999

function orderOf(order: number | undefined): number {
  return typeof order === 'number' && Number.isFinite(order) ? order : DEFAULT_ORDER
}

/** Items sort by order, then by label. */
export function compareItems(a: NavItem, b: NavItem): number {
  const byOrder = orderOf(a.order) - orderOf(b.order)
  return byOrder !== 0 ? byOrder : a.label.localeCompare(b.label)
}

function nodeOrder(node: NavNode): number {
  return node.type === 'group' ? node.group.order : orderOf(node.item.order)
}

/**
 * Builds the nav with the rules of the Web Host's built-in nav
 * (`src/features/pages/store.ts`), so a page sits in the same place in both:
 *
 * - items sort by order, then label;
 * - items that share `group` form one group, in item order;
 * - a group takes the first non-zero `groupOrder` and `groupIcon` it meets,
 *   and a later non-zero value replaces it; a group without one sorts as 9999;
 * - groups and ungrouped items then sort together by order, and on equal
 *   order a group comes first.
 *
 * Groups exist only through their items, so an empty group never appears.
 */
export function buildNavTree(items: readonly NavItem[]): NavNode[] {
  const sorted = [...items].sort(compareItems)
  const groups = new Map<string, NavGroup>()
  const loose: NavNode[] = []

  for (const item of sorted) {
    if (!item.group) {
      loose.push({ type: 'item', key: item.key, item })
      continue
    }
    let group = groups.get(item.group)
    if (!group) {
      group = {
        key: `group:${item.group}`,
        label: item.group,
        icon: item.groupIcon || undefined,
        order: item.groupOrder || DEFAULT_ORDER,
        items: [],
      }
      groups.set(item.group, group)
    }
    else {
      if (item.groupOrder)
        group.order = item.groupOrder
      if (item.groupIcon)
        group.icon = item.groupIcon
    }
    group.items.push(item)
  }

  const groupNodes: NavNode[] = [...groups.values()].map(group => ({ type: 'group', key: group.key, group }))
  // Array.prototype.sort is stable, so on equal order the groups stay ahead.
  return [...groupNodes, ...loose].sort((a, b) => nodeOrder(a) - nodeOrder(b))
}
