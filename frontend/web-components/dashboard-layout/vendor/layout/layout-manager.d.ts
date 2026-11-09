import type { FloatingPanelDef, LayoutCapabilities, LayoutDeclaration, LayoutEvents, ModalDef, PanelDef, PanelSlot, PanelTarget, PanelTree, SizeValue } from './types';
/**
 * Declarative, imperatively-mutable multi-panel layout manager.
 *
 * Owns the LayoutDeclaration; every mutation emits `change`. Vue renderers
 * subscribe via composables; the class itself has no Vue dependency and is
 * unit-testable without a DOM.
 */
export declare class LayoutManager {
    private decl;
    private readonly emitter;
    private _activeBreakpoint;
    readonly capabilities: Required<LayoutCapabilities>;
    /**
     * Pre-registered modal templates. `openModal(id)` (no def) looks up
     * here; `openModal(id, def)` re-registers under the same id so
     * subsequent id-only opens reuse the latest shape.
     *
     * Initial declaration's `modals` block is hoisted into this registry
     * at construction — i.e. listing a modal in the declaration REGISTERS
     * it (closed) rather than opening it. Boot state always has zero
     * modals open; consumers call `openModal(id)` to actually display.
     */
    private modalRegistry;
    constructor(declaration: LayoutDeclaration, capabilities?: LayoutCapabilities);
    /**
     * Returns a deep clone of the current declaration. Safe to mutate
     * by the caller (won't affect manager state).
     */
    getLayout(): LayoutDeclaration;
    /** Approved metadata for declared modal templates, including closed modals. */
    getRegisteredModals(): Array<{
        id: string;
        title?: string;
    }>;
    /**
     * Replace the full declaration atomically. Validates + clones +
     * emits `change` once.
     */
    setLayout(next: LayoutDeclaration): void;
    /**
     * Active breakpoint name. Updated by the renderer via setActiveBreakpoint.
     */
    get activeBreakpoint(): string;
    /**
     * Set by the renderer when the container width crosses a threshold.
     * Emits `breakpoint` if the name changed.
     */
    setActiveBreakpoint(name: string, width: number): void;
    /**
     * Add a panel to the layout. Inserts into the `default` breakpoint at
     * the specified target. Other breakpoint layouts are untouched — if
     * a breakpoint should include the new panel, the consumer should
     * subsequently edit that breakpoint layout via setLayout.
     */
    addPanel(id: string, def: PanelDef, target: PanelTarget): void;
    /**
     * Remove a panel from every breakpoint layout + from the panels map.
     */
    removePanel(id: string): void;
    /**
     * Patch a panel's PanelDef (component / props / title / icon).
     * Replaces fields listed in the patch; other fields preserved.
     */
    updatePanel(id: string, patch: Partial<PanelDef>): void;
    /**
     * Change a panel's `size` in the active breakpoint layout.
     * Other breakpoints are untouched.
     *
     * **Errors:** throws `LayoutValidationError` if `id` doesn't exist
     * in the panels map (programmer error). If `id` exists but isn't
     * present in the active breakpoint's layout tree, this is a no-op
     * (valid runtime state — the mutation will take effect when that
     * breakpoint becomes active).
     */
    resizePanel(id: string, size: SizeValue): void;
    /**
     * Atomically resize two panels in the active breakpoint layout, emitting
     * a single `change` event for the pair. Used by paired splitter drag
     * (Phase 6) where one neighbor grows while the other shrinks in lockstep.
     *
     * Both panels must exist and (for the mutation to take effect) be present
     * in the active layout's tree. If either id is missing from the panels
     * map, throws `LayoutValidationError`. If either id exists but isn't in
     * the active tree, this is a no-op for that side (matching `resizePanel`'s
     * runtime contract). When both sides hit no-op, no `change` is emitted.
     *
     * The caller is responsible for ensuring `sizeAPx + sizeBPx` equals the
     * combined size of the two panels' previous total (a constant-sum invariant)
     * and that each value already respects the panels' `minSize` / `maxSize`.
     * The manager does NOT re-clamp here — clamping is the splitter's job at
     * pointermove time, where it has both sides' min/max in scope. Doing it
     * twice would double-clamp and cause off-by-one drift across rapid moves.
     *
     * Sizes are written as `${px}px` strings to match `resizePanel`'s storage
     * shape. Fractional inputs are rounded.
     */
    resizePanelPair(idA: string, sizeAPx: number, idB: string, sizeBPx: number): void;
    /**
     * Collapse a panel (sets `collapsed: true` on its slot in the active layout).
     * Throws if `id` is unknown; no-op if the panel's slot is not
     * `collapsible` or already in the desired state.
     */
    collapsePanel(id: string): void;
    /**
     * Expand a collapsed panel. Same error contract as `collapsePanel`.
     */
    expandPanel(id: string): void;
    private setCollapsed;
    /**
     * Move a panel to a new position within the active breakpoint layout.
     * Programmatic API — UI layer deferred to capabilities.panelDrag.
     *
     * Throws if `id` is unknown; no-op if the panel isn't in the active
     * breakpoint's tree.
     */
    movePanel(id: string, target: PanelTarget): void;
    addFloating(id: string, def: FloatingPanelDef): void;
    removeFloating(id: string): void;
    updateFloating(id: string, patch: Partial<FloatingPanelDef>): void;
    /**
     * Open a panel's drawer overlay. Only meaningful when the panel's
     * active layout slot has `display: 'drawer-*'` — for inline slots,
     * the open state is set but has no visible effect (the renderer
     * ignores `drawerOpen` on inline slots).
     *
     * No-op if the panel id doesn't exist or if the drawer is already open.
     */
    openDrawer(id: string): void;
    /**
     * Close a panel's drawer overlay. Same contract as `openDrawer`.
     */
    closeDrawer(id: string): void;
    /**
     * Flip a panel's drawer open state.
     */
    toggleDrawer(id: string): void;
    private setDrawerOpen;
    /**
     * Open a modal. Two call shapes:
     *
     * 1. `openModal(id)` — open a pre-registered modal by id. The modal
     *    must have been declared in the initial layout's `modals` block
     *    or registered via `registerModal(id, def)`. Throws
     *    `LayoutValidationError(unknown-modal-id)` if no template exists.
     *
     * 2. `openModal(id, def)` — open with an explicit def, also registering
     *    it as a template so subsequent id-only opens reuse the same shape.
     *    Pre-existing template under the same id is replaced.
     *
     * Both shapes throw `LayoutValidationError(duplicate-modal-id)` when
     * the id is already open. Close it first, or pick a different id.
     */
    openModal(id: string, def?: ModalDef): void;
    /**
     * Pre-register a modal template. After this, `openModal(id)` (no def)
     * will use the registered shape. Re-registering an id replaces the
     * previous template; existing open modals are NOT affected (they
     * continue rendering with the def they were opened with).
     */
    registerModal(id: string, def: ModalDef): void;
    closeModal(id: string): void;
    on<K extends keyof LayoutEvents>(event: K, cb: LayoutEvents[K]): () => void;
    /**
     * Fire a `change` event without mutating state. For host layers that
     * maintain their own side-state (e.g. live panel routes, sessionIds)
     * on top of the declaration and want `change` subscribers to re-emit
     * the snapshot after a side-state write. Microtask-coalesced like
     * every other mutation — safe to call in rapid bursts.
     */
    touch(): void;
    private emitChangeQueued;
    private emitChange;
    private getActiveLayoutName;
    /**
     * Iterate over every slot in the active layout (for rendering/debug).
     */
    forEachActiveSlot(visitor: (slot: PanelSlot, parent: PanelTree) => void): void;
}
