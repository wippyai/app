<script setup lang="ts">
import { Icon } from '@iconify/vue'
const items = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  user: ['Alex', 'Jamie', 'Sam', 'Riley'][i % 4],
  action: ['edited', 'tagged', 'reviewed', 'deleted'][i % 4],
  what: `asset-${100 + i}`,
  when: `${i + 1}h ago`,
}))
</script>

<template>
  <div class="h-full overflow-auto p-3 text-xs bg-surface-50 dark:bg-surface-900">
    <h3 class="mb-2 font-semibold flex items-center gap-1.5"><Icon icon="tabler:history" class="w-3.5 h-3.5" /> History</h3>
    <ul class="space-y-1.5">
      <li v-for="i in items" :key="i.id" class="bg-surface-0 dark:bg-surface-800 rounded p-2">
        <span class="font-medium">{{ i.user }}</span> <span class="text-surface-400">{{ i.action }}</span>
        <span class="font-mono text-primary">{{ i.what }}</span>
        <div class="text-surface-400 mt-0.5">{{ i.when }}</div>
      </li>
    </ul>
  </div>
</template>
