import type { InjectionKey, Ref } from 'vue';
import type { LayoutManager } from './layout-manager';
import type { FloatingPanelDef, LayoutDeclaration, PanelDef, PanelSlot } from './types';
export declare const LAYOUT_MANAGER_KEY: InjectionKey<LayoutManager>;
export interface LayoutSlotContext {
    /** Reactive ref to the current slot definition (collapsed, size, etc.). */
    slot: Ref<PanelSlot>;
    /**
     * Whether this retained panel is presently exposed by the layout. A closed
     * drawer remains mounted but is not presented. This is intentionally
     * distinct from the panel host's paint fallback during a content swap.
     */
    presented: Ref<boolean>;
    manager: LayoutManager;
}
/** Injection key used by LayoutPanelSlot to expose the current slot to its rendered panel. */
export declare const LAYOUT_SLOT_KEY: InjectionKey<LayoutSlotContext>;
/**
 * Internal anchor registry: maps `panelId` to the slot's anchor DOM
 * element. `LayoutPanelSlot` registers its element on mount and clears
 * on unmount; `LayoutManagerView` reads this registry to teleport
 * panel content into the matching anchor on every breakpoint flip
 * without unmounting the panel component.
 *
 * Reactive `Record<string, HTMLElement | null>` so `<Teleport :to>` and
 * `:disabled` re-evaluate when the anchor is recreated.
 *
 * @internal
 */
export declare const LAYOUT_ANCHOR_REGISTRY_KEY: InjectionKey<Record<string, HTMLElement | null>>;
/**
 * Access the current LayoutManager from any descendant component.
 * Provide it via `app.provide(LAYOUT_MANAGER_KEY, manager)` at the root
 * or via `<provide :value="manager" :key="LAYOUT_MANAGER_KEY" />` inside
 * `LayoutManagerView`.
 */
export declare function useLayout(): LayoutManager;
/**
 * Reactive active breakpoint ref. Updates when the container width crosses
 * a threshold.
 */
export declare function useLayoutBreakpoint(manager?: LayoutManager): Ref<string>;
/**
 * Reactive access to a single panel's PanelDef. Returns `null` if the
 * panel is removed.
 */
export declare function useLayoutPanel(panelId: string, manager?: LayoutManager): Ref<PanelDef | null>;
/**
 * Reactive access to a floating panel's definition.
 */
export declare function useLayoutFloating(floatingId: string, manager?: LayoutManager): Ref<FloatingPanelDef | null>;
/**
 * Access the slot context injected by LayoutPanelSlot. Use from inside
 * any panel component to react to collapsed / size state — e.g. render
 * icon-only chrome while collapsed, or swap content on a fixed slot.
 *
 * ```ts
 * const { slot, manager } = useLayoutSlot()
 * const collapsed = computed(() => slot.value.collapsed)
 * function toggle() {
 *   if (collapsed.value)
 *     manager.expandPanel(slot.value.panel)
 *   else
 *     manager.collapsePanel(slot.value.panel)
 * }
 * ```
 *
 * Throws when called outside a `LayoutPanelSlot` descendant.
 */
export declare function useLayoutSlot(): LayoutSlotContext;
/**
 * Reactive full declaration. Use sparingly — prefer specific composables
 * to avoid unnecessary re-renders.
 */
export declare function useLayoutDeclaration(manager?: LayoutManager): Ref<LayoutDeclaration>;
