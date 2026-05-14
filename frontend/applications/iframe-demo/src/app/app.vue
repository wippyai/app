<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { Icon } from '@iconify/vue'

const route = useRoute()

const tabs = [
  { path: '/chart', name: 'chart', label: 'Chart', icon: 'tabler:chart-pie' },
  { path: '/counter', name: 'counter', label: 'Counter', icon: 'tabler:plus-minus' },
  { path: '/mermaid', name: 'mermaid', label: 'Mermaid', icon: 'tabler:git-merge' },
]

const currentName = computed(() => route.name)

const primaryColor = ref('')
onMounted(() => {
  primaryColor.value = getComputedStyle(document.documentElement)
    .getPropertyValue('--p-primary-500').trim() || '#3b82f6'
})
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="flex items-center gap-3 px-4 py-2 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800">
      <div
        class="w-3 h-3 rounded-full shrink-0"
        :style="{ background: primaryColor }"
      />
      <span class="text-sm font-semibold text-surface-700 dark:text-surface-200">
        Iframe Demo
      </span>
      <span class="text-xs text-surface-400 font-mono">
        primary: {{ primaryColor }}
      </span>

      <nav class="flex gap-1 ml-auto">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          :to="tab.path"
          class="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors no-underline"
          :class="currentName === tab.name || (currentName === 'home' && tab.name === 'chart')
            ? 'bg-primary/10 text-primary'
            : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
        >
          <Icon :icon="tab.icon" class="w-3.5 h-3.5" />
          {{ tab.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="flex-1 overflow-y-auto p-3 bg-surface-0 dark:bg-surface-900">
      <router-view />
    </main>
  </div>
</template>
