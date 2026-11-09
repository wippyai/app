/**
 * Anchor for a drawer-mode panel. Same role as `LayoutPanelSlot` —
 * registers its DOM element with the anchor registry so the
 * `LayoutManagerView` flat panel zone teleports content here. Differs
 * in two ways:
 *
 *   1. Positioning: absolutely positioned at the named edge of the
 *      parent layout container (left / right / bottom).
 *   2. Visibility: only "open" when the panel def's `drawerOpen` is
 *      true. A closed drawer keeps its full size and rests hidden at
 *      its edge, inside the layout, so it adds nothing to an ancestor's
 *      scrollable area. The panel content keeps its size across
 *      open/close, so no remount, no scroll loss, no iframe reload.
 *
 * Iframe-preservation across breakpoint flips is the key invariant.
 * When the same panel id appears in both an inline slot (default
 * breakpoint) and a drawer-mode slot (narrow breakpoint), the panel
 * id stays in `activePanelIds` across the flip, so the flat panel
 * zone keeps its component instance. The teleport target switches
 * from the inline `LayoutPanelSlot`'s element to this component's
 * element — Teleport re-targets reactively via the registry's
 * `reactive` map and Vue moves the existing DOM subtree without
 * re-running setup() or unmounting.
 */
import type { LayoutManager } from './layout-manager';
import type { PanelSlot } from './types';
type __VLS_Props = {
    slotDef: PanelSlot;
    manager: LayoutManager;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
