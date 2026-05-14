# Wippy Application Template

A starter Wippy application with user management, AI assistant, and admin frontend.

## Prerequisites

- [Wippy CLI](https://wippy.ai)
- Node.js 18+

## Quick Start

```bash
cp .env.example .env
make build
wippy run -c
```

Open `http://localhost:8080`. Default admin: `admin@wippy.local` / `admin123`.

## Development

```bash
# Build main app
cd frontend/applications/main && npm install && npm run build -- --outDir ../../../static/app/main --emptyOutDir

# Build a web component
cd frontend/web-components/reaction-bar && npm install && npm run build -- --outDir ../../../static/wc/reaction-bar --emptyOutDir

# Frontend watch mode (main app)
cd frontend/applications/main && npm run dev

# Server (separate terminal)
wippy run -c
```

## Architecture & Terminology

### Wippy Web Host

The **Web Host** is a set of JS/CSS/HTML modules served from a CDN (e.g., `https://web-host.wippy.ai/webcomponents-1.0.20/`). It provides:

- **Chat UI** — conversation interface with AI agents
- **Navigation** — left sidebar with page links, user menu
- **Page rendering** — loads `view.page` entries as sandboxed iframes
- **Theme injection** — injects CSS (fonts, theme variables, PrimeVue styles) into child iframes
- **Loading/error screens** — `<wippy-loading>` and `<wippy-error>` web components auto-injected into all child iframes via `loading.js`
- **WebSocket relay** — real-time event distribution to child content

The Web Host is the "shell" that wraps your application's frontend pages.

### Facade Module

The **facade** (`wippy/facade`) is the backend module that bootstraps the Web Host. It's wired as a dependency in `src/app/deps/_index.yaml` and controls:

- Which Web Host version to load from CDN
- App title, icon, and branding
- Theme customization (colors, fonts, icons)
- Feature flags (navigation visibility, chat sidebar, etc.)
- Login path and session configuration

The facade serves a thin `index.html` at `/` that fetches config from the backend (`GET /api/public/facade/config`) and loads the Web Host bundle.

### Host-Rendered vs Non-Host Pages

**Host-rendered pages** are registered as `view.page` entries in `src/app/views/_index.yaml`. The Web Host loads them in iframes and automatically injects CSS (theme, fonts, PrimeVue, custom overrides).

**Non-host pages** are served directly as static files (e.g., `static/login.html`). The Web Host does NOT render or inject anything into these — they must handle their own styling.

### Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│                   Browser Window                      │
│                                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │          Web Host (from CDN)                   │   │
│  │  Loaded by facade's index.html at /            │   │
│  │                                                │   │
│  │  ┌─────────┐  ┌────────────────────────────┐   │   │
│  │  │   Nav   │  │   Page iframe (view.page)  │   │   │
│  │  │ sidebar │  │                            │   │   │
│  │  │         │  │   Your Vue app runs here   │   │   │
│  │  │ - Pages │  │   with injected CSS +      │   │   │
│  │  │ - Chat  │  │   proxy API (window.$W)    │   │   │
│  │  │ - User  │  │                            │   │   │
│  │  └─────────┘  └────────────────────────────┘   │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  Non-host pages (login.html) load independently       │
│  outside the Web Host — no CSS injection              │
└──────────────────────────────────────────────────────┘
```

### Theme Inheritance Flow

```
Facade (src/app/deps/_index.yaml)
│  Defines: custom_css, css_variables, icons, app_icon, app_title
│
▼
Web Host (CDN)
│  1. Loads theme-config.css     → defines --p-primary-*, --p-surface-*, --p-secondary-*
│  2. Loads PrimeVue/Tailwind    → components styled via those vars
│  3. Applies custom_css         → raw CSS string injected as <style>
│  4. Applies css_variables      → injected as :root { --key: value; } overrides
│  5. Registers icons            → custom Iconify collection under "custom:" prefix
│
▼
Child Iframe (view.page)
│  Host re-injects the same CSS into each iframe (controlled by proxy config):
│  - loading.js (registers <wippy-loading> and <wippy-error>)
│  - proxy.js, theme-config.css, PrimeVue CSS, iframe.css, fonts, custom_css, css_variables
│
✗ Non-host pages (login.html, etc.)
   NOT reached by this flow — must be themed manually
```

---

## Configuration

All runtime configuration is driven by environment variables and the facade dependency parameters in `src/app/deps/_index.yaml`.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLIC_API_URL` | Public-facing API URL | `http://localhost:8080` |
| `ENCRYPTION_KEY` | Data encryption key (hex) | Auto-generated on first boot |
| `ANTHROPIC_API_KEY` | Claude API key for AI assistant | - |

### Facade Parameters

The `wippy/facade` dependency controls the frontend shell:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `app_title` | Sidebar title | `Wippy` |
| `app_name` | Full app name | `Wippy AI` |
| `app_icon` | Iconify icon reference | `wippy:logo` |
| `show_admin` | Show admin controls | `true` |
| `hide_nav_bar` | Hide left sidebar | `false` |
| `start_nav_open` | Nav open on load | `false` |
| `allow_select_model` | User model selection | `false` |
| `disable_right_panel` | Disable right sidebar | `false` |
| `session_type` | `non-persistent` or `cookie` | `non-persistent` |
| `history_mode` | `hash` or `browser` | `hash` |
| `login_path` | Unauthenticated redirect | `/login.html` (this template overrides to `/app/login.html`) |
| `custom_css` | CSS injected into frontend | Poppins font import |
| `css_variables` | JSON object of CSS custom properties | `{}` |
| `icons` | JSON object of custom Iconify icons | `{}` |

CSS variables use PrimeVue naming: `p-primary`, `p-primary-500`, `p-surface-0`, `p-text-color`, etc.

## Structure

```
src/app/                          Backend (Wippy Lua)
  api/                            HTTP endpoints
  agents/                         AI agent definitions
  users/                          User management
  security/                       Access control
  models/                         LLM model config
  views/                          Frontend page registration
  deps/                           Module dependencies
  env/                            Environment storage

frontend/
  applications/main/              Vue 3 admin panel (view.page)
  web-components/
    reaction-bar/                 Emoji reaction buttons (example-reaction-bar)
    websocket-log/                WebSocket message log (example-websocket-log)
    chart-circle/                 Chart.js doughnut chart (example-chart-circle)
    mermaid/                      Mermaid diagram renderer (example-mermaid)
    markdown/                     Markdown renderer (example-markdown)
    model-gallery/                AI model card grid (example-model-gallery)

static/                           Static assets (login page)
  app/main/                       Built main app (generated)
  wc/*/                           Built web components (generated)
```

## Web Component Examples

The project includes 6 web component examples demonstrating different capabilities of the Wippy web component architecture.

### Architecture

Components are built on a two-layer base class system:

- **`WippyElement`** (`@wippy-fe/webcomponent-core`) — Shadow DOM, host CSS loading, prop parsing from HTML attributes, event emission
- **`WippyVueElement`** (`@wippy-fe/webcomponent-vue`) — Vue 3 app mounting, reactive props via `useComponentProps()`, typed events via `useComponentEvents()`, Pinia store support, children content via `useContent()`

Each component is a self-contained ES module that registers a custom element tag. The host platform loads them dynamically and provides CSS assets (theme, fonts, PrimeVue) into each component's Shadow DOM.

### Components

| Component | Tag | Key Demo |
|-----------|-----|----------|
| **reaction-bar** | `example-reaction-bar` | Event emission (`useComponentEvents()`), PrimeVue Button, Tailwind CSS |
| **websocket-log** | `example-websocket-log` | WebSocket subscription via `on()` from proxy, theme-aware CSS |
| **chart-circle** | `example-chart-circle` | Bundled 3rd-party lib (Chart.js), canvas rendering |
| **mermaid** | `example-mermaid` | Bundled lib (beautiful-mermaid), CSS variable theming, children content |
| **markdown** | `example-markdown` | markdown-it + sanitize-html, children content, `markdownCssUrl` |
| **model-gallery** | `example-model-gallery` | Proxy API fetch (`api.get()`), PrimeVue Components (Button, Tag), Tailwind + PrimeUI |

### Children Content Pattern

Components can read content from child `<template data-type="...">` elements. Enable via `contentTemplate` in the component config:

```html
<example-mermaid>
  <template data-type="text/vnd.mermaid">
    graph TD
      A[Start] --> B{Decision}
      B -->|Yes| C[Do it]
      B -->|No| D[Skip it]
  </template>
</example-mermaid>

<example-markdown>
  <template data-type="text/markdown">
    # Hello World
    This is **bold** and [a link](https://example.com).
  </template>
</example-markdown>
```

### Best Practices

- **No root-level padding or margin.** Components must not add padding or margin to their outermost element. The consumer (host page, layout container, or parent component) controls all edge spacing.
- **Inline styles for Shadow DOM.** Tailwind classes work because they're compiled at build time into an inline CSS string injected as a `<style>` element. Host CSS (fonts, theme, PrimeVue) is loaded asynchronously via `hostCssKeys`.
- **PrimeVue via `@wippy-fe/theme`.** Import `PrimeVuePlugin` from `@wippy-fe/theme/primevue-plugin` — it installs PrimeVue in unstyled mode (`{ theme: 'none' }`). The `tailwindcss-primeui` Tailwind plugin (included in the theme preset) generates component styles. For web components, add `PrimeVuePlugin` to `vueConfig.plugins` and request `primeVueCssUrl` in `hostCssKeys` for host-provided styles.
- **Theme-aware colors.** Use semantic CSS variables (`--p-content-background`, `--p-text-color`, `--p-content-border-color`, `--p-text-muted-color`) for colors. Never use numbered surface variables (`--p-surface-0`, `--p-surface-100`) for theme-dependent colors — they are a fixed light-to-dark scale that does not flip with dark mode. For derived shades, use `color-mix()`: `color-mix(in srgb, var(--p-content-background) 85%, var(--p-text-color) 15%)`.
- **Vite externals.** Always externalize: `vue`, `pinia`, `@iconify/vue`, `@wippy-fe/proxy` (provided by host import maps). Bundle everything else (chart.js, primevue, markdown-it, etc.).
- **Loading & error screens.** For fullscreen loading states, use `<wippy-loading title="Loading...">`. For fullscreen errors, use `<wippy-error title="Failed" message="Details here" icon="circle" severity="danger">`. Both are auto-registered via `loading.js` (injected by the host) — no imports needed. Use `no-bg` attribute on `<wippy-loading>` for overlay contexts with transparent background.
- **ESLint.** Each package has its own `.eslintrc.cjs` with `vue-eslint-parser`, `@typescript-eslint/strict`, and `plugin:vue/vue3-recommended`. Run `npm run lint` per package.

### Building

```bash
# Build all (main app + all web components)
# See Makefile for individual targets

# Build individual component
cd frontend/web-components/reaction-bar && npm install && npm run build -- --outDir ../../../static/wc/reaction-bar --emptyOutDir

# Lint individual component
cd frontend/web-components/reaction-bar && npm run lint
```

---

## Customization Guide

All visual customization flows through the **facade dependency** in `src/app/deps/_index.yaml`. This is the single source of truth for theming — it propagates to all host-rendered pages automatically.

### Recoloring the App

**Step A — Set colors in facade deps** (`src/app/deps/_index.yaml`):

For a simple primary color change:
```yaml
- name: css_variables
  value: '{"--p-primary":"#6366f1"}'
```

For full theme customization with all shades and dark mode, use `custom_css`:
```yaml
- name: custom_css
  value: ':root{--p-primary-50:#edf8f4;--p-primary-500:#15433D;...}@media(prefers-color-scheme:dark){:root{--p-primary:#1a9a7a;...}}'
```

See navi-server's `src/app/deps/_index.yaml` for a complete real-world example.

This automatically recolors ALL host-rendered pages (view.page iframes).

**Step B — Theme non-host pages manually.**

Pages like `static/login.html` are outside the Web Host. Two approaches:

**Recommended: Build with `@wippy-fe/theme`.** If the page has any complexity, create it as a built app (even a tiny one) using `@wippy-fe/theme` — this gives you Tailwind, PrimeVue components, preflight resets, and theme variables out of the box, matching host-rendered pages exactly.

**Simple pages: CDN imports.** For trivial static pages (like a basic login form), import theme CSS directly:
1. Import CSS via CDN URLs:
   - `https://web-host.wippy.ai/webcomponents-1.0.20/@wippy-fe/assets/theme-config.css` — theme variables
   - `https://web-host.wippy.ai/webcomponents-1.0.20/@wippy-fe/assets/preflight.css` — Tailwind reset (normalizes form elements)
   - `https://web-host.wippy.ai/webcomponents-1.0.20/@wippy-fe/assets/tailwind.css` — PrimeVue component styles
   - `https://web-host.wippy.ai/webcomponents-1.0.20/@wippy-fe/assets/iframe.css` — scrollbar styling
2. Use PrimeVue CSS classes on raw HTML elements (`p-inputtext`, `p-button`, `p-card`, etc.)
3. Add the same CSS variable overrides as a `<style>` block after the imports.

### Custom Fonts and Icons

**Fonts** — Set via facade's `custom_css` parameter. You need **both** the font import AND a rule to apply it:
```yaml
- name: custom_css
  value: "@import url('https://fonts.googleapis.com/css2?family=YourFont:wght@400;500;600;700&display=swap'); body { font-family: 'YourFont', sans-serif; }"
```

> **Note:** The default facade config imports Poppins but does NOT apply it to the body — it just loads the font file. You must include `body { font-family: ... }` (or set `--v-font-family-head` for headings in the Web Host) for the font to actually take effect.

This injects into all host-rendered pages. For non-host pages (login, etc.), add the same `@import` and `font-family` rule manually.

**Icons** — Set via facade's `icons` parameter (Iconify format):
```yaml
- name: icons
  value: '{"logo":{"body":"<svg>...</svg>","width":24,"height":24}}'
```
Icons are registered under the `custom:` namespace — use as `custom:logo`, `custom:myicon`, etc. Available in all host-rendered apps. For non-host pages, add icons manually (inline SVG, img tag, etc.).

### Custom Logo

**If using host navigation** (`hide_nav_bar: "false"`):
- Define the logo as a custom icon via the `icons` facade parameter
- Set `app_icon` to reference it: `app_icon: "custom:logo"`

**If rendering your own navigation** (this template's default, `hide_nav_bar: "true"`):
- Replace `static/wippy-logo.svg` with your logo file
- Update brand text ("Wippy App") in:
  - `frontend/applications/main/src/app/app.vue` — sidebar header
  - `frontend/applications/main/src/pages/home.vue` — welcome page
  - `static/login.html` — login page title
  - `frontend/applications/main/app.html` — browser tab title

### Adding New Pages

**Option A — Add a route to the existing app** (when `hide_nav_bar: "true"`, app manages its own sidebar):
1. Create page component: `frontend/applications/main/src/pages/mypage.vue`
2. Add route in `frontend/applications/main/src/router/index.ts`
3. Add nav item in `app.vue`'s `navItems` array
4. Build: `cd frontend/applications/main && npm run build -- --outDir ../../../static/app/main --emptyOutDir`

**Option B — Create a separate Vue app** (when `hide_nav_bar: "false"`, host provides navigation):
1. Create a new app in `frontend/applications/myapp/` (see `frontend/docs/app-guide.md` for the full skeleton)
2. Register it in `src/app/views/_index.yaml` as a new `view.page` entry with its own `base_path` and `entry_point`
3. Set `announced: true` so it appears in host navigation automatically
4. Build to `static/app/myapp/`

### Styling Consistency (CRITICAL)

**All visual customization MUST go through the facade/host level, not individual apps.**

The Wippy architecture serves multiple view.pages and web components under one host. If you add custom styles inside a single app, those styles will NOT apply to other pages or components — breaking visual consistency across the platform.

**Rules:**
1. **Use PrimeVue components** for all form inputs, buttons, tables, dialogs, etc. — never create custom-styled inputs or buttons. PrimeVue components automatically pick up theme variables from the host, ensuring consistency everywhere.
2. **Customize appearance via facade parameters only** — `css_variables` and `custom_css` in `src/app/deps/_index.yaml`. These propagate to ALL host-rendered pages and web components.
3. **Use Tailwind utility classes with theme variables** — `bg-primary`, `text-surface-700`, `border-surface-200` etc. These reference CSS variables that the host controls.
4. **Use semantic severity colors over raw Tailwind names** — When a color conveys meaning (error, success, warning, info, help), use `danger-*`, `success-*`, `warn-*`, `info-*`, `help-*` — never `red-*`, `green-*`, `orange-*`, `sky-*`, `purple-*`. Raw color names are only for purely decorative use with no semantic meaning. In inline styles / `v-html`, use `var(--p-danger-500)` etc. Semantics first, decorative later.
5. **Explore existing variables in the browser first** — before attempting any custom styling, open DevTools and inspect the available `--p-*` CSS variables on `:root`. PrimeVue and Tailwind provide an extensive set of semantic variables for colors, spacing, borders, and typography.
6. **Only use app-specific custom styles when you are FULLY aware they will stay unique to that app** — for example, a custom data visualization or a layout that no other page shares. Even then, prefer CSS variables over hardcoded values.

**Why this matters:** If you style a button with custom CSS in one app, then add a second app or web component later, the button will look different. The facade's `custom_css` and `css_variables` are the ONLY mechanism that keeps all pages and components visually aligned.

### Host Chat UI Customization

The host chat UI exposes `--wippy-host-*` CSS variables that can be overridden via the facade's `custom_css`:

```yaml
- name: custom_css
  value: ':root { --wippy-host-message-radius: 0.5rem; --wippy-host-message-user-bg: #e0f2fe; }'
```

**Available variable groups:**
- **Messages:** `--wippy-host-message-bg`, `border-color`, `shadow`, `font-size`, `radius`, `padding-x/y`, `gap`, `spacing`, `user-bg`, `agent-bg`
- **Prompts:** `--wippy-host-prompt-bg`, `border-color`, `radius`
- **Input:** `--wippy-host-input-bg`, `border-color`, `group-bg`, `group-border-color`, `group-radius`, `min-height`, `max-height`
- **Layout:** `--wippy-host-chat-bg`, `chat-padding-x`, `meta-bar-border-color`, `sidebar-width-open/closed`, `splitter-width/color`
- **Other:** `--wippy-host-avatar-size`, `tool-bg`, `tool-border`

See the full variable reference in the [gen-2-chat README](https://web-host.wippy.ai/) Host UI CSS Variables section.

### Per-Page Config Overrides

Individual pages can override the host's theme to have their own color scheme or custom CSS while other pages use the default. The proper way is via the `config_overrides` field in the page's registry entry:

```yaml
# src/app/views/_index.yaml
- name: my-page
  kind: registry.entry
  meta:
    type: view.page
    config_overrides:
      customization:
        cssVariables:
          "--p-primary": "#ff6b00"
        customCSS: ".dashboard-header { border-radius: 12px; }"
```

The host includes `config_overrides` in the content API response and injects it as `window.__WIPPY_CONFIG_OVERRIDES__` into the child iframe's srcdoc before proxy.js loads.

**Merge rules:** `cssVariables` and `customCSS` **replace** (not merge with) the host values — the page provides its own theme. `iconSets` merge additively.

> **Note:** You can also set `wippy.configOverrides` directly in a page's `package.json`, but this is discouraged for registry-managed pages. The registry approach is dynamic (no rebuild needed) and keeps configuration separate from code. See [web_components.spec.md](https://web-host.wippy.ai) for the package.json format.

### Web Components vs Vue Components (CRITICAL)

**Do NOT create web components unless you have a SOLID reason.** Default to regular Vue components for everything.

Web components in Wippy exist for one purpose: **cross-module reuse** — shipping a self-contained UI widget that can be used in entirely different applications, potentially by different developers. They are standalone ES modules with Shadow DOM isolation, separate build outputs, and their own `view.component` registry entries.

**When to use web components:**
- You are building a widget intended to be **shipped as a separate Wippy module** that other projects can install and use (e.g., a Mermaid diagram renderer anyone can attach to their page)
- You are building a **plugin system** where renderers/widgets are loaded from external sources at runtime (e.g., a flow editor where node renderers can be shipped from other modules)
- You are **developing/demonstrating** web component examples (this repo's `frontend/web-components/` exist solely as examples)

**When NOT to use web components (use regular Vue components instead):**
- The component is only used within your app — make it a `.vue` file in `src/components/`
- The component is shared between pages in the same app — still a regular Vue component
- The component wraps a JS library for use in your app — regular Vue component
- You think "it might be reusable someday" — do NOT preemptively create a web component. Convert later if the need actually arises
- The component is part of a flow editor / diagram / complex UI but everything ships in the same app — regular Vue/JS components

**The test:** Ask yourself "will this component be loaded by a DIFFERENT application that I don't control?" If no, use a regular Vue component.

> **Why this matters:** Web components have significant overhead — separate package, separate build, Shadow DOM isolation, separate `view.component` registry entry, custom element registration, prop serialization via HTML attributes. None of this is needed for app-internal components. Using them unnecessarily adds complexity, slows development, and makes refactoring harder.

### Host Navigation

The Web Host provides a built-in left navigation sidebar. In this template it's hidden:
```yaml
# In src/app/deps/_index.yaml, facade parameters:
- name: hide_nav_bar
  value: "true"
```

The main app (`frontend/applications/main/`) renders its own sidebar instead. Set `hide_nav_bar` to `"false"` to use the host's navigation — each `view.page` with `announced: true` appears as a nav item automatically.

### Accessibility

Ensure all pages are usable with keyboard navigation and screen readers.

**Form inputs:**
- Every input MUST have an associated `<label>`. For PrimeVue `InputText`, use `id` prop + `<label for="...">`. For `Password` and `Select`, use `inputId` prop + `<label for="...">`.
- Group related checkboxes/radios in a container with `role="group"` and `aria-label`.

**Buttons:**
- Icon-only buttons MUST have `aria-label` describing the action. Include context where possible (e.g., `aria-label="Delete John Doe"` not just `aria-label="Delete"`).
- Decorative icons inside labeled buttons should have `aria-hidden="true"`.

**Navigation:**
- Use `<nav aria-label="...">` for navigation regions. Use `<aside aria-label="...">` for sidebars.
- Active nav item should have `aria-current="page"`.

**Dialogs and errors:**
- PrimeVue `Dialog` with `modal` prop handles focus trapping automatically.
- Error messages should use `role="alert"` and `aria-live="assertive"` so screen readers announce them.

**Tables:**
- All columns need header text. Use `<span class="sr-only">...</span>` for visually hidden headers (e.g., an Actions column).

---

## Validation Checklist

Use this to verify the project follows guidelines after making changes.

### Web Components vs Vue Components
- [ ] No web components created unless they are intended for **cross-module reuse** (loaded by a different application)
- [ ] App-internal shared UI is built as regular Vue components in `src/components/`
- [ ] Existing web components in `frontend/web-components/` are examples only — not a pattern to follow for app-specific features

### Styling Consistency
- [ ] All form inputs, buttons, tables, dialogs use **PrimeVue components** — no custom-styled replacements
- [ ] No app-specific CSS overrides for colors, fonts, borders, or spacing that should be shared — all customization goes through facade `css_variables` / `custom_css`
- [ ] Tailwind classes reference theme variables (`bg-primary`, `text-surface-*`, `border-surface-*`) — no hardcoded color values
- [ ] Severity colors use semantic names (`danger-*`, `success-*`, `warn-*`, `info-*`, `help-*`) — never raw `red-*`, `green-*`, `orange-*`, `sky-*`, `purple-*` for semantic uses
- [ ] Before adding custom styles, existing `--p-*` CSS variables were inspected in browser DevTools
- [ ] Any app-specific styles are intentionally unique to that app and documented as such

### Theme & Branding
- [ ] Colors set via facade `css_variables` or `custom_css` — NOT hardcoded in Vue components
- [ ] Non-host pages import theme CSS and apply the same variable overrides
- [ ] Login page colors match the main app theme
- [ ] Font set via facade `custom_css` (with `body { font-family }` rule) — non-host pages import the same font

### Icons & Logo
- [ ] Custom icons defined via facade `icons` parameter
- [ ] If using host nav: `app_icon` references a valid icon (built-in or `custom:` prefix)
- [ ] If using custom nav: logo asset exists at referenced path
- [ ] Brand text updated in all locations if customized

### Pages & Navigation
- [ ] `hide_nav_bar` matches navigation strategy
- [ ] All `view.page` entries have correct `base_path`, `entry_point`, and proxy config
- [ ] Vue Router uses `createMemoryHistory()` (not browser history)
- [ ] Router calls `host.onRouteChanged()` in `afterEach` and listens to `@history` events

### Accessibility
- [ ] All form inputs have associated `<label>` elements — use `for`/`id` pairing for `InputText`, `inputId` prop for `Password`/`Select`
- [ ] Icon-only buttons have `aria-label` describing the action (e.g., `aria-label="Delete John Doe"`)
- [ ] Decorative icons have `aria-hidden="true"` — icons inside labeled buttons, status indicators, etc.
- [ ] Active navigation item has `aria-current="page"`
- [ ] `<nav>` and `<aside>` elements have `aria-label`
- [ ] Error messages use `role="alert"` and `aria-live="assertive"` for screen reader announcements
- [ ] PrimeVue `Dialog` with `modal` prop handles focus trapping automatically — no custom implementation needed
- [ ] Checkbox/radio groups wrapped in a container with `role="group"` and `aria-label`
- [ ] Table header cells cover all columns — use `<span class="sr-only">` for visually hidden headers (e.g., Actions column)

### Build & Deployment
- [ ] Frontend builds use `--outDir` pointing to `static/app/<name>`
- [ ] Vite config has `base: ""` (empty string)
- [ ] Host-provided libraries externalized in Vite config
- [ ] `@wippy-fe/theme` in dependencies, imported in app.ts and tailwind.config.ts

---

## Testing

```bash
wippy run test users
```

## Documentation

- [wippy.ai](https://wippy.ai) - Full documentation
- [wippy.ai/llms.txt](https://wippy.ai/llms.txt) - LLM-friendly docs

### Development Guidelines

See [`frontend/docs/README.md`](frontend/docs/README.md) for the full documentation index. Key guides:

- [`component-guide.md`](frontend/docs/component-guide.md) — Web component development (WippyVueElement, props, events, Shadow DOM, PrimeVue)
- [`app-guide.md`](frontend/docs/app-guide.md) — Web app development (routing, Vite config, proxy API)
- [`best-practices.md`](frontend/docs/best-practices.md) — Vue 3, Tailwind CSS, accessibility, code quality
- [`proxy-api.md`](frontend/docs/proxy-api.md) — Wippy Proxy API reference
- [`host-spec.md`](frontend/docs/host-spec.md) — Host contract specification
