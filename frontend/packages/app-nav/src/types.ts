/**
 * One item of `GET /api/public/pages/list` (module wippy/views). The server
 * already keeps only the announced pages that the caller may view.
 */
export interface PageInfo {
  id: string
  title: string
  icon?: string
  /** The server sends 9999 when the registry entry has no order. */
  order?: number
  group?: string
  groupIcon?: string
  groupOrder?: number
  /** For example `/reports/llm-usage/:part(.*)*`. Null when the page has none. */
  mountRoute?: string | null
  /** 1 for an inline page (`meta.inline`). A nav never shows inline pages. */
  hidden?: number | boolean
}

/**
 * Where an item leads. `route` stays inside the shell and goes through the
 * shell's own router. `host` hands the whole window to the Web Host.
 */
export type NavTarget =
  | { kind: 'route', path: string }
  | { kind: 'host', path: string }

export interface NavItem {
  /** Unique within one nav. Registry pages use `page:<page id>`. */
  key: string
  label: string
  /** An Iconify name, for example `tabler:home`. */
  icon?: string
  /** Missing orders sort as 9999, like the Host nav. */
  order?: number
  group?: string
  groupIcon?: string
  groupOrder?: number
  /** Show the item only while this page is in the viewer's page list. */
  pageId?: string
  target: NavTarget
}

export interface NavGroup {
  /** `group:<group name>` */
  key: string
  label: string
  icon?: string
  order: number
  items: NavItem[]
}

export type NavNode =
  | { type: 'item', key: string, item: NavItem }
  | { type: 'group', key: string, group: NavGroup }

/** A shell path resolved to a listed page. */
export interface PageMatch {
  page: PageInfo
  /** The shell path where the page lives, for example `/reports/llm-usage`. */
  prefix: string
  /** The rest of the shell path, `/` at the page root. */
  subPath: string
}
