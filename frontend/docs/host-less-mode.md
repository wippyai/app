# Host-less Mode

Authoritative guide for the standalone-aware design contract that lets every Wippy web app and web component build, run, and test **without** the Wippy web host wrapping it.

> **Mirrored at two locations.** Same content, two places — keep them in sync.
> - This file: `app-template/frontend/docs/host-less-mode.md` (in-repo, primary editing surface)
> - Wippy KB: `wippy.frontend` → "Host-less Mode" (semantic search via the `wippy-kb` MCP)

---

## Table of contents

- [Mental model — apps and WCs are intentionally standalone-aware](#mental-model--apps-and-wcs-are-intentionally-standalone-aware)
- [The `@wippy/scripts` switchpoint — one tag, two boot paths](#the-wippyscripts-switchpoint--one-tag-two-boot-paths)
- [What `dev-proxy.js` actually does](#what-dev-proxyjs-actually-does)
- [The dev overlay (config modal)](#the-dev-overlay-config-modal)
- [Host stubs — the standalone `host` API](#host-stubs--the-standalone-host-api)
- [Web components — host-less playground and tests](#web-components--host-less-playground-and-tests)
- [Common deviations and how to spot them](#common-deviations-and-how-to-spot-them)
- [Troubleshooting](#troubleshooting)
- [Related docs](#related-docs)

---

## Mental model — apps and WCs are intentionally standalone-aware

Every Wippy web app and web component is built around a small, deliberate constraint:

> **The runtime contract is the proxy API surface. Nothing else.**

What that means in practice:

- The only thing an app or WC touches at runtime is the `window.$W` global (apps) or the equivalent imports from `@wippy-fe/proxy` (WCs). Both surfaces resolve to the same `ProxyApiInstance`.
- Apps and WCs do **not** import code from neighboring apps, the parent module's Lua side, the gen-2-chat host UI, or any other module in the project. They live in their own folder, declare their externals (`vue`, `pinia`, `vue-router`, `@iconify/vue`, `axios`, `@wippy-fe/proxy`, etc.) in their own `package.json`, and read their own `wippy.yaml` / `package.json` metadata.
- The same `app.ts` (or WC `index.ts`) boots correctly in two environments:
  1. **Hosted** — inside a Wippy web host that injects `proxy.js`, AppConfig, importmap, and CSS.
  2. **Host-less** — running its `app.html` directly via Vite dev server, file://, a unit-test page, a Storybook-style playground, etc.

You can think of every app/WC as a "small program with a tiny standardized I/O surface." The host is one possible runtime; standalone is another. The app code does not know which one it's in.

This isn't an accident or an afterthought. It is what makes:
- Local FE iteration possible without spinning up a full Wippy backend.
- WCs unit-testable in isolation under vitest + jsdom.
- Apps shareable between Wippy modules — every page-app and web component builds with the same toolchain regardless of which module ships it.
- Customer-specific overlays viable — operators patch metadata (theming, importmap, env) without rebuilding the FE bundle.

---

## The `@wippy/scripts` switchpoint — one tag, two boot paths

Every canonical app's `app.html` ships with **one** script tag that decides the boot path at load time:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My App</title>
    <script type="importmap">
    {
        "imports": {
            "vue": "https://esm.sh/vue@3",
            "vue-router": "https://esm.sh/vue-router@4",
            "@iconify/vue": "https://esm.sh/@iconify/vue",
            "axios": "https://esm.sh/axios"
        }
    }
    </script>
    <!--
      Dev (Vite serving dev-proxy.js locally):
        src="http://localhost:5173/dev-proxy.js"
      Prod (host CDN — the URL ALWAYS includes a release tag segment):
        src="https://web-host.wippy.ai/<tag>/dev-proxy.js"
        e.g. src="https://web-host.wippy.ai/v0.5.14/dev-proxy.js"
    -->
    <script
        src="https://web-host.wippy.ai/v0.5.14/dev-proxy.js"
        data-role="@wippy/scripts"
    ></script>
</head>
<body>
    <div id="app">
        <wippy-loading title="Loading..."></wippy-loading>
    </div>
    <script type="module" src="./src/app.ts"></script>
</body>
</html>
```

Two attributes on that one tag carry the entire dual-mode contract:

| Attribute | Role | Used by |
|---|---|---|
| `data-role="@wippy/scripts"` | Marker for the host. When present, the host removes this `<script>` element before serving the iframe and injects its own `loading.js` + `proxy.js` + importmap + AppConfig **before** the marker. The element disappears in hosted mode. | Wippy host (gen-2-chat) |
| `src="…/dev-proxy.js"` | Fallback URL. Used when no host is present — the browser loads `dev-proxy.js` directly and that script bootstraps the page. The `src=` attribute is irrelevant in hosted mode (the `<script>` element no longer exists). | Standalone browser load |

**Pick a URL that matches your environment.** Note that **the web host URL always requires a release-tag segment** in the path — `/dev-proxy.js` directly off the host root is NOT valid; you must address a specific build (`/<tag>/dev-proxy.js`). This guarantees every dev-mode boot is pinned to a known, reproducible bundle and avoids the "host CDN updated overnight, my preview broke" class of surprise.

| Environment | Sample `src=` value |
|---|---|
| Local dev — gen-2-chat running via `npm run dev` (Vite serves `public/dev-proxy.js`) | `http://localhost:5173/dev-proxy.js` |
| Production / staging host CDN | `https://web-host.wippy.ai/<tag>/dev-proxy.js` (e.g. `…/v0.5.14/dev-proxy.js`) |
| Self-hosted Wippy deployment | `https://<your-wippy-host>/<tag>/dev-proxy.js` |

The bundle is the same; only the origin and pinned tag differ. Pick whatever URL is reachable from where the dev / preview / test page runs. In Vite-driven local iteration the localhost URL is fastest because it stays warm with the dev server. For shareable preview links (a Storybook page on a public domain, a CI artifact viewer) point at the prod CDN with a fixed tag so collaborators don't need a local toolchain and the preview stays reproducible.

So the same line of HTML is the host's "inject your scripts here" anchor *and* the host-less fallback boot — without any conditional logic.

### What goes in the importmap?

Exactly the packages your bundle declares as **externals**. Open your `vite.config.ts` and look at `build.rollupOptions.external` — every name in that array MUST have a matching entry in the importmap. Concretely:

```ts
// vite.config.ts
external: ['vue', 'pinia', 'vue-router', '@iconify/vue', 'axios', 'luxon']
```

```html
<!-- app.html — must mirror the externals exactly -->
<script type="importmap">
{
  "imports": {
    "vue": "https://esm.sh/vue@3",
    "pinia": "https://esm.sh/pinia",
    "vue-router": "https://esm.sh/vue-router@4",
    "@iconify/vue": "https://esm.sh/@iconify/vue",
    "axios": "https://esm.sh/axios",
    "luxon": "https://esm.sh/luxon"
  }
}
</script>
```

Conventions:
- **Use `https://esm.sh/<pkg>` URLs.** They're the de-facto Wippy default (see canonical app-template apps); no build step or local server needed.
- **Pin majors only** (`vue@3`, `vue-router@4`) unless you have a reason to lock a minor. esm.sh resolves to the latest patch automatically and the host's importmap (which overrides yours when wrapping) decides the canonical version anyway.
- **Don't include `@wippy-fe/proxy`.** dev-proxy.js / the host injects it for you. The same goes for `@wippy-fe/markdown-iframe` (only include it explicitly if your app code imports the markdown iframe directly — the canonical app-template main app does).
- **Don't include packages that are not external.** Anything bundled into your output (your shared utils, internal components) doesn't need an entry.

The host's `processWebPage` (`gen-2-chat/src/shared/api/web-components/index.ts:171`) merges the host's importmap with whatever you declare in `app.html` — keys you declare are kept, host adds the wippy-side entries. So the same `app.html` works in both modes without conditionals.

### Exposing `package.json` to dev-proxy (canonical scaffold)

Every Wippy app's `package.json` carries metadata that determines runtime defaults — proxy injections (`wippy.proxy.injections.css.*`), per-page theming overrides (`wippy.configOverrides.customization`), iconify icon collections, etc. In hosted mode the host reads these from the registry. In host-less mode dev-proxy needs the same data to apply the same defaults.

The canonical pattern is `wippyPackagePlugin()` from `@wippy-fe/vite-plugin`, added once to your `vite.config.ts`. The plugin reads your `package.json` at build time and inlines it into `app.html` as a JSON script tag with `data-role="@wippy/package"`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { wippyPackagePlugin } from '@wippy-fe/vite-plugin'

export default defineConfig({
  plugins: [
    vue(),
    wippyPackagePlugin(),
  ],
  // …
})
```

The plugin emits this into the top of `<head>` in the built `app.html`:

```html
<script type="application/json" data-role="@wippy/package">
{ "name": "@wippy/your-app", "version": "1.0.0", "wippy": { "proxy": {...}, "configOverrides": {...} } }
</script>
```

dev-proxy.js reads this synchronously at boot via
`document.querySelector('script[data-role="@wippy/package"]')` and uses `wippy.proxy.injections` to seed the proxy-config defaults and `wippy.configOverrides.customization` to seed `appConfig.theming.global`. The data-role string `@wippy/package` is exported as `WIPPY_PACKAGE_DATA_ROLE` from `@wippy-fe/shared` so both sides of the boundary share the constant.

Why this shape:
- **No duplication.** `package.json` is the single source of truth — the plugin reads it at build time, nothing in your `src/` references it.
- **No fetch.** Inline in the served HTML — readable synchronously by `dev-proxy.js` before any app code runs.
- **Right ordering.** Injected at the top of `<head>` before any script tag, so it's in the DOM by the time the dev-proxy executes (dev-proxy is a sync UMD script; module scripts are deferred and run later).
- **No `app.html` editing.** The template stays clean; the plugin owns the injection.
- **Constant from shared package.** The string `'@wippy/package'` lives in exactly one place (`@wippy-fe/shared` → `WIPPY_PACKAGE_DATA_ROLE`); apps don't reference it directly, dev-proxy and the plugin both import it from there.
- **Cleanly ignored under a real host.** The host's `processWebPage` reads `package.json` from the registry server-side; the inline JSON tag is harmless metadata.

dev-proxy reads the JSON during `resolveDevConfig()` and uses it to populate the dev-overlay defaults. If the script tag is absent (older app, plugin not yet added), dev-proxy falls back to `getDefaultProxyConfig()`. So adding the plugin is purely additive — apps without it keep working with the generic defaults.

> **Why a plugin and not a runtime `window` global?** Dev-proxy.js is a non-module synchronous script that runs early during `<head>` parsing — before any module script (including your `app.ts`) has loaded. So `app.ts` cannot set a global *before* dev-proxy reads it. A build-time HTML transform places the data in the DOM up-front, available the instant dev-proxy executes.

> **Why one tag and not two?** A second `<script>` block (e.g. an `if (!window.__WIPPY__) load dev-proxy`) would only run after the host's injection completes; if the marker is gone, the conditional has nothing to attach to. The single-tag pattern means the marker is *always* in the source HTML, and the host's job is exactly "delete this marker and replace it." The standalone case happens precisely when nobody deleted it.

The host-spec calls this out at `host-spec.md:330`:

> The HTML file specified in `wippy.path` MUST include a `<script type="text/javascript" data-role="@wippy/scripts">` element where additional scripts will be automatically injected.

The canonical app-template apps (e.g. `app-template/frontend/applications/dam-gallery/app.html`) ship with the `src="…/dev-proxy.js"` populated. That is the recommended shape: **always include the `src=` fallback** unless your app cannot run host-less (rare, and worth justifying).

---

## What `dev-proxy.js` actually does

`dev-proxy.js` is the host-less boot bundle. It lives at `gen-2-chat/public/dev-proxy.js`, built from `gen-2-chat/src/proxy/entry.iframe-dev.ts`.

Its job is to make `window.$W` resolve correctly without any host. It does this in roughly five steps:

1. **Install history guard** (`installHistoryGuard()`) — stubs `pushState` / `replaceState` so vue-router doesn't try to mutate browser history outside an iframe-srcdoc context.
2. **Resolve a config** (`resolveDevConfig()` in `src/proxy/dev/resolve-dev.ts`):
   - Read `localStorage['@wippy-dev/config']` and `localStorage['@wippy-dev/proxy-config']`.
   - If `localStorage['@wippy-dev/auto-accept'] === 'true'` AND a stored config exists → use it immediately, render the overlay in monitoring mode.
   - Otherwise → render the overlay in *waiting* mode (FAB pulses blue, "Accept config to continue loading" speech bubble) and block boot until the developer clicks Accept.
3. **Build a fake `ProxyApiInstance`** wired to:
   - The accepted `ChildAppConfig` (returned by `$W.config()`).
   - A nanoevents emitter for `instance.on(...)` subscriptions and `@history` / `@visibility` simulations.
   - `host` stubs that console-log every method (`createDevHostAPI()` in `src/proxy/dev/host-stubs.ts`).
   - A real axios instance for `$W.api()`, configured against the URL the developer entered (`env.APP_API_URL` defaults to `${location.origin}/api`).
   - A logger / state / ws stub that mirrors the production proxy shape.
4. **Apply CSS injection** based on the proxy config the developer chose:
   - `theme_config: true` → injects `theme-config.css` from `@wippy-fe/theme`.
   - `iframe`, `primevue`, `markdown` → ditto, the inline-CSS bundles from `src/proxy/dev/css-inline.ts`.
   - `customCss` / `customVariables` → applies `appConfig.theming.global.customCSS` / `cssVariables` (including the `@dark`/`@light` blocks from the [theming guide](theming.md#level-3--per-page-theme-override-configoverrides--runtime)).
5. **Expose `window.$W`** with the same shape as `entry.iframe.ts` — `config()`, `instance()`, `api()`, `host()`, `on()`, `logger()`, `state()`, `ws()`, `loadWebComponent()`. Any app code that uses the proxy API works unchanged.

Default `ChildAppConfig` (from `getDefaultConfig()` in `config-store.ts`):

```ts
{
  $schema: '<built schema URL>',
  auth: { token: 'dev-token', expiresAt: '' },
  env: {
    APP_API_URL: `${location.origin}/api`,
    APP_AUTH_API_URL: `${location.origin}/api`,
    APP_WEBSOCKET_URL: `${location.origin.replace(/^http/, 'ws')}/ws`,
  },
  theming: { global: {} },
  context: { resourceId: '', resourceType: 'page' },
}
```

You override any of this in the modal (or by editing `localStorage['@wippy-dev/config']`).

---

## The dev overlay (config modal)

Visually the dev overlay is a tiny shadow-DOM web component (`<wippy-dev-overlay>`) that renders:

- A FAB (floating action button) in the bottom-right corner — the only visible affordance until clicked.
- A **speech bubble** in waiting mode: "Accept config to continue loading."
- A **panel** that opens when the FAB is clicked. The panel has three sections:
  - **Monitor** — live readout of current path, document title, viewport size; "Trigger Refresh" button that fires `@visibility(true)` so the app can re-fetch.
  - **Configuration (collapsible)**:
    - `App Config (JSON)` — full `ChildAppConfig` as editable JSON. Validates on Accept.
    - `Proxy Injections` — checkboxes for every proxy injection flag (`theme_config`, `iframe`, `primevue`, `markdown`, `customCss`, `customVariables`, `tailwindConfig`, `resizeObserver`, `preventLinkClicks`, `iconifyIcons`, `refreshWhenVisible`, `historyPolyfill`, `errorCapture`).
    - `Options` — "Auto-accept on reload" checkbox (writes the auto-accept flag to localStorage).
  - **Footer** — Reset (clears all `@wippy-dev/*` localStorage keys), Accept (saves config + resolves the boot promise).

LocalStorage keys it uses (defined in `src/proxy/dev/config-store.ts`):

| Key | What it stores |
|---|---|
| `@wippy-dev/config` | The accepted `ChildAppConfig` JSON |
| `@wippy-dev/proxy-config` | The accepted partial `ProxyConfig` (injection flags) |
| `@wippy-dev/auto-accept` | `'true'` to skip the manual accept step on reload |

Auto-accept makes "iterate against a host-less build" feel near-native: refresh, the app boots immediately with last-known config, the FAB stays visible so you can monitor or tweak.

---

## Host stubs — the standalone `host` API

The `host` API (`window.$W.host()` / `host` import from `@wippy-fe/proxy`) is the surface the app uses to ask the host to do things — toast, navigate, open a session, set context, format URLs, etc. With no real host, dev-proxy substitutes a stub layer in `src/proxy/dev/host-stubs.ts`:

| Method | Standalone behavior |
|---|---|
| `host.toast(message)` | Console-log only |
| `host.confirm({ message })` | Browser `window.confirm()` |
| `host.startChat(token, options)` | Console-log |
| `host.openSession(uuid, options)` | Console-log |
| `host.openArtifact(uuid, options)` | Console-log |
| `host.navigate(url)` | Console-log + emits `@history` so the child router picks it up + updates the overlay path readout |
| `host.onRouteChanged(path)` | Console-log + updates the overlay path readout |
| `host.handleError(code, error)` | `console.error` |
| `host.setContext(context, sessionUUID, source)` | Console-log |
| `host.formatUrl(rel)` | Returns `${appConfig.routePrefix || ''}${rel}` |
| `host.classifyLink(href)` | Real implementation — uses `mountRoutes` / `routePrefix` from the accepted config |
| `host.layout.*` | No-op stubs that satisfy the type contract |

The stubs are intentionally chatty: console output is a substitute for the host's real side-effects so a developer can see *what would have happened* without actually wiring the host. If your app's correctness depends on the side-effect (e.g. `host.openSession` actually opens a session), test that path under a host; the stubs will not.

---

## Web components — host-less playground and tests

Web components share the same dual-mode design but are loaded as ES modules instead of iframes. The proxy contract for WCs is `import { api, host, on, ... } from '@wippy-fe/proxy'` — and that import resolves at runtime by reading `window.__WIPPY_PROXY__` (set by either the real proxy or dev-proxy).

### Playground / demo HTML page

```html
<!-- demo.html in your WC project -->
<!DOCTYPE html>
<html>
<head>
    <script type="importmap">
    {
        "imports": {
            "vue": "https://esm.sh/vue@3",
            "@iconify/vue": "https://esm.sh/@iconify/vue",
            "@wippy-fe/proxy": "/path/to/proxy.js"
        }
    }
    </script>
    <!-- Dev: http://localhost:5173/dev-proxy.js — Prod: https://web-host.wippy.ai/<tag>/dev-proxy.js -->
    <script src="http://localhost:5173/dev-proxy.js" data-role="@wippy/scripts"></script>
</head>
<body>
    <my-component prop1="value"></my-component>
    <script type="module" src="./src/index.ts"></script>
</body>
</html>
```

Same switchpoint, same dev overlay. Your WC's `index.ts` calls `define(import.meta.url, ...)` and the element registers itself; dev-proxy provides the host stubs.

If `dev-proxy.js` fails to load (or you forget to include it), `entry.web-component.ts:12-15` throws an explicit error:

> `@wippy-fe/proxy: Proxy globals not found. For dev/testing without the Wippy host, add <script src="dev-proxy.js"></script> to your HTML.`

That error is the canonical signal that you're missing the host-less boot script.

### Vitest / jsdom tests

For unit tests the dev overlay is unnecessary — tests don't have a UI to interact with. The pattern (e.g. `gen-2-chat/npm/@wippy-fe--webcomponent-core/src/base-element.host.test.ts`) is to **fake the host context directly** by attaching the wrapper object the host would attach:

```ts
import { describe, expect, it } from 'vitest'
import { WippyElement } from './base-element'

class TestEl extends WippyElement {
  static get wippyConfig() {
    return { propsSchema: { properties: {} }, hostCssKeys: [] }
  }
  protected onMount(): void {}
  protected onUnmount(): void {}
}

const TAG = 'wippy-test-el'
customElements.define(TAG, TestEl)

it('reads host wrapper attached by resolver as __wippyHost', () => {
  const el = document.createElement(TAG) as TestEl
  const fakeHost = { layout: { broadcast: () => {} } }
  ;(el as any).__wippyHost = fakeHost
  expect(el.host).toBe(fakeHost)
})
```

The `__wippyHost` property is the contract the managed-layout host uses. Tests that need API or proxy globals can either mount dev-proxy via a vitest setup file, or stub `window.__WIPPY_PROXY__` themselves:

```ts
// vitest.setup.ts
;(window as any).__WIPPY_PROXY__ = {
  api: mockApi,
  host: mockHost,
  on: mockOn,
  // ...other ProxyApiInstance fields
}
```

Either approach is "host-less" in the same sense as the browser dev-proxy: the proxy contract is satisfied by code the test owns rather than a real Wippy server.

---

## Common deviations and how to spot them

When an app or WC has drifted from the standalone-aware contract, the symptoms are predictable:

| Symptom | Probable cause | Fix |
|---|---|---|
| `app.html` has `<script data-role="@wippy/scripts"></script>` with no `src=` | Page can't boot host-less. Loading the file directly produces a blank page (no `window.$W`). | Add a `src=` to the same tag — `http://localhost:5173/dev-proxy.js` for local dev or `https://web-host.wippy.ai/<tag>/dev-proxy.js` for shareable previews (the prod URL always includes a release-tag segment). |
| `app.html` has the dev-proxy `<script src=…>` but **no `<script type="importmap">`** above it | Browser can't resolve the bundle's bare-specifier imports (`vue`, `pinia`, `@iconify/vue`, `axios`, etc.). The first module-script load fails silently with `Failed to resolve module specifier "vue"` and the page never bootstraps Vue. | Declare the importmap inline in `<head>`, BEFORE the dev-proxy script. Mirror your bundler's `external` array exactly — every name listed in `vite.config.ts` `rollupOptions.external` MUST have an entry. Use `https://esm.sh/<pkg>@<major>` for vendor packages. See the [main example](#the-wippyscripts-switchpoint--one-tag-two-boot-paths). |
| `app.html` body has a custom SVG spinner / `<div>Loading…</div>` instead of `<wippy-loading title="…">` | Pre-bootstrap loader doesn't match the canonical Wippy idiom. The custom markup keeps showing while the WC ecosystem (which would render a styled, theme-aware loader) is fully booted. | Replace with `<wippy-loading title="Loading..."></wippy-loading>`. The `<wippy-loading>` web component is registered by `dev-proxy.js` (it imports `@wippy-fe/loading` synchronously) before the `<body>` parses, so the element resolves correctly even at very early page load. |
| `import` from a sibling app's source files | Shared code is being copy-pasted across module boundaries. | Extract to a workspace package or duplicate intentionally; never reach across app folders. |
| Hardcoded `fetch('/api/…')` calls | Bypasses the axios instance the proxy provides; won't pick up `env.APP_API_URL` overrides. | Use `useApi()` (apps) or `import { api } from '@wippy-fe/proxy'` (WCs). |
| `new EventSource(...)` for live data | Bypasses the host's auth/relay bridge; standalone mode has no equivalent. | Use `instance.on('your.topic', cb)` — works in both modes (in standalone the topic just doesn't fire unless you simulate it). |
| `document.documentElement.setAttribute('data-theme', ...)` for theme switch | Custom theme attribute is invisible to the proxy's `cssVariables.@dark/@light` (those bind to `prefers-color-scheme`). | Either drive theme from OS preference and use `@dark`/`@light` blocks, or document the attribute as a project-specific extension. See [theming.md](theming.md#level-3--per-page-theme-override-configoverrides--runtime). |
| `import '@wippy-fe/theme/theme-config.css'` in `app.ts` | Redundant — the host injects theme-config via `themeConfig: true` proxy injection. In host-less mode dev-proxy injects it too. | Remove the import. |
| Hardcoded API base URLs in api/ modules | Won't work in host-less mode against a different env. | Read from `appConfig.env.APP_API_URL` via `useApi()`. |

---

## Troubleshooting

**"Proxy globals not found" error.**
The WC bundle ran but neither real proxy nor dev-proxy initialized `window.__WIPPY_PROXY__`. Check that `<script src=".../dev-proxy.js" data-role="@wippy/scripts">` is in the page and the URL is reachable. In production-host mode this error means the host failed to inject proxy.js — check the host logs.

**Dev overlay never appears.**
The overlay is a shadow-DOM custom element appended to `document.body` after `DOMContentLoaded`. If you load `dev-proxy.js` from inside `<head>` and the body is missing or has `display: none`, the overlay can't render. Move the script to the bottom of the body, or unhide the body.

**Auto-accept "stuck" with bad config.**
If the stored config is broken and auto-accept is on, the overlay still renders (in monitoring mode); click the FAB → Reset to clear all `@wippy-dev/*` localStorage keys, then reload.

**Theme is wrong in dev mode.**
By default `getDefaultProxyConfig()` enables `customCss` and `customVariables` but disables `themeConfig`, `iframe`, `primevue`, `markdown`. If your app expects PrimeVue's theme-config CSS, toggle those checkboxes in the panel. Auto-accept will remember.

**Importmap mismatch between hosted and standalone.**
The host injects an importmap from `gen-2-chat/src/shared/import-map.ts`. The standalone `app.html` declares its own importmap inline. Keep the standalone one in sync (same packages, same versions) so a host-less build behaves like a hosted one. The canonical app-template apps demonstrate this.

**WC test fails with "host getter returned null".**
Tests need to set `el.__wippyHost = fakeWrapper` *before* `connectedCallback` fires. Either set it before `document.body.appendChild(el)`, or fake the wrapper through whatever resolver pattern your suite uses.

---

## Related docs

- [README.md](README.md) — Wippy FE architecture overview
- [host-spec.md](host-spec.md) — Host contract specification, including the `data-role="@wippy/scripts"` requirement and AppConfig shape
- [proxy-api.md](proxy-api.md) — Full `window.$W` / `@wippy-fe/proxy` reference (works identically in hosted and host-less mode)
- [app-guide.md](app-guide.md) — Building web apps (the boot path is the dual-mode `app.html` pattern this doc covers)
- [component-guide.md](component-guide.md) — Building web components (`WippyVueElement`, `define()`, host-less playground/tests)
- [theming.md](theming.md) — Per-page theme overrides via `config_overrides` (also feed dev-proxy via `theming.global.cssVariables` / `customCSS`)
