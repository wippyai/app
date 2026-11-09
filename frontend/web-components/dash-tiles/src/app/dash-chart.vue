<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadByTagName } from '@wippy-fe/proxy'
import { useDashTile } from '../use-dash-tile'
import { useThemeColors } from '../use-theme-colors'
import { browserLocale, formatNumber } from '../lib/format'
import {
  buildChartData,
  buildChartOptions,
  chartTable,
  readChartFields,
  readChartKind,
  validateChart,
} from '../lib/chart'

// The helper reads the data, follows slow results and reports render-state. This tile builds the
// Chart.js data, hands it to <wippy-chartjs> and turns a click on a data element into `select`.
// A frame without the mapped fields, or an unsupported `options.kind`, becomes an error before `ready`.
const tile = useDashTile({ main: validateChart })

const root = ref<HTMLElement | null>(null)
const colors = useThemeColors(root)

// <wippy-chartjs> comes from the hub module wippy-swiss/chartjs.
const plotter = ref<'loading' | 'ready' | 'failed'>('loading')
onMounted(async () => {
  try {
    await loadByTagName('wippy-chartjs')
    plotter.value = 'ready'
  }
  catch {
    plotter.value = 'failed'
  }
})

const kind = computed(() => readChartKind(tile.options.value).kind)

const chart = computed(() => {
  const data = tile.data('main')
  return data === null ? null : buildChartData(data, readChartFields(tile.fields.value)).chart
})

const label = computed(() => {
  const value = tile.options.value.label
  return typeof value === 'string' && value !== '' ? value : 'Chart'
})

const dataAttr = computed(() => (chart.value ? JSON.stringify(chart.value) : ''))
const optionsAttr = computed(() =>
  chart.value && colors.value
    ? JSON.stringify(buildChartOptions(kind.value, chart.value.datasets.length, colors.value))
    : '',
)

// The text alternative of the chart: the same values as a table that only a screen reader sees.
const table = computed(() => (chart.value ? chartTable(chart.value) : null))
const locale = browserLocale()
const number = (value: number | null): string => (value === null ? 'None' : formatNumber(value, locale))

interface ChartClick {
  label: string
  datasetLabel: string
  value: unknown
}

function onChartClick(event: Event) {
  const detail = (event as CustomEvent<ChartClick>).detail
  tile.emitTileEvent('select', { x: detail.label, series: detail.datasetLabel, value: detail.value })
}
</script>

<template>
  <figure
    ref="root"
    class="dash-chart"
    role="group"
    :aria-label="label"
  >
    <span class="dash-probe dash-probe--text" />
    <span class="dash-probe dash-probe--muted" />
    <span class="dash-probe dash-probe--grid" />
    <template v-if="chart !== null">
      <figcaption class="dash-chart__title">
        {{ label }}
      </figcaption>
      <div
        class="dash-chart__plot"
        aria-hidden="true"
      >
        <wippy-chartjs
          v-if="plotter === 'ready' && optionsAttr !== ''"
          class="dash-chart__canvas"
          :type.attr="kind"
          :data.attr="dataAttr"
          :options.attr="optionsAttr"
          @chart-click="onChartClick"
        />
      </div>
      <table
        v-if="table"
        class="dash-sr-only"
      >
        <caption>{{ label }}</caption>
        <thead>
          <tr>
            <th scope="col">
              {{ tile.fieldName('x') }}
            </th>
            <th
              v-for="name in table.head"
              :key="name"
              scope="col"
            >
              {{ name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in table.rows"
            :key="row.label"
          >
            <th scope="row">
              {{ row.label }}
            </th>
            <td
              v-for="(value, n) in row.values"
              :key="n"
            >
              {{ number(value) }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </figure>
</template>
