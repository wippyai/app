/**
 * Native-dialog modal. Uses `<dialog showModal()>` for:
 *
 *   - Top-layer stacking (AC §5.11) — the dialog paints above everything
 *     in the host's normal z-index space, including iframes, popovers,
 *     and CSS transforms / containing blocks. No `z-index: 99999` arms
 *     race; the browser picks.
 *   - Built-in focus trap (AC §5.7, §5.12) — Tab cycles inside the
 *     dialog only; focus is restored to the previously-focused element
 *     when the dialog closes.
 *   - `inert` propagation — every other element under `<html>` becomes
 *     non-interactive while the dialog is open. No need to manually
 *     toggle `aria-hidden` on the layout root.
 *   - Native `cancel` event for ESC. Honors `dismissable: false` by
 *     `preventDefault()`-ing the cancel.
 *   - `::backdrop` pseudo-element for the dimmed overlay — styled via
 *     scoped CSS below.
 *
 * Stacking of multiple modals is the browser's responsibility — each
 * `showModal()` pushes onto the top-layer stack; closing any modal
 * pops it. Background interaction stays inert.
 *
 * The legacy `LayoutModal.vue` (div-overlay implementation) remains
 * available for one minor release behind `def.useNativeDialog === false`
 * — see types.ts. Default is native.
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
