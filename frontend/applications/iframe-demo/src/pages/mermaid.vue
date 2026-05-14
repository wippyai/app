<script setup lang="ts">
// Mermaid style directives split on commas, so color-mix() can't be used.
// Use solid var() references — the theme override changes these directly.
const diagram = `graph TD
    A[Parent Website] --> B[Wippy Host]
    B --> C[Child Page A]
    B --> D[Child Page B]
    C --> E[Web Component]
    C --> F[Web Component]
    D --> G[Web Component]
    style B fill:var(--p-primary-500),stroke:var(--p-primary-700),color:#fff
    style C fill:var(--p-accent-500),stroke:var(--p-accent-700),color:#fff`
</script>

<template>
  <div>
    <h2 class="text-base font-semibold mb-2 text-surface-800 dark:text-surface-100">
      Mermaid Diagram
    </h2>
    <p class="text-xs text-surface-500 mb-3">
      "Wippy Host" uses primary color, "Child Page A" uses accent.
      Both change with the theme override.
    </p>
    <example-mermaid
      :definition="diagram"
      transparent
    />
  </div>
</template>
