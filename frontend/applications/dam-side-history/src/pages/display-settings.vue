<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
const size = ref(50)
</script>

<template>
  <div class="h-full overflow-auto p-3 text-xs bg-surface-50 dark:bg-surface-900">
    <h3 class="mb-2 font-semibold flex items-center gap-1.5"><Icon icon="tabler:adjustments" class="w-3.5 h-3.5" /> Display Settings</h3>
    <div class="bg-surface-0 dark:bg-surface-800 rounded p-3 space-y-3">
      <div>
        <label class="block mb-1">Thumbnail size: {{ size }}%</label>
        <input v-model.number="size" type="range" min="25" max="100" class="w-full" />
      </div>
      <label class="flex items-center justify-between">
        <span>Show metadata</span>
        <input type="checkbox" checked />
      </label>
      <label class="flex items-center justify-between">
        <span>Show file types</span>
        <input type="checkbox" checked />
      </label>
    </div>
  </div>
</template>
