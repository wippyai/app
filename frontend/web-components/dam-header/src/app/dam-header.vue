<script setup lang="ts">
/**
 * 40px top nav: hamburger (narrow-only, left edge) + wordmark + nav
 * buttons + user avatar. Hamburger broadcasts app:toggle-drawer; nav
 * buttons broadcast app:nav.
 */
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useHost } from '@wippy-fe/webcomponent-vue'
import type { ProxyApiInstance } from '@wippy-fe/proxy'

const host = useHost<ProxyApiInstance['host']>()

const navItems = [
  { id: 'gallery',  label: 'Gallery',  page: 'dam-gallery',  route: '/',         icon: 'tabler:photo' },
  { id: 'list',     label: 'List',     page: 'dam-list',     route: '/',         icon: 'tabler:list' },
  { id: 'settings', label: 'Settings', page: 'dam-settings', route: '/general',  icon: 'tabler:settings' },
]

const active = ref('gallery')

function navTo(item: typeof navItems[number]) {
  active.value = item.id
  host?.layout.broadcast('app:nav', { page: item.page, route: item.route })
}

function toggleHamburger() {
  host?.layout.broadcast('app:toggle-drawer', { side: 'left' })
}
</script>

<template>
  <header class="dam-header">
    <button
      class="dam-header__hamburger"
      type="button"
      aria-label="Toggle navigation drawer"
      @click="toggleHamburger"
    >
      <Icon icon="tabler:menu-2" class="w-5 h-5" />
    </button>
    <div class="dam-header__wordmark">
      <Icon icon="tabler:layout-dashboard" class="w-5 h-5" />
      <span>Event DAM</span>
    </div>
    <nav class="dam-header__nav">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="dam-header__nav-button"
        :class="{ 'dam-header__nav-button--active': active === item.id }"
        @click="navTo(item)"
      >
        <Icon :icon="item.icon" class="w-4 h-4" />
        <span>{{ item.label }}</span>
      </button>
    </nav>
    <div class="dam-header__avatar" aria-label="Account">
      <Icon icon="tabler:user-circle" class="w-6 h-6" />
    </div>
  </header>
</template>

<style scoped>
.dam-header {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.75rem;
  background: var(--p-surface-900, #0b0b0c);
  color: var(--p-surface-0, #fff);
  border-bottom: 1px solid var(--p-surface-700, #2a2a2e);
  font-family: 'Poppins', system-ui, sans-serif;
}
.dam-header__hamburger {
  display: none;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
}
.dam-header__hamburger:hover { background: var(--p-surface-800, #1a1a1c); }
.dam-header__wordmark {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}
.dam-header__nav {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}
.dam-header__nav-button {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  background: transparent;
  border: none;
  color: var(--p-surface-300, #b3b3b6);
  cursor: pointer;
  font-size: 0.85rem;
  border-radius: 4px;
  font-family: inherit;
}
.dam-header__nav-button:hover { background: var(--p-surface-800, #1a1a1c); color: var(--p-surface-0, #fff); }
.dam-header__nav-button--active {
  background: var(--p-primary-900, #312e81);
  color: var(--p-primary-300, #a5b4fc);
}
.dam-header__avatar {
  display: flex;
  align-items: center;
  color: var(--p-surface-300, #b3b3b6);
  cursor: pointer;
}

/* Hamburger only visible at narrow breakpoint — set on <html> by the
   coordinator service via the @layout-breakpoint subscription. */
:global(html[data-breakpoint='narrow']) .dam-header__hamburger {
  display: inline-flex;
}
:global(html[data-breakpoint='narrow']) .dam-header__nav span {
  display: none;
}
</style>
