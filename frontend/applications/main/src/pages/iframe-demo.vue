<script setup lang="ts">
/**
 * Renders two instances of the iframe-demo page:
 *   - Default theme (host colors)
 *   - Custom palette via configOverrides on the registry entry
 *
 * Responsive via CSS container query: side-by-side when container ≥ 800px,
 * stacked 50/50 when narrower.
 */
</script>

<template>
  <div class="iframe-demo-page p-4 h-full flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-bold text-surface-800 dark:text-surface-100 mb-1">
        Iframe Demo — Theme Override
      </h1>
      <p class="text-sm text-surface-500">
        Two instances of the same page. Left uses default theme; right uses
        <code class="text-xs bg-surface-100 dark:bg-surface-700 px-1 rounded">configOverrides</code>
        to replace all 5 color families (primary, danger, warning, secondary, accent).
        Watch how chart segments, buttons, and accent colors change.
      </p>
    </div>

    <div class="iframe-demo-container flex-1 min-h-0 relative">
    <div class="iframe-demo-grid absolute inset-0 gap-4">
      <div class="flex flex-col border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden min-h-[300px]">
        <div class="px-3 py-1.5 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 text-xs font-medium text-surface-500 shrink-0">
          Default Theme
        </div>
        <w-artifact
          id="app.views:iframe-demo"
          type="page"
          class="flex-1"
        />
      </div>

      <div class="flex flex-col border border-purple-200 dark:border-purple-900 rounded-lg overflow-hidden min-h-[300px]">
        <div class="px-3 py-1.5 bg-purple-50 dark:bg-purple-950 border-b border-purple-200 dark:border-purple-900 text-xs font-medium text-purple-600 dark:text-purple-400 shrink-0">
          Custom Palette (configOverrides)
        </div>
        <w-artifact
          id="app.views:iframe-demo-themed"
          type="page"
          class="flex-1"
        />
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.iframe-demo-container {
  container-type: inline-size;
}

.iframe-demo-grid {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr 1fr;
  overflow: auto;
}

@container (min-width: 800px) {
  .iframe-demo-grid {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
  }
}
</style>
