# Wippy FE Compliance Checklist

A single, exhaustive checklist for shipping Wippy child apps (`view.page`) and web components (`view.component`) — covering YAML registration, FE source, build pipeline, theming, proxy API, router/host integration, and host-less mode. Every rule cites a source (canonical doc, host contract, gold-standard reference, or real-world incident) and most have a copy-paste verification command.

Audience: human reviewers, AI agents auditing a fresh module (see **Appendix D — AI Audit Playbook** for the agent-oriented entry point), and CI gates.

This doc supersedes the older `app-checklist.md` for new work. The older checklist remains valid for the page-app subset; this one extends it with web components, host-less mode, real-world fixes, and verification recipes.

**Gold standards** (validated against this checklist):

- Page app: `app-template/frontend/applications/main/`
- Web component: `app-template/frontend/web-components/mermaid/`

When this checklist disagrees with what the gold standards do, the gold standards win. See §14 for the validation report.

---

## Conventions

- **MUST** — REJECT the module if not satisfied
- **SHOULD** — WARN; document the deviation if you keep it
- **MAY** — informational, no compliance gate
- **VERIFY** — copy-paste shell command that confirms the rule

Source references use:

- `docs:<filename>:<line>` — canonical FE docs at `app-template/frontend/docs/`
- `host:<filename>:<line>` — host contract code at `gen-2-chat/`
- `gold:<path>` — pattern observed in a gold-standard reference
- `kb:<topic>` — Wippy KB (queried via `mcp__wippy-kb__ask`)
- `incident:<id>` — bug found during a real audit

---

## Table of contents

0. [The FE isolation paradigm](#0-the-fe-isolation-paradigm) — read this first
1. [Decide what you're shipping](#1-decide-what-youre-shipping)
2. [YAML registration (host contract)](#2-yaml-registration-host-contract)
3. [Page apps — manifest, build, runtime](#3-page-apps--manifest-build-runtime)
4. [Web components — manifest, build, runtime](#4-web-components--manifest-build-runtime)
5. [Theming](#5-theming)
6. [Proxy API & subscriptions](#6-proxy-api--subscriptions)
7. [Router & host integration](#7-router--host-integration)
8. [Build pipeline & Makefile](#8-build-pipeline--makefile)
9. [Host-less mode](#9-host-less-mode)
10. [Verification recipes](#10-verification-recipes)
11. [Acceptance criteria (REJECT rules)](#11-acceptance-criteria-reject-rules)
12. [Known intentional deviations](#12-known-intentional-deviations)
13. [Tooling gotchas](#13-tooling-gotchas)
14. [Gold-standard validation report](#14-gold-standard-validation-report)
15. [Appendix A — Window globals & DOM markers](#appendix-a--window-globals--dom-markers)
16. [Appendix B — HostApi method signatures](#appendix-b--hostapi-method-signatures)
17. [Appendix C — ProxyConfig.injections reference](#appendix-c--proxyconfiginjections-reference)

---

## 0. The FE isolation paradigm

> Cite as: "**check FE isolation paradigm is followed**".

<details>
<summary><b>Additional guide for AI</b> — click to expand</summary>

- **Phase:** P1 Structural + P4 Cross-cutting (isolation is a contract, not a build artifact). See Appendix D.
- **Audit method:** read this section's paradigm; spot-check `app.html`, `app.ts` / `index.ts` imports, and `meta.url` / `fs.directory` in `_index.yaml`; verify no host coupling (no hardcoded mount URLs, no host package imports).
- **Swarm split:** solo (small, paradigm-only audit).
- **Cite findings as:** `path:line` against §0 isolation rules; moderator keys violations to §11.

</details>

A Wippy FE module (`view.page` or `view.component`) is a **standalone, universal build artifact** that has ZERO knowledge of where or how it is served. The `_index.yaml` registry entries on the BE side are the **serving facade** — they declare, for THIS Wippy deployment, where the bundle is mounted (`meta.url`), how it's reached (`meta.entry_point` / `meta.base_path`), and where the bytes come from (`fs.directory` + `http.static`, or any other source: `fs.embed`, in-memory FS, upstream proxy, DB-backed FS).

```
┌──────────────────────┐   built once, served anywhere   ┌──────────────────────┐
│ FE module (universal)│ ──────────────────────────────► │ _index.yaml (per-BE) │
│                      │                                 │                      │
│ - vite base: ''      │                                 │ - meta.url           │
│ - relative imports   │                                 │ - meta.entry_point   │
│ - package.json:      │                                 │ - meta.tag_name      │
│   tag, props, events │                                 │ - fs.directory OR    │
│ - NO mount URL       │                                 │   fs.embed OR any    │
│ - NO peer-module URL │                                 │   filesystem source  │
└──────────────────────┘                                 └──────────────────────┘
       ▲                                                          │
       │       built bundle (index.js, sourcemaps, optional       │
       │       static assets) lands wherever the BE expects ──────┘
       │       (configurable via Makefile / build script's `--outDir`)
```

### What the FE module MUST NOT know

- The URL prefix where it will be mounted on this deployment.
- Whether it's served from a filesystem, in-memory FS, CDN, or remote registry.
- Which other modules are co-located on the same Wippy instance, or at what URLs they live.
- Whether the BE uses one centralized `fs.directory` or one per module.

### What the YAML facade decides (and can override per deployment)

- `meta.url` — the **URL prefix** at which a router serving this bundle is mounted. Not a physical path. May be backed by `/static/...`, an in-memory FS, or a remote server.
- `meta.entry_point` — the URL **relative to the bundle root** pointing at the entry (`app.html` for pages, `index.js` for components).
- `meta.tag_name` (WCs only) — the custom-element tag the bundle registers itself as.
- `fs.directory` + `http.static` (or any equivalent) — where the bytes come from on this deployment. Single-shared-FS, per-module-FS, embedded-FS — all valid, FE doesn't care.

### Corollaries (the rules this paradigm produces)

**Bundle portability:**

- `vite.config.ts` MUST have `base: ''` so all asset URLs in the build are relative. Hardcoding `base: '/app/keeper/'` is **REJECT** — it bakes a deployment-specific URL prefix into a universal artifact. See §3.4 and §9.5.

**No cross-module URL hardcoding:**

- A FE module MUST NEVER `import('/components/x/dist/index.js')` or `fetch('/wc/x/...')` to reach another WC's physical URL. **REJECT.** Such a URL is a presumption about THIS deployment's serving layout — it breaks the moment the BE relocates the peer module, or runs it from an embedded FS. Consume another WC via the proxy / host pipeline instead:
  - **Registry-declared WCs (the common case)** — if the peer is `auto_register: true` + `announced: true` in its `view.component` entry, the host eagerly registers it in every iframe at boot. Consumer code just does `await customElements.whenDefined('wc-x')` and then uses the tag. No URL knowledge required.
  - **Artifact-based / dynamically-loaded WCs** — call `loadWebComponent(componentId, tagName?)` from `@wippy-fe/proxy`. **`componentId` is the artifact UUID** (the host fetches the artifact's package.json via the artifact API, validates it as a Wippy package, then dynamic-imports it — see `gen-2-chat/src/proxy/shared/web-component-loader.ts`). This is the path for user-generated / AI-generated WCs delivered as artifacts.
  - Registry-declared WCs without `auto_register + announced` are also addressable via `loadWebComponent()` — provided you have their artifact id. If you find yourself reaching for this in a static consumer-WC, the better fix is usually to flip `auto_register + announced` on the peer instead.

**Build script owns the output path, not vite.config:**

- The deployment's build script (Makefile / make.ps1 / npm script) passes `--outDir <wherever-the-BE-expects>` per module. The `vite.config.ts` does NOT hardcode `outDir`. This way the same FE bundle can be built into:
  - `static/wc/<name>/` (centralized)
  - `<package>/dist/` (per-module)
  - a CI artifact dir
  - …without any change to the FE source.

**`package.json` describes the module, not its mount point:**

- Carry `wippy.tagName`, `wippy.type`, `wippy.props`, `wippy.events`. Do NOT carry `wippy.url`, `wippy.host`, `wippy.mountPath` — those are deployment-specific and belong in the BE's `_index.yaml` `meta.*`.
- **Source-of-truth precedence: the registry entry always wins over `package.json`.** `meta.tag_name`, `meta.props`, `meta.events` on the `view.component` entry override the corresponding `wippy.tagName` / `wippy.props` / `wippy.events` in `package.json` for THIS deployment. `package.json` carries the module's *suggested* / *default* shape — useful for host-less mode and as the package's self-description; the registry is what the running host actually consults.
- **Open TODO**: today, props/events schemas must be kept in sync **manually** between `package.json` and the registry entry. A future change will load these dynamically from the package.json at load time so the registry only needs the override deltas. Until then: if you edit props/events on one side, edit the other.

**Re-mounting under a different URL must work without a rebuild:**

- Because `base: ''`, the bundle's relative imports resolve against whatever `<base>` the host injects from `meta.url` + `meta.base_path` at serve time. Test in dev by changing `meta.url`, reloading — no rebuild needed. If it breaks, the paradigm is being violated somewhere.

### Audit checklist — "is FE isolation paradigm followed?"

- [ ] `vite.config.ts` has `base: ''` (and **not** `'/something/'`).
- [ ] `vite.config.ts` does NOT hardcode `outDir` — the build script passes `--outDir` per deployment.
- [ ] `package.json` carries `wippy.tagName` / `wippy.type` / props / events. It does NOT carry any deployment URL or mount path.
- [ ] Source tree has zero hardcoded references to peer modules' physical URLs. `grep -rn "/components/\|/wc/\|/app/[a-z]" src/` returns only same-module relative references.
- [ ] If the module consumes another WC, it does so via `await customElements.whenDefined('wc-x')` (for registry-declared peers with `auto_register: true` + `announced: true`) or `loadWebComponent(artifactUUID)` (for artifact-delivered peers) — never by hardcoding a URL like `/components/x/dist/index.js`.
- [ ] No `import.meta.url`-based path math that presumes a specific serving layout. The pattern `define(import.meta.url, …)` is fine; `import.meta.url.split('/components/')[1]` is not.

### When this is satisfied

The same built bundle ships to:
- a Wippy instance that serves it from `static/wc/<name>/` under URL `/components/<name>`
- another instance that embeds it via `fs.embed` and serves it under `/legacy/widgets/<name>`
- a tests harness that serves it from a memory-backed FS
…with only the BE-side `_index.yaml` differing between deployments. The FE artifact byte-for-byte identical.

---

## 1. Decide what you're shipping

| Question | Use |
|---|---|
| Will it be loaded in its own iframe with its own `app.html`? | `view.page` |
| Will it be inserted as a `<custom-tag>` inside another page's DOM? | `view.component` |
| Both? | ship two registry entries — one for each role |

**Runtime difference** (`kb:view-page-vs-component`):

- `view.page` → host loads it in an **iframe** with its own `app.html`. Code runs in iframe document.
- `view.component` → host registers a custom tag and inserts the element directly in the host DOM (typically with shadow DOM). Code runs in the **same document** as the host.

**`view.page` does not imply nav presence.** A `view.page` entry with `meta.announced: false` is reachable via:

- a `mountRoute` someone navigates to,
- direct `host.openSession` / `host.openArtifact` invocation,
- being used inside a managed-layout panel,
- being loaded inside a `<w-artifact>` element by another app.

A "page in iframe with no nav-owner" — common in artifact viewers, embedded demos, sub-tools — is an explicit and supported pattern. Set `announced: false` to keep it out of nav while leaving it routable. (`gold:src/app/views/_index.yaml` — many `dam-*` entries follow this pattern.)

Conversely, a `view.component` entry with `auto_register: true` and `announced: true` will appear in tag-explorer registries; with `announced: false` it's an internal building block.

**For `view.component` entries, `announced: true` is a HARD requirement to participate in the host's autoload.** The `/api/public/components/list` endpoint served by `wippy/views` filters server-side by `announced == true` (see `wippy/views/api/list_components.lua`); `auto_register: true` alone is *not* enough to make the host inject the WC's `<script type="module">` tag at boot. Symptom of getting this wrong: `customElements.get('your-tag')` stays `undefined`, Vue silently renders an empty `<your-tag></your-tag>` with no shadow root content, no console error. Loading & registration mechanics — including this filter, the `@wippy-fe/proxy` eager-getter contract, and required `vite.config.ts` externals — are documented in [web-component-loading.md](web-component-loading.md).

<details>
<summary><b>Additional guide for AI</b> — click to expand</summary>

If you're an AI agent auditing a module, **start at Appendix D — AI Audit Playbook**. It defines the phase order (P1 Structural → P2 Build → P3 Runtime, with P4 Cross-cutting in parallel), the swarm decision matrix (when to spawn sub-agents and how to slice §3 / §4 / §5), and the moderator's required output schema. Decide page vs. component using the table above, then jump to the relevant section's "Additional guide for AI" callout.

</details>

---

## 2. YAML registration (host contract)

A registry.entry is what the host actually reads at navigation/render time. The `wippy.*` block in your `package.json` is the host-less mirror. **YAML is canonical**; package.json is for embedded fallback.

### 2.1 `view.page` meta fields

```yaml
- name: main
  kind: registry.entry
  meta:
    type: view.page
    name: main
    title: Admin Panel
    icon: tabler:layout-dashboard
    order: 0
    announced: true
    secure: false
    url: /app
    base_path: app/main
    entry_point: app.html
    mountRoute: /home/:part(.*)*
  proxy:
    enabled: true
    css:
      fonts: true
      theme_config: true
      iframe: true
      prime_vue: true
      custom_css: true
      custom_variables: true
    tailwind_config: true
    iconify_icons: true
```

**Field-by-field** (`gold:src/app/views/_index.yaml`, `kb:view-page-fields`):

| Field | Required | Purpose |
|---|---|---|
| `meta.type` | MUST | `"view.page"` literal |
| `meta.name` | MUST | Page id (combines with namespace into `<ns>:<name>`, e.g. `app.views:main`) |
| `meta.title` | MUST | Human-readable title (used in nav and page tabs) |
| `meta.icon` | SHOULD | Iconify icon code (e.g. `tabler:home`); only relevant if `announced: true` |
| `meta.url` | MUST | **URL prefix** at which the FS+http.router serving this bundle is mounted. Not a physical path. e.g. `url: /app` means a router/fs is registered at `/app/...`, which may be backed by a `/static/...` directory, an in-memory FS, or a remote server. |
| `meta.base_path` | MUST | URL path appended to `url` to reach the bundle root. Combined with `url`, becomes the **HTML `<base>` injected into `entry_point`**, so relative module imports inside `app.html` resolve against the bundle root. e.g. `url=/app` + `base_path=app/main` → bundle is reached at `/app/app/main/`. The double "app" is intentional and correct. |
| `meta.entry_point` | MUST | URL path **relative to the bundle root** pointing at the entry HTML file. e.g. `app.html` (most common). If your bundle has `htmls/f.html`, set `entry_point: htmls/f.html`. |
| `meta.mountRoute` | MAY | Vue Router 4 path the host claims for this page (e.g. `/home/:part(.*)*`). v1 canonical form: `/<literal>/:part(.*)*` or `/:part(.*)*`. If absent, page is reachable only at `/c/<namespace>:<name>`. |
| `meta.secure` | SHOULD | Default `false`. Set `true` to enforce auth. |
| `meta.announced` | SHOULD | Default `false`. Set `true` to appear in nav. Pages without nav-owner (loaded via `<w-artifact>`, layout panels, deep-links) keep `false`. |
| `meta.hidden` | MAY | Soft-hide from announced nav. |
| `meta.order` | MAY | Sort position in nav (when announced). |
| `meta.group` / `meta.group_icon` / `meta.group_order` | MAY | Nav grouping. |
| `meta.config_overrides` | MAY | **Per-page ISOLATION override only.** The MAIN way to set up themes/config is the host's facade module (see §5.1) — the facade owns `cssVariables` / `customCSS` / `host_custom_css` / `css_variables` for the whole app shell. Reach for `config_overrides` only when you explicitly want THIS specific iframe to look or behave different from the rest of the app — e.g. a demo page with a deliberately divergent palette, an artifact viewer with a fixed brand identity, or a debug page on a different `apiRoutes`. (`gold:src/app/views/_index.yaml:72-122` — `iframe-demo-themed` is the canonical demo of an isolation override; the rest of the app inherits the facade.) Structure mirrors `wippy.configOverrides` in package.json (see §5.3). |
| `proxy` (sibling of `meta`, NOT inside meta) | SHOULD | Per-entry proxy injection config. Snake_case keys: `theme_config`, `prime_vue`, `custom_css`, `custom_variables`, `tailwind_config`, `iconify_icons`. Mirrors what package.json `wippy.proxy.injections` declares with camelCase. (`gold:src/app/views/_index.yaml`) |

**End-user URLs**:

- Default: `/c/<namespace>:<name>` (e.g. `/c/app.views:main`).
- With `mountRoute`: the matching path (`/home/foo` for `mountRoute: /home/:part(.*)*`).
- Aliases (`meta.name: keeper`) are NOT a direct end-user URL — the canonical address uses the entry id (`<namespace>:<name>`).

**VERIFY** at runtime that the host registry recognizes your entry:
```bash
curl -fsS http://<host>/api/public/pages/list | jq '.pages[] | select(.id=="<namespace>:<name>")'
```

### 2.2 `view.component` meta fields

```yaml
- name: mermaid
  kind: registry.entry
  meta:
    type: view.component
    name: mermaid
    title: Mermaid Diagram
    tag_name: example-mermaid
    entry_point: index.js
    announced: true
    secure: false
    auto_register: true
    url: /app/wc/mermaid
    props:
      type: object
      properties:
        definition:
          type: string
          default: ""
          description: Mermaid diagram definition string
        transparent:
          type: boolean
          default: true
          description: Whether the diagram background is transparent
```

**Field-by-field** (`gold:src/app/views/_index.yaml`, `kb:view-component-fields`):

| Field | Required | Purpose |
|---|---|---|
| `meta.type` | MUST | `"view.component"` literal |
| `meta.name` | MUST | Component logical name |
| `meta.tag_name` | MUST | Custom-element tag. **Must contain a hyphen** (Custom Elements spec). The first segment is project convention — `example-` for app-template demos, `dam-` for layout pieces, `wippy-` reserved for first-party WCs, project-specific prefixes for everything else. |
| `meta.entry_point` | MUST | URL relative to bundle root pointing at the entry **JS** file (e.g. `index.js`). For WCs, entry is JS not HTML. |
| `meta.url` | MUST | URL prefix where the bundle is served (e.g. `/app/wc/mermaid`). Same semantics as for `view.page` — a router/fs map, not a physical path. |
| `meta.base_path` | MAY | Subdirectory under `url`. Often empty for WCs (entry sits at bundle root). |
| `meta.announced` | MUST per `kb:view-component-fields` | Default `true`. |
| `meta.secure` | MUST per kb | Default `false`. |
| `meta.auto_register` | MUST per kb | Default `true`. Set `false` for lazy-loaded WCs that only register when explicitly imported. |
| `meta.props` | SHOULD | JSON Schema mirroring `wippy.props` from package.json. Each property MUST have `type`, `default`, `description`. |
| `meta.events` | MAY | JSON Schema mirroring `wippy.events`. Omit if the WC has no custom events. |
| `meta.description` | SHOULD | **Verbose AI/human-readable usage explanation.** Not a one-line label — a paragraph or two that an LLM (or a new dev with no project context) can read and immediately understand: what the WC renders, the intended call shape (e.g. "pass the source via `props.definition`, NOT as text content"), what input forms are supported, what edge cases or fallbacks exist, and any notable performance characteristics. Should mirror the same field in `package.json` `wippy.description`. The `gold:web-components/mermaid/package.json:6,40` description is the canonical shape — three sentences covering what it does, how to call it, which inputs are fast-path vs lazy-load. |
| `meta.title`, `meta.icon` | MAY | For browse/registry UIs. |
| `meta.hidden`, `meta.order`, `meta.group` | MAY | When relevant for tag-explorer registries. |

**No `proxy:` block for WCs** — they run in the host's document, not in their own iframe, so proxy injections don't apply. The WC inherits the host's CSS environment.

**Hyphenated prop names** (e.g. `allow-multiple`) are camelCased in Vue (`allowMultiple`). Non-string props are JSON-encoded in attributes; the WC must `JSON.parse` them or use `WippyVueElement`/`WippyElement` (which handle this automatically).

### 2.3 `config_overrides` shape

(`host:src/shared/app-config/types.ts:192-197`)

```ts
interface AppConfigOverrides {
  customization?: Partial<AppCustomization>  // see §5.3
  axiosDefaults?: Partial<AxiosDefaults>     // MERGED into config.axiosDefaults
  routePrefix?: string                       // REPLACES config.routePrefix
  apiRoutes?: ApiRoutesOverride              // REPLACES config.apiRoutes
}
```

`customization` field merge semantics (`host:migration.ts:216-236`, mergeChildCustomization):
- `cssVariables` → **REPLACE** (override map fully replaces parent map)
- `customCSS` → **REPLACE** (new string replaces parent; not concatenated)
- `icons` → **MERGE** shallow (additive)
- `iconSets` → **MERGE** per-prefix (additive)

**Isolation depends on the field.** `config_overrides` are NOT uniformly "isolation-only" — behaviour is field-specific:

- **`cssVariables` / `customCSS` (REPLACE)** → isolating. The override fully replaces what the parent provides. Use sparingly — facade-first is canonical (see §5.1). Legitimate cases: per-iframe brand identity for a portable module that ships its own palette, demo pages with deliberately divergent themes, artifact viewers with a fixed brand, debug pages on alternate API routes, safety-critical iframes that pin their own visual contract.
- **`icons` / `iconSets` (MERGE)** → additive, NON-isolating. Adding icons via `config_overrides.customization.icons` augments the facade-defined icon set without isolating the iframe. This is the canonical way for a child page to register iconography it specifically needs without forcing the whole app to know about it.

If your motivation is "the app theme should be X" — set X in the facade, not in every page's `config_overrides.cssVariables`. If your motivation is "this page needs one extra icon set" — `config_overrides.customization.icons` is exactly the right tool.

### 2.4 The `proxy:` entry-level block (page only)

For `view.page` entries, the **registry-entry's `proxy:` sibling** of `meta` (NOT inside meta) configures host-side proxy injection per page. Keys are snake_case.

```yaml
proxy:
  enabled: true
  css:
    fonts: true
    theme_config: true
    iframe: true
    prime_vue: true
    custom_css: true
    custom_variables: true
  tailwind_config: true
  iconify_icons: true
```

YAML uses snake_case (`theme_config`, `prime_vue`); package.json uses camelCase (`themeConfig`, `primevue`). The host normalizes between them.

All injection flags are technically MAY — the host has sane defaults — but page apps SHOULD declare them explicitly to avoid invisible drift.

---

## 3. Page apps — manifest, build, runtime

<details>
<summary><b>Additional guide for AI</b> — click to expand</summary>

- **Phase:** P1 Structural → P2 Build & types → P3 Runtime (in series — stop on P1 fail). See Appendix D.
- **Audit method:** jq on `package.json`, grep on `vite.config.ts` / `app.html` / `app.ts`; then `vue-tsc --noEmit` + `vite build`; then boot via `bg-manager bg_run` and exercise the router. Use §10 recipes verbatim — do not invent commands.
- **Swarm split:** 4 sub-agents — (3.1+3.2 build config), (3.3+3.4 app.html + bootstrap), (3.5+3.6 router + constants), (3.7+3.9 styles + subscription cleanup). Moderator consolidates against §11 page-app rules.
- **Cite findings as:** `path:line`; moderator keys violations to §11 page-app REJECT rules.

</details>

### 3.1 `package.json`

Reference: `gold:app-template/frontend/applications/main/package.json`.

```json
{
  "name": "@wippy/app-main",
  "version": "1.0.0",
  "specification": "wippy-component-1.0",
  "title": "Wippy App",
  "description": "...",
  "files": ["dist/", "src/", "package.json"],
  "browser": "dist/app.js",
  "wippy": {
    "type": "page",
    "title": "Wippy App",
    "icon": "tabler:home",
    "path": "dist/app.html",
    "proxy": {
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
        "iconifyIcons": false,
        "errorCapture": true
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
    "type-check": "vue-tsc --build --force",
    "lint": "eslint src --ext .ts,.vue",
    "lint:fix": "eslint src --ext .ts,.vue --fix"
  },
  "dependencies": {
    "@wippy-fe/theme": "^0.0.28"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "@wippy-fe/types-global-proxy": "^0.0.28",
    "@wippy-fe/vite-plugin": "^0.0.28",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.57.0",
    "eslint-plugin-vue": "^9.0.0",
    "postcss": "^8.4.0",
    "primevue": "^4.3.3",
    "tailwindcss": "3",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vue": "^3.5.0",
    "vue-eslint-parser": "^9.4.3",
    "vue-router": "^4.6.4",
    "vue-tsc": "^2.0.0"
  },
  "peerDependencies": {
    "@iconify/vue": "^5.0.0",
    "@wippy-fe/pinia-persist": "^0.0.28",
    "@wippy-fe/proxy": "^0.0.28",
    "@wippy-fe/router": "^0.0.28",
    "axios": "^1.0.0",
    "luxon": "^3.5.0",
    "pinia": "^2.1.0",
    "primevue": "^4.3.3",
    "vue": "^3.5.0",
    "vue-router": "^4.0.0"
  }
}
```

**Specification** — `docs:app-checklist.md:39`, `gold:main/package.json:4`:

- MUST set `"specification": "wippy-component-1.0"`.
- MUST set package `name` to `@<org>/app-<short>` (e.g. `@wippy/app-main`).
- MUST set top-level `"title"` (matches `wippy.title`).

**`wippy` block**:
- MUST set `wippy.type: "page"`.
- MUST set `wippy.title` (typically equals top-level `title`).
- SHOULD set `wippy.icon` to an Iconify code (only relevant if the page is `announced: true`).
- MUST set `wippy.path: "dist/app.html"` (or wherever your built entry HTML lives).

**`wippy.scripts` map** — entry → npm script binding:
- MUST set `wippy.scripts.build` (typically `"build"`).
- MAY set `wippy.scripts.debug` (typically `"build:debug"`).
- MAY set `wippy.scripts.test` (typically `"lint"` or `"test"` — whichever npm script gates publish).

**`wippy.proxy.injections`** — `host:src/proxy/entry.iframe.ts:65-340` (full reference: Appendix C):

All flags are technically MAY (host has defaults). The **recommended set for a typical page app** is:

| Flag | Recommended | When to set otherwise |
|---|---|---|
| `proxy.enabled` | `true` | `false` for pages with no proxy needs (rare) |
| `injections.css.fonts` | `true` | `false` if you ship your own fonts |
| `injections.css.themeConfig` | `true` | `false` only if you don't use Wippy theming |
| `injections.css.iframe` | `true` | `false` only outside iframe context |
| `injections.css.primevue` | `true` | `false` if you don't use PrimeVue |
| `injections.css.markdown` | `true` if app renders any markdown | `false` if you have no markdown anywhere (verify with grep) |
| `injections.css.customCss` | `true` | `false` if you don't read `customization.customCSS` |
| `injections.css.customVariables` | `true` | `false` if you don't read `customization.cssVariables` |
| `injections.tailwindConfig` | `false` | `true` if using Tailwind Play CDN runtime |
| `injections.resizeObserver` | `false` | `true` for widget-style pages needing reported size |
| `injections.preventLinkClicks` | `false` | `true` if you don't have your own router |
| `injections.iconifyIcons` | `false` | `true` if using CDN Iconify |
| `injections.errorCapture` | `true` | `false` if you handle errors fully internally |
| `injections.refreshWhenVisible` | `false` (or omit) | `true` for pages that need stale-data refresh |
| `injections.historyPolyfill` | `true` (or omit) | leave on; host installs always-stub |

**`wippy.configOverrides`** — see §2.3. **Typically omitted.** Add only when a per-iframe deviation is intentional.

**Dependency hygiene**:

- `dependencies`: only what's bundled into the page (e.g. `@wippy-fe/theme`, app-specific libs like `chart.js`).
- `devDependencies`: build toolchain (`vite`, `vue-tsc`, `typescript`, `@vitejs/plugin-vue`, `eslint*`, `tailwindcss@3`, `postcss`, `autoprefixer`, `primevue` for build-time, `vue` for build-time, `vue-router` if you build-time-import it, `@wippy-fe/types-global-proxy`, `@wippy-fe/vite-plugin`).
- `peerDependencies`: every package the host's import map provides. Canonical set: `vue`, `vue-router`, `pinia`, `axios`, `@iconify/vue`, `@wippy-fe/proxy`, `@wippy-fe/router`, `@wippy-fe/pinia-persist`, `primevue` and any `primevue/*` you import. Add `luxon`, `nanoevents`, `@tanstack/vue-query`, `@tanstack/query-core` only if the app actually imports them.
- Adding to `peerDependencies` does NOT bundle the package — it's a host-import-map subscription.

**Version alignment**: `@wippy-fe/*` packages SHOULD be on the same minor version (e.g. all `^0.0.28`). Ecosystem mismatch causes silent ABI drift.

**VERIFY** required wippy fields:
```bash
node -e 'const p=require("./package.json");const m=["specification","title"].filter(k=>!p[k]).concat(p.wippy?[]:["wippy"]);if(m.length)throw new Error("missing: "+m.join(","));console.log("OK")'
```

### 3.2 `vite.config.ts`

Reference: `gold:main/vite.config.ts` (plus `wippyPackagePlugin()` which the gold standard predates; new apps SHOULD include it).

```ts
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { wippyPackagePlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('example-'),
        },
      },
    }),
    wippyPackagePlugin(),
  ],
  base: '',
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      input: { app: resolve(__dirname, 'app.html') },
      external: [
        'vue',
        'pinia',
        'vue-router',
        '@iconify/vue',
        'nanoevents',
        'luxon',
        '@wippy-fe/proxy',
        'axios',
        '@tanstack/vue-query',
        '@tanstack/query-core',
      ],
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
})
```

Rules:

- MUST set `base: ''` (relative paths; bundle is portable to any URL prefix). `gold:main/vite.config.ts:15`. A hardcoded absolute base (e.g. `/app/keeper/`) is **REJECT** — see §9.5. The URL prefix is the host's job (via YAML `meta.url` + `meta.base_path`); the bundle must not embed it.
- MUST include `vue()` plugin.
- SHOULD include `wippyPackagePlugin()` from `@wippy-fe/vite-plugin` (default; opt out only if your team explicitly does NOT want host-less mode support — rare). Plugin injects the package.json `wippy` block into the built HTML so dev-proxy seeds the right defaults; harmless under a real host.
- SHOULD pass `template.compilerOptions.isCustomElement` if your templates render custom-element tags. Predicate is project-specific (e.g. `tag.startsWith('example-')` for app-template demos, `tag.startsWith('wippy-')` for first-party WCs).
- MUST set `build.target: 'esnext'`.
- MAY set `build.cssCodeSplit: false` to inline all CSS into a single bundle. Default `true` (CSS code split) is also fine for multi-page apps that benefit from per-route CSS chunks. Either is acceptable — choose based on app shape.
- MAY set `build.sourcemap: true` for production. Sourcemaps help debugging in field; they also slightly leak source structure. Gating behind an env var is OPTIONAL — gold standard ships sourcemaps unconditionally.
- MUST set `build.rollupOptions.input` to your `app.html` (or whatever entry HTML you use).
- MUST list every host-provided package in `build.rollupOptions.external`. Canonical set for a full-featured app: `vue`, `pinia`, `vue-router`, `axios`, `@iconify/vue`, `@wippy-fe/proxy`, `nanoevents`, `luxon`. Add `@tanstack/vue-query` + `@tanstack/query-core` if you use TanStack Query.
- MUST NOT set `build.assetsInlineLimit` to a large value (`incident:1I`); leave at the 4 KB default so larger assets get cached as separate files.
- MUST NOT force `define: { 'process.env.NODE_ENV': '"production"' }` (`incident:7C`); it overrides `--mode development`.

**VERIFY** base + canonical externals + plugin:
```bash
grep -E "base:\\s*['\"]" path/to/vite.config.ts            # must show: base: ''
grep -A 25 "external:" path/to/vite.config.ts              # check coverage of imported host packages
grep -E "wippyPackagePlugin" path/to/vite.config.ts        # SHOULD be present
```

### 3.3 `app.html`

Reference: `gold:main/app.html`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wippy</title>
    <script type="importmap">
    {
        "imports": {
            "vue":          "https://esm.sh/vue@3",
            "pinia":        "https://esm.sh/pinia",
            "vue-router":   "https://esm.sh/vue-router@4",
            "luxon":        "https://esm.sh/luxon",
            "@iconify/vue": "https://esm.sh/@iconify/vue",
            "axios":        "https://esm.sh/axios",
            "@wippy-fe/markdown-iframe": "http://localhost:5173/@wippy-fe/markdown-iframe.js"
        }
    }
    </script>
    <script
        src="http://localhost:5173/dev-proxy.js"
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

Rules:
- MUST contain `<!DOCTYPE html>`, `<html lang="...">`, charset, viewport.
- MUST contain a `<title>`. The value SHOULD be sensible; it MAY differ from `wippy.title` (gold standard has `<title>Wippy</title>` while `wippy.title` is `"Wippy App"`).
- MUST contain `<script type="importmap">` with at minimum every host-provided package the app imports at runtime.
- The importmap MUST cover every external the app actually imports (not necessarily the full vite externals array — gold standard externalizes `nanoevents`/`pinia` even though the app doesn't directly import them, and the importmap can omit those because the host's runtime importmap provides them under a real host).
- Importmap URLs SHOULD use `https://esm.sh/<pkg>@<major>` for production. `http://localhost:5173/...` for local dev mode.
- MUST contain exactly one `<script data-role="@wippy/scripts">`. Production CDN form: `src="https://web-host.wippy.ai/<release-tag>/dev-proxy.js"`. Local dev: `src="http://localhost:5173/dev-proxy.js"`.
- MUST contain `<div id="app"></div>` mount point.
- MUST contain `<wippy-loading title="...">` inside the mount instead of a hand-rolled spinner (`docs:host-less-mode.md:377`).
- MUST contain `<script type="module" src="./src/app.ts">` (or your entry path) at end of body.

**VERIFY**:
```bash
grep -c '<script type="importmap">' app.html      # must = 1
grep -c 'data-role="@wippy/scripts"' app.html     # must = 1
grep -c '<wippy-loading' app.html                 # must >= 1
```

### 3.4 `src/app.ts` (bootstrap)

Reference: `gold:main/src/app.ts`.

```ts
import { addCollection } from '@iconify/vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createWippyPersist, preloadWippyState } from '@wippy-fe/pinia-persist'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'

import App from './app/app.vue'
import { AXIOS_INSTANCE, HOST_API, WIPPY_INSTANCE } from './constants'
import { createAppRouter } from './router'
import '@wippy-fe/theme/theme-config.css'
import './styles.css'
import './tailwind.css'

export async function createMainApp() {
  const config = await window.$W.config()
  const hostApi = await window.$W.host()
  const axios = await window.$W.api()
  const instance = await window.$W.instance()

  // config.path is deprecated (v1 AppConfig only). Host v18+ uses config.context.route.
  const routePath = config.context?.route || config.path
  const initialPath = routePath
    ? (routePath.startsWith('/') ? routePath : '/' + routePath)
    : '/'

  if (config.customization?.icons) {
    addCollection({
      prefix: 'custom',
      icons: config.customization.icons,
    })
  }

  const app = createApp(App)

  const preloaded = await preloadWippyState()
  const pinia = createPinia()
  pinia.use(createWippyPersist(preloaded))
  app.use(pinia)
  app.use(VueQueryPlugin)
  app.use(PrimeVuePlugin)

  app.provide(HOST_API, hostApi)
  app.provide(AXIOS_INSTANCE, axios)
  app.provide(WIPPY_INSTANCE, instance)

  const router = createAppRouter(hostApi, instance.on, initialPath)
  app.use(router)

  return app
}

export async function mountApp(elementId: string = '#app') {
  const app = await createMainApp()
  app.mount(elementId)
  return app
}

mountApp()
```

Rules:
- MUST `await` all four `window.$W.*()` calls (`config`, `host`, `api`, `instance`).
- MUST resolve initial path: prefer `config.context?.route` (v18+), fall back to `config.path` (v1), then `'/'`.
- MUST normalize the resolved path to start with `/`.
- MUST `app.provide(HOST_API, ...)`, `app.provide(AXIOS_INSTANCE, ...)`, `app.provide(WIPPY_INSTANCE, ...)`.
- MUST `app.mount('#app')` (or whatever id matches the `<div id>` in app.html).
- MUST register the PrimeVue plugin if you use any PrimeVue component.
- SHOULD register `createWippyPersist(preloaded)` on pinia for state persistence across iframe destructions.
- SHOULD register `VueQueryPlugin` if you use TanStack Query.
- MUST iterate `config.customization?.icons` and call `addCollection` (or use the gold-standard one-call form with `prefix: 'custom'`).
- MUST NOT `console.log` boot diagnostics in production (`console.warn`/`console.error` allowed).

### 3.5 `src/router/index.ts`

Reference: `gold:main/src/router/index.ts`.

**Canonical pattern** — wrap `@wippy-fe/router`'s factory:

```ts
import type { HostApi } from '../types'
import type { Router } from 'vue-router'
import { createAppRouter as createAppRouterFactory } from '@wippy-fe/router'

type OnSubscription = (
  pattern: string,
  callback: (event: { path?: string, message?: unknown }) => void,
) => void

const routes = [
  { path: '/',                       name: 'home',      component: () => import('../pages/home.vue') },
  { path: '/users',                  name: 'users',     component: () => import('../pages/users.vue') },
  { path: '/:pathMatch(.*)*',        name: 'not-found', redirect: '/' },
]

export function createAppRouter(host: HostApi, on: OnSubscription | null, initialPath: string): Router {
  return createAppRouterFactory(routes, {
    host: host as never,
    on: on as never,
    initialPath,
  })
}
```

The factory (`@wippy-fe/router/src/create-app-router.ts`) encapsulates:
- `createMemoryHistory()` (no arg).
- `if (initialPath) history.replace(initialPath)` BEFORE `createRouter`.
- `setLocalRouter(...)` registration so the link classifier prefers your routes.
- `router.afterEach(to => host.onRouteChanged(to.fullPath, navId))` with echo-loop suppression.
- `on('@history', ({ path, navId }) => ...)` listener with leading-slash normalization.

Rules (apply whether you use the factory or a hand-rolled body):
- MUST use `createMemoryHistory()` — never `createWebHistory` or `createHashHistory`.
- MUST call `history.replace(initialPath)` BEFORE `createRouter` (`incident:2A`).
- MUST register `router.afterEach` that calls `host.onRouteChanged(to.fullPath, navId?)` (`incident:2B`).
- MUST register `on('@history', ...)` listener with null-check on `on` (`incident:2C`).
- MUST guard `!path` inside the `@history` handler.
- MUST normalize leading slash on incoming paths (`incident:2E`).
- MUST include catch-all route `/:pathMatch(.*)*` with `name: 'not-found'`.
- SHOULD use `navId` to suppress the round-trip echo of self-initiated navigation.
- SHOULD call `setLocalRouter(...)` so the host's link classifier can fast-path local routes (the factory does this for you).

**Use `@wippy-fe/router@^0.0.28` (or later).** That release is the canonical home of the factory body, including `setLocalRouter` registration and the `@history` listener. There is no acceptable reason for a new module to hand-roll this — pin the package and call the factory.

### 3.6 `src/constants.ts` and `src/types.ts`

Reference: `gold:main/src/constants.ts`, `gold:main/src/types.ts`.

```ts
// src/constants.ts
import type { InjectionKey } from 'vue'
import type { HostApi, ProxyApiInstance } from './types'

export const HOST_API       = Symbol('host_api') as InjectionKey<HostApi>
export const AXIOS_INSTANCE = Symbol('axios')    as InjectionKey<ProxyApiInstance['api']>
export const WIPPY_INSTANCE = Symbol('proxy')    as InjectionKey<ProxyApiInstance>
```

```ts
// src/types.ts
export type HostApi          = Awaited<ReturnType<typeof window.$W.host>>
export type ProxyApiInstance = Awaited<ReturnType<typeof window.$W.instance>>
export type WippyConfig      = Awaited<ReturnType<typeof window.$W.config>>
```

Both files are tiny and stable. Copy verbatim into new apps.

### 3.7 Styling

`src/styles.css` — 9-line boilerplate (`gold:main/src/styles.css`):

```css
html, body {
  height: 100%;
  margin: 0;
  background: transparent;
}

#app {
  height: 100%;
}
```

Rules:
- MUST set `background: transparent` so the host's iframe styles win.
- MUST NOT set padding/margin on `html, body, #app`.
- MUST NOT redefine `--p-surface-N`, `--p-content-background`, `--p-text-color`, `--p-primary-color`, etc. at module scope. Host owns them.
- MUST NOT redefine PrimeVue component tokens (`.p-dialog`, `.p-button`, etc.) globally.
- DO put per-app theming in YAML `meta.config_overrides` (or the package.json `wippy.configOverrides` mirror) — not in source CSS.

`src/tailwind.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`tailwind.config.ts` (`gold:main/tailwind.config.ts`):
```ts
import themePreset from '@wippy-fe/theme/tailwind.config'

export default {
  presets: [themePreset],
  content: ['./src/**/*.{vue,ts}', './app.html'],
}
```

Note: `themePreset` is a **default import**, not a named import.

`postcss.config.js` (CRITICAL):
```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

### 3.8 Vue / TypeScript hygiene

Reference: `gold:main/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "@wippy-fe/types-global-proxy"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

Rules:
- MUST `target: "ES2020"` (canonical). `lib` MUST include `"ES2020"`, `"DOM"`, `"DOM.Iterable"`. ES2022+ is allowed but ES2020 is the gold-standard floor.
- MUST `module: "ESNext"`, `moduleResolution: "bundler"`, `strict: true`, `noEmit: true`.
- MUST include `vite/client` and `@wippy-fe/types-global-proxy` in `types`.
- MUST include `src/**/*.ts`, `src/**/*.vue`, and `vite.config.ts` in `include`.
- ALL `.vue` files MUST use `<script setup lang="ts">` at the top.
- MUST type props with TS interface or generic: `defineProps<{ foo: string }>()`. Untyped object syntax is REJECT.
- MUST use Composition API.
- File names SHOULD be kebab-case. PascalCase files are a documented bulk-rename target where they exist.
- MUST avoid `any`; prefer `unknown` + guards. Each retained `any` MUST have a justifying comment. Aim ≤ 50 across an entire app.
- `pages/<x>.vue` MUST be lazy-loaded in router: `() => import('../pages/x.vue')`.
- MUST NOT use `console.log` in production code. `console.warn` and `console.error` are allowed for error reporting.
- `npm run type-check` MUST exit 0. Both `vue-tsc --build --force` (gold standard) and `vue-tsc --noEmit` are acceptable.
- Tests SHOULD exist for non-trivial logic and MUST pass.

### 3.9 Subscription cleanup (the leak avoidance pattern)

`instance.on(pattern, cb)` returns an unsubscribe function. ALWAYS store it. ALWAYS call it in `onUnmounted`. (`incident:3A-3I`, `kb:subscription-cleanup`.)

Canonical pattern:
```ts
import { onMounted, onUnmounted, inject } from 'vue'
import { WIPPY_INSTANCE } from '../constants'

const instance = inject(WIPPY_INSTANCE)!

let unsub: (() => void) | null = null
onMounted(() => {
  unsub = instance.on('keeper.task', () => load())
})
onUnmounted(() => {
  unsub?.()
})
```

For multiple subscriptions:
```ts
let unsubs: Array<() => void> = []
onMounted(() => {
  unsubs.push(instance.on('keeper.session:message', onMessage))
  unsubs.push(instance.on('keeper.session:status',  onStatus))
})
onUnmounted(() => {
  unsubs.forEach(u => u?.())
  unsubs = []
})
```

Anti-patterns (REJECT):
- `instance.on(...)` at module top-level (outside `onMounted`) — leaks for app lifetime (`incident:3A`).
- `instance.on(...)` with return value discarded — silent leak (`incident:3B-3G`).
- `instance.off(...)` — that method does NOT exist; `// @ts-ignore` won't save you (`incident:3D`).
- Loop-creating subscriptions without storing all unsubs (`incident:3C`).
- `window.addEventListener('message', ...)` without matching `removeEventListener` in `onUnmounted` (`incident:3I`).
- Raw `new EventSource(...)` — bypasses host auth bridge; use `instance.on(...)` for an equivalent server-side topic (`incident:3J`).

---

## 4. Web components — manifest, build, runtime

<details>
<summary><b>Additional guide for AI</b> — click to expand</summary>

- **Phase:** P1 Structural → P2 Build & types → P4 Cross-cutting (theme compat, host-less harness). See Appendix D.
- **Audit method:** jq + grep on the library-mode `vite.config.ts` and `index.ts`; build into `dist/`; load via the host-less harness (§9) and confirm the custom tag registers. Use §10 recipes verbatim.
- **Swarm split:** 3 sub-agents — (4.1+4.2 build config), (4.3+4.6 entry + tsconfig), (4.4+4.5+4.8 theme compat + styles + persistence). Moderator consolidates against §11 WC rules.
- **Cite findings as:** `path:line`; moderator keys violations to §11 web-component REJECT rules.

</details>

### 4.1 `package.json`

Reference: `gold:app-template/frontend/web-components/mermaid/package.json`.

```json
{
  "name": "@example/mermaid",
  "version": "1.0.0",
  "specification": "wippy-component-1.0",
  "title": "Mermaid Diagram",
  "description": "...",
  "browser": "dist/index.js",
  "files": ["dist/", "src/", "package.json"],
  "dependencies": {
    "@wippy-fe/theme": "^0.0.28",
    "@wippy-fe/webcomponent-core": "^0.0.28",
    "@wippy-fe/webcomponent-vue": "^0.0.28",
    "mermaid": "^11"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "@wippy-fe/proxy": "^0.0.28",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vue": "^3.5.0",
    "vue-tsc": "^2.0.0"
  },
  "peerDependencies": {
    "@wippy-fe/proxy": "^0.0.28",
    "vue": "^3.5.0"
  },
  "wippy": {
    "tagName": "example-mermaid",
    "type": "widget",
    "description": "...",
    "props": {
      "type": "object",
      "properties": {
        "definition": { "type": "string", "default": "", "description": "..." },
        "transparent": { "type": "boolean", "default": true, "description": "..." }
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

**Specification & metadata**:
- MUST `"specification": "wippy-component-1.0"`.
- MUST `name` follow `@<org>/<short>` (e.g. `@example/mermaid`).
- MUST set top-level `"title"` and `"description"`.
- MUST set `"browser": "dist/index.js"` pointing at the built entry.
- MUST list `dist/`, `src/`, `package.json` in `files` (so `npm pack` ships the right bits).

**`wippy` block (WC-specific)**:
- MUST `wippy.type: "widget"` (NOT `"page"` or `"web-component"`). The YAML registry uses `view.component`; package.json uses `widget`. Both refer to the same kind.
- MUST `wippy.tagName` (camelCase) — the custom element tag. Must contain a hyphen. Project conventions vary (`example-`, `dam-`, `wippy-`). The YAML uses `tag_name` (snake_case) with the same value.
- MUST `wippy.description` — a **verbose AI/human-readable usage explanation** (not a one-line label). Must explain HOW to use the WC: the expected call shape (which props vs children), supported input forms, fallback paths, notable perf characteristics. The `gold:mermaid/package.json:40` description ("Renders Mermaid diagrams. Pass the Mermaid source in props.definition; never inline as text content. All diagram types are supported. Flowchart, sequence, class, ER, state, and xychart render fast … Pie, gantt, mindmap … fall back to a heavier renderer that loads on first use …") is the canonical shape. Top-level `description` in package.json SHOULD mirror this for npm/pack consumers. Mirror the same string into YAML `meta.description` (§2.2).
- MUST `wippy.props` JSON Schema. Every property MUST have `type`, `default`, `description`.
- MAY `wippy.events` JSON Schema (omit if no custom events).
- MUST NOT have `wippy.path` (no HTML entry).
- MUST NOT have `wippy.icon` (no nav presence).
- MUST NOT have `wippy.proxy` block (WCs run in host doc, not iframe).
- MUST set `wippy.scripts.build`. MAY set `debug` and `test`.

**Dependency hygiene**:
- `dependencies`: bundled-into-WC packages. Canonical: `@wippy-fe/theme`, `@wippy-fe/webcomponent-core`, `@wippy-fe/webcomponent-vue`. Plus the WC's domain libs (e.g. `mermaid`, `chart.js`).
- `devDependencies`: build toolchain. Canonical: `vite`, `@vitejs/plugin-vue`, `typescript`, `vue-tsc`, `vue` for build-time, `eslint*`, `@wippy-fe/proxy` (build-time type imports).
- `peerDependencies`: only what the host's import map provides at runtime. Canonical minimum: `@wippy-fe/proxy`, `vue`. Add `pinia` and `@iconify/vue` if used.

### 4.2 `vite.config.ts` (web component, library mode)

Reference: `gold:mermaid/vite.config.ts`.

```ts
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'esnext',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MermaidDiagram',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/index.ts') },
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
      // No constraint on entry signatures — entry chunk can absorb its
      // dependencies instead of being split into a facade + sub-chunk.
      // This matters because `src/index.ts` calls `define(import.meta.url, …)`;
      // if that statement is moved into a sub-chunk, `import.meta.url` resolves
      // to the sub-chunk URL, which lacks the `?declare-tag=` query the autoload
      // script appends to the entry — registration silently no-ops.
      preserveEntrySignatures: false,
    },
    sourcemap: true,
  },
})
```

Rules:
- MUST set `build.target: 'esnext'`.
- MUST use `build.lib` library mode with `formats: ['es']` (ESM only).
- MUST set `entry` (and `input.index`) to your `src/index.ts`.
- MUST set `preserveEntrySignatures: false` — required so the `define(import.meta.url, ...)` call lives in the entry chunk (so the `?declare-tag=` query the host autoload script appends actually reaches `import.meta.url`).
- MUST set entry/chunk/asset file names: `[name].js`, `[name]-[hash].js`, `[name]-[hash][extname]`.
- MUST externalize what the host provides: `vue`, `pinia`, `@iconify/vue`, `@wippy-fe/proxy`. Add only what your WC actually imports.
- MUST **bundle** (NOT externalize) `@wippy-fe/theme`, `@wippy-fe/webcomponent-core`, `@wippy-fe/webcomponent-vue`, `@wippy-fe/pinia-persist` (if used), and your domain libs (`mermaid`, etc.).
- DO NOT set `base` (no HTML entry, base is irrelevant).
- DO NOT set `cssCodeSplit` (CSS is `?inline`-imported into the JS, see §4.3).

### 4.3 `src/index.ts` (entry)

Reference: `gold:mermaid/src/index.ts`.

```ts
import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import type { ComponentProps } from './types.ts'
import type { Events } from './constants.ts'
import MermaidDiagram from './app/mermaid-diagram.vue'
import stylesText from './styles.css?inline'
import pkg from '../package.json'

class MermaidElement extends WippyVueElement<ComponentProps, Events> {
  static get wippyConfig(): WippyElementConfig<ComponentProps> {
    return {
      propsSchema: pkg.wippy.props as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
      contentTemplate: 'text/vnd.mermaid',  // optional; for WCs that consume <text> children
    }
  }

  static get vueConfig() {
    return {
      rootComponent: MermaidDiagram,
    }
  }
}

export async function webComponent() {
  return MermaidElement
}

define(import.meta.url, MermaidElement)
```

Rules:
- MUST extend `WippyVueElement<ComponentProps, Events>` (Vue) or `WippyElement` (vanilla).
- MUST implement `static get wippyConfig()` returning:
  - `propsSchema: pkg.wippy.props as WippyPropsSchema` — single source of truth from package.json.
  - `hostCssKeys: [...]` — which host-provided CSS bundles to inject into the shadow root. Use the const names from `@wippy-fe/webcomponent-core`: `themeConfigUrl` (theme tokens), `iframeCssUrl` (layout), `primeVueCssUrl` (PrimeVue components), `markdownCssUrl` (markdown), `preflightCssUrl` (resets). Pick the minimal set you need.
  - `inlineCss: stylesText` — your WC-specific CSS imported via `?inline`.
  - `contentTemplate?: 'text/vnd.foo'` — optional MIME type for WCs that consume `<text>` children (rare).
- MUST implement `static get vueConfig()` returning `{ rootComponent }`. Add `plugins: [PrimeVuePlugin, ...]` if you use PrimeVue components.
- MUST export async `webComponent()` factory function so the host loader can call it.
- MUST `define(import.meta.url, ElementClass)` at module level.

### 4.4 Theme compatibility

- WC root element MUST NOT have padding or margin (`docs:component-guide.md:702`). Host controls outer spacing.
- WC MUST use semantic CSS vars for theme-dependent colors: `--p-text-color`, `--p-content-background`, `--p-content-border-color`, `--p-text-muted-color`, `--p-content-hover-background`, `--p-primary-color`.
- WC MUST NOT use raw `--p-surface-N` for theme-dependent purposes — that scale is fixed.
- For derived shades, use `color-mix(in srgb, var(--semantic) X%, transparent)`.
- For severity colors, use `--p-danger-*`, `--p-success-*`, `--p-warn-*`, `--p-info-*`, `--p-help-*`, `--p-accent-*` — never raw Tailwind color names.

### 4.5 `src/styles.css`

```css
@import "@wippy-fe/theme/theme-config.css";

.my-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
```

The `?inline` import in `index.ts` reads this file as a string and bakes it into the bundle. Combined with `hostCssKeys`, the shadow root gets host CSS + your WC-specific CSS.

### 4.6 `src/constants.ts` (events typing)

Reference: `gold:mermaid/src/constants.ts`.

```ts
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

Use `useComponentProps()` and `useComponentEvents()` in your Vue components instead of plain `defineProps` / `defineEmits` — they integrate with the WC's prop/event marshalling.

### 4.7 `tsconfig.json` (WC variant)

Reference: `gold:mermaid/tsconfig.json`.

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

Differences vs page apps:
- `types` uses `@wippy-fe/proxy` (not `@wippy-fe/types-global-proxy`).
- Adds `useDefineForClassFields`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `allowImportingTsExtensions`.
- `references` to a `tsconfig.node.json`.

### 4.8 Runtime caching / state persistence

For state that must survive WC unmount or iframe destruction, use `@wippy-fe/pinia-persist`:
- `persist-key` prop values MUST be globally unique across the app.
- `@wippy-fe/pinia-persist` MUST be **bundled** into the WC (NOT external).

---

## 5. Theming

<details>
<summary><b>Additional guide for AI</b> — click to expand</summary>

- **Phase:** P4 Cross-cutting (mostly; §5.1.2 placement rules are P1 Structural). See Appendix D.
- **Audit method:** read §5.0 escalation levels first to scope the audit; grep for `@light` / `@dark` / `--p-*` vars and any `:root` selectors in app `.css` files; Playwright dark-mode flip to verify §5.4 parity.
- **Swarm split:** 3 sub-agents — (5.1+5.2 facade-first + var taxonomy), (5.3+5.4 REPLACE/MERGE + @light/@dark), (5.5+5.6 scoping + iconify discipline). Moderator consolidates against §11 theming rules.
- **Cite findings as:** `path:line`; moderator keys violations to §11 theming REJECT rules.

</details>

### 5.0 Visual-matching escalation (HEAVILY recommended)

To match a visual design, escalate in this strict order. Do not skip ahead — most "I want it to look like X" work fits at level 1 or 2.

| Level | What | Where |
|---|---|---|
| **1 — CSS variables** | Override existing `--p-*` semantic vars (primary/content/text/severity) and override the surface scale if the brand needs a different neutral palette. Use Playwright + DevTools `getComputedStyle(document.documentElement)` to enumerate every `--p-*` already defined; pick from that menu first. | YAML `customization.cssVariables` — facade global, or per-iframe `config_overrides` for isolation. NEVER `:root` in `.css` files. |
| **2 — `customCSS` for PrimeVue components** | Add design-token overrides (`--p-button-border-radius`, `--p-dialog-shadow`, etc.) and selector tweaks (`.p-button.p-button-xs { … }`, `.p-accordionheader::before { … }`) when level 1 vars don't reach. | YAML `customization.customCSS` (or `package.json` `wippy.configOverrides.customization.customCSS` mirror). NEVER raw `.p-*` rules in `.css` files. |
| **3 — Custom Vue components** | Build your own component. Reserved for things PrimeVue genuinely doesn't offer: novel visualizations (force graph, custom chart), domain-specific layouts, interactions outside PrimeVue's catalog. | Vue source in your app. |

**REJECT level-3 work that could have been done at level 1 or 2.** Examples of "should have been level 1/2":
- Custom dropdown when `<Select>` exists.
- Custom modal when `<Dialog>` + `useDialog` exists.
- Custom toast when `<Toast>` + `useToast` exists (or `host.toast()`).
- Custom confirm prompt when `<ConfirmDialog>` + `useConfirm` exists (or `host.confirm()`).
- Custom tooltip when the `v-tooltip` directive exists.
- Custom inline button styled to look like a primary button when a styled `<Button>` exists.

Examples where level 3 IS legitimate:
- Force graph for dataflow visualization (no PrimeVue equivalent).
- Token-bar charts (Chart.js wrapper).
- Markdown/rich-text renderers (markdown-it / shiki wrappers).
- Code editor (Monaco WC).
- Domain-specific shell components in managed-layout panels.

### 5.1 Facade-first: the main way to theme a Wippy app

`docs:theming.md`, `kb:theming-workflow`.

A Wippy module composes itself from `ns.dependency` entries. **One of those is `wippy/facade`** — the dependency that parameterises the host shell (top bar, nav, login page, layout) and ALL the global theming. The facade is where the main customization lives.

**Set theming on the facade dependency, not on individual pages.** Parameters of interest:

| `wippy/facade` parameter | Purpose |
|---|---|
| `app_title`, `app_name`, `app_icon` | brand identity |
| `custom_css` | global CSS injected into the host (and inherited by child iframes via `customCSS` injection). Where 95%+ of your styling lives. |
| `css_variables` | JSON map of CSS variable overrides (`--p-primary`, `--p-surface-*`, brand-specific `--k-*` tokens, etc.) applied at host root. |
| `host_custom_css` | host-shell-only CSS (not inherited by child iframes — scoped to `.wippy-host-app`). |
| `hide_nav_bar`, `show_admin`, `history_mode`, `session_type`, `login_path` | UX shell behaviour |
| `fe_mode`, `host_config_layout` | managed-layout mode + layout declaration |

**Two real-world references:**

- **HEAVY customization** — `C:/Projects/drewaltizer-wippy/src/drewapp/deps/_index.yaml:135-476`. The facade `ns.dependency` carries hundreds of lines of `custom_css` (PrimeVue button variants, badge tints, accordion animations, EXIF list styling, dark-mode overrides) and a JSON `css_variables` blob covering the full primary/surface/severity palette plus brand-specific `--k-*` tokens. **All of it lives on the facade dependency**, not in any page's `config_overrides` and not in any FE app's `styles.css`.
- **LIGHT customization** — `C:/Projects/app-template/src/app/deps/_index.yaml:145-246`. The facade has minimal `custom_css` (Poppins font import) + a one-key `css_variables` (`--p-primary: #6366f1`) + a small `host_custom_css` rule. The whole module's theme fits in ~10 lines because it leans on host defaults.

**Demo of `config_overrides` (isolation override)** — `C:/Projects/app-template/src/app/views/_index.yaml:72-122`. The `iframe-demo-themed` entry retheams a SINGLE page with a custom pastel palette + Quicksand font, demonstrating per-page isolation. Other pages of the same FE bundle inherit the facade theme unchanged.

### 5.1.1 Three levels of override (priority, low → high)

> See [theming.md § The CUSTOMIZER waterfall](theming.md#the-customizer-waterfall--three-levels-of-theming) for examples, escalation criteria, and anti-patterns.

1. **Facade global** — set in the host's `wippy/facade` `ns.dependency` parameters. Affects the whole user shell + every page inheriting from the facade. **This is where 95%+ of theming should live.**
2. **Page configOverrides** — YAML registry entry's `meta.config_overrides` (canonical) AND/OR `package.json` `wippy.configOverrides` (host-less mirror). For `cssVariables`/`customCSS` this is **isolation-only** (see §2.3). For `icons`/`iconSets` it is the canonical additive registration path (merge semantics — see §5.3 + §5.6).
3. **Runtime overlay** — `window.__WIPPY_CONFIG_OVERRIDES__` set BEFORE proxy.js loads. Rare; for query-string or feature-flag theming.

### 5.1.2 Where each override lives — **STRICT placement rule**

Mismatched placement is the #1 source of theme drift. The rule:

| Override target | Where it goes | Where it MUST NOT go |
|---|---|---|
| Existing host var (`--p-*`) — change its value | YAML or `package.json` `customization.cssVariables` (facade global, or `config_overrides` for isolation) | NEVER `:root { --p-* }` in `src/styles.css` |
| New derived var your project owns — needed for project use | Same place as above; compute via `color-mix()` or `var()` referencing host vars | NEVER `:root { --my-* }` in `src/styles.css` |
| HOST-owned selector override (`.p-button`, `.p-dialog`, `.p-inputtext`, etc.) | `customization.customCSS` (YAML or package.json) | NEVER raw `.p-*` rules in `src/styles.css` |
| Project-internal class override (`.keeper-nav-btn`, `.search-wrap`) | `src/styles.css` (or `customization.customCSS` if it must reach the host shell) | n/a |
| Project-scoped non-theme constant (chart bar color, fixed spacing tag) | `src/styles.css` with a clear project prefix (e.g., `--keeper-chart-bar-*`) | n/a |

**Rationale**: theme is a host concern; the host's CSS pipeline composes facade global + per-page customization in a defined order. CSS files inside the bundle ship AFTER the host's pipeline and shadow it, breaking the override semantics. Keep host-touching styling in YAML/JSON customization — keep your bundle's `.css` for things you alone own.

**REJECT 42b**: any `:root { --p-* }` (or `:root { --<other-host-var> }`) redefinition in a child app's `.css` file. This sits alongside REJECT 42 (which already covers a few specific tokens); 42b extends to ALL host-owned vars, regardless of which one.

**REJECT 43a**: any raw `.p-<component>` rule in a child app's `.css` file. Move to `customization.customCSS`.

### 5.2 Semantic vs fixed CSS variables

| Variable | Flips in dark mode? | Use for |
|---|---|---|
| `--p-text-color` | yes | body text |
| `--p-content-background` | yes | container / page background |
| `--p-content-border-color` | yes | borders |
| `--p-text-muted-color` | yes | secondary text |
| `--p-content-hover-background` | yes | hover states |
| `--p-primary-color` | yes | primary action color |
| `--p-surface-0` … `--p-surface-950` | NO (fixed scale) | only as anchors for color-mix(); avoid for theme-dependent UI |
| `--p-primary-500` … `--p-primary-950` | NO (fixed scale) | only when you need a specific primary shade |
| `--p-danger-color`, `--p-success-color`, `--p-warn-color`, `--p-info-color`, `--p-help-color`, `--p-accent-color` | yes | severity colors. Use these, NOT raw Tailwind names. |

Anti-pattern (REJECT):
```css
.card { background: var(--p-surface-100); }   /* fixed; doesn't flip */
.card { background: var(--p-primary); }       /* invalid token; --p-primary-color is the right one */
```

Canonical:
```css
.card {
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  color: var(--p-text-color);
}
.muted-card {
  background: color-mix(in srgb, var(--p-content-background) 92%, var(--p-text-color) 8%);
}
.danger-banner { background: var(--p-danger-color); }
```

### 5.3 REPLACE vs MERGE per field

`host:src/shared/app-config/migration.ts:216-236` (mergeChildCustomization):

| Field in `customization` | Per-page semantics |
|---|---|
| `cssVariables` | REPLACE — your map fully replaces parent's |
| `customCSS` | REPLACE — your string fully replaces parent's |
| `icons` | MERGE shallow — additive |
| `iconSets` | MERGE per-prefix — additive |

`AppConfigOverrides` top-level:

| Field | Semantics |
|---|---|
| `customization` | merged via `mergeChildCustomization` (above) |
| `axiosDefaults` | MERGE shallow |
| `routePrefix` | REPLACE |
| `apiRoutes` | REPLACE |

### 5.4 `@light` / `@dark` blocks

The host SUPPORTS `@light` and `@dark` keys in `cssVariables` maps — `host:src/shared/app-config/migration.ts` compiles them to `@media (prefers-color-scheme: light/dark)` rules and `[data-theme]` overrides at injection time. (Verified live in keeper-v5: the `@light` block in keeper:main `config_overrides.customization.cssVariables` produces working light-mode tokens.)

Note on KB drift: `kb:theming-workflow` says "no separate @light/@dark author syntax" — that entry is **stale**. Trust the host code path.

Example:
```yaml
cssVariables:
  --p-primary-color: var(--p-primary-500)
  --kp-bg: var(--p-content-background)
  '@light':
    --p-content-background: '#ffffff'
    --p-text-color: '#18181b'
  '@dark':
    --p-content-background: '#1c1a19'
    --p-text-color: '#fafafa'
```

### 5.5 `customCSS` scoping

- For host-wide `customCSS`, rules MUST be scoped to `.wippy-host-app` (or your specific page selector) so they don't leak into child iframes.
- For per-page overrides, the host already scopes them; you can write top-level selectors.

### 5.6 Iconify discipline

Icons in Wippy apps follow a single workflow:

1. **Use `@iconify/vue` `<Icon>` for ALL icons.** Don't inline `<svg>` for reusable iconography. Don't ship icon-font CSS (Tabler-icons-font, Material Icons font). The proxy and the build assume Iconify; mixing systems creates a/b drift.
2. **Prefer permissive packs.** All free for commercial use, all available via Iconify:
   - `tabler` (MIT, ~5,400 icons) — broad UI coverage; the gold-standard default for keeper-class apps.
   - `lucide` (ISC, ~1,500 icons) — clean line style.
   - `phosphor` (MIT, ~7,000 icons) — six weight variants.
   - `material-symbols` (Apache 2.0, ~3,000+ icons) — Google's modern set.
   - `mdi` (Apache 2.0, ~7,000 icons) — Material Design Icons community pack.
   - `heroicons` (MIT, ~300 icons) — Tailwind team's set, outline + solid.
3. **Don't use commercial-licensed packs** (FontAwesome Pro, etc.) without licence verification per developer seat. Iconify hosts MIT/CC-BY subsets of FontAwesome (`fa6-solid`/`fa6-regular`/`fa6-brands`) — use those instead.
4. **Custom icons** — when no permissive pack covers a symbol:
   - Declare them in AppConfig `customization.icons` (facade global if shared across modules; `config_overrides.customization.icons` for per-page additions — safe because `icons` MERGES, not replaces, see §5.3).
   - The bootstrap path (`config.customization?.icons → addCollection({ prefix: 'custom', icons })` in `app.ts`) wires them automatically.
   - **NEVER call `addCollection()` from arbitrary application code.** The bootstrap path is canonical; everything else fragments the registry.
   - Mint custom icons sparingly. If you find yourself adding more than a dozen, consider whether a permissive pack (mdi/phosphor) already has the symbol.
5. **At call sites**, prefer `<Icon icon="tabler:home" />` over hardcoded SVG. Use Iconify's pack:name format consistently.

REJECT (5.6.r): any `.vue` file that registers icons via `addCollection()` outside `app.ts`'s canonical bootstrap. REJECT raw `<svg>` for reusable iconography (one-off illustrations are OK).

---

## 6. Proxy API & subscriptions

### 6.1 Injection keys (apps)

In `src/constants.ts` (page apps):

| Key | Provides | Use |
|---|---|---|
| `HOST_API` | `HostApi` | `inject(HOST_API)` |
| `WIPPY_INSTANCE` | `ProxyApiInstance` | `inject(WIPPY_INSTANCE)` |
| `AXIOS_INSTANCE` | pre-configured `axios` (auth + baseURL) | `inject(AXIOS_INSTANCE)` |

For web components, import from `@wippy-fe/proxy` directly:
```ts
import { host, api, on } from '@wippy-fe/proxy'
```

### 6.2 `host.*` methods (full reference: Appendix B)

| Method | Use |
|---|---|
| `host.toast` | replaces PrimeVue ToastService |
| `host.confirm` | replaces `window.confirm` |
| `host.startChat` | open a new chat |
| `host.openSession` | navigate to session |
| `host.openArtifact` | open artifact |
| `host.setContext` | set chat context |
| `host.navigate` | host-side navigation |
| `host.onRouteChanged` | report router change |
| `host.handleError` | report error |
| `host.formatUrl` | prepend `routePrefix` |
| `host.classifyLink` | classify nav target |
| `host.layout` | managed-layout API (null outside managed mode) |
| `host.logout` | sign out |

Rules:
- MUST use `host.toast` not PrimeVue ToastService.
- MUST use `host.confirm` not `window.confirm`.
- MUST use injected `useApi()` / `AXIOS_INSTANCE` not raw `axios.create()`.
- MUST NOT call `sendIframeMessage()` directly — go through `host.*` methods.

**VERIFY**:
```bash
grep -r "axios.create" src/    # should = 0
grep -r "window.confirm" src/  # should = 0
```

### 6.3 `instance.on(pattern, cb)` reserved patterns

| Pattern | Payload | Meaning |
|---|---|---|
| `@history` | `{ path?, navId? }` | host pushed a route |
| `@visibility` | boolean | iframe visibility changed |
| `@layout-change` | `LayoutSnapshot` | layout tree changed |
| `@layout-panel-changed` | `{ panelId, ... }` | single panel changed |
| `@layout-breakpoint` | `{ breakpoint }` | breakpoint changed |
| `@message` | wildcard | catch all WebSocket messages |
| `@state-error` | `{ error, key }` | state save failed |

Custom topics use colon-separated parts; `*` is wildcard.

### 6.4 Layout API

`host.layout` returns `null` outside managed-layout host. Always null-check before use. (Full reference: `host:src/proxy/shared/layout.ts:35-130`.)

---

## 7. Router & host integration

(Source body in §3.5; this section is verification-focused.)

| # | Rule | REJECT? |
|---|---|---|
| 7-1 | `createMemoryHistory()` (no arg) | yes |
| 7-2 | `history.replace(initialPath)` BEFORE `createRouter` | yes |
| 7-3 | `router.afterEach(to => host.onRouteChanged(to.fullPath, navId?))` | yes |
| 7-4 | `on('@history', ...)` listener with null guard | yes |
| 7-5 | catch-all `/:pathMatch(.*)*` route with `name: 'not-found'` | yes |
| 7-6 | initial path = `config.context?.route ?? config.path ?? '/'`, normalized | yes |
| 7-7 | leading-slash normalization in `@history` handler | yes |
| 7-8 | echo-loop suppression via `navId` token | should |
| 7-9 | `setLocalRouter(...)` registration for link classifier | should |

If you persist last-route to localStorage, EXCLUDE ID-bearing routes (`/session/:id`, `/changes/:id`, etc.) — reload-after-delete lands on stale 404s otherwise (`incident:2H`).

`window.addEventListener('message', ...)` for cross-iframe messaging: MUST add `if (event.source !== window.parent) return` origin check and `removeEventListener` in `onUnmounted`.

---

## 8. Build pipeline & Makefile

### 8.1 Canonical Makefile recipe

```make
build-<app>-frontend:
	cd <path-to-app> && npm install --no-audit --no-fund --prefer-offline && npm run build -- --outDir <dest> --emptyOutDir
```

Rules:
- MUST use `npm run build -- --outDir <abs-or-relative> --emptyOutDir`.
- MUST NOT use the `rm + mkdir + cp` dance — pollutes source tree with `dist/` and is not atomic.
- MUST `cd` into the app dir.
- Output dir MUST be relative to `static/<embed-name>` (or wherever the wippy.yaml `embed:` paths expect).

Each module that publishes a frontend MUST have its own `build-<app>-frontend` target. Add to `publish-*` chains.

### 8.2 `make.bat` + `make.ps1` are required (every module, every time)

Every module that ships a `Makefile` MUST also ship `make.bat` + `make.ps1` next to it. **No "if your team runs on Windows" carve-out** — Wippy modules are written by mixed teams and audited on mixed machines, and the wrapper is small enough that there is no reason not to have it.

- `make.bat` is a thin shim that invokes `make.ps1` via `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass`.
- `make.ps1` mirrors every Makefile target one-for-one — `build-*`, `lint*`, `publish*`, `dev`, `clean`, etc. — so the same workflow runs on Linux, macOS, and Windows.
- Keep `make.ps1` pure ASCII (no em-dashes, smart quotes) — Windows PowerShell 5.1 reads BOM-less files as Windows-1252 and corrupts non-ASCII chars on read.

Reference: `gold:app-template/make.bat`, `gold:app-template/make.ps1`. The Makefile and the PS1 share their app/wc/lint lists as data tables, so adding a new build target is one line in each.

REJECT a module that ships `Makefile` without matching `make.bat` + `make.ps1`.

### 8.3 Externals + importmap + peerDeps three-way sync

Three lists must coexist:
- `vite.config.ts` `external:` array (what NOT to bundle)
- `app.html` `<script type="importmap">` keys (host-less resolution)
- `package.json` `peerDependencies` (npm install hint)

Rule: every package the app actually imports at runtime MUST be resolvable via the importmap (or by the host's runtime importmap, when running under a real host).

Mismatch symptom: `Failed to resolve module specifier 'pinia'` (`incident:8A`).

**VERIFY**:
```bash
grep -A 25 "external:" vite.config.ts | grep -oE "'[^']+'" | tr -d "'" | sort -u > /tmp/ext
node -e 'const fs=require("fs");const m=fs.readFileSync("app.html","utf8").match(/<script type="importmap">([\\s\\S]+?)<\/script>/);console.log(Object.keys(JSON.parse(m[1]).imports).join("\n"))' | sort -u > /tmp/imp
diff /tmp/ext /tmp/imp  # may show divergences (host's runtime importmap may add more); investigate each line
```

### 8.4 Pre-publish gates

- `npm run type-check` MUST exit 0. Both `vue-tsc --build --force` (gold standard) and `vue-tsc --noEmit` are acceptable.
- `npm test` MUST pass if any tests exist.
- `npm run build` MUST succeed.
- `npm run lint` SHOULD exit 0 if you have eslint configured.

---

## 9. Host-less mode

Host-less = boot the SPA via a static HTTP server with no real Wippy host running. `dev-proxy.js` provides a host shim plus a "dev overlay" UI for accepting/editing the config. Host-less mode is the **default supported workflow** for new apps; the `wippyPackagePlugin()` and importmap+`<wippy-loading>` patterns described below should be present unless a team has a very-good reason to opt out (rare). (`docs:host-less-mode.md`.)

### 9.1 Importmap (esm.sh)

```html
<script type="importmap">
{
  "imports": {
    "vue":          "https://esm.sh/vue@3",
    "pinia":        "https://esm.sh/pinia",
    "vue-router":   "https://esm.sh/vue-router@4",
    "luxon":        "https://esm.sh/luxon",
    "@iconify/vue": "https://esm.sh/@iconify/vue",
    "axios":        "https://esm.sh/axios"
  }
}
</script>
```

Rules:
- MUST exist in `app.html`.
- MUST cover every package the app imports at runtime.
- SHOULD use `esm.sh` URLs with major version pin (`@3`, `@4`).
- MUST NOT include `@wippy-fe/proxy` — the real host or dev-proxy injects it.

### 9.2 dev-proxy.js + `@wippy/scripts` data-role

```html
<script
  src="http://localhost:5173/dev-proxy.js"
  data-role="@wippy/scripts"
></script>
```

Production CDN form:
```html
<script
  src="https://web-host.wippy.ai/<release-tag>/dev-proxy.js"
  data-role="@wippy/scripts"
></script>
```

Rules:
- MUST have `data-role="@wippy/scripts"` so the host (when running) can find and replace it.
- MUST have `src=` set; raw `<script data-role="@wippy/scripts"></script>` placeholder is acceptable only when a real host injects the src at boot.

### 9.3 wippyPackagePlugin (default)

```ts
// vite.config.ts
import { wippyPackagePlugin } from '@wippy-fe/vite-plugin'

export default defineConfig({
  plugins: [vue(), wippyPackagePlugin(), /* … */],
  /* … */
})
```

The plugin's `transformIndexHtml` hook injects the package.json `wippy` block into the built HTML at the top of `<head>`:

```html
<script type="application/json" data-role="@wippy/package">
{
  "name": "...",
  "wippy": { "proxy": { "injections": { ... } }, "configOverrides": { ... } }
}
</script>
```

Dev-proxy reads the JSON synchronously at boot and seeds:
- proxy injection defaults from `wippy.proxy.injections`
- per-page customization from `wippy.configOverrides.customization`

so the dev-overlay shows the correct values pre-populated.

Rules:
- SHOULD include `wippyPackagePlugin()` in `vite.config.ts`. This is the **default** for new apps; opt out only with a very good reason (e.g. shipping a host-only bundle that explicitly does not support host-less dev), and document the reason in your project's CLAUDE.md. The plugin is harmless under a real host and provides dev-overlay seeding under host-less mode — opting out trades that away in exchange for nothing in most cases.
- MUST install `@wippy-fe/vite-plugin@^0.0.28` or later in devDependencies.
- The plugin is harmless under a real host (the host ignores the `@wippy/package` script tag).

**VERIFY** the script is in the built HTML:
```bash
npm run build && grep -c 'data-role="@wippy/package"' dist/app.html  # SHOULD = 1
```

### 9.4 wippy-loading

```html
<div id="app">
  <wippy-loading title="Loading..."></wippy-loading>
</div>
```

The `<wippy-loading>` element is auto-registered by dev-proxy (and by the real host) before the body parses.

REJECT custom hand-rolled spinners.

### 9.5 base: '' (relative paths) — REJECT if hardcoded

`base: ''` in vite.config produces relative `./app.js`, `./assets/...` paths in the built HTML/JS. The bundle is portable to any URL prefix and any mount point — host-managed, host-less dev, or moved between projects.

A hardcoded absolute base (e.g. `base: '/app/keeper/'`) ties the bundle to a specific mount point and breaks portability. **This is a 100% REJECT — there is no acceptable "documented exception".** A child app must not assume its own URL prefix; the prefix is a host-side `meta.url` + `meta.base_path` concern, and the host injects the appropriate `<base>` into the HTML at serve time. Set `base: ''` and let the host do its job.

### 9.6 Dev-overlay accept flow

- `<wippy-dev-overlay>` shadow-DOM web component, FAB in bottom-right.
- Manual mode blocks boot until "Accept config" clicked.
- Auto-accept via `localStorage['@wippy-dev/auto-accept'] === 'true'`.
- Stored config: `localStorage['@wippy-dev/config']`, `localStorage['@wippy-dev/proxy-config']`.
- Reset clears all `@wippy-dev/*` keys + reloads.

---

## 10. Verification recipes

Run these before submitting. Each maps to a section.

<details>
<summary><b>Additional guide for AI</b> — click to expand</summary>

- **Phase:** cross-phase — §10 is the **canonical source for verification commands**. Do not invent variants.
- **Audit method:** sub-agents MUST run §10 recipes **verbatim** before declaring PASS, and MUST include the captured output tail as evidence. Moderator MUST flag any command not present in §10.
- **Swarm split:** not applicable — §10 is consumed by sub-agents auditing other sections.
- **Cite findings as:** every PASS report includes the §10.x recipe number and the captured output tail. Anti-pattern: "PASS — looks fine" without the command output (D.7 #2).

</details>

### 10.1 Bootstrap & build

```bash
# 10.1.1 — wippy.specification + wippy.type
node -e 'const p=require("./package.json"); if(p.specification!=="wippy-component-1.0") throw new Error("bad specification"); const t=p.wippy?.type; if(t!=="page" && t!=="widget") throw new Error("bad wippy.type"); console.log("OK")'

# 10.1.2 — markdown injection if app uses markdown (page apps only)
grep -A 10 'wippy.proxy.injections.css' package.json | grep -c '"markdown": true'  # 1 if uses markdown, 0 otherwise

# 10.1.3 — base relative
grep -E "base:\\s*['\"]" vite.config.ts                # must show: base: ''

# 10.1.4 — wippyPackagePlugin present (host-less default)
grep -c "wippyPackagePlugin" vite.config.ts            # SHOULD = 1

# 10.1.5 — type-check
npx vue-tsc --build --force || npx vue-tsc --noEmit    # exit 0
```

### 10.2 Router & host integration (page apps)

```bash
# 10.2.1 — createMemoryHistory only
grep -c "createMemoryHistory" src/router/index.ts          # >= 1
grep -c "createWebHistory"    src/router/index.ts          # 0

# 10.2.2 — using @wippy-fe/router factory (canonical)
grep -c "from '@wippy-fe/router'" src/router/index.ts      # 1 if canonical

# 10.2.3 — afterEach calls onRouteChanged (if not using factory)
grep -A 10 "router.afterEach" src/router/index.ts | grep -c "host.onRouteChanged"  # >= 1 if hand-rolled

# 10.2.4 — @history listener
grep -c "@history" src/router/index.ts                     # >= 1

# 10.2.5 — catch-all + name
grep -E "pathMatch.*not-found|name:.*not-found" src/router/index.ts  # >= 1
```

### 10.3 Proxy API & subscription cleanup

```bash
# 10.3.1 — no module-scope instance.on
grep -n "^instance\\.on" src/**/*.{ts,vue}                 # should be empty

# 10.3.2 — every instance.on has matching onUnmounted in same file
for f in $(grep -rl "instance\\.on(" src --include="*.vue"); do
  o=$(grep -c "instance\\.on(" "$f"); u=$(grep -c "onUnmounted" "$f")
  [ "$o" -gt 0 ] && [ "$u" -eq 0 ] && echo "FAIL: $f"
done

# 10.3.3 — no instance.off
grep -r "instance\\.off" src                               # should be empty

# 10.3.4 — no raw axios.create
grep -r "axios.create" src                                 # should be empty

# 10.3.5 — no raw EventSource
grep -r "new EventSource" src                              # should be empty

# 10.3.6 — no window.confirm
grep -r "window\\.confirm" src                             # should be empty

# 10.3.7 — addEventListener pairs with removeEventListener
for f in $(grep -rl "addEventListener" src --include="*.vue"); do
  a=$(grep -c "addEventListener" "$f"); r=$(grep -c "removeEventListener" "$f")
  [ "$a" -ne "$r" ] && echo "FAIL: $f add=$a remove=$r"
done
```

### 10.4 Styling & theming

```bash
# 10.4.1 — no theme-dependent --p-surface-N use (informational; document exceptions)
grep -r "var(--p-surface-[0-9]" src/**/*.vue | wc -l       # aim for 0; project minimum acceptable

# 10.4.2 — no invalid --p-primary token
grep -rE "var\\(--p-primary\\)[^-]" src/**/*.vue | wc -l   # must = 0

# 10.4.3 — no module-level redefinition of host tokens
grep -rE ":root\\s*\\{[^}]*--p-(content-background|text-color|primary)" src/styles.css  # must = 0
```

### 10.5 Vue/TS hygiene

```bash
# 10.5.1 — every .vue starts with <script setup lang="ts">
find src -name "*.vue" | while read f; do
  grep -q '<script setup lang="ts">' "$f" || echo "FAIL: $f"
done

# 10.5.2 — count any-casts (informational; aim ≤ 50)
grep -rE ":\\s*any|as\\s*any" src | wc -l

# 10.5.3 — no console.log
grep -rE "console\\.log" src                               # should be empty
```

### 10.6 Host-less boot

```bash
npm run build

# checks on dist/app.html
grep -c 'data-role="@wippy/scripts"' dist/app.html         # must = 1
grep -c 'data-role="@wippy/package"' dist/app.html         # SHOULD = 1 (when wippyPackagePlugin enabled)
grep -c '<script type="importmap">' dist/app.html          # must = 1
grep -c '<wippy-loading' dist/app.html                     # must >= 1
grep 'src="\\./app.js"' dist/app.html                      # match (relative path)

# live boot test: serve gen-2-chat dev server (:5173/dev-proxy.js) + dist/ via http-server.
# Browser: see <wippy-loading>, then dev-overlay FAB → Accept → app boots.
```

### 10.7 Browser-emulator dark/light + contrast check (recommended)

Static checks catch token misuse but not actual rendering. Before shipping any non-trivial visual change, **verify the app in a browser emulator (Playwright or equivalent) under both dark and light theme**, and check contrast on both.

Recommended Playwright recipe:

```js
// dark + light snapshot pair
for (const scheme of ['dark', 'light']) {
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('http://localhost:<port>/<route>')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `.local/snap-${scheme}.png`, fullPage: true })
}

// contrast smoke — flag any element with computed text vs background
// contrast ratio < 4.5 (WCAG AA body) or < 3 (WCAG AA large text).
// Use `axe-core`, `@axe-core/playwright`, or `pa11y` for a real audit.
```

Verify visually: text legibility on both schemes, no light-only assumptions (white-on-white panels), severity colours readable on both, hover/active states visible in both.

REJECT a page that renders correctly in dark mode but is broken in light mode (or vice versa). One-mode-only is not a valid Wippy app.

### 10.8 Final gates

```bash
npx vue-tsc --build --force && \
npm test --if-present -- --run && \
npm run build && \
grep -c 'data-role="@wippy/scripts"' dist/app.html && \
grep -c '<wippy-loading' dist/app.html && \
echo "ALL GATES PASS"
```

---

## 11. Acceptance criteria (REJECT rules)

REJECT a submission if any of the following are true.

### Manifest (§3.1, §4.1)
1. `package.json.specification` is not `"wippy-component-1.0"`.
2. `wippy.type` is not `"page"` (page apps) or `"widget"` (web components).
3. Page app: `wippy.path` does not point to the actual built artifact (e.g. `dist/app.html`).
4. WC: `wippy.tagName` is missing or does not contain a hyphen.
5. WC: `wippy.props` is missing OR has properties without `type`/`default`/`description`.
5a. WC: `wippy.description` is missing OR is a one-line label (e.g. just the tag's display name). It MUST be a verbose usage explanation an LLM can read to know how to call the tag — see §4.1 / §2.2 and `gold:mermaid/package.json:40`.
6. `peerDependencies` is missing `@wippy-fe/proxy` and `vue` (both kinds).
7. Page app: `peerDependencies` is missing `vue-router`, `axios`, or `@iconify/vue` if the app imports them.
8. WC: `dependencies` is missing `@wippy-fe/webcomponent-core` or `@wippy-fe/webcomponent-vue`.

### vite.config.ts (§3.2, §4.2)
9. Page app: `base` is not `''`. Hardcoded absolute base (e.g. `/app/keeper/`) is REJECT with no documented-exception escape hatch — see §9.5.
10. Page app: `build.rollupOptions.external` does not include `vue` and `@wippy-fe/proxy`.
11. WC: `build.lib` library mode is missing OR `formats: ['es']` is missing.
12. WC: `build.rollupOptions.preserveEntrySignatures` is not `false`.
13. WC: `@wippy-fe/proxy` is not in externals (must be external, never bundled).
14. WC: `@wippy-fe/theme`, `@wippy-fe/webcomponent-core`, `@wippy-fe/webcomponent-vue` are listed in externals (must be bundled, never external).

### tsconfig.json (§3.8, §4.7)
15. `strict` is not `true`.
16. `target` is older than `ES2020`.
17. Page app: `types` is missing `vite/client` or `@wippy-fe/types-global-proxy`.
18. WC: `types` is missing `vite/client` or `@wippy-fe/proxy`.
19. `vue-tsc` does not exit 0.

### app.html (§3.3)
20. No `<script data-role="@wippy/scripts">`.
21. No `<script type="importmap">` covering host-provided packages the app imports.
22. No `<div id="app">` mount.
23. No `<wippy-loading>` (uses custom spinner instead).

### Bootstrap (§3.4)
24. `app.ts` does not `await` `window.$W.config()`, `host()`, `api()`, `instance()`.
25. `app.ts` does not provide `HOST_API`, `AXIOS_INSTANCE`, `WIPPY_INSTANCE` injections.
26. `app.ts` resolves initial path from a non-canonical source (must be `config.context?.route ?? config.path ?? '/'`, with documented project-specific extensions).

### Router (§3.5, §7)
27. Uses `createWebHistory` or `createHashHistory` (must be `createMemoryHistory`).
28. Calls `history.replace(initialPath)` AFTER `createRouter` instead of before.
29. `router.afterEach` does not call `host.onRouteChanged(to.fullPath, navId?)`.
30. No `on('@history', ...)` listener.
31. No catch-all `/:pathMatch(.*)*` route OR catch-all has no `name`.
32. `@history` handler does not normalize leading slash on incoming paths.

### Proxy & subscriptions (§3.9, §6)
33. Any `instance.on(...)` at module scope (outside `onMounted`).
34. Any `instance.on(...)` whose return value is discarded.
35. Any `onUnmounted` block missing the matching unsubscribe call(s).
36. Any reference to `instance.off(...)` (the method does not exist).
37. Any `window.addEventListener('message', ...)` without matching `removeEventListener` in `onUnmounted`.
38. Any raw `new EventSource(...)`.
39. Any raw `axios.create(...)`.
40. Any `window.confirm(...)`.

### Styling (§3.7, §5, §4.4)
41. `html, body, #app` set non-zero padding/margin.
42. `styles.css` redefines `--p-content-background`, `--p-text-color`, `--p-content-border-color`, `--p-primary-color`, or `--p-surface-*` at module scope.
42b. ANY child-app `.css` file contains `:root { --p-* … }` or `:root { --<other-host-var> … }` redefinition (§5.1.2). Move to `customization.cssVariables` in YAML / `package.json`.
43. PrimeVue component tokens are restyled with `!important` in `styles.css`.
43a. ANY child-app `.css` file contains a raw `.p-<component>` (e.g. `.p-button`, `.p-dialog`, `.p-inputtext`) selector rule (§5.1.2). Move to `customization.customCSS`.
44. Any Vue file uses `var(--p-primary)` (invalid token; must be `--p-primary-color`).
45. Any Vue file uses raw Tailwind color names (`bg-red-*`, `bg-sky-*`, etc.) for semantic meaning.
46. Any hardcoded hex/rgb in Vue source for semantic colors (use `--p-danger-*` etc., or `color-mix()`).
46a. Page renders correctly in only one of `prefers-color-scheme: dark` / `light`. Verify in a browser emulator before claiming the page is shippable (§10.7).
46b. Custom Vue component reimplements something PrimeVue already ships (e.g. custom dropdown when `<Select>` exists, custom modal when `<Dialog>` exists, custom toast when `<Toast>` exists, custom confirm when `<ConfirmDialog>` exists). Use the PrimeVue component, possibly with §5.0 level-1 / level-2 customization. See §5.0 escalation rule.

### Iconography (§5.6)
46c. Reusable iconography uses raw `<svg>` instead of `<Icon>` from `@iconify/vue`.
46d. Custom icon collection registered via `addCollection()` outside the canonical `app.ts` bootstrap path.
46e. Icon font CSS (Tabler-icons-font, Material Icons font, FontAwesome CSS, etc.) shipped alongside Iconify.

### Vue/TS hygiene (§3.8)
47. `.vue` file does not use `<script setup lang="ts">`.
48. `defineProps` uses untyped object syntax instead of TS generic.
49. Production code contains `console.log`.

### Web components (§4)
50. WC root element has padding or margin.
51. WC does not extend `WippyVueElement` or `WippyElement`.
52. WC `static get wippyConfig()` is missing OR doesn't return `propsSchema`/`hostCssKeys`/`inlineCss`.
53. WC `static get vueConfig()` is missing OR doesn't return `rootComponent`.
54. WC entry does not call `define(import.meta.url, ElementClass)` at module level.
55. WC has `wippy.path` (page-only field) or `wippy.proxy` (page-only block).

### Build pipeline (§8)
55a. Module ships `Makefile` without matching `make.bat` + `make.ps1` wrappers (§8.2).

### Accessibility (§3.8)
56. Icon-only `<button>` lacks `aria-label`.
57. Clickable `<div @click>` lacks `role="button"` + `aria-label` + keyboard handler (should be `<button>`).

---

## 12. Known intentional deviations

When you knowingly diverge from canonical, document it in your project's CLAUDE.md. Real examples:

| Deviation | Reason | Acceptable? |
|---|---|---|
| Triple-source initial path (`config.context.route → parent window URL → localStorage`) | Full-page reload recovery on apps that reload outside the host's normal navigation | YES |
| `createPinia()` registered but no `defineStore` yet | Reserved for upcoming stores | BORDERLINE — clean up if no stores planned |
| No PrimeVue plugin in app | App uses raw HTML buttons + custom CSS | YES (intentional UI choice) |
| Custom `inlineCssPlugin` in vite.config | Single-file deployment | YES |
| Raw `localStorage.*` for ad-hoc persistence keys (e.g. `@<app>/last-route`, `@<app>/theme`) | Avoid pinia overhead for one or two keys | DISCOURAGED. Prefer the canonical stack: facade module owns theme; `@wippy-fe/router` factory owns route restoration; `@wippy-fe/pinia-persist` owns durable state. Raw `localStorage` should be a measured exception in a leaf component, not the default. Modules that inherit a facade and a real router should not need it at all. |
| Skip `wippyPackagePlugin()` | Want a very-good-reason: e.g. shipping a host-only bundle that explicitly does not support host-less dev | RARELY YES. Default is to include it. The plugin is harmless under a real host; opting out trades away dev-overlay support and packaging-block injection in exchange for nothing in most cases. Document the very-good reason in CLAUDE.md. |

---

## 13. Tooling gotchas

### 13.1 Wippy CLI port already in use (`:8080`, `:5173`)

Symptom: `EADDRINUSE` when starting `./wippy.exe run -c`.

Fix: override the gateway port via the `-o` flag. Examples:

```bash
# Pick a different port for the wippy gateway:
./wippy.exe run -c -o app:gateway:addr=:8086

# Combine multiple overrides — gateway port + facade fe_facade_url default:
./wippy.exe run -c -o app:gateway:addr=:9000 -o wippy.facade:fe_facade_url:default=http://localhost:5173
```

The `-o <module>:<entry>:<property>=<value>` form patches the registry entry's property at boot — no source edits required. For `wippy.yaml`-mapped properties, the path matches the registry coordinates. To set a *requirement default* (rather than overriding a configured value), use the `:default` suffix on the property name.

For Vite (`5173`), kill the existing process or choose a different port via `vite --port <n>`. On Windows, kill by PID with `powershell -NoProfile -c "Stop-Process -Id <pid> -Force"`.

### 13.2 Persistent `app.db`

Symptom: migration on first run succeeds, on second run fails with "table already exists".

Fix: delete `.wippy/app.db*` between fresh runs. For test harnesses, prefer `:memory:`.

### 13.3 npm ERESOLVE after `@wippy-fe/*` bump

Symptom: `npm install` fails with ERESOLVE after bumping `@wippy-fe/proxy` (e.g. 0.0.12 → 0.0.27).

Fix: delete `node_modules/` AND `package-lock.json`, then `npm install`.

### 13.4 Importmap drift

Symptom: `Failed to resolve module specifier 'pinia'`.

Fix: keep peerDependencies, vite externals, and importmap in sync. Verification recipe in §10.1 / §8.3.

---

## 14. Gold-standard validation report

The checklist's REJECT rules were validated against the two gold standards. Here's the per-rule result:

<details>
<summary><b>Additional guide for AI</b> — click to expand</summary>

- **Phase:** P4 Cross-cutting (gold-standard diff is a technique, not its own phase). See Appendix D.
- **Audit method:** diff the target module's structure against `gold:app-template/frontend/applications/main/` (page apps) **or** `gold:app-template/frontend/web-components/mermaid/` (web components). **Pin the gold standard by app type** — never compare a page app against the WC gold (Appendix D.7 anti-pattern #4).
- **Swarm split:** solo — one agent comparing one module against one gold standard.
- **Cite findings as:** `gold:path:line` vs. `target:path:line`; moderator surfaces structural diffs in the §11-keyed fix list.

</details>


### `app-template/frontend/applications/main/` — page-app gold standard

| Rule | Status | Notes |
|---|---|---|
| 1 (specification) | PASS | `wippy-component-1.0` |
| 2 (wippy.type) | PASS | `"page"` |
| 3 (wippy.path) | PASS | `dist/app.html` |
| 6 (peerDeps include @wippy-fe/proxy + vue) | PASS | both present |
| 7 (peerDeps include vue-router, axios, @iconify/vue) | PASS | all present |
| 9 (base: '') | PASS | `base: ''` in `vite.config.ts:15` |
| 10 (vite externals include vue + @wippy-fe/proxy) | PASS | both present |
| 15 (tsconfig strict) | PASS | `strict: true` |
| 16 (target ≥ ES2020) | PASS | `target: "ES2020"` (canonical floor) |
| 17 (types include vite/client + types-global-proxy) | PASS | both listed |
| 19 (vue-tsc exit 0) | not-run | (live check) |
| 20 (`@wippy/scripts` data-role) | PASS | present |
| 21 (importmap exists) | PASS | covers vue, pinia, vue-router, luxon, @iconify/vue, axios, @wippy-fe/markdown-iframe |
| 22 (`<div id="app">`) | PASS | present |
| 23 (`<wippy-loading>`) | PASS | present |
| 24 (await all 4 $W calls) | PASS | confirmed in `src/app.ts:16-19` |
| 25 (provide HOST_API/AXIOS/WIPPY) | PASS | confirmed |
| 26 (initial path resolution) | PASS | `config.context?.route \|\| config.path` then leading-slash normalize |
| 27-32 (router rules) | PASS via `@wippy-fe/router` factory | gold uses canonical factory |
| 41 (no padding/margin on html/body) | PASS | only `margin: 0; height: 100%` |
| 42 (no host token redefinition in styles.css) | PASS | 9-line boilerplate |
| 47 (`<script setup lang="ts">` everywhere) | PASS-by-convention | not exhaustively grepped |
| 48 (typed defineProps) | PASS-by-convention | |

**No REJECTs.** Gold standard passes the entire checklist.

**Note on §9.3 `wippyPackagePlugin()`**: gold standard predates this enhancement and does NOT yet include the plugin. New apps SHOULD include it (default for host-less mode support). When the gold standard is next refreshed, `wippyPackagePlugin()` should be added.

### `app-template/frontend/web-components/mermaid/` — WC gold standard

| Rule | Status | Notes |
|---|---|---|
| 1 (specification) | PASS | `wippy-component-1.0` |
| 2 (wippy.type) | PASS | `"widget"` |
| 4 (wippy.tagName has hyphen) | PASS | `example-mermaid` |
| 5 (wippy.props well-formed) | PASS | both props have type/default/description |
| 6 (peerDeps include @wippy-fe/proxy + vue) | PASS | both present |
| 8 (deps include @wippy-fe/webcomponent-core + -vue) | PASS | both present |
| 11 (build.lib + formats: ['es']) | PASS | confirmed |
| 12 (preserveEntrySignatures: false) | PASS | confirmed with comment explaining why |
| 13 (@wippy-fe/proxy in externals) | PASS | present |
| 14 (@wippy-fe/theme/-core/-vue NOT in externals) | PASS | none in externals (correctly bundled) |
| 15-18 (tsconfig + types) | PASS | uses `@wippy-fe/proxy` (correct for WCs) |
| 50 (no root padding/margin) | PASS-by-convention | `.mermaid-container` uses `width:100%; height:100%; box-sizing:border-box` |
| 51 (extends WippyVueElement) | PASS | `class MermaidElement extends WippyVueElement<ComponentProps, Events>` |
| 52 (wippyConfig static getter) | PASS | returns propsSchema/hostCssKeys/inlineCss/contentTemplate |
| 53 (vueConfig static getter) | PASS | returns rootComponent |
| 54 (define(import.meta.url, ...) at module level) | PASS | `define(import.meta.url, MermaidElement)` |
| 55 (no wippy.path or wippy.proxy) | PASS | neither present |

**No REJECTs.** Gold standard passes the entire checklist.

### Process notes

If this checklist's rules ever flag a gold standard as REJECT, the rule is wrong — not the gold standard. Update this doc; do NOT change the gold standard.

The two gold standards are intentionally minimal (small surface, deliberately written, regularly maintained). Use them as paste-ready templates.

---

## Appendix A — Window globals & DOM markers

Constants exported from `@wippy-fe/shared`:

| Constant | Value | Who writes | Who reads |
|---|---|---|---|
| `GLOBAL_CONFIG_VAR` | `__WIPPY_APP_CONFIG__` | host entry point | child app, dev-proxy |
| `GLOBAL_PROXY_CONFIG_VAR` | `__WIPPY_PROXY_CONFIG__` | host | dev-proxy boot |
| `GLOBAL_API_PROVIDER` | `__WIPPY_APP_API__` | host | child app |
| `GLOBAL_WEB_COMPONENT_CACHE` | `__WIPPY_WEB_COMPONENT_CACHE__` | wc loader | wc loader |
| `WIPPY_SCRIPTS_DATA_ROLE` | `@wippy/scripts` | author (in `app.html`) | host injects scripts adjacent to it |
| `WIPPY_PACKAGE_DATA_ROLE` | `@wippy/package` | `@wippy-fe/vite-plugin` (build time) | dev-proxy boot |

Authors should NEVER reference `window.__WIPPY_*` directly — always import from `@wippy-fe/shared` (constants) or use `@wippy-fe/proxy` API helpers.

---

## Appendix B — HostApi method signatures

```ts
interface HostApi {
  toast(opts: ToastMessageOptions): void
  confirm(opts: LimitedConfirmationOptions): Promise<boolean>
  startChat(token: string, opts?: { sidebar?: boolean }): void
  openSession(uuid: string, opts?: { sidebar?: boolean }): void
  openArtifact(uuid: string, opts?: { target: 'modal' | 'sidebar' }): void
  setContext(
    context: Record<string, unknown>,
    sessionUUID?: string,
    source?: { type: string; uuid: string; instanceUUID?: string },
  ): void
  navigate(url: string): void
  onRouteChanged(internalRoute: string, navId?: number): void
  handleError(code: 'auth-expired' | 'other', error: Record<string, unknown>): void
  formatUrl(relativeUrl: string): string
  classifyLink(href: string | null | undefined): LinkClassification
  layout: LayoutApi | null
  logout(): void
}
```

LayoutApi:

```ts
interface LayoutApi {
  readonly snapshot: LayoutSnapshot | null

  resizePanel(panelId: string, size: SizeValue): void
  collapsePanel(panelId: string): void
  expandPanel(panelId: string): void
  openDrawer(panelId: string): void
  closeDrawer(panelId: string): void
  toggleDrawer(panelId: string): void
  movePanel(panelId: string, target: PanelTarget): void
  removePanel(panelId: string): void
  updatePanel(panelId: string, def: Partial<HostPanelDef>): void
  openModal(id: string, def: HostModalDef): void
  closeModal(modalId: string): void
  addFloating(id: string, def: HostFloatingDef): void
  removeFloating(floatingId: string): void

  broadcast(channel: string, payload: unknown): void
  send(target: string, channel: string, payload: unknown): void
  on(channel: string, handler: (env: BroadcastEnvelope) => void): () => void
}
```

`host.layout` returns `null` outside managed-layout host. Always null-check before use.

---

## Appendix C — `ProxyConfig.injections` reference

```ts
interface ProxyConfig {
  enabled: boolean
  injections: {
    css: {
      fonts: boolean             // host fonts
      themeConfig: boolean       // semantic CSS vars
      iframe: boolean            // iframe layout/containment
      primevue: boolean          // PrimeVue component CSS
      markdown: boolean          // markdown typography
      customCss: boolean         // theming.global.customCSS
      customVariables: boolean   // theming.global.cssVariables → :root
    }
    tailwindConfig: boolean      // window.tailwind.config
    resizeObserver: boolean      // report iframe size
    preventLinkClicks: boolean   // intercept <a> clicks
    iconifyIcons: boolean        // register iconify-icon WC + icons
    refreshWhenVisible: boolean  // reload on @visibility(true)
    historyPolyfill: boolean     // history() stub (always installed)
    errorCapture: boolean        // unhandledrejection + onerror → host
  }
}
```

YAML registry-entry `proxy:` block uses snake_case for the same flags:
```yaml
proxy:
  enabled: true
  css:
    fonts: true
    theme_config: true
    iframe: true
    prime_vue: true
    custom_css: true
    custom_variables: true
  tailwind_config: true
  iconify_icons: true
```

CSS injections are applied in this order: `themeConfig → iframe → primevue → markdown → customVariables → customCss`. A MutationObserver pins the customCss `<style>` tag to the end of `<head>` to preserve precedence.

---

## Appendix D — AI Audit Playbook

<details>
<summary><b>For AI auditors</b> — click to expand the full playbook (humans may skip)</summary>

This appendix is the entry point for AI agents auditing a Wippy FE module against this checklist. It defines the phase order, when to spawn a sub-agent swarm vs. work solo, the moderator role with a required output schema, the tool mapping per phase, and the most common failure modes to avoid.

The rest of the checklist (sections §0–§14, Appendices A–C) is the source of truth for **what** to check. This appendix is the source of truth for **how** an AI runs the audit.

### D.1 When to use this appendix

Apply this playbook when:

- Auditing a fresh module before merging it.
- Reviewing a PR that touches FE files.
- Validating a gold-standard candidate against the existing gold (`gold:app-template/frontend/applications/main/` for pages, `gold:app-template/frontend/web-components/mermaid/` for WCs).
- Investigating a CI gate failure tied to this checklist.

**Read-only contract for sub-agents.** Sub-agents MUST NOT run state-changing commands — no `npm install`, no `vite build`, no browser commands that mutate disk or remote state. They run grep, jq, file reads, and parse what's already on disk. Only the moderator (or the orchestrating Claude session) runs builds and browser checks. This rule exists to prevent N parallel sub-agents from racing on the same `node_modules/` directory or competing for the same dev-server port.

### D.2 Phase taxonomy

| Phase | Name | What it checks | Tools | Depends on |
|---|---|---|---|---|
| **P1** | Structural | Manifest / YAML / tsconfig / vite shape — pure static analysis | Grep, jq, file reads | — |
| **P2** | Build & types | `npm install`, `vue-tsc --noEmit`, `vite build` | `bg-manager sync_run` | P1 PASS |
| **P3** | Runtime | Boot, navigation, dark/light, host-less mode, HTTP smoke | `bg-manager bg_run`, `mcp__playwright`, `curl` | P2 PASS |
| **P4** | Cross-cutting | Theming parity, proxy contract, subscription leaks, gold-standard diff | Grep + browser + diff | P1 PASS (runs parallel to P2/P3) |

**Stop-on-fail rule.** If P1 fails, do NOT run P2 or P3 — fix the structural issues first. P4 may run in parallel to P2/P3 once P1 passes, since P4 mostly does its own static analysis and only borrows the browser at the end.

**Why this order:** running P3 (boot) on a module that fails P1 (manifest) wastes minutes per failing module and produces noisy errors that obscure the real issue. The phase order mirrors the cost gradient (cheap → expensive).

### D.3 Swarm decision matrix

| Trigger | Action | Moderator? |
|---|---|---|
| 1 module, ≤2 small sections in scope | Solo agent, no moderator | — |
| 1 module, heavy section (§3, §4, or §5) | Use that section's swarm split (3–4 sub-agents — see callouts) | Yes |
| ≥3 modules to audit | One sub-agent per module + §-cut as above where heavy sections apply | Yes |
| Audit + remediate combined | Audit swarm → moderator → remediation tasks → re-audit swarm | Yes |

**Heavy-section cut lists (restated here so the moderator's prompt is self-contained):**

- **§3 (page apps) — 4 sub-agents:** (3.1+3.2 build config), (3.3+3.4 app.html + bootstrap), (3.5+3.6 router + constants), (3.7+3.9 styles + subscription cleanup).
- **§4 (web components) — 3 sub-agents:** (4.1+4.2 build config), (4.3+4.6 entry + tsconfig), (4.4+4.5+4.8 theme compat + styles + persistence).
- **§5 (theming) — 3 sub-agents:** (5.1+5.2 facade-first + var taxonomy), (5.3+5.4 REPLACE/MERGE + @light/@dark), (5.5+5.6 scoping + iconify).

This aligns with the global rule in the project's `CLAUDE.md`: *"for PRs touching 3+ files or multiple modules, spawn MANY INDEPENDENT agents to review in parallel — split by area/module and run concurrently."*

### D.4 Sub-agent role + prompt template

Sub-agents are **read-only**, **single-section**, **citation-required**. Paste this template and fill the placeholders:

```
You are auditing §{section} of fe-compliance-checklist.md against the
module at {module_path}. Optional reference: gold standard at
{gold_standard_path}.

Constraints:
- Read-only. Do NOT run npm install, vite build, or any browser command.
- Use the verification commands from §10 verbatim — do NOT invent variants.
- Cite every PASS/FAIL with path:line. Bare "looks fine" is not acceptable.
- Distinguish MUST from SHOULD/MAY — don't over-reject on SHOULD violations.
- Load only §{section} + Appendices A/B/C as needed. Don't load the full
  checklist — it doesn't fit your context budget and you don't need it.

Output a table with these columns:
  rule_id | severity | status | path:line | evidence

End with a one-line summary:
  "{N PASS, M FAIL, K SKIP — keys to §11 rules: [11.x, 11.y, ...]}"
```

Substitute `{section}`, `{module_path}`, `{gold_standard_path}` per the swarm split. Spawn each sub-agent with `subagent_type=Explore` (read-only, fast) unless the sub-agent genuinely needs to execute code, in which case use `general-purpose`.

### D.5 Moderator role + prompt template + required output schema

The moderator reads all sub-agent outputs, runs the state-changing P2/P3 commands (the ones sub-agents are forbidden from running), resolves conflicts, and emits **exactly this schema** — no synthesis essay, no prose-only verdict:

```yaml
decision: REJECT | ACCEPT
phase_results:
  P1: PASS | FAIL
  P2: PASS | FAIL | SKIPPED
  P3: PASS | FAIL | SKIPPED
  P4: PASS | FAIL
conflicts:
  # Empty array if no sub-agents disagreed.
  - rule: "§11.x"
    sub_a_says: PASS
    sub_b_says: FAIL
    resolution:
      evidence: "path:line"
      verdict: "FAIL"
fix_list:
  # Prioritized 1 = blocker, 2 = should-fix, 3+ = nice-to-have.
  # priority ≥ 3 NEVER blocks ACCEPT.
  - { priority: 1, rule: "§11.x", path: "src/...", line: 42, action: "..." }
```

**Moderator prompt template:**

```
You are the moderator for an FE compliance audit of {module_path}.

Inputs you have:
- Sub-agent outputs (tables of {rule_id, severity, status, path:line, evidence})
- §11 (acceptance criteria / REJECT rules)
- Appendix D (this playbook)

Your job:
1. Run P2 (install/build/type-check) and P3 (boot + browser smoke) per the
   tool mapping in §D.6.
2. Resolve any conflicts between sub-agents using the cited evidence — the
   one with a path:line citation wins. If both cite, prefer the more recent
   file mtime.
3. Build the fix_list, keyed strictly to §11 rule numbers. SHOULD/MAY
   violations go at priority ≥ 3.
4. Emit ONLY the YAML schema specified in Appendix D.5. No prose.

decision: REJECT if any §11 MUST rule has status FAIL after conflict
resolution; otherwise ACCEPT.
```

### D.6 Tool mapping (what runs which phase)

| Need | Tool | Notes |
|---|---|---|
| P1 grep / file reads | `Grep` tool (ripgrep) | filter by `--glob` per section |
| P1 jq on `package.json` | `mcp__bg-manager__sync_run` invoking `jq` | structured manifest reads |
| P2 install / build | `mcp__bg-manager__sync_run` with `timeout_sec: 120` | auto-converts to bg if it exceeds timeout |
| P2 type-check | `vue-tsc --noEmit` via `sync_run` | non-trivial duration; expect 30–60s |
| P3 boot wippy / dev server | `mcp__bg-manager__bg_run` with `notifyReady: true` and `notifyPort: true` | use triggers, do not poll |
| P3 browser check | `mcp__playwright` tools | snapshot, click, evaluate; emulate dark mode for §5.4 |
| P3 HTTP smoke | `curl` via `sync_run` | one-shot status-code checks |
| P4 gold-standard diff | `git diff --no-index gold/ target/` via `sync_run` | read-only, fast |

**Moderator-only tools** (sub-agents must not call these): `sync_run` and `bg_run` for builds/boots, `playwright` browser tools, any file-write tools.

### D.7 Common AI failure modes & anti-patterns

These are the recurring ways AI audits go wrong. The moderator's job includes catching these:

1. **Sub-agent invents verification commands.** Symptom: a sub-agent runs `grep -E 'foo' file.ts` when §10 specifies a different exact grep. *Fix:* moderator MUST flag any command not present in §10 and downgrade those PASS reports to UNVERIFIED.

2. **Sub-agent declares PASS without running the cited command.** Symptom: "PASS — package.json looks fine." *Fix:* schema requires an `evidence` column with a path:line or a captured output tail. No evidence → status becomes SKIP, not PASS.

3. **Moderator merges contradictions silently.** Symptom: sub-agent A says PASS, B says FAIL, moderator picks one and never mentions the disagreement. *Fix:* the `conflicts:` block in the D.5 schema is mandatory whenever ANY two sub-agents disagree on the same rule.

4. **Agent uses the wrong gold standard.** Symptom: a page-app audit cites diffs against `gold:app-template/frontend/web-components/mermaid/`. *Fix:* §14 and per-section callouts pin the gold standard by app type — the sub-agent prompt template must hardcode the correct one.

5. **Agent treats SHOULD/MAY as MUST and over-rejects.** Symptom: a module with 0 MUST violations but a SHOULD warning gets `decision: REJECT`. *Fix:* §11 enumerates MUST rules only; SHOULD/MAY violations go into `fix_list` at priority ≥ 3 and NEVER flip ACCEPT to REJECT.

### D.8 Context budget rules

- **Sub-agent context:** ONE section + Appendices A/B/C (referenced, not loaded) + the gold-standard path. **Never the full checklist.** The checklist is ~30K words — loading it into every sub-agent is wasted budget.
- **Moderator context:** §11 (acceptance criteria) + this appendix + all sub-agent outputs. Moderator does NOT need to re-read §0–§10.
- **Orchestrator (the calling Claude session):** decides scope (which sections, how many modules), spawns the swarm, then hands off to the moderator. Does NOT do the audit itself in parallel — that duplicates work.

### D.9 Output expectations

The orchestrating Claude session should surface, in order:

1. The moderator's `decision:` (REJECT or ACCEPT) — one word.
2. Any `conflicts:` resolved during moderation, in one short paragraph.
3. The `fix_list:` as a numbered to-do list with `path:line` and §11 rule citations.
4. Total run time and which phases ran (so the user can re-run cheaply if needed).

No prose summary of "what we checked" — the user can read the schema. Brevity wins.

</details>

---

## Cross-references

- `app-checklist.md` — older minimal page-app checklist
- `app-guide.md` — detailed page-app authoring guide
- `component-guide.md` — web-component authoring guide
- `proxy-api.md` — full HostApi + instance.on() reference
- `host-spec.md` — host-side contract
- `host-less-mode.md` — host-less boot in detail
- `theming.md` — three-level theming
- `best-practices.md` — Vue + Tailwind + PrimeVue patterns

---

## Version & maintenance

| Date | Notes |
|---|---|
| 2026-05-06 (rev 1) | Initial draft from canonical docs + host contracts + KB + keeper-v5 audit |
| 2026-05-06 (rev 2) | Validated against gold standards `applications/main` and `web-components/mermaid`; fixed false-positive REJECT rules; clarified `url`/`base_path`/`entry_point` semantics (URL prefixes, not physical paths; `base_path` becomes HTML `<base>`); softened `wippy.proxy.injections` to MAY-with-recommended; softened `cssCodeSplit` and sourcemap rules; clarified `view.page` ≠ nav-owner (announced flag); promoted `@wippy-fe/router` factory pattern (`createAppRouter as createAppRouterFactory`); `wippyPackagePlugin()` is default (opt-out); WC `wippy.type: "widget"`; added `wippy.scripts.test` |
| 2026-05-06 (rev 3) | Reframed `config_overrides` as ISOLATION-only EVERYWHERE (§2.1, §2.3, §5); §5.1 now leads with the facade module as the main customization site, with HEAVY (`drewaltizer-wippy/src/drewapp/deps`) and LIGHT (`app-template/src/app/deps`) facade examples plus the `iframe-demo-themed` page-level isolation demo; required `meta.description` and `wippy.description` to be verbose AI/human-readable usage explanations (§2.2, §4.1, REJECT 5a); promoted `make.bat` + `make.ps1` to MUST-ship next to every Makefile (§8.2, REJECT 55a); promoted hardcoded base to 100% REJECT (§9.5, no documented-exception escape hatch); dropped `applyThemeOverride` row from §12; dropped hand-rolled router exception (use `@wippy-fe/router@^0.0.28`); reframed raw localStorage as DISCOURAGED (§12) — facade owns theme, router owns route restoration, pinia-persist owns durable state; tightened `wippyPackagePlugin()` opt-out wording to require a very-good reason; removed §13.1 (compiled-JS), §13.4 (directories.src collision), §13.5 (cross-namespace migration ordering); replaced bg-manager-MCP fix in §13 with wippy CLI port-override examples; added §10.7 Playwright/browser-emulator dark+light+contrast verification recommendation (REJECT 46a) |
| 2026-05-06 (rev 4) | Added §5.0 visual-matching escalation pattern (CSS vars → customCSS for PrimeVue → custom components only as last resort); REJECT 46b for custom-when-PrimeVue-existed. Added §5.1.2 strict placement rule (host vars/PrimeVue selectors → YAML/`package.json` customization, NEVER `:root` or raw `.p-*` rules in `.css` files); REJECT 42b + 43a. Refined §2.3 + §5.1.1: `config_overrides` is isolating only for `cssVariables`/`customCSS` (replace), but additive/safe for `icons`/`iconSets` (merge) — the canonical per-page icon-pack registration path. Added §5.6 iconify discipline (permissive packs preferred — tabler/lucide/phosphor/material-symbols/mdi/heroicons; custom icons registered via AppConfig `customization.icons` + the bootstrap `addCollection`, NEVER ad-hoc); REJECT 46c (raw SVG for reusable icons), 46d (off-bootstrap `addCollection`), 46e (icon-font CSS alongside Iconify). |

When updating: keep section numbering stable so external references hold. Add new rules under the relevant section; never delete a rule that's still active.
