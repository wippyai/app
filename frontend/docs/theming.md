# Wippy Theming Guide

Authoritative guide for theming Wippy apps. Covers when to theme at the **facade** (host-wide), when to theme at the **page** (per-iframe), and the full CSS-variable / Tailwind / PrimeVue reference.

> **Mirrored at three locations.** Same content, three places — keep them in sync.
> - This file: `app-template/frontend/docs/theming.md` (in-repo, primary editing surface)
> - npm package: `@wippy-fe/theme/THEMING.md` (shipped with the theme package — `node_modules/@wippy-fe/theme/THEMING.md` after install)
> - Wippy KB: `wippy.frontend` → "Wippy Theming Guide" (semantic search via the `wippy-kb` MCP)

---

## Table of contents

- [Three levels of theming — quick start](#three-levels-of-theming--quick-start)
- [Level 1 — Basic theming (accent only, via facade)](#level-1--basic-theming-accent-only-via-facade)
- [Level 2 — Full theming (palette + custom CSS, via facade)](#level-2--full-theming-palette--custom-css-via-facade)
- [Level 3 — Per-page theme override (configOverrides / runtime)](#level-3--per-page-theme-override-configoverrides--runtime)
- [Reference — CSS variables](#reference--css-variables)
- [Reference — Tailwind utility classes](#reference--tailwind-utility-classes)
- [Reference — Dark mode](#reference--dark-mode)
- [Reference — PrimeVue styling (opt-in)](#reference--primevue-styling-opt-in)
- [Reference — Choosing custom colors (luminosity, WCAG)](#reference--choosing-custom-colors-luminosity-wcag)
- [Reference — Host UI customization (`--wippy-host-*` + BEM classes)](#reference--host-ui-customization---wippy-host---bem-classes)
- [Related docs](#related-docs)

---

## Three levels of theming — quick start

Almost every "I want to restyle this" task fits one of three levels. Pick the lightest one that solves the problem; never reach for a heavier level "just in case".

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
