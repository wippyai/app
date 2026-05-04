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
