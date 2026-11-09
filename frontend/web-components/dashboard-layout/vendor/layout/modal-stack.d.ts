/**
 * Process-wide registry of currently-mounted modal stackIndexes.
 * LayoutModal instances push on mount and remove on unmount; the ESC
 * handler consults `topmostStackIndex()` to fire only in the modal
 * with the current maximum, so a stack of N modals closes top-to-bottom
 * one keypress at a time.
 *
 * Must live in a module (not inside an SFC's `<script setup>`) to be
 * shared across instances — SFC `<script setup>` locals are per-instance.
 */
export declare function registerMountedModal(stackIndex: number): void;
export declare function unregisterMountedModal(stackIndex: number): void;
export declare function topmostStackIndex(): number;
