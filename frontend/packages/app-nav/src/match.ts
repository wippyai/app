import type { NavItem, PageInfo, PageMatch } from './types'

/** Splits a path into its path part and the query and hash that follow it (`?a=1#b`). */
export function splitPath(path: string): { path: string, suffix: string } {
  const at = path.search(/[?#]/)
  return at < 0 ? { path, suffix: '' } : { path: path.slice(0, at), suffix: path.slice(at) }
}

/** Drops the query and hash, adds a leading slash, removes a trailing slash. */
export function normalizePath(path: string): string {
  let clean = splitPath(path).path
  if (!clean.startsWith('/'))
    clean = `/${clean}`
  clean = clean.replace(/\/{2,}/g, '/')
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean
}

/** The literal start of a mount route: `/reports/llm-usage/:part(.*)*` gives `/reports/llm-usage`. */
export function mountPrefix(mountRoute: string): string {
  const literal: string[] = []
  for (const segment of mountRoute.split('/').filter(Boolean)) {
    if (segment.startsWith(':') || segment.includes('*') || segment.includes('('))
      break
    literal.push(segment)
  }
  return `/${literal.join('/')}`
}

/** The shell path that every listed page answers to, whatever its mount route. */
export function pageIdPath(id: string): string {
  return `/page/${id}`
}

/**
 * The shell path of a page: the literal start of its mount route, so the shell
 * shows `/reports/llm-usage` at `<shell>/reports/llm-usage`. A page without a
 * mount route lives at `/page/<page id>`, and every page also answers there.
 */
export function pagePath(page: Pick<PageInfo, 'id' | 'mountRoute'>): string {
  if (page.mountRoute) {
    const prefix = mountPrefix(page.mountRoute)
    if (prefix !== '/')
      return prefix
  }
  return pageIdPath(page.id)
}

/** True when `path` is `prefix` or below it. The root prefix `/` matches only itself. */
export function isUnder(path: string, prefix: string): boolean {
  if (prefix === '/')
    return path === '/'
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * `prefix` plus a sub-path. A root sub-path (`/` or empty) gives `prefix`
 * alone. A query or hash on the sub-path is kept.
 */
export function joinPath(prefix: string, subPath: string): string {
  const { path, suffix } = splitPath(subPath || '/')
  const sub = normalizePath(path || '/')
  const joined = sub === '/' ? prefix : (prefix === '/' ? sub : `${prefix}${sub}`)
  return `${joined}${suffix}`
}

/**
 * The listed page that lives at `path`, by the longest matching page path.
 * Each page matches at its own page path and at `/page/<page id>`. `exclude`
 * holds page ids that must never match, such as the shell itself, which would
 * otherwise host itself. A query or hash on `path` stays on the sub-path.
 */
export function matchPage(
  pages: readonly PageInfo[],
  path: string,
  options: { exclude?: readonly string[] } = {},
): PageMatch | null {
  const { suffix } = splitPath(path)
  const target = normalizePath(path)
  const exclude = new Set(options.exclude ?? [])
  let best: PageMatch | null = null
  for (const page of pages) {
    if (exclude.has(page.id))
      continue
    for (const prefix of new Set([pagePath(page), pageIdPath(page.id)])) {
      if (!isUnder(target, prefix))
        continue
      if (!best || prefix.length > best.prefix.length)
        best = { page, prefix, subPath: `${target.slice(prefix.length) || '/'}${suffix}` }
    }
  }
  return best
}

/**
 * The key of the item that `path` belongs to: among items that open inside the
 * shell, the one with the longest matching path. Items that hand over to the
 * Host are never active, because the shell is gone once they open.
 */
export function activeKey(items: readonly NavItem[], path: string): string | null {
  const target = normalizePath(path)
  let best: { key: string, length: number } | null = null
  for (const item of items) {
    if (item.target.kind !== 'route')
      continue
    const prefix = normalizePath(item.target.path)
    if (!isUnder(target, prefix))
      continue
    if (!best || prefix.length > best.length)
      best = { key: item.key, length: prefix.length }
  }
  return best?.key ?? null
}
