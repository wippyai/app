# Dashboards POC: contracts

These are the frozen interfaces of the dashboards proof of concept (POC) on this branch. They come from the dashboards specification v6.8 (sections 4, 5, 6, 7.4, 8.2 and 8.7) and the POC build plan, with the POC's own values. Only the coordinator changes this file. A builder who needs a change stops and reports it.

The POC is thrown away. It proves the frame, so these contracts stay small. Anything not listed here is not part of the POC.

## 1. Base

| Item | Value |
|---|---|
| App | `app-template-raw`, branch `feat/dashboards-poc`, from `origin/master` 3606075 |
| Runtime | `wippy.exe` 0.3.45a, one instance, at `http://127.0.0.1:8086`. The local `.env` sets that origin. The plan said 8087, which `AGENTS.md` still names. |
| Web Host | 1.0.68, `@wippy-fe/*` 0.0.68, facade 0.6.50. The Host import map includes PrimeVue (spec section 8.5). |
| API router | `app:api`, prefix `/api/v1/`, `token_auth`, post middleware `endpoint_firewall` |
| Database | `app:db`, SQLite `./.wippy/app.db` |
| Admin group | `app.security:admin` |
| User group | `app.security:user`, which `user.general_access` allows nearly everything except `registry.apply` |

## 2. Folders and namespaces

| Folder | Namespace | Owner stage |
|---|---|---|
| `src/dashboards/` | `wippy.dashboards` | B1, C2, E3 |
| `src/dashboards/pages/` (generated entries only, never hand-written) | `wippy.dashboards.pages` | B1 |
| `src/dashboards/components/` (the `view.component` entries of `dashboard-layout` and the tiles) | `wippy.dashboards.components` | B3, C1, C4 |
| `src/demo_seed/` (test users) | `demo.seed` | B1 |
| `src/dashboards/tiles/` (tile descriptors of `kpi`, `control.select`, `chart`, `table`) | `wippy.dashboards.tiles` | C3, C4 |
| `src/demo_actor/` | `demo.actor` | C3 |
| `src/demo_run_timeline/` | `demo.run_timeline` | E1 |
| `src/demo_user_status/` | `demo.user_status` | E2, E3 |
| `frontend/applications/dashboard-page/` | built to `static/app/dashboard-page` | B2 |
| `frontend/web-components/dashboard-layout/` | built to `static/wc/dashboard-layout` | B3 |
| `frontend/web-components/dash-tiles/` | built to `static/wc/dash-tiles` | C1, C4 |
| `frontend/web-components/run-timeline/` | built to `static/wc/run-timeline` | E1 |
| `frontend/web-components/user-status/` | built to `static/wc/user-status` | E2 |
| `frontend/packages/dash-tile-helper/` | local path dependency of every tile package | C1 |

Bundles. Both the `Makefile` and the CI job `Build_frontend` (`make build NPM_INSTALL='npm ci'`) build every package listed in the `build` target, so the bundles stay gitignored. Each new package gets a `build-app-<name>` or `build-wc-<name>` target in the `Makefile`, a place in its `build` and `lint` lists, and a row in `$apps` or `$wcs` (and `$lintDirs`) in `make.ps1`. This replaces the plan's stage A1 step that added `.gitignore` exceptions: when the plan was written, CI could not build the bundles.

## 3. HTTP endpoints

All endpoints sit on `app:api`, take the viewer's token and return JSON.

| Method and path | Who | Stage | Purpose |
|---|---|---|---|
| `POST /api/v1/dashboards/pages` | caller allowed `dashboards.publish` on `wippy.dashboards:pages` | B1 | Store a page spec and publish it |
| `GET /api/v1/dashboards/pages/{id}/props` | viewer with `view` on the page's entry | B1 | Compiled props of the published revision |
| `GET /api/v1/dashboards/pages/{id}/points/{point}` | viewer with `view` on the page's entry | C2 | One read. Query: `args` (one JSON value, URL-encoded) and optional `operation` |
| `POST /api/v1/dashboards/pages/{id}/actions/{action}` | viewer with `view` on the page's entry and the action's permission | E3 | One action. Body: `{ "args": {}, "idempotency_key": "..." }` |
| `POST /api/v1/demo/seed-users` | `app.security:admin` | B1 | Creates the test users of section 12 if they are missing. Safe to repeat. |
| `POST /api/v1/demo/build` | `app.security:admin` | C3 | Runs `demo.actor:build_pages` |
| `POST /api/v1/demo/signal/users` | `app.security:admin` | E2 | Publishes `dash.users.changed` once, for tests |

`{id}` is the page id from the spec, for example `llm_usage`. Status codes:

| Case | Status | Body |
|---|---|---|
| Read or action handled, any envelope state except below | 200 | Result envelope (section 7) |
| `args` fail the schema, name a key the page does not bind, or (actions) a field outside `tile_args` | 400 | Envelope with `state: failed`, `error.code: invalid_args`. The function does not run. A key the page binds to a constant always takes the page's value, whether or not the request sends it and whether or not it is in `tile_args`. A key bound to `$param` (and, for actions, a key in `tile_args`) takes the request's value. |
| The page names a declaration that is gone or has another type | 400 | Envelope with `state: failed`, `error.code: undeclared`. Nothing runs. |
| Viewer may not see the page, or lacks the action's permission | 403 | Envelope with `state: denied`, `error.code: denied` or the action's permission code |
| Unknown page, point or action | 404 | `{ "error": { "code": "not_found" } }` |
| Invalid page spec at publication | 400 | `{ "error": { "code": "...", "message": "..." } }` |

Publication error codes: `invalid_spec`, `invalid_route`, `reserved_route`, `duplicate_route`, `undeclared_point`, `undeclared_action`, `unknown_tile`, `format_mismatch`.

## 4. Page spec (POC subset of `wippy.dashboard_page/v1`)

```json
{
  "spec": "wippy.dashboard_page/v1",
  "id": "llm_usage",
  "title": "LLM usage",
  "route": "/reports/llm-usage",
  "icon": "tabler:chart-bar",
  "order": 50,
  "time_zone": "Europe/Warsaw",
  "params": {
    "model": { "type": "select", "label": "Model", "default": null, "from_path": 0,
               "options": { "data": "models" } },
    "day": { "type": "date", "label": "Day", "default": null }
  },
  "data": {
    "models": { "kind": "function", "ref": "demo.actor:usage_models" },
    "tokens": { "kind": "function", "ref": "demo.actor:usage_tokens",
                "args": { "model": { "$param": "model" } } }
  },
  "actions": {},
  "tiles": {
    "model_picker": { "type": "control.select", "param": "model" },
    "tokens": { "type": "kpi", "data": { "main": "tokens" }, "fields": { "value": "tokens" },
                "options": { "label": "Tokens" } }
  },
  "layout": {
    "breakpoints": { "lg": 1024 },
    "layouts": {
      "default": { "direction": "vertical", "children": [
        { "panel": "model_picker", "size": "96px" }, { "panel": "tokens", "size": "140px" } ] },
      "lg": { "direction": "vertical", "children": [
        { "direction": "horizontal", "size": "140px", "children": [
          { "panel": "model_picker", "size": "50%" }, { "panel": "tokens", "size": "50%" } ] } ] } }
  }
}
```

- `id` matches `^[a-z][a-z0-9_]{1,40}$` and is stable.
- `route` matches `^(/[a-z0-9][a-z0-9-]*){1,4}$`. Its first segment is not `login`, `logout`, `chat`, `keeper`, `c`, `web`, `page`, `app`, `api` or `wc`. No two pages share a route.
- `data.<name>.ref` is the id of a point declaration (section 5.1). `actions.<name>.ref` is the id of an action declaration (section 5.2).
- A tile `type` names a tile descriptor (section 5.3). A plugin tile can omit `data` and `actions`, and the engine fills them from the descriptor's defaults.
- `$param` references are typed values, never string interpolation. `{ "$event": "x" }` reads a field of an event detail inside `on`.
- Each value in `data.<point>.args` and `actions.<name>.args` is either a constant with no `$param` inside it, or exactly `{ "$param": "<declared parameter>" }`. Mixed values are refused, so a request can never replace part of a constant.
- Every point and action declaration has an `args_schema`. The engine validates the merged arguments against it on every call.
- `layout` holds `@wippy-fe/layout` `breakpoints` and `layouts`. Each panel id is a tile id. `default` is required and applies below the smallest breakpoint, and each declared breakpoint needs its own layout. Every layout places each tile exactly once. Sizes use `Nfr`, `Npx` or `N%` (`auto` is refused). A nested tree may carry `size` (stage A2 patch).
- Limits: 30 tiles, 12 data points, 8 parameters per page.

## 5. Registry declarations

### 5.1 Point

```yaml
- name: usage_by_day
  kind: registry.entry
  meta:
    type: wippy.dashboards.point
    title: Token use by day        # becomes source_title
    func: demo.actor:resolve       # the function the engine calls
    args_schema:                   # JSON schema; the engine validates args against it
      type: object
      additionalProperties: false
      properties:
        model: { type: [string, "null"] }
    output: { shape: series }      # or { shape: schema, schema: {...} }
    refresh_ms: 60000              # optional
    live_topic: dash.users.changed # optional
    recipe: usage_by_day           # actor-specific; the engine passes it through
```

The engine calls the function as the viewer with one table:

```lua
{ args = { model = "claude-sonnet-4-6" },     -- validated, $param already resolved
  point_id = "demo.actor:usage_by_day",       -- the declaration id
  point_meta = { ... } }                      -- the declaration's whole meta table
```

It returns the data in the declared shape, or `nil, err`. An error becomes `state: failed` with `error.code: source_error`, and the engine never forwards the error text to a viewer.

### 5.2 Action

```yaml
- name: set_status
  kind: registry.entry
  meta:
    type: wippy.dashboards.action
    title: Set user status
    func: demo.user_status:set_user_status   # the function; the declaration id is demo.user_status:set_status
    args_schema: { type: object, additionalProperties: false, required: [user_id, status],
                   properties: { user_id: { type: string }, status: { enum: [active, inactive] } } }
    tile_args: [user_id, status]
    result_schema: { type: object }
    permission: { action: dash.users.set_status, resource: demo.user_status:users }
    confirm: true
    sensitive_fields: []
    refreshes: [users]
```

The function receives `{ args = <merged args>, action_id = "<declaration id>", idempotency_key = "..." }` and runs as the viewer. A function declared as a point cannot run as an action, and the reverse also holds.

### 5.3 Tile descriptor

```yaml
- name: kpi
  kind: registry.entry
  meta:
    type: wippy.dashboards.tile
    tile_type: kpi                 # the value of "type" in a page spec
    tag: dash-kpi                  # custom element tag
    inputs: { main: { shape: scalar } }
    fields: [value]                # field names the tile maps through "fields"
    options_schema: { type: object }
    events: {}                     # name -> detail schema
    params: []                     # page parameters the tile reads directly
    default_data: {}               # input -> point declaration id
    default_actions: {}            # name -> action declaration id
    min_size: { w: 160px, h: 96px }
    default_size: { w: 25%, h: 140px }
```

| `tile_type` | Tag | Input shape | `fields` | Events | Stage |
|---|---|---|---|---|---|
| `text` | `dash-text` | `record` | `text` | none | C1 |
| `control.select` | `dash-select` | `options` | `value`, `label` | `change` `{ value }` | C3 descriptor, C4 tile |
| `kpi` | `dash-kpi` | `scalar` | `value` | none | C3 descriptor, C4 tile |
| `chart` | `dash-chart` | `series` or `category` (the descriptor allows both) | `x`, `y` (list), `series` | `select` `{ x, series, value }` | C3 descriptor, C4 tile, D1 |
| `table` | `dash-table` | `table` | `columns` (list) | none | C3 descriptor, C4 tile |
| `demo.run_timeline` | `run-timeline` | `schema` | none | none | E1 |
| `demo.user_status` | `user-status` | `schema` | none | none; uses action `set_status` | E2, E3 |

`dash-chart` wraps `<wippy-chartjs>`. Stage A4 adds a `chart-click` DOM event to `wippy-chartjs` with the detail `{ label, datasetLabel, datasetIndex, dataIndex, value }`, where `label` is the x label of the clicked element. A click outside any data element emits nothing. `dash-chart` turns it into its `select` event `{ x: label, series: datasetLabel, value }`.

## 6. Compiled props of `dashboard-layout`

The props endpoint returns `id`, `title`, `revision`, `page-url`, `layout`, `tiles` and `params`. The page host adds `sub-path` from `config.context.route` and passes these as attributes:

JSON note: the runtime's JSON encoder cannot write `null` inside an object, so the server leaves null keys out (for example `default`, `param`, `refresh_ms`, `live_topic`). Every reader treats a missing key as null.

| Attribute | JSON | Content |
|---|---|---|
| `sub-path` | string | The path below the page's mount route, from `config.context.route`, without the query and without a trailing slash: `""` at the page root, `/claude-haiku-4-5` at `/reports/llm-usage/claude-haiku-4-5` |
| `page-url` | string | `/api/v1/dashboards/pages/<id>` |
| `layout` | object | `{ "breakpoints": {...}, "layouts": {...} }` |
| `tiles` | object | Tile id to compiled tile (below) |
| `params` | object | Parameter declarations: `type`, `label`, `default`, optional `from_path`. No options source. |

```json
{ "by_day": {
    "tag": "dash-chart",
    "fields": { "x": "day", "series": "model", "y": ["tokens"] },
    "options": { "label": "Tokens by day" },
    "data": { "main": { "point": "by_day", "args": { "model": { "$param": "model" } },
                        "refresh_ms": null, "live_topic": null } },
    "actions": {},
    "params": [],
    "param": null,
    "on": { "select": { "set": { "day": { "$event": "x" } } } } } }
```

- The compiler works through an allowlist. Props never hold a function id, a declaration id, a workflow reference, `point_meta` or the raw spec. Page-local point and action names stay.
- A control tile (`param` set) gets the parameter's options point as its `main` input.
- `refresh_ms` and `live_topic` come from the point declaration.
- A compiled action is `{ "action": "<page action>", "confirm": true, "allowed": true, "refreshes": [...] }`. `allowed` is per viewer, so the props of one page differ between viewers.

The board, before each tile update, replaces each `$param` with the current value and builds the tile attributes:

- `data-sources`: `{ "main": { "url": "<page-url>/points/<point>", "args": {...}, "refresh_ms": ..., "live_topic": ... } }`
- `actions`: `{ "<name>": { "url": "<page-url>/actions/<page action>", "confirm": true, "allowed": true } }`. `<name>` is the tile's own name for the action, and `<page action>` is the page's action that the tile's name maps to (the compiled `action` field). The two differ when a page maps a tile action to another name.
- `allowed` comes from the compiled action. The props endpoint runs as the viewer and sets it to true only when the viewer holds the action declaration's `permission` at that read. A tile hides the controls of an action whose `allowed` is not true. This only hides controls: the action endpoint still checks the permission on every call (section 10), and a permission change shows after the next props read.

Current values: default first, then `from_path` (segment N of `sub-path`, decoded), then user changes. Clearing a selection returns a parameter to its default. A tile depends on a parameter when the parameter appears in its `data` args or in its `params` list. Only dependent tiles get a new `request-id`.

A control tile (with `param`) also receives its own parameter's current value in its `params` attribute, under the parameter's name, so it can show the selection. A change of that value updates the control's `params` attribute, but it is not a data dependency: the control keeps its `request-id` and does not read its options again.

## 7. Result envelope

```json
{ "point": "tokens", "state": "ready",
  "data": { "schema": "wippy.dashboard_frame/v1", "fields": [], "rows": [] },
  "computed_at": "2026-11-09T12:00:00Z", "data_as_of": null,
  "source_title": "Token use", "args": { "model": null },
  "completeness": "complete", "warnings": [],
  "refresh_ms": null, "live_topic": null }
```

- `state`: `ready`, `computing`, `empty`, `failed` or `denied`.
- `computing` adds `operation` (opaque token) and `retry_after_ms`. The tile sends `operation` back in its next read with the same `args`. The POC engine returns `computing` only from fixtures and tests.
- `failed` and `denied` add `error: { code, message, input?, field? }`. `message` is a fixed safe text. Codes: `invalid_args`, `format_mismatch`, `source_error`, `denied`, `not_found`, `expired`, `undeclared`.
- `empty`: a frame with no rows, or a `record` with no fields. Never a zero.
- `data_as_of` is null when unknown, and the tile shows "unknown".

Table frame (shapes `scalar`, `series`, `category`, `table`, `options`):

```json
{ "schema": "wippy.dashboard_frame/v1",
  "fields": [ { "name": "day", "type": "date", "role": "dimension", "nullable": false } ],
  "rows": [ ["2026-06-10"] ] }
```

Field types: `time`, `date`, `number`, `decimal`, `string`, `boolean`. Every field sets `nullable`. POC limit: the runtime JSON encoder cannot write a null cell inside a row, so the engine refuses any missing cell as `format_mismatch`, even in a nullable field. The POC's real data has no nulls. This is a spec finding. `decimal`, and integers above 2^53, travel as strings. Shape rules the engine checks after each read:

| Shape | Rule |
|---|---|
| `scalar` | Exactly one row, and the tile's `value` field is a `number` or `decimal` |
| `series` | `fields.x` is `date`, `time` or `number`; every `fields.y` is `number` or `decimal` |
| `category` | `fields.x` is `string`; every `fields.y` is `number` or `decimal` |
| `table` | A frame with at most 1000 rows |
| `options` | A `value` field, and an optional `label` field |
| `record` | A JSON object |
| `schema` | Valid against the tile's input schema |

## 8. Tile protocol (`tile_v1`)

Attributes, all strings, JSON where noted:

| Attribute | Content |
|---|---|
| `tile-id` | Tile id in the page |
| `request-id` | A new id for each configuration, set last |
| `data-sources` | JSON, section 6 |
| `actions` | JSON, section 6 |
| `fields` | JSON map from the tile's field names to data field names |
| `options` | JSON |
| `params` | JSON, current values of the parameters the tile declares |
| `mode` | `view` (the POC has no `edit`) |

Events, dispatched on the tile element as `CustomEvent` with `bubbles: true` and `composed: true`:

| Event | Detail |
|---|---|
| `render-state` | `{ request_id, status, error?, computed_at?, data_as_of?, source_title?, stale?, completeness? }`. `status`: `loading`, `computing`, `ready`, `empty`, `denied` or `error`. |
| `tile-event` | `{ request_id, name, detail }` for events the descriptor declares. The name `action-done` is reserved for the helper, with detail `{ action, status }`. |

- A tile starts work only when connected and configured, and only after `request-id` is set.
- The helper numbers its reads within one `request-id` and drops any response older than the last one it applied.
- The first read of each `request-id` ends in one terminal `render-state`. The board shows a timeout when none arrives within 10 seconds, or within 60 seconds while the tile reports `computing`.
- The helper joins live signals that arrive within 250 milliseconds into one read.
- Actions: the helper shows a confirmation when `confirm` is true, sends the POST with a new idempotency key (a UUID), and emits `tile-event` `action-done` with the result state. After `done`, the board gives the tiles that use the action's `refreshes` points a new `request-id`.

The board draws each tile's frame from `render-state`: a loading bar, the source title and `computed_at`, and the error, denied, empty or timeout state.

## 9. Live signal

- Topic `dash.users.changed`. The message carries no data beyond its type.
- The backend publishes with `process.send(process.registry.lookup("wippy.central"), "dash.users.changed", {})`. `wippy.central` forwards the message to every connected user hub; it cannot address one user. That is acceptable because the signal carries no data and every re-read checks the viewer's access. Delivery to chosen viewers only would need a loop over their `user.<id>` hubs.
- The helper subscribes with `on()` from `@wippy-fe/proxy` and unsubscribes on disconnect.

## 10. Actions

- Before it runs an action, the engine stores a row in `dash_action_log`: `key`, `viewer_id`, `page_id`, `revision`, `action`, `args_hash`, `args_redacted` (sensitive fields removed), `state`, `result`, `created_at`, `updated_at`. The pair (`viewer_id`, `key`) is unique.
- `args_redacted` drops every field whose name is in `sensitive_fields`, at every level: in nested objects and in objects inside arrays.
- Merged `args` may nest tables at most 8 levels deep, the top-level object being level 1. Deeper `args` get 400 with `error.code: invalid_args` and `error.field: args`, and no row is stored. So `args_hash` always covers the whole value.
- A retry with the same key and the same `args_hash` returns the stored result. The same key with another hash returns 409 with `error.code: idempotency_conflict`.
- The engine stores and returns the result as converted to `result_schema`, the same value it validated, so an empty object stays an object in the first answer and in every replay.
- A row in state `running` with no result returns `state: unknown`, and the action does not run again.
- Server-bound `args` always win over `tile_args`.
- `demo.user_status:set_status` refuses the caller's own account with `error.code: self_target`.

## 11. Generated `view.page` entries

The generator writes one entry per published page through a registry changeset, as the publisher (section 13). Before `apply()` it refuses any change outside `wippy.dashboards.pages`, and it checks the route rules of section 4 against every `view.page` in the registry, because a duplicate `mountRoute` breaks the Host for every user.

```yaml
- name: llm_usage                      # page id
  kind: registry.entry
  meta:
    type: view.page
    name: dash-llm-usage
    title: LLM usage
    icon: tabler:chart-bar
    order: 50
    announced: true
    secure: true
    url: /app
    base_path: app/dashboard-page
    entry_point: app.html
    mountRoute: /reports/llm-usage/:part(.*)*
    resource_id: llm_usage             # kept for clarity; Host 1.0.68 does not use it
    managed_by: wippy.dashboards
```

Entry ids live in `wippy.dashboards.pages`. Access uses `view` on `page:<entry id>`. Host 1.0.68 passes the entry id (`wippy.dashboards.pages:llm_usage`) as `config.context.resourceId`, not `meta.resource_id`, so the page host keeps the part after the last `:` as the page id. The Wippy KB said otherwise; the running app showed this on 2026-11-09.

## 12. Seeded users and test policies

| Account | Group | Use |
|---|---|---|
| The admin from `.env` (`USERSPACE_USER_DEFAULT_ADMIN_EMAIL`; in this database `admin@navi.local`) | `app.security:admin` | Builds and publishes pages, runs the action |
| `viewer@wippy.local` | `app.security:user` | Active viewer for denial tests |
| `target@wippy.local` | `app.security:user` | Safe target of `set_status` |

The test users are declared in the registry entry `demo.seed:test_users` in `src/demo_seed/_index.yaml`, as `meta.users`, a list of `{ email, password, name, group }`. The passwords are generated local test values, stored only there. Stage B1 adds a deny policy for `view` on the test page `page:wippy.dashboards.pages:deny_check` for `app.security:user`, and a deny policy for `dashboards.publish` for `app.security:user`. Stage E3 adds a deny policy for `dash.users.set_status` for `app.security:user`.

## 13. Probe results (stage A3)

Results of 2026-11-09, on this branch. The probe code was removed after the stage.

- Mapping. `require("eval_runner").run({ source = <recipe text>, modules = {}, args = { input } })` runs a recipe; the recipe reads `...` and returns a table. The caller needs `eval.compile` and `eval.run`. The `usage_summary` recipe returned the plan's sentence exactly. Recipes stay Lua text run through `eval_runner`.
- Sandbox limit. `modules = {}` blocks `require`, `io.open` and `os.execute`, but the evaluated code still sees the globals `funcs`, `security`, `workflow` and `ctx`. `funcs.new():call(...)` ran another function, and `security.actor()` returned the caller. A mapping can therefore call any function its caller may call. In the POC the recipes come from the mock actor, which is trusted code. This is a spec finding (sections 4.4 and 10).
- Runtime `view.page`. An entry created through `registry.snapshot():changes():create(...)` and `apply()` with `secure: true` appears in `/api/public/pages/routes` and `/api/public/pages/list` for the admin at once, and its page renders in a fresh browser load. The Host still learns routes only at its own start.
- Restart. Runtime-created entries are gone after a restart, because the registry history is in memory. After every restart, run `POST /api/v1/demo/build` again.
- `registry.apply` scope. The check uses an empty resource, so a policy cannot limit it to a namespace, and a function keeps its caller's identity even when it declares its own actor. The generator therefore writes as the publisher and refuses, in code, any change outside `wippy.dashboards.pages`. Publication requires `dashboards.publish`, which the user group is denied. A narrow service identity (spec section 9.5) needs a broker process. This is a spec finding.
- Duplicate `mountRoute`. The registry accepts it. `/api/public/pages/routes` then returns 500 for every caller, and the Host fails at start with a critical error and sends the user to the sign-in page. Deleting the duplicate entry restores 200 at once, with no restart. The engine must refuse a duplicate before it applies the change.
- `LayoutManagerView` in a shadow root: moved to stage B3, which builds that component and checks it in the browser.
