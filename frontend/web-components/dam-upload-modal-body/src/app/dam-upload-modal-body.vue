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

<style scoped>
.dam-modal {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  gap: 1.5rem;
  font-family: 'Poppins', system-ui, sans-serif;
  background: var(--p-surface-0, #fff);
}
.dam-modal__header { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 1.1rem; }
.dam-modal__header h2 { margin: 0; font-size: inherit; }
.dam-modal__dropzone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 2px dashed var(--p-surface-300, #d4d4d8);
  border-radius: 8px;
  background: var(--p-surface-50, #fafafa);
  color: var(--p-surface-500, #71717a);
  cursor: pointer;
}
.dam-modal__hint { font-size: 0.8rem; opacity: 0.7; }
.dam-modal__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.dam-modal__btn {
  padding: 0.5rem 1rem;
  background: var(--p-surface-100, #f4f4f5);
  border: 1px solid var(--p-surface-200, #e4e4e7);
  border-radius: 6px;
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
.dam-modal__btn--primary { background: var(--p-primary, #6366f1); color: #fff; border-color: var(--p-primary, #6366f1); }
</style>
