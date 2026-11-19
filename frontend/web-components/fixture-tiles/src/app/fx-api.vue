<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { TileRoot } from '@wippy/dashboards-tile-helper'
import { useFixtureTile } from '../use-fixture-tile'

// A component that calls an API that a regular viewer may not use. It runs with the viewer's rights,
// so the viewer gets 403, and the component shows the refusal (RC1-21).
useFixtureTile()

const status = ref('pending')

onMounted(async () => {
  try {
    const { api } = await import('@wippy-fe/proxy')
    const res = await api.get('/api/v1/dashboards-fixtures/restricted', { validateStatus: () => true })
    status.value = String(res.status)
  }
  catch {
    status.value = 'network'
  }
})
</script>

<template>
  <TileRoot>
    <div
      class="fx-api"
      :data-fx-api-status="status"
    >
      {{ status === '200' ? 'allowed' : status === '403' ? 'refused' : status }}
    </div>
  </TileRoot>
</template>
