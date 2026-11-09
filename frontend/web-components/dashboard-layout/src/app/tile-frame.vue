<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { loadByTagName } from '@wippy-fe/proxy'
import { BOARD_KEY } from '../constants'
import type { BoardContext } from '../constants'
import type { RenderStateDetail } from '../types'
import { buildTileAttributes } from '../lib/tile-attrs'
import {
  COMPONENT_LOAD_DEADLINE_MS,
  applyLoadFailure,
  applyRenderState,
  applyTimeout,
  coversTile,
  deadlineMs,
  initialFrame,
  restartFrame,
  showsLoadingBar,
} from '../lib/frame'
import type { FrameState } from '../lib/frame'

const props = defineProps<{ tileId: string }>()

const injected = inject(BOARD_KEY)
if (!injected)
  throw new Error('tile-frame needs the board context')
const board: BoardContext = injected

const tile = computed(() => board.tiles.value[props.tileId])
const requestId = computed(() => board.requestIds[props.tileId] ?? '')

const slot = ref<HTMLElement | null>(null)
const frame = ref<FrameState>(initialFrame(requestId.value))

let element: HTMLElement | null = null
let mountedTag = ''
let timer: ReturnType<typeof setTimeout> | undefined
let startedAt = 0
let alive = true

function clearTimer() {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

/** Arm the deadline for the current request-id. Counted from the start of that request. */
function armDeadline() {
  clearTimer()
  if (frame.value.settled || frame.value.status === 'load-failed')
    return
  const id = frame.value.requestId
  const wait = Math.max(0, startedAt + deadlineMs(frame.value.status) - Date.now())
  timer = setTimeout(() => {
    frame.value = applyTimeout(frame.value, id)
  }, wait)
}

/** Set the tile's attributes, `request-id` last, and start timing the new request. */
function configure() {
  const current = tile.value
  if (!element || !current)
    return
  for (const [name, value] of buildTileAttributes({
    pageUrl: board.pageUrl.value,
    tileId: props.tileId,
    tile: current,
    values: board.values.value,
    requestId: requestId.value,
  })) {
    element.setAttribute(name, value)
  }
  startedAt = Date.now()
  frame.value = restartFrame(frame.value, requestId.value, 'loading')
  armDeadline()
}

function onRenderState(event: Event) {
  const detail = (event as CustomEvent<RenderStateDetail>).detail
  // An event from a tile nested inside this one bubbles through here too. Only the element itself counts.
  if (event.composedPath()[0] !== element)
    return
  const next = applyRenderState(frame.value, detail)
  if (next === frame.value)
    return
  frame.value = next
  armDeadline()
}

function removeElement() {
  element?.removeEventListener('render-state', onRenderState)
  element?.remove()
  element = null
  mountedTag = ''
}

async function mountTile() {
  const current = tile.value
  if (!current || !slot.value)
    return
  const tag = current.tag
  const id = requestId.value
  startedAt = Date.now()
  frame.value = restartFrame(frame.value, id, 'loading-component')
  try {
    await loadByTagName(tag, { timeoutMs: COMPONENT_LOAD_DEADLINE_MS })
  }
  catch (err) {
    if (alive)
      frame.value = applyLoadFailure(frame.value, id, err instanceof Error ? err.message : String(err))
    return
  }
  if (!alive || !slot.value || tile.value?.tag !== tag)
    return
  removeElement()
  element = document.createElement(tag)
  mountedTag = tag
  element.addEventListener('render-state', onRenderState)
  slot.value.appendChild(element)
  configure()
}

onMounted(mountTile)

// A new request-id gives the existing element a new configuration.
watch(requestId, (id, old) => {
  if (id === old || !element)
    return
  configure()
})

// A tile that changes its tag mounts anew.
watch(() => tile.value?.tag, (tag) => {
  if (tag && tag !== mountedTag)
    void mountTile()
})

onBeforeUnmount(() => {
  alive = false
  clearTimer()
  removeElement()
})

const covered = computed(() => coversTile(frame.value.status))
const loading = computed(() => showsLoadingBar(frame.value))
const seconds = computed(() => Math.round(deadlineMs(frame.value.timedOutWhileComputing ? 'computing' : 'loading') / 1000))

const title = computed(() => {
  switch (frame.value.status) {
    case 'empty': return 'No data'
    case 'denied': return 'Access denied'
    case 'error': return 'This tile could not load its data'
    case 'timeout': return 'No response'
    case 'load-failed': return 'This tile could not be loaded'
    default: return ''
  }
})

const detail = computed(() => {
  const f = frame.value
  switch (f.status) {
    case 'timeout': return `The tile did not report a state within ${seconds.value} seconds.`
    case 'load-failed': return `Tag ${tile.value?.tag ?? ''}: ${f.errorMessage ?? 'unknown error'}`
    case 'error':
    case 'denied':
      return [f.errorMessage, f.errorCode ? `(${f.errorCode})` : ''].filter(Boolean).join(' ')
    default: return ''
  }
})

const canRetry = computed(() => ['timeout', 'error', 'load-failed'].includes(frame.value.status))

function formatTime(value: string | null): string {
  if (!value)
    return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function retry() {
  if (frame.value.status === 'load-failed') {
    board.retry(props.tileId)
    void mountTile()
    return
  }
  board.retry(props.tileId)
}
</script>

<template>
  <section
    class="frame"
    :class="`frame--${frame.status}`"
    :data-tile-id="tileId"
    :data-frame-status="frame.status"
    :aria-busy="loading"
  >
    <div
      v-if="loading"
      class="frame__bar"
      role="progressbar"
      aria-label="Loading"
    />
    <div
      ref="slot"
      class="frame__tile"
      :class="{ 'frame__tile--covered': covered }"
    />
    <div
      v-if="covered"
      class="frame__state"
      :role="frame.status === 'empty' ? 'status' : 'alert'"
    >
      <span class="frame__state-title">{{ title }}</span>
      <span
        v-if="detail"
        class="frame__state-detail"
      >{{ detail }}</span>
      <Button
        v-if="canRetry"
        label="Retry"
        size="small"
        severity="secondary"
        @click="retry"
      />
    </div>
    <footer
      v-if="frame.sourceTitle || frame.computedAt || frame.stale || frame.completeness === 'partial' || frame.status === 'computing'"
      class="frame__meta"
    >
      <span v-if="frame.sourceTitle">{{ frame.sourceTitle }}</span>
      <span v-if="frame.computedAt">Computed {{ formatTime(frame.computedAt) }}</span>
      <span v-if="frame.status === 'computing'">Computing</span>
      <span v-if="frame.stale">Stale</span>
      <span v-if="frame.completeness === 'partial'">Partial</span>
    </footer>
  </section>
</template>
