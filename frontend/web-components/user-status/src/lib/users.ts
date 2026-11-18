import type { TileError } from '@wippy/dashboards-tile-helper'

/** One user of the `users` point (src/demo_user_status/_index.yaml, output schema). */
export interface UserRow {
  user_id: string
  name: string
  status: string
  groups: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mismatch(message: string): TileError {
  return { code: 'format_mismatch', message }
}

/**
 * Reads the data of the input `main`: `{ users: [ { user_id, name, status, groups } ] }`.
 * The engine already checks this against the schema. The tile still refuses data it cannot draw,
 * so a row without a user id or a name never shows as an empty line.
 */
export function readUsers(data: unknown): { users: UserRow[], error: TileError | null } {
  if (!isRecord(data) || !Array.isArray(data.users))
    return { users: [], error: mismatch('The data has no list of users.') }
  const users: UserRow[] = []
  for (const raw of data.users) {
    if (!isRecord(raw))
      return { users: [], error: mismatch('A user is not an object.') }
    const { user_id: userId, name, status, groups } = raw
    if (typeof userId !== 'string' || userId === '')
      return { users: [], error: mismatch('A user has no id.') }
    if (typeof name !== 'string' || typeof status !== 'string')
      return { users: [], error: mismatch('A user has no name or status.') }
    if (!Array.isArray(groups) || !groups.every(g => typeof g === 'string'))
      return { users: [], error: mismatch('The groups of a user are not a list of text.') }
    users.push({ user_id: userId, name, status, groups: groups as string[] })
  }
  return { users, error: null }
}

/** The group shown to a person: `app.security:admin` becomes `admin`. */
export function groupLabel(group: string): string {
  const colon = group.lastIndexOf(':')
  const tail = colon >= 0 ? group.slice(colon + 1) : group
  return tail === '' ? group : tail
}

export type StatusTone = 'success' | 'warn' | 'neutral'

/** Only `active` is healthy, `pending` and `suspended` need attention, `inactive` is neutral. */
export function statusTone(status: string): StatusTone {
  if (status === 'active')
    return 'success'
  if (status === 'pending' || status === 'suspended')
    return 'warn'
  return 'neutral'
}
