<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{ id: string }>()
</script>

<template>
  <div class="h-full overflow-auto bg-surface-50 dark:bg-surface-900 p-4">
    <h2 class="mb-3 text-sm font-semibold flex items-center gap-2">
      <Icon icon="tabler:zoom-scan" class="w-4 h-4 text-primary" /> Asset Detail
    </h2>
    <div class="bg-surface-0 dark:bg-surface-800 rounded-md p-4 text-xs space-y-2">
      <div><strong class="text-surface-400">ID:</strong> <span class="font-mono">{{ id }}</span></div>
      <div class="aspect-video bg-gradient-to-br from-surface-200 to-surface-300 dark:from-surface-700 dark:to-surface-800 rounded grid place-items-center">
        <Icon icon="tabler:photo" class="w-16 h-16 text-surface-400" />
      </div>
      <div><strong class="text-surface-400">Type:</strong> Image (JPEG)</div>
      <div><strong class="text-surface-400">Size:</strong> 2.4 MB</div>
      <div><strong class="text-surface-400">Uploaded:</strong> 2026-04-30</div>
    </div>
  </div>
</template>
