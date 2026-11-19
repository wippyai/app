<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { TileRoot } from '@wippy/dashboards-tile-helper'
import { useFixtureTile } from '../use-fixture-tile'

// A component that changes data as soon as it loads, with the viewer's rights. The dashboard's action
// rules do not cover this call, which is why an agent may place it only with `confirmed: true` (RC1-21).
useFixtureTile()

const answer = ref('pending')

onMounted(async () => {
  try {
    const { api } = await import('@wippy-fe/proxy')
    const res = await api.post('/api/v1/dashboards-fixtures/touch', {}, { validateStatus: () => true })
    answer.value = String(res.status)
  }
  catch {
    answer.value = 'network'
  }
})
</script>

<template>
  <TileRoot>
    <div
      class="fx-onload"
      :data-fx-touch="answer"
    >
      touch: {{ answer }}
    </div>
  </TileRoot>
</template>
