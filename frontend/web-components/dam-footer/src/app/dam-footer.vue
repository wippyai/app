<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useHost } from '@wippy-fe/webcomponent-vue'
import type { ProxyApiInstance } from '@wippy-fe/proxy'

const host = useHost<ProxyApiInstance['host']>()
const breakpoint = ref(host?.layout.snapshot?.activeBreakpoint ?? 'default')

host?.layout.on('@layout-breakpoint', (env) => {
  const p = env.payload as { name: string }
  breakpoint.value = p.name
})
</script>

<template>
  <footer class="dam-footer">
    <span class="dam-footer__pill">
      <Icon icon="tabler:circle-check" class="w-3 h-3" />
      <span>Connected</span>
    </span>
    <span class="dam-footer__breakpoint" :title="`Active layout breakpoint: ${breakpoint}`">
      <Icon icon="tabler:device-desktop" class="w-3 h-3" />
      {{ breakpoint }}
    </span>
    <span class="dam-footer__version">v1.0.0</span>
  </footer>
</template>

<style scoped>
.dam-footer {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 0.75rem;
  background: var(--p-surface-900, #0b0b0c);
  color: var(--p-surface-300, #b3b3b6);
  border-top: 1px solid var(--p-surface-700, #2a2a2e);
  font-family: 'Poppins', system-ui, sans-serif;
  font-size: 0.75rem;
}
.dam-footer__pill { display: inline-flex; align-items: center; gap: 0.25rem; }
.dam-footer__breakpoint {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--p-primary-900, #312e81);
  color: var(--p-primary-300, #a5b4fc);
  font-variant-numeric: tabular-nums;
}
.dam-footer__version { margin-left: auto; opacity: 0.6; }
</style>
