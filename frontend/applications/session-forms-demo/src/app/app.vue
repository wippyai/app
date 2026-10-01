<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi, useHost } from '../composables/useWippy'

// Subset of GET /api/v1/agents/list. host.startChat() needs an agent's start_token.
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
  // Must equal the agent's meta.title; the agents list is matched by title.
  title: string
  registryId: string
  description: string
}

const AGENTS: DemoAgent[] = [
  {
    title: 'Forms demo',
    registryId: 'app.agents:forms_demo',
    description: 'Uses the configured model.',
  },
  {
    title: 'Session Forms Fixture',
    registryId: 'app.session_forms_demo:fixture_agent',
    description: 'Deterministic dev fixture with no external model call. Say "ask me" to get the same form, or answer it to get a scripted confirmation.',
  },
  {
    title: 'Session Forms Steering Fixture',
    registryId: 'app.session_forms_demo:steering_fixture_agent',
    description: 'Same deterministic fixture with Session steering, so you can keep typing while a turn runs.',
  },
  {
    title: 'Session Forms Plain Fixture',
    registryId: 'app.session_forms_demo:plain_fixture_agent',
    description: 'Same deterministic fixture without the forms trait. Say "ask me" and it replies that it can\'t create forms here.',
  },
]

const api = useApi()
const host = useHost()

const errorMessage = ref<string | null>(null)
// The agents the server lists, or null until the first response. The fixture
// agents exist only when the app runs with the Session Forms dev fixtures on,
// so a card is shown only for an agent the server returns.
const listedAgents = ref<AgentListItem[] | null>(null)

const visibleAgents = computed(() => {
  const listed = listedAgents.value
  return listed ? AGENTS.filter(agent => listed.some(item => item.title === agent.title)) : []
})

async function loadAgents() {
  try {
    const response = await api.get<AgentListResponse>('/api/v1/agents/list')
    listedAgents.value = response.data.agents
  }
  catch (err) {
    listedAgents.value = []
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load the agents list.'
  }
}

onMounted(loadAgents)

function openChat(agent: DemoAgent) {
  errorMessage.value = null
  const match = listedAgents.value?.find(item => item.title === agent.title)
  if (!match?.start_token) {
    errorMessage.value = `"${agent.title}" is not available. Check that ${agent.registryId} is registered.`
    return
  }
  try {
    host.startChat(match.start_token, { sidebar: false })
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to start the chat.'
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
        The agents here ask a delivery-preference question with a form. Forms
        demo talks to a real model. When the app runs with the Session Forms
        dev fixtures on, three scripted fixture agents that never leave this
        server are listed as well.
      </p>
    </header>

    <div class="flex flex-col gap-3">
      <div
        v-for="agent in visibleAgents"
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
          class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-white"
          @click="openChat(agent)"
        >
          Start chat
        </button>
      </div>
    </div>

    <p
      v-if="errorMessage"
      class="text-xs text-danger"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>
