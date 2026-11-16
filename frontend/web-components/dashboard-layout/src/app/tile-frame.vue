<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { loadByTagName } from '@wippy-fe/proxy'
import { BOARD_KEY } from '../constants'
import type { BoardContext } from '../constants'
import type { RenderStateDetail, TileEventDetail } from '../types'
import { buildTileAttributes, buildTileParams } from '../lib/tile-attrs'
import { isValidTileTag, withDeadline } from '../lib/deadline'
import {
  COMPONENT_LOAD_DEADLINE_MS,
  applyLoadFailure,
  applyRenderState,
  applyTimeout,
  canTimeOut,
  coversTile,
  deadlineAt,
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
// The request-id that the element was last configured with.
let configuredRequestId = ''
let timer: ReturnType<typeof setTimeout> | undefined
// When the frame entered its current status. Each change of status gets a fresh deadline.
let enteredAt = 0
let alive = true
// Counts mounts, so a slow load of an older mount cannot attach its element.
let mountSerial = 0

function clearTimer() {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

/** Arm the deadline for the frame's current status, counted from the moment it entered that status. */
function armDeadline() {
  clearTimer()
  if (!canTimeOut(frame.value))
    return
  const id = frame.value.requestId
  const wait = Math.max(0, deadlineAt(frame.value.status, enteredAt) - Date.now())
  timer = setTimeout(() => {
    frame.value = applyTimeout(frame.value, id)
  }, wait)
}

/** Set the tile's attributes, `request-id` last, and start timing the new request. */
function configure() {
  const current = tile.value
  if (!element || !current)
    return
  // The frame expects the new request-id before the tile sees it. A tile may report from
  // attributeChangedCallback, and that report must not be dropped as stale.
  enteredAt = Date.now()
  configuredRequestId = requestId.value
  frame.value = restartFrame(frame.value, requestId.value, 'loading')
  for (const [name, value] of buildTileAttributes({
    pageUrl: board.pageUrl.value,
    tileId: props.tileId,
    tile: current,
    values: board.values.value,
    requestId: requestId.value,
  })) {
    element.setAttribute(name, value)
  }
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
  if (next.status !== frame.value.status)
    enteredAt = Date.now()
  frame.value = next
  armDeadline()
}

function onTileEvent(event: Event) {
  // A tile nested inside this one bubbles its events through here too. Only the element itself counts.
  if (event.composedPath()[0] !== element)
    return
  board.tileEvent(props.tileId, (event as CustomEvent<TileEventDetail>).detail)
}

function removeElement() {
  element?.removeEventListener('render-state', onRenderState)
  element?.removeEventListener('tile-event', onTileEvent)
  element?.remove()
  element = null
  mountedTag = ''
}

function failLoad(id: string, message: string) {
  clearTimer()
  frame.value = applyLoadFailure(frame.value, id, message)
}

async function mountTile() {
  const current = tile.value
  if (!current || !slot.value)
    return
  const tag: unknown = current.tag
  const id = requestId.value
  const serial = ++mountSerial
  clearTimer()
  removeElement()
  enteredAt = Date.now()
  frame.value = restartFrame(frame.value, id, 'loading-component')
  // The tag comes from the page spec. Only a custom element name is loaded or created.
  if (!isValidTileTag(tag)) {
    failLoad(id, `${String(tag)} is not a valid tile tag.`)
    return
  }
  let created: HTMLElement
  try {
    // loadByTagName bounds only the wait for customElements.define, so the board bounds the whole load.
    await withDeadline(
      () => loadByTagName(tag, { timeoutMs: COMPONENT_LOAD_DEADLINE_MS }),
      COMPONENT_LOAD_DEADLINE_MS,
      `The component did not load within ${COMPONENT_LOAD_DEADLINE_MS / 1000} seconds.`,
    )
    if (!alive || serial !== mountSerial || !slot.value || tile.value?.tag !== tag)
      return
    created = document.createElement(tag)
  }
  catch (err) {
    if (alive && serial === mountSerial)
      failLoad(id, err instanceof Error ? err.message : String(err))
    return
  }
  element = created
  mountedTag = tag
  element.addEventListener('render-state', onRenderState)
  element.addEventListener('tile-event', onTileEvent)
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

// A control tile shows its own parameter. When that value changes, only the `params` attribute is
// updated: the tile keeps its request-id and does not read again. When a new request-id is pending,
// configure() sets `params` together with the rest of the configuration instead.
watch(
  () => (tile.value ? JSON.stringify(buildTileParams(tile.value, board.values.value)) : ''),
  (serialized) => {
    if (!element || !tile.value || requestId.value !== configuredRequestId)
      return
    if (element.getAttribute('params') !== serialized)
      element.setAttribute('params', serialized)
  },
)

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
      <!-- A live read: the data is current as of the read, so one line says both. -->
      <span
        v-if="frame.computedAt && frame.dataAsOf === frame.computedAt"
        data-as-of
      >Live data, read {{ formatTime(frame.computedAt) }}</span>
      <template v-else-if="frame.computedAt">
        <span>Computed {{ formatTime(frame.computedAt) }}</span>
        <span data-as-of>Data as of {{ frame.dataAsOf ? formatTime(frame.dataAsOf) : 'unknown' }}</span>
      </template>
      <span v-if="frame.status === 'computing'">Computing</span>
      <span v-if="frame.stale">Stale</span>
      <span v-if="frame.completeness === 'partial'">Partial</span>
    </footer>
  </section>
</template>
