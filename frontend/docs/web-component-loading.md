# Web component loading and registration

How `view.component` entries flow from a Wippy module registry to a registered custom element in a child page, and the failure modes we keep running into. Read this if a `<my-tag>` silently renders as an unknown element, if you see `Proxy globals not found` in the console, or if `customElements.get('my-tag')` is `undefined` after the page has loaded.

This is a companion to [component-guide.md](component-guide.md) (which covers *how to write* a WC) — this doc covers *how the host loads and registers the WC at runtime*.

---

## The autoload chain

A `view.component` entry doesn't appear in the page just because it's registered in `wippy.yaml`. The host has to discover it, inject a `<script type="module">` into the page, let the entry chunk's `define(import.meta.url, ClassRef)` call run, and then `customElements.define(tagName, ClassRef)` fires. Each step has a precondition; skipping any link breaks the chain.

1. **Module registers the component.** `wippy.yaml` declares the entry:
   ```yaml
   - name: my_component                # registry entry id
     kind: registry.entry
     meta:
       type: view.component            # required — gates everything below
       name: my-component
       title: My Component
       tag_name: my-component          # required — the actual custom element tag
       entry_point: index.js           # required — file inside the static dir
       url: /app/wc/my-component       # required — http.static mount path
       auto_register: true             # required — see step 3 query
       announced: true                 # required — see "announced gates the API" below
       secure: false
   ```
   The component's `http.static` fs.directory entry must point at the built FE bundle so `<base_url>/<entry_point>` returns 200.

2. **Host fetches the components list.** Inside the iframe, after globals are written and Vue mounts, the host calls **`loadGlobalAutoloadWidgets(api)`** (in `gen-2-chat/src/shared/api/web-components/global-autoload.ts:39-78`) which:
   - `await api.get('/api/public/components/list', { params: { auto_register: true } })`
   - For each returned component with a fresh `tag_name` (i.e. `customElements.get(tagName)` is undefined), injects a `<script type="module" src="<base_url>/<entry_point>?declare-tag=<tagName>">` into `document.head`.
   - Returns `{ tagName, attributes }[]` so downstream callers can use it.

   In the host shell (not the iframe), the higher-level wrapper **`registerAutoloadComponents(api, getAppConfig, updateAppConfig)`** (lines 90–115) calls `loadGlobalAutoloadWidgets` and then updates the chat-message HTML sanitizer's `allowAdditionalTags` so messages containing `<example-mermaid …>` etc. keep their props through the sanitize pass. If your WC tag is rendered as an empty `<my-tag></my-tag>` *in chat messages* (props stripped but the tag is there) that's the sanitizer side, not the loader side.

   `/api/public/components/list` is served by `wippy/views` and **filters server-side by `announced == true`** (see `wippy/views/api/list_components.lua` — the line `... and component.announced` on the AND chain). There is no `?include_hidden=true` or `?announced=any` query override. `auto_register: false` *or* `announced: false` ⇒ the component is omitted from the response ⇒ the host never sees it.

3. **Host injects a `<script type="module">` for each returned component.** For every component in the list whose `customElements.get(tagName)` is currently undefined, the host appends:
   ```html
   <script type="module" src="/app/wc/<name>/index.js?declare-tag=<tagName>"></script>
   ```
   The `?declare-tag=` query param is the channel the host uses to tell the entry chunk which custom-element name to register under. The host does **not** call `customElements.define` — the entry chunk does.

4. **Entry chunk imports `@wippy-fe/proxy`** (resolved via the iframe's import map to `<web-host>/webcomponents-<version>/@wippy-fe/proxy.js`). The proxy bundle is a runtime peer; the WC's vite config externalizes `@wippy-fe/proxy` so it's loaded from the import map, not bundled. (See "Externals you must declare" below.)

5. **Entry chunk calls `define(import.meta.url, ClassRef)`.** `define` reads `new URL(import.meta.url).searchParams.get('declare-tag')` from the URL the host attached in step 3, then calls `customElements.define(tagName, ClassRef)`. Canonical pattern:
   ```ts
   import { define, WippyVueElement } from '@wippy-fe/webcomponent-vue'
   class MyElement extends WippyVueElement<...> { ... }
   define(import.meta.url, MyElement)
   ```
   For this to land in the entry chunk (not get hoisted into a sub-chunk by Rollup's code-split, which would break URL→declare-tag resolution), set `rollupOptions.preserveEntrySignatures: false` in the WC's `vite.config.ts`.

6. **Vue renders `<my-component …>` somewhere.** Custom-element upgrade fires, `connectedCallback` runs, `WippyVueElement` mounts a Vue app inside the shadow root.

---

## `announced: true` is the spec default for view.components that participate in autoload

**`auto_register: true` is not enough.** The server-side filter in `wippy/views/api/list_components.lua` requires `component.announced == true` regardless of any query param. If you set `announced: false` on a `view.component` thinking "I just don't want it in the tag-explorer," you actually exclude it from `/api/public/components/list` entirely — the host never injects its script, `customElements.get(tagName)` stays undefined, and Vue silently renders the unknown element as an empty `<my-component>` with no contents.

The page-vs-component asymmetry confuses people: for `view.page` entries, `announced: false` only hides them from nav and is a legitimate pattern (artifact viewers, embedded demos — see [fe-compliance-checklist.md](fe-compliance-checklist.md) § "page in iframe with no nav-owner"). For `view.component` entries that need to be auto-registered, `announced: false` *breaks the component*. If you want a hidden WC that's only manually registered by another bundle, omit `auto_register: true` or register from elsewhere; don't try to use `announced: false` as a "private flag."

Verify with: `curl /api/public/components/list?auto_register=true` — your tag must appear.

---

## The `@wippy-fe/proxy` eager-getter contract (the recurring "Proxy globals not found" error)

`@wippy-fe/proxy` is **expected** to be evaluated only inside a Wippy host where the host has already set `window.__WIPPY_APP_API__` and `window.__WIPPY_APP_CONFIG__` on the document. The bundle's last lines eagerly evaluate getters that read those globals:

```js
// pseudo-decompiled tail of @wippy-fe/proxy.js
const g = { get api() { return globalApi().api }, get host() { return globalApi().host }, ... }
const nt = g.api    // <-- fires the getter at module-eval time
const ot = g.host   // <-- same
// ...
export { nt as api, ot as host, ... }
```

`globalApi()` throws `Error: @wippy-fe/proxy: Proxy globals not found. For dev/testing without the Wippy host, add <script src="dev-proxy.js"></script> to your HTML.` if `window[GLOBAL_API_PROVIDER]` is undefined. So the entire proxy module fails to evaluate, every WC importing it throws on import, and no `customElements.define` ever runs.

**This is a contract, not a bug.** Removing the eagerness would mean every consumer of `import { api } from '@wippy-fe/proxy'` would need to be wrapped in a guard; that loses type narrowing and is worse for the common path. Instead, the host is responsible for **writing the globals on the target window before any module that imports `@wippy-fe/proxy` evaluates**. The host code paths that do this:

- **Iframe path** — when the host sets up a child iframe, it injects an inline `<script>` into the iframe's srcdoc/HTML that writes `window.__WIPPY_APP_CONFIG__` synchronously, then runs `entry.iframe.ts → buildInstance(appConfig)` which writes `window[GLOBAL_API_PROVIDER]`, *then* calls `loadGlobalAutoloadWidgets(api)` which injects WC `<script type="module">` tags. Globals are guaranteed present before the first WC bundle imports the proxy.
- **Host-mounted WC path** — when a WC is mounted directly in the host shell (managed-layout panels, etc.), the host's `ManagedLayoutShell` mounts `VueAppGlobalConnector` at the top of its template, *before* any panel resolver instantiates a host-mounted WC. `VueAppGlobalConnector`'s `setup()` is what writes the globals on the host's `window`.

**Failure modes you'll see and what they mean:**

| Symptom | Diagnosis |
|---|---|
| `Proxy globals not found` at `entry.web-component.ts:93` (or equivalent line in the minified bundle, around the eager `export const api = resolvers.api` re-exports — source lines 92–105) on a fresh page load | The host failed to write `__WIPPY_APP_API__` before the WC bundle evaluated. Almost always: running against a too-old web-host version where the connector-mount fix isn't present, OR you bundled `@wippy-fe/proxy` instead of externalizing it so two separate proxy modules race. |
| `Proxy globals not found` only after navigating away and back | Cached WC module bundle from a previous version that no longer matches the current globals shape. Hard-reload, or roll the WC's bundle URL/hash. |
| WC works in keeper-test but fails in another host | Other host's `fe_facade_url` points at an older web-host bundle. Override with `-o wippy.facade:fe_facade_url:default=…`. |
| WC tag is registered, mounts inner content, but the consumer sees an empty / tiny box — `document.querySelector('my-tag').getBoundingClientRect()` returns `0`/`0` or some unexpectedly small height | The custom element has the spec-default `display: inline` for unknown-element-shape tags, and/or `WippyVueElement`'s internal mount wrapper between `:host` and your Vue root has `height: auto` and collapses to its content's intrinsic height — your `.your-root { height: 100% }` resolves against `auto` and degenerates. **Fix:** in the WC's `inlineCss`, add `:host { display: block; width: 100%; height: 100%; box-sizing: border-box }` and `:host > div { width: 100%; height: 100% }`. The second rule targets WippyVueElement's mount wrapper specifically. |
| `Uncaught SyntaxError: Unexpected token '<'` at an `/assets/<chunk>-<hash>.js` URL, or a 404 on a worker/asset URL with a root-relative `/assets/...` path | The WC bundles a Web Worker (via Vite's `?worker` import or any code that spawns one) and was built with the default `base: '/'`. Vite then bakes a **root-absolute** URL like `new Worker("/assets/foo.worker-XXX.js")` into the worker shim. When the WC is loaded inside a consumer iframe, `/assets/...` resolves to the **consumer's origin root**, NOT the WC's own mount path — so the consumer's server returns its 404 HTML in place of the missing JS and the worker fails to parse with "Unexpected token '<'" (the `<!DOCTYPE` at column 1). Regular module imports inside the WC are unaffected — they already use relative `import` resolution. **Fix:** set `base: './'` in the WC's `vite.config.ts`. Vite then emits `new Worker(new URL("assets/foo.worker-XXX.js", import.meta.url).href)` which resolves relative to the shim's own location and lands inside the WC's mount dir. Same fix applies to any Vite-emitted asset URL referenced from runtime code (`new URL('./icon.svg', import.meta.url)`, etc.). |

---

## Externals you must declare in the WC's `vite.config.ts`

Every dependency the import map serves must be in `rollupOptions.external`, otherwise it gets bundled into the WC's entry chunk and you introduce two copies on the page. The import map at runtime (from `https://web-host.wippy.ai/webcomponents-<version>/import-map.json`) currently maps these names:

```
vue, pinia, vue-router, luxon, nanoevents, @iconify/vue, axios,
iconify-icon, @tanstack/vue-query, @wippy-fe/proxy, @wippy-fe/markdown-iframe
```

The minimum every WC needs in externals: `['vue', '@wippy-fe/proxy']`. Add any of the others that your component or its transitive deps actually import.

**Pinia is a transitive trap.** `WippyVueElement` from `@wippy-fe/webcomponent-vue` imports `pinia` internally. If your `vite.config.ts` doesn't externalize `pinia`, Rollup bundles `pinia.mjs` into your entry chunk. `pinia.mjs` line 26 is `process.env.NODE_ENV !== 'production' ? Symbol('pinia') : Symbol()` — `process` doesn't exist in the browser, so the WC bundle throws `ReferenceError: process is not defined` at module load and never reaches `define()`. Vite does NOT statically replace `process.env.NODE_ENV` inside library code. Symptom: `process is not defined at index.js:<somewhere>:NN`, where the source-map points back to `pinia.mjs:26`. Fix: add `'pinia'` to externals and rebuild.

`@iconify/vue` has the same shape if your WC's template uses any `<Icon>` from it. Standard externals block (matches the reference `markdown` WC):

```ts
external: [
  'vue',
  'pinia',
  '@iconify/vue',
  '@wippy-fe/proxy',
],
```

---

## Big-dep-lazy / small-index-eager pattern

For WCs that wrap a heavy library (a code editor, mermaid, chart.js, a markdown renderer with shiki, etc.), the right shape is:

- **Index entry chunk stays small** — only the `WippyVueElement` subclass, the `define()` call, and any prop schemas. Loads eagerly via the host's autoload script injection (step 3 above). Aim for tens of KB / single-digit KB gzipped.
- **Heavy library is dynamically imported** — the WC's mounted component lazy-loads the big bundle on first instantiation, gated by a module-level cached promise so subsequent mounts reuse the fetch:
  ```ts
  let heavyLibPromise: Promise<typeof HeavyLib> | null = null
  export function loadHeavyLib() {
    if (!heavyLibPromise)
      heavyLibPromise = import('heavy-lib').then(m => m.default)
    return heavyLibPromise
  }
  ```
  Don't import the heavy lib at the top of any module that's reachable from `index.ts` — that pulls it into the eager chunk.

This is also why setting `announced: true` on a WC backed by a multi-megabyte library is fine: the eager piece is the small index, not the library itself.

---

## Supported web-host versions

`wippy/facade` ships with a `fe_facade_url` requirement default that pins a specific `web-host.wippy.ai/webcomponents-<version>` build. **Override floor: 1.0.28 (as of 2026-05-12)**. Earlier versions have loader / global-init timing bugs we've moved past — most notably 1.0.26 and below shipped a `ManagedLayoutShell` that didn't mount `VueAppGlobalConnector` before its panel resolvers, so host-mounted WCs hit the eager-getter throw before the host's setup could write globals.

To override (the flag is on `wippy/facade`'s requirement, not the consuming module):

```
./wippy.exe run -c -o wippy.facade:fe_facade_url:default=https://web-host.wippy.ai/webcomponents-1.0.28
```

For local dev against `gen-2-chat`'s vite dev server:

```
# in C:/Projects/gen-2-chat:   pnpm dev
# in your wippy harness:
./wippy.exe run -c -o wippy.facade:fe_facade_url:default=http://localhost:5173
```

`/webcomponents-/` (no version) and `/webcomponents-1.0.30/` are not published — `curl -I` returns 403 from the S3 origin. Always pin to a known version, never to a "latest" alias that doesn't exist.

---

## Diagnostic recipe

When `<my-tag>` doesn't render and you're not sure where in the chain it broke, run these checks in order — first failure tells you the layer:

1. **YAML registration reaches Wippy.** `wippy lint` cleanly resolves the `view.component` entry; the `http.static` mount returns 200 for `<base_url>/<entry_point>`.
2. **API includes the tag.** `curl /api/public/components/list?auto_register=true | grep <tagName>` returns a row. If empty → `announced: false` or `auto_register: false` → fix the YAML.
3. **Host injected the script.** In the running iframe, evaluate `Array.from(document.querySelectorAll('script[src*="<tagName>"]'))` — at least one match. If none → the host's autoload didn't run yet, or the components-list response was empty.
4. **Custom element is defined.** `customElements.get('<tagName>')` returns a function. If `undefined` after the script tag loaded → look at console errors on the script's response. Typical errors:
   - `process is not defined` → bundled pinia, externalize it (see "Externals" above).
   - `Proxy globals not found` → host didn't set globals before the WC's proxy import (see "eager-getter contract" above) — upgrade web-host, or move the WC out of the path that runs before `VueAppGlobalConnector` mounts.
   - silent (no error) → check that `define(import.meta.url, …)` is the last statement of the entry chunk; if Rollup hoisted it into a sub-chunk, set `preserveEntrySignatures: false`.
5. **Element renders.** `document.querySelector('<tagName>').shadowRoot?.childElementCount > 0` and the component's expected child is present. If the element is connected but shadow root is empty → the Vue mount inside `WippyVueElement` errored; check the iframe console for the component's own errors.
6. **Element has layout.** `document.querySelector('<tagName>').getBoundingClientRect()` returns non-zero `width` AND `height`. If zero or near-zero (e.g. ~20 px tall when the consumer placed it in a 300 px box) → `:host` is `display: inline` and/or the WippyVueElement mount wrapper between `:host` and your Vue root has `height: auto`. **Fix:** add `:host { display: block; width: 100%; height: 100% }` and `:host > div { width: 100%; height: 100% }` to your `inlineCss`. See the "Element renders but the consumer sees an empty / tiny box" row of the failure-modes table.

---

## See also

- [component-guide.md](component-guide.md) — writing a WC (WippyVueElement, props, events, shadow DOM)
- [host-spec.md](host-spec.md) — host runtime contract, `package.json` shape, lifecycle
- [proxy-api.md](proxy-api.md) — full `@wippy-fe/proxy` API reference
- [fe-compliance-checklist.md](fe-compliance-checklist.md) — the canonical checklist; `announced` semantics for `view.page` vs `view.component` clarified there
- [host-less-mode.md](host-less-mode.md) — running WCs standalone with `dev-proxy.js`
- `gold:frontend/web-components/markdown/` — reference implementation (small WC with all the standard patterns)
- `wippy-kb` topic `web-component-loading` — searchable summary of this doc
