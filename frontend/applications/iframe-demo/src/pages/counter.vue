<template>
  <div>
    <h2 class="text-base font-semibold mb-2 text-surface-800 dark:text-surface-100">
      Counter with Persistence
    </h2>
    <p class="text-xs text-surface-500 mb-3">
      State preserved via Wippy State API. Different
      <code class="text-xs bg-surface-100 dark:bg-surface-700 px-1 rounded">persist-key</code>
      → separate state.
    </p>
    <div class="space-y-3">
      <div>
        <div class="text-xs text-surface-400 mb-1 uppercase tracking-wide">Instance A (persist-key="a")</div>
        <example-counter-persist persist-key="demo-a" />
      </div>
      <div>
        <div class="text-xs text-surface-400 mb-1 uppercase tracking-wide">Instance B (persist-key="b")</div>
        <example-counter-persist persist-key="demo-b" />
      </div>
    </div>
  </div>
</template>
