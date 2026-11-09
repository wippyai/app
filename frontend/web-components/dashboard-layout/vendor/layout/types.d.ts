import type { DropPosition, PixelSize, SizeValue } from '@wippy-fe/shared';
import type { Component } from 'vue';
/**
 * Cross-boundary types re-exported from `@wippy-fe/shared`. The host
 * imports them directly from the shared package; consumers continue to
 * import from `@wippy-fe/layout` for backward compat.
 */
export type { DropPosition, PanelTarget } from '@wippy-fe/shared';
/**
 * Consumer-facing panel definition. Any Vue component can be a panel.
 *
 * `drawerOpen` is panel-local UI state — only meaningful when the active
 * layout slot has `display: 'drawer-*'`. Toggled via `LayoutManager.openDrawer
 * / closeDrawer / toggleDrawer` (or any `updatePanel` patch).
 */
export interface PanelDef {
    component: Component;
    props?: Record<string, unknown>;
    title?: string;
    icon?: string;
    drawerOpen?: boolean;
}
/**
 * Floating panel — absolute positioned window with drag/resize.
 */
/**
 * Where a floating panel pins itself, as CSS offsets from the viewport
 * edges. Each side accepts a pixel number or any CSS length string, so
 * `'50%'` and `'2rem'` both work.
 *
 * This exists because `position` is absolute `left`/`top` pixels, which
 * cannot express "the right edge" or "vertically centred" — the two things
 * edge chrome always wants. A right-hand flap positioned in pixels is
 * correct at exactly one viewport size and wrong at every other, and
 * pinning it by hand means recomputing on resize from inside the panel.
 *
 * Opposite sides may both be set to stretch the panel along that axis;
 * doing so overrides the corresponding `size` dimension, as in plain CSS.
 */
export interface FloatingAnchor {
    top?: number | string;
    right?: number | string;
    bottom?: number | string;
    left?: number | string;
    /**
     * Anchor to a **panel** rather than the viewport, using CSS Anchor
     * Positioning. The panel's slot exposes an `anchor-name`, and the
     * floating panel binds to it via `position-anchor`.
     *
     * This is what an edge tab actually wants: it belongs to the panel it
     * reveals, not to the window. Anchored this way the browser keeps the
     * two together through resizes, splitter drags and breakpoint flips
     * with no measuring and no resize listener — the layout engine does it.
     *
     * **Progressive enhancement.** CSS Anchor Positioning is Chromium-only
     * at time of writing, so always give the viewport-edge fields as well:
     * a browser without support ignores `position-anchor` / `position-area`
     * and falls back to them. Where the two disagree the anchored result is
     * the better one, which is why it is opt-in rather than the default.
     */
    panel?: string;
    /**
     * Which side of the anchor panel to sit on, as a CSS `position-area`
     * value — `'right center'`, `'top span-all'`, and so on. Defaults to
     * `'right center'`. Only meaningful with `panel`.
     */
    area?: string;
}
/**
 * The `anchor-name` a panel slot exposes for CSS Anchor Positioning.
 * Dashed-ident per spec, and namespaced so it cannot collide with a
 * consumer's own anchor names.
 */
export declare function panelAnchorName(panelId: string): string;
/**
 * Floating panel — absolute positioned window with drag/resize.
 */
export interface FloatingPanelDef extends PanelDef {
    position: {
        x: number;
        y: number;
    };
    /**
     * Pin to viewport edges instead of `position`'s absolute pixels.
     *
     * Takes precedence over `position` for the sides it names, and is
     * resolved when the panel renders — never written back into the
     * manager. That matters: the layout snapshot merges the manager's live
     * `position`, so resolving an anchor into pixels there would make every
     * subscriber read a value that is stale the moment the window resizes.
     *
     * Honoured for `chrome: false` panels. A panel with chrome is
     * user-draggable, and dragging writes absolute `position` — an anchor
     * would silently fight the user's own drag, so it is ignored there.
     */
    anchor?: FloatingAnchor;
    size: {
        width: number;
        height: number;
    };
    minSize?: {
        width: number;
        height: number;
    };
    maxSize?: {
        width: number;
        height: number;
    };
    minimizable?: boolean;
    maximizable?: boolean;
    dismissable?: boolean;
    zIndex?: number;
    /**
     * Window chrome toggle. Defaults to `true` — the panel renders as a
     * draggable window with a header (title + close), resize grips, border,
     * and shadow. Set `false` for a "flap": a bare, content-only floating
     * box pinned at `position`/`size` with no header, close, grips, drag, or
     * border — the content fills the box and may overflow it (e.g. an
     * edge chevron tab whose menu expands outward on hover).
     */
    chrome?: boolean;
}
/**
 * Size of a modal for a single breakpoint.
 */
export interface ModalSize {
    width: string;
    height?: string;
    maxWidth?: string;
}
/**
 * Modal panel — centered overlay with backdrop. `size` may be either a
 * single `ModalSize` (applied at every breakpoint) or a breakpoint-keyed
 * map — resolver picks the largest declared breakpoint whose threshold
 * fits the active viewport, falling back to `default` or `undefined`.
 *
 * ```ts
 * // Desktop fixed, mobile fullscreen
 * size: {
 *   default: { width: '560px', maxWidth: '90vw' },
 *   sm:      { width: '100vw', height: '100vh', maxWidth: '100vw' },
 * }
 * ```
 */
export interface ModalDef extends PanelDef {
    size?: ModalSize | Record<string, ModalSize>;
    dismissable?: boolean;
    /**
     * Use the platform's native `<dialog showModal()>` for top-layer
     * stacking, automatic focus trap, ARIA, and ::backdrop. Defaults to
     * `true` on environments where `HTMLDialogElement.showModal` exists.
     * Set to `false` to opt back into the legacy div-overlay path
     * (`LayoutModal.vue`) — kept for one minor release while consumers
     * migrate. The legacy path is `@deprecated` and will be removed in
     * the next major.
     *
     * Why default to native: the AC §5.13.1 platform primitives demand
     * top-layer stacking, focus trapping, and `inert` propagation under
     * the modal — all free with `<dialog showModal()>`, all manual work
     * with a div. AC §5.11 requires modals to stack ABOVE other
     * top-layer content (popovers, dialogs); only `<dialog>` participates
     * in the top-layer stacking algorithm.
     */
    useNativeDialog?: boolean;
}
/**
 * Panel display mode within a layout tree slot.
 *
 * - `inline` (default if `display` is omitted): panel renders at the slot's
 *   position in the flex grid, taking `size` along the parent's axis.
 * - `drawer-left | drawer-right | drawer-bottom`: panel is "lifted" out
 *   of the grid — the slot reserves no space, and the panel renders as
 *   an absolutely-positioned overlay anchored to the named edge of the
 *   layout container. Visible only when `panel.drawerOpen` is true.
 *   When the same panel id appears in multiple breakpoint layouts with
 *   different `display` values (e.g. `inline` at default + `drawer-left`
 *   at narrow), the engine teleports the same panel host element across
 *   the transition — iframe / web-component / Vue state preserved.
 */
export type PanelDisplay = 'inline' | 'drawer-left' | 'drawer-right' | 'drawer-bottom';
/** Persistent divider paint before an inline slot. Pointer hit area is unchanged. */
export type PanelDivider = 'default' | 'none' | 'line';
/**
 * Slot size grammar (GoldenLayout v2 alignment). Re-exported from
 * `@wippy-fe/shared` so `PanelTarget.size` and `PanelSlot.size` use the
 * same compile-time type. Accepted formats:
 *
 *   • `'auto'`     — content-driven intrinsic size
 *   • `'Nfr'`      — flex weight (`'1fr'` = "fill remaining space")
 *   • `'Npx'`      — fixed pixels
 *   • `'N%'`       — percent of parent's main axis
 *
 * Anything else (`'clamp(...)'`, `'minmax(...)'`, `'min-content'`,
 * `'calc(...)'`, `'2em'`, `'50vh'`) is REJECTED at `validateLayout` time.
 * See `helpers.ts` "Size grammar" for rationale.
 *
 * `PixelSize` is the pixel-only subset used for `minSize` / `maxSize` /
 * `drawerSize` — embedding min/max in the size value (`minmax()` /
 * `clamp()`) requires re-implementing CSS Grid's track-sizing algorithm
 * in JS; separate scalar fields are the industry pattern (GoldenLayout
 * `minSize`, dockview `minimumWidth`, VS Code splitview `minimumSize`).
 */
export type { PixelSize, SizeValue } from '@wippy-fe/shared';
/**
 * A slot in the layout tree holding one panel.
 */
export interface PanelSlot {
    panel: string;
    /**
     * Paint for the splitter immediately before this slot. The splitter keeps
     * its full interaction hit area for every value; this only controls the
     * persistent visual line. Omitted preserves the existing theme default.
     */
    dividerBefore?: PanelDivider;
    /**
     * Draw a panel-owned semantic edge before this slot. Use this when the
     * boundary should remain visible even if separator dragging is disabled.
     */
    borderBefore?: boolean;
    /**
     * Track size along the parent's axis. Required for `display: 'inline'`
     * (the default); ignored for drawer-mode slots since they don't take
     * space in the grid. Made optional in the type to keep drawer-mode
     * declarations terse — `validateLayout` enforces presence on inline
     * slots.
     */
    size?: SizeValue;
    /** Min track size, pixel-only. */
    minSize?: PixelSize;
    /** Max track size, pixel-only. */
    maxSize?: PixelSize;
    collapsible?: boolean;
    collapsed?: boolean;
    collapseSize?: SizeValue;
    draggable?: boolean;
    dropTargets?: DropPosition[];
    fixed?: boolean;
    /** Display mode. Defaults to 'inline' if omitted. */
    display?: PanelDisplay;
    /**
     * Drawer dimensions when `display !== 'inline'`. Width applies to
     * drawer-left/right; height applies to drawer-bottom. Defaults to
     * 320px / 320px when omitted. Pixel-only — fr/% don't make sense for
     * a free-floating overlay's intrinsic dimension.
     */
    drawerSize?: {
        width?: PixelSize;
        height?: PixelSize;
    };
}
/**
 * Recursive split container. Children can be slots or nested trees.
 */
export interface PanelTree {
    direction: 'horizontal' | 'vertical';
    children: Array<PanelSlot | PanelTree>;
    /**
     * Track size of a NESTED tree along its parent's axis, in the same
     * grammar as `PanelSlot.size` (`auto` | `Nfr` | `Npx` | `N%`). Omit it
     * and the tree keeps sharing the free space with its siblings, as it
     * always did. `Npx` and `N%` fix the tree at that size: it neither
     * grows nor shrinks. Ignored on the root tree of a layout, which has
     * no parent track.
     */
    size?: SizeValue;
    draggable?: boolean;
    minChildren?: number;
    maxChildren?: number;
}
/**
 * Tailwind-standard default breakpoints. Consumers can override via
 * `LayoutDeclaration.breakpoints`.
 */
export declare const DEFAULT_BREAKPOINTS: Record<string, number>;
/**
 * Full layout declaration.
 *
 * `layouts.default` is required. Additional keys (any string — typically
 * `sm` / `md` / `lg` / `xl`) are optional breakpoint variants. The renderer
 * picks the largest breakpoint whose threshold fits the container width.
 */
export interface LayoutDeclaration {
    layouts: Record<string, PanelTree> & {
        default: PanelTree;
    };
    breakpoints?: Record<string, number>;
    panels: Record<string, PanelDef>;
    floating?: Record<string, FloatingPanelDef>;
    modals?: Record<string, ModalDef>;
    dragEnabled?: boolean;
}
/**
 * Feature toggles. v1 ships `separatorDrag`, `floating`, `modals` enabled.
 * `panelDrag` and `tabs` are reserved — throw on construction if set true.
 */
export interface LayoutCapabilities {
    separatorDrag?: boolean;
    panelDrag?: boolean;
    tabs?: boolean;
    floating?: boolean;
    modals?: boolean;
}
export declare const DEFAULT_CAPABILITIES: Required<LayoutCapabilities>;
export interface LayoutEvents {
    change: (decl: LayoutDeclaration) => void;
    breakpoint: (info: {
        name: string;
        width: number;
    }) => void;
    drag: (info: {
        panel: string;
        delta: number;
        direction: 'horizontal' | 'vertical';
    }) => void;
}
export interface ValidationIssue {
    kind: 'duplicate-id' | 'orphan-ref' | 'bad-size' | 'bad-divider' | 'bad-border-before' | 'empty-tree' | 'capability-reserved' | 'unknown-breakpoint' | 'unknown-panel-id' | 'unknown-floating-id' | 'unknown-modal-id' | 'duplicate-floating-id' | 'duplicate-modal-id' | 'bad-display' | 'bad-modal-def' | 'missing-size';
    message: string;
    panelId?: string;
    panelIds?: string[];
}
export declare class LayoutValidationError extends Error {
    readonly issues: ValidationIssue[];
    constructor(issues: ValidationIssue[]);
}
