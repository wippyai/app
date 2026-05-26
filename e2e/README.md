# app-template-raw e2e tests

End-to-end tests for the proxy bridge API + `<w-iframe>` / `<w-artifact>`
custom elements introduced in gen-2-chat 1.0.33.

## Prerequisites

Order matters. `make.bat clean-build` produces the static bundles wippy
serves; it does NOT depend on the gen-2-chat dev server. Wippy then needs
the dev server reachable at `:5173` so it can resolve the facade URL.

1. **Install the e2e suite's deps** (root `package.json` covers Playwright +
   dotenv + @types/node):
   ```powershell
   cd C:/Projects/app-template-raw
   pnpm install
   npx playwright install chromium
   ```
   `.env` must define `USERSPACE_USER_DEFAULT_ADMIN_EMAIL` /
   `USERSPACE_USER_DEFAULT_ADMIN_PASSWORD` — copy `.env.example` if you
   have not already. `playwright.config.ts` loads it via `dotenv/config`.

2. **Build FE bundles** into wippy's serving path:
   ```powershell
   cd C:/Projects/app-template-raw
   ./make.bat clean-build
   ```

3. **Start gen-2-chat dev server** on `:5173` so the facade URL resolves:
   ```powershell
   cd C:/Projects/gen-2-chat
   pnpm dev:site --host
   ```

4. **Start wippy** on `:8086`:
   ```powershell
   cd C:/Projects/app-template-raw
   ./wippy.exe run -c -o app:gateway:addr=:8086 -o wippy.facade:fe_facade_url:default=http://localhost:5173
   ```

## Run

```powershell
cd C:/Projects/app-template-raw
pnpm test:e2e
```

Or for the bridge spec only:

```powershell
pnpm test:e2e:bridge
```

To see the browser:

```powershell
pnpm test:e2e:headed
```

## Coverage

- `warn-suppressor.spec.ts` — seven test cases for `@wippy-fe/proxy`'s
  `installVueWarnSuppressor`:
  1. **No false-positive warnings during route traversal.** Visits every
     iframe-demo route (Chart / Counter / Mermaid / Bridge) and asserts
     ZERO `[Vue warn]: Failed to resolve component:` console messages.
  2. **Suppressor installed + marker set.** Drills into `__vue_app__` and
     asserts both `warnHandler` is a function and the
     `Symbol.for('@wippy-fe/proxy/vue-warn-suppressor-installed')` marker
     is on `app.config`.
  3. **PascalCase typo passes through (synthetic).** Invokes the live
     handler with `'Failed to resolve component: UsreCard'`; asserts the
     warning reaches `console.warn`.
  4. **Second install is a true no-op.** Dynamic-imports
     `@wippy-fe/proxy` from inside the iframe, calls
     `installVueWarnSuppressor(app)` a second time, asserts handler
     reference is unchanged.
  5. **Exported marker constant equals planted symbol.** Reads
     `VUE_WARN_SUPPRESSOR_INSTALLED_MARKER` from the bundle and asserts
     `app.config[exportedMarker] === true`.
  6. **Coexistence.** `/home/iframe-demo` mounts default + themed
     `<w-artifact>` side-by-side; each Vue app has its own marker.
  7. **Vue app instance stable across routes.** Captures `__vue_app__`
     via `evaluateHandle`, traverses all routes, asserts the same
     reference — guards against re-mount regressions that would silently
     lose the suppressor.

- `bridge.spec.ts` — three test cases:
  1. `all four bridge interactions over the demo page` — drives the
     iframe-demo `/bridge` route. Clicks the parent buttons to exercise
     `parent → child request('add')` and `parent → child post('parent-fire')`;
     drills into the child srcdoc to click its own buttons for
     `child → parent post('child-fire')` and `child → parent request('echo')`.
     Asserts every interaction lands in the parent event log AND in the
     window-scoped `window.__bridgeLog` history array.
  2. `<w-iframe> registered inside the host frame` — drills into the
     iframe-demo (child) Window and asserts `customElements.get('w-iframe')`
     resolves to a function. Proves the proxy registers the element in
     child-iframe contexts.
  3. `<w-artifact> registered inside the host frame` — same shape, but for
     the host-side `<w-artifact>` wrapper that mounts iframe-demo.

## Adding tests

- Use `helpers/login.ts` (`loginAsAdmin`, `navigateHostTo`) to skip boilerplate.
  Credentials come from `.env` (loaded by `playwright.config.ts` via
  `import 'dotenv/config'`); missing env vars throw instead of falling back.
- The bridge demo page (`frontend/applications/iframe-demo/src/pages/bridge.vue`)
  mirrors every parent-side log line into `window.__bridgeLog` so tests can
  read interaction history without scraping the `<pre>`. The child srcdoc
  exposes `data-testid="child-post-btn"`, `child-request-btn`, and
  `child-request-result` for chained `frameLocator` access.
- Frame chain depth: `page → host iframe → iframe-demo iframe → bridge.vue
  <w-iframe> → child srcdoc`. Use `.frameLocator('iframe').first()` per level.
