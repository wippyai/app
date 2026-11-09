/**
 * Top-level manager view. Renders three things:
 *
 *   1. The active layout TREE — flex containers with anchor slots
 *      (`LayoutPanelSlot`). Anchors take flex space and register their
 *      DOM element with the `LAYOUT_ANCHOR_REGISTRY_KEY` registry.
 *   2. The MOUNT zone — one stable wrapper per panel id, positioned
 *      absolutely to overlay its anchor's rect. ResizeObserver tracks
 *      the anchor's geometry and updates the wrapper's left/top/
 *      width/height. The wrapper itself never moves between DOM
 *      parents, so iframes / web components inside keep their
 *      document and state across breakpoint flips that swap the
 *      anchor element.
 *   3. Floating + modal overlays — orthogonal `<Teleport>` to body.
 *
 * Why an overlay-tracker instead of `<Teleport>`: Vue's Teleport moves
 * DOM nodes between parents when the target changes. Browsers RELOAD
 * iframes whenever their element is removed-and-reinserted (even via
 * `appendChild`), so a teleport-based design loses iframe document
 * state on every breakpoint flip. Keeping the wrapper anchored to a
 * fixed parent and CSS-positioning it over the anchor sidesteps this.
 */
import type { LayoutManager } from './layout-manager';
type __VLS_Props = {
    manager: LayoutManager;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
