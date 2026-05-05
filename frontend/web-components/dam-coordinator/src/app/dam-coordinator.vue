<script setup lang="ts">
/**
 * Coordinator-as-source-of-truth pattern. This component:
 *   - subscribes to app-level events on the layout bus (via
 *     `host.layout.on`) — the inbound "actions" from other WCs
 *   - translates each event into a `LayoutManager` mutation through the
 *     privileged `getLayoutManager(host)` escape hatch
 *
 * Other WCs (toolbar / header / flap / modal-body) NEVER call layout
 * mutations directly. They `host.layout.broadcast(channel, payload)`
 * and the coordinator decides what happens. This is the Redux pattern:
 * components dispatch actions, the coordinator is the only writer.
 *
 * Modals are pre-declared in the layout YAML (`modals` block). Opening
 * is `manager.openModal('id')` — id only, no def. The pre-registered
 * template carries `tagName`, `title`, `dismissable`, `useNativeDialog`,
 * etc. so the call site reads as pure intent.
 *
 * No UI — renders a hidden div. The point of this component is the
 * onMounted/onUnmounted lifecycle for managing subscriptions.
 */
import type { LayoutManager, ProxyApiInstance, UpdatePanelLiveStateFn } from '@wippy-fe/proxy'
import { getLayoutManager, getUpdatePanelLiveState } from '@wippy-fe/proxy'
import { useHost } from '@wippy-fe/webcomponent-vue'
import { onBeforeUnmount, onMounted } from 'vue'
import { CHANNELS } from '../channels'

interface NavPayload { page: string, route: string }
interface DetailPayload { panel: 'left' | 'right', route: string }
interface ToggleDrawerPayload { side: 'left' | 'right' }
interface PanelPayload { panel: string }
interface OpenModalPayload { id: string }
interface AssetClickedPayload { entityId: string }
interface DensityPayload { value: 'compact' | 'comfy' | 'spacious' }
interface BreakpointPayload { name: string, width: number }

const host = useHost<ProxyApiInstance['host']>()

let manager: LayoutManager | null = null
let updatePanel: UpdatePanelLiveStateFn | null = null
let currentBreakpoint = 'default'
const offs: Array<() => void> = []

function setBreakpointAttr(name: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-breakpoint', name)
  }
}

onMounted(() => {
  if (!host) {
    // eslint-disable-next-line no-console
    console.warn('[dam-coordinator] no host — running outside managed-layout')
    return
  }

  manager = getLayoutManager<LayoutManager>(host)
  if (!manager) {
    // eslint-disable-next-line no-console
    console.warn('[dam-coordinator] no LayoutManager — coordinator-paradigm mutations will not work')
  }
  // `updatePanel` is the host-shape patcher (route / kind / id /
  // title / props). Pure `manager.updatePanel` only accepts
  // `Partial<PanelDef>`; this companion runs the host-side path that
  // re-resolves content + re-applies wires.
  updatePanel = getUpdatePanelLiveState(host)

  // Track breakpoint. Set <html data-breakpoint> for header hamburger CSS.
  offs.push(host.layout.on('@layout-breakpoint', (env) => {
    const payload = env.payload as BreakpointPayload
    currentBreakpoint = payload.name
    setBreakpointAttr(payload.name)
  }))
  // Initial read — in case @layout-breakpoint already fired before mount.
  // Prefer reading from the LayoutManager directly (truthful sync access)
  // over `host.layout.snapshot` which historically returned stale data
  // for host-mounted callers.
  const initialBp = manager?.activeBreakpoint ?? 'default'
  setBreakpointAttr(initialBp)
  currentBreakpoint = initialBp

  offs.push(host.layout.on(CHANNELS.NAV, (env) => {
    const p = env.payload as NavPayload
    // Host-shape patch: kind / id / route are HostPanelDef fields,
    // not PanelDef fields. Use the host-side patcher so the
    // declaration is mutated and content resolvers re-read it.
    updatePanel?.('main', { kind: 'page', id: p.page, route: p.route })
  }))

  offs.push(host.layout.on(CHANNELS.DETAIL, (env) => {
    const p = env.payload as DetailPayload
    updatePanel?.(p.panel, { route: p.route })
    // Sides are drawers in any non-wide layout (default = mobile).
    if (currentBreakpoint !== 'wide')
      manager?.openDrawer(p.panel)
    else
      manager?.expandPanel(p.panel)
  }))

  offs.push(host.layout.on(CHANNELS.TOGGLE_DRAWER, (env) => {
    const p = env.payload as ToggleDrawerPayload
    manager?.toggleDrawer(p.side)
  }))

  offs.push(host.layout.on(CHANNELS.EXPAND, (env) => {
    const p = env.payload as PanelPayload
    manager?.expandPanel(p.panel)
  }))

  offs.push(host.layout.on(CHANNELS.COLLAPSE, (env) => {
    const p = env.payload as PanelPayload
    manager?.collapsePanel(p.panel)
  }))

  offs.push(host.layout.on(CHANNELS.OPEN_MODAL, (env) => {
    const p = env.payload as OpenModalPayload
    // Modal id is pre-declared in the layout YAML's `modals` block.
    // The manager looks up the registered template — no def needed at
    // the call site.
    manager?.openModal(p.id)
  }))

  offs.push(host.layout.on(CHANNELS.CLOSE_MODAL, (env) => {
    const p = env.payload as OpenModalPayload
    manager?.closeModal(p.id)
  }))

  offs.push(host.layout.on(CHANNELS.ASSET_CLICKED, (env) => {
    const p = env.payload as AssetClickedPayload
    updatePanel?.('right', { route: `/asset/${p.entityId}` })
    if (currentBreakpoint !== 'wide')
      manager?.openDrawer('right')
    else
      manager?.expandPanel('right')
  }))

  offs.push(host.layout.on(CHANNELS.DENSITY, (env) => {
    const p = env.payload as DensityPayload
    // Although `props` IS a PanelDef field, route through the
    // host-shape patcher so the host declaration stays in sync with
    // the resolved panel def. The shallow-merge of `props` is part
    // of the updatePanelLiveState contract.
    updatePanel?.('main', { props: { density: p.value } })
  }))
})

onBeforeUnmount(() => {
  for (const off of offs) {
    try { off() }
    catch { /* swallow */ }
  }
  offs.length = 0
  manager = null
  updatePanel = null
  currentBreakpoint = 'default'
})
</script>

<template>
  <div
    style="display:none"
    data-test="dam-coordinator"
  />
</template>
