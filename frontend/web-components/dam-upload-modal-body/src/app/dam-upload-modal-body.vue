<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useHost } from '@wippy-fe/webcomponent-vue'
import type { ProxyApiInstance } from '@wippy-fe/proxy'

const host = useHost<ProxyApiInstance['host']>()

function close() {
  host?.layout.broadcast('app:close-modal', {})
}
</script>

<template>
  <div class="dam-modal">
    <div class="dam-modal__header">
      <Icon icon="tabler:upload" class="w-5 h-5" />
      <h2>Upload Assets</h2>
    </div>
    <div class="dam-modal__dropzone">
      <Icon icon="tabler:cloud-upload" class="w-12 h-12" />
      <p>Drop files here or click to browse</p>
      <p class="dam-modal__hint">Up to 100 files • Images, videos, docs</p>
    </div>
    <div class="dam-modal__actions">
      <button class="dam-modal__btn" type="button" @click="close">Cancel</button>
      <button class="dam-modal__btn dam-modal__btn--primary" type="button" @click="close">Done</button>
    </div>
  </div>
</template>
