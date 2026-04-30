<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useHost } from '@wippy-fe/webcomponent-vue'
import type { ProxyApiInstance } from '@wippy-fe/proxy'

const host = useHost<ProxyApiInstance['host']>()
const expanded = ref(false)

function setRightRoute(route: string) {
  host?.layout.broadcast('app:detail', { panel: 'right', route })
  expanded.value = false
}
</script>

<template>
  <div
    class="dam-flap"
    :class="{ 'dam-flap--expanded': expanded }"
    @mouseenter="expanded = true"
    @mouseleave="expanded = false"
  >
    <button class="dam-flap__chevron" type="button" aria-label="Details menu">
      <Icon icon="tabler:chevron-left" class="w-4 h-4" />
    </button>
    <div v-if="expanded" class="dam-flap__menu">
      <button class="dam-flap__item" type="button" @click="setRightRoute('/display-settings')">
        <Icon icon="tabler:adjustments" class="w-4 h-4" /> Display Settings
      </button>
      <button class="dam-flap__item" type="button" @click="setRightRoute('/upload-log')">
        <Icon icon="tabler:upload" class="w-4 h-4" /> Upload Log
      </button>
    </div>
  </div>
</template>

<style scoped>
.dam-flap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  width: 100%;
  background: var(--p-surface-800, #1a1a1c);
  color: var(--p-surface-0, #fff);
  border-radius: 6px 0 0 6px;
  overflow: visible;
  font-family: 'Poppins', system-ui, sans-serif;
}
.dam-flap__chevron {
  flex: 1;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  width: 36px;
}
.dam-flap__chevron:hover { background: var(--p-surface-700, #27272a); }
.dam-flap__menu {
  position: absolute;
  right: 36px;
  top: 0;
  background: var(--p-surface-800, #1a1a1c);
  border-radius: 6px 0 0 6px;
  box-shadow: -4px 4px 12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  min-width: 200px;
  padding: 0.25rem 0;
}
.dam-flap__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;
}
.dam-flap__item:hover { background: var(--p-surface-700, #27272a); }
</style>
