<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { config } from '@wippy-fe/proxy'
import { useHostedPage } from '@example/app-nav'
import HostedFrame from '../components/hosted-frame.vue'
import { usePages } from '../composables/useWippy'

/**
 * The catch-all route. A path that belongs to a page from the registry (for
 * example a dashboard at /reports/llm-usage) shows that page here, under the
 * sidebar. The page list is live, so a page published a moment ago opens too.
 */
const route = useRoute()
const router = useRouter()
const pages = usePages()

// This app must never host itself: its own mount route would match.
const ownPageId = config.selfPageId ?? config.context?.resourceId
const state = useHostedPage({
  pageList: pages,
  path: computed(() => route.path),
  exclude: ownPageId ? [ownPageId] : [],
})

// No listed page lives here: the link is broken, so go Home, as before.
watch(() => state.value.status, (status) => {
  if (status === 'none')
    router.replace('/')
}, { immediate: true })
</script>

<template>
  <div class="h-full">
    <HostedFrame
      v-if="state.status === 'ready'"
      :page-id="state.match.page.id"
      :base-path="state.match.prefix"
      :sub-path="state.match.subPath"
    />
    <wippy-loading
      v-else-if="state.status === 'loading'"
      title="Loading page..."
      no-bg
    />
    <div
      v-else-if="state.status === 'gone' || state.status === 'error'"
      class="h-full flex flex-col items-center justify-center gap-4 p-6"
    >
      <!-- h-auto: the element fills its parent's height by default. -->
      <wippy-error
        v-if="state.status === 'gone'"
        class="h-auto flex-none"
        title="This page is no longer available"
        message="It was removed, or you can no longer open it."
        icon="sad"
        severity="warning"
        no-bg
      />
      <wippy-error
        v-else
        class="h-auto flex-none"
        title="Pages could not be loaded"
        message="Check your connection and reload the app."
        icon="triangle"
        severity="danger"
        no-bg
      />
      <Button
        label="Go to Home"
        severity="secondary"
        outlined
        @click="router.push('/')"
      />
    </div>
  </div>
</template>
