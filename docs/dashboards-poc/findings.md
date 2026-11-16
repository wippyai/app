# Dashboards POC: findings

Status: POC complete on local branches, 11 November 2026. The chat demo was added on 16 November 2026. Nothing is pushed or published.

The POC builds the frame from the dashboards specification v6.8 on `app-template-raw`, a plain Wippy application with no Kickside modules. It shows two generated pages on the template's own data: LLM usage at `/reports/llm-usage` and App activity at `/ops/app-activity`. `wippy/dashboards` is Wippy core and works on its own. Kickside is one extension of it, and the POC does not touch Kickside.

The interfaces of this build are in `contracts.md` in this folder.

## Answers to the eight goals

The evidence is the browser suite `e2e/dashboards.spec.ts`, which runs in headless Chromium against the real Web Host. It watches every page from before sign-in with the HTTP cache off, and it fails a test on any console error, page error, error response or failed request that the test did not declare. The final run passed the whole suite twice, 30 of 30. After the chat demo, on 16 November, it passed 15 of 15 in managed mode and 15 of 15 in the default compat mode.

| # | Goal | Answer | Evidence |
|---|---|---|---|
| 1 | Each page is a generated `view.page` with a custom path, and all pages share `dashboard-layout`, which has no router. | Yes. Each page is its own generated registry entry with its own `mountRoute`. Both pages load one `dashboard-page` bundle, which reads the sub path from the Host's route context. | Test "two paths share one bundle, sub-path and history". Commits a46d6ff, 755d864. |
| 2 | `dashboard-layout` renders a responsive page from a `@wippy-fe/layout` setup and from tile props. | Yes. The wide layout applies from 1024 px of board width, and a 600 px container gets the narrow layout. A width change reads no data. | Tests "reflow, kept state, scroll and timeout on one page" and "a width change across 1024 changes the layout and sends no read". Commits 5a16a1d, 38c7f9c, gen-2-chat 2523942. |
| 3 | A tile reads its own data from its props and stays current from them. | Yes. Each tile reads its point through the URL in its `data-sources` attribute, and a new `request-id` starts a new read. | Tests "LLM usage shows the real values" and "App activity shows the real values", which also count the bars drawn on each chart. Commits 7c3434f, 2329e9b, 197632a. |
| 4 | A plugin ships a tile and its backend function as one module, and a page places the tile with no wiring. | Yes. `demo.run_timeline` and `demo.user_status` each ship a function, a point, a tile descriptor and the tile. The page names only the tile type, and the engine fills the default point and action. | Tests "plugin 1 shows the latest run as a tree", which checks the tree's names and depths on screen, and "plugin functions pass the engine schema check on a live read". Commits e2eb991, 2c997e6, 69724a9. |
| 5 | A click or a dropdown changes an argument, and only the tiles that depend on it update. | Yes. A model choice reads only the chart, the table and the token count. A bar click reads only the table. A direct link sets the model from the path. | Tests "choosing a model updates only the dependent tiles, and clear restores them", "a bar click sets the day for the table only", "the model comes from the path on a direct link". Commit da1157b. |
| 6 | A live signal updates only the tiles that use the changed point. | Yes, with one platform limit. An open viewer page reads only the users point after the signal, with no reload, and five signals at once cause one read. The signal reaches every connected user, because `wippy.central` cannot be scoped. It carries no data, so each tile reads again with its own permission. | Tests "plugin 2 updates in another browser through the live signal" and "the admin changes a status in the page, and the open viewer browser updates through the live signal". |
| 7 | An action changes real data as the viewer, and the engine refuses a viewer without permission. | Yes. The admin changes a user's status through the page after a confirmation in the Host's dialog; Cancel sends nothing. The viewer sees no controls, and a direct call gets 403 with the permission code. One key runs the action once, and another value with the same key gets 409. | Tests "the admin changes a status in the page, ...", "the admin sees the status controls and the viewer without the permission does not", and "one key runs once, another value with that key is refused, the viewer is refused", which counts the runs through the live signal. Commits 49780db, 067bc73, 8496d58. |
| 8 | The mapping lives with the actor, and `wippy/dashboards` holds none. | Yes. The Lua mappings are text in `demo.actor` recipes and run through `eval_runner`. The engine code has no mapping. | `src/demo_actor/`; commit b153a75. |

Three action rules are not in the browser suite: two calls at the same moment with one key run once, a stored call with no result answers unknown, and a call on the caller's own account is refused. The stage E3 builder checked them against the running app on 9 November, and later changes did not touch that code.

## Demo: one prompt builds one dashboard (16 November)

The app's normal chat builds a page from one request. There is no builder page and no endpoint of its own. A builder page can come later as an extra on top of the same tool.

- The chat agent `wippy` (`src/app/agents/_index.yaml`) gains the trait `wippy.dashboards.agent:trait`. The trait adds the live catalogue to the system prompt: every declared point with its fields and shape, and every tile type with the shapes it accepts. It also adds one tool, `BuildDashboard`.
- The tool takes a plan: a title, filters, tiles and rows. `plan.lua` turns it into a page spec, checks every field and shape against the catalogue, and publishes it through the same publish library as `POST /api/v1/dashboards/pages`. A refused plan goes back to the model as a list of errors, and the model corrects it. A tile with actions needs `confirmed: true`, which the agent sets only after the user agrees in the chat.
- The tool answers with a Markdown link to the new page. The page opens in the main panel, and the Host's nav lists it under "Dashboards".
- A viewer without `dashboards.publish` gets a refusal in the chat, and no page is made.
- The chat model in this app is DeepSeek V4.1 Flash. In the demo runs it built a correct page from one request. Once it chose a pie chart for a table point; the tool's error made it change the chart.
- Evidence: `e2e/dashboards-chat.spec.ts` (gated by `RUN_LLM_DEMO=1`, because each run spends model credits) passed 2 of 2 in managed mode: the admin builds a page and opens it from the link, and the viewer is refused.

Findings from the demo:

- **Tool identity.** An agent tool runs with the chat session's actor, but with the default user scope, not the scope of the user's groups. A publish from the tool was refused for the admin. The tool now rebuilds the scope from the actor's security groups (`security.named_scope`) and calls the publisher as that user. Phase 1 needs a platform answer: either tools get the session's real scope, or the spec says how a tool acts as its user.
- **Routes of new pages.** The Host learns routes at start or on a full page load. A link in the chat is a plain link, so it loads the page in full and the new route works. An in-app navigation to a page made after the start would fail until the Host learns new routes when a page is published.
- **Nav.** The template's default compat boot hides the Host's dynamic nav (`hide_nav_bar: "true"`) and shows the home app's own sidebar. In managed mode (`-o wippy.facade:fe_mode:default=managed`) the generated pages appear in the Host's nav like any other page.
- **Restore on start.** The process service `wippy.dashboards:restore_service` publishes every stored page again when the app starts, so pages, routes and nav items survive a restart. `DELETE /api/v1/dashboards/pages/{id}` removes a page for good.
- **Live data in tests.** The chat itself writes LLM usage, sessions and messages, so the demo pages change after every chat. The browser suite now reads the expected numbers from the points and compares the tiles with them.

## Reviews

Two read-only Codex reviews checked the result: one of the actions (stage E3) and one of the whole result (stage F1). Each finding was checked against the code before any fix.

- Actions: four gaps, all fixed in 49780db. Sensitive fields are now removed at every level of the stored copy, arguments deeper than 8 levels get 400, a renamed tile action posts to the page's action, and the result is converted to its schema before it is stored and returned.
- Whole result: no security gap. Six gaps in the checks and the contracts, all fixed in 8496d58: the error monitor, the run count for one key, weak browser assertions, the HTTP cache, the "Data as of" line in the tile frame, and the parameter type name.

## Spec changes by section

These changes come from the build. Each one names the section of spec v6.8 it changes.

- **4.3 Result envelope, 6.1 Tile inputs.** The runtime's JSON encoder cannot write `null` inside an object or a row, and an empty Lua table encodes as `[]`. The spec must say that a missing key means null, that a table row needs every cell, and that the engine converts a result to its declared schema before it validates, stores and returns it.
- **4.4 Mapping, 4.5 Access and safety.** `eval_runner` with an empty module allowlist still gives mapping text the globals `funcs`, `security`, `workflow` and `ctx`. The allowlist is therefore not a sandbox. Phase 1 must run actor mappings with a reduced security scope or in a separate process.
- **4.7 Actions.**
  - The action's function id differs from its declaration id.
  - A key that the page binds to a constant is always replaced by the page's value.
  - Arguments nested deeper than 8 levels get 400.
  - Sensitive fields are removed at every level of the stored copy.
  - The idempotency key is scoped to the viewer.
  - Confirmation uses the Host's `host.confirm()`.
  - The compiled props carry `allowed` for each action, computed for the viewer who reads them. A tile hides controls whose action is not allowed. The endpoint still checks every call.
- **4.2 Methods, 4.7 Actions.** A function's default pool runs calls one at a time. Point and action functions need a pool, for example `lazy` with `max_size` 8.
- **4.8 HTTP endpoints.** `write_json` sends an empty 200 when encoding fails, and an unknown API path answers with the app page and 200. A client must check the content type, and the engine must not rely on a 404 for a wrong path.
- **5.2 Parameters.** The parameter types are `select`, `date`, `string`, `number` and `boolean`; the spec's "strings" is the type `string`. A control tile receives its own parameter's value in `params` without a new `request-id`, so it can show the selection without reading its options again.
- **5.4 Layout and limits, 8.7 `dashboard-layout`.** `@wippy-fe/layout` sizes `minSize` and `maxSize` in pixels only, and it warns below 640 px. A page scrollbar moved the breakpoint until the board reserved a scrollbar gutter. The server must validate the size grammar.
- **6.4 Provenance.** The tile frame shows "Data as of unknown" when a point gives no data date, and no POC point gives one. The spec should say which points must supply `data_as_of`.
- **7.4 Live data.** `wippy.central` reaches every connected user. A signal must carry no data, and each tile reads again with its own permission. Scoping a signal to one page's viewers needs platform work.
- **8.1 Tile catalogue, 11 Tile kit.** `wippy-chartjs` needed a click event (`chart-click`) and did not fill its host. Both are fixed on the chart branch. Its automatic palette uses red, a severity colour, for the second series, so a chart tile must pass categorical colours.
- **8.5 Build rules.** Host 1.0.68 puts PrimeVue in the import map, so tiles may use PrimeVue. A built bundle stays out of git only when both the Makefile and CI build it.
- **9.1 Page storage and revisions.** Entries created at runtime are lost when the app restarts. Phase 1 needs a reconcile step that publishes stored pages again at boot. The POC now has one: the process service `wippy.dashboards:restore_service`.
- **9.3 Application publication contract.** `registry.apply` cannot be limited to a namespace, so the generator publishes as admin and checks the namespace in code. A duplicate `mountRoute` breaks `/api/public/pages/routes` for every user, so the engine refuses duplicate, reserved and malformed routes before it publishes.
- **9.5 Standard Wippy Web Host integration.** Host 1.0.68 passes the entry id as `resourceId`; the knowledge base said `meta.resource_id`. The Host fetches every auto-registered web component at start, so each new tile type adds to the start cost of every page. A navigation soon after sign-in cancels those loads.
- **14 Integration tests.** The browser suite is a base for Phase 1. Its rules carry over: watch every page from before sign-in, turn off the HTTP cache, let a test declare the failures it causes, count action runs through an observable effect, and check what is drawn on screen, not only attributes or API answers.

## Issues outside the spec

- In the web-components repository, `make build-chartjs` and `make lint-chartjs` do nothing, because the targets are marked phony and the pattern rule is skipped.
- A local module replacement fails while that module has a pnpm `node_modules` folder (symlinks). The workaround is to delete it after each build. The wippy-dev skill has no entry for this yet.
- The template's `AGENTS.md` names port 8087, but its `.env` sets 8086.
- No CI step runs the tile unit tests, and nothing lints or type-checks the template's root `e2e/` files.
- `wippy lint` reports 12 errors. Two are in this module and predate the demo: `wippy.dashboards:generator:53` (`op.id` is not in the changeset op type) and `wippy.dashboards:run_action:96` (`code` is not a field of `Error`). The other ten are in hub modules (keeper and `wippy-swiss.voice`). The demo's agent code has none.
- In the gen-2-chat worktree, the root `pnpm test` fails on 8 files of packages that are not built. This was not investigated.

## Where the work is

| Repository | Branch | Commits |
|---|---|---|
| app-template-raw | `feat/dashboards-poc`, worktree `.local/worktrees/dashboards-poc` | 7f2e349 to 8496d58 and this document, on `origin/master` 3606075 |
| gen-2-chat | `feat/layout-tree-size`, worktree `.local/worktrees/dashboards-layout-size` | 2523942: size on `@wippy-fe/layout` tree nodes |
| web-components | `feat/chartjs-click-event`, worktree `.local/worktrees/chartjs-click` | 7d47955, f3286ee: `chart-click` event; 1f5c564: the chart fills its host |

The template's `wippy.lock` loads `wippy-swiss/chartjs` from the local chart branch, and the template vendors the patched `@wippy-fe/layout` build. Both must be published before this branch runs anywhere else.

## How to run the POC

1. Use the worktree `C:/Projects/app-template-raw/.local/worktrees/dashboards-poc`. It has its own `.env` and `.wippy/app.db`. The app listens on `127.0.0.1:8086`, because `.env` sets that port.
2. After a `wippy.lock` change, run `C:/Projects/app-template-raw/wippy.exe install` in the worktree.
3. Build the front end from the worktree: `.\make.bat build`. To build one package, use `.\make.bat build-wc-<name>` or `.\make.bat build-app-<name>`.
4. Start the app with the wippy-dev skill (`preflight`, then `bg_run`, then `check`). The start line is `wippy.exe run -c -o app:gateway:addr=:8086` with `.env` loaded.
5. The restore service publishes the stored pages again at each start. To rebuild the two demo pages from their specs, sign in as the admin and send `POST /api/v1/demo/build`. The browser suite does this itself.
6. For the chat demo, start the run card's `managed` instance, sign in, open "Ask Wippy" and ask for a dashboard, for example "Build me a dashboard of LLM usage: total tokens, tokens by day per model, and a table by model, with a model filter."
7. Open `http://127.0.0.1:8086/`, sign in, and open the pages from the menu or at `/reports/llm-usage` and `/ops/app-activity`. The admin account is in `.env`. The test users `viewer@wippy.local` and `target@wippy.local` come from `src/demo_seed/`.
8. Run the browser suite from the worktree: `node C:/Projects/app-template-raw/node_modules/@playwright/test/cli.js test e2e/dashboards.spec.ts --reporter=list`. Before the first test it publishes the two demo pages and the two stage B test pages from `e2e/fixtures/dashboards/`.
