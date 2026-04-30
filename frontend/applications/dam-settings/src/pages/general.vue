<script setup lang="ts">
import { Icon } from '@iconify/vue'
</script>

<template>
  <div class="h-full overflow-auto bg-surface-50 dark:bg-surface-900 p-4 text-xs">
    <h2 class="mb-3 text-sm font-semibold flex items-center gap-2">
      <Icon icon="tabler:settings" class="w-4 h-4 text-primary" /> General Settings
    </h2>
    <div class="bg-surface-0 dark:bg-surface-800 rounded-md p-4 space-y-3">
      <label class="flex items-center justify-between">
        <span>Show file metadata</span>
        <input type="checkbox" checked />
      </label>
      <label class="flex items-center justify-between">
        <span>Auto-generate thumbnails</span>
        <input type="checkbox" checked />
      </label>
      <label class="flex items-center justify-between">
        <span>Compress on upload</span>
        <input type="checkbox" />
      </label>
    </div>
  </div>
</template>
