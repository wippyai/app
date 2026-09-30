<script setup lang="ts">
import { ref } from 'vue'
import { useApi, useHost } from '../composables/useWippy'

// Minimal shape of GET /api/v1/agents/list (see the Host's
// src/shared/api/agents/types.ts `AgentApi.AgentListResponse` /
// src/shared/types/agent.ts `ChatAgent` for the full response). Each agent
// carries its own `start_token`, which is what `host.startChat()` needs —
// there is no supported way to start a chat from an agent id/name alone
// (see iframe-proxy.md "Start a New Chat").
interface AgentListItem {
  name: string
  title: string
  start_token: string
}

interface AgentListResponse {
  agents: AgentListItem[]
  success: boolean
}

interface DemoAgent {
  // Matches this agent's registry `meta.title` exactly — that is what we
  // match against the agents-list response below, since the response's
  // `name` field format isn't documented here and the title is ours to
  // keep stable.
  title: string
  registryId: string
  description: string
}

const AGENTS: DemoAgent[] = [
  {
    title: 'Forms demo',
    registryId: 'app.agents:forms_demo',
    description: 'Real agent, routed through the configured model. Asks a delivery-preference question with a form, then confirms your choice in one sentence.',
  },
  {
    title: 'Session Forms Fixture',
    registryId: 'app.session_forms_demo:fixture_agent',
    description: 'Deterministic dev fixture with no external model call. Say "ask me" to get the same form, or answer it to get a scripted confirmation. Useful for offline demos and tests.',
  },
  {
    title: 'Session Forms Steering Fixture',
    registryId: 'app.session_forms_demo:steering_fixture_agent',
    description: 'Same deterministic fixture with Session steering: you can keep typing while a turn runs. Useful for testing steering and form answers together.',
  },
  {
    title: 'Session Forms Plain Fixture',
    registryId: 'app.session_forms_demo:plain_fixture_agent',
    description: 'Same deterministic fixture, without the forms trait. Say "ask me" and it will tell you it can\'t create forms here — useful for testing agents that don\'t offer forms.',
  },
]

const api = useApi()
const host = useHost()

const pendingTitle = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

async function openChat(agent: DemoAgent) {
  errorMessage.value = null
  pendingTitle.value = agent.title
  try {
    const response = await api.get<AgentListResponse>('/api/v1/agents/list')
    const match = response.data.agents.find(item => item.title === agent.title)
    if (!match || !match.start_token) {
      errorMessage.value = `"${agent.title}" is not in the agents list yet (registry id ${agent.registryId}). Is it registered and lint-clean?`
      return
    }
    // `host.startChat` (current API) takes an options object, not a bare
    // boolean — that shape belongs to the deprecated `iframe.startChat`.
    host.startChat(match.start_token, { sidebar: false })
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to start the chat.'
  }
  finally {
    pendingTitle.value = null
  }
}
</script>

<template>
  <div class="h-full flex flex-col gap-4 p-4 bg-surface-0 dark:bg-surface-900">
    <header>
      <h2 class="text-base font-semibold text-surface-800 dark:text-surface-100">
        Session forms
      </h2>
      <p class="text-xs text-surface-500 mt-1">
        Two agents exercise the same delivery-preference form: one talks to a
        real model, the other is a scripted fixture that never leaves this
        server.
      </p>
    </header>

    <div class="flex flex-col gap-3">
      <div
        v-for="agent in AGENTS"
        :key="agent.registryId"
        class="border border-surface-200 dark:border-surface-700 rounded-lg p-3 flex items-start justify-between gap-3"
      >
        <div>
          <div class="text-sm font-medium text-surface-700 dark:text-surface-200">
            {{ agent.title }}
          </div>
          <p class="text-xs text-surface-500 mt-1 max-w-md">
            {{ agent.description }}
          </p>
          <p class="text-xs text-surface-400 mt-1 font-mono">
            {{ agent.registryId }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-white disabled:opacity-50"
          :disabled="pendingTitle === agent.title"
          @click="openChat(agent)"
        >
          {{ pendingTitle === agent.title ? 'Starting…' : 'Start chat' }}
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="text-xs text-danger">
      {{ errorMessage }}
    </p>
  </div>
</template>
