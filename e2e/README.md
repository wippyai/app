# app-template e2e tests

Playwright tests that drive the app through the facade login flow. The
Coverage section lists what each spec checks.

## Prerequisites

Order matters. `make.bat clean-build` produces the static bundles wippy
serves; it does NOT depend on the Wippy FE Host dev server. Wippy then
needs the dev server reachable at `:5173` so it can resolve the facade
URL.

1. **Install the e2e suite's deps** (root `package.json` covers Playwright +
   dotenv + @types/node):
   ```sh
   pnpm install
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

   Equivalent via the generic local launcher (`scripts/run-dev.mjs`), which
   also keeps the `.env`-derived URLs (`WIPPY_URL` / `APP_BASE_URL` /
   `PUBLIC_API_URL`) in sync with the port. It does not edit your `.env`: it
   writes a per-run copy of `.env` with those keys and `APP_PORT` replaced under
   `.local/run-dev/`, points the runtime at it, and deletes it when the runtime
   exits. A dry run (`RUN_DEV_DRY_RUN=1`) writes nothing. The launcher refuses
   to start when `.env` has no `ENCRYPTION_KEY`, because a key the runtime
   generated into the per-run copy would be lost; run `make run` once first so
   the runtime writes the key to `.env`. The launcher passes the
   same four values to the runtime's process environment; for the Playwright run
   in another shell, set `WIPPY_URL` to the app origin yourself (the launcher
   prints it and writes it to the `RUN_DEV_MANIFEST` file when you set one):
   ```sh
   APP_PORT=8086 FACADE_URL=http://localhost:5173 make run-dev
   # Windows:
   set APP_PORT=8086&& set FACADE_URL=http://localhost:5173&& make.bat run-dev
   ```
   Other supported env vars: `WIPPY` (path to the runtime binary),
   `WIPPY_CONFIG` (extra `--config` files, delimited by `;` on Windows / `:`
   elsewhere) and `WIPPY_OVERRIDES` (extra `entry:path=value` overrides,
   delimited by `;`). Leave `APP_PORT` unset (or `auto`) to pick a free port.

   `session-forms.spec.ts` needs the Session Forms dev fixtures, which are off
   by default. See [Session Forms demo](../README.md#session-forms-demo) for how
   to turn them on.

## Run

From the repo root:

```sh
pnpm test:e2e
```

Or for the bridge spec only:

```sh
pnpm test:e2e:bridge
```

### Attention acceptance cells

The Attention suite (`attention-tracer.spec.ts` and `attention-agent.spec.ts`)
runs separately from the default suite, because each run must name the runtime
cell it proves. A cell is one Wippy runtime configuration, made of the layout,
the page rendering engine and the Attention settings. Playwright cannot change
them after Wippy starts, so every cell needs its own runtime launch.

The deterministic agents live in `e2e/fixtures/app`. Normal startup loads only
`src` and does not register these agents, models or upload handlers. Prepare an
isolated test app with `make.bat prepare-e2e`. This target copies `src`, the
fixtures and all existing `static` assets into `.local/e2e-runtime-tmp`. It keeps
that app's database and uploads when it runs again. Use `make.bat run-e2e` to
build, prepare and start the test app. Its extra arguments must use absolute
paths for `--config`, because the runtime starts from the isolated app directory.

If the assets are already built, run `prepare-e2e` once and start the declared
`wippy run -c` command from `.local/e2e-runtime-tmp`. The lock in that directory
uses the repository's existing modules. Keep each compatibility consumer in its
own directory with its own lock, source and data.

Set these variables in the Playwright process. Each one must match the running
Wippy runtime:

| Variable | Values | Matches in the runtime |
|---|---|---|
| `WIPPY_URL` | `http://127.0.0.1:8086` | The gateway address. Spell it the way `PUBLIC_API_URL` does (`127.0.0.1` here). The WebSocket origin check accepts an Origin with the same host and port as the socket, and the `allow_origins` list in `src/app/_index.yaml`; it answers 403 when the page uses `localhost` and the socket uses `127.0.0.1`, and the other way round. |
| `WIPPY_LAYOUT` | `compat` or `managed` | `wippy.facade:fe_mode` |
| `WIPPY_ENGINE` | `iframe` or `fragment` | `wippy.facade:render_engine` |
| `WIPPY_ATTENTION_MODE` | `enabled` (default) or `disabled` | `enabled` in `wippy.facade:attention` |
| `WIPPY_ATTENTION_VISUAL` | `true` or `false` (default) | `visualCapture.enabled` in `wippy.facade:attention` |
| `WIPPY_ATTENTION_VISUAL_MODE` | `denied` or `none` | Defaults to `denied` when visual capture is on. |
| `WIPPY_UI_ACTION_TTL_SECONDS` | `120` (default) | `SESSION_UI_ACTION_TTL_SECONDS`. The Session caps it at 120 seconds. |

The admin credentials (`USERSPACE_USER_DEFAULT_ADMIN_EMAIL` and
`USERSPACE_USER_DEFAULT_ADMIN_PASSWORD`) must be in the environment of both
processes.

Start the Web Host dev server on `:5173` with `APP_URL=http://localhost:5173`.
Without `APP_URL`, child pages load their assets from `/undefined/`. Then start
the runtime from `.local/e2e-runtime-tmp` with these arguments, where
`<candidate.workspace.yaml>` replaces `wippy/session`, `wippy/agent`,
`wippy/llm`, `wippy/relay`, `wippy/views` and `wippy/facade` with the checkouts
under test, and `<attention>` is the cell's Attention override:

```text
run -c --config <candidate.workspace.yaml>
  -o app:gateway:addr=:8086
  -o app:db:file=<fresh database file>
  -o wippy.facade:fe_facade_url:default=http://localhost:5173
  -o wippy.facade:fe_mode:default=compat
  -o wippy.facade:render_engine:default=iframe
  -o wippy.session:title_function_id:default=app.attention_e2e:title
  -o <attention>
```

The runtime process also needs `PUBLIC_API_URL=http://127.0.0.1:8086` and
`APP_PORT=8086` and `SESSION_UI_ACTION_TTL_SECONDS=120`. The cells below were last run with Wippy
runtime `0.3.24a`.

The `-o` parser reads each value as CSV, so the Attention override must be
CSV-quoted with its inner quotes doubled. Windows PowerShell 5.1 also removes
embedded quotes when it starts a native program, so in PowerShell 5.1 every
quote needs a backslash as well. For the disabled cell, the PowerShell 5.1
argument is:

```powershell
'\"wippy.facade:attention:default={\"\"enabled\"\":false}\"'
```

These are the cells and their exact settings:

| Cell | Runtime overrides | Playwright environment |
|---|---|---|
| compat, iframe, enabled with visual capture | `fe_mode=compat`, `render_engine=iframe`, Attention value A | `WIPPY_LAYOUT=compat`, `WIPPY_ENGINE=iframe`, `WIPPY_ATTENTION_MODE=enabled`, `WIPPY_ATTENTION_VISUAL=true` |
| compat, fragment, enabled | `fe_mode=compat`, `render_engine=fragment`, Attention value B | `WIPPY_LAYOUT=compat`, `WIPPY_ENGINE=fragment`, `WIPPY_ATTENTION_MODE=enabled`, `WIPPY_ATTENTION_VISUAL=false` |
| compat, iframe, disabled | `fe_mode=compat`, `render_engine=iframe`, Attention value C | `WIPPY_LAYOUT=compat`, `WIPPY_ENGINE=iframe`, `WIPPY_ATTENTION_MODE=disabled` |

The Attention values, before quoting, are:

- A: `{"enabled":true,"messageContext":{"enabled":true,"defaultInclude":false},"agentActions":{"enabled":true,"requireConfirmation":true},"visualCapture":{"enabled":true},"sampling":{"radiusCssPx":20,"stepCssPx":5},"privacy":{"text":"safe"}}`
- B: the same as A, with `"visualCapture":{"enabled":false}`
- C: `{"enabled":false}`

Run the suite for a cell from this repository:

```powershell
$env:WIPPY_URL = 'http://127.0.0.1:8086'
$env:WIPPY_LAYOUT = 'compat'
$env:WIPPY_ENGINE = 'iframe'
$env:WIPPY_ATTENTION_MODE = 'enabled'
$env:WIPPY_ATTENTION_VISUAL = 'true'
npm run test:e2e:attention -- --project=chromium --output=.local/test-results/attention
```

`WIPPY_ATTENTION_TEST_GREP` limits a run to the tests whose titles match a
regular expression. The config also defines Firefox, WebKit and a touch Chromium
project. Run the cells one at a time, because they share one port and one
database.

The agent suite signs in normally, starts the deterministic fixture agent
through an injected proxy, sends real WebSocket commands, and reads persisted
messages back through `/api/v1/sessions/messages`. It never supplies a synthetic
target path. It uses two fixture agents. `app.attention_e2e:agent` has the
Attention trait, and `app.attention_e2e:agent_without_attention` has no trait,
so it proves that read authority comes from the trait.

The deterministic provider in `e2e/fixtures/app/attention_e2e/generate.lua` picks its
answer from the newest user text. A message of the form `ATTENTION_READ <mode>
<argument>` makes it call one Attention read tool per step and answer with
`ATTENTION_E2E_READ <json>`. The modes are `cursor`, `focus`, `selection`,
`semantic-text`, `semantic-text-reversed`, `semantic-name`, `css` and
`forced-cursor`. The reversed mode keeps a searched string out of the chat
history, and `forced-cursor` emits a call the agent was never offered. The text
`ATTENTION_E2E_FORCE_PROVIDER_ERROR` makes the provider fail the turn.

The provider has a committed `wippy test` entry point. Run it from the prepared
test app against its lock while unrelated application services stay inactive:

```powershell
C:/Projects/app-template-raw/wippy.exe test -c -o app:gateway:lifecycle.auto_start=false -o app:db:lifecycle.auto_start=false -o wippy.bootloader:bootloader.service:lifecycle.auto_start=false -o userspace.uploads:recover_pending.service:lifecycle.auto_start=false -o userspace.user.security:token_storage:lifecycle.auto_start=false
```

The command exits nonzero when any provider case fails. It does not update the
lock or install a replacement test framework.

The expiry test needs a short lifetime cell. Set
`SESSION_UI_ACTION_TTL_SECONDS=5` in the runtime process and
`WIPPY_UI_ACTION_TTL_SECONDS=5` in the Playwright process, so the test knows the
server lifetime. The Session reads the value as a string, so do not pass a
numeric `-o wippy.session:ui_action_ttl_seconds:default=5` override. The test is
skipped when the declared lifetime is longer than ten seconds.

#### Visual capture

The visual capture action is separate from message submission. The agent asks
for a capture, the Host opens the capture overlay at the target scope, and the
user must approve it. The full viewport is a separate choice that the user has
to select. An approved image becomes an ordinary removable file in the composer
queue. When the user later sends a message that still includes the file, the
Host adds one `wippy.attention.visual` attachment that references the upload,
and the model receives the image through that attachment. The upload itself is
only listed to the model by name and is never inlined. Removing the file from
the queue releases its preview data without deleting the server upload. When
the capture provider denies the request, the semantic Attention data stays and
no file is prepared.

### Real runtime restart recovery

Restart recovery is a two-run test so Playwright never starts, stops, or kills a
Wippy process. Use the standard enabled, non-visual runtime cell. Choose a new
absolute handoff path under the Attention evidence directory for every run; the
seed step uses create-only file semantics and refuses to overwrite prior evidence.

Set the same values for both Playwright runs:

```powershell
$env:WIPPY_URL = 'http://127.0.0.1:8086'
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

- `bridge.spec.ts` checks the proxy bridge on the iframe-demo `/bridge` page. The
  first test exercises four interactions: parent to child `request('add')` and
  `post('parent-fire')`, and child to parent `post('child-fire')` and
  `request('echo')`. It checks each one in the parent event log and in
  `window.__bridgeLog`. The other two tests check that `<w-iframe>` and
  `<w-artifact>` are registered as custom elements.
- `session-forms.spec.ts` runs against the scripted fixture agents and needs the
  Session Forms dev fixtures. Six tests cover choice forms and job phrases. In
  the first, the agent asks for a form, the test answers it, and the form stays
  answered after a reload. In the second, the test answers a form after the
  conversation has moved on, and the agent replies with the late-answer notice.
  The third presses Enter on the required several-answer form (`ask me several`)
  with nothing ticked and expects the tick-one message. The last three run the
  job phrases: `fail after text` and `limit after text` (Limit Fixture agent) as
  the Other text of a form, where the text and tool call stay, the error follows
  and the card reads interrupted, and `artifact and ask`, where the note shows
  once before and after the answer. The 25 second `slow tool` phrase has no
  test. Six more tests cover the standard fields on the `ask me delivery` and
  `ask me preferences` forms, which the fixture asks through `ask_user_fields`.
  They check browser-side checks, the server's `pattern_mismatch` refusal,
  typed and picked dates, unticked checkboxes, and the exact saved values after
  a reload. One test uses the steering fixture agent, which has only
  `ask_user`, and checks that the server refuses a form with standard fields on
  `ask_user` with `unsupported_type` and that the agent gets the refusal. Most
  tests fail on a console error. Every test in the file is skipped unless
  `SESSION_FORMS_DEV_FIXTURES=true` is set in the environment or `.env` of the
  test run.
- `iframe-engine.spec.ts` checks the default iframe render engine. A page renders
  as a srcdoc iframe, the fragment gateway is never requested, and `$W` and
  state work. It is skipped when `WIPPY_ENGINE=fragment`.
- `fragment-poc.spec.ts` and `fragment-parity.spec.ts` check the fragment render
  engine (`-o wippy.facade:render_engine:default=fragment`). The first covers
  API, WebSocket, theming, routing, isolation, host CSS and nested
  `<w-artifact>` embeds. The second covers state, global error capture and
  title propagation. Both are skipped when `WIPPY_ENGINE=iframe`.
- `managed-layout.spec.ts` checks the managed layout shell through the facade
  login flow. The default config ignores it. Start the app with
  `-o wippy.facade:fe_mode:default=managed` and run `pnpm test:e2e:managed`.
- `theming.spec.ts` checks that `/api/public/facade/variables.css` and
  `/api/public/facade/config` resolve the `fs://` references in the facade
  `css_variables` and `custom_css` settings.
- `theme-persistence.spec.ts` checks the facade theme cookie. It covers the
  `theme-persist.js` script, the config values, the theme class that the server
  renders on `<html>`, and the theme switchers on both login pages.
- `version-leak.spec.ts` checks that only the Web Host version in
  `WIPPY_HOST_VERSION` loads from the CDN.

- `attention-tracer.spec.ts`: five tests, run once for each layout and engine cell.
  1. Keeps nested navigation in sync through tab clicks, browser history and
     reload.
  2. Loads both deep fixtures through their real package routes.
  3. Keeps distinct identities for the zero-gap siblings through the outer
     page, custom element, shadow root, nested artifact, nested iframe or Web
     Fragment, and final safe-text element.
  4. Uses real Playwright mouse and keyboard input and checks that trusted
     pointer, focus and key events reach both edge targets.
  5. Uses a touch-capable Chromium project to deliver a trusted touch pointer to
     the same deeply nested target.

- `attention-agent.spec.ts`: production-shaped message, read and UI action
  tests.
  1. Pointing context: the opted-in `wippy.attention` attachment is persisted,
     the agent reports the full nested path with exactly three page segments,
     focus and pointer survive a keyboard Send, and excluded or redacted text
     never appears in the snapshot.
  2. UI actions: boundary confirmation with projected overlay geometry, area
     selection by pointer and by keyboard, highlight, Escape cancellation,
     geometry refresh of the same target, `stale` after the offered target is
     remounted or the Host navigates, broker expiry in the short lifetime cell,
     and disconnect with reconnect in the same session.
  3. Routing and authority: a request addressed to another Host tab gets no
     reply from that tab while the owning tab completes it, and an agent without
     the Attention trait gets no read authority while normal chat keeps working.
  4. Reads without automatic context: a cursor read with pointing context off,
     a paged `attention_find_css` read with a continuation, semantic searches
     that never return excluded text or the composer upload list, and the agent
     turning automatic pointing context on and off with a persisted revision.
  5. Attachments: atomic rejection of malformed and invalid attachments,
     idempotent retry, staged quota boundaries, forged visual references, and
     unknown kinds or versions that are kept in history but never reach the
     model prompt.
  6. Visual capture: a removable prepared file that reaches the model only as a
     `wippy.attention.visual` attachment at the later Send, and provider
     denial in the visual cell.
  7. Recovery: a provider error ends only that turn and the next message is
     answered, and the disabled cell sends no automatic context and installs no
     overlay.

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
