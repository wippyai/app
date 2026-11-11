import { describe, expect, it, vi } from 'vitest'
import { confirmOptions, createConfirm } from './host-confirm.ts'
import type { HostConfirmOptions, HostLike } from './host-confirm.ts'

const request = { action: 'set_status', args: { user_id: 'u1', status: 'inactive' } }

describe('createConfirm', () => {
  it('asks the Host first, with the Host dialog options', async () => {
    const seen: HostConfirmOptions[] = []
    const host: HostLike = { confirm: async (options) => { seen.push(options); return true } }
    const fallback = vi.fn(async () => false)
    const answer = await createConfirm(fallback, async () => host)(request)
    expect(answer).toBe(true)
    expect(fallback).not.toHaveBeenCalled()
    expect(seen).toEqual([{ message: 'Run the action "set_status"?', header: 'Please confirm', acceptLabel: 'Confirm', rejectLabel: 'Cancel' }])
  })

  it('shows the question of the request when it has one', async () => {
    const seen: HostConfirmOptions[] = []
    const host: HostLike = { confirm: async (options) => { seen.push(options); return false } }
    const answer = await createConfirm(vi.fn(), async () => host)({ ...request, message: 'Disable Test Target?' })
    expect(answer).toBe(false)
    expect(seen[0].message).toBe('Disable Test Target?')
  })

  it('treats anything but true from the Host as a refusal and does not ask the fallback', async () => {
    const fallback = vi.fn(async () => true)
    const host = { confirm: async () => undefined as unknown as boolean }
    expect(await createConfirm(fallback, async () => host)(request)).toBe(false)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('uses the fallback dialog when the Host has no confirm', async () => {
    const fallback = vi.fn(async () => true)
    expect(await createConfirm(fallback, async () => ({}))(request)).toBe(true)
    expect(await createConfirm(fallback, async () => null)(request)).toBe(true)
    expect(await createConfirm(fallback, async () => undefined)(request)).toBe(true)
    expect(fallback).toHaveBeenCalledTimes(3)
    expect(fallback).toHaveBeenCalledWith(request)
  })

  it('uses the fallback dialog when the Host cannot be loaded', async () => {
    const fallback = vi.fn(async () => false)
    const answer = await createConfirm(fallback, async () => { throw new Error('no proxy') })(request)
    expect(answer).toBe(false)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('uses the fallback dialog when host.confirm throws', async () => {
    const fallback = vi.fn(async () => true)
    const host: HostLike = { confirm: async () => { throw new Error('no dialog service') } }
    expect(await createConfirm(fallback, async () => host)(request)).toBe(true)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('calls confirm on the host object, so it keeps its this', async () => {
    const host = {
      label: 'Host',
      async confirm(this: { label: string }) { return this.label === 'Host' },
    }
    expect(await createConfirm(vi.fn(), async () => host)(request)).toBe(true)
  })
})

describe('confirmOptions', () => {
  it('names the action when the request has no message', () => {
    expect(confirmOptions({ action: 'a', args: {} }).message).toBe('Run the action "a"?')
  })
})
