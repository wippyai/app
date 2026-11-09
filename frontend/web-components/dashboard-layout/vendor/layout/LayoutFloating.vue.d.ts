/**
 * Absolute-positioned floating window. Draggable via header; resizable
 * via 8 grip handles (4 corners + 4 edges) adopting the prior-art
 * pattern from re-resizable + VS Code sash. Pointer-events shield on
 * iframes during drag so nested iframes don't swallow events; global
 * cursor override via the shared `drag-state` helper.
 *
 * Keyboard accessibility — none of the reference libraries ship
 * arrow-key resize; TODO once we see a concrete need.
 */
import type { LayoutManager } from './layout-manager';
import type { FloatingPanelDef } from './types';
type __VLS_Props = {
    id: string;
    def: FloatingPanelDef;
    manager: LayoutManager;
    stackIndex: number;
    attentionElement?: (element: HTMLElement | null) => void;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
