<script setup lang="ts">
/**
 * Headless service coordinator. Subscribes to the in-tab layout bus
 * and translates app-level events to `host.layout.*` mutations.
 *
 * No UI — renders a hidden div. The point of the component is the
 * onMounted/onUnmounted lifecycle for managing the subscriptions.
 *
 * State this component owns:
 *   - currentBreakpoint: tracks @layout-breakpoint to set
 *     `data-breakpoint` on <html> (so dam-header's hamburger can
 *     show only on narrow), and to branch app:detail / app:asset-clicked
 *     between updatePanel(...) (default mode) and openDrawer(...)
 *     (narrow mode).
 *   - prevMainStash: deep-clone of the main panel def at the moment
 *     of app:open-modal, so app:close-modal can restore it.
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useHost } from '@wippy-fe/webcomponent-vue'
import type { ProxyApiInstance } from '@wippy-fe/proxy'
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

let currentBreakpoint = 'default'
let prevMainStash: unknown = null
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

  // Track breakpoint. Set <html data-breakpoint> for header hamburger CSS.
  offs.push(host.layout.on('@layout-breakpoint', (env) => {
    const payload = env.payload as BreakpointPayload
    currentBreakpoint = payload.name
    setBreakpointAttr(payload.name)
  }))
  // Initial read — in case @layout-breakpoint already fired before mount.
  setBreakpointAttr(host.layout.snapshot?.activeBreakpoint ?? 'default')
  currentBreakpoint = host.layout.snapshot?.activeBreakpoint ?? 'default'

  offs.push(host.layout.on(CHANNELS.NAV, (env) => {
    const p = env.payload as NavPayload
    host.layout.updatePanel('main', { kind: 'page', id: p.page, route: p.route } as never)
  }))

  offs.push(host.layout.on(CHANNELS.DETAIL, (env) => {
    const p = env.payload as DetailPayload
    host.layout.updatePanel(p.panel, { route: p.route } as never)
    if (currentBreakpoint === 'narrow') host.layout.openDrawer(p.panel)
    else host.layout.expandPanel(p.panel)
  }))

  offs.push(host.layout.on(CHANNELS.TOGGLE_DRAWER, (env) => {
    const p = env.payload as ToggleDrawerPayload
    host.layout.toggleDrawer(p.side)
  }))

  offs.push(host.layout.on(CHANNELS.EXPAND, (env) => {
    const p = env.payload as PanelPayload
    host.layout.expandPanel(p.panel)
  }))

  offs.push(host.layout.on(CHANNELS.COLLAPSE, (env) => {
    const p = env.payload as PanelPayload
    host.layout.collapsePanel(p.panel)
  }))

  offs.push(host.layout.on(CHANNELS.OPEN_MODAL, (env) => {
    const p = env.payload as OpenModalPayload
    const snap = host.layout.snapshot
    const mainDef = snap?.panels?.main
    prevMainStash = mainDef ? JSON.parse(JSON.stringify(mainDef)) : null
    host.layout.updatePanel('main', {
      kind: 'component',
      tagName: 'dam-upload-modal-body',
      props: { 'modal-id': p.id },
    } as never)
  }))

  offs.push(host.layout.on(CHANNELS.CLOSE_MODAL, () => {
    if (prevMainStash) {
      host.layout.updatePanel('main', prevMainStash as never)
      prevMainStash = null
    }
  }))

  offs.push(host.layout.on(CHANNELS.ASSET_CLICKED, (env) => {
    const p = env.payload as AssetClickedPayload
    host.layout.updatePanel('right', { route: `/asset/${p.entityId}` } as never)
    if (currentBreakpoint === 'narrow') host.layout.openDrawer('right')
    else host.layout.expandPanel('right')
  }))

  offs.push(host.layout.on(CHANNELS.DENSITY, (env) => {
    const p = env.payload as DensityPayload
    host.layout.updatePanel('main', { props: { density: p.value } } as never)
  }))
})

onBeforeUnmount(() => {
  for (const off of offs) {
    try { off() }
    catch { /* swallow */ }
  }
  offs.length = 0
})
</script>

<template>
  <div style="display:none" data-test="dam-coordinator" />
</template>
