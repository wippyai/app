<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import Chip from 'primevue/chip'

/**
 * Components & Embedding showcase — a single page with three tabs:
 *   - Web Components: example custom elements, each in its own Shadow DOM.
 *   - Iframe Theming: the same view.page rendered with default vs overridden colors.
 *   - Nested Navigation: an embedded nav-owner page whose internal routing
 *     mirrors into the browser URL.
 *
 * Tab and nested sub-path live in the query (?tab, ?np) so the page keeps a
 * single clean route and browser back/forward still works.
 */
const route = useRoute()
const router = useRouter()

const tabs = [
  { id: 'components', label: 'Web Components', icon: 'tabler:components' },
  { id: 'iframe', label: 'Iframe Theming', icon: 'tabler:frame' },
  { id: 'nested', label: 'Nested Navigation', icon: 'tabler:route-2' },
] as const
type TabId = typeof tabs[number]['id']

const activeTab = computed<TabId>(() => {
  const t = route.query.tab
  return (typeof t === 'string' && tabs.some(x => x.id === t)) ? t as TabId : 'components'
})

function selectTab(id: TabId) {
  router.push({ query: id === 'components' ? {} : { tab: id } })
}

// Embedded nav-owner sub-path, mirrored to/from the ?np query.
const navOwnerSubPath = computed(() => {
  const p = route.query.np
  return (typeof p === 'string' && p) ? p : '/'
})

function onNavOwnerRoute(e: Event) {
  const { path } = (e as CustomEvent).detail
  if (!path)
    return
  const np = path === '/' ? undefined : path
  if ((typeof route.query.np === 'string' ? route.query.np : '/') !== (np ?? '/'))
    router.push({ query: { tab: 'nested', ...(np ? { np } : {}) } })
}

// --- Web component event logs ---
import { ref } from 'vue'
const reactionEvents = ref<Array<{ emoji: string; active: boolean; time: string }>>([])
const modelEvents = ref<Array<{ name: string; provider: string; time: string }>>([])
const counterEvents = ref<Array<{ count: number; time: string }>>([])

function onReaction(e: Event) {
  const d = (e as CustomEvent).detail
  reactionEvents.value.unshift({ emoji: d.emoji, active: d.active, time: new Date().toLocaleTimeString() })
  if (reactionEvents.value.length > 5) reactionEvents.value.pop()
}
function onCountChanged(e: Event) {
  const d = (e as CustomEvent).detail
  counterEvents.value.unshift({ count: d.count, time: new Date().toLocaleTimeString() })
  if (counterEvents.value.length > 5) counterEvents.value.pop()
}
function onModelSelected(e: Event) {
  const d = (e as CustomEvent).detail
  modelEvents.value.unshift({ name: d.name, provider: d.provider, time: new Date().toLocaleTimeString() })
  if (modelEvents.value.length > 5) modelEvents.value.pop()
}

// --- Demo data ---
const chartLabels = '["Vue","React","Svelte","Angular"]'
const chartValues = '[40,30,20,10]'

const mermaidDef = `graph LR
    A[User] --> B[Facade]
    B --> C[View Page]
    B --> D[View Component]
    D --> E[Shadow DOM]
    E --> F[Vue App]`

const markdownContent = `# Web Components

Build **reusable** UI widgets with the Wippy component system.

## Features

- Shadow DOM isolation
- Reactive props via \`useProps()\`
- Typed events via \`useEvents()\`
- Host CSS inheritance

\`\`\`ts
const props = useComponentProps()
const emit = useComponentEvents()
\`\`\`

> Components are self-contained ES modules that register custom elements.

| Feature | Support |
|---------|---------|
| Vue 3 | Yes |
| Tailwind | Optional |
| PrimeVue | Optional |
`
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto h-full flex flex-col min-h-0">
    <!-- Header -->
    <div class="mb-4">
      <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 mb-1">
        Components &amp; Embedding
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400">
        Web components in Shadow DOM, themed iframe pages, and nested navigation — each in its own tab.
      </p>
    </div>

    <!-- Tab bar -->
    <div
      role="tablist"
      aria-label="Showcase sections"
      class="flex items-center gap-1 p-1 rounded-lg bg-surface-100 dark:bg-surface-800 w-fit mb-4"
    >
      <button
        v-for="t in tabs"
        :key="t.id"
        role="tab"
        :aria-selected="activeTab === t.id"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        :class="activeTab === t.id
          ? 'bg-surface-0 dark:bg-surface-900 text-primary shadow-sm'
          : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-200'"
        @click="selectTab(t.id)"
      >
        <Icon
          :icon="t.icon"
          class="w-4 h-4"
          aria-hidden="true"
        />
        {{ t.label }}
      </button>
    </div>

    <!-- Web Components -->
    <div
      v-show="activeTab === 'components'"
      class="flex flex-col gap-4 flex-1 min-h-0 overflow-auto"
    >
      <!-- Reaction Bar -->
      <div class="p-card p-component rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon
              icon="tabler:mood-smile"
              class="w-[18px] h-[18px]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Reaction Bar
            </h2>
            <code class="text-[10px] text-surface-400 font-mono">&lt;example-reaction-bar&gt;</code>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <Chip
              label="Event Emission"
              class="text-[10px]"
            />
            <Chip
              label="useEvents()"
              class="text-[10px]"
            />
          </div>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Emoji reaction buttons with event emission via useEvents(). Click to toggle reactions — events are captured below.
        </p>
        <example-reaction-bar @reaction="onReaction" />
        <div
          v-if="reactionEvents.length"
          class="mt-3 space-y-1"
        >
          <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-1">
            Recent Events
          </div>
          <div
            v-for="(ev, i) in reactionEvents"
            :key="i"
            class="text-xs font-mono text-surface-600 dark:text-surface-400"
          >
            <span class="text-surface-400">{{ ev.time }}</span>
            &nbsp;{{ ev.emoji }} &rarr; {{ ev.active ? 'active' : 'inactive' }}
          </div>
        </div>
      </div>

      <!-- Counter Persist -->
      <div class="p-card p-component rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon
              icon="tabler:database"
              class="w-[18px] h-[18px]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Counter Persist
            </h2>
            <code class="text-[10px] text-surface-400 font-mono">&lt;example-counter-persist&gt;</code>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <Chip
              label="State Persist"
              class="text-[10px]"
            />
            <Chip
              label="Pinia"
              class="text-[10px]"
            />
          </div>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Counter with Pinia state persistence via @wippy-fe/pinia-persist. State survives iframe reloads. Two instances with different persist-key props maintain separate state.
        </p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-2">
              Instance A (persist-key="a")
            </div>
            <example-counter-persist
              persist-key="a"
              @count-changed="onCountChanged"
            />
          </div>
          <div>
            <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-2">
              Instance B (persist-key="b")
            </div>
            <example-counter-persist
              persist-key="b"
              @count-changed="onCountChanged"
            />
          </div>
        </div>
        <div
          v-if="counterEvents.length"
          class="mt-3 space-y-1"
        >
          <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-1">
            Recent Events
          </div>
          <div
            v-for="(ev, i) in counterEvents"
            :key="i"
            class="text-xs font-mono text-surface-600 dark:text-surface-400"
          >
            <span class="text-surface-400">{{ ev.time }}</span>
            &nbsp;count &rarr; {{ ev.count }}
          </div>
        </div>
      </div>

      <!-- WebSocket Log -->
      <div class="p-card p-component rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon
              icon="tabler:broadcast"
              class="w-[18px] h-[18px]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              WebSocket Log
            </h2>
            <code class="text-[10px] text-surface-400 font-mono">&lt;example-websocket-log&gt;</code>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <Chip
              label="WebSocket"
              class="text-[10px]"
            />
            <Chip
              label="on()"
              class="text-[10px]"
            />
          </div>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Terminal-style log viewer subscribing to WebSocket topics via on(). Shows live messages as they arrive.
        </p>
        <example-websocket-log
          topics="[&quot;@message&quot;,&quot;@system&quot;]"
          max-entries="50"
        />
      </div>

      <!-- Chart Circle -->
      <div class="p-card p-component rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon
              icon="tabler:chart-donut"
              class="w-[18px] h-[18px]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Chart Circle
            </h2>
            <code class="text-[10px] text-surface-400 font-mono">&lt;example-chart-circle&gt;</code>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <Chip
              label="Chart.js"
              class="text-[10px]"
            />
            <Chip
              label="Canvas"
              class="text-[10px]"
            />
          </div>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Doughnut chart powered by Chart.js bundled inside Shadow DOM.
        </p>
        <example-chart-circle
          :labels="chartLabels"
          :values="chartValues"
          title="Frontend Framework Usage"
        />
      </div>

      <!-- Mermaid Diagram -->
      <div class="p-card p-component rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon
              icon="tabler:git-branch"
              class="w-[18px] h-[18px]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Mermaid Diagram
            </h2>
            <code class="text-[10px] text-surface-400 font-mono">&lt;example-mermaid&gt;</code>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <Chip
              label="beautiful-mermaid"
              class="text-[10px]"
            />
            <Chip
              label="Children Content"
              class="text-[10px]"
            />
          </div>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Mermaid diagrams with CSS variable theming. Shows both prop-based and children content approaches.
        </p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-2">
              Via definition prop
            </div>
            <example-mermaid :definition="mermaidDef" />
          </div>
          <div>
            <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-2">
              Via children content
              <code class="text-[10px] ml-1 text-surface-400">&lt;template data-type="..."&gt;</code>
            </div>
            <example-mermaid>
              <template data-type="text/vnd.mermaid">
                sequenceDiagram
                participant H as Host
                participant C as Component
                participant S as Shadow DOM
                H->>C: Register tag
                C->>S: Attach shadow
                S->>S: Load CSS
                S->>C: Mount Vue app
              </template>
            </example-mermaid>
          </div>
        </div>
      </div>

      <!-- Markdown Viewer -->
      <div class="p-card p-component rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon
              icon="tabler:markdown"
              class="w-[18px] h-[18px]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Markdown Viewer
            </h2>
            <code class="text-[10px] text-surface-400 font-mono">&lt;example-markdown&gt;</code>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <Chip
              label="markdown-it"
              class="text-[10px]"
            />
            <Chip
              label="sanitize-html"
              class="text-[10px]"
            />
          </div>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Markdown rendering with sanitize-html and children content support.
        </p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-2">
              Markdown source (via content prop)
            </div>
            <pre class="text-[11px] font-mono text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-900 rounded-lg p-3 overflow-auto max-h-60 border border-surface-200 dark:border-surface-700">{{ markdownContent }}</pre>
          </div>
          <div>
            <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-2">
              Rendered output
            </div>
            <example-markdown :content="markdownContent" />
          </div>
        </div>
      </div>

      <!-- Model Gallery -->
      <div class="p-card p-component rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon
              icon="tabler:brain"
              class="w-[18px] h-[18px]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Model Gallery
            </h2>
            <code class="text-[10px] text-surface-400 font-mono">&lt;example-model-gallery&gt;</code>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <Chip
              label="API Fetch"
              class="text-[10px]"
            />
            <Chip
              label="PrimeVue"
              class="text-[10px]"
            />
            <Chip
              label="api.get()"
              class="text-[10px]"
            />
          </div>
        </div>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
          Fetches AI models via proxy api.get() and displays with PrimeVue components.
        </p>
        <example-model-gallery
          show-details="true"
          @model-selected="onModelSelected"
        />
        <div
          v-if="modelEvents.length"
          class="mt-3 space-y-1"
        >
          <div class="text-[11px] font-medium text-surface-400 uppercase tracking-wider mb-1">
            Selected Models
          </div>
          <div
            v-for="(ev, i) in modelEvents"
            :key="i"
            class="text-xs font-mono text-surface-600 dark:text-surface-400"
          >
            <span class="text-surface-400">{{ ev.time }}</span>
            &nbsp;{{ ev.name }} ({{ ev.provider }})
          </div>
        </div>
      </div>
    </div>

    <!-- Iframe Theming -->
    <div
      v-show="activeTab === 'iframe'"
      class="flex-1 min-h-0 flex flex-col gap-3"
    >
      <p class="text-sm text-surface-500 dark:text-surface-400">
        Two instances of the same view.page. Left uses the default theme; right uses
        <code class="text-xs bg-surface-100 dark:bg-surface-700 px-1 rounded">configOverrides</code>
        to replace all five color families. Watch chart segments, buttons, and accents change.
      </p>
      <div class="iframe-demo-container flex-1 min-h-0 relative">
        <div class="iframe-demo-grid absolute inset-0 gap-4">
          <div class="flex flex-col border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden min-h-[300px]">
            <div class="px-3 py-1.5 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 text-xs font-medium text-surface-500 shrink-0">
              Default Theme
            </div>
            <w-artifact
              id="app.views:iframe-demo"
              type="page"
              class="flex-1"
            />
          </div>
          <div class="flex flex-col border border-purple-200 dark:border-purple-900 rounded-lg overflow-hidden min-h-[300px]">
            <div class="px-3 py-1.5 bg-purple-50 dark:bg-purple-950 border-b border-purple-200 dark:border-purple-900 text-xs font-medium text-purple-600 dark:text-purple-400 shrink-0">
              Custom Palette (configOverrides)
            </div>
            <w-artifact
              id="app.views:iframe-demo-themed"
              type="page"
              class="flex-1"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Nested Navigation -->
    <div
      v-show="activeTab === 'nested'"
      class="flex-1 min-h-0 flex flex-col gap-3"
    >
      <p class="text-sm text-surface-500 dark:text-surface-400">
        The embedded page below is a <strong>nav-owner</strong>. Its internal tabs use
        <code class="text-xs bg-surface-100 dark:bg-surface-700 px-1 rounded">RouterLink</code>,
        and each click mirrors into this browser URL — try the tabs, then browser back/forward.
      </p>
      <div class="flex-1 min-h-0 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
        <w-artifact
          id="app.views:iframe-demo"
          type="page"
          nav-owner
          :sub-path="navOwnerSubPath"
          @nav-owner-route="onNavOwnerRoute"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.iframe-demo-container {
  container-type: inline-size;
}

.iframe-demo-grid {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr 1fr;
  overflow: auto;
}

@container (min-width: 800px) {
  .iframe-demo-grid {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
  }
}
</style>
