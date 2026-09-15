<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const side = computed<'left' | 'right'>(() => route.params.side === 'right' ? 'right' : 'left')
const pointerMoveCount = ref(0)
const pointerDownCount = ref(0)
const lastPointerTrusted = ref(false)
const lastPointerType = ref('')
const focusTrusted = ref(false)
const keyTrusted = ref(false)
const lastKey = ref('')

function recordPointerMove(event: PointerEvent) {
  pointerMoveCount.value += 1
  lastPointerTrusted.value = event.isTrusted
  lastPointerType.value = event.pointerType
}

function recordPointerDown(event: PointerEvent) {
  pointerDownCount.value += 1
  lastPointerTrusted.value = event.isTrusted
  lastPointerType.value = event.pointerType
}

function recordFocus(event: FocusEvent) {
  focusTrusted.value = event.isTrusted
}

function recordKey(event: KeyboardEvent) {
  keyTrusted.value = event.isTrusted
  lastKey.value = event.code
}
</script>

<template>
  <section
    data-testid="attention-leaf-root"
    :data-attention-fixture-side="side"
    :class="[`attention-leaf--${side}`]"
    class="attention-leaf"
  >
    <button
      type="button"
      :data-testid="`attention-target-${side}`"
      :data-attention-fixture-id="`interactive-leaf-${side}`"
      :data-attention-fixture-side="side"
      :data-pointer-move-count="pointerMoveCount"
      :data-pointer-down-count="pointerDownCount"
      :data-last-pointer-trusted="String(lastPointerTrusted)"
      :data-last-pointer-type="lastPointerType"
      :data-focus-trusted="String(focusTrusted)"
      :data-key-trusted="String(keyTrusted)"
      :data-last-key="lastKey"
      :aria-label="`Attention target ${side}`"
      class="attention-leaf__target"
      @pointermove="recordPointerMove"
      @pointerdown="recordPointerDown"
      @focusin="recordFocus"
      @keydown="recordKey"
    >
      <span
        :data-testid="`attention-safe-text-${side}`"
        :data-attention-fixture-id="`safe-text-${side}`"
        class="attention-leaf__safe-text"
      >
        Safe text for the {{ side }} nested target
      </span>
      <span
        :data-wippy-attention="side === 'left' ? 'exclude' : 'redact'"
        :data-testid="`attention-private-text-${side}`"
        class="attention-leaf__private-text"
      >
        Private visual token {{ side }}
      </span>
    </button>
  </section>
</template>

<style scoped>
.attention-leaf {
  display: flex;
  align-items: stretch;
  inline-size: 100%;
  block-size: 100%;
  min-block-size: 12rem;
  background: var(--p-surface-0);
}

.attention-leaf--left {
  justify-content: flex-end;
}

.attention-leaf--right {
  justify-content: flex-start;
}

.attention-leaf__target {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: 4rem;
  min-inline-size: 4rem;
  block-size: 100%;
  padding: 0;
  border: 0;
  color: var(--p-primary-contrast-color, white);
  background: var(--p-primary-500);
  cursor: crosshair;
}

.attention-leaf__private-text {
  position: absolute;
  inset-block-end: 0.25rem;
  inset-inline: 0.25rem;
  overflow: hidden;
  font-size: 0.5rem;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attention-leaf__target:focus-visible {
  outline: 3px solid var(--p-primary-700);
  outline-offset: -5px;
}

.attention-leaf__safe-text {
  max-inline-size: 3rem;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}
</style>
