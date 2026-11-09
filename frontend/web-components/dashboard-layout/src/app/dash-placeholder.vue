<script setup lang="ts">
import { ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import { useProps, useEvents } from '@wippy-fe/webcomponent-vue'
import type { PlaceholderEvents } from '../constants'
import type { PlaceholderProps } from '../placeholder-props'

const props = useProps<PlaceholderProps>()
const emit = useEvents<PlaceholderEvents>()

const text = ref('')

// The tile starts work only when it has a request-id. A silent tile never reports.
watch(
  () => props.value.requestId,
  (requestId) => {
    if (!requestId || props.value.options?.silent === true)
      return
    emit('render-state', {
      request_id: requestId,
      status: 'ready',
      computed_at: new Date().toISOString(),
      source_title: 'Placeholder',
    })
  },
  { immediate: true },
)
</script>

<template>
  <div class="placeholder">
    <span class="placeholder__id">{{ props.tileId }}</span>
    <InputText
      v-model="text"
      size="small"
      :aria-label="`Text for ${props.tileId}`"
      placeholder="Type here"
    />
    <span
      v-if="props.options?.silent === true"
      class="placeholder__note"
    >This tile reports nothing.</span>
  </div>
</template>
