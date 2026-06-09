# Agent artifacts: CreateArtifact tool guide

How the `CreateArtifact` tool works, how artifact embed tokens differ from inline component tags, and how to handle SPA page sizing. Read this if you are writing or debugging an agent trait that creates artifacts, or if an agent is producing broken `<artifact>` tags in its replies.

---

## Three content modes

### 1. Text mode — LLM-generated content

Pass `title` + `content` + `content_type` (`text/markdown` or `text/html`).

```json
{
  "title": "Fruits table",
  "content": "| Fruit | Color |\n|-------|-------|\n| Apple | Red |",
  "content_type": "text/markdown"
}
```

Use for formatted text, tables, code samples, documentation, or generated HTML/JS apps.

### 2. Component tag mode — auto-registered components

Pass `title` + `tag_name` + `props`. Only use tag names listed in the **Auto-registered components** section of the agent's compiled catalog (populated by `build_artifacts_catalog.lua` at compile time).

```json
{
  "title": "Reaction bar",
  "tag_name": "example-reaction-bar",
  "props": { "items": ["👍", "❤️", "🎉"] }
}
```

Do **not** set `content_type` in this mode.

### 3. Package mode — ESM components or SPA pages

Pass `title` + `content_type="application/json"` + `content` = the full package JSON copied verbatim from the catalog.

```json
{
  "title": "Admin Panel",
  "content_type": "application/json",
  "content": "{\"wippy\":{\"type\":\"page\",\"path\":\"index.html\",\"proxy\":{\"enabled\":true}},\"name\":\"main\",\"version\":\"1.0.0\",\"specification\":\"wippy-component-1.0\",\"title\":\"Admin Panel\",\"baseUrl\":\"http://localhost:8086/app/\"}"
}
```

Copy the package JSON verbatim from the catalog — do **not** construct or guess field values.

---

## Display modes (`instructions` parameter)

### `instructions: false` (default)

Artifact appears as a standalone card in the chat thread. The agent reply is plain prose — do **not** embed any tag in reply text. Use when the artifact IS the main answer.

### `instructions: true`

The tool result returns an opaque embed token. The agent MUST paste this token verbatim into its reply at the exact position where the artifact should appear inline. Use when the artifact is a supporting detail within flowing prose.

**The token comes exclusively from the tool result** — it is never constructed by the agent. If the agent has not just called `CreateArtifact` with `instructions=true`, there is no token to paste.

---

## Artifact embed token rule — ABSOLUTE

**Never write an artifact embed tag in reply text under any circumstances** unless you are pasting the exact string the `CreateArtifact` tool just returned with `instructions=true`.

- Not as a placeholder
- Not as an example
- Not in any other context

If you write the tag yourself with a made-up or guessed ID, the host will attempt to fetch that artifact from the API and display an error (or fire repeated 404 requests for invalid IDs). The only valid artifact embed in a reply is a token the tool gave you.

When explaining the embed mechanism in prose, describe it in words — do not type the tag.

---

## Inline component shortcut — no CreateArtifact needed

For **auto-registered** components, the agent may write the component's tag name directly in reply text as raw HTML:

```
Here is a reaction bar: <example-reaction-bar/>
```

This works because auto-registered components are globally defined custom elements in the host page — writing the tag is equivalent to placing the element in the DOM.

**This is completely different from an artifact embed token:**

| | Inline component tag | Artifact embed token |
|---|---|---|
| Written by | Agent (directly in reply) | Pasted from tool result only |
| Requires CreateArtifact | No | Yes (`instructions=true`) |
| Persists in history | No | Yes |
| Valid tag names | Auto-registered catalog only | N/A — opaque token |

Use the inline shortcut only for tags listed in the **Auto-registered components** catalog. `artifact` is NOT one of these tags — never write it inline.

---

## SPA page sizing

Pages in the catalog carry a `Sizing` label:

### `sizing: auto`

The page has `wippy.proxy.injections.resizeObserver: true` in its package JSON. It sends its intrinsic height to the host via `CmdBodySize` messages, so it renders correctly in any context (standalone full-panel or inline artifact). Copy the package JSON verbatim.

### `sizing: fixed`

The page does **not** report its height. It renders correctly only in a full-panel (standalone) artifact context. If embedded inline in a `sizing="content"` context it starts at zero height and stays blank.

**If the user explicitly needs a `sizing: fixed` page embedded inline**, patch the package JSON before passing it as `content`:

```
Original:  "proxy": {"enabled": true}
Patched:   "proxy": {"enabled": true, "injections": {"resizeObserver": true}}
```

Only apply this patch when inline embedding is explicitly required. For standalone display, copy the JSON verbatim.

---

## Catalog source

The available components and pages catalog is built at agent compile time by `src/app/agents/build_artifacts_catalog.lua`. It reads:
- `wippy.views:component_registry` — auto-registered and ESM components
- `wippy.views:page_registry` — SPA pages
- `wippy.views:bundled_meta` — metadata from `wippy-meta.json`

The catalog is appended to the agent's system prompt via `build_func_id: app.agents:build_artifacts_catalog` on the `wippy_artifacts_trait`.

---

## Debug endpoint

To inspect the compiled system prompt (including the full artifact catalog):

```
GET /api/public/debug/agent-prompt?agent=app.agents:wippy
x-auth-token: <token>
```

Returns JSON with `system_prompt`, `tools`, `model`, and `prompt_length`.
