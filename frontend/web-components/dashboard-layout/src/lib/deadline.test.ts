import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadlineError, isValidTileTag, withDeadline } from './deadline'

describe('isValidTileTag', () => {
  it('accepts custom element names', () => {
    for (const tag of ['dash-kpi', 'dash-placeholder', 'run-timeline', 'user-status', 'a-b', 'x-1-y2'])
      expect(isValidTileTag(tag)).toBe(true)
  })

  it('refuses anything else', () => {
    for (const tag of ['', 'div', 'Dash-kpi', '1-dash', '-dash', 'dash-', 'dash--kpi', 'dash_kpi', 'dash kpi', 'dash-kpi>', '<img-x>', 'dash-kpi"x', 'dash.kpi-x'])
      expect(isValidTileTag(tag)).toBe(false)
    expect(isValidTileTag(undefined)).toBe(false)
    expect(isValidTileTag(null)).toBe(false)
    expect(isValidTileTag(42)).toBe(false)
  })
})

describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolves with the value when the work finishes in time', async () => {
    const result = withDeadline(() => Promise.resolve('ok'), 15_000, 'late')
    await expect(result).resolves.toBe('ok')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with a DeadlineError when the work never settles', async () => {
    const result = withDeadline(() => new Promise<void>(() => {}), 15_000, 'did not load in 15 seconds')
    const assertion = expect(result).rejects.toThrow('did not load in 15 seconds')
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
    await expect(result).rejects.toBeInstanceOf(DeadlineError)
  })

  it('passes on the error of work that rejects, and clears the timer', async () => {
    const result = withDeadline(() => Promise.reject(new Error('boom')), 15_000, 'late')
    await expect(result).rejects.toThrow('boom')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects when the work throws synchronously', async () => {
    const result = withDeadline(() => { throw new Error('sync boom') }, 15_000, 'late')
    await expect(result).rejects.toThrow('sync boom')
    expect(vi.getTimerCount()).toBe(0)
  })
})
