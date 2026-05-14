# Wippy Component Package Specification v1

## Overview

Wippy components are distributed as standard npm-compatible packages with additional metadata for the Wippy platform. Each package can follow one of two scenarios:

1. **ESM Module with Web Component** - Exports a web component that can be declared globally or attached directly to DOM elements

Components support shadow DOM with style encapsulation and use static properties for configuration.

2. **Web App** - Provides a complete HTML page that can be loaded in an iframe

Web Apps follow the [Proxy API](./proxy-api.md)

> **Architectural principle: the FE isolation paradigm.** A Wippy FE module is a **standalone, universal build artifact** that has ZERO knowledge of where or how it is served. The package itself carries only its source + a `package.json` describing what it is (tag, props, events, build entry). The BE-side `_index.yaml` registry entries are the **serving facade** that, per deployment, declare WHERE the bundle is mounted and HOW the bytes are sourced. The same built bundle ships unchanged to any deployment. **Full rules, audit checklist, and "FE isolation paradigm" reference: [fe-compliance-checklist.md §0](fe-compliance-checklist.md#0-the-fe-isolation-paradigm).**

## Package Naming Convention

Package names **MUST** follow this format and be **unique**:

```
@<namespace>/<type>-<description>
```

- **namespace**: Organization or project identifier (e.g., `@anthropic`, `@acme`, `@myproject`)
- **type**: Either `widget` or `app`
  - `widget` - for web components (ESM modules)
  - `app` - for web apps (Vue 3 SPAs)
- **description**: Kebab-case description of what the component does

### Examples

| Type | Name | Description |
|------|------|-------------|
| Widget | `@anthropic/widget-data-table` | Data table component |
| Widget | `@acme/widget-chart-pie` | Pie chart component |
| App | `@anthropic/app-analytics-dashboard` | Analytics dashboard page |
| App | `@myproject/app-user-settings` | User settings page |

## Navigation Metadata (for pages)

For pages to appear in the application navigation menu, include these fields in the `wippy` section:

```json
"wippy": {
  "type": "page",
  "title": "Dashboard",
  "icon": "tabler:chart-bar",
  "order": 100,
  "path": "./dist/app.html"
}
```

- **title**: Display name in navigation menu
- **icon**: Tabler icon name (e.g., `tabler:home`, `tabler:settings`, `tabler:chart-bar`)
- **order**: Sort position in menu (lower numbers appear first, e.g., 100, 200, 300)

## Package.json Structure

### Scenario 1: ESM Module with Web Component

```json
{
  "name": "@anthropic/widget-counter-button",
  "version": "1.0.0",
  "specification": "wippy-component-1.0",
  "title": "Human Readable Component Title",
  "description": "Component description for users",
  "browser": "./dist/index.js",
  "files": ["dist/", "src/", "package.json"],
  "wippy": {
    "tagName": "my-awesome-component",
    "type": "widget",
    "props": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "default": "Default Title",
          "description": "Component title"
        },
        "count": {
          "type": "number",
          "default": 0,
          "minimum": 0,
          "description": "Initial count value"
        }
      }
    },
    "events": {
      "type": "object",
      "properties": {
        "count-changed": {
          "type": "object",
          "properties": {
            "count": { "type": "number" }
          },
          "description": "Fired when count value changes"
        }
      }
    },
    "scripts": {
      "build": "build",
      "test": "test"
    }
  },
  "scripts": {
    "build": "vite build",
    "build:debug": "vite build --mode development",
    "dev": "vite",
    "test": "jest"
  }
}
```

### Scenario 2: Web App

```json
{
  "name": "@anthropic/app-sales-dashboard",
  "version": "1.0.0",
  "specification": "wippy-component-1.0",
  "title": "Human Readable Page Title",
  "description": "Page description for users",
  "files": ["dist/", "src/", "package.json"],
  "wippy": {
    "type": "page",
    "path": "dist/app.html",
    "cache": ["node_modules"],
    "proxy": {
      "enabled": true,
      "injections": {
        "css": {
          "fonts": true,
          "themeConfig": true,
          "iframe": true,
          "primevue": true,
          "customCss": true,
          "customVariables": true
        },
        "tailwindConfig": false,
        "resizeObserver": false,
        "preventLinkClicks": false,
        "iconifyIcons": true
      }
    },
    "scripts": {
      "build": "build",
      "debug": "build:debug"
    }
  },
  "scripts": {
    "build": "vite build",
    "build:debug": "vite build --mode development"
  }
}
```

## Package.json fields

- **`specification: "wippy-component-1.0"`** - Identifies specification version used
- **`title`** - Human-readable component name for UI
- **`description`** - Human-readable description for UI
- **`browser`** - Entry point for browser (ES module) - **Required for ESM module only**
- **`wippy.tagName`** - Default web component tag name - **Required for ESM module only**
- **`wippy.props`** - JSON Schema for component props - **Required for ESM module only**
- **`wippy.events`** - JSON Schema describing custom events the component can emit - **Recommended for ESM module**
- **`wippy.path`** - HTML entry point - **Required for Web App only**
- **`wippy.proxy`** - Proxy configuration - **Required for Web App only**
- **`wippy.configOverrides`** - Per-page AppConfig overrides (customization, feature flags) - **Optional for Web App**
- **`wippy.cache`** - List of files/folder that build server can cache between builds, `["node_modules"]` by default

### wippy.configOverrides (Per-Page Overrides)

Pages can override the host's AppConfig to customize their own appearance or behavior. Overrides are merged into the config before CSS variables are applied, so each page can have its own theme.

```json
{
  "wippy": {
    "path": "dist/index.html",
    "proxy": { "enabled": true, "injections": { "css": { "customCss": true, "customVariables": true } } },
    "configOverrides": {
      "customization": {
        "cssVariables": {
          "p-primary-500": "#ff6b00",
          "@dark": { "p-primary-500": "#ff8c3a" }
        },
        "customCSS": ".dashboard-header { border-radius: 12px; }"
      }
    }
  }
}
```

**Merge rules:**
- `cssVariables`: **replaces** the host's CSS variables (page provides its own complete theme)
- `customCSS`: **replaces** the host's custom CSS
- `icons`: **merges** additively (page adds icons on top of host's)
- `feature` flags: **deep merges** (e.g., override `routePrefix` or `apiRoutes`)

**How it works at runtime:**
1. Host reads `wippy.configOverrides` from the package.json
2. Injects `window.__WIPPY_CONFIG_OVERRIDES__` into the iframe's srcdoc before proxy.js loads
3. proxy.js merges overrides into the resolved config before applying CSS variables
4. Nested `<w-artifact>` iframes inherit the merged config automatically

For testing in standalone mode (dev-proxy), set the global manually:
```html
<script>
  window.__WIPPY_CONFIG_OVERRIDES__ = {
    customization: { cssVariables: { "p-primary-500": "#ff6b00" } }
  }
</script>
<script src="http://localhost:5173/dev-proxy.js"></script>
```

## Wippy Configuration


### `wippy.props` (ESM Module)
JSON Schema object describing component properties:
- Used for runtime validation
- Should be auto-generated from TypeScript interfaces where possible
- Supports `default` values for each property

**Attribute serialization:** HTML attributes are always strings. Props declared as non-string types (`number`, `boolean`, `array`, `object`) will be passed as serialized JSON in the attribute value. It is the component's responsibility to `JSON.parse()` each non-string attribute and keep track of which props need parsing. For example, `<my-widget count="42">` requires the component to parse `"42"` into a number.

If a prop uses a custom format (e.g. comma-separated numbers like `"1,5,10"`), declare it as `type: "string"` in the JSON Schema and document the expected format in the `description` field:
```json
"values": {
  "type": "string",
  "description": "Comma-separated list of numeric values, e.g. \"1,5,10\""
}
```

### `wippy.events` (ESM Module)
JSON Schema object describing custom events the component dispatches:
- Each property key is the event name (kebab-case, e.g. `upload-complete`)
- The value schema describes the `event.detail` payload
- Used for documentation, tooling, and runtime validation
- Events must use `CustomEvent` with `bubbles: true, composed: true` for shadow DOM

Example:
```json
"events": {
  "type": "object",
  "properties": {
    "item-selected": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "label": { "type": "string" }
      },
      "description": "Fired when user selects an item"
    }
  }
}
```

### `wippy.path` (Web App)
Path to the HTML entry point that will be loaded in an iframe.

### `wippy.proxy` (Web App only)
Configuration for the iframe proxy system.

> **For the WHEN/WHY of CSS injections**, see [theming.md § What the Wippy host provides](theming.md#what-the-wippy-host-provides-the-substrate). This section covers the HOW (the proxy mechanism that delivers them).

#### Default Configuration (Recommended)
```json
{
  "enabled": true,
  "injections": {
    "css": {
      "fonts": true,
      "themeConfig": true,
      "iframe": true,
      "primevue": true,
      "markdown": true,
      "customCss": true,
      "customVariables": true
    },
    "tailwindConfig": false,
    "resizeObserver": false,
    "preventLinkClicks": false,
    "iconifyIcons": true
  }
}
```

**Injection Options Explained:**
- **CSS Injections**: All enabled for full host theming integration. The host's theme + custom CSS variables flow through `themeConfig` / `customVariables` / `customCss`. Per-app theming options are documented in [theming.md](theming.md) — including the three-level model (basic / full / per-page) and how `customCSS` and `cssVariables` interact with these injection toggles.
- **tailwindConfig**: `false` -  Enable if you use runtime Play CDN version of tailwind
- **resizeObserver**: `false` -  Enable if your app is a widget and not full-screen
- **preventLinkClicks**: `false` -  Enable if you dont implement custom router
- **iconifyIcons**: `true` - Iconify icons are always loaded from the host

**Note**: When `enabled` is `true`, CSS injections default to `true`. The non-CSS injections default to `false` except `iconifyIcons` which defaults to `true`.

**Per-page theme overrides:** the host also reads `wippy.configOverrides.cssVariables` and `wippy.configOverrides.customCSS` from the page's `package.json`, applied AFTER facade-level overrides. See [theming.md → Level 3](theming.md#level-3--per-page-theme-override-configoverrides--runtime).

### `wippy.features`
Array object describing component features that it uses from Wippy API:
- unoCssRuntime (planned, not yet available)
- iconify
- tailwindConfig

### `wippy.scripts`
References to npm scripts for build pipeline:
If there are no "build" scripts, component is written in vanilla js and is ready to go as is without transpilation.

- **`build`** - Production build command
- **`debug`** - Development build with source maps
- **`test`** - Validation/testing command

## Component Export Interface

### Scenario 1: ESM Module with Web Component

The main entry point **must export** the following **asynchronous** factory function:

```typescript
// If you already have the class synchronously simply return Promise.resolve(MyElement)
export const webComponent: () => Promise<typeof HTMLElement>
```

* **webComponent**
  * The host **will** call `customElements.define(tagName)` automatically.
  * Additionally, the `wippy-component-v1` runtime **MUST** inspect `import.meta.url` and, if the search-param `declare-tag=<tag>` is present, call `customElements.define(<tag>)` itself. @wippy-fe/proxy provides a helper `define` method for that

### Scenario 2: Web App

The page is defined by the `wippy.path` field in package.json.

The HTML file specified in `wippy.path` **MUST** include a `<script type="text/javascript" data-role="@wippy/scripts">` element where additional scripts will be automatically injected. The host injects `loading.js` (registers `<wippy-loading>` and `<wippy-error>`) and `proxy.js` before this marker.

That same tag **SHOULD** also carry an `src="http://localhost:5173/dev-proxy.js"` (or equivalent) so the page boots *standalone* when no host is present — see [host-less-mode.md](host-less-mode.md) for the full dual-mode contract and the dev-proxy bootstrap.

The page **SHOULD** include an `<script type="importmap">` element with the merged import-map so that ES-Modules work without bundling.

Inside the page you **MUST** use the [Proxy API](./proxy-api.md) API to talk to the host unless you explicitly disabled it. Note you wont have access to host config, including auth token, like this.

For fullscreen loading and error states, use `<wippy-loading>` and `<wippy-error>` — they are auto-registered and theme-aware. See the [Loading & Error Components](./proxy-api.md#loading--error-components) section in proxy-api.md for the full attribute reference.

## External Dependencies

For the specification **wippy-component-v1** the following libraries are provided by the host via **import-maps** and therefore **MUST** be declared as `peerDependencies` **and** marked `external` in the bundler config:

### Current Host-Provided Libraries (import-map.json)

```json
{
  "imports": {
    "vue": "https://esm.sh/vue@3.5.13",
    "pinia": "https://esm.sh/pinia@2.1.7",
    "vue-router": "https://esm.sh/vue-router@4.5.0",
    "axios": "https://esm.sh/axios@1.8.3",
    "nanoevents": "https://esm.sh/nanoevents@9.1.0",
    "luxon": "https://esm.sh/luxon@3.5.0",
    "@iconify/vue": "https://esm.sh/@iconify/vue@4.3.0",
    "@tanstack/vue-query": "https://esm.sh/@tanstack/vue-query@5.69.0",
    "@tanstack/query-core": "https://esm.sh/@tanstack/query-core@5.69.0"
  }
}
```

**Required externals — MUST be marked as external in your bundler config:**

| Package | Purpose | Version |
|---------|---------|---------|
| `@wippy-fe/proxy` | Wippy proxy API (`api`, `host`, `on`) | Host-provided |
| `vue` | Vue 3 runtime | 3.5.13 |
| `pinia` | Vue store | 2.1.7 |
| `@iconify/vue` | Icon library | 4.3.0 |

**Available in host import map but NOT required — use if needed, mark external only if you import them:**

| Package | Purpose | Version |
|---------|---------|---------|
| `vue-router` | Vue routing | 4.5.0 |
| `axios` | HTTP client | 1.8.3 |
| `nanoevents` | Event emitter | 9.1.0 |
| `luxon` | Date/Time helper | 3.5.0 |
| `@tanstack/vue-query` | Data fetching | 5.69.0 |
| `@tanstack/query-core` | Query core | 5.69.0 |

> **Note:** `nanoevents` and `luxon` are provided by the host import map for convenience, but components are not required to use them. Only `vue`, `pinia`, `@iconify/vue`, and `@wippy-fe/proxy` are required externals that every component must declare.
>
> **`@wippy-fe/pinia-persist`** (v0.0.13) is an npm package but is **NOT** on the CDN import map. It must be bundled into your component — do not add it to `rollupOptions.external`.

> **⚠︎  Do not bundle required external libraries** – always import them directly and rely on the host import-map:
>
> ```ts
> import { createApp } from 'vue'
> import { api, host, on } from '@wippy-fe/proxy'
> import { Icon } from '@iconify/vue'
> ```

> **Note:** PrimeVue is currently bundled within each component and is NOT externalized via the host import map. This may change in a future version of the specification.

## Minimal Examples

### Simple `webComponent` (Scenario 1)

```typescript
import { hostCss, define } from '@wippy-fe/proxy'

export const webComponent = async () => {
  class MyButton extends HTMLElement {
    connectedCallback() {
      // Attach shadow-DOM so we can inject hostStyles & markup
      const root = this.attachShadow({ mode: 'open' })

      root.innerHTML = /* html */`
        <style>
          /* inherit host design-tokens & utilities */
          ${hostCss.themeConfig}
        </style>

        <button class="px-3 py-1 rounded bg-primary-600 text-white shadow">
          <slot>Hello world</slot>
        </button>
      `
    }
  }

  // Utility that will imediately declate MyButton if needed
  define(import.meta.url, MyButton)

  return MyButton
}
```

### Simple Web App (Scenario 2)

Create an HTML file (e.g., `dist/app.html`):

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script type="importmap">
    {
      "imports": {
        "vue": "https://esm.sh/vue@3",
        "pinia": "https://esm.sh/pinia",
        "luxon": "https://esm.sh/luxon",
        "@wippy-fe/proxy": "https://esm.sh/@wippy-fe/proxy"
      }
    }
  </script>
  <script type="text/javascript" data-role="@wippy/scripts"></script>
</head>
<body>
<h1 class="text-lg font-semibold">Hello from web app example</h1>

<script type="module">
  import { DateTime } from 'luxon'

  document.body.insertAdjacentHTML('beforeend', `<p>Now: ${DateTime.now().toISO()}</p>`)

  getWippyApi().then(({ host }) => host.toast({

  }))
</script>
</body>
</html>
```

And package.json:

```json
{
  "name": "@anthropic/app-hello-world",
  "version": "1.0.0",
  "specification": "wippy-component-1.0",
  "title": "My Web App",
  "description": "A simple web page example",
  "wippy": {
    "type": "page",
    "title": "Simple Example",
    "icon": "tabler:app-window",
    "order": 500,
    "path": "dist/app.html",
    "proxy": {
      "enabled": true
    }
  }
}
```

## Event Handling for Web Components

Components should declare their custom events in `wippy.events` (see [wippy.events](#wippyevents-esm-module)) and dispatch them with proper shadow DOM support:

```typescript
// Dispatch a typed event matching the declared schema
this.dispatchEvent(new CustomEvent('upload-complete', {
  detail: { uuid: '...', filename: 'report.pdf', size: 1024 },
  bubbles: true,
  composed: true // Allow event to cross shadow boundary
}))
```

The `event.detail` payload should match the JSON Schema declared in `wippy.events` for that event name. This enables tooling to validate events at runtime and generate documentation automatically.

```typescript
// For shadow DOM components — general pattern
hostElement.dispatchEvent(new CustomEvent('my-event', {
  detail: { data: 'value' },
  bubbles: true,
  composed: true
}))
```

## Error Handling

- Components should gracefully handle errors in lifecycle methods
- The wrapper catches and logs errors automatically
- Provide fallback UI when possible

## Cleanup

- Clean up event listeners and resources in `disconnectedCallback`

## Dependency Management

- Standard npm dependencies are supported
- External Wippy Engine Host build process may modify `package.json` to link shared dependencies
- Components should declare all required dependencies
- Peer dependencies supported for shared libraries