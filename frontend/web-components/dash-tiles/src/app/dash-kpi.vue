<script setup lang="ts">
import { computed } from 'vue'
import { mappedField } from '@example/dash-tile-helper'
import { useDashTile } from '../use-dash-tile'
import { browserLocale, formatNumber } from '../lib/format'
import { readKpi } from '../lib/kpi'

// The helper reads the data, follows slow results and reports render-state. This tile only renders.
// A frame without a numeric value field becomes an error before `ready` is reported.
const tile = useDashTile({
  main: (data, config) => readKpi(data, mappedField(config.fields, 'value')).error,
})

const reading = computed(() => {
  const data = tile.data('main')
  return data === null ? null : readKpi(data, tile.fieldName('value'))
})

const caption = computed(() => {
  const label = tile.options.value.label
  return typeof label === 'string' ? label : ''
})

// A null value says "No value". It is never shown as 0.
const shown = computed<string | null>(() => {
  const value = reading.value?.value
  return value === null || value === undefined ? null : formatNumber(value, browserLocale())
})
</script>

<template>
  <div
    v-if="reading !== null"
    class="dash-kpi"
  >
    <p
      v-if="caption !== ''"
      class="dash-kpi__label"
    >
      {{ caption }}
    </p>
    <p
      class="dash-kpi__value"
      :class="{ 'dash-kpi__value--none': shown === null }"
    >
      {{ shown ?? 'No value' }}
    </p>
  </div>
</template>
