# app-nav

Headless model of an app-owned sidebar for a Wippy shell page. The app keeps its own look; this package supplies the data.

- It merges the app's own items with the pages that the registry announces (`GET /api/public/pages/list`).
- It groups and orders them by the same rules as the Web Host's built-in nav, so a page sits in the same place in both.
- It keeps the list live: it reads it again after the WebSocket topic `pages` and after a reconnect. The server filters the list per viewer, so each viewer sees only the pages they may open.
- It finds the active item for the shell's current path.
- It resolves a shell path to a listed page, so the shell can show that page inside itself with `<w-artifact type="page" nav-owner>` and keep its sidebar.

The package is TypeScript source with Vue as its only peer. An app depends on it with `"@example/app-nav": "file:../../packages/app-nav"`. Run its checks with `make test-pkg-app-nav` (`make.bat test-pkg-app-nav` on Windows).

The backend side is `src/app/pages`: a service that sends `pages` whenever the nav-relevant meta of any `view.page` entry changes, including pages that a module writes at runtime.

## Use it in a shell page

```ts
import { api, on } from '@wippy-fe/proxy'
import { createPageList, useAppNav, useHostedPage } from '@example/app-nav'

// Once per app, for example in the bootstrap, and provide it.
const pageList = createPageList({ api, on: (topic, cb) => on(topic, cb) })

// In the sidebar component.
const nav = useAppNav({
  items: [
    { key: 'home', label: 'Home', icon: 'tabler:home', order: 1, target: { kind: 'route', path: '/' } },
    // Shown only while the viewer's list holds keeper:main; opens through the Host.
    { key: 'keeper', label: 'Keeper', order: 6, pageId: 'keeper:main', target: { kind: 'host', path: '/c/keeper:main' } },
  ],
  pageList,
  groups: ['Dashboards'],          // registry groups that join this nav
  currentPath: computed(() => route.path),
  navigate: { route: path => router.push(path), host: path => host.navigate(path) },
})
// nav.tree: items and groups to render; nav.activeKey; nav.open(item)

// In the catch-all route of the shell's router.
const state = useHostedPage({ pageList, path: computed(() => route.path), exclude: [ownPageId] })
// state: loading | error | none (not found) | gone (left the list while open) | ready { match }
```

A registry page opens at the literal start of its mount route inside the shell. For example, `/reports/llm-usage/:part(.*)*` opens at `<shell>/reports/llm-usage`. A page without a mount route opens at `<shell>/page/<page id>`.

## Choices and limits

- Only pages of the listed `groups` join the nav. Ungrouped pages and other modules' groups stay out, so the app decides what its nav shows. The Host's built-in nav still receives every announced page.
- An item with `pageId` shows only after the first list arrives. This prevents an item from appearing and then disappearing for a viewer who may not open it.
- `exclude` must hold the shell's own page id; otherwise a path under the shell's own mount route would host the shell inside itself.
- The Web Host learns page routes only when it starts. A page published later opens inside the shell at once, because the shell resolves paths from the live list. Opened on its own route, it needs a full page load until the Host refreshes routes at run time.
