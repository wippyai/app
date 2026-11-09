/**
 * @deprecated Use `LayoutModalNative` (the default since v1.1). This
 * div-overlay implementation is kept for one minor release as a
 * fallback for platforms without `HTMLDialogElement.showModal` (very
 * old browsers, JSDOM) and for consumers who explicitly opt out via
 * `ModalDef.useNativeDialog: false`. It will be removed in the next
 * major.
 *
 * Why deprecated: the platform's native `<dialog showModal()>` provides
 * top-layer stacking (AC §5.11), focus trap (§5.7, §5.12), `inert`
 * propagation, and a native ::backdrop pseudo-element for free —
 * matching all of which manually requires a JS focus-trap, an
 * `aria-hidden` toggle on the layout root, and a z-index arms race
 * against page popovers. See `LayoutModalNative.vue` for the
 * replacement.
 *
 * Original v1 contract preserved: backdrop, ESC close (unless
 * `dismissable: false`), backdrop-click close, z-index stacking via
 * `stackIndex`. Focus trap was deferred — browsers cycle focus
 * naturally via Tab; the behavior is correct but not trapped inside
 * the dialog. The native version closes that gap.
 *
 * ESC-closes-topmost-only behavior is backed by `modal-stack.ts`, which
 * tracks currently-mounted modals at module scope (required — SFC
 * `<script setup>` locals are per-instance).
 */
import type { LayoutManager } from './layout-manager';
import type { ModalDef } from './types';
type __VLS_Props = {
    id: string;
    def: ModalDef;
    manager: LayoutManager;
    stackIndex: number;
    attentionElement?: (element: HTMLElement | null) => void;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
