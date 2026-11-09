<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, provide, reactive, ref, shallowRef, watch } from 'vue'
import { LayoutManager, LayoutManagerView, LayoutValidationError } from '../../vendor/layout'
import { BOARD_KEY, useComponentProps } from '../constants'
import type { BoardContext } from '../constants'
import type { CompiledTile } from '../types'
import { buildPanels, layoutDeclaration, pageHeight } from '../lib/layout'
import { currentParamValues } from '../lib/params'
import { createRequestIds } from '../lib/frame'
import TileFrame from './tile-frame.vue'

const props = useComponentProps()

const manager = shallowRef<LayoutManager | null>(null)
const layoutError = ref('')
const breakpoint = ref('default')
const requestIds = reactive<Record<string, string>>({})
const ids = createRequestIds()

const tiles = computed<Record<string, CompiledTile>>(() => props.value.tiles ?? {})
const values = computed(() => currentParamValues(props.value.params))

const context: BoardContext = {
  pageUrl: computed(() => props.value.pageUrl ?? ''),
  tiles,
  values,
  requestIds,
  retry(tileId: string) {
    if (tileId in requestIds)
      requestIds[tileId] = ids.next(tileId)
  },
}
provide(BOARD_KEY, context)

/** Give each new or changed tile a request-id, and drop the ids of removed tiles. */
const seen = new Map<string, string>()
function syncRequestIds() {
  const live = new Set(Object.keys(tiles.value))
  for (const id of live) {
    const serialized = JSON.stringify(tiles.value[id])
    if (seen.get(id) !== serialized) {
      seen.set(id, serialized)
      requestIds[id] = ids.next(id)
    }
  }
  for (const id of [...seen.keys()]) {
    if (!live.has(id)) {
      seen.delete(id)
      Reflect.deleteProperty(requestIds, id)
    }
  }
}

let appliedKey = ''
function syncLayout() {
  const layout = props.value.layout
  const tileIds = Object.keys(tiles.value)
  if (!layout?.layouts?.default || tileIds.length === 0) {
    appliedKey = ''
    manager.value = null
    layoutError.value = ''
    return
  }
  // Panels hold the same component for every tile, so the layout and the tile ids are the whole key.
  const key = JSON.stringify([layout, tileIds])
  if (key === appliedKey)
    return
  try {
    const declaration = layoutDeclaration(layout, buildPanels(tileIds, markRaw(TileFrame)))
    if (manager.value) {
      manager.value.setLayout(declaration as never)
    }
    else {
      // Separators stay off: a dashboard page is read-only, so nobody resizes a tile by dragging.
      const created = new LayoutManager(declaration as never, { separatorDrag: false })
      created.on('breakpoint', ({ name }: { name: string }) => {
        breakpoint.value = name
      })
      breakpoint.value = created.activeBreakpoint
      manager.value = created
    }
    appliedKey = key
    layoutError.value = ''
  }
  catch (err) {
    manager.value = null
    appliedKey = ''
    layoutError.value = err instanceof LayoutValidationError
      ? err.issues.map((issue: { message: string }) => issue.message).join('; ')
      : (err instanceof Error ? err.message : String(err))
  }
}

watch(() => props.value.tiles, syncRequestIds, { immediate: true, deep: true })
watch(() => [props.value.layout, props.value.tiles], syncLayout, { immediate: true, deep: true })

const canvasHeight = computed(() => {
  const height = pageHeight(props.value.layout, breakpoint.value)
  return height > 0 ? `${height}px` : undefined
})

onBeforeUnmount(() => {
  manager.value = null
})
</script>

<template>
  <div
    class="board"
    data-board
  >
    <p
      v-if="layoutError"
      class="board__notice board__notice--error"
      role="alert"
    >
      This page layout is not valid: {{ layoutError }}
    </p>
    <div
      v-else-if="manager"
      class="board__canvas"
      data-board-canvas
      :data-breakpoint="breakpoint"
      :style="{ height: canvasHeight }"
    >
      <LayoutManagerView :manager="manager" />
    </div>
    <p
      v-else
      class="board__notice"
    >
      This page has no tiles yet.
    </p>
  </div>
</template>
