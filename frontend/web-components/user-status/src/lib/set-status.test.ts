import { describe, expect, it } from 'vitest'
import type { ActionResult } from '@wippy/dashboards-tile-helper'
import { confirmQuestion, controlLabel, describeOutcome, isOwnRow, nextStatus, tileArgs, viewerIdFrom } from './set-status.ts'
import type { UserRow } from './users.ts'

const target: UserRow = { user_id: 'target@wippy.local', name: 'Test Target', status: 'active', groups: ['app.security:user'] }

function result(status: ActionResult['status'], code?: string): ActionResult {
  return { action: 'set_status', status, error: code ? { code, message: 'x' } : null, envelope: null }
}

describe('nextStatus and controlLabel', () => {
  it('deactivates an active user and activates every other user', () => {
    expect(nextStatus('active')).toBe('inactive')
    expect(controlLabel('active')).toBe('Deactivate')
    for (const status of ['inactive', 'suspended', 'pending']) {
      expect(nextStatus(status)).toBe('active')
      expect(controlLabel(status)).toBe('Activate')
    }
  })
})

describe('tileArgs', () => {
  it('sends only the two tile arguments', () => {
    expect(tileArgs(target, 'inactive')).toEqual({ user_id: 'target@wippy.local', status: 'inactive' })
  })
})

describe('confirmQuestion', () => {
  it('names the user and the change', () => {
    expect(confirmQuestion(target, 'inactive')).toContain('Test Target')
    expect(confirmQuestion(target, 'active')).toBe('Activate Test Target?')
  })
})

describe('isOwnRow', () => {
  it('is true for the viewer, in any letter case', () => {
    expect(isOwnRow(target, 'Target@Wippy.local')).toBe(true)
    expect(isOwnRow(target, 'viewer@wippy.local')).toBe(false)
  })

  it('treats every row as own until the viewer is known', () => {
    expect(isOwnRow(target, null)).toBe(true)
  })
})

describe('describeOutcome', () => {
  it('says nothing after a cancelled confirmation', () => {
    expect(describeOutcome(result('cancelled'), target, 'inactive')).toBeNull()
  })

  it('reports a change', () => {
    expect(describeOutcome(result('done'), target, 'inactive')).toEqual({ kind: 'done', text: 'Test Target is now inactive.' })
  })

  it('reports a denial with the permission code as the reason', () => {
    const outcome = describeOutcome(result('denied', 'dash.users.set_status'), target, 'inactive')
    expect(outcome?.kind).toBe('denied')
    expect(outcome?.text).toContain('dash.users.set_status')
    expect(describeOutcome(result('denied', 'denied'), target, 'inactive')?.text).toBe('You may not change a user\'s status.')
  })

  it('explains the codes it knows and shows the code of the others', () => {
    expect(describeOutcome(result('failed', 'self_target'), target, 'inactive')?.text).toBe('You cannot change your own status.')
    expect(describeOutcome(result('failed', 'user_not_found'), target, 'inactive')?.text).toContain('no longer exists')
    expect(describeOutcome(result('failed', 'boom'), target, 'inactive')?.text).toBe('The change failed (boom).')
    expect(describeOutcome(result('failed'), target, 'inactive')?.text).toBe('The change failed.')
  })

  it('reports an unknown outcome as a retry that is safe', () => {
    const outcome = describeOutcome(result('unknown', 'unknown_outcome'), target, 'inactive')
    expect(outcome?.kind).toBe('unknown')
    expect(outcome?.text).toContain('not run twice')
  })
})

describe('viewerIdFrom', () => {
  it('reads user.id of /api/v1/user/me', () => {
    expect(viewerIdFrom({ user: { id: 'a@b.c', user_id: 'x' } })).toBe('a@b.c')
    expect(viewerIdFrom({ user: { user_id: 'x' } })).toBe('x')
  })

  it('gives null for anything else', () => {
    expect(viewerIdFrom(null)).toBeNull()
    expect(viewerIdFrom({})).toBeNull()
    expect(viewerIdFrom({ user: { id: '' } })).toBeNull()
    expect(viewerIdFrom({ user: 'x' })).toBeNull()
  })
})
