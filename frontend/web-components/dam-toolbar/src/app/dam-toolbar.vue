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

/**
 * Phase 8 verification — opens the same modal body but forces the
 * legacy div-overlay rendering path (pre-declared in the layout YAML
 * with `useNativeDialog: false`). Lets us A/B-compare native vs legacy
 * in one demo session: focus trap, top-layer stacking, ::backdrop, ESC.
 * Will be removed when the legacy path is dropped in the next major.
 */
function openUploadLegacy() {
  host?.layout.broadcast('app:open-modal', { id: 'upload-legacy' })
}

/**
 * Phase 8 verification — opens a second modal on top of whatever's
 * already open, to confirm the browser's top-layer stacking + ESC-
 * closes-topmost-only behavior with the native dialog.
 */
function openSecondModal() {
  host?.layout.broadcast('app:open-modal', { id: 'upload-second' })
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
    <button class="dam-toolbar__btn" type="button" title="Force legacy div-overlay modal" @click="openUploadLegacy">
      <Icon icon="tabler:upload" class="w-4 h-4" /> Upload (legacy)
    </button>
    <button class="dam-toolbar__btn" type="button" title="Open a second modal on top" @click="openSecondModal">
      <Icon icon="tabler:stack-2" class="w-4 h-4" /> Open 2nd
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
