/**
 * Provides `LAYOUT_SLOT_KEY` for content teleported into a panel anchor.
 *
 * Vue's provide/inject follows the *render* tree, but `<Teleport>` only
 * moves DOM — the rendered content's Vue parent is wherever the
 * `<Teleport>` was declared, NOT the DOM anchor it lands in. So content
 * rendered by `LayoutManagerView`'s flat panel zone has no access to
 * `LayoutPanelSlot`'s `provide(LAYOUT_SLOT_KEY, ...)` even though it
 * eventually lives inside the slot's DOM subtree.
 *
 * This wrapper stitches the gap. Each teleported panel content is
 * wrapped in `<PanelSlotContext>`, which provides the same slot context
 * `LayoutPanelSlot` would have — making `useLayoutSlot()` work in
 * resolver code (`PageResolver`, `ArtifactResolver`, `ComponentResolver`,
 * `BuiltinResolver`, etc.) and any panel content that wants to react to
 * collapsed / size state.
 */
import type { LayoutManager } from './layout-manager';
import type { PanelTree } from './types';
type __VLS_Props = {
    panelId: string;
    tree: PanelTree;
    manager: LayoutManager;
    /** Defaults to true for floating/modal callers outside the panel tree. */
    presented?: boolean;
};
declare var __VLS_1: {};
type __VLS_Slots = {} & {
    default?: (props: typeof __VLS_1) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
