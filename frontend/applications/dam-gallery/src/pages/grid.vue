<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { WIPPY_INSTANCE } from '../constants'

interface Wippy {
  on?: (channel: string, cb: (env: unknown) => void) => () => void
}

const wippy = inject<Wippy>(WIPPY_INSTANCE)

const density = ref<'compact' | 'comfy' | 'spacious'>('comfy')

interface Asset {
  id: string
  name: string
  size: string
  uploadedAt: string
}

const assets = computed<Asset[]>(() => Array.from({ length: 24 }, (_, i) => ({
  id: `asset-${i + 1}`,
  name: `IMG_${(2026000 + i).toString()}.jpg`,
  size: `${(0.4 + ((i * 17) % 47) / 10).toFixed(1)} MB`,
  uploadedAt: new Date(Date.now() - i * 3600_000 * 7).toISOString().slice(0, 10),
})))

const primaryColor = ref('')

function pick(asset: Asset) {
  type WGlobal = { $W?: { host?: () => Promise<{ layout?: { broadcast?: (c: string, p: unknown) => void } }> } }
  ;(window as WGlobal).$W?.host?.().then((h) => {
    h.layout?.broadcast?.('app:asset-clicked', { entityId: asset.id })
  })
}

onMounted(() => {
  primaryColor.value = getComputedStyle(document.documentElement)
    .getPropertyValue('--p-primary-500').trim() || '#6366f1'

  wippy?.on?.('app:density', (env) => {
    const p = (env as { payload?: { value?: typeof density.value } }).payload
    if (p?.value) density.value = p.value
  })
})

const cols = computed(() => density.value === 'compact' ? 8 : density.value === 'spacious' ? 4 : 6)
</script>

<template>
  <div class="h-full overflow-auto bg-surface-50 dark:bg-surface-900 p-4">
    <div class="mb-3 flex items-center gap-2">
      <Icon icon="tabler:photo" class="w-4 h-4" :style="{ color: primaryColor }" />
      <h2 class="text-sm font-semibold">Asset Gallery — {{ assets.length }} items</h2>
      <span class="text-xs text-surface-400 ml-auto">density: {{ density }}</span>
    </div>
    <div
      class="grid gap-3"
      :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }"
    >
      <article
        v-for="a in assets"
        :key="a.id"
        class="group cursor-pointer rounded-md overflow-hidden bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary transition-colors"
        @click="pick(a)"
      >
        <div class="aspect-[4/3] bg-gradient-to-br from-surface-200 to-surface-300 dark:from-surface-700 dark:to-surface-800 grid place-items-center">
          <Icon icon="tabler:photo" class="w-8 h-8 text-surface-400" />
        </div>
        <div class="p-2 text-xs">
          <div class="font-mono truncate">{{ a.name }}</div>
          <div class="text-surface-400 mt-1 flex justify-between">
            <span>{{ a.size }}</span>
            <span>{{ a.uploadedAt }}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
