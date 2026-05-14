# Prompt for Building Vue 3 Applications with Wippy Platform Integration

> **Architectural principle: the FE isolation paradigm.**
>
> A Wippy web app is a **standalone, universal bundle** that has zero knowledge of where or how it is served. `vite.config.ts` sets `base: ''` (mandatory) and does NOT hardcode `outDir` — the build script passes `--outDir` per deployment. `package.json` describes the app (title, type, proxy injections), not its mount point. The BE-side `_index.yaml` `view.page` entry is the **serving facade** that declares the URL, entry HTML, and byte source per deployment. The same built bundle ships unchanged to any Wippy instance. Full rules + audit checklist: [fe-compliance-checklist.md §0](fe-compliance-checklist.md#0-the-fe-isolation-paradigm).

> **CRITICAL: NOT STANDALONE**
>
> Wippy web apps do **NOT** work outside the Wippy host application. They run in iframes with host-injected configuration. Direct browser testing will fail — the `$W` global and proxy APIs only exist when loaded within Wippy. The single exception is **host-less mode** (`dev-proxy.js` provides a stubbed `$W` for local dev, browser playgrounds, and unit tests) — see [host-less-mode.md](host-less-mode.md) for the dual-mode boot contract.

## Task
Create a modern Vue 3 application following 2025 best practices with PrimeVue component library, Tailwind CSS, and deep Wippy platform integration for iframe-embeddable applications.

## Application Requirements
**Application Name**: [SPECIFY APP NAME]
**Application Purpose**: [DESCRIBE WHAT THE APP DOES]
**Data Sources**: [Route | REST API | WebSocket]
**Routing Requirements**: [Single page | Multi-page with navigation | Dynamic routing]

## Architecture Foundation

### Vue 3 Composition API First
Modern Vue 3 applications in 2025 **exclusively use Composition API** for all new development. Use `<script setup>` syntax throughout the application for better TypeScript integration and cleaner component organization.

```vue
<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'

  interface User {
    id: string
    name: string
    email: string
  }

  const users = ref<User[]>([])
  const loading = ref(false)
  const router = useRouter()
  const route = useRoute()

  const filteredUsers = computed(() =>
      users.value.filter(user => user.name.includes(searchTerm.value))
  )
</script>
```

### Project Structure
Follow **feature-based modular architecture** that scales with team size:

```
src/
├── app/                    # Main application components
│   ├── app.vue            # Root component
│   └── router/            # Route definitions
├── components/            # Shared/reusable components
│   ├── ui/               # Basic UI components
│   └── common/           # Business logic components
├── services/             # Global services and API clients
├── stores/               # Pinia stores
├── types/                # TypeScript type definitions
├── pages/                # Page entries
└── utils/                # Utility functions
```

**⚠️ IMPORTANT: File Naming Convention**
- **Use kebab-case for all files**: `recent-sessions.vue`, `user-profile.vue`, `data-table.vue`
- **Component names in Vue can be PascalCase**: `<RecentSessions />` in templates
- **File paths must match kebab-case**: `import('@/pages/recent-sessions.vue')`
- This ensures consistency with Wippy platform conventions and avoids import issues

## PrimeVue Integration Strategy

> **Theming paradigm and per-component rules:** [theming.md](theming.md). This section covers the integration mechanics (plugin install, CSS injection); the paradigm doc covers what to reach for when, and the IF/THEN rules for color/component/layout decisions.

### PrimeVue + Tailwind Hybrid Approach
Use **PrimeVue with Tailwind utilities** for the best of both worlds:

### When to Use Host Services vs PrimeVue Components

**Prefer Host Services (Recommended):**
- **`host.toast()`** - For all toast notifications (better theme integration)
- **`host.confirm()`** - For simple confirmation dialogs (better UX consistency)

**Use PrimeVue ConfirmDialog Only When:**
- You need complex confirmation UI that `host.confirm()` can't handle
- You require custom confirmation layouts or multiple action buttons
- You need to show confirmation dialogs within specific components

**Example:**
```typescript
// ✅ Preferred - use host.confirm for simple confirmations
const confirmed = await host.confirm({
  message: 'Are you sure you want to delete this item?',
  header: 'Confirm Delete',
  icon: 'tabler:trash'
})

// ❌ Only use PrimeVue ConfirmDialog when host.confirm is insufficient
// <ConfirmDialog /> // Only add this component if needed
```

Use @iconify/vue for icons, prefer tabler icons. **Always use `<Icon>` component instead of button icon props** for better control and consistency.

Use all variety of PrimeVue components, like `DataTable`, `Button`, `InputText`, `Card`, etc. for consistent design and functionality.

```vue
<template>
  <!-- PrimeVue component with Tailwind utilities -->
  <Card class="mb-4 shadow-lg">
    <template #title>
      <div class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
        <Icon icon="tabler:chart-bar" class="text-xl" />
        <span>Analytics Dashboard</span>
      </div>
    </template>
    
    <template #content>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-surface-50 dark:bg-surface-800 rounded-lg">
          <StatCard :value="totalUsers" label="Total Users">
            <template #icon>
              <Icon icon="tabler:users" class="text-xl" />
            </template>
          </StatCard>
        </div>
      </div>
      
      <!-- Button with icon - preferred approach -->
      <Button class="p-button-primary">
        <Icon icon="tabler:plus" class="mr-2" />
        Add User
      </Button>
    </template>
  </Card>
</template>
```

## Wippy Platform Integration

### Essential Wippy Setup
The provided `$W` global object and `WIPPY_INSTANCE` injection provide access to all platform features. Use these extensively for proper host integration.

Refer to Proxy API documentation for detailed usage.

```typescript
// src/composables/useWippy.ts
import {inject} from 'vue'
import {WIPPY_INSTANCE, HOST_API, AXIOS_INSTANCE} from '@/constants'
import {ToastMessageOptions} from "primevue/toast";

export function useWippy() {
    const instance = inject(WIPPY_INSTANCE)!
    const host = inject(HOST_API)!
    const api = inject(AXIOS_INSTANCE)!

    // Start an AI chat in the host app
    host.startChat(token, { sidebar: true })

    // Open an existing chat session
    host.openSession(sessionUUID, { sidebar: false })

    // Set context for the chat session (sends to last opened or specific session)
    host.setContext(
        { currentPage: 'dashboard', selectedItems: [1, 2, 3] },
        sessionUUID,  // optional - omit to send to last opened session
        { type: 'page', uuid: pageUUID }  // optional source identifier
    )

    const toast: ToastMessageOptions = {
        severity: 'info',
        summary: 'Welcome',
        detail: 'This is a Wippy application'
    }

    // Prefer showing toasts and confirm through host API, since app iframe is not full page
    host.toast(toast);

    // Use host API for navigation that's not part of current app router
    host.navigate(fullHostPath);
}
```

### Router Integration with Host Communication
Set up Vue Router to **sync with host navigation** and handle iframe-specific routing:

Note only use `createMemoryHistory` for Wippy apps, as they are embedded in iframes as srcdoc and cant use browser history.

**⚠️ MANDATORY: Multi-page routing requires custom configuration for Wippy apps**

```typescript
// src/router/index.ts
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Router } from 'vue-router'
import type { HostApi } from '@/types'

type OnSubscription = (
  pattern: string,
  callback: (event: { path?: string; message?: unknown }) => void,
) => void

export function createAppRouter(host: HostApi, on: OnSubscription | null, initialPath?: string): Router {
  // Set up memory history with the initial path BEFORE creating the router
  const history = createMemoryHistory()
  if (initialPath && initialPath !== '/') {
    history.replace(initialPath)
  }

  const router = createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'Dashboard',
        component: () => import('@/pages/dashboard.vue'),
        meta: { title: 'Dashboard' }
      },
      {
        path: '/users',
        name: 'Users',
        component: () => import('@/pages/users/index.vue'),
        meta: { title: 'User Management' }
      },
      {
        path: '/users/:id',
        name: 'UserDetail',
        component: () => import('@/pages/users/[id].vue'),
        meta: { title: 'User Details' }
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        redirect: '/',
      },
    ]
  })

  // MANDATORY: Notify host of internal navigation changes
  router.afterEach((to) => {
    host.onRouteChanged(to.fullPath)
  })

  // MANDATORY: Listen to host navigation changes (defensive null check on `on`)
  if (on) {
    on('@history', ({ path }) => {
      if (!path) return
      const normalized = path.startsWith('/') ? path : '/' + path
      if (router.currentRoute.value.fullPath !== normalized) {
        router.push(normalized)
      }
    })
  }

  return router
}
```

### API Integration with Authentication

TBD

### WebSocket Integration for Real-time Features
Leverage Wippy's **WebSocket subscription system** for real-time updates:

```vue
<script setup lang="ts">
  import { ref, onMounted, onUnmounted, inject } from 'vue'
  import { useWippy } from '@/composables/useWippy'
  import { WIPPY_INSTANCE } from '@/constants'

  const instance = inject(WIPPY_INSTANCE)!

  let unsubscribeMessage: (() => void) | null = null
  let unsubscribeVisibility: (() => void) | null = null

  onMounted(() => {
    // Listen for specific WebSocket messages
    unsubscribeMessage = instance.on('user:*', (event) => {
      console.log('Received WebSocket message:', event)
      handleUserUpdate(event.data)
    })

    // Listen for visibility changes (tab switch, iframe hide/show)
    unsubscribeVisibility = instance.on('@visibility', (visible: boolean) => {
      if (visible) {
        // Resume operations, refresh data
        refreshData()
      } else {
        // Pause polling, stop animations
      }
    })

    // Listen for host URL changes
    instance.on('@history', ({ path }) => {
      console.log('Host URL changed:', path)
    })
  })

  onUnmounted(() => {
    unsubscribeMessage?.()
    unsubscribeVisibility?.()
  })

  function handleUserUpdate(userData: unknown) {
    // Update local user data
    console.log('User updated:', userData)
    // Refresh user list or update specific user
  }
</script>
```

## State Management

### Client State
- **Use Pinia** for global client state management
- **Use composables** for local component state and business logic
- **Keep state minimal** - only store what's necessary
- **Use reactive references** (`ref`, `computed`) for reactive state
- **Prefer computed properties** over manual watchers when possible

### Server State with TanStack Query
- **Use `useInfiniteQuery`** for paginated data (recommended over manual pagination)
- **Use `useQuery`** for simple data fetching
- **Use `useMutation`** for data mutations (create, update, delete)
- **Leverage automatic features**:
  - Loading states (`isLoading`, `isFetching`, `isRefetching`)
  - Error handling with automatic retries
  - Background refetching and cache invalidation
  - Optimistic updates for better UX
- **Query keys**: Use descriptive, hierarchical keys for proper cache management
- **Stale time**: Set appropriate stale times based on data freshness requirements
- **Cache invalidation**: Use `queryClient.invalidateQueries()` for real-time updates
- **Manual axios**: Still use axios instance for simple cases that need manual control

**Example TanStack Query Setup:**
```typescript
// Main.ts - QueryClient configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,   // 10 minutes
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
})

// Composable - Infinite query for pagination
const {
  data: queryData,
  isLoading,
  isFetching,
  error,
  hasNextPage,
  fetchNextPage,
  refetch,
} = useInfiniteQuery({
  queryKey: ['sessions'],
  queryFn: fetchSessionsPage,
  getNextPageParam: (lastPage) => lastPage.nextPage,
  initialPageParam: 0,
})

// Computed - Flatten pages for display
const sessions = computed(() => 
  queryData.value?.pages.flatMap(page => page.sessions) ?? []
)
```

## Wippy Package Configuration

### Key Package.json Configuration Notes

**Wippy Specification Fields:**
- `specification: "wippy-component-1.0"` - **Required** identifier for Wippy platform recognition
- `title` and `description` - Used in Wippy platform UI, not just npm registry
- `wippy.type: "page"` - Distinguishes this from web component packages
- `wippy.path` - Points to the HTML entry point for iframe loading

**Peer Dependencies Strategy:**
- **Never bundle** Vue, Pinia, Vue Router, @wippy-fe/proxy, or Axios
- These are provided by the Wippy host via import maps for consistency and performance
- Mark them as `peerDependencies` and configure your bundler to treat them as external
- **PrimeVue is externalized** in web apps — add `primevue/*` subpath entries to your app's own `<script type="importmap">` (the host does NOT provide PrimeVue in its import map)

**Build Pipeline Integration:**
- `wippy.scripts` references map to your npm scripts
- Wippy platform will call these during its build process
- Always provide both `build` (production) and `debug` (development) scripts

## Modern Build Configuration

### Vite Configuration with TypeScript
**Preserve the existing Vite setup** while ensuring optimal build configuration:

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  base: "", // CRITICAL: Must be empty string for Wippy apps to handle unknown relative paths
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'app.html', // Use your HTML entry point
      external: [
        'vue',
        'pinia',
        'vue-router',
        '@iconify/vue',
        '@wippy-fe/proxy',
        'axios',
        // PrimeVue is externalized — add each subpath you use
        'primevue',
        'primevue/config',
        'primevue/button',
        'primevue/tag',
        // Add more primevue/* subpaths as needed for your app
      ]
    }
  },
  server: {
    port: 5174 // Use different port to avoid conflicts
  }
})
// NOTE: `nanoevents` and `luxon` are available in the host import map but are NOT required externals.
// Add them to the external array only if your app imports them directly.
```

**⚠️ CRITICAL CONFIGURATION NOTES:**
- **`base: ""`** - **MUST** be set to empty string for Wippy apps since they load at unknown relative paths
- **`input: 'app.html'`** - Must match your HTML entry point filename
- **`external`** - Only host-provided libraries should be marked as external (see import map below)

### Current Host-Provided Libraries (import-map.json)

```json
{
  "imports": {
    "vue": "https://esm.sh/vue@3.5.13",
    "pinia": "https://esm.sh/pinia@2.1.7",
    "vue-router": "https://esm.sh/vue-router@4.5.0",
    "axios": "https://esm.sh/axios@1.8.3",
    "nanoevents": "https://esm.sh/nanoevents@9.1.0",
    "luxon": "https://esm.sh/luxon@3.5.0",
    "@iconify/vue": "https://esm.sh/@iconify/vue@4.3.0",
    "@tanstack/vue-query": "https://esm.sh/@tanstack/vue-query@5.69.0",
    "@tanstack/query-core": "https://esm.sh/@tanstack/query-core@5.69.0"
  }
}
```

**⚠️ IMPORTANT: Only mark these libraries as external - bundle everything else**

### Default Proxy Injections Configuration

Use this standard injections block for most Wippy apps:

```json
"proxy": {
  "enabled": true,
  "injections": {
    "css": {
      "fonts": true,
      "themeConfig": true,
      "iframe": true,
      "primevue": true,
      "markdown": true,
      "customCss": true,
      "customVariables": true
    },
    "tailwindConfig": false,
    "resizeObserver": false,
    "preventLinkClicks": false,
    "iconifyIcons": false
  }
}
```

**Injection Options Explained:**
- **CSS Injections**: All enabled for full host theming integration
- **tailwindConfig**: `false` -  Enable if you use runtime Play CND version of tailwind
- **resizeObserver**: `false` -  Enable if your app is a widget and not full-screen
- **preventLinkClicks**: `false` -  Enable if you dont implement custom router
- **iconifyIcons**: `false` - Enable if you are using WebComponent CDN for iconify

### Main Application Entry (src/app.ts - update existing)
```typescript
import { addCollection } from '@iconify/vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'

import App from './app/App.vue'
import { AXIOS_INSTANCE, HOST_API, WIPPY_INSTANCE } from './constants'
import { createAppRouter } from './router'
import '@wippy-fe/theme/theme-config.css'
import './styles.css'
import './tailwind.css'

export async function createMainApp() {
    const config = await window.$W.config()
    const hostApi = await window.$W.host()
    const axios = await window.$W.api()
    const instance = await window.$W.instance()

    // Normalize initial path from host config
    const initialPath = config.path ? (config.path.startsWith('/') ? config.path : '/' + config.path) : '/'

    if (config.customization?.icons) {
        addCollection({
            prefix: 'custom',
            icons: config.customization?.icons,
        })
    }

    const app = createApp(App)

    // Add Pinia store
    app.use(createPinia())

    // Add PrimeVue (without services - prefer host.confirm and host.toast)
    app.use(PrimeVuePlugin)

    // Provide Wippy services
    app.provide(HOST_API, hostApi)
    app.provide(AXIOS_INSTANCE, axios)
    app.provide(WIPPY_INSTANCE, instance)

    // Add router — initialPath is set via history.replace() before router creation
    const router = createAppRouter(hostApi, instance.on, initialPath)
    app.use(router)

    return app
}

export async function mountApp(elementId: string = '#app') {
    const app = await createMainApp()
    app.mount(elementId)
    return app
}

// Auto-mount when imported as main entry point
mountApp()
```

**⚠️ IMPORTANT: Prefer Host Services Over PrimeVue Services**
- **Use `host.toast()`** instead of PrimeVue ToastService for notifications
- **Use `host.confirm()`** instead of PrimeVue ConfirmationService for dialogs
- **Only use PrimeVue ConfirmDialog component** if `host.confirm()` is not sufficient for your use case
- This ensures better integration with the host application's theming and behavior

## Development Guidelines

When building your Vue 3 Wippy application, ensure you:

### Critical Build Configuration
- **Vite `base: ""`** - **MUST** be set to empty string for Wippy apps to handle unknown relative paths
- **External Dependencies** - Only mark host-provided libraries as external (see import map above)
- **Bundle Everything Else** - other dependencies should be bundled
- **HTML Entry Point** - Ensure `input` matches your HTML filename in Vite config
- **File Naming** - Use kebab-case for all files (`recent-sessions.vue`, `user-profile.vue`)
- **Proxy Injections** - Use the default injections configuration for optimal host integration

### Critical Router Configuration
- **Multi-page routing setup** - **MUST** include start path handling and host communication
- **`host.onRouteChanged()`** - **MUST** be called in `router.afterEach()` to sync host URL
- **`on('@history')`** - **MUST** listen to host navigation changes (with null check on `on`)
- **Initial path handling** - **MUST** use `history.replace(initialPath)` before creating the router (do NOT use `router.push()` or pass path to `createMemoryHistory()`)
- **Catch-all route** - **MUST** include `/:pathMatch(.*)*` redirect to `/`

### Component Architecture Best Practices
- **Split large pages** into smaller, focused components
- **Create reusable components** for repeated UI patterns (e.g., `session-item.vue`, `data-table.vue`)
- **Keep components focused** on a single responsibility
- **Use composition over inheritance** - prefer composables and props over complex component hierarchies
- **Component naming**: Use kebab-case for files, PascalCase for component names in templates
- **Props interface**: Define clear TypeScript interfaces for component props
- **Event handling**: Use `defineEmits` for component events with proper typing
- **Use official types**: Import Wippy API types from `@wippy-fe/types-global-proxy` for proper type safety. Full type definitions ship with the npm package at `node_modules/@wippy-fe/types-global-proxy/index.d.ts`
- **Icon usage**: Always use `<Icon>` component instead of button icon props for better control
- **Utility organization**: Extract reusable logic into utility files (e.g., `src/utils/date-utils.ts`)

### Utility Organization

**Extract reusable logic into utility files for better maintainability:**

```typescript
// src/utils/date-utils.ts
import { DateTime } from 'luxon'

export const formatDate = (date: DateTime): string => {
  // Date formatting logic
}

export const formatTime = (dateString: string): string => {
  // Time formatting logic
}

// src/utils/index.ts
export * from './date-utils'
// export * from './string-utils'
// export * from './validation-utils'

// Usage in components/composables
import { formatDate, formatTime } from '@/utils'
```

**Benefits:**
- **Reusability**: Share logic across multiple components
- **Testability**: Easier to unit test utility functions
- **Maintainability**: Centralized logic updates
- **Clean imports**: Single import path for all utilities
- **Type safety**: Consistent TypeScript interfaces

### TypeScript Integration with Wippy Types

Use the official types provided by the `@wippy-fe/types-global-proxy` package (full API types ship at `node_modules/@wippy-fe/types-global-proxy/index.d.ts` after `npm install`):

```typescript
// src/types/index.ts
export type HostApi = Awaited<ReturnType<typeof window.$W.host>>
export type ProxyApiInstance = Awaited<ReturnType<typeof window.$W.instance>>
export type WippyConfig = Awaited<ReturnType<typeof window.$W.config>>

// Usage in components/composables
import type { HostApi, ProxyApiInstance } from '@/types'
import { DateTime } from 'luxon'

const hostApi = inject<HostApi>('HOST_API')
const wippyInstance = inject<ProxyApiInstance>('WIPPY_INSTANCE')

// API usage examples with proper typing
await hostApi.startChat(token, { sidebar: true })
await hostApi.openSession(sessionId, { sidebar: false })
await hostApi.openArtifact(artifactId, { target: 'modal' })
hostApi.setContext({ data: 'value' }, sessionId)  // sessionId is optional
hostApi.navigate('/c/page-id')

// Date handling with Luxon
const date = DateTime.fromISO(dateString)
if (date.isValid) {
  const formatted = date.toFormat('MMMM d, yyyy')
}
```

1. **Complete Vue 3 application** with modern architecture
2. **PrimeVue component integration** with proper theming
3. **Tailwind CSS styling** with responsive design
4. **Deep Wippy platform integration** using all available APIs
5. **Multi-page routing** with proper navigation
6. **State management** with Pinia stores
7. **Error handling** and loading states
8. **Form validation** and submission
9. **TypeScript integration** throughout
10. **Performance optimizations** including lazy loading
11. **Accessibility features** and ARIA compliance

## Additional Notes

- **Always use TypeScript** for type safety and better developer experience
- **Leverage PrimeVue components** extensively before creating custom components
- **Use Wippy platform features** for host communication, authentication, and real-time updates
- **Follow Vue 3 Composition API patterns** exclusively
- **Implement proper error handling** for all async operations
- **Consider mobile responsiveness** in all UI designs
- **Add loading states** for better user experience — use `<wippy-loading>` for fullscreen loading and `<wippy-error>` for fullscreen errors (auto-registered via `loading.js`, no imports needed)
- **Use semantic HTML** and proper ARIA labels for accessibility
- **Optimize for performance** with lazy loading and code splitting
- **Follow consistent naming conventions** throughout the codebase
- **Only mark host-provided libraries as external**
- **Test proxy injections** to ensure proper integration with host theming and functionality
- **Split large pages into components** - Create focused, reusable components for better maintainability
- **Use composables for business logic** - Extract reusable logic into composables for better code organization
- **Theming** — see [theming.md](theming.md) for the full reference. Two rules in the bullet list: prefer semantic CSS vars over `--p-surface-N` for theme-dependent colors, and use semantic severity classes (`danger-*` / `success-*` / `warn-*` / `info-*` / `help-*` / `accent-*`) instead of raw Tailwind color names
- **Use Luxon for date handling** - Prefer Luxon over native Date methods for better internationalization and formatting
- **Use Icon component directly** - Always use `<Icon>` tags instead of button icon props for better control
- **Use TanStack Query for server state** - Prefer `useInfiniteQuery` for pagination over manual state management
- **Leverage automatic features** - Use built-in loading states, error handling, and cache management from TanStack Query

---

## Complete Working Example

This section provides a **complete, tested working example** of a Wippy web app. Copy these files exactly to avoid build errors.

### File Structure

```
my-app/
├── package.json
├── app.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js       # CRITICAL: Required for Tailwind CSS processing
└── src/
    ├── app.ts              # Main entry point
    ├── constants.ts        # Injection keys
    ├── types.ts            # TypeScript types
    ├── styles.css          # Base styles
    ├── tailwind.css        # Tailwind directives
    ├── app/
    │   └── app.vue         # Root Vue component
    └── router/
        └── index.ts        # Router with ProxyApiInstance
```

### package.json

**NAMING CONVENTION (REQUIRED - names must be unique)**:
Package name format: `@<namespace>/app-<description>`
Examples: `@anthropic/app-analytics-dashboard`, `@acme/app-user-settings`

```json
{
  "name": "@myorg/app-my-dashboard",
  "version": "1.0.0",
  "specification": "wippy-component-1.0",
  "title": "My Dashboard",
  "description": "Dashboard application description",
  "files": ["dist/", "src/", "package.json"],
  "dependencies": {
    "@wippy-fe/theme": "^0.0.7"
  },
  "devDependencies": {
    "@wippy-fe/types-global-proxy": "^0.0.7",
    "@vitejs/plugin-vue": "^5.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "primevue": "^4.3.3",
    "tailwindcss": "3",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vue": "^3.5.0",
    "vue-router": "^4.0.0",
    "vue-tsc": "^2.0.0"
  },
  "peerDependencies": {
    "@iconify/vue": "^5.0.0",
    "@wippy-fe/proxy": "^0.0.7",
    "axios": "^1.0.0",
    "pinia": "^2.1.0",
    "primevue": "^4.3.3",
    "vue": "^3.5.0",
    "vue-router": "^4.0.0"
  },
  "wippy": {
    "type": "page",
    "title": "My Dashboard",
    "icon": "tabler:chart-bar",
    "order": 200,
    "path": "dist/app.html",
    "proxy": {
      "enabled": true,
      "injections": {
        "css": {
          "fonts": true,
          "themeConfig": true,
          "iframe": true,
          "primevue": true,
          "markdown": true,
          "customCss": true,
          "customVariables": true
        },
        "tailwindConfig": false,
        "resizeObserver": false,
        "preventLinkClicks": false,
        "iconifyIcons": false,
        "refreshWhenVisible": false
      }
    },
    "scripts": {
      "build": "build",
      "debug": "build:debug"
    }
  },
  "scripts": {
    "build": "vite build",
    "build:debug": "vite build --mode development",
    "dev": "vite build --watch"
  }
}
```

### app.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My App</title>
    <!--
      Single-tag dual-mode boot. In hosted mode the Wippy host strips this
      <script> (matched by data-role="@wippy/scripts") and injects its own
      loading.js + proxy.js + AppConfig. In host-less mode (running app.html
      directly) the src= falls through and dev-proxy.js bootstraps the page.
      Local dev: http://localhost:5173/dev-proxy.js
      Prod CDN (always tag-pinned): https://web-host.wippy.ai/<tag>/dev-proxy.js
      Full details: host-less-mode.md.
    -->
    <script
        src="http://localhost:5173/dev-proxy.js"
        data-role="@wippy/scripts"
    ></script>
    <!-- Import map: host-provided + app-provided (PrimeVue) dependencies -->
    <script type="importmap">
        {
            "imports": {
                "vue": "https://esm.sh/vue@3",
                "pinia": "https://esm.sh/pinia",
                "vue-router": "https://esm.sh/vue-router@4",
                "@iconify/vue": "https://esm.sh/@iconify/vue",
                "axios": "https://esm.sh/axios",
                "primevue/config": "https://esm.sh/primevue@4/config?external=vue",
                "primevue/button": "https://esm.sh/primevue@4/button?external=vue",
                "primevue/tag": "https://esm.sh/primevue@4/tag?external=vue"
            }
        }
    </script>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="./src/app.ts"></script>
</body>
</html>
```

### vite.config.ts

```typescript
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: "",  // CRITICAL: Must be empty string
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    rollupOptions: {
      // CRITICAL: Use object format with resolve()
      input: {
        app: resolve(__dirname, 'app.html'),
      },
      external: [
        'vue',
        'pinia',
        'vue-router',
        '@iconify/vue',
        '@wippy-fe/proxy',
        'axios',
        // PrimeVue is externalized — add each subpath you import
        'primevue',
        'primevue/config',
        'primevue/button',
        'primevue/tag',
        // Add more primevue/* subpaths as needed
        // NOTE: `nanoevents` and `luxon` are available in the host import map
        // but are NOT required. Add them here only if your app imports them directly.
      ],
    },
    sourcemap: true,
  },
})
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "@wippy-fe/types-global-proxy"],
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

### tailwind.config.ts

```typescript
import themePreset from '@wippy-fe/theme/tailwind.config'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [themePreset],
  content: [
    './app.html',
    './src/**/*.{vue,ts}',
  ],
}
```

### postcss.config.js

**⚠️ CRITICAL: This file is REQUIRED for Tailwind CSS to work. Without it, `@tailwind` directives will not be processed.**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### src/types.ts

```typescript
export interface ComponentProps {
  path?: string
}

export interface AppConfig {
  name: string
  version: string
  theme: 'light' | 'dark' | 'auto'
}

// These types derive from the $W global provided by @wippy-fe/proxy
export type HostApi = Awaited<ReturnType<typeof window.$W.host>>
export type ProxyApiInstance = Awaited<ReturnType<typeof window.$W.instance>>
```

### src/constants.ts

```typescript
import type { InjectionKey } from 'vue'
import type { HostApi, ProxyApiInstance } from './types.ts'

export const HOST_API = Symbol('host_api') as InjectionKey<HostApi>
export const AXIOS_INSTANCE = Symbol('axios') as InjectionKey<ProxyApiInstance['api']>
export const WIPPY_INSTANCE = Symbol('proxy') as InjectionKey<ProxyApiInstance>
```

### src/app.ts

```typescript
import { addCollection } from '@iconify/vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './app/app.vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'

import { AXIOS_INSTANCE, HOST_API, WIPPY_INSTANCE } from './constants.ts'
import { createAppRouter } from './router'
import '@wippy-fe/theme/theme-config.css'
import './styles.css'
import './tailwind.css'

export async function createMainApp() {
  const config = await window.$W.config()
  const hostApi = await window.$W.host()
  const axios = await window.$W.api()
  const instance = await window.$W.instance()

  // Normalize initial path from host config
  const initialPath = config.path ? (config.path.startsWith('/') ? config.path : '/' + config.path) : '/'

  // Inherit custom icons from host app
  if (config.customization?.icons) {
    addCollection({
      prefix: 'custom',
      icons: config.customization?.icons,
    })
  }

  const app = createApp(App)
  app.use(createPinia())
  app.use(PrimeVuePlugin)

  // Provide Wippy services for injection in components
  app.provide(HOST_API, hostApi)
  app.provide(AXIOS_INSTANCE, axios)
  app.provide(WIPPY_INSTANCE, instance)

  // Create router — initialPath is set via history.replace() before router creation
  const router = createAppRouter(hostApi, instance.on, initialPath)
  app.use(router)

  return app
}

export async function mountApp(elementId: string = '#app') {
  const app = await createMainApp()
  app.mount(elementId)
  return app
}

// Auto-mount on load
mountApp()
```

### src/router/index.ts

**TODO: This skeleton does not include page components. You must create at least one page (e.g., `src/pages/home.vue`) and add it to the routes array.**

```typescript
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import type { HostApi } from '../types'

type OnSubscription = (
  pattern: string,
  callback: (event: { path?: string; message?: unknown }) => void,
) => void

export function createAppRouter(host: HostApi, on: OnSubscription | null, initialPath?: string): Router {
  // Set up memory history with the initial path BEFORE creating the router
  const history = createMemoryHistory()
  if (initialPath && initialPath !== '/') {
    history.replace(initialPath)
  }

  const router = createRouter({
    history,
    routes: [
      // TODO: Add your page routes here, e.g.:
      // {
      //   path: '/',
      //   name: 'home',
      //   component: () => import('../pages/home.vue'),
      // },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        redirect: '/',
      },
    ],
  })

  // MANDATORY: Notify host when route changes
  router.afterEach((to) => {
    host.onRouteChanged(to.fullPath)
  })

  // MANDATORY: Listen to host navigation events (defensive null check)
  if (on) {
    on('@history', ({ path }) => {
      if (!path) return
      const normalized = path.startsWith('/') ? path : '/' + path
      if (router.currentRoute.value.fullPath !== normalized) {
        router.push(normalized)
      }
    })
  }

  return router
}
```

### src/app/app.vue

**Note:** Root-level padding on `<main>` is acceptable for web apps. Unlike web components, web apps control the full viewport and can define their own layout padding.

```vue
<script setup lang="ts">
// Root component - add navigation here if needed
</script>

<template>
  <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
    <router-view />
  </main>
</template>

<style scoped>
</style>
```

### src/styles.css

```css
html, body {
  height: 100%;
  margin: 0;
  background: transparent;
}

#app {
  height: 100%;
}

/* Iconify icon fallback */
svg.iconify {
  display: inline-block;
  width: 1em;
  height: 1em;
}
```

### src/tailwind.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Common Build Errors and Solutions

### "Cannot find package 'vue' imported from vite.config.ts"
**Cause:** Vue is marked as external but needed for Vite plugin during build.
**Solution:** Vue should be in devDependencies for build-time usage. The gold copy package.json above handles this correctly.

### "Failed to resolve ./src/main.ts from app.html"
**Cause:** Wrong input format in vite.config.ts.
**Solution:** Use `input: { app: resolve(__dirname, 'app.html') }` with resolve(), not a plain string.

### "ENOENT: no such file or directory" for CSS
**Cause:** Theme CSS import not resolving.
**Solution:** Ensure `@wippy-fe/theme` is in dependencies and run `npm install`. Theme variables are provided by `@wippy-fe/theme/theme-config.css`.

### Build succeeds but page is blank
**Cause:** Missing `@wippy/scripts` placeholder in app.html.
**Solution:** Ensure `<script type="text/javascript" data-role="@wippy/scripts"></script>` is in the head.

### Tailwind CSS classes not working / styles not applied
**Cause:** Missing `postcss.config.js` file.
**Solution:** Create `postcss.config.js` in project root with:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```
This file is **CRITICAL** - without it, Vite cannot process `@tailwind` directives in your CSS files.