<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import HostedFrame from '../components/hosted-frame.vue'

/**
 * Nested Navigation Demo — embeds iframe-demo as a nav-owner, through the same
 * HostedFrame that opens registry pages (dashboards) inside this app.
 * The iframe-demo's internal tabs use standard vue-router RouterLink.
 * Tab clicks update the browser URL. Try clicking tabs, then use browser back/forward.
 */
const route = useRoute()

const navOwnerSubPath = computed(() => {
  const part = route.params.part
  if (Array.isArray(part))
    return `/${part.join('/')}`
  if (typeof part === 'string' && part)
    return `/${part}`
  return '/'
})
</script>

<template>
  <div class="p-4 h-full flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-bold text-surface-800 dark:text-surface-100 mb-1">
        Nested Navigation
      </h1>
      <p class="text-sm text-surface-500">
        The iframe-demo app below is a <strong>nav-owner</strong>.
        Its internal tab navigation uses standard
        <code class="text-xs bg-surface-100 dark:bg-surface-700 px-1 rounded">RouterLink</code>
        from vue-router. Tab clicks update the browser URL.
        Try clicking tabs, then use browser back/forward.
      </p>
    </div>

    <div class="flex-1 min-h-0 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
      <HostedFrame
        page-id="app.views:iframe-demo"
        base-path="/nested-nav"
        :sub-path="navOwnerSubPath"
      />
    </div>
  </div>
</template>
