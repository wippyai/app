<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useApi, useWippy } from '../composables/useWippy'

/**
 * Web Research — one async end-to-end example. POST kicks off a background
 * dataflow and returns immediately. The agent fetches pages with an HTTP GET
 * tool; each fetch (web:fetch) and the final answer (research:answer) arrive
 * here live over the relay. Nothing blocks on the request.
 */
interface FetchEvent {
  url: string
  status: string | number
  title?: string
  snippet?: string
  error?: string
  at?: string
}

interface AnswerEvent {
  answer: string
}

interface StartResponse {
  success: boolean
  error?: string
}

const api = useApi()
const instance = useWippy()

const query = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const answer = ref<string | null>(null)
const fetches = ref<FetchEvent[]>([])
const unbinds: Array<() => void> = []
let timer: ReturnType<typeof setTimeout> | null = null

const suggestions = [
  'https://example.com',
  'What is the Lua programming language?',
  'https://en.wikipedia.org/wiki/WebAssembly',
]

const sources = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const f of fetches.value) {
    if (typeof f.status === 'number' && f.status < 400 && !seen.has(f.url)) {
      seen.add(f.url)
      out.push(f.url)
    }
  }
  return out
})

// The relay nests the process.send payload under `.data` (see app.vue's
// action:navigate handler); peel that optional layer before narrowing.
function relayPayload(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object' && 'data' in raw)
    return (raw as { data: unknown }).data
  return raw
}

function isFetchEvent(v: unknown): v is FetchEvent {
  return typeof v === 'object' && v !== null && 'url' in v && 'status' in v
}

function isAnswerEvent(v: unknown): v is AnswerEvent {
  return typeof v === 'object' && v !== null && 'answer' in v
}

function onFetch(raw: unknown) {
  const ev = relayPayload(raw)
  if (!isFetchEvent(ev))
    return
  if (ev.status !== 'fetching') {
    const idx = fetches.value.findIndex(e => e.url === ev.url && e.status === 'fetching')
    if (idx >= 0) {
      fetches.value.splice(idx, 1, ev)
      return
    }
  }
  fetches.value.unshift(ev)
  if (fetches.value.length > 20)
    fetches.value.pop()
}

function onAnswer(raw: unknown) {
  const ev = relayPayload(raw)
  if (!isAnswerEvent(ev))
    return
  answer.value = ev.answer
  loading.value = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

onMounted(() => {
  unbinds.push(instance.on('web:fetch', onFetch))
  unbinds.push(instance.on('research:answer', onAnswer))
})

onUnmounted(() => {
  unbinds.forEach(u => u())
  if (timer)
    clearTimeout(timer)
})

async function research() {
  const q = query.value.trim()
  if (!q || loading.value)
    return
  loading.value = true
  error.value = null
  answer.value = null
  fetches.value = []
  try {
    const { data } = await api.post<StartResponse>('/api/v1/research', { query: q })
    if (!data.success) {
      error.value = data.error || 'Failed to start research.'
      loading.value = false
      return
    }
    // The answer arrives over the relay (research:answer); guard against a hang.
    timer = setTimeout(() => {
      if (loading.value) {
        loading.value = false
        error.value = 'Timed out waiting for the agent.'
      }
    }, 90000)
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Request failed.'
    loading.value = false
  }
}

function useSuggestion(s: string) {
  query.value = s
  research()
}

function host(url: string): string {
  try {
    return new URL(url).host
  }
  catch {
    return url
  }
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto h-full flex flex-col">
    <!-- Header -->
    <div class="mb-4">
      <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 mb-1">
        Web Research
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400">
        An async agent fetches pages with an HTTP <strong>GET</strong> tool and answers from them.
        Each fetch and the final answer stream here live via
        <code class="text-xs bg-surface-100 dark:bg-surface-700 px-1 rounded">process.send → relay → browser</code>.
      </p>
    </div>

    <!-- Input -->
    <form class="flex gap-2" @submit.prevent="research">
      <InputText
        v-model="query"
        placeholder="A URL to read, or a question to research…"
        class="flex-1"
        aria-label="Research query"
        :disabled="loading"
      />
      <Button
        type="submit"
        :label="loading ? 'Researching…' : 'Research'"
        :loading="loading"
        :disabled="!query.trim() || loading"
        icon="tabler:world-search"
      />
    </form>

    <!-- Suggestions -->
    <div class="flex flex-wrap gap-2 mt-3">
      <button
        v-for="s in suggestions"
        :key="s"
        type="button"
        class="text-xs px-2.5 py-1 rounded-full border border-surface-200 dark:border-surface-700 text-surface-500 hover:text-primary hover:border-primary transition-colors max-w-full truncate"
        :disabled="loading"
        @click="useSuggestion(s)"
      >
        {{ s }}
      </button>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      role="alert"
      class="mt-5 p-3 rounded-lg bg-danger/10 text-danger text-sm flex items-start gap-2"
    >
      <Icon icon="tabler:alert-triangle" class="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- Answer -->
    <div
      v-if="answer"
      class="mt-5 p-4 rounded-lg bg-primary/5 border border-primary/20"
    >
      <div class="flex items-center gap-1.5 text-[11px] font-medium text-primary uppercase tracking-wider mb-2">
        <Icon icon="tabler:sparkles" class="w-3.5 h-3.5" aria-hidden="true" />
        Answer
      </div>
      <p class="text-sm text-surface-800 dark:text-surface-100 whitespace-pre-line">
        {{ answer }}
      </p>
      <div v-if="sources.length" class="mt-3 flex flex-wrap gap-1.5">
        <a
          v-for="(src, i) in sources"
          :key="i"
          :href="src"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[11px] px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-primary hover:underline"
        >{{ host(src) }}</a>
      </div>
    </div>

    <!-- Live fetch feed -->
    <div v-if="fetches.length" class="mt-5 flex flex-col gap-2 overflow-auto">
      <div class="flex items-center gap-1.5 text-[11px] font-medium text-surface-400 uppercase tracking-wider">
        <span class="relative flex h-2 w-2">
          <span v-if="loading" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2" :class="loading ? 'bg-success' : 'bg-surface-300'" />
        </span>
        Agent fetches
      </div>
      <div
        v-for="(ev, i) in fetches"
        :key="i"
        class="p-card p-component rounded-lg p-3 flex items-start gap-3"
      >
        <div class="shrink-0 mt-0.5">
          <Icon v-if="ev.status === 'fetching'" icon="tabler:loader-2" class="w-4 h-4 text-primary animate-spin" aria-hidden="true" />
          <Icon v-else-if="ev.status === 'error'" icon="tabler:alert-triangle" class="w-4 h-4 text-danger" aria-hidden="true" />
          <Icon v-else icon="tabler:check" class="w-4 h-4 text-success" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-surface-900 dark:text-surface-0 truncate">
              {{ ev.title || host(ev.url) }}
            </span>
            <span class="text-[10px] font-mono text-surface-400 shrink-0">{{ ev.at }}</span>
            <span
              v-if="typeof ev.status === 'number'"
              class="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
              :class="ev.status < 400 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'"
            >{{ ev.status }}</span>
          </div>
          <a :href="ev.url" target="_blank" rel="noopener noreferrer" class="text-xs text-primary hover:underline break-all">{{ ev.url }}</a>
          <p v-if="ev.error" class="text-xs text-danger mt-1">
            {{ ev.error }}
          </p>
          <p v-else-if="ev.snippet" class="text-xs text-surface-500 dark:text-surface-400 mt-1 line-clamp-2">
            {{ ev.snippet }}
          </p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!answer && !error && !loading"
      class="mt-10 flex flex-col items-center justify-center text-center text-surface-400 gap-2"
    >
      <Icon icon="tabler:world-search" class="w-10 h-10" aria-hidden="true" />
      <p class="text-sm">
        Enter a URL or question — watch the agent fetch pages, then get the answer.
      </p>
    </div>
  </div>
</template>
