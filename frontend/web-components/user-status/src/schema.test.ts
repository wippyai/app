import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { readUsers } from './lib/users.ts'

// Plugin fixture test (stage E2). It ties together the three places that describe the users data:
//   1. the output schema of the point demo.user_status:users,
//   2. the input schema of the tile demo.user_status,
//   3. a saved output of the function demo.user_status:list_users (src/fixtures/users.output.json,
//      taken from the running app: GET .../points/users, field "data").
// It fails when the function's output stops matching the tile's input schema. Refresh the saved
// output with the same request after a change to list_users.lua, then run this test again.

interface Entry {
  name: string
  meta: Record<string, unknown>
}

const root = resolve(__dirname, '../../../..')
const index = parse(readFileSync(resolve(root, 'src/demo_user_status/_index.yaml'), 'utf8')) as { entries: Entry[] }

function entry(name: string): Entry {
  const found = index.entries.find(e => e.name === name)
  if (!found)
    throw new Error(`entry ${name} is missing from src/demo_user_status/_index.yaml`)
  return found
}

const point = entry('users').meta
const tile = entry('user_status').meta
const pointSchema = (point.output as { schema: object }).schema
const tileSchema = ((tile.inputs as { main: { schema: object } }).main).schema

const saved: unknown = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/users.output.json'), 'utf8'))

function validator(schema: object) {
  return new Ajv({ allErrors: true, strict: true }).compile(schema)
}

describe('users point and user-status tile', () => {
  it('declares the point and the tile for the same shape', () => {
    expect((point.output as { shape: string }).shape).toBe('schema')
    expect((tile.inputs as { main: { shape: string } }).main.shape).toBe('schema')
    expect(tile.default_data).toEqual({ main: 'demo.user_status:users' })
    expect(point.live_topic).toBe('dash.users.changed')
    expect(tile.tag).toBe('user-status')
    expect(tile.tile_type).toBe('demo.user_status')
  })

  it('uses one schema for the point output and the tile input', () => {
    expect(tileSchema).toEqual(pointSchema)
  })

  it('accepts the saved output of list_users', () => {
    const check = validator(tileSchema)
    expect(check(saved), JSON.stringify(check.errors)).toBe(true)
  })

  it('lets the tile draw the saved output', () => {
    const { users, error } = readUsers(saved)
    expect(error).toBeNull()
    expect(users.length).toBeGreaterThanOrEqual(3)
  })

  it('has a stable order: name, then user id', () => {
    const { users } = readUsers(saved)
    const sorted = [...users].sort((a, b) => {
      const an = a.name.toLowerCase()
      const bn = b.name.toLowerCase()
      return an === bn ? a.user_id.localeCompare(b.user_id) : an < bn ? -1 : 1
    })
    expect(users.map(u => u.user_id)).toEqual(sorted.map(u => u.user_id))
  })
})

describe('a broken copy of the output', () => {
  const check = validator(tileSchema)
  const clone = (): { users: Array<Record<string, unknown>> } => JSON.parse(JSON.stringify(saved))

  it('fails when a user has no status', () => {
    const broken = clone()
    delete broken.users[0]?.status
    expect(check(broken)).toBe(false)
  })

  it('fails when groups is not a list', () => {
    const broken = clone()
    if (broken.users[0])
      broken.users[0].groups = 'app.security:admin'
    expect(check(broken)).toBe(false)
  })

  it('fails when a field is renamed', () => {
    const broken = clone()
    const first = broken.users[0]
    if (first) {
      first.full_name = first.name
      delete first.name
    }
    expect(check(broken)).toBe(false)
  })

  it('fails on an unknown status or an extra field', () => {
    const odd = clone()
    if (odd.users[0])
      odd.users[0].status = 'disabled'
    expect(check(odd)).toBe(false)
    const extra = clone()
    if (extra.users[0])
      extra.users[0].email = 'x@example.invalid'
    expect(check(extra)).toBe(false)
  })

  it('fails when the users list is missing', () => {
    expect(check({})).toBe(false)
    expect(check({ users: {} })).toBe(false)
  })

  it('is refused by the tile too', () => {
    const broken = clone()
    delete broken.users[0]?.user_id
    expect(readUsers(broken).error).not.toBeNull()
  })
})
