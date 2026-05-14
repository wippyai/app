# Wippy App Generation Checklist

Use this checklist to verify that a generated Wippy app is complete and correctly configured.

> **Before going section-by-section: check the FE isolation paradigm is followed.** A Wippy app is a standalone universal bundle that has zero knowledge of where it's served. `base: ''` is mandatory, `outDir` is set by the build script (not the vite.config), and `package.json` describes the app, not its mount point. Full rules: [fe-compliance-checklist.md §0](fe-compliance-checklist.md#0-the-fe-isolation-paradigm).

---

## 1. Required Files

### Root Directory
- [ ] `package.json` - Package configuration with Wippy metadata
- [ ] `app.html` - HTML entry point
- [ ] `vite.config.ts` - Vite build configuration
- [ ] `tsconfig.json` - TypeScript configuration
- [ ] Single `tsconfig.json` covers both src and vite config (no separate tsconfig.node.json needed)
- [ ] `tailwind.config.ts` - Tailwind CSS configuration
- [ ] `postcss.config.js` - **CRITICAL**: Required for Tailwind to work

### src/ Directory
- [ ] `src/app.ts` - Main entry point with Wippy initialization
- [ ] `src/constants.ts` - Injection keys (HOST_API, AXIOS_INSTANCE, WIPPY_INSTANCE)
- [ ] `src/types.ts` - TypeScript type definitions
- [ ] `src/styles.css` - Base styles
- [ ] `src/tailwind.css` - Tailwind directives (@tailwind base/components/utilities)
- [ ] `@wippy-fe/theme` in dependencies (provides theme variables)
- [ ] `src/app/app.vue` - Root Vue component with `<router-view />`
- [ ] `src/router/index.ts` - Router with host communication

### Pages (at least one required)
- [ ] `src/pages/*.vue` - At least one page component exists
- [ ] All routes in router have corresponding page files

---

## 2. package.json Validation

### Required Fields
- [ ] `name` follows format `@<namespace>/app-<description>`
- [ ] `version` is set (e.g., "1.0.0")
- [ ] `specification` is exactly `"wippy-component-1.0"`
- [ ] `title` is set (human-readable name)
- [ ] `description` is set
- [ ] `files` includes `["dist/", "src/", "package.json"]`

### wippy Configuration Block
- [ ] `wippy.type` is `"page"`
- [ ] `wippy.title` matches package title
- [ ] `wippy.icon` uses tabler icon format (e.g., `"tabler:chart-bar"`)
- [ ] `wippy.path` is `"dist/app.html"`
- [ ] `wippy.scripts.build` is `"build"`
- [ ] `wippy.scripts.debug` is `"build:debug"`

### wippy.proxy Configuration
- [ ] `wippy.proxy.enabled` is `true`
- [ ] `wippy.proxy.injections.css.fonts` is `true`
- [ ] `wippy.proxy.injections.css.themeConfig` is `true`
- [ ] `wippy.proxy.injections.css.iframe` is `true`
- [ ] `wippy.proxy.injections.css.primevue` is `true`
- [ ] `wippy.proxy.injections.css.markdown` is `true`
- [ ] `wippy.proxy.injections.css.customCss` is `true`
- [ ] `wippy.proxy.injections.css.customVariables` is `true`
- [ ] `wippy.proxy.injections.tailwindConfig` is `false` (unless using CDN Tailwind)
- [ ] `wippy.proxy.injections.resizeObserver` is `false` (unless widget)
- [ ] `wippy.proxy.injections.preventLinkClicks` is `false` (unless no router)
- [ ] `wippy.proxy.injections.iconifyIcons` is `false` (unless using CDN Iconify)

### Dependencies Structure
- [ ] `dependencies` includes `@wippy-fe/theme`
- [ ] `devDependencies` includes `@wippy-fe/types-global-proxy`
- [ ] `devDependencies` includes `@vitejs/plugin-vue`
- [ ] `devDependencies` includes `autoprefixer`
- [ ] `devDependencies` includes `primevue`
- [ ] `devDependencies` includes `tailwindcss` (version 3)
- [ ] `devDependencies` includes `typescript`
- [ ] `devDependencies` includes `vite`
- [ ] `devDependencies` includes `vue` (for build-time)
- [ ] `devDependencies` includes `vue-router` (for build-time)
- [ ] `devDependencies` includes `vue-tsc`

### Peer Dependencies (host-provided, NOT bundled)
- [ ] `peerDependencies` includes `@iconify/vue`
- [ ] `peerDependencies` includes `@wippy-fe/proxy`
- [ ] `peerDependencies` includes `axios`
- [ ] `peerDependencies` includes `pinia`
- [ ] `peerDependencies` includes `primevue` (externalized via app's own import map)
- [ ] `peerDependencies` includes `vue`
- [ ] `peerDependencies` includes `vue-router`
- Note: `luxon` and `nanoevents` are available in host import map but not required peerDeps

### Scripts
- [ ] `scripts.build` is `"vite build"`
- [ ] `scripts.build:debug` is `"vite build --mode development"`

---

## 3. vite.config.ts Validation

- [ ] `base` is set to `""` (empty string) - **CRITICAL**
- [ ] `plugins` includes `vue()`
- [ ] `build.target` is `"esnext"`
- [ ] `build.rollupOptions.input` uses object format with `resolve(__dirname, 'app.html')`
- [ ] `build.rollupOptions.external` includes ALL required:
  - `'vue'`
  - `'pinia'`
  - `'vue-router'`
  - `'@iconify/vue'`
  - `'@wippy-fe/proxy'`
  - `'axios'`
  - `'primevue'`, `'primevue/config'`, and each `primevue/*` subpath you import
- [ ] Optional externals (available in host import map, add only if your app imports them):
  - `'nanoevents'`
  - `'luxon'`
- [ ] `build.sourcemap` is `true`

---

## 4. app.html Validation

- [ ] Has `<!DOCTYPE html>` declaration
- [ ] Has `<html lang="en">`
- [ ] Has `<meta charset="UTF-8">`
- [ ] Has `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- [ ] Has `<script type="text/javascript" data-role="@wippy/scripts">` placeholder - **CRITICAL**
- [ ] Has `<script type="importmap">` with host-provided dependencies
- [ ] Has `<div id="app"></div>` mount point
- [ ] Has `<script type="module" src="./src/app.ts"></script>` entry

---

## 5. src/app.ts Validation (Main Entry)

### Imports
- [ ] Imports `addCollection` from `@iconify/vue`
- [ ] Imports `createPinia` from `pinia`
- [ ] Imports `createApp` from `vue`
- [ ] Imports `PrimeVuePlugin` from `@wippy-fe/theme/primevue-plugin`
- [ ] Imports root App component
- [ ] Imports constants (HOST_API, AXIOS_INSTANCE, WIPPY_INSTANCE)
- [ ] Imports `createAppRouter` from router
- [ ] Imports CSS files (@wippy-fe/theme/theme-config.css, styles.css, tailwind.css)

### createMainApp Function
- [ ] Awaits `window.$W.config()`
- [ ] Awaits `window.$W.host()`
- [ ] Awaits `window.$W.api()`
- [ ] Awaits `window.$W.instance()`
- [ ] Extracts `startPath` from `config.path ?? ''`
- [ ] Handles custom icons from `config.customization?.icons`
- [ ] Calls `createApp(App)`
- [ ] Uses `app.use(createPinia())`
- [ ] Uses `app.use(PrimeVuePlugin)`
- [ ] Provides `HOST_API` injection
- [ ] Provides `AXIOS_INSTANCE` injection
- [ ] Provides `WIPPY_INSTANCE` injection
- [ ] Creates router with `createAppRouter(hostApi, instance.on, startPath)`
- [ ] Uses `app.use(router)`
- [ ] Returns `app`

### Auto-mount
- [ ] Exports `mountApp` function
- [ ] Calls `mountApp()` at module level

---

## 6. src/router/index.ts Validation

### Router Creation
- [ ] Imports `createMemoryHistory` and `createRouter` from `vue-router`
- [ ] Imports `HostApi` type from `../types`
- [ ] Exports `createAppRouter(host: HostApi, on: OnSubscription | null, startPath?: string): Router`
- [ ] Uses `createMemoryHistory()` without args - **NOT** `createWebHistory`, do NOT pass startPath
- [ ] Defines routes array with at least one route
- [ ] Has catch-all route `/:pathMatch(.*)*` for 404 handling

### Host Communication (MANDATORY)
- [ ] Has `router.afterEach()` that calls `host.onRouteChanged(to.fullPath)`
- [ ] Defensive null check: `if (on) { on('@history', ...) }` for host navigation changes
- [ ] Guards `!path` inside `@history` handler
- [ ] Handles initial path via `history.replace(initialPath)` before creating router
- [ ] Updates router when host path changes

---

## 7. src/constants.ts Validation

- [ ] Imports `InjectionKey` from `vue`
- [ ] Imports types from `./types.ts`
- [ ] Exports `HOST_API` as `Symbol('host_api') as InjectionKey<HostApi>`
- [ ] Exports `AXIOS_INSTANCE` as `Symbol('axios') as InjectionKey<ProxyApiInstance['api']>`
- [ ] Exports `WIPPY_INSTANCE` as `Symbol('proxy') as InjectionKey<ProxyApiInstance>`

---

## 8. src/types.ts Validation

- [ ] Exports `HostApi` type: `Awaited<ReturnType<typeof window.$W.host>>`
- [ ] Exports `ProxyApiInstance` type: `Awaited<ReturnType<typeof window.$W.instance>>`
- [ ] Additional app-specific types as needed

---

## 9. CSS Files Validation

### src/styles.css
- [ ] Sets `html, body { height: 100%; margin: 0; background: transparent; }` (transparent lets host theme show through)
- [ ] Sets `#app { height: 100%; }`

### src/tailwind.css
- [ ] Contains `@tailwind base;`
- [ ] Contains `@tailwind components;`
- [ ] Contains `@tailwind utilities;`

### Theme (@wippy-fe/theme)
- [ ] `@wippy-fe/theme` is in `dependencies`
- [ ] CSS imports use `@import "@wippy-fe/theme/theme-config.css"` (not local file)

---

## 10. tailwind.config.ts Validation

- [ ] Imports `themePreset` from `@wippy-fe/theme/tailwind.config`
- [ ] Uses `presets: [themePreset]`
- [ ] `content` includes `'./src/**/*.{vue,ts}'`

---

## 11. postcss.config.js Validation

- [ ] File exists - **CRITICAL** (Tailwind won't work without it)
- [ ] Exports object with `plugins.tailwindcss: {}`
- [ ] Exports object with `plugins.autoprefixer: {}`

---

## 12. tsconfig.json Validation

- [ ] `compilerOptions.target` is `"ES2020"`
- [ ] `compilerOptions.module` is `"ESNext"`
- [ ] `compilerOptions.moduleResolution` is `"bundler"`
- [ ] `compilerOptions.strict` is `true`
- [ ] `compilerOptions.types` includes `"vite/client"` and `"@wippy-fe/types-global-proxy"`
- [ ] `include` covers `"src/**/*.ts"`, `"src/**/*.vue"`, and `"vite.config.ts"`

---

## 13. Vue Component Best Practices

### All .vue Files
- [ ] Use `<script setup lang="ts">` syntax
- [ ] Use Composition API (no Options API)
- [ ] File names use kebab-case (e.g., `user-profile.vue`)
- [ ] Component names in templates use PascalCase (e.g., `<UserProfile />`)

### Root app.vue
- [ ] Has `<router-view />` in template
- [ ] Has appropriate layout wrapper (e.g., `<main>` with padding)

### Page Components
- [ ] Each route has corresponding page file in `src/pages/`
- [ ] Pages use lazy loading in router: `() => import('../pages/xyz.vue')`

### Styling

> Full paradigm and IF/THEN rules: [theming.md](theming.md). The bullets below are the checklist; the guide has the *why*.

- [ ] Component author followed the AUTHOR waterfall (PrimeVue → custom HTML with theme colors → `color-mix()` → custom CSS as last resort) — see [theming.md § The AUTHOR waterfall](theming.md#waterfall-a--author-when-building-ui-in-an-app-or-web-component)
- [ ] Uses Tailwind utility classes
- [ ] Uses PrimeVue components where appropriate
- [ ] Custom CSS retunes for dark mode via `@media (prefers-color-scheme: dark)` (or relies on `--p-*` vars, which already do)
- [ ] Uses CSS variables for theme colors (`var(--p-*)`)
- [ ] Severity colors use semantic names (`danger-*`, `success-*`, `warn-*`, `info-*`, `help-*`, `accent-*`) — never raw Tailwind names (`red-*`, `green-*`, etc.) for semantic uses
- [ ] No `:root { --p-* }` overrides in `src/styles.css` — those belong in the facade (`css_variables`) or per-page `configOverrides.customization.cssVariables`
- [ ] No raw `.p-button` / `.p-dialog` / `.p-inputtext` selectors in `src/styles.css` — those belong in `customization.customCSS`

### Tailwind class-detection (the JIT gotcha)

Tailwind v3 JIT only emits rules for classes it can find as **literal strings** in scanned source files. A class that only exists at runtime (via string concatenation / template-literal interpolation) is silently purged from the build, so it has no effect at runtime even though the className is set correctly on the DOM element. Symptom: an element has `class="text-white"` in the DOM, but `getComputedStyle(el).color` is the inherited page text color, not white — and `.text-white { ... }` is absent from the emitted CSS.

✅ Detectable patterns (use these):
```html
<button class="bg-success-500 text-white">                            <!-- static literal -->
<button :class="{ 'text-white': cond, 'bg-warn-500': stale }">        <!-- literal keys in object syntax -->
<button :class="['text-white', extraClass]">                          <!-- literal in array -->
<button :class="cond ? 'text-white' : 'text-zinc-500'">               <!-- literal in ternary -->
```

❌ Undetectable patterns (Tailwind cannot statically resolve, will purge):
```html
<button :class="`text-${shade}-500`">                                  <!-- template-literal interpolation -->
<button :class="'text-' + color">                                      <!-- string concatenation -->
<button :class="computeColor()">  <!-- where computeColor returns a constructed class name -->
```

When you must drive a class from a variable, list every possible value as a literal somewhere Tailwind scans:
```ts
// Tailwind scans this file and sees each literal class name.
const TONE: Record<Severity, string> = {
  warn: 'text-warn-500 bg-warn-500/10',
  danger: 'text-danger-500 bg-danger-500/10',
  success: 'text-success-500 bg-success-500/10',
}
// then in template:
<span :class="TONE[severity]">
```

Or, as a last resort, add the dynamic class names to `tailwind.config.ts` under `safelist:`. Inline `:style` with CSS-var values is also a valid escape hatch when the dynamic dimension can't be enumerated.

### Icons
- [ ] Uses `<Icon icon="tabler:*">` component from `@iconify/vue`
- [ ] Does NOT use button icon props (see [theming.md § Iconography](theming.md#iconography-iconify-discipline))

### Host Services
- [ ] Uses `host.toast()` for notifications (not PrimeVue ToastService) — see [theming.md § What the Wippy host provides](theming.md#what-the-wippy-host-provides-the-substrate)
- [ ] Uses `host.confirm()` for confirmations (not PrimeVue ConfirmationService)

---

## 14. Common Errors to Check

- [ ] `base` in vite.config.ts is NOT missing or set to `'/'`
- [ ] `postcss.config.js` exists (Tailwind won't process without it)
- [ ] `@wippy-fe/theme` is in dependencies
- [ ] `@wippy/scripts` placeholder exists in app.html
- [ ] Router uses `createMemoryHistory`, NOT `createWebHistory`
- [ ] Router has `onRouteChanged` in `afterEach`
- [ ] Router listens to `@history` event
- [ ] All external dependencies are in `build.rollupOptions.external`
- [ ] PrimeVue is initialized via `PrimeVuePlugin` from `@wippy-fe/theme/primevue-plugin`

---

## Quick Validation Commands

After generation, run these to verify:

```bash
# Check all required files exist
ls -la package.json app.html vite.config.ts tsconfig.json postcss.config.js tailwind.config.ts
ls -la src/app.ts src/constants.ts src/types.ts src/styles.css src/tailwind.css src/theme-config.css
ls -la src/app/app.vue src/router/index.ts

# Verify package.json has required fields
grep -q '"specification": "wippy-component-1.0"' package.json && echo "OK: specification" || echo "MISSING: specification"
grep -q '"wippy"' package.json && echo "OK: wippy block" || echo "MISSING: wippy block"

# Verify critical vite config
grep -q 'base: ""' vite.config.ts && echo "OK: base empty" || echo "MISSING: base must be empty string"

# Verify postcss exists
test -f postcss.config.js && echo "OK: postcss.config.js exists" || echo "CRITICAL: postcss.config.js missing"

# Verify router uses memory history
grep -q 'createMemoryHistory' src/router/index.ts && echo "OK: memory history" || echo "ERROR: must use createMemoryHistory"

# Verify host communication in router
grep -q 'onRouteChanged' src/router/index.ts && echo "OK: onRouteChanged" || echo "MISSING: onRouteChanged in router"
grep -q "@history" src/router/index.ts && echo "OK: @history listener" || echo "MISSING: @history listener in router"
```
