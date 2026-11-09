/**
 * Shared drag-state helpers used by both `LayoutSplitter` and
 * `LayoutFloating`. Implements the patterns adopted in the prior-art
 * survey (.local/2026-04-22-splitter-prior-art.md):
 *
 *   - Iframe pointer-events shield: during drag, every iframe in the
 *     document gets `pointer-events: none` via the
 *     `pointer-events-disabled` class (VS Code sash pattern). This is
 *     complemented by `setPointerCapture` on the drag handle's first
 *     `pointermove` (bvaughn's react-resizable-panels PR #693) which
 *     reroutes events past iframes directly.
 *   - Global cursor override: injects `* { cursor: X !important; }`
 *     into an adopted stylesheet so the cursor doesn't flicker when the
 *     pointer crosses child elements with a different cursor.
 *   - Teardown on `pointerup` / `pointercancel` / window `blur` — the
 *     last one covers alt-tab / focus-loss cases that VS Code's sash
 *     misses.
 *
 * All handles share a single drag-session at a time (the registry
 * guarantees this — starting a new session ends the previous one).
 */
export interface DragSessionOptions {
    cursor: string;
    /** Called on every pointermove after the session starts. */
    onMove: (e: PointerEvent) => void;
    /** Called on pointerup / pointercancel / window-blur / explicit end(). */
    onEnd: () => void;
    /** The element that owns pointer capture (prior-art PR #693 pattern). */
    captureTarget: Element;
    /** The pointerId to capture. */
    pointerId: number;
}
/**
 * Start a drag session. Returns an `end()` function the caller can
 * invoke to terminate early (e.g. from an outer guard).
 *
 * Starting a second session while one is active automatically ends
 * the first — there's only ever one drag in flight.
 *
 * Pointer-capture timing: deferred to the FIRST `pointermove` per
 * react-resizable-panels PR #693. Calling `setPointerCapture` on
 * `pointerdown` occasionally misbehaves when the pointer is over a
 * child iframe on press (browsers can lose the capture if the
 * down-target element is still resolving). Letting the first move
 * confirm the drag intent and then taking capture is the pattern
 * that stuck in the open-source ecosystem.
 *
 * The iframe pointer-events shield is activated immediately so even
 * the first move is safely routed; capture is the second line of
 * defense.
 */
export declare function startDragSession(opts: DragSessionOptions): () => void;
