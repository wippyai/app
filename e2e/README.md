# app-template e2e tests

End-to-end tests for the proxy bridge API + `<w-iframe>` / `<w-artifact>`
custom elements introduced in Wippy FE Host 1.0.33.

## Prerequisites

Order matters. `make.bat clean-build` produces the static bundles wippy
serves; it does NOT depend on the Wippy FE Host dev server. Wippy then
needs the dev server reachable at `:5173` so it can resolve the facade
URL.

1. **Install the e2e suite's deps** (root `package.json` covers Playwright +
   dotenv + @types/node):
   ```sh
   pnpm install
   npx playwright install chromium
   ```
   `.env` must define `USERSPACE_USER_DEFAULT_ADMIN_EMAIL` /
   `USERSPACE_USER_DEFAULT_ADMIN_PASSWORD` — copy `.env.example` if you
   have not already. `playwright.config.ts` loads it via `dotenv/config`.

2. **Build FE bundles** into wippy's serving path (from the repo root):
   ```sh
   ./make.bat clean-build
   ```

3. **Start Wippy FE Host dev server** on `:5173` so the facade URL
   resolves. Clone + run from a sibling checkout:
   ```sh
   git clone git@git.spiralscout.com:estimation-engine/gen-2-chat.git wippy-fe-host
   cd wippy-fe-host
   pnpm install
   pnpm dev:site --host
   ```

4. **Start wippy** on `:8086` (from this repo's root):
   ```sh
   wippy run -c -o app:gateway:addr=:8086 -o wippy.facade:fe_facade_url:default=http://localhost:5173
   ```

## Run

From the repo root:

```sh
pnpm test:e2e
```

Or for the bridge spec only:

```sh
pnpm test:e2e:bridge
```

The Attention tracer is isolated from the default suite because each run must
name the Wippy layout and page-rendering engine it is proving. Start the Wippy
runtime separately on port `8086`; the runtime engine override must match the
test environment:

```powershell
$env:WIPPY_LAYOUT = 'compat' # compat or managed
$env:WIPPY_ENGINE = 'iframe' # iframe or fragment
$runtimeArgs = @(
  'run', '-c',
  '--config', 'C:/Projects/gen-2-chat/.local/runtime/attention-session-test.workspace.yaml',
  '-o', 'app:gateway:addr=:8086',
  '-o', 'wippy.facade:fe_facade_url:default=http://localhost:5173',
  '-o', "wippy.facade:render_engine:default=$($env:WIPPY_ENGINE)"
)
if ($env:WIPPY_LAYOUT -eq 'managed') {
  $runtimeArgs += @('-o', 'wippy.facade:fe_mode:default=managed')
}
.\wippy.exe @runtimeArgs
```

Then run the browser suite in another terminal with the same environment:

```powershell
$env:WIPPY_LAYOUT = 'compat' # must match the runtime
$env:WIPPY_ENGINE = 'iframe' # must match render_engine above
pnpm test:e2e:attention
```

The same command runs the tracer and the production-shaped agent acceptance
suite. The latter signs in normally, opens `app.attention_e2e:agent` through an
injected proxy, sends real WebSocket commands, and reads persisted messages back
through `/api/v1/sessions/messages`. It never supplies a synthetic target path.

The deterministic provider also has a committed `wippy test` use-case entrypoint.
Run it against the existing lock while leaving unrelated application services
inactive:

```powershell
C:/Projects/app-template-raw/wippy.exe test -c -o app:gateway:lifecycle.auto_start=false -o app:db:lifecycle.auto_start=false -o wippy.bootloader:bootloader.service:lifecycle.auto_start=false -o userspace.uploads:recover_pending.service:lifecycle.auto_start=false -o userspace.user.security:token_storage:lifecycle.auto_start=false
```

The command exits nonzero when any provider case fails. It does not update the
lock or install a replacement test framework.

Four additional runtime cells are explicit because Playwright cannot change a
server-owned capability or broker lifetime after Wippy starts:

- Timeout: set `SESSION_UI_ACTION_TTL_SECONDS=5` in the Wippy runtime process;
  set `WIPPY_UI_ACTION_TTL_SECONDS=5` only in the Playwright process so the test
  knows the server lifetime. The session requirement is string-typed, so do not
  pass a numeric `-o wippy.session:ui_action_ttl_seconds:default=5` override.
  The expiry test is skipped when the declared lifetime exceeds ten seconds.
- Disabled: launch with
  `-o wippy.facade:attention:default={"enabled":false}`, then set
  `WIPPY_ATTENTION_MODE=disabled`.
- Display-capture denial: launch with the normal Attention JSON except
  `visualCapture.enabled=true`, then set `WIPPY_ATTENTION_VISUAL=true`.
  Playwright rejects `getDisplayMedia` with `NotAllowedError` and verifies that
  the semantic attachment still reaches the agent with a permission-denied
  omission.
- Synthetic visual success: launch with the same
  `visualCapture.enabled=true` runtime capability, then set
  `WIPPY_ATTENTION_VISUAL=true` and `WIPPY_ATTENTION_VISUAL_MODE=synthetic` in
  the Playwright process. The committed Chromium case captures a deterministic
  canvas stream, verifies bounded region geometry and target linkage, uploads
  the redacted PNG, and proves the authorized reference reaches the provider as
  multimodal input. Firefox and WebKit skip only this synthetic capture case;
  their non-visual Attention coverage remains part of the matrix.

Run compatibility and managed modes sequentially. Each runtime cell still runs
the committed Chromium, Firefox, and WebKit projects. Keep the `--config`
replacement file in every cell and verify the runtime log resolves the local
`wippy/session`, `wippy/llm`, `wippy/agent`, and `wippy/facade` candidates before
accepting a result.

### Real runtime restart recovery

Restart recovery is a two-run test so Playwright never starts, stops, or kills a
Wippy process. Use the standard enabled, non-visual runtime cell. Choose a new
absolute handoff path under the Attention evidence directory for every run; the
seed step uses create-only file semantics and refuses to overwrite prior evidence.

Set the same values for both Playwright runs:

```powershell
$env:WIPPY_URL = 'http://localhost:8086'
$env:WIPPY_LAYOUT = 'compat'
$env:WIPPY_ENGINE = 'iframe'
$env:WIPPY_ATTENTION_MODE = 'enabled'
$env:WIPPY_ATTENTION_VISUAL = 'false'
$env:WIPPY_ATTENTION_RESTART_BROWSER = 'chromium'
$env:WIPPY_ATTENTION_RESTART_STATE_FILE = 'C:\Projects\gen-2-chat\.local\evidence\attention-context\restart-compat-iframe-chromium.json'
```

With Wippy running from the app candidate worktree and the exact local module
replacement config, seed the persisted message and attachment:

```powershell
$env:WIPPY_ATTENTION_RESTART_PHASE = 'seed'
pnpm test:e2e:attention:restart
```

Stop only the exact managed Wippy process created for this cell, confirm port
`8086` is released, and restart it with the identical executable, working
directory, environment, `--config`, layout, engine, facade URL, and database.
The second runtime log must again prove that the local module candidates were
loaded. Do not delete or replace the handoff file.

Then verify recovery through a new browser context:

```powershell
$env:WIPPY_ATTENTION_RESTART_PHASE = 'verify'
pnpm test:e2e:attention:restart
```

The verify step reopens the same session, compares the recovered attachment
byte-for-byte, checks the persisted agent answer, and sends a context-free
follow-up that must return `ATTENTION_E2E_CONTEXT_MISSING`. Repeat with a new
handoff file for each additional layout, engine, or browser cell.

To see the browser:

```sh
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

- `attention-tracer.spec.ts` — four tests, run once for each layout/engine cell:
  1. Verifies both deep fixtures load through their real package routes.
  2. Verifies the zero-gap siblings retain distinct physical identities through
     the outer page, custom element, shadow root, nested artifact, nested iframe
     or Web Fragment, and final safe-text element.
  3. Uses real Playwright mouse and keyboard input and verifies that trusted
     pointer, focus, and key events reach both edge targets.
  4. Uses a touch-capable Chromium project to deliver a trusted touch pointer to
     the same deeply nested target.

- `attention-agent.spec.ts` — production-shaped message and clarification tests:
  1. Persists an opted-in `wippy.attention` attachment and verifies the
     deterministic agent reports the pointer-linked target’s full 15-segment path.
  2. Samples the exact sibling boundary, requires both children in the snapshot,
     checks projected overlay geometry, and confirms one immutable target.
  3. Selects a zero-target area by pointer and by keyboard, including the explicit
     confirmation step.
  4. Runs the dedicated highlight agent action and verifies its exact projected
     rectangle, completion result, and target correlation.
  5. Verifies Escape cancellation, focus restoration, resize-driven stale target,
     broker expiry, transport disconnect, reconnect, and same-session persistence.
  6. Verifies atomic attachment rejection, forged visual-reference rejection,
     disabled mode, display-capture denial, and synthetic visual success in their
     explicit runtime cells.

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
