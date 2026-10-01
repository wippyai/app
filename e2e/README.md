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

   Equivalent via the generic local launcher (`scripts/run-dev.mjs`), which
   also keeps the `.env`-derived URLs (`WIPPY_URL` / `APP_BASE_URL` /
   `PUBLIC_API_URL`) in sync with the port:
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
- `session-forms.spec.ts` runs against the scripted fixture agent and needs the
  Session Forms dev fixtures. Two tests cover choice forms: the agent asks for
  a form, the test answers it, and the form stays answered after a reload; and
  a form answered after the conversation has moved on gets the late-answer
  notice. Six tests cover the standard fields on the `ask me delivery` and
  `ask me preferences` forms, which the fixture asks through `ask_user_fields`.
  They check browser-side checks, the server's `pattern_mismatch` refusal,
  typed and picked dates, unticked checkboxes, and the exact saved values after
  a reload. One test uses the steering fixture agent, which has only
  `ask_user`, and checks that the server refuses a form with standard fields on
  `ask_user` with `unsupported_type` and that the agent gets the refusal. Most
  tests fail on a console error.
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
