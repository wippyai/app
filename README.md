# Wippy Application Template

A starter Wippy application — a Vue admin frontend, user management, an AI assistant, example web components, a live **Web Research** demo, and the **Keeper** console for editing the running app from the browser.

<p align="center">
  <img src="docs/images/research-light.png#gh-light-mode-only" alt="Web Research demo" width="860">
  <img src="docs/images/research-dark.png#gh-dark-mode-only" alt="Web Research demo" width="860">
</p>

## Quick start

Requires the [Wippy CLI](https://wippy.ai) on your `PATH` and Node.js 18+.

```bash
wippy install               # download backend modules from the hub into .wippy/
cp .env.example .env        # configure environment (set OPENAI_COMPAT_API_KEY for the AI features)
make build                  # build the frontend bundles
set -a && . ./.env && set +a
wippy run -c                # start the runtime
```

`wippy run` reads configuration from OS environment variables, not from `.env` — export the file into your shell (the `set -a` line above) or the seeded admin credentials fall back to random values.

- **App** — <http://localhost:8080> · sign in as the admin set by `USERSPACE_USER_DEFAULT_ADMIN_EMAIL` and `USERSPACE_USER_DEFAULT_ADMIN_PASSWORD` in `.env` (the password has no default)
- **Keeper** — <http://localhost:8080/c/keeper:main>

## What's inside

- **Users** — CRUD over accounts and security groups
- **AI assistant** — chat with an agent ("Ask Wippy") from any page
- **Components** — example web components (charts, mermaid, markdown, and more)
- **Web Research** — an async dataflow where a researcher agent fetches pages with an HTTP GET tool and streams each fetch and the final answer to the browser live (`src/app/research/`)
- **Keeper** — a console to edit the registry, sync `src/**`, build components, and inspect dataflows, sessions, and logs against the running app

<table>
  <tr>
    <td width="33%" valign="top"><b>Components</b><br>
      <img src="docs/images/components-light.png#gh-light-mode-only" alt="Components page" width="100%">
      <img src="docs/images/components-dark.png#gh-dark-mode-only" alt="Components page" width="100%">
    </td>
    <td width="33%" valign="top"><b>Keeper console</b><br>
      <img src="docs/images/keeper-light.png#gh-light-mode-only" alt="Keeper dashboard" width="100%">
      <img src="docs/images/keeper-dark.png#gh-dark-mode-only" alt="Keeper dashboard" width="100%">
    </td>
    <td width="33%" valign="top"><b>Dataflow inspector</b><br>
      <img src="docs/images/dataflow-light.png#gh-light-mode-only" alt="Dataflow timeline" width="100%">
      <img src="docs/images/dataflow-dark.png#gh-dark-mode-only" alt="Dataflow timeline" width="100%">
    </td>
  </tr>
</table>

<p align="center"><sub>Screenshots follow your GitHub light/dark theme automatically.</sub></p>

## Runtime features

What the Wippy runtime gives you, exercised by this template:

- **Self-modifying registry** — the app and the tool that edits it are the same process. Keeper edits entries, syncs `src/**`, builds components, and ships changes through governance without a restart. Treat its access as admin-level in production.
- **MCP server** — the same Keeper operations are exposed over the Model Context Protocol at `/keeper-mcp/`, so external AI agents can drive the registry and inspect the app.
- **Dataflows & multi-agent workflows** — async, durable, and observable. The Web Research demo and Keeper's own pipeline are dataflows you can replay node-by-node in the inspector above.
- **Agents, tools & model classes** — LLM agents calling Lua tools. Models resolve by class (`class:fast`, `smart`, `coder`, `nano`, `embed`), so swapping providers is configuration, not code.
- **Realtime relay** — `process.send` to a user's hub streams events to the browser over WebSocket; the Web Research fetch feed is built on it.
- **HTTP, users & security** — HTTP endpoints, user CRUD, policy-based access control, and a token store.
- **Batteries-included Lua modules** — `http_client`, `html` (sanitize), `llm`, `json`, `time`, `security`, and more, available to any `function.lua`.

Upload queue jobs run without a request actor. `src/app/security/_index.yaml`
gives the upload worker access to `app:db`, status notifications, and upload
types and processing functions in the `app` and `app.*` namespaces. The template
does not define a default upload pipeline. When adding one, declare any extra
permissions its processors need, such as filesystem or cloud storage access.
Upload token callbacks also need explicit permissions for the encryption key,
callback scope, and callback function.

## Project structure

Backend folders mirror Wippy namespaces — each `src/app/<name>/_index.yaml` declares namespace `app.<name>`:

```
src/app/               Backend (Wippy Lua), namespace `app`
  agents/              app.agents     AI agents and assistant tools
  api/                 app.api        HTTP endpoints (+ app.api.entries, app.api.websocket)
  users/               app.users      user CRUD endpoints and logic
  security/            app.security   access policies and token store
  models/              app.models     LLM model registry
  research/            app.research   Web Research demo: agent + HTTP GET tool + dataflow
  views/               app.views      frontend page registration (view.page)
  deps/                app.deps       module dependencies (facade, keeper, llm, ...)
  env/                 app.env        environment storage

frontend/
  applications/main/   Vue 3 admin app (the page you see)
  web-components/       standalone example components (mermaid, markdown, charts, ...)
  docs/                frontend and theming guides

static/                static assets + generated bundles (static/app, static/wc)
```

## Development

```bash
cd frontend/applications/main && npm run dev   # frontend watch mode
make build                                     # rebuild all bundles to static/
wippy run -c                                   # server
```

## Session Forms demo

The Session Forms Demo page (`/session-forms-demo`) starts a chat with the Forms demo agent, which asks a delivery-preference question with a form. The agent uses the `wippy.session.forms:ask_user` trait from the `wippy/session` module and the same model as Ask Wippy.

### Dev fixtures

The page can also start four scripted fixture agents. They make no model calls, so the e2e tests can rely on fixed replies. They belong to the `app.session_forms_demo` namespace, together with a deterministic model and provider and a test-only endpoint that edits an artifact. `.wippy.yaml` removes the namespace unless the `session-forms-fixtures` profile is selected, so a release has none of it.

```bash
wippy run -c --profile session-forms-fixtures
# or, with SESSION_FORMS_DEV_FIXTURES=true in the environment or .env:
make run-dev
```

`SESSION_FORMS_DEV_FIXTURES=true` also enables the test-only endpoint, which answers 404 otherwise and is open to admin users only. Passing `--config` replaces the default `.wippy.yaml`, so when you pass your own config file, add `--config .wippy.yaml` before it so the fixtures stay off.

The fixture agents reply to these phrases, and anything else gets "Say 'ask me' to get a form." The plain fixture agent has no forms trait, so it answers "ask me" with "I can't create forms here." A form answer gets "Thanks, noted:" followed by the answer, or a late-answer notice when the form was answered after the conversation moved on.

| Phrase | Reply |
|---|---|
| `ask me` | Asks a single-question delivery form. |
| `ask me many` | Asks a four-question order form. |
| `ask me several` | Asks one required several-answer question with an Other box, so Enter with nothing ticked shows the tick-one message. |
| `propose action` | Replies with a plan that waits for confirmation. |
| `work slowly` | Replies after 25 seconds. |
| `read form <id>` | Calls `read_form` for that form id. |
| `list forms` | Reports whether the prompt holds a checkpoint summary, and the form index. |
| `checkpoint now` | Reports enough prompt tokens for the Session to write a checkpoint. |
| `slow tool` | Writes "Starting the slow job." and calls a tool that sleeps 25 seconds, then replies "Slow job finished." The text is stored while the tool still runs. |
| `fail after text` | Writes "Starting the quick job." and calls a quick tool, then the next model call returns a provider error, so the turn fails after the text. |
| `limit after text` | Writes "Starting the quick job again." and calls a quick tool. Use the Session Forms Limit Fixture agent, whose turn allows one model step: the next step hits the turn limit. On the other agents the reply after the tool is "Quick job finished." |
| `artifact and ask` | In one model round, calls a tool that returns an inline artifact and calls `ask_user`. The round has no text. |

The four job phrases (`slow tool`, `fail after text`, `limit after text`, `artifact and ask`) also work in a form answer. Type one as the Other text of a question and the next turn runs that phrase, the same way `work slowly` delays the reply. A late answer keeps its late-answer reply. The plain fixture agent has no job tools and replies "I can't run jobs here."

## Frontend & theming

All frontend, theming, and web-component guidance lives in [`frontend/docs/`](frontend/docs/README.md). The one rule worth stating up front: customize appearance through the **facade** (`src/app/deps/_index.yaml`) — `css_variables` / `custom_css` propagate to every page and component; per-app CSS does not. See [`frontend/docs/theming.md`](frontend/docs/theming.md).

## Testing

```bash
wippy test users-test
```

This command waits for the users database migrations and runs the users suite.
It exits nonzero if any case fails or no cases run. The test entry is inactive
during normal `wippy run` startup.

## Documentation

- [wippy.ai](https://wippy.ai) — full documentation · [llms.txt](https://wippy.ai/llms.txt)
- [`frontend/docs/README.md`](frontend/docs/README.md) — component, app, proxy-API, host, and theming guides
