<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'
import { config, on } from '@wippy-fe/proxy'
import { isUnder, mountPrefix, normalizePath, useAppNav, usePageList } from '@example/app-nav'
import SidebarItem from '../components/sidebar-item.vue'
import { useApi, useHost } from '../composables/useWippy'
import { NOTE_NAVIGATION, PAGE_LIST } from '../constants'
import { NAV_GROUPS, NAV_ITEMS } from '../nav'

const router = useRouter()
const route = useRoute()
const api = useApi()
const host = useHost()
const unsubscribes: Array<() => void> = []

const collapsed = ref(false)
const logoUrl = '/app/wippy-logo.svg'

function toggleSidebar() {
  collapsed.value = !collapsed.value
}

// ── Color theme switch (auto / light / dark) ──
// Drives the proxy theme API: `host.setThemeMode` propagates to the host shell,
// every live child iframe, and the embedding parent; `on('@theme')` keeps this
// control in sync when the theme is changed elsewhere.
const themeOptions = [
  { mode: 'auto', label: 'Auto', icon: 'tabler:device-desktop' },
  { mode: 'light', label: 'Light', icon: 'tabler:sun' },
  { mode: 'dark', label: 'Dark', icon: 'tabler:moon' },
] as const

type ThemeMode = (typeof themeOptions)[number]['mode']

interface NavigateAction {
  data?: { path?: unknown }
  path?: unknown
}

const themeMode = ref<ThemeMode>('auto')
const currentThemeOption = computed(
  () => themeOptions.find(o => o.mode === themeMode.value) ?? themeOptions[0],
)

function setTheme(mode: ThemeMode) {
  themeMode.value = mode
  host.setThemeMode(mode)
}

function cycleTheme() {
  const idx = themeOptions.findIndex(o => o.mode === themeMode.value)
  setTheme(themeOptions[(idx + 1) % themeOptions.length].mode)
}

// One live list of the pages this viewer may open, for the sidebar and for the
// catch-all route that shows pages inside this app. It reads the list again on
// the backend's `pages` signal, and it stops listening when this component goes.
const pageList = usePageList({ api, on: (topic, callback) => on(topic, callback) })
provide(PAGE_LIST, pageList)

// This app's own page id and mount prefix (/home), from its entry in the page list.
const ownPageId = config.selfPageId ?? config.context?.resourceId
const ownPrefix = computed(() => {
  const own = pageList.pages.value.find(page => page.id === ownPageId)
  return own?.mountRoute ? mountPrefix(own.mountRoute) : null
})

// An app path: one leading slash, no scheme or host, no backslash. Agent
// tools check this too; the app does not rely on that.
function isAppPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
}

// Waits that are still open, so unmounting can end them.
const openWaits = new Set<() => void>()

// The first page list, which tells this app its own prefix. The wait ends when
// the list is read, or when the list gave up after all its tries.
function whenListReady(): Promise<void> {
  if (pageList.ready.value || pageList.gaveUp.value)
    return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      stop()
      openWaits.delete(finish)
      resolve()
    }
    const stop = watch([pageList.ready, pageList.gaveUp], ([ready, gaveUp]) => (ready || gaveUp) && finish())
    openWaits.add(finish)
  })
}

// An agent path waits only while the first page list is still loading. It is
// dropped when any other navigation starts after it was asked for: a newer
// agent path, a sidebar click or a hosted page's own navigation (counted the
// moment they happen, through noteNavigation), and any other route change,
// such as a link inside a page or back and forward (counted by beforeEach).
// The route change that openPath itself starts is not counted.
let navigationSeq = 0
let ownTarget: string | null = null
function noteNavigation() {
  navigationSeq++
}
provide(NOTE_NAVIGATION, noteNavigation)
const stopRouteCount = router.beforeEach((to) => {
  if (ownTarget !== null && to.fullPath === ownTarget) {
    ownTarget = null
    return
  }
  noteNavigation()
})

// Opens an app path with the router. A host URL inside this app (/home/users)
// opens its app route (/users); a route here may be a registry page.
function goTo(path: string) {
  const prefix = ownPrefix.value
  let target = path
  if (prefix && prefix !== '/' && path.startsWith(prefix) && isUnder(normalizePath(path), prefix)) {
    // Keep any query: /home/components?tab=chat opens /components?tab=chat.
    const rest = path.slice(prefix.length)
    target = rest.startsWith('/') ? rest : `/${rest}`
  }
  const full = router.resolve(target).fullPath
  ownTarget = full
  void router.push(target).finally(() => {
    if (ownTarget === full)
      ownTarget = null
  })
}

// Host paths (/c/..., /chat/...) leave this app; app paths open here. With the
// page list loaded the path opens at once; before that it waits for the list,
// which tells this app its own prefix.
function openPath(path: string) {
  if (!isAppPath(path))
    return
  noteNavigation()
  const seq = navigationSeq
  if (path.startsWith('/c/') || path.startsWith('/chat/')) {
    host.navigate(path)
    return
  }
  if (pageList.ready.value || pageList.gaveUp.value) {
    goTo(path)
    return
  }
  void whenListReady().then(() => {
    if (seq === navigationSeq)
      goTo(path)
  })
}

// The sidebar: the app's own items plus the registry pages of NAV_GROUPS,
// live as pages are published or removed. A page whose path one of this app's
// own routes already uses (for example /users) opens at /page/<page id>.
const { tree: navTree, activeKey, open: openItem } = useAppNav({
  items: NAV_ITEMS,
  pageList,
  groups: NAV_GROUPS,
  exclude: ownPageId ? [ownPageId] : [],
  isTaken: path => router.resolve(path).name !== 'hosted-page',
  currentPath: computed(() => route.path),
  navigate: {
    route: (path) => {
      noteNavigation()
      router.push(path)
    },
    host: (path) => {
      noteNavigation()
      host.navigate(path)
    },
  },
})

const currentUser = ref<{ email: string; full_name: string } | null>(null)
const wippyToken = ref<string | null>(null)

function userInitials(user: { email: string; full_name: string }): string {
  if (user.full_name) {
    return user.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }
  return user.email.charAt(0).toUpperCase()
}

async function fetchMe() {
  try {
    const { data } = await api.get('/api/v1/user/me')
    if (data.success && data.user) {
      currentUser.value = { email: data.user.email, full_name: data.user.full_name }
    }
  } catch {
    // silently fail
  }
}

async function fetchWippyAgent() {
  try {
    const { data } = await api.get('/api/v1/agents/list')
    if (data.success && data.agents) {
      const primary = data.agents.find((a: { class: string[] }) =>
        a.class && a.class.includes('primary')
      )
      if (primary) {
        wippyToken.value = primary.start_token
      }
    }
  } catch {
    // silently fail
  }
}

function openWippy() {
  if (wippyToken.value) {
    host.startChat(wippyToken.value, { sidebar: true })
  }
}

function logout() {
  host.logout()
}

onMounted(() => {
  fetchMe()
  fetchWippyAgent()
  themeMode.value = host.getThemeMode()
  unsubscribes.push(on('@theme', (mode: unknown) => {
    if (themeOptions.some(option => option.mode === mode))
      themeMode.value = mode as ThemeMode
  }))
  // An agent tool (NavigateTo) asks the UI to open a path.
  unsubscribes.push(on('action:navigate', (value: unknown) => {
    const data = value as NavigateAction
    const path = typeof data.data?.path === 'string'
      ? data.data.path
      : typeof data.path === 'string' ? data.path : null
    if (path)
      openPath(path)
  }))
})

onUnmounted(() => {
  unsubscribes.splice(0).forEach(unsubscribe => unsubscribe())
  stopRouteCount()
  // Drop any navigation still waiting for the list, and end its wait.
  navigationSeq++
  for (const finish of [...openWaits])
    finish()
})
</script>

<template>
  <div class="h-full flex">
    <aside
      aria-label="App sidebar"
      :class="[collapsed ? 'w-14' : 'w-56', 'shrink-0 h-full border-r border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 flex flex-col transition-all duration-200']"
    >
      <div
        class="py-4 flex items-center"
        :class="collapsed ? 'px-2 justify-center' : 'px-4 gap-2.5'"
      >
        <img
          :src="logoUrl"
          alt="Wippy"
          class="w-8 h-8 rounded-lg shrink-0 cursor-pointer"
          @click="toggleSidebar"
        >
        <span
          v-if="!collapsed"
          class="text-sm font-bold text-surface-900 dark:text-surface-0 tracking-tight"
        >Wippy App</span>
      </div>

      <nav
        aria-label="Main navigation"
        class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-1 space-y-0.5"
      >
        <template
          v-for="(node, index) in navTree"
          :key="node.key"
        >
          <SidebarItem
            v-if="node.type === 'item'"
            :item="node.item"
            :active="activeKey === node.item.key"
            :collapsed="collapsed"
            @open="openItem"
          />
          <div
            v-else
            role="group"
            :aria-labelledby="collapsed ? undefined : `nav-group-${index}`"
            :aria-label="collapsed ? node.group.label : undefined"
            class="pt-3 space-y-0.5"
          >
            <div
              v-if="!collapsed"
              :id="`nav-group-${index}`"
              class="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-surface-400"
            >
              {{ node.group.label }}
            </div>
            <div
              v-else
              class="mx-2 mb-1 border-t border-surface-200 dark:border-surface-700"
              aria-hidden="true"
            />
            <SidebarItem
              v-for="item in node.group.items"
              :key="item.key"
              :item="item"
              :active="activeKey === item.key"
              :collapsed="collapsed"
              @open="openItem"
            />
          </div>
        </template>
      </nav>

      <!-- Color theme switch: segmented (expanded) / single cycling icon (collapsed) -->
      <div class="px-2 pt-2 pb-1">
        <div
          v-if="!collapsed"
          class="flex items-center gap-0.5 rounded-lg bg-surface-200 dark:bg-surface-900 p-0.5"
          role="group"
          aria-label="Color theme"
        >
          <button
            v-for="opt in themeOptions"
            :key="opt.mode"
            type="button"
            class="flex-1 flex items-center justify-center rounded-md py-1.5 transition-colors"
            :class="themeMode === opt.mode
              ? 'bg-surface-0 dark:bg-surface-700 text-primary shadow-sm'
              : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'"
            :aria-pressed="themeMode === opt.mode"
            :aria-label="opt.label"
            :title="opt.label"
            @click="setTheme(opt.mode)"
          >
            <Icon
              :icon="opt.icon"
              class="w-4 h-4"
              aria-hidden="true"
            />
          </button>
        </div>
        <button
          v-else
          type="button"
          class="w-full flex items-center justify-center rounded-lg py-2 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          :aria-label="`Theme: ${currentThemeOption.label}, click to cycle`"
          :title="`Theme: ${currentThemeOption.label} (click to cycle)`"
          @click="cycleTheme"
        >
          <Icon
            :icon="currentThemeOption.icon"
            class="w-[18px] h-[18px] shrink-0"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        v-if="wippyToken"
        class="px-2 py-2"
      >
        <button
          class="w-full flex items-center rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          :class="collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2'"
          :title="collapsed ? 'Ask Wippy' : undefined"
          @click="openWippy"
        >
          <Icon
            icon="tabler:message-circle"
            class="w-[18px] h-[18px] shrink-0"
            aria-hidden="true"
          />
          <span v-if="!collapsed">Ask Wippy</span>
        </button>
      </div>

      <div
        class="border-t border-surface-200 dark:border-surface-700"
        :class="collapsed ? 'px-2 py-3' : 'px-3 py-3'"
      >
        <div
          v-if="currentUser"
          class="flex items-center"
          :class="collapsed ? 'justify-center' : 'gap-2.5'"
        >
          <Avatar
            :label="userInitials(currentUser)"
            shape="circle"
            class="bg-primary/10 text-primary text-xs font-semibold shrink-0 cursor-pointer"
            :title="collapsed ? (currentUser.full_name || currentUser.email) : undefined"
            @click="toggleSidebar"
          />
          <template v-if="!collapsed">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-surface-900 dark:text-surface-0 truncate">
                {{ currentUser.full_name || currentUser.email }}
              </div>
              <div
                v-if="currentUser.full_name"
                class="text-[11px] text-surface-400 truncate"
              >
                {{ currentUser.email }}
              </div>
            </div>
            <Button
              text
              rounded
              class="!p-1.5 shrink-0"
              aria-label="Sign out"
              @click="logout"
            >
              <template #icon>
                <Icon
                  icon="tabler:logout"
                  class="w-4 h-4"
                  aria-hidden="true"
                />
              </template>
            </Button>
          </template>
        </div>
        <div
          v-else
          class="flex items-center gap-2 text-[11px] text-surface-400"
          :class="collapsed ? 'justify-center' : ''"
        >
          <Icon
            icon="tabler:circle-filled"
            class="w-2 h-2 text-primary"
            aria-hidden="true"
          />
          <span v-if="!collapsed">Connected</span>
        </div>
      </div>
    </aside>

    <main class="flex-1 h-full overflow-y-auto bg-surface-50 dark:bg-surface-850">
      <router-view />
    </main>
  </div>
</template>
