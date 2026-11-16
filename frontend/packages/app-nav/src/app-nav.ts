import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'
import { activeKey, pagePath } from './match'
import type { PageList } from './page-list'
import { buildNavTree } from './tree'
import type { NavItem, NavNode, PageInfo } from './types'

/**
 * Nav items for the registry pages of the given groups. Each opens inside the
 * shell at its page path. Ungrouped pages, pages of other groups and inline
 * pages stay out, so the app decides which module pages join its nav.
 */
export function pageNavItems(pages: readonly PageInfo[], groups: readonly string[]): NavItem[] {
  const allowed = new Set(groups)
  return pages
    .filter(page => !page.hidden && !!page.group && allowed.has(page.group))
    .map(page => ({
      key: `page:${page.id}`,
      label: page.title,
      icon: page.icon || undefined,
      order: page.order,
      group: page.group,
      groupIcon: page.groupIcon || undefined,
      groupOrder: page.groupOrder,
      pageId: page.id,
      target: { kind: 'route', path: pagePath(page) },
    }))
}

/**
 * The app's own items that the viewer may see now. An item bound to a page
 * (`pageId`) shows only once the list has loaded and holds that page.
 */
export function visibleItems(items: readonly NavItem[], pages: readonly PageInfo[], ready: boolean): NavItem[] {
  const listed = new Set(pages.map(page => page.id))
  return items.filter(item => !item.pageId || (ready && listed.has(item.pageId)))
}

export interface AppNavOptions {
  /** The app's own items. Give each an `order`, so registry groups sort among them. */
  items: readonly NavItem[]
  pageList: Pick<PageList, 'pages' | 'ready'>
  /** Registry groups whose pages join the nav, for example `['Dashboards']`. */
  groups: readonly string[]
  /** The shell router's current path. */
  currentPath: Readonly<Ref<string>>
  navigate: {
    /** Opens a path in the shell's own router. */
    route: (path: string) => unknown
    /** Hands the window to the Host, for example `host.navigate`. */
    host: (path: string) => unknown
  }
}

export interface AppNav {
  items: ComputedRef<NavItem[]>
  tree: ComputedRef<NavNode[]>
  activeKey: ComputedRef<string | null>
  open: (item: NavItem) => void
}

/** The live nav of a shell: its own items plus the registry pages of the chosen groups. */
export function useAppNav(options: AppNavOptions): AppNav {
  const items = computed(() => [
    ...visibleItems(options.items, options.pageList.pages.value, options.pageList.ready.value),
    ...pageNavItems(options.pageList.pages.value, options.groups),
  ])
  const tree = computed(() => buildNavTree(items.value))
  const active = computed(() => activeKey(items.value, options.currentPath.value))

  function open(item: NavItem): void {
    if (item.target.kind === 'route')
      options.navigate.route(item.target.path)
    else
      options.navigate.host(item.target.path)
  }

  return { items, tree, activeKey: active, open }
}
