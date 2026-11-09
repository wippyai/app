/**
 * The path below the page's mount route, for the `sub-path` attribute:
 * no query, no hash, no trailing slash. "" at the page root.
 */
export function toSubPath(route: string | undefined | null): string {
  if (!route)
    return ''
  const path = route.split(/[?#]/, 1)[0].replace(/\/+$/, '')
  if (!path)
    return ''
  return path.startsWith('/') ? path : `/${path}`
}
