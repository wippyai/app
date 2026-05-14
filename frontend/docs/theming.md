# Wippy Theming Guide

<!-- last-synced: 2026-05-13 (revised: semantic vs decorative section added) — when this file changes, republish `@wippy-fe/theme` and re-ingest `wippy.frontend` KB so the three mirrors stay aligned. -->

Authoritative guide for theming Wippy apps. Covers the architecture paradigm, when to theme at the **facade** (host-wide), when to theme at the **page** (per-iframe), the substrate the host provides, web-component theming, and the full CSS-variable / Tailwind / PrimeVue reference.

> **Mirrored at three locations.** Same content, three places — keep them in sync.
> - This file: `app-template/frontend/docs/theming.md` (in-repo, **primary editing surface**)
> - npm package: `@wippy-fe/theme/THEMING.md` (shipped with the theme package — `node_modules/@wippy-fe/theme/THEMING.md` after install)
> - Wippy KB: `wippy.frontend` → "Wippy Theming Guide" (semantic search via the `wippy-kb` MCP)

---

## Theming architecture paradigm (read this first)

**Consistent theming is only possible when every component INHERITS as much as it can from the host, and writes the absolute minimum amount of necessary custom CSS.** The host substrate (CSS variables, Tailwind preset, PrimeVue with `theme: 'none'`, host-injected CSS for components, theme-aware UI primitives like `host.toast`/`host.confirm`) is designed so that a well-written app or component needs almost no custom styling at all. Every custom rule is a divergence from the design system — sometimes necessary, but always justified.

This paradigm has **two waterfalls** plus **one universal rule**.

### Waterfall A — AUTHOR (when building UI in an app or web component)

Escalate strictly in this order. Do not skip levels. The earlier the level you stop at, the more design-system inheritance you get for free.

1. **Use PrimeVue.** Button, Dialog, Select, DataTable, Toast, ConfirmDialog, Tag, Avatar — if PrimeVue ships it, use it. The host already styles PrimeVue with the right tokens. Use `host.toast(...)` and `host.confirm(...)` for transient feedback (theme-aware out of the box).
2. **Custom HTML/Vue templates that use theme-provided colors.** When PrimeVue doesn't ship what you need (a force graph, a sparkline, a domain-specific layout), build it — but consume colors via semantic CSS variables (`var(--p-text-color)`, `var(--p-content-background)`, `var(--p-content-border-color)`, `var(--p-text-muted-color)`) and Tailwind severity classes (`bg-danger-500`, `text-success-600`, `border-warn-200`, `text-info-700`, `text-help-600`, `text-accent-500`). Never `text-red-500` for danger meaning, never `#ef4444` hardcoded.
3. **`color-mix()` from theme variables** when the existing token set doesn't have the exact shade or alpha you need: `color-mix(in srgb, var(--p-danger-color) 12%, transparent)` for a tinted danger background, `color-mix(in srgb, var(--p-primary-color) 60%, var(--p-content-background))` for a custom blend. The result still flips with dark mode because the inputs do.
4. **Custom CSS (last resort).** Only when none of the above can deliver, AND with a header comment explaining what was missing and who approved it. Custom colors MUST still support both light and dark modes (see "Universal rule" below).

### Waterfall B — CUSTOMIZER (when adapting the theme for a client, brand, or design)

Escalate strictly in this order. The earlier the level, the more pages inherit your change.

1. **Facade global** (`css_variables` / `custom_css` on the `wippy/facade` dep). Reaches the host UI AND every child iframe. **95%+ of theming work lives here.** Override `--p-primary` for brand color; override `--p-danger`/`--p-success`/etc. for severity palette; override the surface scale for neutral palette; add component-level `customCSS` for stable PrimeVue selectors.
2. **Facade host/children scopes** (`host_css_variables` / `host_custom_css` for the chrome only; `children_css_variables` / `children_custom_css` for child iframes only). For divergence between host chrome and embedded pages.
3. **Per-page `config_overrides`** (registry-entry YAML or `wippy.configOverrides` in `package.json`). Single page only — for demo pages, A/B variants, one-off brand take-overs.
4. **Local app styles** (`src/styles.css` inside an iframe app). Only for genuinely app-local classes (e.g. `.keeper-chart-bar`) — NEVER for theme-related concerns. The right place for a brand color is the facade, even if only one page uses it today.

### Universal rule — every level of custom CSS MUST support both light AND dark modes

Wippy uses `@media (prefers-color-scheme: dark)` to flip themes. Every piece of custom CSS — at any waterfall level — must produce a sensible result in BOTH modes.

The easiest way to satisfy this: use semantic CSS variables (`--p-text-color`, `--p-content-background`, etc.) and severity Tailwind classes (`danger-*`, `success-*`, etc.) — those flip automatically. If you must hand-write color values:

```css
.my-thing {
  background: var(--p-content-background);
  color: var(--p-text-color);
}
/* Or, when you genuinely need mode-specific values: */
.my-thing {
  background: #ffffff;
  color: #111111;
}
@media (prefers-color-scheme: dark) {
  .my-thing {
    background: #18181b;
    color: #e5e5e5;
  }
}
```

In `cssVariables` (Waterfalls B levels 1-3), use the `@light` / `@dark` keys:

```yaml
cssVariables:
  "--p-primary": "#005fb2"
  "@light":
    "--p-content-background": "#fafafa"
  "@dark":
    "--p-content-background": "#1c1a19"
```

If your custom CSS only looks right in one mode, that's a **REJECT**. Dark/light parity is non-negotiable. See [Anti-patterns](#anti-patterns-reject-list) for the consolidated list of rejected behaviors.

---

## Table of contents

- [Theming architecture paradigm (read this first)](#theming-architecture-paradigm-read-this-first)
- [Visual-matching escalation (the AUTHOR waterfall in practice)](#visual-matching-escalation-the-author-waterfall-in-practice)
- [Where each override lives — strict placement rule](#where-each-override-lives--strict-placement-rule)
- [What the Wippy host provides (the substrate)](#what-the-wippy-host-provides-the-substrate)
- [hostCssKeys decision tree (for web components)](#hostcsskeys-decision-tree-for-web-components)
- [Web component theming consumption](#web-component-theming-consumption)
- [The CUSTOMIZER waterfall — three levels of theming](#the-customizer-waterfall--three-levels-of-theming)
- [Level 1 — Basic theming (accent only, via facade)](#level-1--basic-theming-accent-only-via-facade)
- [Level 2 — Full theming (palette + custom CSS, via facade)](#level-2--full-theming-palette--custom-css-via-facade)
- [Level 3 — Per-page theme override (configOverrides / runtime)](#level-3--per-page-theme-override-configoverrides--runtime)
- [Iconography (Iconify discipline)](#iconography-iconify-discipline)
- [Reference — CSS variables](#reference--css-variables)
- [Reference — Tailwind utility classes](#reference--tailwind-utility-classes)
- [Reference — Dark mode](#reference--dark-mode)
- [Reference — PrimeVue styling (opt-in)](#reference--primevue-styling-opt-in)
- [Reference — Choosing custom colors (luminosity, WCAG)](#reference--choosing-custom-colors-luminosity-wcag)
- [Reference — Host UI customization (`--wippy-host-*` + BEM classes)](#reference--host-ui-customization---wippy-host---bem-classes)
- [Anti-patterns (REJECT list)](#anti-patterns-reject-list)
- [Rules cheatsheet (IF/THEN)](#rules-cheatsheet-ifthen)
- [Related docs](#related-docs)

---

## Visual-matching escalation (the AUTHOR waterfall in practice)

**The single most important rule in this document.** When you need the UI to match a design, escalate in this strict order — DO NOT skip ahead. 95%+ of "match this mockup" work fits at level 1 or 2.

| Step | What you change | Where it lives | When you stop |
|---|---|---|---|
| **1 — CSS variables** | Override existing `--p-*` semantic vars (primary, content, text, severity), and/or override the surface scale if the brand needs a different neutral palette. Use Playwright + DevTools `getComputedStyle(document.documentElement)` to enumerate every `--p-*` already defined; pick from that menu first. | YAML `customization.cssVariables` — facade global, or per-iframe `config_overrides`. NEVER `:root` in a `.css` file. | The mockup's color/border/shadow/spacing matches and you didn't have to touch markup. |
| **2 — `customCSS` for PrimeVue components** | Add design-token overrides (`--p-button-border-radius`, `--p-dialog-shadow`, etc.) and selector tweaks (`.p-button.p-button-xs { … }`, `.p-accordionheader::before { … }`) when level-1 vars aren't enough. | YAML `customization.customCSS` (or `package.json` `wippy.configOverrides.customization.customCSS` mirror). NEVER raw `.p-*` rules in a `.css` file. | The PrimeVue component's appearance and behaviour now match the design. |
| **3 — Custom Vue components** | Build your own component. **LAST RESORT.** Reserved for things PrimeVue genuinely doesn't ship: novel visualizations (force graph, custom chart types), domain-specific shell layouts, interactions outside PrimeVue's catalog. | Vue source in your app. | The new component is custom because PrimeVue has no analogue, NOT because level 1/2 was too much research. |

**REJECT level-3 work that could have been done at level 1 or 2.** Examples:

| ❌ Reimplementing PrimeVue from scratch | ✅ PrimeVue + customization |
|---|---|
| Hand-rolled `<div class="dropdown">` | `<Select>` + level-1/2 styling |
| Custom modal markup with backdrop | `<Dialog>` + `useDialog` |
| Custom toast container + queue | `<Toast>` + `useToast()` (or `host.toast()`) |
| Custom confirm prompt | `<ConfirmDialog>` + `useConfirm()` (or `host.confirm()`) |
| Custom inline tooltip | `v-tooltip` directive |
| Hand-rolled accordion with chevron animation | `<Accordion>` + `customCSS` for the chevron |

Level 3 IS legitimate for:

- Force graph for dataflow visualization (no PrimeVue equivalent).
- Token-bar / sparkline charts (Chart.js or D3 wrapper).
- Markdown / rich-text renderers (markdown-it / shiki wrappers).
- Code editor (Monaco WC).
- Domain-specific shell components mounted in managed-layout panels.

---

## Where each override lives — strict placement rule

Mismatched placement is the #1 source of theme drift. The bundle's `.css` ships AFTER the host's CSS pipeline and shadows it; CSS files inside child apps must NEVER touch host-controlled styling.

| Override target | Where it goes | Where it MUST NOT go |
|---|---|---|
| Existing host var (`--p-*`) — change its value | YAML or `package.json` `customization.cssVariables` (facade global, or `config_overrides` for isolation) | NEVER `:root { --p-* }` in a child app's `.css` |
| New derived var your project owns | Same place; compute via `color-mix()` or `var()` referencing host vars | NEVER `:root { --my-* }` in a child app's `.css` |
| HOST-owned selector override (`.p-button`, `.p-dialog`, `.p-inputtext`, etc.) | `customization.customCSS` (YAML or package.json) | NEVER raw `.p-*` rules in a child app's `.css` |
| Project-internal class override (`.keeper-nav-btn`, `.search-wrap`) | `src/styles.css` (or `customization.customCSS` if it must reach the host shell) | n/a |
| Project-scoped non-theme constant (chart bar color, fixed spacing tag) | `src/styles.css` with a clear project prefix (e.g. `--keeper-chart-bar-*`) | n/a |

**Rationale**: theme is a host concern. The host composes facade global + per-page customization in a defined order; CSS bundled inside the iframe ships AFTER and shadows that pipeline, breaking override semantics and hiding drift. Keep host-touching styling in YAML/JSON customization. Keep your bundle's `.css` for things you alone own.

The compliance checklist enforces this at REJECT severity (REJECT 42b for `:root { --p-* }` in child `.css`, REJECT 43a for raw `.p-*` selectors in child `.css`).

---

## What the Wippy host provides (the substrate)

The host is the source of theming truth. Before you write a single line of CSS, you should know what it gives you for free — because the paradigm is **inherit maximum, write minimum**, and you can't inherit what you don't know exists.

### The five host-served CSS bundles

The host publishes these CSS files at stable URLs (resolved from the build manifest at runtime — never hardcode the paths). Inspect them once at `dist/@wippy-fe/assets/` in the host repo to internalize what each contains:

| File | Size | Contains | Used by |
|---|---|---|---|
| **`theme-config.css`** | ~8 KB | The full CSS-var system — `--p-primary-*`, `--p-secondary-*`, `--p-danger-*`, `--p-success-*`, `--p-warn-*`, `--p-info-*`, `--p-help-*`, `--p-accent-*`, `--p-surface-0..950`, plus semantic aliases (`--p-content-background`, `--p-text-color`, `--p-text-muted-color`, `--p-highlight-*`). Light scale + a `@media (prefers-color-scheme: dark)` block that retunes every var for dark mode. This is the **only file that defines theme tokens.** | Page apps (via `injections.css.themeConfig`), WCs (via `hostCssKeys: ['themeConfigUrl']`) |
| **`tailwind.css`** | ~455 KB | The precompiled aggregator: PrimeVue's `tailwind.css` from the unstyled preset + every PrimeVue component's CSS (`button.css`, `dialog.css`, `inputtext.css`, ~80 components). Every rule references `--p-*` vars and pairs with `@media (prefers-color-scheme: dark)`. **This is what makes `<Button severity="danger">` look like a danger button.** | Page apps (via `injections.css.primevue`), WCs that render PrimeVue inside Shadow DOM (via `hostCssKeys: ['primeVueCssUrl']`) |
| **`preflight.css`** | ~5 KB | Tailwind v3's preflight (CSS reset + Tailwind's `--tw-*` internal vars used by utility classes for translate/rotate/shadow/etc.). **Only needed if you're running Tailwind at runtime** (Play CDN-style JIT) — modern Vite builds bake preflight into their own output and don't request this. | Legacy runtime-Tailwind setups only — page apps using `injections.tailwindConfig: true` (rare); WCs may request it via `hostCss.preflightCssUrl` + `loadCss()` if needed (not declarable in `hostCssKeys`) |
| **`iframe.css`** | ~1 KB | Scrollbar styling (`*::-webkit-scrollbar*`, `scrollbar-color`, `scrollbar-width`) — references `--p-surface-100`/`--p-surface-300`/`--p-surface-500` for light, `--p-surface-900`/`--p-surface-800`/`--p-surface-400` for dark. Tiny but visible: without it, scrollbars revert to OS defaults and stand out. | Page apps (via `injections.css.iframe`), WCs (via `hostCssKeys: ['iframeCssUrl']`) |
| **`data-content.css`** | ~5 KB | `.data-body` markdown styling — heading scale, lists, blockquote, inline `code`, fenced code blocks, tables, scrollbar, light + dark variants. Scoped to `.data-body` so it only applies inside markdown-rendered nodes. | Page apps rendering markdown (via `injections.css.markdown`), WCs rendering markdown (via `hostCssKeys: ['markdownCssUrl']`) |

### What the host gives you on top of CSS

- **`@wippy-fe/theme` package** — Tailwind preset (`tailwind.config.ts`) with `severityScale()` helpers exposing `text-danger-500`, `bg-success-100`, `border-warn-300`, etc. Mirrors every `--p-*` token via `color-mix()`. Also exports `primevue-plugin.ts` (installs PrimeVue with `theme: 'none'` so styling stays in the CSS-var system) and the `theme-config.css` for host-less imports.
- **`host.toast(...)` / `host.confirm(...)`** — theme-aware UI primitives that render IN THE HOST chrome, not your iframe. Always preferred over PrimeVue's `useToast`/`useConfirm` for app code — they survive iframe boundaries and inherit host theming automatically.
- **`<wippy-loading>` / `<wippy-error>`** — pre-themed standard placeholders. Consume `--wippy-host-*` vars; no styling needed on your side.
- **Tailwind severity utility scales** — `text-danger-{50..950}`, `bg-success-{50..950}`, `border-warn-{50..950}`, etc. plus `accent-*`, `help-*`, `info-*`, `secondary-*`. Drop-in for semantic colors — never reach for `text-red-500`.
- **PrimeVue with theme: 'none'** — the plugin from `@wippy-fe/theme/primevue-plugin` installs PrimeVue without any styling preset. **All visual identity comes from the CSS-var system above.** This is why `--p-primary` in `theme-config.css` is the single point of truth.

### Page-app `proxy.injections` vs WC `hostCssKeys` — the asymmetry

The two consumers request host CSS differently, and **they're not symmetric**:

| Knob | Page apps (`package.json` → `wippy.proxy.injections`) | WCs (`webComponent()` return → `hostCssKeys`) |
|---|---|---|
| `themeConfig` / `themeConfigUrl` | yes — `injections.css.themeConfig: true` — injected into iframe `<head>` | yes — `hostCssKeys: ['themeConfigUrl']` — URL exposed; component imports it itself |
| `primevue` / `primeVueCssUrl` | yes — `injections.css.primevue: true` | yes — `hostCssKeys: ['primeVueCssUrl']` |
| `markdown` / `markdownCssUrl` | yes — `injections.css.markdown: true` | yes — `hostCssKeys: ['markdownCssUrl']` |
| `iframe` / `iframeCssUrl` | yes — `injections.css.iframe: true` | yes — `hostCssKeys: ['iframeCssUrl']` |
| `preflightCssUrl` | implicit — Tailwind runtime injects its own preflight if `tailwindConfig: true` | not in `HostCssKey` union — request manually via `hostCss.preflightCssUrl` + `loadCss()` if you really need it |
| `fonts` | yes — `injections.css.fonts: true` — host injects facade-configured font `<link>` tags | no — WCs inherit fonts from host page; no separate knob |
| `customCss` | yes — `injections.css.customCss: true` — facade's `custom_css` injected as `<style>` | no — WCs do NOT receive facade `custom_css`. WCs are Shadow-DOM-isolated; if you need custom theme inside a WC, override `--p-*` vars in your `:host { … }` block. |
| `customVariables` | yes — `injections.css.customVariables: true` — facade's `css_variables` injected as `:root { --x: y; }` | no — WCs inherit `--p-*` from the page they're embedded in (because CSS custom properties cross the Shadow DOM boundary). No separate knob. |
| `tailwindConfig` | yes — `injections.tailwindConfig: true` — **LEGACY runtime-Tailwind path** (host pushes the Tailwind preset config to the iframe so Play CDN JIT can compile classes at runtime). Modern Vite builds set this to `false` and bundle their own Tailwind. | n/a |
| `iconifyIcons` | yes — `injections.iconifyIcons: true` — host pushes its Iconify icon bundle into the iframe | n/a — WCs that need icons consume `@iconify/vue` directly (a peerDependency) |
| `resizeObserver` / `preventLinkClicks` / `refreshWhenVisible` / `historyPolyfill` / `errorCapture` | yes — behavioral injections (not CSS) | n/a |

**Two things to memorize about the asymmetry:**

1. **WCs cannot opt in to `customCss` or `customVariables`** the way page apps can. Shadow DOM is a one-way mirror for stylesheets: CSS vars cross the boundary (a WC sees the page's `--p-primary`), but stylesheet rules don't. If the facade ships a `custom_css` rule like `.p-button { border-radius: 12px }`, a page app's PrimeVue button gets it; a WC's PrimeVue button inside Shadow DOM does NOT. WCs that render PrimeVue in Shadow DOM and need facade-level visual overrides must either replay the relevant CSS inside the WC's `:host` styles or lift the rule to `--p-*` token form (which DOES cross the boundary).
2. **`tailwindConfig: true` means "I'm using runtime Tailwind"** — almost always wrong for new code. Apps built with Vite already bake their Tailwind output into the bundle; setting this knob to `true` doubles the cost and creates two conflicting Tailwind layers. Leave it `false`. The knob exists for legacy apps that lacked a build step.

---

## hostCssKeys decision tree (for web components)

`webComponent()` returns an object whose `hostCssKeys` field selects which host-served CSS URLs are populated into your render function. The platform's default is `['themeConfigUrl', 'primeVueCssUrl', 'markdownCssUrl', 'iframeCssUrl']` — request fewer for tighter bundles, more only when you actually use them.

### One rule per key

- **`themeConfigUrl`** — ALWAYS include. Without it, your `:host { … }` styles can't reference `--p-*` vars and your WC drifts visually from the host. The only reason to omit: you're rendering pure SVG/Canvas content with hardcoded brand colors (and even then, prefer requesting it and reading vars from CSSOM). Cost: ~8 KB. **Default: on.**
- **`primeVueCssUrl`** — Include ONLY IF your WC renders PrimeVue components (`<Button>`, `<Dialog>`, `<InputText>`, etc.) inside its Shadow DOM. Most "thin" WCs that just render a div + button don't need this. Cost: ~455 KB. **Default: off unless you import PrimeVue.**
- **`markdownCssUrl`** — Include ONLY IF you render markdown inside your WC (anything inside a `.data-body` container). Cost: ~5 KB. **Default: off.**
- **`iframeCssUrl`** — Include if your WC has scrollable content where consistent scrollbars matter. Cost: ~1 KB. **Default: on for any WC with scrollable panels.**
- **`preflightCssUrl`** — Not exposed via `hostCssKeys` (the `HostCssKey` TS union omits it). If you genuinely need Tailwind v3 preflight inside Shadow DOM, call `hostCss.preflightCssUrl` + `loadCss()` imperatively. **In practice you should not need this** — modern WCs either bundle their own preflight (rare; usually wrong) or don't render bare HTML elements that need a reset.

### Sample patterns

```ts
// Pure-vanilla WC, no PrimeVue, no markdown, no scroll:
export async function webComponent() {
  return {
    hostCssKeys: ['themeConfigUrl'],
    // …
  };
}

// WC that renders PrimeVue components inside Shadow DOM:
export async function webComponent() {
  return {
    hostCssKeys: ['themeConfigUrl', 'primeVueCssUrl', 'iframeCssUrl'],
    // …
  };
}

// WC that renders markdown content (e.g. a docs preview pane):
export async function webComponent() {
  return {
    hostCssKeys: ['themeConfigUrl', 'markdownCssUrl', 'iframeCssUrl'],
    // …
  };
}

// Reference: app-template/frontend/web-components/mermaid/src/index.ts
//   hostCssKeys: ['themeConfigUrl']  ← mermaid renders SVG directly; just needs --p-* vars
```

### Bundle-size impact summary

| Configuration | Total host CSS pulled |
|---|---|
| `['themeConfigUrl']` only | ~8 KB |
| `['themeConfigUrl', 'iframeCssUrl']` | ~9 KB |
| `['themeConfigUrl', 'markdownCssUrl', 'iframeCssUrl']` | ~14 KB |
| `['themeConfigUrl', 'primeVueCssUrl', 'iframeCssUrl']` | ~464 KB |
| Full default (`themeConfigUrl + primeVueCssUrl + markdownCssUrl + iframeCssUrl`) | ~469 KB |

Choose deliberately. A "thin" WC that renders a single button with `<Icon>` doesn't need 455 KB of PrimeVue CSS.

---

## Web component theming consumption

Page apps consume theming through `proxy.injections.css.*` flags — the host injects `<link>` tags into the iframe `<head>` automatically. **Web components are different**: they receive URL pointers and import the CSS themselves into their Shadow DOM (or `:host` styles).

### Gold-standard reference

`C:/Projects/app-template/frontend/web-components/mermaid/` is the reference WC for theme consumption. The pattern:

1. **`src/index.ts`** — request only the CSS you need:
   ```ts
   export async function webComponent() {
     return {
       hostCssKeys: ['themeConfigUrl'],  // ← just CSS vars; mermaid renders SVG
       // … connectedCallback, render, etc.
     };
   }
   ```

2. **`src/styles.css`** — import the same file at build time AND reference its vars defensively (so the WC also works in host-less dev mode):
   ```css
   /* Imported when the host provides themeConfigUrl */
   @import "@wippy-fe/theme/theme-config.css";

   :host {
     /* Reference vars; provide a fallback for host-less dev */
     color: var(--p-text-color, #404040);
     background: var(--p-content-background, #ffffff);
   }

   .danger {
     /* Fallback is for dev preview ONLY — production paths always have the host var */
     color: var(--p-danger-500, #ef4444);
   }
   ```

3. **`src/app/mermaid-diagram.vue`** — read vars into JS when handing them to non-CSS contexts (D3, mermaid, Canvas):
   ```ts
   const styles = getComputedStyle(this.$el);
   const themeVars = {
     primaryColor: styles.getPropertyValue('--p-primary-500').trim(),
     background: styles.getPropertyValue('--p-content-background').trim(),
     // … pass to mermaid.init or D3.scaleOrdinal
   };
   ```

### Base-class selection

| Base class | When | Where it lives |
|---|---|---|
| **`WippyVueElement`** | WC is built with Vue (uses `<script setup>` SFCs, Pinia stores, Vue Router). | `@wippy-fe/webcomponent-vue` |
| **`WippyElement`** | WC is vanilla TS but non-trivial (multiple props, events, theme-reactive rendering, slot composition). | `@wippy-fe/webcomponent-core` |
| `HTMLElement` (plain) | WC is "thin" — fewer than 3 props, no events out, no theme-aware rendering, < ~200 LoC. Acceptable but include a one-line header rationale comment. | n/a |

See `web-component-loading.md` for the full base-class contract (lifecycle hooks, prop reflection, event dispatch with `bubbles: true, composed: true`).

### Defensive fallbacks — when and why

```css
/* OK — fallback is for host-less dev mode (and only when var() failure would be invisible) */
color: var(--p-text-color, #404040);

/* WRONG — production code should never need the fallback; if --p-danger-500 is missing,
   something more fundamental is broken than "use #ef4444 instead" */
border-color: var(--p-danger-500, #ef4444);  /* ← only OK in WCs, not in page apps */
```

Page apps run inside an iframe the host has already populated with theme CSS — `--p-*` vars are always available. Page apps should NEVER write `var(--p-X, #hex)` fallbacks. WCs may run in host-less dev mode (no parent iframe), so a fallback that lets the WC render *something* is acceptable. Limit fallbacks to one per logical color and document them as "dev preview only".

### Anti-patterns specific to WCs

- **Hardcoding hex inside `:host { … }`** — even with a comment. Use `var(--p-*)`.
- **`<style>` blocks with `@media (prefers-color-scheme: dark) { … }`** that hardcode dark-mode colors. The vars in `theme-config.css` already retune themselves for dark; if you reference `var(--p-*)` correctly, your dark mode is free.
- **Requesting `primeVueCssUrl` "just in case"** when the WC doesn't render PrimeVue — adds 455 KB to the bundle for zero benefit.
- **Forgetting `bubbles: true, composed: true`** on `CustomEvent` dispatch — events won't escape Shadow DOM, so the page app never receives them. This isn't theming-specific but it's the most common WC bug.

---

## The CUSTOMIZER waterfall — three levels of theming

Almost every "I want to restyle this" task fits one of three levels. Pick the lightest one that solves the problem; never reach for a heavier level "just in case". This is **Waterfall B** from the paradigm section — the four-step escalation collapses into three concrete delivery surfaces, plus a fourth "local app CSS" tier reserved for app-specific (non-theme) styling.

| Level | Where it lives | Reaches | Use when |
|---|---|---|---|
| **1 — Basic** | `wippy/facade` parameter `css_variables` (a few `--p-*` overrides) | Host UI **and** all child iframes | You want a brand accent color and otherwise want stock theme |
| **2 — Full** | `wippy/facade` parameters `css_variables` + `custom_css` (and the scoped variants) | Host UI **and** all child iframes (or scoped to one or the other) | You're shipping a product with bespoke visual identity — full palette, custom components, BEM overrides |
| **3 — Per-page** | A specific page's `package.json` (`wippy.configOverrides.customization.cssVariables` / `customCSS`) **or** runtime `window.__WIPPY_CONFIG_OVERRIDES__` | Just that one page (the iframe it loads in) | A demo page, an A/B variant, an experiment, a one-off embed — different look from the rest of the app |

> **Anti-pattern alert.** Don't theme by editing your child app's `src/styles.css` to override `--p-surface-0..950` or other tokens. That CSS is loaded inside the child iframe AFTER the host injects the real theme — it shadows host theming, never reaches the host UI itself, and creates per-iframe visual drift. Audit any project that has a multi-hundred-line `styles.css` in a child app. The right place is the facade (Levels 1–2) or `wippy.configOverrides` (Level 3).

---

## Level 1 — Basic theming (accent only, via facade)

**You want:** brand-color buttons, brand-color highlights, otherwise stock theme.

**You change:** the `wippy/facade` `ns.dependency` in your app's deps `_index.yaml`. Add a `css_variables` parameter with a JSON-string mapping just the primary tokens.

**Result:** the entire host UI, every child iframe, and every web component picks up the new accent. Dark mode keeps working. No CSS edits anywhere.

### Sample

```yaml
# src/<yourapp>/deps/_index.yaml
- name: facade
  kind: ns.dependency
  component: wippy/facade
  parameters:
    - name: server
      value: app:gateway
    - name: router
      value: app:api.public
    # Theming starts here:
    - name: css_variables
      value: '{"--p-primary":"#4f8ef7","--p-primary-color":"#4f8ef7","--p-primary-hover-color":"#5a9af8"}'
```

### What's actually happening

The facade reads `css_variables` (a JSON string), sends it down to the host as `AppConfig.customization.cssVariables`, the host writes those onto `:root` and forwards them into every child iframe via the proxy injection. So one place edits, everything updates.

> The default base color is `rgb(0, 95, 178)`. The full 11-step shade scale (50–950) **auto-derives** from your base via `color-mix()` — you only set `--p-primary`. See ["Choosing custom colors"](#reference--choosing-custom-colors-luminosity-wcag) for luminosity rules so light-mode buttons keep AA contrast against white text.

### When to graduate to Level 2

When you find yourself wanting any of:

- A complete surface scale (`--p-surface-0..950`) shifted to brand-specific neutrals
- Bespoke component CSS (custom button variants, badge styles, dialog padding)
- BEM-class overrides for the host chrome (sidebar, chat messages, splitter)

…you're at Level 2.

---

## Level 2 — Full theming (palette + custom CSS, via facade)

**You want:** a fully-branded product. Custom palette, custom component variants, host chrome that matches your design system. Both light and dark modes look intentional.

**You change:** the same facade dependency, but with three richer scopes:

| Facade parameter | Reaches | Use for |
|---|---|---|
| `css_variables` / `custom_css` | **Host + all children** (global) | App-wide tokens (`--p-*`), accent palette, global custom-css that has to apply identically in host and inside iframes (e.g. font family, kbd pill styling) |
| `host_css_variables` / `host_custom_css` | **Host UI only** | `--wippy-host-*` overrides; BEM class overrides scoped to `.wippy-host-app` (sidebar, chat messages, splitter) |
| `children_css_variables` / `children_custom_css` | **Child iframes only** | CSS that should apply inside child apps but not leak into host chrome |

> **Why three scopes:** `customCSS` injection is shared by default — a `.chat-message { ... }` rule written at the global scope will affect both the host's chat AND any child page that happens to have a `.chat-message` class. Splitting by scope avoids leak.

### Sample (drewaltizer-wippy reference implementation)

This is the canonical full-theming reference. See `C:/Projects/drewaltizer-wippy/src/drewapp/deps/_index.yaml` (the `facade` dependency entry) for the live source.

```yaml
- name: facade
  kind: ns.dependency
  component: wippy/facade
  parameters:
    - name: server
      value: app:gateway
    - name: router
      value: app:api.public
    - name: app_title
      value: Keeper
    - name: app_icon
      value: "tabler:camera"
    - name: hide_nav_bar
      value: "true"

    # Full palette: neutrals + accents + severities + custom --k-* extensions
    - name: css_variables
      value: |
        {
          "--p-primary": "#4f8ef7",
          "--p-primary-color": "#4f8ef7",
          "--p-primary-hover-color": "#5a9af8",
          "--p-info":     "#4f8ef7",
          "--p-danger":   "#f44336",
          "--p-warn":     "#ffc107",
          "--p-accent":   "#ff9800",
          "--p-success":  "#4caf50",
          "--p-surface-0":   "#ffffff",
          "--p-surface-50":  "#fafafa",
          "--p-surface-100": "#f2f2f2",
          "--p-surface-200": "#e2e2e2",
          "--p-surface-300": "#cccccc",
          "--p-surface-400": "#9a9a9a",
          "--p-surface-500": "#6b6b6b",
          "--p-surface-600": "#4a4a4a",
          "--p-surface-700": "#383838",
          "--p-surface-800": "#2c2c2c",
          "--p-surface-900": "#242424",
          "--p-surface-950": "#1a1a1a",
          "--p-text-muted-color":              "#888888",
          "--p-content-border-color":          "var(--p-surface-700)",
          "--p-form-field-focus-border-color": "var(--p-primary)",
          "--p-form-field-border-radius":      "5px",
          "--p-button-border-radius":          "4px",
          "--p-card-border-radius":            "6px",
          "--p-dialog-border-radius":          "10px",
          "--p-chip-border-radius":            "12px",
          "--p-badge-border-radius":           "10px",
          "--k-surface-raised":                "#1e1e1e",
          "--k-wav":                           "#9c59d1",
          "--k-avatar-gradient":               "linear-gradient(135deg,#4f8ef7,#9c59d1)",
          "--k-press-approved-bg":             "#1a2e1a",
          "--k-press-unapproved-bg":           "#311515"
        }

    # App-wide font family + custom component variants. Applied to host AND children.
    - name: custom_css
      value: |
        body, :root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        /* Keyboard shortcut pill */
        kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: var(--p-surface-900);
          background: var(--p-surface-100);
          border: 1px solid var(--p-surface-300);
          border-radius: 3px;
        }
        @media (prefers-color-scheme: dark) {
          kbd {
            color: var(--p-surface-100);
            background: var(--p-surface-800);
            border-color: var(--p-surface-700);
          }
        }

        /* Outlined.tinted button — persistent tint */
        .p-button.p-button-outlined.p-button-tinted {
          background: color-mix(in srgb, var(--p-primary) 13%, transparent);
        }
        .p-button.p-button-outlined.p-button-tinted:enabled:hover {
          background: color-mix(in srgb, var(--p-primary) 20%, transparent);
        }

        /* Badge tint variants */
        .p-badge.p-badge-success.p-badge-tinted {
          background: color-mix(in srgb, var(--p-success) 20%, transparent);
          color: var(--p-success);
          border: 1px solid color-mix(in srgb, var(--p-success) 40%, transparent);
        }

    # Host-only chrome tweaks. Use BEM classes scoped to `.wippy-host-app`.
    - name: host_custom_css
      value: |
        .wippy-host-app .session-selector { display: none; }
        .wippy-host-app .chat-message__footer { display: none; }

    - name: host_css_variables
      value: '{"--wippy-host-sidebar-width-open":"20rem","--wippy-host-message-radius":"0.5rem"}'
```

### Custom `--k-*` tokens — extending the system

The `--p-*` namespace is reserved for PrimeVue-aligned tokens. For app-specific extensions, use a project-prefixed namespace like `--k-*` (Keeper), `--app-*`, etc. The drewaltizer sample defines `--k-surface-raised`, `--k-wav`, `--k-avatar-gradient`, `--k-press-approved-bg`, `--k-press-unapproved-bg` — they cascade like any CSS variable but don't collide with future `--p-*` additions.

### Component-level overrides via `custom_css`

PrimeVue components expose stable class names (`.p-button`, `.p-button-outlined`, `.p-badge.p-badge-tinted`, `.p-accordionheader`, etc.). You can target them in `custom_css` to add variants, change padding, change border-radius, hide built-ins, etc. See drewaltizer's `_index.yaml:212-409` for ~200 lines of examples covering buttons, badges, accordions, EXIF tables, and gallery tiles.

### Cross-iframe leak — scope with `.wippy-host-app`

`customCSS` is injected into both the host AND every child iframe. A bare `.chat-message { ... }` rule will hit child apps that happen to use the same class. To avoid that:

- Put host-only rules in `host_custom_css` (already scoped server-side)
- Or scope manually: `.wippy-host-app .my-thing { ... }`
- For child-only rules: `children_custom_css`

The host root element carries the `.wippy-host-app` class — child iframes do not — so prefixing with `.wippy-host-app ` is the canonical way to target host-only.

> **The drewaltizer-wippy `src/drewapp/deps/_index.yaml` file is the load-bearing reference.** When in doubt about full-theming syntax, read that file. It encodes the canonical mental model: facade-driven, three scopes, scoped BEM, custom `--k-*` extensions.

---

## Level 3 — Per-page theme override (configOverrides / runtime)

**You want:** a single page (one of many) that looks different. A demo page with a contrasting palette, an A/B test variant, a brand take-over for one experimental embed.

**You change:** that page's `package.json` (declarative) **or** set runtime overrides before `proxy.js` loads.

**You do NOT change:** the facade. Per-page overrides are local to the iframe that hosts the page; nothing else is affected.

### Mechanism A — Declarative (registry entry YAML, primary)

The canonical place for per-page overrides is the `meta.config_overrides` block of the page's `registry.entry` YAML. Wippy compiles this block into the `WippyPageEntry.configOverrides` field that the host reads at request time and injects into the iframe srcdoc — no rebuild required to change theming.

```yaml
# src/<yourapp>/views/_index.yaml
- name: iframe-demo-themed
  kind: registry.entry
  meta:
    type: view.page
    name: iframe-demo-themed
    title: Iframe Demo (Custom Palette)
    url: /app
    base_path: app/iframe-demo
    entry_point: app.html
    config_overrides:
      customization:
        cssVariables:
          "--p-primary":         "#9c59d1"
          "--p-primary-color":   "#9c59d1"
          "--p-content-background": "#1a0d22"
          "@light":
            "--p-content-background": "#faf5ff"
            "--p-text-color":         "#1a0d22"
          "@dark":
            "--p-content-background": "#1a0d22"
            "--p-text-color":         "#f4f0ff"
        customCSS: |
          .demo-banner { background: var(--p-primary-color); color: var(--p-primary-contrast-color); padding: 0.5rem 1rem; }
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

> **Shape note.** `config_overrides` (snake-case in YAML — Wippy converts to `configOverrides` for the JS API) matches the `AppConfigOverrides` interface from `@wippy-fe/proxy`: `cssVariables`, `customCSS`, `i18n`, `iconSets` all nest under `customization`. Sibling fields like `axiosDefaults`, `routePrefix`, `apiRoutes` sit at the top level of `config_overrides`. The CSS variable map keys themselves stay as written (`--p-*`, `@dark`, `@light`).

> **Why YAML over package.json.** YAML is registry-native — operators can patch `config_overrides` from a customer-specific overlay or a Wippy admin tool without rebuilding the FE bundle. Lua tools and other modules can also `registry:get` the entry and read the same block. package.json `wippy.configOverrides` (below) is a duplicate for the host-less rendering path, not the source of truth.

> **Dual-mode `@dark` / `@light` keys.** `cssVariables` accepts two special keys — `@dark` and `@light`. Their values are flat string maps that compile to `@media (prefers-color-scheme: dark) { :root { ... } }` and the matching light-mode media query. **They are NOT triggered by a `[data-theme="dark"]` attribute** — only by the OS preference. Use `@dark`/`@light` for the bulk of mode-specific theming (palette swaps, component-token overrides); the top level of `cssVariables` holds defaults that don't depend on mode.

### Mechanism A2 — package.json mirror (host-less mode)

Duplicate the same shape under `wippy.configOverrides` in the page's `package.json`:

```jsonc
{
  "name": "@example/iframe-demo",
  "wippy": {
    "type": "page",
    "title": "Iframe Demo",
    "path": "dist/app.html",
    "configOverrides": {
      "customization": {
        "cssVariables": { "...same as YAML...": "" }
      }
    }
  }
}
```

The package.json copy is what renders the page when no Wippy host is present — for example, the standalone dev-proxy preview, a unit test that mounts `app.html` directly, or any environment where the iframe is loaded without the host's srcdoc-injection step. With a host present, the YAML wins (because the host applies it via `WippyPageEntry.configOverrides` before the iframe boots); the package.json copy is then redundant but harmless.

**Keep both copies in sync.** When you edit one, edit the other. The YAML block is the canonical source.

### Mechanism B — Runtime (`window.__WIPPY_CONFIG_OVERRIDES__`)

Set the global before `proxy.js` runs. Useful when the override depends on a query param, a feature flag, or test harness state.

```html
<!-- app.html (head section, BEFORE the proxy script tag) -->
<script>
  // Read a query param: ?theme=purple → load a purple variant
  const params = new URLSearchParams(window.location.search)
  if (params.get('theme') === 'purple') {
    window.__WIPPY_CONFIG_OVERRIDES__ = {
      customization: {
        cssVariables: {
          '--p-primary':       '#9c59d1',
          '--p-primary-color': '#9c59d1',
        },
        customCSS: '.demo-banner { background: var(--p-primary-color); }',
      },
    }
  }
</script>
<!-- The host's @wippy/scripts injection happens here -->
<script type="text/javascript" data-role="@wippy/scripts"></script>
```

### Merge semantics — what overrides what

When the host applies AppConfig (in order, last writer wins):

1. `theme-config.css` defaults (the dev-time fallback)
2. Facade `css_variables` / `custom_css` (host-wide)
3. Page `wippy.configOverrides` (declarative, baked into the page)
4. `window.__WIPPY_CONFIG_OVERRIDES__` (runtime, if set before proxy loads)

For object-shape fields:

| Field | Merge behavior |
|---|---|
| `cssVariables` | **Replace** — the override map fully replaces the AppConfig map (write the full set you want, don't expect partial merge) |
| `customCSS` | **Replace** — concat into one block when you write it; the override replaces wholesale |
| `icons` / `iconSets` | **Additive** — merged with facade-provided icons |
| `feature.*` | **Deep merge** — boolean flags merged per key |

### Sample wired into iframe-demo

`app-template/frontend/applications/iframe-demo/` is the working demo. Its `package.json` description says "theme override support"; the chart and mermaid pages use `var(--p-primary)`, `var(--p-danger)`, etc., so an override visibly flips them. Wire-up sample:

```jsonc
// app-template/frontend/applications/iframe-demo/package.json
{
  "wippy": {
    "type": "page",
    "title": "Iframe Demo",
    "configOverrides": {
      "customization": {
        "cssVariables": {
          "--p-primary":         "#9c59d1",
          "--p-primary-color":   "#9c59d1",
          "--p-info":            "#06b6d4",
          "--p-danger":          "#dc2626",
          "--p-warn":            "#facc15",
          "--p-success":         "#16a34a",
          "--p-content-background": "#1a0d22",
          "--p-text-color":      "#f4f0ff"
        }
      }
    }
  }
}
```

Open the iframe-demo page side-by-side with the main app — same component palette, fully different look. That's Level 3 in action.

### When NOT to use this

- **Don't ship per-page overrides as your *primary* theming**. If most of your app is purple-flavored, the facade is the right place — then per-page overrides are reserved for genuine exceptions.
- **Don't override `--p-surface-*` per-page unless you also override the semantic variables that depend on them**. The semantic vars (`--p-text-color`, `--p-content-background`) reference different `--p-surface-N` per mode; overriding only the surfaces, not the semantic mappings, can produce broken contrast in the opposite mode.
- **Don't use Mechanism B (runtime) when Mechanism A (declarative) works**. Declarative is reproducible across reloads, surfaces in code review, and doesn't depend on script-load order.

---

# Reference

The remaining sections are the precise contract: which variables exist, which Tailwind utilities they back, how dark mode flips, and which colors actually pass WCAG. Use these to verify your overrides.

## Iconography (Iconify discipline)

Wippy apps follow a single icon workflow.

1. **Use `@iconify/vue` `<Icon>` for every reusable icon.** Don't inline `<svg>`, don't ship icon-font CSS (Tabler-icons-font, Material Icons font, FontAwesome CSS). The proxy and the build assume Iconify; mixing systems creates a/b drift and bundle bloat.

   ```vue
   <Icon icon="tabler:home" />
   <Icon icon="lucide:settings-2" />
   <Icon icon="phosphor:database-fill" />
   ```

2. **Prefer permissive packs.** All free for commercial use, all available via Iconify's catalog:

   | Pack | Licence | Approx. size | Style |
   |---|---|---|---|
   | `tabler` | MIT | ~5,400 | Outline, 24px grid — keeper / app-template default |
   | `lucide` | ISC | ~1,500 | Clean line |
   | `phosphor` | MIT | ~7,000 | 6 weight variants |
   | `material-symbols` | Apache 2.0 | ~3,000+ | Google's modern set |
   | `mdi` | Apache 2.0 | ~7,000 | Material Design Icons community pack |
   | `heroicons` | MIT | ~300 | Outline + solid (Tailwind team) |

3. **Don't use commercial-licensed packs** (FontAwesome Pro, etc.) without licence verification per developer seat. Iconify hosts MIT/CC-BY subsets of FontAwesome (`fa6-solid` / `fa6-regular` / `fa6-brands`) — use those instead.

4. **Custom icons** — when no permissive pack covers a symbol:

   - Declare them in `AppConfig.customization.icons` (facade global if shared across modules; `config_overrides.customization.icons` for per-page additions — safe because `icons` MERGES, not replaces).
   - The bootstrap path in `app.ts` (`config.customization?.icons → addCollection({ prefix: 'custom', icons })`) wires them automatically.
   - **NEVER call `addCollection()` from arbitrary application code.** The bootstrap path is canonical; ad-hoc registrations fragment the registry and the icon may not be found by the same name on the next render.
   - Use sparingly. If you need more than a dozen custom icons, check whether `mdi` or `phosphor` already covers the symbols.

   Example facade param:

   ```yaml
   - name: facade
     kind: ns.dependency
     component: wippy/facade
     parameters:
       - name: icons
         value: '{"keeper-shield":{"body":"<path d=\"M ... Z\" />","width":24,"height":24}}'
   ```

   At call site:

   ```vue
   <Icon icon="custom:keeper-shield" />
   ```

5. **Don't mix font-icon CSS with Iconify** in the same app. Pick one (and pick Iconify).

The compliance checklist enforces this:
- REJECT 46c — raw `<svg>` for reusable iconography.
- REJECT 46d — `addCollection()` outside the canonical `app.ts` bootstrap.
- REJECT 46e — icon-font CSS shipped alongside Iconify.

---

## Reference — CSS variables

All variables are defined in `theme-config.css` and set on `:root`. At runtime, the host injects the real theme — these serve as the dev-time fallback and contract.

### Primary palette (11 vars)

Base: `--p-primary` (default: `rgb(0, 95, 178)`)

| Variable | Value |
|---|---|
| `--p-primary-50` | `color-mix(in srgb, var(--p-primary) 5%, white)` |
| `--p-primary-100` | `color-mix(in srgb, var(--p-primary) 10%, white)` |
| `--p-primary-200` | `color-mix(in srgb, var(--p-primary) 20%, white)` |
| `--p-primary-300` | `color-mix(in srgb, var(--p-primary) 30%, white)` |
| `--p-primary-400` | `color-mix(in srgb, var(--p-primary) 40%, white)` |
| `--p-primary-500` | `var(--p-primary)` (base) |
| `--p-primary-600` | `color-mix(in srgb, var(--p-primary) 80%, black)` |
| `--p-primary-700` | `color-mix(in srgb, var(--p-primary) 70%, black)` |
| `--p-primary-800` | `color-mix(in srgb, var(--p-primary) 60%, black)` |
| `--p-primary-900` | `color-mix(in srgb, var(--p-primary) 50%, black)` |
| `--p-primary-950` | `color-mix(in srgb, var(--p-primary) 40%, black)` |

### Secondary palette (11 vars)

Base: `--p-secondary` (default: `#6f7385`)

Same numbered scale pattern as primary (50–950) using `color-mix`.

### Surface palette (13 vars)

| Variable | Light value | Dark value |
|---|---|---|
| `--p-surface-0` | `#fff` | `#fff` |
| `--p-surface-50` | `#fafafa` | `#fafafa` |
| `--p-surface-100` | `#f4f4f5` | `#f4f4f5` |
| `--p-surface-200` | `#e4e4e7` | `#e4e4e7` |
| `--p-surface-300` | `#d4d4d8` | `#d4d4d8` |
| `--p-surface-400` | `#a1a1aa` | `#a1a1aa` |
| `--p-surface-500` | `#71717a` | `#71717a` |
| `--p-surface-600` | `#52525b` | `#545250` (warm) |
| `--p-surface-700` | `#3f3f46` | `#403e3c` (warm) |
| `--p-surface-800` | `#27272a` | `#2b2927` (warm) |
| `--p-surface-900` | `#18181b` | `#1c1a19` (warm) |
| `--p-surface-950` | `#09090b` | `#0f0e0d` (warm) |

**Fixed light-to-dark scale** — 0 is always lightest, 950 always darkest. The scale does NOT flip with dark mode. In dark mode, only 600–950 get warmer undertones.

### Semantic variables (15 vars)

These **flip with dark mode** — use these for theme-dependent styling.

| Variable | Light | Dark |
|---|---|---|
| `--p-primary-color` | `primary-500` | `primary-400` |
| `--p-primary-contrast-color` | `surface-0` | `surface-900` |
| `--p-primary-hover-color` | `primary-600` | `primary-300` |
| `--p-primary-active-color` | `primary-700` | `primary-200` |
| `--p-text-color` | `surface-700` | `surface-0` |
| `--p-text-hover-color` | `surface-800` | `surface-0` |
| `--p-text-muted-color` | `surface-500` | `surface-400` |
| `--p-text-hover-muted-color` | `surface-600` | `surface-300` |
| `--p-content-background` | — | `surface-900` (via host) |
| `--p-content-border-color` | `surface-200` | `surface-700` |
| `--p-content-hover-background` | `surface-100` | `surface-800` |
| `--p-content-hover-color` | `surface-800` | `surface-0` |
| `--p-highlight-background` | `primary-50` | `primary-400 @ 16%` |
| `--p-highlight-color` | `primary-700` | `white @ 87%` |
| `--p-highlight-focus-background` | `primary-100` | `primary-400 @ 24%` |
| `--p-highlight-focus-color` | `primary-800` | `white @ 87%` |
| `--p-content-border-radius` | `6px` | `6px` |

## Reference — Tailwind utility classes

Provided by `tailwindcss-primeui` plugin (included in the shared Tailwind preset).

### Color utilities

Work with `bg-`, `text-`, `border-`, `outline-`, `ring-` prefixes:

| Class suffix | Maps to |
|---|---|
| `primary` | `--p-primary-color` |
| `primary-emphasis` | `--p-primary-hover-color` |
| `primary-emphasis-alt` | `--p-primary-active-color` |
| `primary-contrast` | `--p-primary-contrast-color` |
| `primary-{0,50,100,...,950}` | Full primary shade range |
| `surface-{0,50,100,...,950}` | Full surface shade range |

### Semantic utilities

| Class | Maps to |
|---|---|
| `.text-color` | `--p-text-color` |
| `.text-color-emphasis` | `--p-text-hover-color` |
| `.text-muted-color` | `--p-text-muted-color` |
| `.text-muted-color-emphasis` | `--p-text-hover-muted-color` |
| `.bg-emphasis` | Emphasis background + text |
| `.bg-highlight` | Highlighted state (selected items, active rows) |
| `.bg-highlight-emphasis` | Emphasized highlight |
| `.border-surface` | `--p-content-border-color` |
| `.rounded-border` | `--p-content-border-radius` |

### Animation utilities

| Class | Description |
|---|---|
| `.animate-fadein` | Fade in |
| `.animate-fadeout` | Fade out |
| `.animate-slidedown` | Slide down |
| `.animate-slideup` | Slide up |
| `.animate-scalein` | Scale in |
| `.animate-fadeinleft` | Fade in from left |
| `.animate-fadeinright` | Fade in from right |
| `.animate-fadeinup` | Fade in from below |
| `.animate-fadeindown` | Fade in from above |
| `.animate-duration-{ms}` | Animation duration |
| `.animate-delay-{ms}` | Animation delay |
| `.animate-ease-*` | Easing functions |

### Severity & accent color utilities (MANDATORY for semantic colors)

**Rule: Always use semantic severity classes over raw Tailwind color names when the color conveys meaning.** If a color represents an error, success, warning, info, or help state, you MUST use `danger-*`, `success-*`, `warn-*`, `info-*`, or `help-*` — never `red-*`, `green-*`, `orange-*`, `sky-*`, or `purple-*`. Raw Tailwind colors are only appropriate for purely decorative use where no semantic meaning is attached. Semantics first, decorative later.

#### Semantic vs decorative — the inverse rule

The rule above is a one-way implication: **semantic intent ⇒ semantic token.** The reverse is NOT true: **semantic tokens carry meaning, so do not force them into decorative contexts.** Reaching for `--p-danger-500` because you want a "red-ish" chart category, or for `--p-info-500` because the UI element happens to be blue, is the inverse anti-pattern — it tells the reader "this is dangerous / informational" when the color was just visual distinction.

| Pattern | Use | NOT |
|---|---|---|
| OK / Confirm / Submit / Save action | `--p-primary-*` (or `<Button severity="primary">`) | `--p-success-*` (success is for outcomes, not actions) |
| Cancel / Dismiss / Neutral action | `--p-secondary-*` (or surface-N for a quiet button) | `--p-danger-*` (danger is for destructive, not just "the other button") |
| Destructive action / "delete forever" / irreversible | `--p-danger-*` | `--p-warn-*` (warn implies it's recoverable) |
| Error message / failed operation / form invalid | `--p-danger-*` | hardcoded red |
| Warning state / non-fatal caution / "are you sure" | `--p-warn-*` | `--p-danger-*` (over-escalates urgency) |
| Success state / completion / form valid | `--p-success-*` | hardcoded green |
| Informational message / inline reference / metadata | `--p-info-*` | `--p-help-*` (help is lore/hints, not facts) |
| Help / lore / tooltip / pedagogical content | `--p-help-*` | `--p-info-*` |
| Highlight / focal point / special callout | `--p-accent-*` | `--p-primary-*` (primary is the brand action color) |
| Selected item / current row / focused state | `--p-primary-*` (action context) or `--p-highlight-*` | `--p-accent-*` for ALL highlights — accent is for "special" |
| Categorical chart distinguisher (no semantic meaning) | decorative palette (see below) | severity tokens — they imply meaning the category doesn't have |
| Arbitrary tag-color picker (user picks from a palette) | decorative palette | severity tokens |
| Random hash → color (avatar tinting, kind-of-thing icon) | decorative palette | severity tokens |

**Decorative palette options** (when the context is genuinely just "visually distinguish N things"):

1. **Define a decorative palette in the facade** (preferred). Add `--k-chart-{1..N}` or named tokens (`--k-decorative-purple`, `--k-decorative-cyan`) to `css_variables` in the `wippy/facade` dependency — same waterfall location as the brand palette. Document the intent in the YAML comment.
2. **`color-mix()` between severity tokens** as a deliberate decorative blend, ONLY when the blend reads as "between A and B" semantically. Don't blend `danger + success` to make pink and call it decorative — that's a category lie.
3. **Raw hex literals with a `/* decorative — no semantic meaning */` comment** when the palette is a one-off (specific chart, named category set) and adding a token is overkill. Wrap in a `@media (prefers-color-scheme: dark)` block if the hex doesn't read well in both modes.

**Anti-pattern (do NOT do):** color-mixing severity tokens to manufacture a categorical palette. `color-mix(in srgb, var(--p-warn-500) 70%, var(--p-danger-500) 30%)` to produce "orange" for a chart category isn't a semantic blend — it ties the chart color to two unrelated severities, and if the brand later retints `--p-danger`, the chart will shift unpredictably. Use a decorative palette instead.

Added by the shared Tailwind preset via `theme.extend.colors`. Each has a full 50–950 shade scale backed by CSS variables.

| Family | Base variable | Default color | Purpose |
|--------|--------------|---------------|---------|
| `danger` | `--p-danger` | `rgb(239, 68, 68)` (red-500) | Errors, destructive actions |
| `success` | `--p-success` | `rgb(34, 197, 94)` (green-500) | Success states, confirmations |
| `warn` | `--p-warn` | `rgb(249, 115, 22)` (orange-500) | Warnings, caution |
| `info` | `--p-info` | `rgb(14, 165, 233)` (sky-500) | Informational messages |
| `help` | `--p-help` | `rgb(168, 85, 247)` (purple-500) | Help, hints |
| `accent` | `--p-accent` | `rgb(20, 184, 166)` (teal-500) | Highlights, special callouts |

Usage with Tailwind prefixes (`bg-`, `text-`, `border-`, `outline-`, `ring-`):

```
bg-danger-500   text-success-700   border-warn-200
bg-info-50      text-help-400      border-accent-300
```

PrimeVue component CSS (button, tag, badge, toast, message, password) references these semantic names instead of hardcoded Tailwind color names.

**Overriding:** Set the base variable on `:root` to retheme all severity shades:

```css
:root {
  --p-danger: rgb(220, 38, 38);  /* custom danger base */
}
```

The full 50–950 scale auto-derives via `color-mix()`. No dark-mode override block is needed — component CSS picks the right shade per mode (e.g., `dark:bg-danger-400`). You may optionally override the base in `@media (prefers-color-scheme: dark)` for mode-specific tuning.

### Secondary color utilities

Added by the shared Tailwind preset via `theme.extend.colors`:

```
bg-secondary-{50..950}
text-secondary-{50..950}
border-secondary-{50..950}
```

## Reference — Dark mode

Variables switch at `@media (prefers-color-scheme: dark)`. Key changes:

- `--p-primary` base shifts from `rgb(0, 95, 178)` to `rgb(0, 125, 178)` (brighter)
- `--p-primary-color` shifts from `primary-500` to `primary-400`
- `--p-content-background` shifts to `surface-900` (via host injection)
- `--p-text-color` shifts from `surface-700` to `surface-0`
- Surface 600–950 get warmer undertones in dark mode

### Rules

- **Use semantic variables** (`--p-text-color`, `--p-content-background`) for colors that should flip with dark mode.
- **Use `surface-0`/`surface-950`** only when you explicitly need the fixed shade regardless of mode.
- **For derived shades**: `color-mix(in srgb, var(--p-content-background) 85%, var(--p-text-color) 15%)`.
- **Never use `--p-surface-N`** for theme-dependent colors — the numbered scale does NOT flip.

## Reference — PrimeVue styling (opt-in)

The `primevue/` directory in `@wippy-fe/theme` contains CSS files that style PrimeVue component tags (`.p-button`, `.p-datatable`, etc.) using Tailwind `@apply` directives. These are **only needed if your component uses PrimeVue tags**.

### Setup

1. Add `primevue` as a dependency
2. Import `PrimeVuePlugin` from `@wippy-fe/theme/primevue-plugin` — installs PrimeVue with `{ theme: 'none' }`
3. Import PrimeVue CSS: `@import "@wippy-fe/theme/primevue/tailwind.css"` in your styles
4. Add `'primeVueCssUrl'` to `hostCssKeys` so the host injects PrimeVue CSS at runtime

### How it works

The CSS files use theme variables via Tailwind classes. Example from `button.css`:

```css
.p-button {
  @apply bg-primary text-primary-contrast border-primary
    enabled:hover:bg-primary-emphasis enabled:active:bg-primary-emphasis-alt ...
}
```

The `tailwind.css` master file imports all component CSS files organized by category (form, button, data, overlay, menu, panel, file, message, media, misc).

### Available PrimeVue component styles

**Form**: autocomplete, cascadeselect, checkbox, colorpicker, datepicker, iconfield, iftalabel, inputgroup, inputnumber, inputotp, inputtext, floatlabel, knob, listbox, multiselect, password, radiobutton, rating, select, selectbutton, slider, textarea, togglebutton, toggleswitch, treeselect

**Button**: button, buttongroup, speeddial, splitbutton

**Data**: datatable, dataview, paginator, picklist, orderlist, organizationchart, timeline, tree, treetable

**Overlay**: confirmdialog, confirmpopup, dialog, drawer, popover, tooltip

**Menu**: breadcrumb, contextmenu, dock, menu, menubar, megamenu, panelmenu, tieredmenu

**Panel**: accordion, card, divider, fieldset, panel, scrollpanel, splitter, stepper, tabs, toolbar

**File**: fileupload

**Message**: message, toast

**Media**: carousel, galleria, image, imagecompare

**Misc**: avatar, badge, blockui, chip, inplace, metergroup, overlaybadge, progressbar, progressspinner, ripple, scrolltop, skeleton, tag, terminal

## Reference — Choosing custom colors (luminosity, WCAG)

When overriding `--p-primary`, `--p-secondary`, or the surface palette, follow these guidelines to ensure contrast and readability across both modes.

### How the shade scale works

The `color-mix()` system blends your base color with white (lighter shades) or black (darker shades). The percentages are fixed:

| Shade | Blend |
|---|---|
| 50 | 5% base + 95% white |
| 100 | 10% base + 90% white |
| 200 | 20% base + 80% white |
| 300 | 30% base + 70% white |
| 400 | 40% base + 60% white |
| **500** | **100% base (no blend)** |
| 600 | 80% base + 20% black |
| 700 | 70% base + 30% black |
| 800 | 60% base + 40% black |
| 900 | 50% base + 50% black |
| 950 | 40% base + 60% black |

This means the base color's luminosity determines the contrast of the **entire scale**. A too-light base produces a washed-out 500 that can't contrast against white text; a too-dark base makes 400 too dim for dark mode.

### Primary color luminosity

The primary base is used at two critical contrast points:

1. **Light mode**: `bg-primary` (500) with `text-primary-contrast` (white) — buttons, badges, checkboxes
2. **Dark mode**: `bg-primary` (400 = 40% base + 60% white) with `text-primary-contrast` (surface-900, near-black)

**Recommended relative luminance for `--p-primary`: 0.05–0.15** (medium-dark, saturated).

| Example | RGB | Rel. luminance | Light contrast (500 vs white) | Dark contrast (400 vs black) |
|---|---|---|---|---|
| Default blue | `rgb(0, 95, 178)` | ~0.10 | ~8.5:1 (AAA) | ~6.8:1 (AA) |
| Deep teal | `rgb(0, 128, 128)` | ~0.14 | ~5.8:1 (AA) | ~8.7:1 (AAA) |
| Indigo | `rgb(79, 70, 229)` | ~0.07 | ~8.0:1 (AAA) | ~5.5:1 (AA) |
| Red | `rgb(185, 28, 28)` | ~0.05 | ~9.2:1 (AAA) | ~4.7:1 (borderline) |
| Forest green | `rgb(22, 101, 52)` | ~0.08 | ~7.2:1 (AAA) | ~6.1:1 (AA) |
| Orange | `rgb(194, 120, 3)` | ~0.18 | ~3.7:1 (FAIL) | ~9.5:1 (AAA) |

**Key constraints:**
- Luminance **> 0.18** → 500 shade is too light for white text (fails WCAG AA 4.5:1 in light mode)
- Luminance **< 0.04** → 400 shade is too dark for dark-on-light text (fails WCAG AA in dark mode)
- The sweet spot is **0.06–0.14** — both modes pass WCAG AA (4.5:1), with most passing AAA (7:1)
- Pure, saturated colors (high chroma) work best. Desaturated/muted colors lose contrast faster

**If your brand color is too light** (e.g., orange, yellow, lime): darken it for `--p-primary` and use the original as a secondary or accent. Light-mode buttons with white text will fail contrast otherwise.

**If your brand color is too dark** (e.g., navy, dark brown): lighten it slightly. The 400 shade in dark mode needs enough contrast against `surface-900`.

### Secondary color luminosity

Secondary is used for muted/deemphasized elements — less critical than primary but still appears in text and borders.

**Recommended relative luminance for `--p-secondary`: 0.10–0.25** (mid-range, desaturated).

The default `#6f7385` (luminance ~0.16) is a muted gray-purple that reads as neutral in both modes. Good secondary colors:
- Are **less saturated** than primary (avoid competing for attention)
- Have **mid-range luminance** so the full shade scale is usable
- Work as `text-secondary-600` on white and `text-secondary-300` on dark backgrounds

### Surface palette

Surfaces are a fixed grayscale ramp — they do NOT flip with dark mode. The semantic variables (`--p-content-background`, `--p-text-color`) reference different points on this scale per mode.

**Light mode assignments:**

| Role | Surface | Hex | Purpose |
|---|---|---|---|
| Page background | 0 | `#ffffff` | Main canvas |
| Card/container background | 0 | `#ffffff` | Content containers |
| Hover background | 100 | `#f4f4f5` | Interactive hover state |
| Border | 200 | `#e4e4e7` | Borders, dividers |
| Muted text | 500 | `#71717a` | Secondary text, labels |
| Body text | 700 | `#3f3f46` | Primary readable text |
| Strong emphasis | 800 | `#27272a` | Headings, hover text |

**Dark mode assignments:**

| Role | Surface | Hex | Purpose |
|---|---|---|---|
| Page background | 900 | `#1c1a19` (warm) | Main canvas |
| Card/container background | 800 | `#2b2927` (warm) | Elevated containers |
| Hover background | 800 | `#2b2927` (warm) | Interactive hover state |
| Border | 700 | `#403e3c` (warm) | Borders, dividers |
| Muted text | 400 | `#a1a1aa` | Secondary text, labels |
| Body text | 0 | `#ffffff` | Primary readable text |
| Strong emphasis | 0 | `#ffffff` | Headings, hover text |

**Dark mode warm tones** (600–950): The default surfaces shift from cool zinc grays to slightly warm brown-grays in dark mode. This reduces visual fatigue on dark backgrounds. The shift is subtle — `#545250` vs `#52525b` for surface-600 — but creates a warmer, more natural feel.

When providing custom surfaces, keep these rules:
- **0 must always be `#ffffff`** (or very near it) — used as contrast text in dark mode
- **950 must always be very dark** — used as the maximum-contrast anchor
- **The scale must increase monotonically in darkness** — no inversions
- **600–950 should shift warm** in dark mode for visual comfort (optional but recommended)
- **Don't change 0–500** between modes unless you have a specific reason — the semantic variables handle mode switching

### Contrast verification

After choosing colors, verify these critical pairs meet WCAG AA (4.5:1 minimum):

| Pair | Light mode | Dark mode |
|---|---|---|
| `bg-primary` + `text-primary-contrast` | primary-500 vs white | primary-400 vs surface-900 |
| `bg-highlight` + text | primary-50 vs primary-700 | primary-400@16% vs white@87% |
| Body text on background | surface-700 vs white | surface-0 vs surface-900 |
| Muted text on background | surface-500 vs white | surface-400 vs surface-900 |

Quick formula for relative luminance of an sRGB color:
```
L = 0.2126 * R' + 0.7152 * G' + 0.0722 * B'
where R' = (R/255)^2.2  (simplified gamma)

Contrast ratio = (L_lighter + 0.05) / (L_darker + 0.05)
```

WCAG AA requires 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+ regular).

## Reference — Host UI customization (`--wippy-host-*` + BEM classes)

The Wippy host exposes CSS custom properties and BEM class names on its core UI components. Override these via the facade's `host_css_variables` / `host_custom_css` parameters (Level 2) or via `AppConfig.customization.cssVariables` / `customCSS` (Level 3) to restyle the host without forking.

> **Important:** Because `customCSS` and `cssVariables` are injected into both the host AND all nested child iframes by default, always scope host-only overrides to `.wippy-host-app`. For example, use `.wippy-host-app .chat-message { ... }` — never `.chat-message { ... }` alone, or the styles will leak into child iframes. (Putting them in `host_custom_css` does this server-side.)

### Layout & sidebar

| Variable | Default | Description |
|---|---|---|
| `--wippy-host-sidebar-width-open` | `16rem` | Sidebar width when expanded |
| `--wippy-host-sidebar-width-closed` | `3.5rem` | Sidebar width when collapsed |

**BEM classes** (scope with `.wippy-host-app`):

| Class | Element |
|---|---|
| `.layout` | Root layout wrapper |
| `.layout__sidebar` | Sidebar container |
| `.layout__sidebar-header` | Sidebar header (logo + toggle) |
| `.layout__sidebar-nav` | Navigation list area |
| `.layout__main` | Main content area (right of sidebar) |

### Splitter gutter

The resizable panel divider between main content and the right panel.

| Variable | Default | Description |
|---|---|---|
| `--wippy-host-splitter-width` | `1px` | Visible line width |
| `--wippy-host-splitter-hit-area` | `10px` | Draggable hit area width (transparent) |
| `--wippy-host-splitter-color` | `var(--p-surface-200)` (light) / `var(--p-surface-600)` (dark) | Line color |

### Chat messages

| Variable | Default | Description |
|---|---|---|
| `--wippy-host-message-radius` | `1rem` | Message bubble border radius |
| `--wippy-host-message-padding-x` | `1rem` | Message horizontal padding |
| `--wippy-host-message-padding-y` | `0.5rem` | Message vertical padding |
| `--wippy-host-message-user-bg` | `var(--p-primary-50)` | User message background |
| `--wippy-host-message-agent-bg` | `var(--p-yellow-50)` (light) / `var(--p-surface-800)` (dark) | Agent message background |
| `--wippy-host-tool-bg` | `var(--p-help-50)` | Tool call background |
| `--wippy-host-tool-border` | `var(--p-help-300)` | Tool call left border |
| `--wippy-host-avatar-size` | `2rem` | Message avatar diameter |

**BEM classes** (scope with `.wippy-host-app`):

| Class | Element |
|---|---|
| `.chat-message` | Message row container |
| `.chat-message--user` | User message modifier |
| `.chat-message--agent-message` | Agent message modifier |
| `.chat-message--tool` | Tool call message modifier |
| `.chat-message--error` | Error message modifier |
| `.chat-message__avatar` | Avatar wrapper |
| `.chat-message__avatar-icon` | Avatar icon circle |
| `.chat-message__content` | Message bubble |
| `.chat-message__body` | Message text content |
| `.chat-message__footer` | Timestamp row |
| `.chat-message__tool-name` | Tool name label |
| `.chat-message__tool-icon` | Tool icon |
| `.chat-message__agent-content` | Agent name system line |
| `.chat-message__model-content` | Model name system line |
| `.chat-message__files` | Attached files row |
| `.chat-tool-group` | Inline tool call badge group |
| `.chat-tool-group__badge` | Individual tool badge |
| `.chat-tool-group__badge--success` | Completed tool badge |
| `.chat-tool-group__badge--error` | Failed tool badge |
| `.chat-tool-group__badge--processing` | In-progress tool badge |
| `.chat-tool-group__icon` | Badge icon |

### Chat input

**BEM classes** (scope with `.wippy-host-app`):

| Class | Element |
|---|---|
| `.chat-input` | Input bar container |
| `.chat-input__group` | Input field + buttons wrapper |
| `.chat-input__textarea` | Message textarea |
| `.chat-input__attach-button` | Attachment button |
| `.chat-input__send-button` | Send button |
| `.chat-input__stop-button` | Stop generation button |
| `.chat-input__upload-list` | Upload queue list |
| `.chat-input__prompts` | Suggested prompts area |

### Chat container

**BEM classes** (scope with `.wippy-host-app`):

| Class | Element |
|---|---|
| `.chat-container` | Outer chat wrapper |
| `.chat-container--selected` | Has active session |
| `.chat-container--non-selected` | No session selected |
| `.chat-container__empty-state` | Empty state wrapper |
| `.chat-container__empty-state-icon` | Empty state icon |
| `.chat-container__empty-state-title` | Empty state heading |
| `.chat-container__empty-state-description` | Empty state text |
| `.chat-container__drop-zone` | File drag-and-drop overlay |
| `.chat-container__drop-zone-icon` | Drop zone icon |

### Session selector

**BEM classes** (scope with `.wippy-host-app`):

| Class | Element |
|---|---|
| `.session-selector` | Selector wrapper |
| `.session-selector__dropdown` | Dropdown component |
| `.session-selector__option` | Session option row |
| `.session-selector__active-dot` | Active session indicator |

### Root

| Class | Element |
|---|---|
| `.wippy-host-app` | Application root element — scope all host-only CSS overrides to this |

### Example: custom-styled host

```css
/* Via facade host_custom_css, OR via AppConfig.customization.customCSS */

/* Variables are already prefixed — no scoping needed */
:root {
  --wippy-host-message-radius: 0.5rem;
  --wippy-host-message-user-bg: #e0f2fe;
  --wippy-host-sidebar-width-open: 20rem;
}

/* Class selectors MUST be scoped to .wippy-host-app */
.wippy-host-app .chat-message__footer {
  display: none; /* hide timestamps */
}

.wippy-host-app .session-selector {
  display: none; /* hide session picker */
}
```

---

## Anti-patterns (REJECT list)

These are the rules that get violated most often. Treat each as a hard REJECT in code review.

### Color / semantic vars

- ❌ Hardcoded hex/rgb for semantic colors: `color: #ef4444`, `background: rgb(34, 197, 94)`, `border: 1px solid #f59e0b`. **Always** use `var(--p-danger-*)` / `var(--p-success-*)` / `var(--p-warn-*)` / `var(--p-info-*)` / `var(--p-help-*)` / `var(--p-accent-*)`.
- ❌ Raw Tailwind color classes for semantic meaning: `text-red-500`, `bg-green-100`, `border-yellow-300`, `text-purple-600`. Use severity classes: `text-danger-500`, `bg-success-100`, `border-warn-300`, `text-help-600`.
- ❌ Numbered `--p-surface-N` for theme-dependent semantic colors (`color: var(--p-surface-700)` for "muted text"). Use semantic aliases: `var(--p-text-color)`, `var(--p-text-muted-color)`, `var(--p-content-background)`, `var(--p-content-border-color)`, `var(--p-highlight-*)`.
- ❌ `var(--p-X, #hex)` fallbacks in **page apps** — the iframe is always populated by the host; a fallback masks misconfiguration.
- ❌ Component-level custom color palettes (`--my-app-red`, `--feature-blue`) declared without a documented design reason. The point of inheritance is that you DON'T do this.

### Placement / scope

- ❌ `:root { --p-* }` overrides inside a child app's `src/styles.css`. The bundle's CSS ships AFTER the host's pipeline and shadows it. Put `--p-*` overrides in the facade (`css_variables`) or per-page `configOverrides.customization.cssVariables`. (REJECT 42b in the compliance checklist.)
- ❌ Raw `.p-button { … }` / `.p-dialog { … }` selectors inside a child app's `src/styles.css`. Same reason. Put PrimeVue selector overrides in `customization.customCSS`. (REJECT 43a.)
- ❌ App-side `<style>` blocks defining `@media (prefers-color-scheme: dark)` rules that retune host vars. The vars in `theme-config.css` already cover dark mode; if you reference vars correctly, dark mode is automatic.
- ❌ Custom CSS at the page level for theme-related concerns. If it's "theme" (color/border/shadow/spacing of a host-styled component), it belongs in the facade, not in `src/styles.css`.

### Components / API

- ❌ Reimplementing a PrimeVue ship from scratch (custom Toast, custom Dialog, custom Accordion, custom Select). Use the PrimeVue component + `customCSS` overrides.
- ❌ PrimeVue's `useToast()` / `useConfirm()` / `<Toast>` / `<ConfirmDialog>` in app code. Use `host.toast(...)` / `host.confirm(...)` — they render in the host chrome, cross iframe boundaries, and inherit theming automatically. (PrimeVue's versions are fine *inside a WC* but not in page apps.)
- ❌ `<Button icon="pi pi-plus">` — the `pi-*` icons are a fixed icon font with no theming. Use a `<Icon>` component (`@iconify/vue`) adjacent to or inside the `<button>`.
- ❌ Components that redeclare `--p-*` vars they should inherit (`:host { --p-primary-500: #abc }`). The whole substrate is built to prevent this.
- ❌ `useToast()` / `useConfirm()` imported from `primevue/usetoast` or `primevue/useconfirm` in any page-app code (vs. `host.toast` / `host.confirm`). Search-and-replace before commit.

### Build / config

- ❌ Importing `primevue/config` directly to install the PrimeVue plugin. Use `@wippy-fe/theme/primevue-plugin` — it installs with `theme: 'none'` so styling stays in the CSS-var system.
- ❌ Adding `primeVueCssUrl` to a WC's `hostCssKeys` when the WC doesn't render PrimeVue components. Adds 455 KB for zero benefit.
- ❌ Setting `proxy.injections.tailwindConfig: true` in a Vite-built app. That knob is for legacy runtime-Tailwind (Play CDN) setups; for any app with a build step, leave it `false`.
- ❌ Externalizing `@wippy-fe/theme` in a WC's Vite config. Theme assets (preset, CSS) need to be bundled into the WC, not loaded from a host import map.

---

## Rules cheatsheet (IF/THEN)

System-prompt-style appendix — drop these into an LLM context or a code-review checklist.

### Color choice

- **IF** you need a danger/success/warn/info/help/accent color **with semantic meaning** (error, success, warning, etc.) → **THEN** `var(--p-{semantic}-{50..950})` or Tailwind `text-{semantic}-500` / `bg-{semantic}-100`. Never `#ef4444`, `#22c55e`, `#f59e0b`, etc.
- **IF** you need a button that performs the **primary action** (OK / Confirm / Submit / Save) → **THEN** `<Button severity="primary">` or `bg-primary-500 text-primary-contrast-color`. Never `--p-success-*` (success = outcome, not action).
- **IF** you need a button that **cancels / dismisses / neutral** → **THEN** `<Button severity="secondary">` or `bg-secondary-500` (or surface-N for a quiet button). Never `--p-danger-*` (danger = destructive, not "the other button").
- **IF** the color is **purely decorative** (categorical chart, arbitrary tag color, random hash → color) → **THEN** define `--k-chart-N` or `--k-decorative-{name}` tokens in the facade, OR use raw hex with a `/* decorative — no semantic meaning */` comment. NEVER force severity tokens into decorative contexts (`--p-danger-500` for "red chart category" is a category lie).
- **IF** you need primary text on background → **THEN** `var(--p-text-color)` for foreground, `var(--p-content-background)` for background. Never numbered surfaces for this.
- **IF** you need muted/secondary text → **THEN** `var(--p-text-muted-color)`. Never `var(--p-surface-500)` directly.
- **IF** the design needs a shade between two existing **semantic** tokens → **THEN** `color-mix(in srgb, var(--p-X) 40%, var(--p-Y))` when the blend reads semantically (e.g. mixing danger + warn for "critical warning"). Don't `color-mix` to manufacture a decorative palette.
- **IF** you've tried levels 1–3 and still need a brand-specific color → **THEN** define `--k-app-{name}` in `src/styles.css` with a header comment naming the design owner and date. Wrap in `@media (prefers-color-scheme: dark)` for dark-mode variant.

### Components

- **IF** you need a button → **THEN** PrimeVue `<Button>` or `<button class="…">` with severity classes. Never a clickable `<div>`.
- **IF** you need a modal → **THEN** PrimeVue `<Dialog>` + `useDialog()`. Never hand-rolled `<div>` + backdrop.
- **IF** you need a toast → **THEN** `host.toast(...)`. Never `useToast()` from PrimeVue in app code.
- **IF** you need a confirm prompt → **THEN** `host.confirm(...)`. Never `window.confirm` or `useConfirm()` in app code.
- **IF** an icon-only button → **THEN** `<button aria-label="..."><Icon name="..." /></button>`. Never `title=` alone, never PrimeVue's `icon=` prop.

### Web components

- **IF** building a WC that renders a single button/badge/label → **THEN** `hostCssKeys: ['themeConfigUrl']`. Drop the rest.
- **IF** the WC renders PrimeVue components inside Shadow DOM → **THEN** add `'primeVueCssUrl'`.
- **IF** the WC renders markdown → **THEN** add `'markdownCssUrl'`.
- **IF** the WC has scrollable panels → **THEN** add `'iframeCssUrl'`.
- **IF** the WC dispatches events the parent should receive → **THEN** `new CustomEvent(name, { detail, bubbles: true, composed: true })`. Without `composed: true`, the event dies at the Shadow DOM boundary.
- **IF** the WC needs runtime theme values for JS (D3, Canvas, mermaid) → **THEN** `getComputedStyle(this).getPropertyValue('--p-X').trim()`. Never hardcode.
- **IF** running in host-less dev mode and `var()` fails → **THEN** ONE defensive fallback per logical color: `var(--p-danger-500, #ef4444)`. Document as "dev preview only". Don't proliferate.

### Where to put CSS

- **IF** the change is "the brand primary is now teal" → **THEN** facade `css_variables` (Level 1). One JSON line.
- **IF** the change is "buttons everywhere have 12px radius" → **THEN** facade `custom_css` with `:root { --p-button-border-radius: 12px }` or `custom_css` PrimeVue override (Level 2).
- **IF** the change is "this one demo page has a different look" → **THEN** that page's `package.json` `wippy.configOverrides.customization.cssVariables` (Level 3). Add a comment explaining the isolation.
- **IF** the change is "my app's internal `.search-wrap` needs a layout fix" → **THEN** `src/styles.css` with a project prefix (`.{appname}-search-wrap`). Never touch `--p-*` here.
- **IF** the change is "host chrome only" (sidebar width, breadcrumb font) → **THEN** facade `host_custom_css` / `host_css_variables`. Children apps should NOT see it.

### Dark mode

- **IF** writing custom CSS → **THEN** the light version goes outside `@media (prefers-color-scheme: dark)`, the retune goes inside. Never assume a single value works for both.
- **IF** referencing only `--p-*` vars → **THEN** dark mode is automatic — no `@media` block needed in your CSS.
- **IF** computing a derived color via `color-mix()` → **THEN** verify it still meets WCAG contrast in both light AND dark.

### Build / publish

- **IF** building a page app with Vite → **THEN** `proxy.injections.tailwindConfig: false`. Bundle your own Tailwind.
- **IF** building a WC → **THEN** never externalize `@wippy-fe/theme` — externalize ONLY `vue`, `pinia`, `@iconify/vue`, `@wippy-fe/proxy`.
- **IF** installing the PrimeVue plugin → **THEN** `import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'`. Never `import PrimeVue from 'primevue/config'`.
- **IF** the theming doc changes here → **THEN** republish `@wippy-fe/theme` (so its mirrored `THEMING.md` re-syncs) and re-ingest the `wippy.frontend` knowledge base.

---

## Related docs

- **`README.md`** — frontend docs index
- **`app-guide.md`** — building Wippy web apps; covers `proxy.injections.css.themeConfig` and the standard injection block
- **`component-guide.md`** — building Wippy web components; `hostCssKeys` controls which platform CSS gets loaded into a component's Shadow DOM
- **`best-practices.md`** — general Vue/Tailwind conventions; defers theming to this doc
- **`host-spec.md`** — host runtime contract for `wippy.proxy.injections` keys
- **`proxy-api.md`** — runtime proxy API; documents which `--p-*` and `--wippy-host-*` vars `<wippy-loading>` and `<wippy-error>` consume
- **`host-less-mode.md`** — how `cssVariables` / `customCSS` flow through the dev overlay when an app or WC runs without a host (`appConfig.theming.global.cssVariables` etc.)

External:

- **`@wippy-fe/theme/THEMING.md`** — same content as this file, shipped with the theme package (`node_modules/@wippy-fe/theme/THEMING.md` after install)
- **drewaltizer-wippy** (`C:/Projects/drewaltizer-wippy/src/drewapp/deps/_index.yaml`) — full Level 2 reference implementation
- **`app-template/frontend/applications/iframe-demo/`** — Level 3 reference implementation
- **wippy.ai docs** (`https://wippy.ai/llms.txt`) — Lua-side facade documentation
