<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { TileRoot } from '@wippy/dashboards-tile-helper'
import { fixtureLog, useFixtureTile } from '../use-fixture-tile'

// A tile that draws its own states (claim: draws_states: true). It follows the state display preference
// of the page: with old data on screen, refreshing, computing and error keep the data with a mark under
// `keep` and show a panel under `replace`. Without old data they show a panel. denied always drops the data.
// The input `extra` is optional: it never changes the status of the tile.
const tile = useFixtureTile(['extra'])

const text = computed(() => {
  const data = tile.data('main') as Record<string, unknown> | null
  const value = data?.text
  return typeof value === 'string' ? value : null
})
const extra = computed(() => {
  const data = tile.data('extra') as Record<string, unknown> | null
  const value = data?.text
  return typeof value === 'string' ? value : null
})

const panel = computed(() => tile.presentation.value.panel)
const mark = computed(() => tile.presentation.value.mark)

// The data shows unless a panel replaces it.
const shown = computed(() => (panel.value === null ? text.value : null))

watchEffect(() => {
  const id = String(tile.config.value.tileId)
  const log = fixtureLog()
  const list = log.drawn[id] ?? (log.drawn[id] = [])
  const line = `${tile.status.value}|data:${shown.value ?? '-'}|panel:${panel.value ?? '-'}|mark:${mark.value ?? '-'}`
  if (list[list.length - 1] !== line)
    list.push(line)
})
</script>

<template>
  <TileRoot>
    <div
      class="fx-states"
      :data-fx-status="tile.status.value"
      :data-fx-has-data="tile.hasData.value"
    >
      <p
        v-if="mark"
        class="fx-states__mark"
        :data-fx-mark="mark"
      >
        {{ mark }}
      </p>
      <p
        v-if="panel"
        class="fx-states__panel"
        :data-fx-panel="panel"
      >
        {{ panel }}{{ tile.error.value ? `: ${tile.error.value.code}` : '' }}
      </p>
      <p
        v-if="shown !== null"
        class="fx-states__text"
        data-fx-text
      >
        {{ shown }}
      </p>
      <p
        v-if="extra !== null"
        class="fx-states__extra"
        data-fx-extra
      >
        {{ extra }}
      </p>
      <p
        v-if="tile.missingInputs.value.length > 0"
        class="fx-states__missing"
        data-fx-missing
      >
        missing: {{ tile.missingInputs.value.join(',') }}
      </p>
    </div>
  </TileRoot>
</template>
