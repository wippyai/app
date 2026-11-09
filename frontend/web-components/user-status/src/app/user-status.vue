<script setup lang="ts">
import { computed } from 'vue'
import { useDashTile } from '../use-dash-tile'
import { groupLabel, readUsers, statusTone } from '../lib/users'

// The helper reads the data, reads it again on the live signal (dash.users.changed) and reports
// render-state. This tile only renders. Data it cannot draw becomes an error before `ready`.
const tile = useDashTile({
  main: data => readUsers(data).error,
})

const users = computed(() => {
  const data = tile.data('main')
  return data === null ? null : readUsers(data).users
})

// Stage E3 declares the action `set_status`. The actions column appears only then, so the
// tile has room for the per-user button without a layout change.
const hasActions = computed(() => Object.keys(tile.config.value.actions).length > 0)
</script>

<template>
  <div
    v-if="users !== null"
    class="user-status"
    role="region"
    tabindex="0"
    aria-label="Users"
  >
    <p
      v-if="users.length === 0"
      class="user-status__none"
    >
      No users
    </p>
    <table
      v-else
      class="user-status__grid"
    >
      <thead>
        <tr>
          <th scope="col">
            Name
          </th>
          <th scope="col">
            Status
          </th>
          <th scope="col">
            Groups
          </th>
          <th
            v-if="hasActions"
            scope="col"
            class="user-status__actions-head"
          >
            <span class="user-status__sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="user in users"
          :key="user.user_id"
          :data-user-id="user.user_id"
        >
          <td class="user-status__name">
            {{ user.name }}
          </td>
          <td>
            <span
              class="user-status__status"
              :class="`user-status__status--${statusTone(user.status)}`"
              data-field="status"
            >
              {{ user.status }}
            </span>
          </td>
          <td>
            <ul
              v-if="user.groups.length > 0"
              class="user-status__groups"
            >
              <li
                v-for="group in user.groups"
                :key="group"
                class="user-status__group"
                :title="group"
              >
                {{ groupLabel(group) }}
              </li>
            </ul>
            <span
              v-else
              class="user-status__no-groups"
            >
              none
            </span>
          </td>
          <td
            v-if="hasActions"
            class="user-status__actions"
          >
            <!-- Stage E3: the status button of this user goes here. -->
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
