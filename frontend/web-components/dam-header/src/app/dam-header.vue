<script setup lang="ts">
/**
 * 40px top nav: left hamburger + wordmark + nav buttons + right
 * details-toggle + user avatar. Hamburger / details-toggle broadcast
 * `app:toggle-drawer` ({ side: 'left' | 'right' }) — visible only in
 * the default (narrow) breakpoint where the side panels render as
 * drawer overlays. Wide layout shows neither because both sides
 * already render inline.
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

function toggleDetails() {
  host?.layout.broadcast('app:toggle-drawer', { side: 'right' })
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
    <button
      class="dam-header__details-toggle"
      type="button"
      aria-label="Toggle details drawer"
      @click="toggleDetails"
    >
      <Icon icon="tabler:layout-sidebar-right" class="w-5 h-5" />
    </button>
    <div class="dam-header__avatar" aria-label="Account">
      <Icon icon="tabler:user-circle" class="w-6 h-6" />
    </div>
  </header>
</template>
