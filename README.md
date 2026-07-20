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

- **App** — <http://localhost:8080> · default admin `admin@wippy.local` / `admin123`
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

## Frontend & theming

All frontend, theming, and web-component guidance lives in [`frontend/docs/`](frontend/docs/README.md). The one rule worth stating up front: customize appearance through the **facade** (`src/app/deps/_index.yaml`) — `css_variables` / `custom_css` propagate to every page and component; per-app CSS does not. See [`frontend/docs/theming.md`](frontend/docs/theming.md).

## Testing

```bash
wippy run test users
```

## Documentation

- [wippy.ai](https://wippy.ai) — full documentation · [llms.txt](https://wippy.ai/llms.txt)
- [`frontend/docs/README.md`](frontend/docs/README.md) — component, app, proxy-API, host, and theming guides
