<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useApi } from '../composables/useWippy'

const VOICE_AGENT = 'app.attention_e2e:agent'

const targets = [
  {
    side: 'left',
    artifactId: 'app.views:iframe-demo',
    title: 'Left nested target',
  },
  {
    side: 'right',
    artifactId: 'app.views:iframe-demo-themed',
    title: 'Right nested target',
  },
] as const

const api = useApi()

// Only the Attention e2e fixtures register the voice agent. Without them the
// voice orb cannot resolve it and logs an error (wippy-swiss/voice 0.2.0), so
// the orb renders only when the agents list has the agent.
const voiceAgentListed = ref(false)

onMounted(async () => {
  const { data } = await api.get('/api/v1/agents/list')
  voiceAgentListed.value = Array.isArray(data?.agents)
    && data.agents.some((agent: { name?: string }) => agent.name === VOICE_AGENT)
})
</script>

<template>
  <section
    data-testid="attention-tracer"
    class="attention-tracer"
  >
    <header class="attention-tracer__header">
      <h1 class="text-xl font-bold text-surface-800 dark:text-surface-100">
        Attention tracer
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400">
        Two deep page-artifact trees share one exact boundary. Each crosses a
        custom element and shadow root before reaching its safe-text target.
      </p>
    </header>

    <div
      data-testid="attention-child-grid"
      class="attention-tracer__grid"
    >
      <section
        v-for="target in targets"
        :key="target.side"
        :data-testid="`attention-child-${target.side}`"
        :data-attention-fixture-id="`artifact-${target.side}`"
        :aria-label="target.title"
        class="attention-tracer__child"
      >
        <w-artifact
          :id="target.artifactId"
          type="page"
          :sub-path="`/attention-target/${target.side}`"
          class="attention-tracer__artifact"
        />
      </section>
    </div>

    <wippy-voice-orb
      v-if="voiceAgentListed"
      data-testid="attention-voice-orb"
      data-wippy-attention="exclude"
      agent-name="app.attention_e2e:agent"
      attention-context-enabled
    />
  </section>
</template>

<style scoped>
.attention-tracer {
  /* Keep fixed page controls inside this page in Web Fragment mode. */
  contain: layout;
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
  background: var(--p-surface-0);
}

.attention-tracer__header {
  display: grid;
  gap: 0.25rem;
  padding: 1rem;
  border-block-end: 1px solid var(--p-surface-200);
}

.attention-tracer__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  flex: 1;
  min-block-size: 0;
  gap: 0;
}

.attention-tracer__child {
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
}

.attention-tracer__artifact {
  display: block;
  inline-size: 100%;
  block-size: 100%;
}
</style>
