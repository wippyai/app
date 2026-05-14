# Wippy Proxy API

> **Runtime contract.**
>
> The `$W` global / `getWippyApi()` is the only surface child apps and web components touch — production runs inside the Wippy host, which provides it. For local dev, browser playground pages, and unit tests, the same surface is provided by `dev-proxy.js` (a manual-config dev overlay) or by a vitest stub — the proxy contract is the same shape in both modes. See [host-less-mode.md](host-less-mode.md) for the dual-mode boot and how `<script src=".../dev-proxy.js" data-role="@wippy/scripts">` switches between hosted and host-less without code changes.

## Initialization

To integrate with Wippy, use the `getWippyApi()` promise or the `$W` global variable.

```typescript
// Using getWippyApi()
const { config, host, api, on, logger, state, ws } = await getWippyApi()

// Or use the $W global for individual access
const config = await $W.config()
const host = await $W.host()
const api = await $W.api()
const on = await $W.on()
const logger = await $W.logger()
const state = await $W.state()
const ws = await $W.ws()
const instance = await $W.instance() // Full ProxyApiInstance
```

The initialization returns the following components:

1. `config` - Application configuration (path, artifactId, auth, customization)
2. `host` - Host application communication methods
3. `api` - Authenticated axios instance with automatic auth token injection
4. `on` - Subscription to real-time events from WebSocket layer
5. `logger` - Structured logging — logs traverse child → host → parent for centralized collection. Use instead of `console.log/error` for production logging.
6. `loadWebComponent` - Function to dynamically load other web components
7. `state` - Host-mediated state persistence (survives iframe destruction)
8. `ws` - WebSocket send bridge — send commands through the host's WebSocket connection

---

## host Object

The `host` object provides methods to communicate with the Wippy host application.

### startChat

```typescript
host.startChat(start_token: string, options?: { sidebar?: boolean }): void
```

Initiates a new chat session using the provided token.

- `start_token` - Token to start the chat session
- `options.sidebar` - When `true`, opens chat in the right sidebar panel; when `false` (default), opens in main content area

```typescript
host.startChat('my-start-token')                    // Opens in main area
host.startChat('my-start-token', { sidebar: true }) // Opens in sidebar
```

### openSession

```typescript
host.openSession(sessionUUID: string, options?: { sidebar?: boolean }): void
```

Navigates to an existing chat session.

- `sessionUUID` - UUID of the chat session to open
- `options.sidebar` - When `true`, opens in sidebar; when `false` (default), opens in main area

```typescript
host.openSession('abc-123-uuid', { sidebar: false })
```

### openArtifact

```typescript
host.openArtifact(artifactUUID: string, options?: { target: 'modal' | 'sidebar' }): void
```

Opens an artifact in a modal or sidebar.

- `artifactUUID` - UUID of the artifact to open
- `options.target` - Where to display the artifact: `'modal'` or `'sidebar'` (default)

```typescript
host.openArtifact('artifact-uuid', { target: 'modal' })
```

### setContext

```typescript
host.setContext(
  context: Record<string, unknown>,
  sessionUUID?: string,
  source?: { type: 'page' | 'artifact'; uuid: string; instanceUUID?: string }
): void
```

Sets the context for a chat session. This context can include any arbitrary data that you want to pass along with the chat session.

**Parameters:**
- `context` - Arbitrary data object to send as context
- `sessionUUID` - Optional UUID of a specific session to attach context to
- `source` - Optional identifier for where the context originated

**Behavior:**
- If `sessionUUID` is provided, sends context to that specific session
- If `sessionUUID` is omitted, sends to the last session opened via `startChat` or `openSession`
- If no session is open yet, context is queued and replayed when a session starts
- The `source` parameter identifies which page/artifact sent the context (useful for tracking)

```typescript
// Send to last opened session
host.setContext({ currentPage: 'dashboard', selectedItems: [1, 2, 3] })

// Send to specific session
host.setContext(
  { documentId: 'doc-123' },
  'session-uuid-456',
  { type: 'page', uuid: 'page-uuid-789' }
)
```

### navigate

```typescript
host.navigate(url: string): void
```

Requests navigation to a specific URL. Supported URL patterns:

- `/c/<page-id>` - Navigates to a dynamic page
- `/c/<page-id>/<sub-path>` - Navigates to a dynamic page with sub-path
- `/chat/<session-id>` - Navigates to a chat session

```typescript
host.navigate('/c/my-page-id')
host.navigate('/chat/session-uuid')
```

### onRouteChanged

```typescript
host.onRouteChanged(path: string): void
```

Notifies the host application of internal route changes within the iframe. This updates the host browser URL to reflect the current iframe route.

**Usage in Vue Router:**
```typescript
router.afterEach((to) => {
  host.onRouteChanged(to.fullPath)
})
```

### confirm

```typescript
host.confirm(options: LimitedConfirmationOptions): Promise<boolean>
```

Shows a PrimeVue confirmation dialog. Returns a promise that resolves to `true` if accepted, `false` if rejected.

```typescript
const result = await host.confirm({
  message: 'Are you sure you want to delete this item?',
  header: 'Confirm Delete',
  icon: 'tabler:trash',
  acceptLabel: 'Delete',
  rejectLabel: 'Cancel',
  acceptClass: 'p-button-danger',
})

if (result) {
  // User confirmed
}
```

### toast

```typescript
host.toast(options: ToastMessageOptions): void
```

Shows a PrimeVue toast notification.

```typescript
host.toast({
  severity: 'success',
  summary: 'Success',
  detail: 'Operation completed successfully',
  life: 3000
})
```

Common severities: `'success'`, `'info'`, `'warn'`, `'error'`

### handleError

```typescript
host.handleError(code: 'auth-expired' | 'other', error: Record<string, unknown>): void
```

Reports errors to the host application for handling.

- `'auth-expired'` - Triggers re-authentication flow
- `'other'` - General error handling

```typescript
try {
  await api.get('/protected-endpoint')
} catch (error) {
  if (error.response?.status === 401) {
    host.handleError('auth-expired', error)
  } else {
    host.handleError('other', error)
  }
}
```

### formatUrl

```typescript
host.formatUrl(relativeUrl: string): string
```

Converts a relative URL to an absolute URL using the host's base URL. Useful when generating links that work correctly within the Wippy environment.

```typescript
const absoluteUrl = host.formatUrl('/api/downloads/file.pdf')
// Returns: https://app.wippy.ai/api/downloads/file.pdf
```

### logout

```typescript
host.logout(): void
```

Logs the user out and ends their session.

---

## api Object

The `api` object is an axios instance pre-configured with:
- Base URL from environment
- Content-Type header
- Automatic token injection for authenticated requests

```typescript
// GET request
const response = await api.get('/api/users')

// POST request with data
const result = await api.post('/api/users', {
  name: 'John',
  email: 'john@example.com'
})
```

### File Upload

Upload files using `FormData`. The default JSON content type is automatically replaced when sending `FormData`:

```typescript
const api = useApi()

const file: File = /* from <input type="file"> or drag-and-drop */
const formData = new FormData()
formData.append('file', file)

const abort = new AbortController()

const response = await api.post('/api/v1/uploads', formData, {
  signal: abort.signal,
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (progressEvent) => {
    if (!progressEvent.total) return
    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
    console.log(`Upload progress: ${percent}%`)
  },
})

// Response: { success: boolean, uuid: string }
const uploadedUuid = response.data.uuid
```

To cancel an upload, call `abort.abort()`.

Track processing status via WebSocket events:

```typescript
const { on } = useWippy()

on(`upload:${uploadedUuid}`, (msg) => {
  // msg.data.status: 'uploaded' | 'completed' | 'error' | 'processing'
  console.log('Upload status:', msg.data.status)
})
```

### File Download

Download binary files by setting `responseType: 'blob'`:

```typescript
const api = useApi()

const response = await api.get(`/api/v1/uploads/${uuid}/download`, {
  responseType: 'blob',
})

// Create a download link
const url = URL.createObjectURL(response.data)
const a = document.createElement('a')
a.href = url
a.download = 'filename.pdf'
a.click()
URL.revokeObjectURL(url)
```

### Retrieve Upload Info

```typescript
const api = useApi()

// List uploads with pagination
const list = await api.get('/api/v1/uploads/list', {
  params: { limit: 10, offset: 0 },
})
// list.data.uploads: Array<{ uuid, mime_type, size, status, meta: { filename } }>

// Get a specific upload
const upload = await api.get(`/api/v1/uploads/${uuid}`)
// upload.data: { uuid, mime_type, size, status, meta: { filename, content_sample? } }
```

> **Note:** Maximum file size is 100 MB.

---

## on() Events

The `on` function subscribes to events from the host application and WebSocket layer.

### @history

Emitted when the host URL changes (SPA navigation).

```typescript
on('@history', ({ path }) => {
  console.log('Host URL changed:', path)
  // Update internal router if needed
})
```

### @visibility

Emitted when iframe visibility changes (tab switch, hide/show). The host watches a visibility ref and sends visibility update messages.

```typescript
on('@visibility', (visible: boolean) => {
  if (visible) {
    console.log('Page is now visible')
    // Resume animations, refresh data, restart polling
  } else {
    console.log('Page is now hidden')
    // Pause animations, stop polling, reduce resource usage
  }
})
```

### @message

Subscribe to ALL WebSocket messages (wildcard). Internally subscribes to patterns: `*`, `*:*`, `*:*:*`, `*:*:*:*`

```typescript
on('@message', (message) => {
  console.log('Received WebSocket message:', message)
})
```

### @state-error

Emitted when a state save operation fails (e.g., quota exceeded).

```typescript
on('@state-error', ({ error, key }) => {
  console.warn(`State save failed for "${key}": ${error}`)
})
```

### Topic Patterns

Colon-separated parts with `*` wildcard matching:

- `session:*` matches `session:uuid-1`, `session:uuid-2`
- `session:*:message:*` matches `session:uuid:message:msgId`
- Pattern must have the **same number of parts** as the topic

```typescript
// Listen to all session updates
on('session:*', (event) => {
  console.log('Session update:', event)
})

// Listen to specific session messages
on('session:abc-123:message:*', (event) => {
  console.log('Message in session abc-123:', event)
})

// If topic parts contain ":" characters, encode them
on('session:' + encodeURIComponent('id:with:colons') + ':message:*', (event) => {
  console.log('Message event:', event)
})
```

---

## state Object

The `state` object provides host-mediated key-value storage that persists across iframe reloads. Scoped automatically per page/artifact UUID.

All methods accept an optional `options` parameter with a `scope` field to override the default page-level scope. This is used by web components with `persist-key` or nested artifacts to isolate state per instance.

### state.get

```typescript
state.get<T = unknown>(key: string, options?: { scope?: string }): Promise<T | null>
```

Retrieves a previously saved value. Returns `null` if not found.

### state.set

```typescript
state.set(key: string, value: unknown, options?: { scope?: string }): Promise<void>
```

Saves a JSON-serializable value. Resolves immediately without waiting for host acknowledgment. If quota is exceeded, a `@state-error` event is emitted asynchronously.

### state.remove

```typescript
state.remove(key: string, options?: { scope?: string }): Promise<void>
```

Removes a single key from this page's state.

### state.clear

```typescript
state.clear(options?: { scope?: string }): Promise<void>
```

Removes all state for this page/scope.

### state.getAll

```typescript
state.getAll(options?: { scope?: string }): Promise<Record<string, unknown>>
```

Returns all saved state as a flat object. Useful for bulk hydration.

### Scope

By default, state is scoped to the page/artifact UUID (set by the host). The `scope` option overrides this, allowing multiple instances of the same component to maintain separate state.

> **WARNING:** Scope values must be **globally unique** across your application. If two unrelated components use the same scope string, their state will collide. Use descriptive, namespaced keys (e.g., `my-app:sidebar-counter`, `dashboard:filter-panel`).
>
> When using `@wippy-fe/pinia-persist`, custom scopes are automatically prefixed with `@custom:` to prevent collisions with system scopes (page/artifact UUIDs). The raw `state` API passes scope values as-is — if using it directly, you must manage namespacing yourself.

### Example: Caching API Data

```typescript
const { state, on } = await getWippyApi()

// Restore cached data on mount, fall back to API
const cached = await state.get<User[]>('users')
if (cached) {
  users.value = cached
} else {
  const { data } = await api.get('/api/v1/users')
  users.value = data.users
  await state.set('users', users.value)
}

// Save when page goes to background
on('@visibility', (visible) => {
  if (!visible) state.set('users', users.value)
})
```

---

## ws Object

The `ws` object lets child apps send commands through the host's WebSocket connection.

### send

```typescript
ws.send(command: WsCommand): void
```

Send a raw WebSocket command. Fire-and-forget — responses arrive via `on()` event subscriptions.

```typescript
const { ws, on } = await getWippyApi()

// Listen for responses
on('session:my-session:message:*', (msg) => {
  console.log('Response:', msg.data)
})

// Send a message
ws.send({
  type: 'session_message',
  session_id: 'my-session',
  message_id: crypto.randomUUID(),
  data: { text: 'Hello from child app' },
})
```

### sendWithResponse

```typescript
ws.sendWithResponse(command: WsCommand): Promise<WsMessage>
```

Send a command and wait for the server's response. Times out after 30 seconds.

```typescript
const { ws } = await getWippyApi()

const response = await ws.sendWithResponse({
  type: 'session_open',
  start_token: 'my-token',
})
console.log('Session opened:', response.data)
```

### sendCommand

```typescript
ws.sendCommand(sessionId: string, data: { command: string, [key: string]: unknown }): void
```

Convenience method for session commands (stop, model, agent).

```typescript
const { ws } = await getWippyApi()

ws.sendCommand('session-uuid', { command: 'stop' })
ws.sendCommand('session-uuid', { command: 'model', name: 'gpt-4' })
ws.sendCommand('session-uuid', { command: 'agent', name: 'my-agent' })
```

---

## Helper Functions

### hostCss namespace

URLs to host-provided CSS (Vite `?url` imports). Use for reducing bundle size by leveraging host styles:

```typescript
import { hostCss } from '@wippy-fe/proxy'

hostCss.fontCssUrl       // Google Fonts
hostCss.themeConfigUrl   // Theme CSS variables (--p-* tokens, light + dark)
hostCss.primeVueCssUrl   // PrimeVue + Tailwind utility CSS (~455 KB)
hostCss.markdownCssUrl   // .data-body markdown styles
hostCss.iframeCssUrl     // Scrollbar styling (--p-surface-* refs)
hostCss.preflightCssUrl  // Tailwind v3 preflight reset (legacy runtime-Tailwind only)
```

> **For when to request each key** (and bundle-size impact per choice), see [theming.md § hostCssKeys decision tree](theming.md#hostcsskeys-decision-tree-for-web-components). The same doc has a [§ What the Wippy host provides](theming.md#what-the-wippy-host-provides-the-substrate) section explaining what each CSS file contains.

### loadCss(url)

```typescript
loadCss(url: string): Promise<string>
```

Fetches CSS content via authenticated API. Returns raw CSS string. Useful for embedding styles in Shadow DOM:

```typescript
import { hostCss, loadCss } from '@wippy-fe/proxy'

const css = await loadCss(hostCss.primeVueCssUrl)
shadowRoot.innerHTML = `<style>${css}</style>` + shadowRoot.innerHTML
```

### loadWebComponent(componentId, tagName?)

```typescript
loadWebComponent(componentId: string, tagName?: string): Promise<void>
```

Dynamically loads another web component by artifact UUID:

1. Fetches artifact metadata (must be `application/json`)
2. Validates it's a Wippy ESM module (package.json with `specification: "wippy-component-1.0"`)
3. Creates `<script type="module" src="...?declare-tag=tagName">`
4. Component auto-registers via `define()`

```typescript
// Load and register a component
await loadWebComponent('artifact-uuid-123', 'my-custom-chart')

// Now you can use <my-custom-chart> in your HTML
```

### addIcons(addCollectionFn)

Register custom Iconify icons from config:

```typescript
import { addCollection } from '@iconify/vue'
import { addIcons } from '@wippy-fe/proxy'

addIcons(addCollection)  // Adds wippy icons + custom icons from config
```

---

## TypeScript

For TypeScript support, install the types package:

```json
"devDependencies": {
  "@wippy-fe/types-global-proxy": "^0.0.1"
}
```

Derive types from the `$W` global:

```typescript
export type HostApi = Awaited<ReturnType<typeof window.$W.host>>
export type ProxyApiInstance = Awaited<ReturnType<typeof window.$W.instance>>
export type WippyConfig = Awaited<ReturnType<typeof window.$W.config>>
```

---

## Deprecated (Do Not Use)

The following are deprecated and should not be used in new code:

- **`iframe` object** - 100% deprecated alias for `host`. Use `host` instead.
- **`form` object** - Existed for form state management. Use direct API calls instead.
- **`tailwindConfig`** - Only for runtime Tailwind CDN script (`<script src="https://cdn.tailwindcss.com">`), not for modern Vite builds with Tailwind as a dependency.

---

## Configuration

The `config` object contains application configuration:

```typescript
interface AppConfig {
  artifactId?: string        // Current artifact ID (if applicable)
  path?: string              // Sub-path after page ID (e.g., /c/page-id/sub-path)
  auth: AppAuthConfig        // Authentication details
  feature?: AppFeatures      // App features (history mode, session type, etc.)
  customization?: AppCustomization  // Custom CSS, i18n, icons
}
```

For dynamic pages, if the URL is `/c/123/something/else?foo=1`:
- Page ID: `123`
- `config.path`: `/something/else?foo=1`

---

## Icon Guidelines

Use Iconify with the tabler prefix:

```html
<script src="https://code.iconify.design/iconify-icon/2.3.0/iconify-icon.min.js"></script>
<iconify-icon icon="tabler:user" width="24" height="24"></iconify-icon>
```

Or with `@iconify/vue`:

```vue
<script setup>
import { Icon } from '@iconify/vue'
</script>

<template>
  <Icon icon="tabler:user" width="24" height="24" />
</template>
```

Common icons: `tabler:user`, `tabler:alert-circle`, `tabler:circle-check`, `tabler:loader`, `tabler:calendar`, `tabler:settings`, `tabler:plus`

Browse all icons at [tabler-icons.io](https://tabler-icons.io/)

---

## `<w-artifact>` Web Component

The proxy exposes a native Web Component called `<w-artifact>` that lets you embed pages or artifacts directly inside any dynamic page.

### Basic Usage

```html
<!-- Render an artifact by UUID -->
<w-artifact id="38fb..." type="artifact"></w-artifact>

<!-- Render a page with auto-resize -->
<w-artifact id="123e456..." type="page" auto-height></w-artifact>
```

### Attributes

| Attribute     | Required | Values                    | Default    | Description                                              |
| ------------- | -------- | ------------------------- | ---------- | -------------------------------------------------------- |
| `id`          | Yes      | Artifact / Page UUID      | –          | Which content to load                                    |
| `type`        | No       | `artifact` \| `page`      | `artifact` | Which REST endpoint to call                              |
| `auto-height` | No       | _(boolean flag)_          | `false`    | Listen for `CmdBodySize` events and adjust height        |
| `url`         | No       | Any URL                   | –          | Fetch content directly from URL, ignoring `id`/`type`    |
| `sub-path`    | No       | Any path string           | –          | Overrides `config.path` for embedded content             |

### Events

| Event name | When it fires                           | `detail` payload                    |
| ---------- | --------------------------------------- | ----------------------------------- |
| `loading`  | Before remote content starts fetching   | –                                   |
| `load`     | After iframe is inserted successfully   | –                                   |
| `error`    | When fetch fails                        | Original error object               |
| `size`     | When auto-height updates iframe size    | `{ width: number, height: number }` |

```javascript
document.querySelector('w-artifact')?.addEventListener('error', (e) => {
  console.error('Failed to load artifact:', e.detail)
})
```

### Styling via CSS

`<w-artifact>` exposes its state to CSS:

**Host `status` attribute** - always one of `loading`, `ready`, `error`:
```css
w-artifact[status="loading"] { opacity: 0.5; }
w-artifact[status="error"]   { border: 1px solid red; }
```

**Shadow parts** - internal nodes are labelled:

| Part name | Node                      |
| --------- | ------------------------- |
| `loader`  | The loading placeholder   |
| `error`   | The error placeholder     |
| `frame`   | The underlying `<iframe>` |

```css
w-artifact::part(loader) { font-size: 1rem; }
w-artifact::part(frame)  { border: 0; }
```

### Behavior

1. Fetches raw HTML using the proxy's authenticated `api` instance
2. When `url` is provided, that value is used directly; otherwise:
   - `type="page"` → `/api/public/pages/content/<id>`
   - `type="artifact"` → `/api/artifact/<id>/content`
3. HTML is rendered inside a sandboxed iframe (`sandbox="allow-same-origin allow-scripts allow-forms allow-popups"`)
4. All iframe → host commands are bridged automatically
5. If `sub-path` is supplied, its value is forwarded to the inner iframe as `config.path`
6. Markdown and inline-interactive artifacts are **not** supported - only plain iframe renders

---

## Loading & Error Components

Two zero-dependency web components are auto-registered via `loading.js` (injected before `proxy.js`). No imports or manual registration needed — just use the HTML tags.

### `<wippy-loading>`

Fullscreen loading spinner with theme-aware colors. The animation is time-synced to the system clock, so mount/remount preserves the spinner phase (no visual jump).

| Attribute | Description |
|-----------|-------------|
| `title` | Main text (e.g. "Loading...") |
| `subtitle` | Secondary text |
| `no-bg` | Boolean — transparent background for overlay use |

```html
<!-- Fullscreen (standalone use in app.html or page body) -->
<wippy-loading title="Loading..." subtitle="Please wait"></wippy-loading>

<!-- Overlay mode (transparent bg, parent controls backdrop) -->
<wippy-loading no-bg title="Loading page content..."></wippy-loading>
```

### `<wippy-error>`

Fullscreen error/warning display with icon and severity-based coloring.

| Attribute | Values | Default |
|-----------|--------|---------|
| `title` | Any string | "Something went wrong" |
| `message` | Any string | (empty) |
| `icon` | `circle`, `triangle`, `sad` | `circle` |
| `severity` | `danger`, `warning` | `danger` |
| `no-bg` | Boolean — transparent background | (absent) |

```html
<wippy-error title="Failed to load" message="Server returned 500" icon="circle" severity="danger"></wippy-error>
<wippy-error title="Connection Lost" message="Retrying..." icon="triangle" severity="warning"></wippy-error>
```

### Recommended Pattern

Do NOT build custom loading divs or CSS spinners — use `<wippy-loading>` and `<wippy-error>` for all fullscreen states. They follow the platform theme automatically (colors, dark mode) and provide a consistent experience across all pages.

**Vanilla HTML page:**
```html
<body>
  <wippy-loading id="loader" title="Loading..."></wippy-loading>
  <div id="content" style="display:none">
    <!-- your content -->
  </div>
  <script>
    async function init() {
      try {
        const { api, host } = await getWippyApi()
        // ... fetch data, set up page ...
        document.getElementById('loader').remove()
        document.getElementById('content').style.display = 'block'
      } catch (error) {
        var errorEl = document.createElement('wippy-error')
        errorEl.setAttribute('title', 'Initialization failed')
        errorEl.setAttribute('message', error.message)
        document.getElementById('loader').replaceWith(errorEl)
      }
    }
    init()
  </script>
</body>
```

**Vue 3 app (app.html entry point):**
```html
<body>
  <div id="app">
    <wippy-loading title="Loading..."></wippy-loading>
  </div>
  <script type="module" src="./src/app.ts"></script>
</body>
```
When Vue mounts into `#app`, it replaces the `<wippy-loading>` element automatically — no manual cleanup needed.

### CSS Custom Properties

Both components use Shadow DOM and inherit CSS variables from `@wippy-fe/theme`:
- `--p-primary` — spinner accent color
- `--p-surface-0` / `--p-surface-900` — background (light/dark)
- `--p-text-color` — title text
- `--p-text-muted-color` — subtitle/message text
- `--p-danger-*` / `--p-warn-*` — error/warning severity colors

If the theme CSS is not loaded (e.g., facade before config fetch), hardcoded fallbacks are used.

For the full CSS-variable contract these components consume — and how to override them via the facade or per-page `configOverrides` — see [theming.md](theming.md).
