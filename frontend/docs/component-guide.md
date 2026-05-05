# Prompt for Building Wippy Web Components

> **Runtime contract: the proxy API.**
>
> Wippy web components communicate with the world only through `@wippy-fe/proxy` (`api`, `host`, `on`, etc.). In production they run inside the Wippy host, which provides those globals. For local dev, browser playground pages, and unit tests, the same components run **host-less** — `dev-proxy.js` (or a vitest stub) supplies the proxy globals and a fake host. Apps and components are deliberately *standalone-aware* — they don't reach out to neighboring code or the host's internals. See [host-less-mode.md](host-less-mode.md) for the dual-mode boot, dev overlay, and WC test-isolation patterns.

## Task

Create a Wippy web component using the `WippyVueElement` base class with Vue 3, Shadow DOM encapsulation, and typed props/events. The base classes handle all boilerplate (shadow root, CSS loading, prop parsing, Vue app mounting, reactive injection). You write the Vue component and configuration.

## Architecture Overview

The system uses a two-layer base class hierarchy:

1. **`WippyElement`** (`@wippy-fe/webcomponent-core`) -- Raw custom element base class. Handles:
   - Shadow DOM creation (`open` or `closed`)
   - Host CSS loading from `@wippy-fe/proxy` (fonts, theme, PrimeVue, etc.)
   - Inline CSS injection (your component's own styles)
   - JSON-schema-based prop parsing from HTML attributes (type coercion, defaults, validation)
   - `<template data-type="...">` children content extraction via MutationObserver
   - `ElementInternals` state management (`loading`, `ready`, `error`)
   - Lifecycle event emission (`load`, `unload`, `error`, `invalid`)

2. **`WippyVueElement`** (`@wippy-fe/webcomponent-vue`) -- Extends `WippyElement`. Adds:
   - Vue 3 app creation and mounting into the shadow root
   - Reactive prop injection via `useProps<T>()`
   - Typed event emission via `useEvents<T>()`
   - Prop validation error injection via `usePropsErrors()`
   - Children content injection via `useContent()`
   - Plugin registration (PrimeVue, Pinia, etc.)

**You never touch Shadow DOM, CSS loading, or prop parsing directly.** You declare configuration via two static getters (`wippyConfig` and `vueConfig`) and write a normal Vue SFC.

## File Structure

```
my-widget/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── .eslintrc.cjs
├── postcss.config.js          # Only if using Tailwind
├── tailwind.config.ts          # Only if using Tailwind
└── src/
    ├── index.ts                # WippyVueElement subclass + define()
    ├── types.ts                # ComponentProps interface
    ├── constants.ts            # Events interface + typed composables
    ├── styles.css              # Component styles (imports @wippy-fe/theme)
    ├── tailwind.css            # Only if using Tailwind (@tailwind directives)
    └── app/
        └── my-widget.vue       # Main Vue component
```

## Complete Working Skeleton

### Variant A: Minimal (no Tailwind, no PrimeVue)

Use this for components that only need theme variables and custom CSS (like `websocket-log`, `mermaid`, `chart-circle`).

#### package.json

```json
{
  "name": "@example/my-widget",
  "version": "1.0.0",
  "specification": "wippy-component-1.0",
  "title": "My Widget",
  "description": "Description of what the widget does",
  "browser": "dist/index.js",
  "files": ["dist/", "src/", "package.json"],
  "dependencies": {
    "@wippy-fe/theme": "^0.0.7",
    "@wippy-fe/webcomponent-core": "^0.0.7",
    "@wippy-fe/webcomponent-vue": "^0.0.7"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "@wippy-fe/proxy": "^0.0.7",
    "eslint": "^8.57.0",
    "eslint-plugin-vue": "^9.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vue": "^3.5.0",
    "vue-eslint-parser": "^9.4.3",
    "vue-tsc": "^2.0.0"
  },
  "peerDependencies": {
    "@wippy-fe/proxy": "^0.0.7",
    "vue": "^3.5.0"
  },
  "wippy": {
    "tagName": "example-my-widget",
    "type": "widget",
    "props": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "default": "Hello",
          "description": "Widget title"
        },
        "max-items": {
          "type": "number",
          "default": 10,
          "description": "Maximum number of items to display"
        }
      }
    },
    "scripts": {
      "build": "build",
      "debug": "build:debug",
      "test": "lint"
    }
  },
  "scripts": {
    "build": "vite build",
    "build:debug": "vite build --mode development",
    "dev": "vite build --watch",
    "lint": "eslint src --ext .ts,.vue",
    "lint:fix": "eslint src --ext .ts,.vue --fix"
  }
}
```

#### vite.config.ts

```typescript
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'esnext',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MyWidget',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/index.ts'),
      },
      external: [
        'vue',
        'pinia',
        '@iconify/vue',
        '@wippy-fe/proxy',
      ],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
    sourcemap: true,
  },
})
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "@wippy-fe/proxy"],
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

#### tsconfig.node.json

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

#### .eslintrc.cjs

```javascript
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict',
    'plugin:vue/vue3-recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/no-invalid-void-type': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/no-v-html': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'eqeqeq': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
  },
  env: {
    browser: true,
    es2020: true,
  },
}
```

#### src/types.ts

```typescript
export interface ComponentProps {
  title?: string
  maxItems?: number
}
```

#### src/constants.ts

```typescript
import { useProps, useEvents, usePropsErrors } from '@wippy-fe/webcomponent-vue'
import type { ComponentProps } from './types.ts'

export interface Events {
  load: undefined
  unload: undefined
  error: { message: string, error: unknown }
  invalid: { message: string }
}

export const useComponentProps = () => useProps<ComponentProps>()
export const useComponentEvents = () => useEvents<Events>()
export const useComponentPropsErrors = usePropsErrors
```

#### src/index.ts

```typescript
import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import type { ComponentProps } from './types.ts'
import type { Events } from './constants.ts'
import MyWidget from './app/my-widget.vue'
import stylesText from './styles.css?inline'
import pkg from '../package.json'

class MyWidgetElement extends WippyVueElement<ComponentProps, Events> {
  static get wippyConfig(): WippyElementConfig<ComponentProps> {
    return {
      propsSchema: pkg.wippy.props as WippyPropsSchema,
      hostCssKeys: ['fontCssUrl', 'themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: MyWidget,
    }
  }
}

export async function webComponent() {
  return MyWidgetElement
}

define(import.meta.url, MyWidgetElement)
```

#### src/styles.css

```css
@import "@wippy-fe/theme/theme-config.css";

.my-widget {
  font-family: inherit;
  color: var(--p-text-color);
  background: var(--p-content-background);
  width: 100%;
  height: 100%;
}

.my-widget .header {
  padding: 8px 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--p-content-border-color, #e5e7eb);
}

.my-widget .content {
  padding: 8px 12px;
  color: var(--p-text-muted-color, #999);
}
```

#### src/app/my-widget.vue

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useComponentProps } from '../constants'

const props = useComponentProps()

const title = computed(() => props.value.title ?? 'Hello')
const maxItems = computed(() => props.value.maxItems ?? 10)
</script>

<template>
  <div class="my-widget">
    <div class="header">
      {{ title }}
    </div>
    <div class="content">
      Displaying up to {{ maxItems }} items
    </div>
  </div>
</template>
```

---

### Variant B: With Tailwind + PrimeVue

Use this for components that need Tailwind utility classes and PrimeVue UI components (like `reaction-bar`, `model-gallery`). Adds `tailwind.config.ts`, `postcss.config.js`, `tailwind.css`, PrimeVue in dependencies, and the PrimeVue plugin in `vueConfig`.

Only the files that **differ** from Variant A are shown.

#### package.json (differences)

```json
{
  "dependencies": {
    "@wippy-fe/theme": "^0.0.7",
    "@wippy-fe/webcomponent-core": "^0.0.7",
    "@wippy-fe/webcomponent-vue": "^0.0.7",
    "primevue": "^4.3.3"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "@wippy-fe/proxy": "^0.0.7",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.57.0",
    "eslint-plugin-vue": "^9.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "3",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vue": "^3.5.0",
    "vue-eslint-parser": "^9.4.3",
    "vue-tsc": "^2.0.0"
  },
  "peerDependencies": {
    "@wippy-fe/proxy": "^0.0.7",
    "vue": "^3.5.0"
  }
}
```

Key additions: `@wippy-fe/theme` and `primevue` in dependencies; `autoprefixer`, `postcss`, `tailwindcss` in devDependencies. Tailwind plugins (`tailwindcss-primeui`, `tailwind-scrollbar`) come from the shared preset in `@wippy-fe/theme`.

#### tailwind.config.ts

```typescript
import themePreset from '@wippy-fe/theme/tailwind.config'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [themePreset],
  content: ['./src/**/*.{vue,ts}'],
}
```

#### postcss.config.js

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

#### src/tailwind.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### src/styles.css

```css
@import "@wippy-fe/theme/theme-config.css";
@import 'tailwind.css';
```

#### src/index.ts

```typescript
import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'
import type { ComponentProps } from './types.ts'
import type { Events } from './constants.ts'
import MyWidget from './app/my-widget.vue'
import stylesText from './styles.css?inline'
import pkg from '../package.json'

class MyWidgetElement extends WippyVueElement<ComponentProps, Events> {
  static get wippyConfig(): WippyElementConfig<ComponentProps> {
    return {
      propsSchema: pkg.wippy.props as WippyPropsSchema,
      hostCssKeys: ['fontCssUrl', 'themeConfigUrl', 'primeVueCssUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: MyWidget,
      plugins: [PrimeVuePlugin],
    }
  }
}

export async function webComponent() {
  return MyWidgetElement
}

define(import.meta.url, MyWidgetElement)
```

Key differences from Variant A:
- `hostCssKeys` includes `'primeVueCssUrl'`
- `vueConfig` includes `PrimeVuePlugin` from `@wippy-fe/theme/primevue-plugin` (installs PrimeVue with `{ theme: 'none' }`)
- `styles.css` imports `tailwind.css`
- `tailwind.config.ts` uses the shared preset from `@wippy-fe/theme/tailwind.config`

#### src/app/my-widget.vue (using Tailwind + PrimeVue)

```vue
<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import { useComponentProps, useComponentEvents } from '../constants'

const props = useComponentProps()
const emit = useComponentEvents()

const title = computed(() => props.value.title ?? 'Hello')

function handleClick() {
  emit('some-event', { title: title.value })
}
</script>

<template>
  <div class="flex flex-col gap-2 p-3">
    <h2 class="text-lg font-semibold text-surface-800">
      {{ title }}
    </h2>
    <Button
      label="Click me"
      severity="secondary"
      size="small"
      @click="handleClick"
    />
  </div>
</template>
```

---

## hostCssKeys Reference

Keys passed to `hostCssKeys` in `wippyConfig` control which platform CSS is loaded into the shadow root at runtime. Each key maps to a URL provided by `@wippy-fe/proxy`.

| Key | What it loads | When to include |
|-----|---------------|-----------------|
| `fontCssUrl` | Platform font definitions (families, weights) | Almost always -- ensures consistent typography with host |
| `themeConfigUrl` | CSS custom properties (`--p-primary-*`, `--p-surface-*`, `--p-text-color`, `--p-content-background`, etc.) | **Always** -- required for theme integration and dark mode |
| `primeVueCssUrl` | PrimeVue component classes (unstyled mode, matches host appearance) | When using any PrimeVue components (`Button`, `InputText`, `DataTable`, etc.) |
| `markdownCssUrl` | Styles for rendered markdown blocks | Only if rendering markdown content |
| `iframeCssUrl` | Scrollbar styling, iframe-related layout | Recommended for all components so scrollbars match the host |

**Common combinations:**

- Minimal (custom CSS only): `['fontCssUrl', 'themeConfigUrl']`
- With PrimeVue: `['fontCssUrl', 'themeConfigUrl', 'primeVueCssUrl']`
- Markdown renderer: `['fontCssUrl', 'themeConfigUrl', 'markdownCssUrl']`
- Pass `[]` to skip host CSS entirely (fully self-styled component)

---

## Children Content

Some components accept content from child `<template>` elements instead of (or in addition to) props. This is useful when the content is large or multi-line (e.g., a Mermaid diagram definition, markdown text).

### Configuration

Set `contentTemplate` in `wippyConfig` to the MIME type to match:

```typescript
static get wippyConfig(): WippyElementConfig<ComponentProps> {
  return {
    propsSchema: pkg.wippy.props as WippyPropsSchema,
    hostCssKeys: ['fontCssUrl', 'themeConfigUrl'] as const,
    inlineCss: stylesText,
    contentTemplate: 'text/vnd.mermaid',
  }
}
```

### HTML usage

```html
<example-mermaid>
  <template data-type="text/vnd.mermaid">
    graph TD
      A[Start] --> B[End]
  </template>
</example-mermaid>
```

Uses `<template>` instead of `<script>` because Vue templates strip script tags. The native `<template>` element is inert (not rendered) and works in both raw HTML and Vue SFC templates.

### Reading content in Vue

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useContent } from '@wippy-fe/webcomponent-vue'
import { useComponentProps } from '../constants'

const props = useComponentProps()
const content = useContent()

// Props take priority over children content
const definition = computed(() =>
  props.value.definition || content.value || 'graph TD; A --> B'
)
</script>
```

Content is extracted once on mount and updated via MutationObserver when the child template changes.

---

## Proxy API Usage

The `@wippy-fe/proxy` module provides `api`, `host`, and `on` for communicating with the Wippy host. Import them in your Vue components.

See `node_modules/@wippy-fe/proxy/index.d.ts` for full type definitions.

### API calls (fetch data from backend)

```vue
<script setup lang="ts">
import { api, host } from '@wippy-fe/proxy'
import { onMounted, ref } from 'vue'

const data = ref(null)
const loading = ref(true)

onMounted(async () => {
  await refreshData()
})

async function refreshData() {
  try {
    loading.value = true
    const response = await api.get('/endpoint')
    data.value = response.data
  } catch (error) {
    if (error.response?.status === 401) {
      host.handleError('auth-expired', error)
    } else {
      host.handleError('other', error)
      host.toast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load data'
      })
    }
  } finally {
    loading.value = false
  }
}
</script>
```

### WebSocket / real-time events

```vue
<script setup lang="ts">
import { on } from '@wippy-fe/proxy'
import { onMounted, onUnmounted, ref } from 'vue'

const messages = ref<unknown[]>([])
const unsubscribers: Array<() => void> = []

onMounted(() => {
  // Listen for messages on a specific topic
  unsubscribers.push(
    on('@message', (data: unknown) => {
      messages.value.push(data)
    })
  )

  // Listen for visibility changes (tab switch, iframe hide/show)
  unsubscribers.push(
    on('@visibility', (visible: boolean) => {
      if (visible) refreshData()
    })
  )

  // Listen for host URL changes
  unsubscribers.push(
    on('@history', ({ path }: { path: string }) => {
      console.warn('Host URL changed:', path)
    })
  )
})

onUnmounted(() => {
  unsubscribers.forEach(unsub => unsub())
  unsubscribers.length = 0
})
</script>
```

### Host API methods

```typescript
import { host } from '@wippy-fe/proxy'

host.startChat(token, { sidebar?: boolean })
host.openSession(sessionUUID, { sidebar?: boolean })
host.openArtifact(artifactUUID, { target: 'modal' | 'sidebar' })
host.setContext(context, sessionUUID?, source?)
host.navigate(url)
host.confirm(options)        // Returns Promise<boolean>
host.toast(options)          // { severity, summary, detail }
host.handleError(code, error)
host.formatUrl(relativeUrl)
host.logout()
```

---

## Styling Guidelines

> **Full theming reference: [theming.md](theming.md)** — covers the three theming levels (basic / full / per-page), the complete CSS-variable list, dark-mode rules, severity colors, host UI customization, and WCAG guidance. Same content also at `@wippy-fe/theme/THEMING.md`. Read it once; this section only covers the component-specific quirks.

**Component-specific rules:**

1. **No root-level padding or margin** on web components — the host controls outer spacing. Apply padding inside child elements.

2. **`@wippy-fe/theme/theme-config.css` is the dev-time fallback only.** Import it via `@import "@wippy-fe/theme/theme-config.css"` in your `styles.css` so component preview / Storybook works. At runtime the host injects the real theme via `hostCssKeys: ['themeConfigUrl']` — see [theming.md → Reference — CSS variables](theming.md#reference--css-variables) for the full var list.

3. **Tailwind components**: import `tailwind.css` (the `@tailwind` directives file) from `styles.css`. Both files are bundled via the `?inline` import in `index.ts`.

4. **Non-Tailwind components**: write plain CSS classes using the semantic `--p-*` variables. See `websocket-log/src/styles.css` for a complete example.

5. **Color rules** (these are the same as for web apps; full reasoning in [theming.md → Reference — Dark mode](theming.md#reference--dark-mode)):
   - Use semantic vars (`--p-text-color`, `--p-content-background`, `--p-text-muted-color`, `--p-content-border-color`, `--p-highlight-background`, `--p-primary-color`) for theme-dependent colors — they flip with dark mode.
   - Never use raw `--p-surface-N` for theme-dependent colors — the numbered scale is fixed and does NOT flip.
   - Use semantic severity classes (`danger-*` / `success-*` / `warn-*` / `info-*` / `help-*` / `accent-*`) — never `red-*` / `green-*` / `orange-*` / `sky-*` / `purple-*` / `teal-*` for colors that convey meaning.
   - Derived shades via `color-mix()`:
     ```css
     background: color-mix(in srgb, var(--p-content-background) 85%, var(--p-text-color) 15%);
     ```

---

## ESLint Configuration

Every component package includes its own `.eslintrc.cjs`. The configuration enforces strict TypeScript, Vue 3 recommended rules, and consistent type imports. See the `.eslintrc.cjs` in the skeleton above for the full config.

Key rules:
- `@typescript-eslint/consistent-type-imports` -- enforces `import type { ... }` for type-only imports
- `@typescript-eslint/no-extraneous-class` -- disabled (needed for `WippyVueElement` subclasses)
- `@typescript-eslint/no-invalid-void-type` -- disabled (needed for `Events` interface with `undefined` values)
- `vue/multi-word-component-names` -- disabled
- `no-console` -- warns except for `console.warn` and `console.error`

---

## State Persistence with Pinia

Components that need state to survive navigation (iframe destruction and recreation) can use `@wippy-fe/pinia-persist`. This Pinia plugin automatically saves and restores store state via the host-mediated state API.

### Setup

Add `@wippy-fe/pinia-persist` to dependencies and register it as a Pinia plugin:

```typescript
// src/index.ts
import { createWippyPersist } from '@wippy-fe/pinia-persist'

class MyWidgetElement extends WippyVueElement<ComponentProps, Events> {
  static get vueConfig() {
    return {
      rootComponent: App,
      plugins: [PrimeVuePlugin],
      piniaPlugins: [createWippyPersist()],
    }
  }
}
```

### Basic Store

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMyStore = defineStore('my-store', () => {
  const data = ref<string[]>([])
  return { data }
}, {
  wippyPersist: true,  // Persist all state with defaults
})
```

### Per-Instance State with persist-key

When multiple instances of a component appear on the same page, use a `persist-key` prop to give each instance its own state scope. Without this, all instances share the same persisted state.

> **CRITICAL:** `persist-key` values MUST be globally unique across your entire application. If two unrelated component instances use the same key, their state **will collide and overwrite each other**. Use descriptive, namespaced keys (e.g., `dashboard-sidebar`, `user-prefs-panel`).

```typescript
// src/stores/counter.ts
export function useCounterStore(persistKey?: string) {
  const storeId = persistKey ? `counter:${persistKey}` : 'counter'

  return defineStore(storeId, () => {
    const count = ref(0)
    return { count }
  }, {
    wippyPersist: persistKey ? { scope: persistKey } : true,
  })()
}
```

```vue
<!-- src/app/my-widget.vue -->
<script setup lang="ts">
const props = useComponentProps()
const store = useCounterStore(props.value.persistKey)
</script>
```

```html
<!-- Usage: two instances with separate state -->
<example-counter-persist persist-key="sidebar-a"></example-counter-persist>
<example-counter-persist persist-key="sidebar-b"></example-counter-persist>
```

### How It Works

- `wippyPersist: true` — persists all state keys, scoped to the page UUID
- `wippyPersist: { scope: 'my-key' }` — overrides the default page scope with a custom scope (auto-prefixed with `@custom:` to prevent collisions with system scopes)
- `wippyPersist: { pick: ['count'], debounce: 500 }` — only persist `count`, debounce saves by 500ms
- State is saved on `$subscribe` (debounced), on `@visibility:false`, and on `window.unload`
- State is hydrated asynchronously when the store is created

### Prop Name Convention

HTML attributes use kebab-case (`persist-key`), but the prop parser converts them to camelCase (`persistKey`). Always access props using camelCase in your Vue component:

```typescript
// Correct
const store = useMyStore(props.value.persistKey)

// Wrong — will be undefined
const store = useMyStore(props.value['persist-key'])
```

### vite.config.ts

`@wippy-fe/pinia-persist` is **not** available on the CDN import map. It must be bundled into your component (do NOT add it to `rollupOptions.external`):

```typescript
rollupOptions: {
  external: [
    'vue',
    'pinia',
    '@iconify/vue',
    '@wippy-fe/proxy',
    // Do NOT add '@wippy-fe/pinia-persist' here
  ],
}
```

---

## Build

Build a component with the `--outDir` flag to place output in the static directory:

```bash
cd frontend/web-components/my-widget && npm install && npm run build -- --outDir ../../../static/wc/my-widget --emptyOutDir
```

For development with watch mode:

```bash
cd frontend/web-components/my-widget && npm run dev
```

The `wippy.scripts` in `package.json` maps Wippy commands to npm scripts:
- `"build": "build"` runs `npm run build` (production)
- `"debug": "build:debug"` runs `npm run build:debug` (development mode with source maps)
- `"test": "lint"` runs `npm run lint` (ESLint)

---

## Appendix: Raw Custom Element Pattern (Advanced)

> This section covers building a component by extending `WippyElement` directly without Vue. Use this only if you have a specific reason to avoid Vue (e.g., wrapping a vanilla JS library that manages its own DOM).

For raw custom elements, extend `WippyElement` from `@wippy-fe/webcomponent-core` and implement `connectedCallback` / `disconnectedCallback` yourself. You handle DOM creation, event emission, and prop changes manually.

```typescript
import { WippyElement, define } from '@wippy-fe/webcomponent-core'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-core'
import pkg from '../package.json'

interface MyProps {
  label?: string
}

class MyRawElement extends WippyElement {
  static get wippyConfig(): WippyElementConfig<MyProps> {
    return {
      propsSchema: pkg.wippy.props as WippyPropsSchema,
      hostCssKeys: ['fontCssUrl', 'themeConfigUrl'] as const,
      inlineCss: ':host { display: block; }',
    }
  }

  connectedCallback() {
    super.connectedCallback()
    // Shadow root is already created by WippyElement.
    // Host CSS and inline CSS are already injected.
    // Access parsed props via this.currentProps.
    const container = this.shadowRoot!.querySelector('[data-wippy-container]')
    if (container) {
      container.textContent = this.currentProps.label ?? 'Default'
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    // Clean up your DOM, event listeners, etc.
  }
}

export async function webComponent() {
  return MyRawElement
}

define(import.meta.url, MyRawElement)
```

This pattern still benefits from `WippyElement`'s automatic Shadow DOM setup, CSS loading, and prop parsing. You just skip the Vue layer. For most components, use `WippyVueElement` instead.
