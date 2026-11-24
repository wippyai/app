<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { NavItem } from '@example/app-nav'

/** One sidebar entry, for the app's own items and for registry pages alike. */
defineProps<{
  item: NavItem
  active: boolean
  collapsed: boolean
}>()

defineEmits<{
  open: [item: NavItem]
}>()
</script>

<template>
  <button
    type="button"
    class="w-full flex items-center rounded-lg text-sm transition-colors"
    :class="[
      collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2',
      active
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800',
    ]"
    :aria-current="active ? 'page' : undefined"
    :title="collapsed ? item.label : undefined"
    @click="$emit('open', item)"
  >
    <Icon
      :icon="item.icon || 'tabler:file'"
      class="w-[18px] h-[18px] shrink-0"
      aria-hidden="true"
    />
    <span
      v-if="!collapsed"
      class="truncate"
    >{{ item.label }}</span>
  </button>
</template>
