<script setup lang="ts">
// Self-contained bridge demo (1.0.33).
//
// Demonstrates the channel-based `host.bridge.post / request / on` API
// without depending on the gen-2-chat host attaching any listener. The
// page spawns its OWN child via a nested `<w-iframe srcdoc="...">` —
// `bridge.vue` plays the PARENT role; the inline srcdoc plays the CHILD.
//
// The bridge protocol is symmetric: either side can `post(...)` to
// fire-and-forget, `request(...)` to round-trip, or `on(channel, ...)`
// to handle inbound calls. This demo wires up both directions:
//
//   PARENT (bridge.vue)                CHILD (srcdoc in <w-iframe>)
//   ────────────────────              ─────────────────────────────
//   .post('parent-fire', ...) ──────▶ on('parent-fire', ...)
//   .request('add', {a,b}) ◀───────── on('add', ({a,b}) => a+b)
//   wippy-message listener  ◀──────── host.bridge.post('child-fire', ...)
//   wippy-message + respond ◀──────── host.bridge.request('echo', ...)
//
// Three live demos below. Event log shows every interaction in order.
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'

const wIframeRef = useTemplateRef<HTMLElement>('wIframeRef')
const isReady = ref(false)
const eventLog = ref<string[]>([])

// Surface every log line into a window-scoped array so e2e tests can read
// the interaction history without DOM scraping. The README references
// `window.__bridgeLog`; this is its definition.
declare global {
  interface Window { __bridgeLog?: string[] }
}

function log(line: string) {
  const ts = new Date().toISOString().slice(11, 19)
  const entry = `${ts}  ${line}`
  eventLog.value = [...eventLog.value, entry]
  if (!window.__bridgeLog)
    window.__bridgeLog = []
  window.__bridgeLog.push(entry)
}

// ── Inline child page (srcdoc of nested <w-iframe>) ──
//
// Plain HTML + a module script that imports `host` from '@wippy-fe/proxy'.
// The Wippy proxy's import-map injection makes `@wippy-fe/proxy` resolve.
// The child uses host.bridge.* to talk to bridge.vue (its parent).
const childSrcdoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :host, html, body { margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f9fafb; color: #111; }
  body { padding: 12px; box-sizing: border-box; }
  h2 { font-size: 13px; margin: 0 0 6px; color: #374151; }
  .row { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
  button { padding: 4px 10px; font-size: 12px; background: #6366f1; color: white; border: none; border-radius: 4px; cursor: pointer; }
  button:hover { background: #4f46e5; }
  input { font-size: 12px; padding: 3px 6px; border: 1px solid #d1d5db; border-radius: 4px; flex: 1; }
  pre { font: 11px ui-monospace, monospace; background: #f3f4f6; padding: 6px; border-radius: 4px; max-height: 100px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  .ok { color: #059669; } .err { color: #dc2626; }
</style>
</head>
<body>
<h2>Bridge child (inside &lt;w-iframe&gt;)</h2>
<div class="row">
  <button id="post-btn" data-testid="child-post-btn">child.post('child-fire', { msg })</button>
</div>
<div class="row">
  <button id="request-btn" data-testid="child-request-btn">child.request('echo', { msg })</button>
  <span id="result" data-testid="child-request-result"></span>
</div>
<div class="row">
  <span style="font-size: 12px; color: #6b7280;">Parent calls 'add' / 'parent-fire' on me. Log:</span>
</div>
<pre id="log">waiting for boot...</pre>
<script type="module">
  const log = document.getElementById('log')
  function append(line) {
    log.textContent = (log.textContent === 'waiting for boot...' ? '' : log.textContent + '\\n') + line
    log.scrollTop = log.scrollHeight
  }
  try {
    const { host } = await window.getWippyApi()
    const bridge = host.bridge
    append('READY — host.bridge attached')

    // Parent-initiated calls land here.
    bridge.on('add', ({ a, b }) => {
      append(\`HANDLER add: \${a} + \${b}\`)
      return a + b
    })
    bridge.on('parent-fire', (payload) => {
      append('HANDLER parent-fire: ' + JSON.stringify(payload))
    })

    document.getElementById('post-btn').addEventListener('click', () => {
      const payload = { msg: 'hello-from-child', at: Date.now() }
      bridge.post('child-fire', payload)
      append('POST → child-fire: ' + JSON.stringify(payload))
    })
    document.getElementById('request-btn').addEventListener('click', async () => {
      const result = document.getElementById('result')
      try {
        const r = await bridge.request('echo', { msg: 'hello-from-child' }, { timeoutMs: 3000 })
        result.innerHTML = '<span class="ok">' + JSON.stringify(r) + '</span>'
        append('REQUEST ← echo: ' + JSON.stringify(r))
      } catch (err) {
        result.innerHTML = '<span class="err">' + err.message + '</span>'
        append('REQUEST ✗ echo: ' + err.message)
      }
    })
  } catch (err) {
    append('FATAL: ' + err.message)
  }
<\/script>
</body>
</html>`

// ── Demo controls (parent → child) ──
async function callChildAdd() {
  if (!wIframeRef.value) {
    log('child not mounted')
    return
  }
  const a = Math.floor(Math.random() * 10)
  const b = Math.floor(Math.random() * 10)
  log(`REQUEST → add: ${a} + ${b}`)
  try {
    const sum = await (wIframeRef.value as unknown as {
      request: (channel: string, payload?: unknown, opts?: { timeoutMs: number }) => Promise<number>
    }).request('add', { a, b }, { timeoutMs: 3000 })
    log(`REQUEST ← add: ${a} + ${b} = ${sum}`)
  }
  catch (err) {
    log(`REQUEST ✗ add: ${(err as Error).message}`)
  }
}

function fireChildPost() {
  if (!wIframeRef.value) {
    log('child not mounted')
    return
  }
  const payload = { greeting: 'hi-from-parent', tick: Date.now() }
  ;(wIframeRef.value as unknown as { post: (c: string, p?: unknown) => void }).post('parent-fire', payload)
  log(`POST → parent-fire: ${JSON.stringify(payload)}`)
}

// ── wippy-message listener (child → parent) ──
//
// Bubbling/composed CustomEvent dispatched by <w-iframe> when the child
// calls host.bridge.post(...) or host.bridge.request(...). For requests,
// detail.respond / detail.reject reply to the child.
function onWippyMessage(event: Event) {
  const e = event as CustomEvent<{
    channel: string
    payload: unknown
    requestId?: string
    respond?: (result?: unknown) => void
    reject?: (error?: unknown) => void
  }>
  const { channel, payload, requestId, respond, reject } = e.detail
  log(`wippy-message: channel="${channel}" ${requestId ? '(request)' : '(post)'}`)
  if (channel === 'echo' && respond) {
    respond({ echoed: payload, at: Date.now() })
    return
  }
  if (channel === 'child-fire') {
    log(`  parent received child-fire payload: ${JSON.stringify(payload)}`)
    return
  }
  if (requestId && reject)
    reject(`No parent handler for channel "${channel}"`)
}

function onLifecycle(name: string) {
  return () => log(`<w-iframe> ${name}`)
}

onMounted(() => {
  const el = wIframeRef.value
  if (!el) {
    log('FATAL: wIframeRef did not resolve in onMounted — bridge demo is non-functional')
    return
  }
  el.addEventListener('wippy-message', onWippyMessage)
  el.addEventListener('loading', onLifecycle('loading'))
  el.addEventListener('load', () => {
    log('<w-iframe> load (child page ready)')
    isReady.value = true
  })
  // <w-iframe> dispatches a CustomEvent('error', { detail: err }) (see
  // w-iframe.ts), but addEventListener('error', ...) is typed for ErrorEvent.
  // Go via unknown to land on the real shape without lying about the cast.
  el.addEventListener('error', (e) => log(`<w-iframe> error: ${(e as unknown as CustomEvent).detail}`))
  log('mounted, attaching to <w-iframe>')
})

onUnmounted(() => {
  wIframeRef.value?.removeEventListener('wippy-message', onWippyMessage)
})
</script>

<template>
  <div data-testid="bridge-demo" class="space-y-4">
    <header>
      <h2 class="text-base font-semibold text-surface-800 dark:text-surface-100">
        Bridge Demo (self-contained)
      </h2>
      <p class="text-xs text-surface-500 leading-relaxed">
        Demonstrates <code class="bg-surface-100 dark:bg-surface-700 px-1 rounded text-xs">host.bridge.post / request / on</code>
        between this page (parent) and a nested
        <code class="bg-surface-100 dark:bg-surface-700 px-1 rounded text-xs">&lt;w-iframe&gt;</code> (child).
        Each side can fire-and-forget or round-trip.
      </p>
    </header>

    <section class="border border-surface-200 dark:border-surface-700 rounded p-3 space-y-2">
      <h3 class="text-sm font-medium text-surface-700 dark:text-surface-200">
        Parent → Child
      </h3>
      <p class="text-xs text-surface-500">
        The child registered <code class="text-xs">on('add', ...)</code> and <code class="text-xs">on('parent-fire', ...)</code> handlers.
      </p>
      <div class="flex gap-2">
        <button
          data-testid="parent-request-btn"
          class="text-sm px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded disabled:opacity-50"
          :disabled="!isReady"
          @click="callChildAdd"
        >
          request('add', { a, b }) → expect sum
        </button>
        <button
          data-testid="parent-post-btn"
          class="text-sm px-3 py-1 bg-surface-200 hover:bg-surface-300 dark:bg-surface-700 text-surface-700 dark:text-surface-200 rounded disabled:opacity-50"
          :disabled="!isReady"
          @click="fireChildPost"
        >
          post('parent-fire', { greeting })
        </button>
      </div>
    </section>

    <section class="border border-surface-200 dark:border-surface-700 rounded p-3 space-y-2">
      <h3 class="text-sm font-medium text-surface-700 dark:text-surface-200">
        Child (inside &lt;w-iframe&gt;)
      </h3>
      <p class="text-xs text-surface-500">
        Child buttons drive child→parent calls. Parent's
        <code class="text-xs">wippy-message</code> listener echoes
        <code class="text-xs">'echo'</code> requests and logs
        <code class="text-xs">'child-fire'</code> posts.
      </p>
      <w-iframe
        ref="wIframeRef"
        :srcdoc="childSrcdoc"
        resource-id="bridge-demo-child"
        resource-type="page"
        auto-height="true"
        style="display: block; width: 100%; min-height: 240px; border: 1px solid #e5e7eb; border-radius: 4px;"
      />
    </section>

    <section class="border border-surface-200 dark:border-surface-700 rounded p-3 space-y-2">
      <h3 class="text-sm font-medium text-surface-700 dark:text-surface-200">
        Parent event log
      </h3>
      <pre
        data-testid="bridge-event-log"
        class="text-xs font-mono bg-surface-100 dark:bg-surface-900 p-2 rounded max-h-48 overflow-auto whitespace-pre-wrap"
      >{{ eventLog.join('\n') || '(no events yet)' }}</pre>
    </section>
  </div>
</template>
