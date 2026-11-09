import type { ComputedRef, Ref } from 'vue';
/**
 * Multi-buffered content swapping — the state machine behind "show the
 * next page without flashing the old one away".
 *
 * A *buffer* (or slot) holds one piece of content and stays mounted
 * while a sibling buffer loads the next one. When the incoming buffer
 * signals it has painted, it becomes active and the outgoing one
 * retires. Because retired buffers stay mounted, navigating back to
 * content that is still buffered reuses the live DOM — which for an
 * `<iframe>` means no reload and no lost state.
 *
 * This module owns *only* the bookkeeping: which buffer holds what, which
 * is active, which has painted, which failed. It renders nothing and
 * imposes no styling: the caller renders one element per buffer and binds
 * its own classes off `slots` / `topIndex` / `showLoader`. `w-page.vue` in
 * the Web Host is the reference consumer.
 *
 * ## Why buffer identity is an index, not a key
 *
 * `slots` is a fixed-length array and a slot's `index` never changes.
 * Callers **must** key their render loop on `slot.index`, never on
 * `slot.key`. Keying on content makes Vue reorder DOM nodes on every
 * swap, and a reordered `<iframe>` is detached and reinserted — which
 * browsers treat as a fresh navigation, reloading the document and
 * destroying exactly the state this module exists to preserve. The same
 * constraint governs the panel mount zone in `LayoutManagerView`.
 */
/**
 * Which buffer to overwrite when new content arrives and no buffer
 * already holds it.
 *
 * - `round-robin` — advance to the next index, wrapping. For two
 *   buffers this alternates, which is the historical Web Host
 *   behaviour. For three or more it can evict the *more* recently used
 *   of the candidates, so it is not a good default beyond two.
 * - `lru` — overwrite whichever inactive buffer was active longest ago.
 */
export type SwapEvictPolicy = 'round-robin' | 'lru';
/**
 * What `push` hands back: which buffer took the content, and under what
 * key. Everything mutable is deliberately absent — read it live from
 * `slots.value[index]`.
 */
export interface SwapSlotHandle {
    readonly index: number;
    readonly key: string;
}
export interface SwapSlot<E> {
    /** Fixed buffer position. Stable for the lifetime of the buffer — use as the render key. */
    readonly index: number;
    /** Identity of the content, from `keyOf`. Equal keys reuse this buffer instead of allocating. */
    readonly key: string;
    /** Caller-defined payload describing what to render. */
    readonly entry: E;
    /** The content has signalled that it has painted. */
    readonly ready: boolean;
    /**
     * Loading/render failure for **this buffer specifically**. Scoped per
     * buffer on purpose: one buffer failing must not tear down a sibling
     * that is holding perfectly good content, or navigating away from a
     * broken page and back destroys the page you came from too.
     */
    readonly error: unknown | null;
    /**
     * Monotonic stamp of the last time this buffer became active. `lru`
     * eviction picks the smallest. Never reset, so it also serves as a
     * "has been used" marker.
     */
    readonly lastActiveAt: number;
}
export interface SwapBufferOptions<E> {
    /**
     * Derive a stable identity for a piece of content. Two entries with
     * the same key are the same content, and pushing one when the other
     * is already buffered reuses that buffer rather than remounting.
     *
     * Must not read a clock or any other value that changes between calls
     * for identical content — an unstable key defeats reuse entirely and
     * forces a remount on every push.
     */
    keyOf: (entry: E) => string;
    /** Number of buffers. `1` disables reuse; `2` is the classic double buffer. Default `2`. */
    buffers?: number;
    /** Eviction policy when every buffer is occupied. Default `round-robin`. */
    evict?: SwapEvictPolicy;
    /**
     * Ceiling on how long a buffer may stay un-revealed waiting to paint.
     *
     * Readiness is reported by the content, and content can fail to report:
     * a bundle that throws before its ready hook, a module that never
     * evaluates, a component that simply doesn't emit. Without a ceiling the
     * buffer waits forever and the user stares at a loader over stale
     * content with no error — the worst possible outcome, because nothing
     * anywhere says anything is wrong.
     *
     * `0` or `Infinity` disables the ceiling. Default `8000`.
     */
    readyTimeoutMs?: number;
    /**
     * What the ceiling does when it fires.
     *
     * `reveal` (default) shows the content anyway — it is usually painted
     * and merely silent, so revealing beats hiding it forever. `fail` marks
     * the buffer errored instead, for callers that would rather surface a
     * problem than show something possibly blank.
     */
    onReadyTimeout?: 'reveal' | 'fail';
    /**
     * Called when the ceiling fires, before the reveal/fail is applied.
     * A timeout is a real defect in the content, not a cosmetic event —
     * hosts should log it rather than let it pass silently.
     */
    onReadyTimeoutFired?: (slot: SwapSlot<E>) => void;
    /**
     * Hold the loading indicator back this long. Content that resolves from
     * cache in 30ms should not produce a 30ms strobe of spinner — that
     * flash is itself the ugly transition people notice. Default `250`.
     */
    loaderDelayMs?: number;
    /**
     * Once shown, keep the indicator up at least this long. Without a floor,
     * content that resolves just after `loaderDelayMs` makes the spinner
     * appear and vanish in the same breath, which reads as a glitch rather
     * than as loading. Default `400`.
     */
    loaderMinMs?: number;
    /**
     * Called with the slot that is about to be overwritten, before the
     * overwrite. Use it to release resources keyed to the outgoing
     * content. Not called when a buffer is reused (same key) or when an
     * empty buffer is filled.
     */
    onEvict?: (slot: SwapSlot<E>) => void;
}
export interface SwapBuffer<E> {
    /** All buffers, in index order. `null` means "never filled". */
    readonly slots: Ref<(SwapSlot<E> | null)[]>;
    /** Index of the buffer that currently owns the content. */
    readonly topIndex: Ref<number>;
    /** The active buffer, or `null` before the first push. */
    readonly active: ComputedRef<SwapSlot<E> | null>;
    /**
     * Whether a loading indicator should be on screen — already debounced
     * by `loaderDelayMs` and floored by `loaderMinMs`. Bind visibility to
     * this rather than to "is the active buffer un-ready", or fast content
     * produces a flash.
     */
    readonly showLoader: Ref<boolean>;
    /**
     * Route `entry` to a buffer. Reuses the buffer already holding this
     * key (preserving its `ready` state and any prior error), otherwise
     * evicts one per policy. Either way the target becomes active
     * immediately — activation is not deferred until the content paints,
     * because the caller needs to start routing input to it right away.
     *
     * Returns a HANDLE, not the slot: every mutation replaces the slot
     * object, so a returned `SwapSlot` would silently freeze at allocation.
     * Read live state via `slots.value[handle.index]`.
     */
    push: (entry: E) => SwapSlotHandle;
    /**
     * Mark a buffer as painted. No-op for an empty buffer.
     *
     * Pass `key` whenever the signal is asynchronous. Buffers are recycled,
     * so a late callback from content that has since been evicted would
     * otherwise mark whatever now occupies that index — revealing unpainted
     * content and cancelling its reveal ceiling. With `key` the call is
     * ignored unless the buffer still holds the content that sent it.
     */
    markReady: (index: number, key?: string) => void;
    /** Record a failure against a buffer. Same `key` guard as `markReady`. */
    markFailed: (index: number, error: unknown, key?: string) => void;
    /** Clear a buffer's error without touching its `ready` state. */
    clearError: (index: number) => void;
    /**
     * Cancel every pending timer. Called automatically on scope teardown
     * when constructed inside a component or `effectScope`; call it
     * yourself when constructing outside one.
     */
    dispose: () => void;
}
/**
 * Create a swap buffer.
 *
 * The returned refs are reactive; mutate only through the methods.
 *
 * ```ts
 * const swap = useSwapBuffer<PageEntry>({ keyOf: e => e.queryKey.join(',') })
 * watch(source, entry => swap.push(entry), { immediate: true })
 * // template: v-for="slot in swap.slots" :key="slot.index"
 * ```
 */
export declare function useSwapBuffer<E>(options: SwapBufferOptions<E>): SwapBuffer<E>;
