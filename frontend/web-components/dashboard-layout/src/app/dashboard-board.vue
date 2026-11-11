<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, provide, reactive, ref, shallowRef, watch } from 'vue'
import Button from 'primevue/button'
import { LayoutManager, LayoutManagerView, LayoutValidationError } from '../../vendor/layout'
import { BOARD_KEY, useComponentProps } from '../constants'
import type { BoardContext } from '../constants'
import type { CompiledTile, TileEventDetail } from '../types'
import { buildPanels, layoutDeclaration, pageHeight } from '../lib/layout'
import {
  acceptTileEvent,
  activeSelections,
  changedParams,
  changesAfterPathChange,
  clearedChanges,
  currentParamValues,
  tilesToRefreshAfterAction,
  tilesToRefreshFor,
} from '../lib/params'
import type { ParamValues } from '../lib/params'
import { createRequestIds } from '../lib/frame'
import TileFrame from './tile-frame.vue'

const props = useComponentProps()

const manager = shallowRef<LayoutManager | null>(null)
const layoutError = ref('')
const breakpoint = ref('default')
const requestIds = reactive<Record<string, string>>({})
const ids = createRequestIds()

const tiles = computed<Record<string, CompiledTile>>(() => props.value.tiles ?? {})
// The viewer's changes sit on top of the default and the `from_path` value (contracts section 6).
const userChanges = ref<ParamValues>({})
const values = computed(() => currentParamValues(props.value.params, props.value.subPath ?? '', userChanges.value))
const selections = computed(() => activeSelections(props.value.params, values.value))

const board = ref<HTMLElement | null>(null)
const selectionsBar = ref<HTMLElement | null>(null)

const context: BoardContext = {
  pageUrl: computed(() => props.value.pageUrl ?? ''),
  tiles,
  values,
  requestIds,
  retry(tileId: string) {
    if (tileId in requestIds)
      requestIds[tileId] = ids.next(tileId)
  },
  tileEvent(tileId: string, detail: TileEventDetail) {
    const changes = acceptTileEvent(tiles.value[tileId], requestIds[tileId], detail, props.value.params)
    if (Object.keys(changes).length > 0)
      userChanges.value = { ...userChanges.value, ...changes }
    // A finished action gives the tiles that use the points it refreshes a new request-id.
    for (const id of tilesToRefreshAfterAction(tiles.value, tileId, requestIds[tileId], detail)) {
      if (id in requestIds)
        requestIds[id] = ids.next(id)
    }
  },
}
provide(BOARD_KEY, context)

// Only the tiles that depend on a parameter whose value changed get a new request-id. Every other
// tile keeps its attributes and state and sends no request.
watch(values, (next, previous) => {
  const changed = changedParams(previous, next)
  if (changed.length === 0)
    return
  for (const id of tilesToRefreshFor(tiles.value, changed)) {
    if (id in requestIds)
      requestIds[id] = ids.next(id)
  }
})

// Browser back and forward move the sub-path. A parameter that comes from the path takes the new value.
watch(() => props.value.subPath ?? '', (next, previous) => {
  userChanges.value = changesAfterPathChange(props.value.params, previous, next, userChanges.value)
})

/** Return focus to something that still exists after the control that held it left the page. */
async function restoreFocus() {
  await nextTick()
  const next = selectionsBar.value?.querySelector<HTMLElement>('button')
  ;(next ?? board.value)?.focus()
}

function clearSelection(name: string) {
  userChanges.value = clearedChanges(props.value.params, userChanges.value, [name])
  void restoreFocus()
}

function clearAllSelections() {
  userChanges.value = clearedChanges(props.value.params, userChanges.value)
  void restoreFocus()
}

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
    ref="board"
    class="board"
    data-board
    tabindex="-1"
  >
    <section
      v-if="selections.length > 0"
      ref="selectionsBar"
      class="selections"
      aria-label="Active selections"
      data-selections
    >
      <ul class="selections__list">
        <li
          v-for="selection in selections"
          :key="selection.name"
          class="selections__chip"
          :data-selection="selection.name"
        >
          <span class="selections__label">{{ selection.label }}:</span>
          <span
            class="selections__value"
            data-selection-value
          >{{ selection.text }}</span>
          <Button
            class="selections__clear"
            label="Clear"
            size="small"
            severity="secondary"
            text
            :aria-label="`Clear ${selection.label}: ${selection.text}`"
            :data-selection-clear="selection.name"
            @click="clearSelection(selection.name)"
          />
        </li>
      </ul>
      <Button
        class="selections__clear-all"
        label="Clear all"
        size="small"
        severity="secondary"
        data-selections-clear-all
        @click="clearAllSelections"
      />
    </section>
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
