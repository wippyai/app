# Wippy Frontend Development Guide

## Architecture

Wippy uses a **host-based architecture**. The web host application provides:
- Chat with AI agents
- Page display and navigation
- Theme and CSS injection into child content
- WebSocket relay for real-time features
- Host-mediated state persistence for child content (survives iframe reloads)

Child content runs inside the host in two forms:

### Web Apps
Full Vue 3 applications loaded in sandboxed **iframes**. They control a full viewport with routing, layout, and navigation. The host injects CSS (fonts, theme, PrimeVue) and provides a proxy API via `window.$W`.

### Web Components
Custom elements loaded as **ES modules** directly in the host page. They use Shadow DOM for style encapsulation and import the proxy API from `@wippy-fe/proxy`. The host provides shared dependencies (Vue, Pinia) via import maps.

### Proxy API

Both web apps and web components communicate with the host through the **Wippy Proxy API** — the same capabilities, different access patterns:

| | Web Apps (iframe) | Web Components |
|---|---|---|
| **API access** | `const api = await window.$W.api()` | `import { api } from '@wippy-fe/proxy'` |
| **Host actions** | `const host = await window.$W.host()` | `import { host } from '@wippy-fe/proxy'` |
| **Events** | `const on = (await window.$W.instance()).on` | `import { on } from '@wippy-fe/proxy'` |
| **CSS injection** | Automatic via proxy config | Declarative via `hostCssKeys` |
| **Build externals** | `vue`, `pinia`, `vue-router`, `@iconify/vue`, `@wippy-fe/proxy`, `axios`, `primevue/*` | `vue`, `pinia`, `@iconify/vue`, `@wippy-fe/proxy` |

For the full host architecture (communication flow, PostMessage protocol, theme inheritance, AppConfig), see the [gen-2-chat README](https://github.com/nichochar/gen-2-chat) — specifically the "Wippy Host Architecture" and "Style Inheritance & Theming" sections.

Full proxy API type definitions ship with the `@wippy-fe/proxy` npm package at `node_modules/@wippy-fe/proxy/index.d.ts`.

---

## Documentation Index

### Building Things

| Doc | What it covers | When to read |
|-----|---------------|-------------|
| [component-guide.md](component-guide.md) | Web component development: WippyVueElement, props, events, Shadow DOM, composables, PrimeVue, Tailwind, ESLint | Building a web component |
| [web-component-loading.md](web-component-loading.md) | How the host autoloads `view.component` entries: registration → API filter → script injection → `define()` chain, the `@wippy-fe/proxy` eager-getter contract (root cause of `Proxy globals not found`), externals + pinia gotcha, web-host version floor, diagnostic recipe | Tag silently renders as unknown, `customElements.get` returns undefined, `Proxy globals not found`, `process is not defined` in a WC bundle |
| [app-guide.md](app-guide.md) | Web app development: routing, Vite config, `window.$W` proxy, Vue Router, layouts | Building a web app |
| [app-checklist.md](app-checklist.md) | Pre-submission checklist for web apps | Before submitting a web app |

### Reference

| Doc | What it covers | When to read |
|-----|---------------|-------------|
| [theming.md](theming.md) | Theming guide: three levels (basic / full / per-page), full CSS-variable + Tailwind + PrimeVue + dark-mode + WCAG reference, host UI customization | Anything color/style/theme related — start here before editing CSS |
| [host-less-mode.md](host-less-mode.md) | The standalone-aware contract: how `app.html`'s single `<script data-role="@wippy/scripts" src=".../dev-proxy.js">` lets every app/WC boot inside the Wippy host AND directly without one. Dev overlay, host stubs, WC test isolation. | Building, dev-loop iterating, or unit-testing an app/WC without a running Wippy host |
| [proxy-api.md](proxy-api.md) | Proxy API reference: all `api`, `host`, `on`, `hostCss`, `loadCss`, `define` methods | Need proxy API details beyond what the guides cover |
| [host-spec.md](host-spec.md) | Host contract specification: package.json format, import maps, proxy config, lifecycle | Understanding the host runtime contract |
| [best-practices.md](best-practices.md) | Vue 3, Tailwind CSS, PrimeVue, accessibility, code quality | General frontend patterns and conventions |

### Reading Order

1. **This file** — understand the architecture
2. **component-guide.md** or **app-guide.md** — depending on what you're building
3. **best-practices.md** — general Vue/Tailwind conventions
4. **theming.md** — when you need to restyle anything (colors, palette, host chrome)
5. **proxy-api.md** — when you need API details
6. **host-spec.md** — when you need to understand the host contract
