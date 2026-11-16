import type { ComputedRef, Ref } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import { isUnder, matchPage, normalizePath } from './match'
import type { PageList } from './page-list'
import type { PageMatch } from './types'

/** What a shell route that hosts pages should show for its current path. */
export type HostedPageState =
  /** The first page list has not arrived yet. */
  | { status: 'loading' }
  /** The page list could not be read. */
  | { status: 'error', error: unknown }
  /** No listed page lives at this path. Treat it as not found. */
  | { status: 'none' }
  /** The page that was open here left the list (removed, or access withdrawn). */
  | { status: 'gone', pageId: string }
  | { status: 'ready', match: PageMatch }

export interface HostedPageOptions {
  pageList: Pick<PageList, 'pages' | 'ready' | 'error'>
  /** The shell router's current path. */
  path: Readonly<Ref<string>>
  /** Page ids the shell must never host, such as its own id. */
  exclude?: readonly string[]
}

/**
 * Resolves the shell's current path to a listed page. The shell renders the
 * page with `<w-artifact type="page" :id="match.page.id" nav-owner
 * :sub-path="match.subPath">`, and maps each `nav-owner-route` back with
 * `joinPath(match.prefix, path)`.
 */
export function useHostedPage(options: HostedPageOptions): ComputedRef<HostedPageState> {
  const match = computed(() => matchPage(options.pageList.pages.value, options.path.value, { exclude: options.exclude }))
  const lastMatch = shallowRef<PageMatch | null>(null)
  watch(match, (next) => {
    if (next)
      lastMatch.value = next
  }, { immediate: true, flush: 'sync' })

  return computed<HostedPageState>(() => {
    if (!options.pageList.ready.value) {
      const error = options.pageList.error.value
      return error ? { status: 'error', error } : { status: 'loading' }
    }
    if (match.value)
      return { status: 'ready', match: match.value }
    const last = lastMatch.value
    if (last && isUnder(normalizePath(options.path.value), last.prefix))
      return { status: 'gone', pageId: last.page.id }
    return { status: 'none' }
  })
}
