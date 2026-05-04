<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useHost } from '@wippy-fe/webcomponent-vue'
import type { ProxyApiInstance } from '@wippy-fe/proxy'

const host = useHost<ProxyApiInstance['host']>()
const expanded = ref(false)

function setLeftRoute(route: string) {
  host?.layout.broadcast('app:detail', { panel: 'left', route })
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
    <button class="dam-flap__chevron" type="button" aria-label="Tools menu">
      <Icon icon="tabler:chevron-right" class="w-4 h-4" />
    </button>
    <div v-if="expanded" class="dam-flap__menu">
      <button class="dam-flap__item" type="button" @click="setLeftRoute('/')">
        <Icon icon="tabler:history" class="w-4 h-4" /> History
      </button>
      <button class="dam-flap__item" type="button" @click="setLeftRoute('/upload-log')">
        <Icon icon="tabler:upload" class="w-4 h-4" /> Upload Log
      </button>
      <button class="dam-flap__item" type="button" @click="setLeftRoute('/display-settings')">
        <Icon icon="tabler:adjustments" class="w-4 h-4" /> Display
      </button>
    </div>
  </div>
</template>
