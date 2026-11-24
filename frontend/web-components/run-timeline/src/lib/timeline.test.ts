import { describe, expect, it } from 'vitest'
import { barShare, formatDuration, readTimeline } from './timeline'

describe('barShare', () => {
  it('is the node duration over the run duration, kept between 0 and 1', () => {
    expect(barShare(7171, 9139)).toBeCloseTo(0.7847, 3)
    expect(barShare(20000, 9139)).toBe(1)
    expect(barShare(5, 0)).toBe(0)
  })
})

describe('formatDuration', () => {
  it('uses milliseconds below one second and seconds above', () => {
    expect(formatDuration(1)).toBe('1 ms')
    expect(formatDuration(9139)).toBe('9.14 s')
    expect(formatDuration(120000)).toBe('120 s')
  })
})

describe('readTimeline', () => {
  it('treats a node without children as a leaf', () => {
    const { timeline } = readTimeline({
      run: { type: 'workflow', status: 'completed', started_at: '2026-06-16T20:43:42+02:00', duration_ms: 10, commits: 1 },
      nodes: [{ type: 'func', status: 'completed', duration_ms: 5 }],
    })
    expect(timeline?.rows).toEqual([{ depth: 0, type: 'func', status: 'completed', duration_ms: 5, share: 0.5 }])
  })
})
