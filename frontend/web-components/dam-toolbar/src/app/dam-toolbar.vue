<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useHost } from '@wippy-fe/webcomponent-vue'
import type { ProxyApiInstance } from '@wippy-fe/proxy'

const host = useHost<ProxyApiInstance['host']>()
const density = ref<'compact' | 'comfy' | 'spacious'>('comfy')
const search = ref('')

function openUpload() {
  host?.layout.broadcast('app:open-modal', { id: 'upload' })
}

function setDensity(value: 'compact' | 'comfy' | 'spacious') {
  density.value = value
  host?.layout.broadcast('app:density', { value })
}
</script>

<template>
  <div class="dam-toolbar">
    <button class="dam-toolbar__btn dam-toolbar__btn--primary" type="button" @click="openUpload">
      <Icon icon="tabler:upload" class="w-4 h-4" /> Upload
    </button>
    <button class="dam-toolbar__btn" type="button">
      <Icon icon="tabler:download" class="w-4 h-4" /> Export
    </button>
    <button class="dam-toolbar__btn" type="button">
      <Icon icon="tabler:trash" class="w-4 h-4" /> Delete
    </button>
    <div class="dam-toolbar__sep" />
    <div class="dam-toolbar__search">
      <Icon icon="tabler:search" class="w-4 h-4" />
      <input v-model="search" type="search" placeholder="Search assets..." />
    </div>
    <div class="dam-toolbar__density">
      <span class="dam-toolbar__density-label">Density:</span>
      <button
        v-for="d in (['compact', 'comfy', 'spacious'] as const)"
        :key="d"
        type="button"
        class="dam-toolbar__density-btn"
        :class="{ 'dam-toolbar__density-btn--active': density === d }"
        @click="setDensity(d)"
      >
        {{ d }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dam-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  background: var(--p-surface-0, #fff);
  border-bottom: 1px solid var(--p-surface-200, #e4e4e7);
  font-family: 'Poppins', system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .dam-toolbar { background: var(--p-surface-950, #09090b); border-bottom-color: var(--p-surface-700, #27272a); }
}
.dam-toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.7rem;
  background: var(--p-surface-100, #f4f4f5);
  border: 1px solid var(--p-surface-200, #e4e4e7);
  border-radius: 6px;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.dam-toolbar__btn:hover { background: var(--p-surface-200, #e4e4e7); }
.dam-toolbar__btn--primary { background: var(--p-primary, #6366f1); color: #fff; border-color: var(--p-primary, #6366f1); }
.dam-toolbar__btn--primary:hover { background: var(--p-primary-600, #4f46e5); }
.dam-toolbar__sep { width: 1px; align-self: stretch; background: var(--p-surface-200, #e4e4e7); margin: 0 0.25rem; }
.dam-toolbar__search {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 320px;
  padding: 0 0.5rem;
  background: var(--p-surface-50, #fafafa);
  border: 1px solid var(--p-surface-200, #e4e4e7);
  border-radius: 6px;
  height: 30px;
}
.dam-toolbar__search input { flex: 1; border: none; outline: none; background: transparent; font: inherit; font-size: 0.85rem; }
.dam-toolbar__density { display: flex; align-items: center; gap: 0.25rem; margin-left: auto; }
.dam-toolbar__density-label { font-size: 0.8rem; opacity: 0.7; }
.dam-toolbar__density-btn {
  padding: 0.2rem 0.5rem;
  background: transparent;
  border: 1px solid transparent;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 4px;
  text-transform: capitalize;
}
.dam-toolbar__density-btn:hover { background: var(--p-surface-100, #f4f4f5); }
.dam-toolbar__density-btn--active {
  background: var(--p-primary-100, #e0e7ff);
  color: var(--p-primary-700, #4338ca);
}
</style>
