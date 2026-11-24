import { expect, test } from '@playwright/test'
import type { FrameEvents } from './helpers/navigation-noise'
import { cancelledByNavigation, NAVIGATION_SETTLE_MS } from './helpers/navigation-noise'

/**
 * The rule that excuses an aborted Host bundle request (e2e/helpers/page-watch.ts). It needs no
 * browser and no app, so it always runs. The frames here are plain strings.
 *
 * A request started at 1000 ms and failed at 1500 ms. Only a new document of its own frame, or the
 * removal of that frame, from 1000 ms to 1500 ms + NAVIGATION_SETTLE_MS, excuses it. A history change
 * inside one document leaves no event in `documents`, so it never excuses anything.
 */
const request = { frame: 'main', startedAt: 1000, failedAt: 1500 }

function events(partial: Partial<FrameEvents<string>> = {}): FrameEvents<string> {
  return { documents: new Map(), detached: new Map(), ...partial }
}

test.describe('an aborted request counts as navigation noise only after a real navigation', () => {
  test('a history change alone leaves it unexpected', () => {
    // pushState, replaceState and a hash change start no document, so nothing is recorded.
    expect(cancelledByNavigation(events(), request)).toBe(false)
  })

  test('a new document in the frame that asked for it excuses it', () => {
    expect(cancelledByNavigation(events({ documents: new Map([['main', [1200]]]) }), request)).toBe(true)
  })

  test('a new document that starts a moment after the abort still excuses it', () => {
    const at = request.failedAt + NAVIGATION_SETTLE_MS
    expect(cancelledByNavigation(events({ documents: new Map([['main', [at]]]) }), request)).toBe(true)
  })

  test('the removal of the frame excuses it', () => {
    expect(cancelledByNavigation(events({ detached: new Map([['main', 1400]]) }), request)).toBe(true)
  })

  test('a navigation of another frame leaves it unexpected', () => {
    expect(cancelledByNavigation(events({ documents: new Map([['other', [1200]]]) }), request)).toBe(false)
    expect(cancelledByNavigation(events({ detached: new Map([['other', 1200]]) }), request)).toBe(false)
  })

  test('a document that started before the request or long after the abort leaves it unexpected', () => {
    const late = request.failedAt + NAVIGATION_SETTLE_MS + 1
    expect(cancelledByNavigation(events({ documents: new Map([['main', [999, late]]]) }), request)).toBe(false)
    expect(cancelledByNavigation(events({ detached: new Map([['main', 999]]) }), request)).toBe(false)
    expect(cancelledByNavigation(events({ detached: new Map([['main', late]]) }), request)).toBe(false)
  })

  test('a request with no known frame is never excused', () => {
    expect(cancelledByNavigation(events({ documents: new Map([['main', [1200]]]) }), { ...request, frame: undefined })).toBe(false)
  })
})
