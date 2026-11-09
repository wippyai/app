/**
 * Position anchor for a panel's rendered content. The actual panel
 * component is rendered ONCE per id at the `LayoutManagerView` level,
 * into an absolutely-positioned mount that overlays this element and is
 * never re-parented. When the breakpoint flips and the layout tree
 * re-renders, this anchor's DOM node is destroyed and a new one created;
 * the mount simply re-targets the new rect, so the panel component
 * instance — and any `<iframe>` inside it — is untouched.
 *
 * This file is intentionally tiny: lay out a flex slot with the
 * correct size / collapsed / fixed styling, and register the slot's
 * DOM element with the anchor registry under its `panel` id.
 *
 * NOTE: this component does NOT provide `LAYOUT_SLOT_KEY`. Panel
 * content is rendered ONCE per id by `LayoutManagerView`'s flat panel
 * zone, which is a sibling of this anchor in the render tree — so
 * anything provided here would never be visible to it.
 * `PanelSlotContext`, which wraps the content in that zone, provides the
 * slot context instead. The template
 * here renders only the "Missing panel" placeholder div, which has no
 * descendants that could call `inject(LAYOUT_SLOT_KEY)`.
 */
import type { LayoutManager } from './layout-manager';
import type { PanelSlot, PanelTree } from './types';
type __VLS_Props = {
    slotDef: PanelSlot;
    direction: PanelTree['direction'];
    manager: LayoutManager;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
