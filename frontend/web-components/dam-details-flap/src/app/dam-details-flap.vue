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
