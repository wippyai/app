<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadByTagName } from '@wippy-fe/proxy'
import { mappedField } from '@example/dash-tile-helper'
import { useDashTile } from '../use-dash-tile'
import { readText } from '../lib/text'

// The helper reads the data, follows slow results and reports render-state. This tile only renders.
// A record without a text string becomes an error before `ready` is reported.
const tile = useDashTile({
  main: (data, config) => readText(data, mappedField(config.fields, 'text')).error,
})

const text = computed<string | null>(() => {
  const data = tile.data('main')
  return data === null ? null : readText(data, tile.fieldName('text')).text
})

// <wippy-markdown> comes from the hub module wippy-swiss/markdown. If it cannot load,
// the text still shows, as plain text.
const markdown = ref<'loading' | 'ready' | 'failed'>('loading')
onMounted(async () => {
  try {
    await loadByTagName('wippy-markdown')
    markdown.value = 'ready'
  }
  catch {
    markdown.value = 'failed'
  }
})
</script>

<template>
  <div class="dash-text">
    <template v-if="text !== null">
      <wippy-markdown
        v-if="markdown === 'ready'"
        class="dash-text__markdown"
        :content="text"
      />
      <p
        v-else-if="markdown === 'failed'"
        class="dash-text__plain"
      >
        {{ text }}
      </p>
    </template>
  </div>
</template>
