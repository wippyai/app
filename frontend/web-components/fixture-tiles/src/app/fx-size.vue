<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TileRoot } from '@wippy/dashboards-tile-helper'
import { useFixtureTile } from '../use-fixture-tile'

// A tile with no data. Its CSS has one `@container tile` rule per size class that sets the custom
// property --fx-class. The tile shows the size-class attribute and the value of that property, so a
// test can check that the two agree at each threshold. The unique `instance` id is set once per mounted
// element: it stays the same when the tile is resized (a resize never remounts the tile).
const tile = useFixtureTile()

const instance = Math.random().toString(36).slice(2)
const root = ref<HTMLElement | null>(null)
const css = ref('')
let observer: ResizeObserver | null = null

function read() {
  if (root.value)
    css.value = getComputedStyle(root.value).getPropertyValue('--fx-class').trim()
}

onMounted(() => {
  read()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(read)
    observer.observe(root.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const tall = computed(() => tile.options.value.tall === true)
</script>

<template>
  <TileRoot>
    <div
      ref="root"
      class="fx-size"
      :data-fx-instance="instance"
      :data-fx-attr="tile.sizeClass.value"
      :data-fx-css="css"
    >
      <p class="fx-size__line">
        attr={{ tile.sizeClass.value }} css={{ css }}
      </p>
      <div
        v-if="tall"
        class="fx-size__tall"
        data-fx-tall
      >
        Content that is taller than the place of the tile.
      </div>
    </div>
  </TileRoot>
</template>
