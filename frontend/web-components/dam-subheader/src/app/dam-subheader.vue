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
