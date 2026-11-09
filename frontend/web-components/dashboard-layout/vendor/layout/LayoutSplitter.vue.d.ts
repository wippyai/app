/**
 * Splitter between two sibling panels / nested trees. Adopts the
 * patterns from .local/2026-04-22-splitter-prior-art.md:
 *
 *   - Visible divider 1px (configurable via --wippy-layout-splitter-size).
 *     Hitbox expanded via `::before` pseudo-element with calc(50% -
 *     hover/2) centering (VS Code sash pattern).
 *   - `@media (pointer: coarse)` bumps hover size to 24px on touch —
 *     none of the reference libraries do this; Apple HIG recommends
 *     ≥24pt touch targets.
 *   - Drag uses `setPointerCapture` on the root element (bvaughn pattern,
 *     reroutes events past any iframe under the pointer) PLUS
 *     document-level move/up listeners (safety net).
 *   - Iframe shield (`pointer-events: none` on every iframe) + global
 *     cursor override are applied via the shared `drag-state` helper.
 *   - Drag resets on `pointercancel` + window `blur` (tab-switch cases
 *     VS Code's sash misses).
 *   - Adjacent nested `PanelTree` is resized via its own `flex-basis`
 *     by reading the tree's DOM bounding box; no recurse into the first
 *     leaf (matches VS Code splitview behavior).
 */
import type { LayoutManager } from './layout-manager';
import type { PanelDivider, PanelSlot, PanelTree } from './types';
type __VLS_Props = {
    direction: 'horizontal' | 'vertical';
    /** Sibling before this splitter (slot or nested tree). */
    before: PanelSlot | PanelTree | null;
    /** Sibling after this splitter (slot or nested tree). */
    after: PanelSlot | PanelTree | null;
    /**
     * The DOM element representing the before sibling. For a leaf slot
     * this is the slot's `<div>`; for a nested tree it's the tree's
     * container. Used to measure starting size at drag begin.
     */
    beforeEl: HTMLElement | null;
    afterEl: HTMLElement | null;
    /** Persistent paint only; resize hit area and semantics are unchanged. */
    paint?: PanelDivider;
    manager: LayoutManager;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
