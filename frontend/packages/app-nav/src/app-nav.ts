import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'
import { activeKey, pageIdPath, pagePath } from './match'
import type { PageList } from './page-list'
import { buildNavTree } from './tree'
import type { NavItem, NavNode, PageInfo } from './types'

export interface PageNavOptions {
  /** Page ids that never become items, such as the shell's own page. */
  exclude?: readonly string[]
  /**
   * True when the shell's own router already owns a path. A page whose path is
   * taken opens at `/page/<page id>` instead, so the shell's route cannot hide it.
   */
  isTaken?: (path: string) => boolean
}

/**
 * Nav items for the registry pages of the given groups. Each opens inside the
 * shell at its page path. Ungrouped pages, pages of other groups and inline
 * pages stay out, so the app decides which module pages join its nav.
 */
export function pageNavItems(pages: readonly PageInfo[], groups: readonly string[], options: PageNavOptions = {}): NavItem[] {
  const allowed = new Set(groups)
  const exclude = new Set(options.exclude ?? [])
  return pages
    .filter(page => !page.hidden && !!page.group && allowed.has(page.group) && !exclude.has(page.id))
    .map((page) => {
      const own = pagePath(page)
      const path = options.isTaken?.(own) ? pageIdPath(page.id) : own
      return {
        key: `page:${page.id}`,
        label: page.title,
        icon: page.icon || undefined,
        order: page.order,
        group: page.group,
        groupIcon: page.groupIcon || undefined,
        groupOrder: page.groupOrder,
        pageId: page.id,
        target: { kind: 'route', path },
      }
    })
}

/**
 * The app's own items that the viewer may see now. An item bound to a page
 * (`pageId`) shows only once the list has loaded and holds that page.
 */
export function visibleItems(items: readonly NavItem[], pages: readonly PageInfo[], ready: boolean): NavItem[] {
  const listed = new Set(pages.map(page => page.id))
  return items.filter(item => !item.pageId || (ready && listed.has(item.pageId)))
}

export interface AppNavOptions extends PageNavOptions {
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

/**
 * The live nav of a shell: its own items plus the registry pages of the chosen
 * groups. A registry page that an own item already stands for (`pageId`)
 * appears once, as the own item.
 */
export function useAppNav(options: AppNavOptions): AppNav {
  const items = computed(() => {
    const own = visibleItems(options.items, options.pageList.pages.value, options.pageList.ready.value)
    const covered = new Set(options.items.map(item => item.pageId).filter(Boolean))
    const registry = pageNavItems(options.pageList.pages.value, options.groups, options)
      .filter(item => !covered.has(item.pageId))
    return [...own, ...registry]
  })
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
