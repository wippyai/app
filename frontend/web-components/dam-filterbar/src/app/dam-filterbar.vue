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
