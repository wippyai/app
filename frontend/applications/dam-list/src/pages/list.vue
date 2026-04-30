<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const rows = computed(() => Array.from({ length: 24 }, (_, i) => ({
  id: `asset-${i + 1}`,
  name: `IMG_${(2026000 + i).toString()}.jpg`,
  size: `${(0.4 + ((i * 17) % 47) / 10).toFixed(1)} MB`,
  uploadedAt: new Date(Date.now() - i * 3600_000 * 7).toISOString().slice(0, 10),
})))
</script>

<template>
  <div class="h-full overflow-auto bg-surface-50 dark:bg-surface-900 p-4">
    <h2 class="mb-3 text-sm font-semibold flex items-center gap-2">
      <Icon icon="tabler:list" class="w-4 h-4 text-primary" /> Asset List
    </h2>
    <table class="w-full text-xs bg-surface-0 dark:bg-surface-800 rounded-md overflow-hidden">
      <thead class="bg-surface-100 dark:bg-surface-700 text-left">
        <tr><th class="px-3 py-2">Name</th><th class="px-3 py-2">Size</th><th class="px-3 py-2">Uploaded</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="border-t border-surface-200 dark:border-surface-700">
          <td class="px-3 py-2 font-mono">{{ r.name }}</td>
          <td class="px-3 py-2">{{ r.size }}</td>
          <td class="px-3 py-2 text-surface-400">{{ r.uploadedAt }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
