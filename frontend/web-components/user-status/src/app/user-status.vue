<script setup lang="ts">
import { computed, ref } from 'vue'
import { TileConfirm } from '@example/dash-tile-helper'
import { useDashTile } from '../use-dash-tile'
import { useViewerId } from '../use-viewer'
import { groupLabel, readUsers, statusTone } from '../lib/users'
import type { UserRow } from '../lib/users'
import { confirmQuestion, controlLabel, describeOutcome, isOwnRow, nextStatus, tileArgs } from '../lib/set-status'
import type { Outcome } from '../lib/set-status'

// The helper reads the data, reads it again on the live signal (dash.users.changed) and reports
// render-state. This tile only renders. Data it cannot draw becomes an error before `ready`.
const tile = useDashTile({
  main: data => readUsers(data).error,
})

const users = computed(() => {
  const data = tile.data('main')
  return data === null ? null : readUsers(data).users
})

// The actions column appears when the page gives the tile the action `set_status` and the viewer
// may run it. The server still checks the permission on every call.
const hasActions = computed(() => tile.config.value.actions.set_status?.allowed === true)

// The viewer's own row has no control. The server refuses the call too (error code self_target).
const viewerId = useViewerId()

// One call at a time per user. The outcome of the last call stays on screen, also while the tile
// reads its data again after a change.
const busyUser = ref<string | null>(null)
const outcome = ref<Outcome | null>(null)

async function change(user: UserRow) {
  if (busyUser.value !== null)
    return
  const target = nextStatus(user.status)
  busyUser.value = user.user_id
  outcome.value = null
  try {
    // The helper asks the Host (host.confirm) first, because the action declares confirm: true.
    const result = await tile.runAction('set_status', tileArgs(user, target), { confirmMessage: confirmQuestion(user, target) })
    outcome.value = describeOutcome(result, user, target)
  }
  finally {
    busyUser.value = null
  }
}
</script>

<template>
  <div class="user-status-shell">
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
              <span
                v-if="viewerId !== null && isOwnRow(user, viewerId)"
                class="user-status__you"
              >
                You
              </span>
              <button
                v-else
                type="button"
                class="user-status__button"
                data-action="set_status"
                :disabled="viewerId === null || busyUser !== null"
                :aria-busy="busyUser === user.user_id"
                :aria-label="`${controlLabel(user.status)} ${user.name}`"
                @click="change(user)"
              >
                {{ controlLabel(user.status) }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      class="user-status__outcome"
      :class="outcome ? `user-status__outcome--${outcome.kind}` : ''"
      role="status"
      aria-live="polite"
      data-outcome
    >
      {{ outcome?.text ?? '' }}
    </p>
    <TileConfirm
      :request="tile.confirmRequest.value"
      @answer="tile.answerConfirm"
    />
  </div>
</template>
