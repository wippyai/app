import type { LayoutDeclaration, ModalDef, ModalSize, PanelSlot, PanelTarget, PanelTree, ValidationIssue } from './types';
export declare function isPanelSlot(node: PanelSlot | PanelTree): node is PanelSlot;
export declare function isPanelTree(node: PanelSlot | PanelTree): node is PanelTree;
/**
 * True when the slot renders into the in-tree grid (the default case).
 * Drawer-mode slots return false — they do NOT participate in flex sizing.
 */
export declare function isInlineSlot(slot: PanelSlot): boolean;
/**
 * True when a splitter between two siblings would have at least one
 * resizable side. A side is "resizable" if it's a non-fixed,
 * non-collapsed slot. Trees are not directly resizable today (would
 * require a tree-id mechanism — see Phase 6 / paired-resize).
 *
 * Used by LayoutTree to gate splitter rendering: between two fixed
 * chrome bands (or between a fixed chrome and a non-resizable
 * neighbor), no splitter is rendered. AC §4.1: chrome panels are
 * never resizable.
 */
export declare function hasResizableSide(before: PanelSlot | PanelTree | null, after: PanelSlot | PanelTree | null): boolean;
/**
 * True when the slot is rendered as a drawer overlay rather than in-grid.
 */
export declare function isDrawerSlot(slot: PanelSlot): boolean;
/**
 * Parsed slot-size value. Returned by `parseSize` for unambiguous unit
 * dispatch in flex-style derivation and the splitter's fr-absorber check.
 */
export type ParsedSize = {
    unit: 'auto';
} | {
    unit: 'fr';
    value: number;
} | {
    unit: 'px';
    value: number;
} | {
    unit: '%';
    value: number;
};
/**
 * Parse a size string per the grammar above. Returns null for any value
 * outside the whitelist (em/rem/vh/vw/clamp()/minmax()/etc.) — callers
 * should treat null as "invalid; fall back to default flex" rather than
 * passing the raw string through to CSS.
 *
 * Edge cases:
 *   - Case-sensitive (`'1FR'` rejected). CSS is case-insensitive but the
 *     panel-manager grammar is tighter — keeps source matching trivial.
 *   - Leading-digit required (`'.5fr'` rejected even though CSS accepts).
 *   - Negative values rejected (regex `^\d+`). Negative px is meaningless;
 *     negative fr would invert flex distribution in confusing ways.
 *   - Zero values accepted: `'0px'` (legitimate — see `host-coordinator-
 *     mount.vue` for a zero-size synthetic slot) and `'0fr'` (degenerate
 *     but harmless — `LayoutPanelSlot.flexStyle` falls back to grow=1
 *     via `value || 1`, so `0fr` renders identically to `1fr`).
 */
export declare function parseSize(s: string | undefined): ParsedSize | null;
/**
 * Parse a `Npx` string, returning the numeric pixel value or null. Used
 * for `minSize` / `maxSize` / `drawerSize` where the grammar is
 * pixel-only (mirrors GoldenLayout v2 / dockview / VS Code conventions).
 */
export declare function parsePixelSize(s: string | undefined): number | null;
/**
 * Recursively walk a PanelTree, calling visitor for each slot.
 * Callers pass back true/false if they want to stop early.
 */
export declare function walkTree(tree: PanelTree, visitSlot: (slot: PanelSlot, path: number[]) => void, visitTree?: (subtree: PanelTree, path: number[]) => void, path?: number[]): void;
/**
 * Validate a layout declaration. Returns an array of issues (empty if valid).
 * Does NOT throw — callers choose how to handle issues.
 */
export declare function validateLayout(decl: LayoutDeclaration): ValidationIssue[];
/**
 * Throw on any validation issue. Convenience wrapper around `validateLayout`.
 */
export declare function assertValidLayout(decl: LayoutDeclaration): void;
/**
 * Validate a `ModalDef` shape. Catches obviously-wrong inputs before they
 * reach the renderer (where the failure mode is a blank modal with no
 * stack trace pointing back at the caller). Symmetric to `assertValidLayout`
 * — used by `openModal(id, def)` and `registerModal(id, def)` so a bad
 * def fails fast at the mutation site.
 */
export declare function assertValidModalDef(id: string, def: ModalDef): void;
/**
 * Default modal sizing applied when a `ModalSize` field is omitted.
 * Single source of truth — both `LayoutModal` and `LayoutModalNative`
 * pull from here so the visual contract stays in lock-step across the
 * legacy div-overlay and native `<dialog>` paths.
 */
export declare const MODAL_SIZE_DEFAULTS: {
    readonly width: "500px";
    readonly height: "auto";
    readonly maxWidth: "90vw";
    readonly maxHeight: "90vh";
};
/**
 * Resolve the active `ModalSize` for the current breakpoint. Supports
 * both `ModalDef['size']` shapes:
 *   1. a single `ModalSize` — applied at every breakpoint
 *   2. a `Record<breakpointName, ModalSize>` — picks the breakpoint
 *      entry, falling back to `default`
 */
export declare function resolveModalSize(size: ModalDef['size'], bp: string): ModalSize | undefined;
/**
 * Resolve the final inline-style object for the modal dialog element.
 * Combines `resolveModalSize` with `MODAL_SIZE_DEFAULTS`.
 */
export declare function resolveModalDialogStyle(size: ModalDef['size'], bp: string): Record<string, string>;
/**
 * Given a container width + a declaration, pick the active breakpoint name.
 * Width-descending match: returns the largest declared breakpoint whose
 * threshold is <= width, or 'default' if none match.
 */
export declare function pickBreakpoint(containerWidth: number, decl: LayoutDeclaration): string;
/**
 * Derive a single-panel fallback layout. Given a declaration, returns a
 * PanelTree with only the first slot of the default layout. Useful when
 * no `sm` (or similar narrow) breakpoint is declared but the container
 * has shrunk below the smallest declared breakpoint.
 */
export declare function deriveMobileLayout(decl: LayoutDeclaration): PanelTree;
/**
 * Find the parent tree + index of a slot by panel id. Mutates nothing.
 * Returns null if not found.
 */
export declare function findSlotParent(tree: PanelTree, panelId: string): {
    parent: PanelTree;
    index: number;
} | null;
/**
 * Remove a slot from its parent by panel id. Returns the removed slot
 * or null if not found. Mutates the tree in place.
 * Collapses empty parent trees (but not the root).
 */
export declare function removeNode(tree: PanelTree, panelId: string): PanelSlot | null;
/**
 * Insert a slot at a target position. Mutates the tree in place.
 *
 * - `target.relativeTo` names an existing panel; the new slot is placed on
 *   the given side of that panel's parent (creating a nested tree if the
 *   direction differs from the drop side).
 * - Omit `target.relativeTo` to append at the root in its natural direction.
 */
export declare function insertAtPosition(tree: PanelTree, slot: PanelSlot, target: PanelTarget): void;
/**
 * Move an existing slot to a new target. Combination of removeNode + insertAtPosition.
 * No-op if panel not found; throws if target.relativeTo is the same panel being moved.
 */
export declare function moveNode(tree: PanelTree, panelId: string, target: PanelTarget): void;
/**
 * Structured clone with Vue component refs preserved by reference.
 * Used by LayoutManager.getLayout() to return a safe copy without
 * breaking Vue component identity.
 */
export declare function cloneLayout(decl: LayoutDeclaration): LayoutDeclaration;
