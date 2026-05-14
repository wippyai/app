<script setup lang="ts">
// 5 segments matching the 5 theme color families: primary, danger, warn, secondary, accent
const chartLabels = '["Primary","Danger","Warning","Secondary","Accent"]'
const chartValues = '[35, 25, 20, 12, 8]'
</script>

<template>
  <div>
    <h2 class="text-base font-semibold mb-2 text-surface-800 dark:text-surface-100">
      Theme Colors Chart
    </h2>
    <p class="text-xs text-surface-500 mb-3">
      Each segment uses a theme CSS variable. Compare left vs right to see the override.
    </p>
    <div class="max-w-xs">
      <example-chart-circle
        :labels="chartLabels"
        :values="chartValues"
        title="Theme Palette"
      />
    </div>
  </div>
</template>
