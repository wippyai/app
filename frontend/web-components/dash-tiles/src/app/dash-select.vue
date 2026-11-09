<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Select from 'primevue/select'
import { mappedField } from '@example/dash-tile-helper'
import { useDashTile } from '../use-dash-tile'
import { ALL_KEY, buildSelectItems, currentParam, optionKey, readOptions } from '../lib/options'

// The helper reads the choices and reports render-state. This tile only renders and reports a change.
const tile = useDashTile({
  main: (data, config) => readOptions(data, mappedField(config.fields, 'value'), mappedField(config.fields, 'label')).error,
})

const LABEL_ID = 'dash-select-label'

const param = computed(() => currentParam(tile.params.value))

// The board supplies the current value in `params`. Until it does, the control starts at "All" and
// keeps its own choice, so the viewer sees what they picked.
const chosen = ref<string | null>(param.value.value)
watch(() => param.value.value, (value) => {
  chosen.value = value
})

const options = computed(() => {
  const data = tile.data('main')
  return data === null ? null : readOptions(data, tile.fieldName('value'), tile.fieldName('label')).options
})

const items = computed(() => buildSelectItems(options.value ?? [], chosen.value, 'All'))

const selectedKey = computed(() => (chosen.value === null ? ALL_KEY : optionKey(chosen.value)))

const caption = computed(() => {
  const label = tile.options.value.label
  if (typeof label === 'string' && label !== '')
    return label
  return param.value.name ?? 'Select'
})

function onChange(key: string | null) {
  const item = items.value.find(i => i.key === key)
  if (!item || item.value === chosen.value)
    return
  chosen.value = item.value
  tile.emitTileEvent('change', { value: item.value })
}
</script>

<template>
  <div
    v-if="options !== null"
    class="dash-select"
  >
    <p
      :id="LABEL_ID"
      class="dash-select__label"
    >
      {{ caption }}
    </p>
    <Select
      class="dash-select__control"
      :model-value="selectedKey"
      :options="items"
      option-label="label"
      option-value="key"
      :aria-labelledby="LABEL_ID"
      @update:model-value="onChange"
    />
  </div>
</template>
