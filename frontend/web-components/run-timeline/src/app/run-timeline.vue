<script setup lang="ts">
import { computed } from 'vue'
import { useDashTile } from '../use-dash-tile'
import { formatDuration, formatStart, readTimeline } from '../lib/timeline'

// The helper reads the data and reports render-state. This tile only renders.
// Data that does not match the run shape becomes an error before `ready` is reported.
const tile = useDashTile({
  main: data => readTimeline(data).error,
})

const timeline = computed(() => {
  const data = tile.data('main')
  return data === null ? null : readTimeline(data).timeline
})

const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : undefined
</script>

<template>
  <div
    v-if="timeline !== null"
    class="run-timeline"
  >
    <header class="run-timeline__head">
      <span class="run-timeline__type">{{ timeline.run.type }}</span>
      <span
        class="run-timeline__status"
        :class="{ 'run-timeline__status--bad': timeline.run.status !== 'completed' }"
      >{{ timeline.run.status }}</span>
      <dl class="run-timeline__facts">
        <div>
          <dt>Started</dt>
          <dd>{{ formatStart(timeline.run.started_at, locale) }}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{{ formatDuration(timeline.run.duration_ms) }}</dd>
        </div>
        <div>
          <dt>Commits</dt>
          <dd>{{ timeline.run.commits }}</dd>
        </div>
      </dl>
    </header>
    <ol class="run-timeline__nodes">
      <li
        v-for="(row, index) in timeline.rows"
        :key="index"
        class="run-timeline__node"
        :style="{ '--depth': row.depth }"
      >
        <span class="run-timeline__name">{{ row.type }}</span>
        <span
          class="run-timeline__status"
          :class="{ 'run-timeline__status--bad': row.status !== 'completed' }"
        >{{ row.status }}</span>
        <span class="run-timeline__ms">{{ formatDuration(row.duration_ms) }}</span>
        <span
          class="run-timeline__track"
          aria-hidden="true"
        >
          <span
            class="run-timeline__bar"
            :style="{ width: `${row.share * 100}%` }"
          />
        </span>
      </li>
    </ol>
  </div>
</template>
