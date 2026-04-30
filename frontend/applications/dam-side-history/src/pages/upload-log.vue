<script setup lang="ts">
import { Icon } from '@iconify/vue'
const events = [
  { t: '14:32', kind: 'success', msg: 'Uploaded IMG_2026008.jpg (2.4MB)' },
  { t: '14:29', kind: 'success', msg: 'Uploaded IMG_2026007.jpg (1.7MB)' },
  { t: '14:21', kind: 'warn',    msg: 'Skipped IMG_2026006.jpg (duplicate)' },
  { t: '14:18', kind: 'success', msg: 'Uploaded IMG_2026005.jpg (3.1MB)' },
  { t: '14:14', kind: 'error',   msg: 'Failed IMG_2026004.jpg (network)' },
]
</script>

<template>
  <div class="h-full overflow-auto p-3 text-xs bg-surface-50 dark:bg-surface-900">
    <h3 class="mb-2 font-semibold flex items-center gap-1.5"><Icon icon="tabler:upload" class="w-3.5 h-3.5" /> Upload Log</h3>
    <ul class="space-y-1.5 font-mono">
      <li v-for="e in events" :key="e.t + e.msg" class="bg-surface-0 dark:bg-surface-800 rounded p-2 flex items-start gap-2">
        <span class="text-surface-400 shrink-0">{{ e.t }}</span>
        <span :class="{
          'text-emerald-500': e.kind === 'success',
          'text-amber-500': e.kind === 'warn',
          'text-red-500': e.kind === 'error',
        }">{{ e.msg }}</span>
      </li>
    </ul>
  </div>
</template>
