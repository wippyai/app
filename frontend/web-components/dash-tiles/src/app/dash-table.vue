<script setup lang="ts">
import { computed } from 'vue'
import { useDashTile } from '../use-dash-tile'
import { browserLocale } from '../lib/format'
import { buildTable } from '../lib/table'

// The helper reads the data, follows slow results and reports render-state. This tile only renders.
// A listed column that the frame lacks becomes an error before `ready` is reported.
const tile = useDashTile({
  main: (data, config) => buildTable(data, config.fields.columns).error,
})

const model = computed(() => {
  const data = tile.data('main')
  return data === null ? null : buildTable(data, tile.fields.value.columns, browserLocale()).table
})

const caption = computed(() => {
  const label = tile.options.value.label
  return typeof label === 'string' ? label : ''
})
</script>

<template>
  <div
    v-if="model !== null"
    class="dash-table"
    role="region"
    tabindex="0"
    :aria-label="caption !== '' ? caption : 'Table'"
  >
    <table class="dash-table__grid">
      <caption
        v-if="caption !== ''"
        class="dash-table__caption"
      >
        {{ caption }}
      </caption>
      <thead>
        <tr>
          <th
            v-for="column in model.columns"
            :key="column.name"
            scope="col"
            :class="{ 'dash-table__cell--numeric': column.numeric }"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="model.rows.length === 0">
          <td
            class="dash-table__none"
            :colspan="Math.max(model.columns.length, 1)"
          >
            No rows
          </td>
        </tr>
        <tr
          v-for="(row, r) in model.rows"
          :key="r"
        >
          <td
            v-for="(cell, c) in row"
            :key="c"
            :class="{
              'dash-table__cell--numeric': cell.numeric,
              'dash-table__cell--none': cell.isNull,
            }"
          >
            {{ cell.text }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
