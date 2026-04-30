<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

const filters = ref([
  { id: 'all',     label: 'All',     active: true },
  { id: 'images',  label: 'Images',  active: false },
  { id: 'videos',  label: 'Videos',  active: false },
  { id: 'docs',    label: 'Docs',    active: false },
  { id: 'recent',  label: 'Recent',  active: false },
])

function toggle(id: string) {
  filters.value = filters.value.map(f => ({ ...f, active: f.id === id }))
}
</script>

<template>
  <div class="dam-filterbar">
    <Icon icon="tabler:filter" class="w-4 h-4 dam-filterbar__icon" />
    <button
      v-for="f in filters"
      :key="f.id"
      type="button"
      class="dam-filterbar__chip"
      :class="{ 'dam-filterbar__chip--active': f.active }"
      @click="toggle(f.id)"
    >
      {{ f.label }}
    </button>
  </div>
</template>

<style scoped>
.dam-filterbar {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 1rem;
  background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-surface-200, #e4e4e7);
  font-family: 'Poppins', system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .dam-filterbar { background: var(--p-surface-900, #18181b); border-bottom-color: var(--p-surface-700, #27272a); }
}
.dam-filterbar__icon { color: var(--p-surface-500, #71717a); margin-right: 0.25rem; }
.dam-filterbar__chip {
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--p-surface-300, #d4d4d8);
  background: var(--p-surface-0, #fff);
  border-radius: 999px;
  font: inherit;
  font-size: 0.8rem;
  color: var(--p-surface-700, #3f3f46);
  cursor: pointer;
}
.dam-filterbar__chip:hover { background: var(--p-surface-100, #f4f4f5); }
.dam-filterbar__chip--active {
  background: var(--p-primary, #6366f1);
  color: #fff;
  border-color: var(--p-primary, #6366f1);
}
</style>
