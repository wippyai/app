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
