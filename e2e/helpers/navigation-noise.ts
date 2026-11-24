/**
 * Decides whether an aborted request was cancelled by its frame leaving the page. Pure, so that
 * `navigation-noise.spec.ts` can prove the rule without a browser.
 *
 * Only two events cancel a request of a frame: the document of the frame was replaced (a new
 * document started in it), or the frame was removed. A history change inside the same document
 * (`history.pushState`, a hash change) is neither: Playwright's `framenavigated` event also fires
 * for it, so that event must not be used here. `page-watch.ts` records a document start from an
 * init script, which runs once for each new document and never for a history change.
 */

/**
 * How long after a request failed a document start of its frame still counts as its cause.
 * Chromium can report the abort a moment before the new document runs its first script.
 */
export const NAVIGATION_SETTLE_MS = 2000

/** What a page watch recorded about its frames. `F` is the frame object (Playwright's `Frame`). */
export interface FrameEvents<F> {
  /** For each frame, when a new document started in it. */
  documents: Map<F, number[]>
  /** For each frame, when it was removed from the page. */
  detached: Map<F, number>
}

/** An aborted request: the frame that asked for it, when it started and when it failed (ms). */
export interface CancelledRequest<F> {
  frame: F | undefined
  startedAt: number
  failedAt: number
}

/**
 * True when the frame of the request had a new document, or was removed, from the start of the
 * request until `NAVIGATION_SETTLE_MS` after it failed. A request with no known frame is never
 * excused.
 */
export function cancelledByNavigation<F>(events: FrameEvents<F>, c: CancelledRequest<F>): boolean {
  if (c.frame === undefined)
    return false
  const until = c.failedAt + NAVIGATION_SETTLE_MS
  const inWindow = (at: number) => at >= c.startedAt && at <= until
  const detachedAt = events.detached.get(c.frame)
  if (detachedAt !== undefined && inWindow(detachedAt))
    return true
  return (events.documents.get(c.frame) ?? []).some(inWindow)
}
