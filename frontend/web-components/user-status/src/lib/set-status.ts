import type { ActionResult } from '@example/dash-tile-helper'
import type { UserRow } from './users.ts'

/** The two statuses the action `set_status` accepts (contracts section 5.2). */
export type TargetStatus = 'active' | 'inactive'

/** The status the control sets: an active user is deactivated, every other user is activated. */
export function nextStatus(status: string): TargetStatus {
  return status === 'active' ? 'inactive' : 'active'
}

/** The label of the control of a user. */
export function controlLabel(status: string): string {
  return nextStatus(status) === 'inactive' ? 'Deactivate' : 'Activate'
}

/** The question the Host asks before the call. */
export function confirmQuestion(user: UserRow, target: TargetStatus): string {
  return target === 'inactive'
    ? `Deactivate ${user.name}? They will no longer be active.`
    : `Activate ${user.name}?`
}

/** The tile arguments of one call. The server binds everything else. */
export function tileArgs(user: UserRow, target: TargetStatus): { user_id: string, status: TargetStatus } {
  return { user_id: user.user_id, status: target }
}

/** True for the viewer's own row. Until the viewer is known, no row is safe to change. */
export function isOwnRow(user: UserRow, viewerId: string | null): boolean {
  return viewerId === null || user.user_id.toLowerCase() === viewerId.toLowerCase()
}

export type OutcomeKind = 'done' | 'denied' | 'failed' | 'unknown'

export interface Outcome {
  kind: OutcomeKind
  text: string
}

/** What the viewer reads after a call. Returns null when the viewer cancelled the confirmation. */
export function describeOutcome(result: ActionResult, user: UserRow, target: TargetStatus): Outcome | null {
  const code = result.error?.code ?? ''
  switch (result.status) {
    case 'cancelled':
      return null
    case 'done':
      return { kind: 'done', text: `${user.name} is now ${target}.` }
    case 'denied':
      return { kind: 'denied', text: `You may not change a user's status${code && code !== 'denied' ? ` (${code})` : ''}.` }
    case 'unknown':
      return { kind: 'unknown', text: `The result for ${user.name} is not known. Try again; the same request is not run twice.` }
    default:
      return { kind: 'failed', text: failureText(code, user) }
  }
}

function failureText(code: string, user: UserRow): string {
  switch (code) {
    case 'self_target': return 'You cannot change your own status.'
    case 'user_not_found': return `${user.name} no longer exists.`
    case 'idempotency_conflict': return 'This request was already sent with other values. Try again.'
    case 'invalid_args': return 'The request was not valid.'
    case 'undeclared': return 'This action is not available on the page any more.'
    default: return `The change failed${code ? ` (${code})` : ''}.`
  }
}

/** Reads the id of the signed-in user from the response of `GET /api/v1/user/me`, else null. */
export function viewerIdFrom(data: unknown): string | null {
  if (data === null || typeof data !== 'object')
    return null
  const user = (data as { user?: unknown }).user
  if (user === null || typeof user !== 'object')
    return null
  const id = (user as { id?: unknown }).id ?? (user as { user_id?: unknown }).user_id
  return typeof id === 'string' && id !== '' ? id : null
}
