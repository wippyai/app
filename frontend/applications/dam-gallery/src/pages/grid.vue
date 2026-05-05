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
  thumb: string
}

/**
 * Image source: Lorem Picsum (https://picsum.photos). Seeded URLs
 * (`/seed/<key>/W/H`) are deterministic — same seed always returns the
 * same photo — and don't require an API key. We hit the small 400×300
 * variant for thumbnails; cards display them via `object-fit: cover`.
 */
const assets = computed<Asset[]>(() => Array.from({ length: 24 }, (_, i) => {
  const id = `asset-${i + 1}`
  return {
    id,
    name: `IMG_${(2026000 + i).toString()}.jpg`,
    size: `${(0.4 + ((i * 17) % 47) / 10).toFixed(1)} MB`,
    uploadedAt: new Date(Date.now() - i * 3600_000 * 7).toISOString().slice(0, 10),
    thumb: `https://picsum.photos/seed/dam-${i + 1}/400/300`,
  }
}))

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

/**
 * Density now controls the MIN column width rather than a fixed column
 * count — the grid uses `auto-fill` so the renderer picks how many
 * columns fit at the current container width. Combined with the
 * `min(<minPx>, 100%)` floor, single-column narrow viewports won't
 * overflow horizontally (a bare `minmax(200px, 1fr)` blows out the
 * grid when the container is less than 200px wide).
 */
const minCol = computed(() => density.value === 'compact' ? '140px' : density.value === 'spacious' ? '260px' : '200px')
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
      :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minCol}, 100%), 1fr))` }"
    >
      <article
        v-for="a in assets"
        :key="a.id"
        class="group cursor-pointer rounded-md overflow-hidden bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary transition-colors"
        @click="pick(a)"
      >
        <div class="aspect-[4/3] bg-surface-200 dark:bg-surface-800 overflow-hidden">
          <img
            :src="a.thumb"
            :alt="a.name"
            loading="lazy"
            class="w-full h-full object-cover"
          >
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
