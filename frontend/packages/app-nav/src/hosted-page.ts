import type { ComputedRef, Ref } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import { isUnder, matchPage, normalizePath } from './match'
import type { PageList } from './page-list'
import type { PageMatch } from './types'

/** What a shell route that hosts pages should show for its current path. */
export type HostedPageState =
  /** The first page list has not arrived yet, or a fresh read is checking the path. */
  | { status: 'loading' }
  /** The page list could not be read: the first read, or the fresh read that checked this path. */
  | { status: 'error', error: unknown }
  /** No listed page lives at this path, even after a fresh read. Treat it as not found. */
  | { status: 'none' }
  /** The page that was open here left the list (removed, or access withdrawn). */
  | { status: 'gone', pageId: string }
  | { status: 'ready', match: PageMatch }

export interface HostedPageOptions {
  pageList: Pick<PageList, 'pages' | 'ready' | 'error' | 'refresh'>
  /** The shell router's current path, with its query and hash if it has them. */
  path: Readonly<Ref<string>>
  /** Page ids the shell must never host, such as its own id. */
  exclude?: readonly string[]
}

/**
 * Resolves the shell's current path to a listed page. The shell renders the
 * page with `<w-artifact type="page" :id="match.page.id" nav-owner
 * :sub-path="match.subPath">`, and maps each `nav-owner-route` back with
 * `joinPath(match.prefix, path)`.
 *
 * A path that the cached list does not know is checked with one fresh read
 * before it counts as `none`, so a page published a moment ago (for example
 * one an agent opens right after building it) is found, not sent away. Only a
 * successful read gives `none`; a failed one gives `error`. Leaving the path
 * forgets the result, so a later visit reads again.
 */
export function useHostedPage(options: HostedPageOptions): ComputedRef<HostedPageState> {
  const bare = computed(() => normalizePath(options.path.value))
  const match = computed(() => matchPage(options.pageList.pages.value, options.path.value, { exclude: options.exclude }))
  const lastMatch = shallowRef<PageMatch | null>(null)
  // The result of the fresh read that checked a path the list did not know.
  const checked = shallowRef<{ path: string, error: unknown } | null>(null)
  let checking: string | null = null

  watch(match, (next) => {
    if (next)
      lastMatch.value = next
  }, { immediate: true, flush: 'sync' })

  // Leaving a path forgets what was learned there: an open page that left the
  // list is not "gone" on a later visit, and a checked path is read again.
  watch(bare, (path) => {
    if (lastMatch.value && !isUnder(path, lastMatch.value.prefix))
      lastMatch.value = null
    if (checked.value && checked.value.path !== path)
      checked.value = null
  }, { flush: 'sync' })

  watch(
    () => [options.pageList.ready.value, match.value, bare.value] as const,
    ([ready, found, path]) => {
      if (!ready || found || checked.value?.path === path || checking === path)
        return
      checking = path
      void options.pageList.refresh().finally(() => {
        if (checking !== path)
          return
        checking = null
        // A result for a path the shell has left would be stale on return.
        if (bare.value === path)
          checked.value = { path, error: options.pageList.error.value ?? null }
      })
    },
    { immediate: true, flush: 'sync' },
  )

  // A later successful read (a `pages` signal, a reconnect) settles a check that failed.
  watch(() => options.pageList.error.value ?? null, (error) => {
    const last = checked.value
    if (error === null && last && last.error !== null && last.path === bare.value)
      checked.value = { path: last.path, error: null }
  }, { flush: 'sync' })

  return computed<HostedPageState>(() => {
    if (!options.pageList.ready.value) {
      const error = options.pageList.error.value
      return error ? { status: 'error', error } : { status: 'loading' }
    }
    if (match.value)
      return { status: 'ready', match: match.value }
    const last = lastMatch.value
    if (last && isUnder(bare.value, last.prefix))
      return { status: 'gone', pageId: last.page.id }
    const result = checked.value
    if (!result || result.path !== bare.value)
      return { status: 'loading' }
    return result.error !== null ? { status: 'error', error: result.error } : { status: 'none' }
  })
}
