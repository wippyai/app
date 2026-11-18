<script setup lang="ts">
import { inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { joinPath } from '@example/app-nav'
import { NOTE_NAVIGATION } from '../constants'

/**
 * Shows another view.page inside this app, under the sidebar. The page is a
 * nav-owner: its own route changes arrive as `nav-owner-route` and become
 * routes of this app, so the browser URL, a reload, and back and forward all
 * cover the hosted page's own navigation.
 */
const props = defineProps<{
  /** Registry id of the page, for example `wippy.dashboards.pages:llm_usage`. */
  pageId: string
  /** The path in this app where the page lives. Its own routes extend it. */
  basePath: string
  /** The hosted page's own path below `basePath`, `/` at its root, with any query and hash. */
  subPath: string
}>()

const route = useRoute()
const router = useRouter()
const noteNavigation = inject(NOTE_NAVIGATION, () => {})

function onNavOwnerRoute(event: Event) {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path
  if (!path)
    return
  // joinPath keeps the hosted page's query and hash. The router normalizes the
  // encoding of both sides, and its decoding never throws on a stray `%`.
  const next = joinPath(props.basePath, path)
  if (router.resolve(next).fullPath !== route.fullPath) {
    noteNavigation()
    router.push(next)
  }
}
</script>

<template>
  <!-- Keyed by page: another page gets a fresh frame, a new sub-path does not. -->
  <w-artifact
    :id="pageId"
    :key="pageId"
    type="page"
    nav-owner
    :sub-path="subPath"
    class="block h-full"
    @nav-owner-route="onNavOwnerRoute"
  />
</template>
