import type { LayoutManager } from './layout-manager';
import type { PanelTree } from './types';
type __VLS_Props = {
    tree: PanelTree;
    manager: LayoutManager;
    /** True for a tree rendered inside another tree. Only nested trees take a `size`. */
    nested?: boolean;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
