import { describe, expect, it } from 'vitest'
import type { RenderStateDetail } from '../types'
import {
  COMPUTING_DEADLINE_MS,
  FIRST_STATE_DEADLINE_MS,
  applyLoadFailure,
  applyRenderState,
  applyTimeout,
  coversTile,
  createRequestIds,
  deadlineMs,
  initialFrame,
  isTerminal,
  requestOrder,
  restartFrame,
  showsLoadingBar,
} from './frame'

const state = (requestId = 'r1:t', status: RenderStateDetail['status'] = 'loading'): RenderStateDetail => ({ request_id: requestId, status })

describe('createRequestIds', () => {
  it('makes unique ids that rise in order', () => {
    const ids = createRequestIds()
    const a = ids.next('t')
    const b = ids.next('t')
    const c = ids.next('other')
    expect(new Set([a, b, c]).size).toBe(3)
    expect(requestOrder(a)).toBeLessThan(requestOrder(b))
    expect(requestOrder(b)).toBeLessThan(requestOrder(c))
  })

  it('reads -1 for a foreign id', () => {
    expect(requestOrder('abc')).toBe(-1)
  })
})

describe('applyRenderState', () => {
  it('applies a state for the current request-id', () => {
    const next = applyRenderState(initialFrame('r1:t', 'loading'), {
      ...state('r1:t', 'ready'), source_title: 'Token use', computed_at: '2026-11-09T12:00:00Z',
    })
    expect(next.status).toBe('ready')
    expect(next.settled).toBe(true)
    expect(next.sourceTitle).toBe('Token use')
    expect(next.computedAt).toBe('2026-11-09T12:00:00Z')
  })

  it('ignores a state for an older request-id', () => {
    const current = restartFrame(initialFrame('r1:t'), 'r2:t', 'loading')
    const next = applyRenderState(current, state('r1:t', 'ready'))
    expect(next).toBe(current)
    expect(next.status).toBe('loading')
    expect(next.settled).toBe(false)
  })

  it('ignores a state for a request-id from the future', () => {
    const current = initialFrame('r1:t', 'loading')
    expect(applyRenderState(current, state('r9:t', 'ready'))).toBe(current)
  })

  it('ignores an unknown status', () => {
    const current = initialFrame('r1:t', 'loading')
    expect(applyRenderState(current, { request_id: 'r1:t', status: 'bogus' as never })).toBe(current)
  })

  it('keeps settled after a later refresh state', () => {
    let f = applyRenderState(initialFrame('r1:t', 'loading'), state('r1:t', 'ready'))
    f = applyRenderState(f, state('r1:t', 'loading'))
    expect(f.status).toBe('loading')
    expect(f.settled).toBe(true)
  })

  it('carries error details and clears them on the next state', () => {
    let f = applyRenderState(initialFrame('r1:t', 'loading'), {
      request_id: 'r1:t', status: 'error', error: { code: 'source_error', message: 'The source failed.' },
    })
    expect(f.errorCode).toBe('source_error')
    expect(f.errorMessage).toBe('The source failed.')
    f = applyRenderState(f, state('r1:t', 'ready'))
    expect(f.errorCode).toBeNull()
  })

  it('records stale and partial flags', () => {
    const f = applyRenderState(initialFrame('r1:t'), { ...state('r1:t', 'ready'), stale: true, completeness: 'partial' })
    expect(f.stale).toBe(true)
    expect(f.completeness).toBe('partial')
  })
})

describe('restartFrame', () => {
  it('resets status and settled, and keeps the source details', () => {
    const settled = applyRenderState(initialFrame('r1:t'), { ...state('r1:t', 'ready'), source_title: 'S', computed_at: 'c' })
    const next = restartFrame(settled, 'r2:t', 'loading')
    expect(next.requestId).toBe('r2:t')
    expect(next.settled).toBe(false)
    expect(next.status).toBe('loading')
    expect(next.sourceTitle).toBe('S')
    expect(next.computedAt).toBe('c')
  })
})

describe('deadlines', () => {
  it('allows 10 seconds, and 60 seconds while the tile computes', () => {
    expect(FIRST_STATE_DEADLINE_MS).toBe(10_000)
    expect(COMPUTING_DEADLINE_MS).toBe(60_000)
    expect(deadlineMs('loading')).toBe(10_000)
    expect(deadlineMs('loading-component')).toBe(10_000)
    expect(deadlineMs('computing')).toBe(60_000)
  })
})

describe('applyTimeout', () => {
  it('times out a frame that never reached a terminal state', () => {
    const f = applyTimeout(initialFrame('r1:t', 'loading'), 'r1:t')
    expect(f.status).toBe('timeout')
    expect(f.timedOutWhileComputing).toBe(false)
    expect(coversTile(f.status)).toBe(true)
  })

  it('remembers that the tile was computing', () => {
    const computing = applyRenderState(initialFrame('r1:t', 'loading'), state('r1:t', 'computing'))
    expect(applyTimeout(computing, 'r1:t').timedOutWhileComputing).toBe(true)
  })

  it('does not time out a settled frame', () => {
    const ready = applyRenderState(initialFrame('r1:t', 'loading'), state('r1:t', 'ready'))
    expect(applyTimeout(ready, 'r1:t')).toBe(ready)
  })

  it('does not time out a newer request with the timer of an older one', () => {
    const current = restartFrame(initialFrame('r1:t'), 'r2:t', 'loading')
    expect(applyTimeout(current, 'r1:t')).toBe(current)
  })

  it('lets a late terminal state replace the timeout', () => {
    const timedOut = applyTimeout(initialFrame('r1:t', 'loading'), 'r1:t')
    const f = applyRenderState(timedOut, state('r1:t', 'ready'))
    expect(f.status).toBe('ready')
    expect(f.settled).toBe(true)
  })
})

describe('applyLoadFailure', () => {
  it('shows a load failure for the current request only', () => {
    const f = applyLoadFailure(initialFrame('r1:t'), 'r1:t', 'no such tag')
    expect(f.status).toBe('load-failed')
    expect(f.errorMessage).toBe('no such tag')
    const other = initialFrame('r2:t')
    expect(applyLoadFailure(other, 'r1:t', 'x')).toBe(other)
  })

  it('is not replaced by a timeout', () => {
    const f = applyLoadFailure(initialFrame('r1:t'), 'r1:t', 'x')
    expect(applyTimeout(f, 'r1:t')).toBe(f)
  })
})

describe('frame classification', () => {
  it('knows the terminal statuses', () => {
    for (const s of ['ready', 'empty', 'denied', 'error']) expect(isTerminal(s)).toBe(true)
    for (const s of ['loading', 'computing', 'timeout']) expect(isTerminal(s)).toBe(false)
  })

  it('covers the tile for empty, denied, error, timeout and load failure only', () => {
    for (const s of ['empty', 'denied', 'error', 'timeout', 'load-failed'] as const) expect(coversTile(s)).toBe(true)
    for (const s of ['loading-component', 'loading', 'computing', 'ready'] as const) expect(coversTile(s)).toBe(false)
  })

  it('shows the loading bar while loading or computing', () => {
    expect(showsLoadingBar(initialFrame('r', 'loading-component'))).toBe(true)
    expect(showsLoadingBar(initialFrame('r', 'loading'))).toBe(true)
    expect(showsLoadingBar(initialFrame('r', 'computing'))).toBe(true)
    expect(showsLoadingBar(initialFrame('r', 'ready'))).toBe(false)
  })
})
