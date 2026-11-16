<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { joinPath } from '@example/app-nav'

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
  /** The hosted page's own path below `basePath`, `/` at its root. */
  subPath: string
}>()

const route = useRoute()
const router = useRouter()

function onNavOwnerRoute(event: Event) {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path
  if (!path)
    return
  const next = joinPath(props.basePath, path)
  if (route.path !== next)
    router.push(next)
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
