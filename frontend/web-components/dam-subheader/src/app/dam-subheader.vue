<script setup lang="ts">
import { Icon } from '@iconify/vue'
</script>

<template>
  <div class="dam-subheader">
    <div class="dam-subheader__title">
      <Icon icon="tabler:calendar-event" class="w-4 h-4" />
      <span>Spring 2026 Conference</span>
      <span class="dam-subheader__date">Mar 14 — Mar 18</span>
    </div>
    <nav class="dam-subheader__tabs">
      <button class="dam-subheader__tab dam-subheader__tab--active" type="button">Assets</button>
      <button class="dam-subheader__tab" type="button">Sessions</button>
      <button class="dam-subheader__tab" type="button">Logs</button>
    </nav>
    <a class="dam-subheader__link" href="#">View event →</a>
  </div>
</template>

<style scoped>
.dam-subheader {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem;
  background: var(--p-surface-100, #f4f4f5);
  border-bottom: 1px solid var(--p-surface-200, #e4e4e7);
  font-family: 'Poppins', system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .dam-subheader { background: var(--p-surface-800, #18181b); border-bottom-color: var(--p-surface-700, #27272a); }
}
.dam-subheader__title { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.95rem; }
.dam-subheader__date { font-weight: 400; opacity: 0.6; font-size: 0.8rem; }
.dam-subheader__tabs { display: flex; gap: 0.25rem; margin-left: 1.5rem; }
.dam-subheader__tab {
  padding: 0.3rem 0.75rem;
  background: transparent;
  border: none;
  font: inherit;
  font-size: 0.85rem;
  color: var(--p-surface-500, #71717a);
  cursor: pointer;
  border-radius: 4px;
}
.dam-subheader__tab:hover { background: var(--p-surface-200, #e4e4e7); }
.dam-subheader__tab--active { color: var(--p-primary, #6366f1); font-weight: 500; }
.dam-subheader__link { margin-left: auto; font-size: 0.85rem; color: var(--p-primary, #6366f1); text-decoration: none; }
</style>
