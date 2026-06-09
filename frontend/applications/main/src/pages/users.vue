<script setup lang="ts">
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useQuery, useQueryClient, useMutation } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Avatar from 'primevue/avatar'
import { useApi, useHost } from '../composables/useWippy'
import { useUsersStore } from '../stores/users'
import type { User } from '../stores/users'

const api = useApi()
const host = useHost()
const queryClient = useQueryClient()
const usersStore = useUsersStore()

const USERS_KEY = ['users'] as const

const { data: users, isPending, isError } = useQuery({
  queryKey: USERS_KEY,
  queryFn: async () => {
    const { data } = await api.get('/api/v1/users')
    if (data.success)
      return (data.users || []) as User[]
    return [] as User[]
  },
  placeholderData: () => usersStore.list.length > 0 ? usersStore.list : undefined,
})

// Sync query results back to Pinia for persistence
watch(users, (val) => {
  if (val)
    usersStore.list = val
})

const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Pending', value: 'pending' },
]

const SECURITY_GROUPS = [
  { id: 'app.security:admin', label: 'Admin' },
  { id: 'app.security:user', label: 'User' },
]

const showCreate = ref(false)
const createForm = ref({ email: '', full_name: '', password: '', groups: ['app.security:user'] as string[] })

const showEdit = ref(false)
const editForm = ref({ user_id: '', email: '', full_name: '', status: '', password: '', groups: [] as string[] })

function statusSeverity(status: string): 'success' | 'danger' | 'warn' | 'secondary' {
  switch (status) {
    case 'active': return 'success'
    case 'suspended': return 'danger'
    case 'pending': return 'warn'
    default: return 'secondary'
  }
}

function groupLabel(groupId: string): string {
  const g = SECURITY_GROUPS.find(sg => sg.id === groupId)
  return g ? g.label : groupId
}

function groupSeverity(groupId: string): 'warn' | 'info' {
  return groupId === 'app.security:admin' ? 'warn' : 'info'
}

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function userInitial(user: User): string {
  return (user.full_name || user.email).charAt(0).toUpperCase()
}

const createMutation = useMutation({
  mutationFn: async (form: typeof createForm.value) => {
    const { data } = await api.post('/api/v1/users', {
      email: form.email,
      full_name: form.full_name,
      password: form.password,
    })
    if (data.success && data.user) {
      if (form.groups.length > 0) {
        await api.put(`/api/v1/users/${data.user.user_id}/groups`, {
          groups: form.groups,
        })
      }
    }
    return data
  },
  onSuccess: () => {
    createForm.value = { email: '', full_name: '', password: '', groups: ['app.security:user'] }
    showCreate.value = false
    host.toast({ severity: 'success', summary: 'User created' })
    queryClient.invalidateQueries({ queryKey: USERS_KEY })
  },
  onError: () => {
    host.toast({ severity: 'error', summary: 'Failed to create user' })
  },
})

function createUser() {
  if (!createForm.value.email || !createForm.value.password) return
  createMutation.mutate(createForm.value)
}

function openEdit(user: User) {
  editForm.value = {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    status: user.status,
    password: '',
    groups: [...user.security_groups],
  }
  showEdit.value = true
}

const saveMutation = useMutation({
  mutationFn: async (form: typeof editForm.value) => {
    const updateData: Record<string, string> = {}
    if (form.email) updateData.email = form.email
    if (form.full_name) updateData.full_name = form.full_name
    if (form.status) updateData.status = form.status
    if (form.password) updateData.password = form.password

    await api.put(`/api/v1/users/${form.user_id}`, updateData)
    await api.put(`/api/v1/users/${form.user_id}/groups`, { groups: form.groups })
  },
  onSuccess: () => {
    showEdit.value = false
    host.toast({ severity: 'success', summary: 'User updated' })
    queryClient.invalidateQueries({ queryKey: USERS_KEY })
  },
  onError: () => {
    host.toast({ severity: 'error', summary: 'Failed to update user' })
  },
})

function saveUser() {
  if (!editForm.value.user_id) return
  saveMutation.mutate(editForm.value)
}

const deleteMutation = useMutation({
  mutationFn: async (user: User) => {
    const { data } = await api.delete(`/api/v1/users/${user.user_id}`)
    return data
  },
  onSuccess: () => {
    host.toast({ severity: 'success', summary: 'User deleted' })
    queryClient.invalidateQueries({ queryKey: USERS_KEY })
  },
  onError: () => {
    host.toast({ severity: 'error', summary: 'Failed to delete user' })
  },
})

async function confirmDelete(user: User) {
  const name = user.full_name || user.email
  const confirmed = await host.confirm({
    header: 'Delete User',
    message: `Delete "${name}"? This will permanently delete the user and revoke all access. This action cannot be undone.`,
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', text: true },
  })
  if (confirmed)
    deleteMutation.mutate(user)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="px-5 py-4 border-b border-surface-200 dark:border-surface-700 bg-surface-card shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
            <Icon
              icon="tabler:users"
              class="w-5 h-5 text-primary-contrast"
              aria-hidden="true"
            />
          </div>
          <div>
            <h1 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Users
            </h1>
            <p class="text-[11px] text-surface-400">
              {{ (users ?? []).length }} user{{ (users ?? []).length !== 1 ? 's' : '' }}
            </p>
          </div>
        </div>
        <Button
          label="Create User"
          size="small"
          @click="showCreate = true"
        >
          <template #icon>
            <Icon
              icon="tabler:plus"
              class="w-4 h-4"
              aria-hidden="true"
            />
          </template>
        </Button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div
        v-if="isError"
        class="h-full flex items-center justify-center"
      >
        <div class="text-center">
          <Icon
            icon="tabler:alert-circle"
            class="w-10 h-10 text-red-400 mx-auto mb-2"
            aria-hidden="true"
          />
          <p class="text-sm text-surface-400 mb-3">
            Failed to load users
          </p>
          <Button
            label="Retry"
            size="small"
            @click="() => queryClient.invalidateQueries({ queryKey: USERS_KEY })"
          />
        </div>
      </div>

      <DataTable
        v-else-if="(users ?? []).length > 0"
        :value="users ?? []"
        :loading="isPending"
        data-key="user_id"
        :pt="{ bodyRow: { class: 'group' } }"
        class="text-sm"
      >
        <Column
          header="User"
          field="full_name"
        >
          <template #body="{ data: user }">
            <div class="flex items-center gap-3">
              <Avatar
                :label="userInitial(user)"
                shape="circle"
                class="bg-primary/10 text-primary text-xs font-semibold"
              />
              <div class="min-w-0">
                <div class="text-surface-900 dark:text-surface-0 font-medium truncate">
                  {{ user.full_name || '-' }}
                </div>
                <div class="text-[11px] text-surface-400 truncate">
                  {{ user.email }}
                </div>
              </div>
            </div>
          </template>
        </Column>
        <Column
          header="Status"
          field="status"
        >
          <template #body="{ data: user }">
            <Tag
              :value="user.status"
              :severity="statusSeverity(user.status)"
              class="text-[10px]"
            />
          </template>
        </Column>
        <Column
          header="Groups"
          field="security_groups"
        >
          <template #body="{ data: user }">
            <div class="flex flex-wrap gap-1">
              <Tag
                v-for="g in user.security_groups"
                :key="g"
                :value="groupLabel(g)"
                :severity="groupSeverity(g)"
                class="text-[10px]"
              />
              <span
                v-if="user.security_groups.length === 0"
                class="text-xs text-surface-400"
              >None</span>
            </div>
          </template>
        </Column>
        <Column
          header="Created"
          field="created_at"
        >
          <template #body="{ data: user }">
            <span class="text-xs text-surface-400">{{ formatDate(user.created_at) }}</span>
          </template>
        </Column>
        <Column header-style="width: 6rem">
          <template #body="{ data: user }">
            <div class="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                text
                rounded
                class="!p-1.5"
                :aria-label="`Edit ${user.full_name || user.email}`"
                @click.stop="openEdit(user)"
              >
                <template #icon>
                  <Icon
                    icon="tabler:edit"
                    class="w-4 h-4"
                    aria-hidden="true"
                  />
                </template>
              </Button>
              <Button
                text
                rounded
                severity="danger"
                class="!p-1.5"
                :aria-label="`Delete ${user.full_name || user.email}`"
                @click.stop="confirmDelete(user)"
              >
                <template #icon>
                  <Icon
                    icon="tabler:trash"
                    class="w-4 h-4"
                    aria-hidden="true"
                  />
                </template>
              </Button>
            </div>
          </template>
        </Column>
      </DataTable>

      <div
        v-else-if="!isPending"
        class="h-full flex items-center justify-center"
      >
        <div class="text-center">
          <Icon
            icon="tabler:users"
            class="w-10 h-10 text-surface-300 dark:text-surface-600 mx-auto mb-2"
            aria-hidden="true"
          />
          <p class="text-sm text-surface-400 mb-3">
            No users yet
          </p>
          <Button
            label="Create your first user"
            size="small"
            @click="showCreate = true"
          />
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="showCreate"
      header="Create User"
      :style="{ width: '460px' }"
      modal
    >
      <form
        class="space-y-4"
        @submit.prevent="createUser"
      >
        <div>
          <label
            for="create-email"
            class="block mb-1 text-xs font-medium text-muted-color"
          >Email</label>
          <InputText
            id="create-email"
            v-model="createForm.email"
            type="email"
            placeholder="user@example.com"
            fluid
          />
        </div>
        <div>
          <label
            for="create-name"
            class="block mb-1 text-xs font-medium text-muted-color"
          >Full Name</label>
          <InputText
            id="create-name"
            v-model="createForm.full_name"
            placeholder="Jane Doe"
            fluid
          />
        </div>
        <div>
          <label
            for="create-password"
            class="block mb-1 text-xs font-medium text-muted-color"
          >Password</label>
          <Password
            v-model="createForm.password"
            input-id="create-password"
            placeholder="Minimum 8 characters"
            :feedback="false"
            fluid
            toggle-mask
          />
        </div>
        <div>
          <span class="block mb-1 text-xs font-medium text-muted-color">Security Groups</span>
          <div
            class="space-y-2 mt-1.5"
            role="group"
            aria-label="Security groups"
          >
            <label
              v-for="sg in SECURITY_GROUPS"
              :key="sg.id"
              class="flex items-center gap-2 cursor-pointer text-surface-700 dark:text-surface-300"
            >
              <Checkbox
                v-model="createForm.groups"
                :value="sg.id"
                :aria-label="sg.label"
              />
              <span class="text-sm">{{ sg.label }}</span>
              <span class="text-[11px] text-surface-400 font-mono">{{ sg.id }}</span>
            </label>
          </div>
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            label="Cancel"
            severity="secondary"
            text
            @click="showCreate = false"
          />
          <Button
            label="Create"
            :disabled="!createForm.email || createMutation.isPending.value"
            :loading="createMutation.isPending.value"
            @click="createUser"
          />
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showEdit"
      header="Edit User"
      :style="{ width: '460px' }"
      modal
    >
      <form
        class="space-y-4"
        @submit.prevent="saveUser"
      >
        <div>
          <label
            for="edit-email"
            class="block mb-1 text-xs font-medium text-muted-color"
          >Email</label>
          <InputText
            id="edit-email"
            v-model="editForm.email"
            type="email"
            fluid
          />
        </div>
        <div>
          <label
            for="edit-name"
            class="block mb-1 text-xs font-medium text-muted-color"
          >Full Name</label>
          <InputText
            id="edit-name"
            v-model="editForm.full_name"
            fluid
          />
        </div>
        <div>
          <label
            for="edit-status"
            class="block mb-1 text-xs font-medium text-muted-color"
          >Status</label>
          <Select
            v-model="editForm.status"
            input-id="edit-status"
            :options="STATUS_OPTIONS"
            option-label="label"
            option-value="value"
            fluid
            aria-label="User status"
          />
        </div>
        <div>
          <label
            for="edit-password"
            class="block mb-1 text-xs font-medium text-muted-color"
          >New Password</label>
          <Password
            v-model="editForm.password"
            input-id="edit-password"
            placeholder="Leave empty to keep current"
            :feedback="false"
            fluid
            toggle-mask
          />
        </div>
        <div>
          <span class="block mb-1 text-xs font-medium text-muted-color">Security Groups</span>
          <div
            class="space-y-2 mt-1.5"
            role="group"
            aria-label="Security groups"
          >
            <label
              v-for="sg in SECURITY_GROUPS"
              :key="sg.id"
              class="flex items-center gap-2 cursor-pointer text-surface-700 dark:text-surface-300"
            >
              <Checkbox
                v-model="editForm.groups"
                :value="sg.id"
                :aria-label="sg.label"
              />
              <span class="text-sm">{{ sg.label }}</span>
              <span class="text-[11px] text-surface-400 font-mono">{{ sg.id }}</span>
            </label>
          </div>
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            label="Cancel"
            severity="secondary"
            text
            @click="showEdit = false"
          />
          <Button
            label="Save"
            :disabled="saveMutation.isPending.value"
            :loading="saveMutation.isPending.value"
            @click="saveUser"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>
