import type { NavItem } from '@example/app-nav'

/**
 * The app's own sidebar items, top to bottom. Their `order` also places the
 * registry groups below: a group sorts by its `group_order` meta, so keep
 * these orders under the smallest group order you show (Dashboards uses 50).
 *
 * `route` items open inside this page. `host` items hand the window to the
 * Web Host, which opens that page on its own. Add `pageId` to show an item
 * only while the viewer's page list holds that page.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', label: 'Home', icon: 'tabler:home', order: 1, target: { kind: 'route', path: '/' } },
  { key: 'users', label: 'Users', icon: 'tabler:users', order: 2, target: { kind: 'route', path: '/users' } },
  { key: 'components', label: 'Components', icon: 'tabler:components', order: 3, target: { kind: 'route', path: '/components' } },
  { key: 'nested-nav', label: 'Nested Nav', icon: 'tabler:route-2', order: 4, target: { kind: 'route', path: '/nested-nav' } },
  { key: 'research', label: 'Web Research', icon: 'tabler:world-search', order: 5, target: { kind: 'route', path: '/research' } },
  { key: 'keeper', label: 'Keeper', icon: 'tabler:shield-code', order: 6, target: { kind: 'host', path: '/c/keeper:main' } },
]

/**
 * Registry groups (`meta.group` of a view.page) whose pages join the sidebar,
 * live, as the registry changes. Each page opens inside this page at the
 * start of its own mount route, for example `/home/reports/llm-usage`.
 * Pages of other groups, and ungrouped pages, stay out of this sidebar.
 */
export const NAV_GROUPS: readonly string[] = ['Dashboards']
