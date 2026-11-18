import { describe, expect, it } from 'vitest'
import { groupLabel, readUsers, statusTone } from './users.ts'

const good = {
  users: [
    { user_id: 'u1', name: 'Admin', status: 'active', groups: ['app.security:admin'] },
    { user_id: 'u2', name: 'Demo target', status: 'inactive', groups: [] },
  ],
}

describe('readUsers', () => {
  it('reads every user, keeping the order', () => {
    const { users, error } = readUsers(good)
    expect(error).toBeNull()
    expect(users.map(u => u.user_id)).toEqual(['u1', 'u2'])
    expect(users[1]?.groups).toEqual([])
  })

  it('accepts an empty list', () => {
    expect(readUsers({ users: [] })).toEqual({ users: [], error: null })
  })

  it('refuses data without a list of users', () => {
    expect(readUsers(null).error?.code).toBe('format_mismatch')
    expect(readUsers({}).error?.code).toBe('format_mismatch')
    expect(readUsers({ users: 'x' }).error?.code).toBe('format_mismatch')
  })

  it('refuses a user it cannot draw', () => {
    expect(readUsers({ users: [{ user_id: '', name: 'A', status: 'active', groups: [] }] }).error).not.toBeNull()
    expect(readUsers({ users: [{ user_id: 'u', name: 1, status: 'active', groups: [] }] }).error).not.toBeNull()
    expect(readUsers({ users: [{ user_id: 'u', name: 'A', status: 'active', groups: 'g' }] }).error).not.toBeNull()
    expect(readUsers({ users: [{ user_id: 'u', name: 'A', status: 'active', groups: [1] }] }).error).not.toBeNull()
    expect(readUsers({ users: ['x'] }).error).not.toBeNull()
  })
})

describe('groupLabel', () => {
  it('shows the part after the last colon', () => {
    expect(groupLabel('app.security:admin')).toBe('admin')
    expect(groupLabel('plain')).toBe('plain')
    expect(groupLabel('odd:')).toBe('odd:')
  })
})

describe('statusTone', () => {
  it('marks active as success and unfinished states as warn', () => {
    expect(statusTone('active')).toBe('success')
    expect(statusTone('pending')).toBe('warn')
    expect(statusTone('suspended')).toBe('warn')
    expect(statusTone('inactive')).toBe('neutral')
    expect(statusTone('anything else')).toBe('neutral')
  })
})
