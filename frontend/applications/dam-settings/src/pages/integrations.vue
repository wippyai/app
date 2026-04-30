<script setup lang="ts">
import { Icon } from '@iconify/vue'
</script>

<template>
  <div class="h-full overflow-auto bg-surface-50 dark:bg-surface-900 p-4 text-xs">
    <h2 class="mb-3 text-sm font-semibold flex items-center gap-2">
      <Icon icon="tabler:plug" class="w-4 h-4 text-primary" /> Integrations
    </h2>
    <div class="bg-surface-0 dark:bg-surface-800 rounded-md p-4 space-y-2 text-surface-400">
      No integrations configured.
    </div>
  </div>
</template>
