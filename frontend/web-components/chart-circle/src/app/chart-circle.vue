<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js'
import { useComponentProps, DEFAULT_LABELS, DEFAULT_VALUES, DEFAULT_TITLE } from '../constants'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend)

const props = useComponentProps()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart<'doughnut'> | null = null

const labels = computed(() => props.value.labels ?? DEFAULT_LABELS)
const values = computed(() => props.value.values ?? DEFAULT_VALUES)
const title = computed(() => props.value.title ?? DEFAULT_TITLE)

// Read theme colors from CSS variables at runtime so the chart adapts to
// configOverrides. Falls back to hardcoded values if variables aren't set.
function getThemeColors(): string[] {
  const cs = getComputedStyle(document.documentElement)
  const get = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback
  return [
    get('--p-primary-500', '#6366f1'),
    get('--p-danger-500', '#ef4444'),
    get('--p-warn-500', '#eab308'),
    get('--p-secondary-500', '#64748b'),
    get('--p-accent-500', '#a855f7'),
    get('--p-primary-300', '#a5b4fc'),
    get('--p-danger-300', '#fca5a5'),
    get('--p-warn-300', '#fde047'),
    get('--p-secondary-300', '#cbd5e1'),
    get('--p-accent-300', '#d8b4fe'),
  ]
}

function createChart() {
  if (!canvasRef.value) return

  const colors = getThemeColors()
  chartInstance = new Chart(canvasRef.value, {
    type: 'doughnut',
    data: {
      labels: labels.value,
      datasets: [{
        data: values.value,
        backgroundColor: colors.slice(0, values.value.length),
        borderWidth: 2,
        borderColor: 'transparent',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          enabled: true,
        },
      },
    },
  })
}

function updateChart() {
  if (!chartInstance) return
  chartInstance.data.labels = labels.value
  chartInstance.data.datasets[0].data = values.value
  chartInstance.data.datasets[0].backgroundColor = getThemeColors().slice(0, values.value.length)
  chartInstance.update()
}

watch([labels, values], () => {
  if (chartInstance) {
    updateChart()
  }
})

onMounted(() => {
  createChart()
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>

<template>
  <div class="chart-container">
    <h2
      id="chart-heading"
      class="chart-title"
    >
      {{ title }}
    </h2>
    <div class="chart-canvas-wrapper">
      <canvas
        ref="canvasRef"
        role="img"
        :aria-label="`${title}: ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}`"
      >
        {{ labels.map((l, i) => `${l}: ${values[i]}`).join(', ') }}
      </canvas>
    </div>
  </div>
</template>
