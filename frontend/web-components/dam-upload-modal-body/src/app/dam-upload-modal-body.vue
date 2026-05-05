<script setup lang="ts">
import type { ProxyApiInstance } from '@wippy-fe/proxy'
import { Icon } from '@iconify/vue'
import { useHost, usePanelId } from '@wippy-fe/webcomponent-vue'

const host = useHost<ProxyApiInstance['host']>()
// `usePanelId()` reads `data-wippy-panel-id`, which `wirePanelContext`
// sets to the modal slot id (= the modal id) for components mounted
// inside `LayoutModalNative` / `LayoutModal` via `PanelSlotContext`.
// Echo it back in the close broadcast so the coordinator routes the
// dismissal when several modals are stacked.
const panelId = usePanelId()

function close() {
  if (!panelId)
    return
  host?.layout.broadcast('app:close-modal', { id: panelId })
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
      <p class="dam-modal__hint">
        Up to 100 files • Images, videos, docs
      </p>
    </div>
    <div class="dam-modal__actions">
      <button class="dam-modal__btn" type="button" @click="close">
        Cancel
      </button>
      <button class="dam-modal__btn dam-modal__btn--primary" type="button" @click="close">
        Done
      </button>
    </div>
  </div>
</template>
