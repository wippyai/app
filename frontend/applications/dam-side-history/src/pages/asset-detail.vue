<script setup lang="ts">
import { Icon } from '@iconify/vue'
defineProps<{ id: string }>()
</script>

<template>
  <div class="h-full overflow-auto p-3 text-xs bg-surface-50 dark:bg-surface-900">
    <h3 class="mb-2 font-semibold flex items-center gap-1.5"><Icon icon="tabler:zoom-scan" class="w-3.5 h-3.5" /> Asset</h3>
    <div class="bg-surface-0 dark:bg-surface-800 rounded p-3 space-y-2">
      <div class="aspect-video bg-gradient-to-br from-surface-200 to-surface-300 dark:from-surface-700 dark:to-surface-800 rounded grid place-items-center">
        <Icon icon="tabler:photo" class="w-12 h-12 text-surface-400" />
      </div>
      <div><strong class="text-surface-400">ID:</strong> <span class="font-mono text-primary">{{ id }}</span></div>
      <div><strong class="text-surface-400">Type:</strong> JPEG</div>
      <div><strong class="text-surface-400">Size:</strong> 2.4 MB</div>
    </div>
  </div>
</template>
