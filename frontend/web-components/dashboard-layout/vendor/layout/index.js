import './style.css';
import { inject as Me, ref as Y, onBeforeUnmount as le, shallowRef as Pe, defineComponent as se, computed as x, watch as re, openBlock as z, createElementBlock as P, normalizeStyle as de, normalizeClass as me, toDisplayString as be, createCommentVNode as ne, provide as Ke, renderSlot as lt, createElementVNode as X, withModifiers as qe, createVNode as ve, withCtx as Le, createBlock as ee, resolveDynamicComponent as we, normalizeProps as Re, guardReactiveProps as Oe, Fragment as pe, onMounted as Fe, reactive as Se, resolveComponent as st, renderList as ge, unref as He, mergeProps as ut, Teleport as Ve, getCurrentScope as ct, onScopeDispose as dt } from "vue";
import { createNanoEvents as ft } from "nanoevents";
const pt = /* @__PURE__ */ Symbol("LayoutManager"), Ge = /* @__PURE__ */ Symbol("LayoutSlot"), je = /* @__PURE__ */ Symbol("LayoutAnchorRegistry");
function Ie() {
  const t = Me(pt);
  if (!t)
    throw new Error("[@wippy-fe/layout] useLayout() called outside a LayoutManager provider");
  return t;
}
function Qe(t) {
  const e = t ?? Ie(), n = Y(e.activeBreakpoint), a = e.on("breakpoint", ({ name: i }) => {
    n.value = i;
  });
  return le(() => a()), n;
}
function $n(t, e) {
  const n = e ?? Ie(), a = Pe(n.getLayout().panels[t] ?? null), i = n.on("change", (o) => {
    a.value = o.panels[t] ?? null;
  });
  return le(() => i()), a;
}
function Sn(t, e) {
  const n = e ?? Ie(), a = Pe(
    n.getLayout().floating?.[t] ?? null
  ), i = n.on("change", (o) => {
    a.value = o.floating?.[t] ?? null;
  });
  return le(() => i()), a;
}
function En() {
  const t = Me(Ge);
  if (!t)
    throw new Error("[@wippy-fe/layout] useLayoutSlot() called outside a LayoutPanelSlot");
  return t;
}
function _n(t) {
  const e = t ?? Ie(), n = Pe(e.getLayout()), a = e.on("change", (i) => {
    n.value = i;
  });
  return le(() => a()), n;
}
function Ze(t) {
  return `--wippy-panel-${t.replace(/[^\w-]/g, "-")}`;
}
const mt = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280
}, ht = {
  separatorDrag: !0,
  panelDrag: !1,
  tabs: !1,
  floating: !0,
  modals: !0
};
class q extends Error {
  constructor(e) {
    super(`[@wippy-fe/layout] validation failed:
${e.map((n) => `  - ${n.message}`).join(`
`)}`), this.issues = e, this.name = "LayoutValidationError";
  }
  issues;
}
function oe(t) {
  return typeof t.panel == "string";
}
function Je(t) {
  return Array.isArray(t.children);
}
const gt = /* @__PURE__ */ new Set([
  "inline",
  "drawer-left",
  "drawer-right",
  "drawer-bottom"
]), yt = /* @__PURE__ */ new Set(["default", "none", "line"]);
function et(t) {
  return t.display === void 0 || t.display === "inline";
}
function vt(t, e) {
  const n = !!t && oe(t) && !t.fixed && !t.collapsed, a = !!e && oe(e) && !e.fixed && !e.collapsed;
  return n || a;
}
function Ee(t) {
  return !et(t);
}
const wt = /^(?:auto|\d+(?:\.\d+)?(?:fr|px|%))$/, bt = /^\d+(?:\.\d+)?px$/;
function _e(t) {
  if (!t)
    return null;
  if (t === "auto")
    return { unit: "auto" };
  const e = /^(\d+(?:\.\d+)?)(fr|px|%)$/.exec(t);
  return e ? { unit: e[2], value: Number.parseFloat(e[1]) } : null;
}
function xt(t) {
  if (!t)
    return null;
  const e = /^(\d+(?:\.\d+)?)px$/.exec(t);
  return e ? Number.parseFloat(e[1]) : null;
}
function We(t) {
  return wt.test(t);
}
function ke(t) {
  return bt.test(t);
}
function ie(t, e, n, a = []) {
  n?.(t, a), t.children.forEach((i, o) => {
    const c = [...a, o];
    oe(i) ? e(i, c) : ie(i, e, n, c);
  });
}
function kt(t) {
  const e = [];
  if (!t.layouts?.default)
    return e.push({
      kind: "empty-tree",
      message: "layouts.default is required"
    }), e;
  const n = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Map();
  for (const [i, o] of Object.entries(t.layouts)) {
    if (!o)
      continue;
    if (o.children.length === 0) {
      e.push({
        kind: "empty-tree",
        message: `layouts.${i} has no children`
      });
      continue;
    }
    const c = /* @__PURE__ */ new Set(), g = [];
    ie(o, () => {
    }, (r, v) => {
      v.length > 0 && r.size !== void 0 && !We(r.size) && e.push({
        kind: "bad-size",
        message: `nested tree at layouts.${i}[${v.join("][")}] has invalid size "${r.size}" (must be auto, Nfr, Npx, or N% — e.g. "1fr", "320px", "50%", "auto")`
      });
    }), ie(o, (r) => {
      n.add(r.panel), c.has(r.panel) ? g.push(r.panel) : c.add(r.panel);
      const v = r.display;
      v !== void 0 && !gt.has(v) && e.push({
        kind: "bad-display",
        message: `panel "${r.panel}" in layouts.${i} has invalid display "${v}" (expected one of: inline, drawer-left, drawer-right, drawer-bottom)`,
        panelId: r.panel
      });
      const f = r.dividerBefore;
      f !== void 0 && !yt.has(f) && e.push({
        kind: "bad-divider",
        message: `panel "${r.panel}" in layouts.${i} has invalid dividerBefore "${f}" (expected one of: default, none, line)`,
        panelId: r.panel
      }), r.borderBefore !== void 0 && typeof r.borderBefore != "boolean" && e.push({
        kind: "bad-border-before",
        message: `panel "${r.panel}" in layouts.${i} has invalid borderBefore "${r.borderBefore}" (expected boolean)`,
        panelId: r.panel
      }), et(r) ? (r.size === void 0 ? e.push({
        kind: "missing-size",
        message: `panel "${r.panel}" in layouts.${i} is missing required size (inline slots must declare size)`,
        panelId: r.panel
      }) : We(r.size) || e.push({
        kind: "bad-size",
        message: `panel "${r.panel}" in layouts.${i} has invalid size "${r.size}" (must be auto, Nfr, Npx, or N% — e.g. "1fr", "200px", "50%", "auto")`,
        panelId: r.panel
      }), r.minSize && !ke(r.minSize) && e.push({
        kind: "bad-size",
        message: `panel "${r.panel}" in layouts.${i} has invalid minSize "${r.minSize}" (must be Npx, e.g. "200px")`,
        panelId: r.panel
      }), r.maxSize && !ke(r.maxSize) && e.push({
        kind: "bad-size",
        message: `panel "${r.panel}" in layouts.${i} has invalid maxSize "${r.maxSize}" (must be Npx, e.g. "800px")`,
        panelId: r.panel
      })) : (r.drawerSize?.width && !ke(r.drawerSize.width) && e.push({
        kind: "bad-size",
        message: `panel "${r.panel}" in layouts.${i} has invalid drawerSize.width "${r.drawerSize.width}" (must be Npx)`,
        panelId: r.panel
      }), r.drawerSize?.height && !ke(r.drawerSize.height) && e.push({
        kind: "bad-size",
        message: `panel "${r.panel}" in layouts.${i} has invalid drawerSize.height "${r.drawerSize.height}" (must be Npx)`,
        panelId: r.panel
      }));
    }), g.length > 0 && a.set(i, g);
  }
  for (const [i, o] of a)
    e.push({
      kind: "duplicate-id",
      message: `layouts.${i} references panels ${o.map((c) => `"${c}"`).join(", ")} more than once — each panel can only appear once per breakpoint layout`,
      panelIds: o
    });
  for (const i of n)
    t.panels[i] || e.push({
      kind: "orphan-ref",
      message: `panel id "${i}" is referenced in a layout but not declared in panels map`,
      panelId: i
    });
  if (t.breakpoints)
    for (const [i, o] of Object.entries(t.breakpoints))
      (typeof o != "number" || o <= 0) && e.push({
        kind: "unknown-breakpoint",
        message: `breakpoint "${i}" has invalid threshold "${String(o)}" — must be a positive number`
      });
  return e;
}
function Xe(t) {
  const e = kt(t);
  if (e.length > 0)
    throw new q(e);
}
function Te(t, e) {
  const n = [];
  if (e === null || typeof e != "object" || Array.isArray(e) ? n.push({
    kind: "bad-modal-def",
    message: `[@wippy-fe/layout] modal "${t}": def must be a plain object`
  }) : e.component || n.push({
    kind: "bad-modal-def",
    message: `[@wippy-fe/layout] modal "${t}": def.component is required`
  }), n.length > 0)
    throw new q(n);
}
const ze = {
  width: "500px",
  height: "auto",
  maxWidth: "90vw",
  maxHeight: "90vh"
};
function zt(t, e) {
  if (!t)
    return;
  if (typeof t.width == "string")
    return t;
  const n = t;
  return n[e] ?? n.default;
}
function tt(t, e) {
  const n = zt(t, e);
  return {
    width: n?.width ?? ze.width,
    height: n?.height ?? ze.height,
    maxWidth: n?.maxWidth ?? ze.maxWidth,
    maxHeight: ze.maxHeight
  };
}
function $t(t, e) {
  const n = { ...mt, ...e.breakpoints ?? {} }, a = Object.entries(n).filter(([i]) => e.layouts[i]).sort((i, o) => o[1] - i[1]);
  for (const [i, o] of a)
    if (t >= o)
      return i;
  return "default";
}
function St(t) {
  let e = null;
  return ie(t.layouts.default, (n) => {
    e || (e = n);
  }), e ? {
    direction: "vertical",
    children: [
      { panel: e.panel, size: "1fr", fixed: !0 }
    ]
  } : { direction: "vertical", children: [] };
}
function ue(t, e) {
  for (let n = 0; n < t.children.length; n++) {
    const a = t.children[n];
    if (oe(a) && a.panel === e)
      return { parent: t, index: n };
    if (Je(a)) {
      const i = ue(a, e);
      if (i)
        return i;
    }
  }
  return null;
}
function nt(t, e) {
  const n = ue(t, e);
  if (!n)
    return null;
  const [a] = n.parent.children.splice(n.index, 1);
  return at(t), a;
}
function at(t) {
  t.children = t.children.filter((e) => Je(e) ? (at(e), e.children.length > 0) : !0);
}
function it(t, e, n) {
  if (!n.relativeTo) {
    t.children.push(e);
    return;
  }
  const a = ue(t, n.relativeTo);
  if (!a) {
    t.children.push(e);
    return;
  }
  const { parent: i, index: o } = a, c = n.position;
  if (c === "center") {
    i.children.splice(o, 1, e);
    return;
  }
  const g = c === "left" || c === "right", r = c === "top" || c === "bottom", v = c === "left" || c === "top", f = i.direction === "horizontal", d = i.direction === "vertical";
  if (g && f || r && d) {
    const K = v ? o : o + 1;
    i.children.splice(K, 0, e);
    return;
  }
  const w = i.children[o], C = { direction: g ? "horizontal" : "vertical", children: v ? [e, w] : [w, e] };
  i.children.splice(o, 1, C);
}
function Et(t, e, n) {
  if (n.relativeTo === e)
    throw new Error(`[@wippy-fe/layout] cannot move panel "${e}" relative to itself`);
  const a = nt(t, e);
  a && it(t, a, n);
}
function Ce(t) {
  return {
    layouts: Pt(t.layouts),
    breakpoints: t.breakpoints ? { ...t.breakpoints } : void 0,
    panels: _t(t.panels),
    floating: t.floating ? Dt(t.floating) : void 0,
    modals: t.modals ? Mt(t.modals) : void 0,
    dragEnabled: t.dragEnabled
  };
}
function _t(t) {
  const e = {};
  for (const [n, a] of Object.entries(t))
    e[n] = {
      ...a,
      props: a.props ? { ...a.props } : void 0
    };
  return e;
}
function Dt(t) {
  const e = {};
  for (const [n, a] of Object.entries(t))
    e[n] = {
      ...a,
      position: { ...a.position },
      size: { ...a.size },
      minSize: a.minSize ? { ...a.minSize } : void 0,
      maxSize: a.maxSize ? { ...a.maxSize } : void 0,
      props: a.props ? { ...a.props } : void 0
    };
  return e;
}
function Mt(t) {
  const e = {};
  for (const [n, a] of Object.entries(t)) {
    const i = a.size;
    let o;
    if (!i)
      o = void 0;
    else if ("width" in i && typeof i.width == "string")
      o = { ...i };
    else {
      const c = [];
      for (const [g, r] of Object.entries(i))
        c.push([g, { ...r }]);
      o = Object.fromEntries(c);
    }
    e[n] = {
      ...a,
      size: o,
      props: a.props ? { ...a.props } : void 0
    };
  }
  return e;
}
function Pt(t) {
  const e = {};
  for (const [n, a] of Object.entries(t))
    e[n] = ot(a);
  return e;
}
function ot(t) {
  return {
    ...t,
    children: t.children.map((e) => oe(e) ? Lt(e) : ot(e))
  };
}
function Lt(t) {
  return {
    ...t,
    drawerSize: t.drawerSize ? { ...t.drawerSize } : void 0
  };
}
class Dn {
  decl;
  emitter;
  _activeBreakpoint = "default";
  capabilities;
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
  modalRegistry = /* @__PURE__ */ new Map();
  constructor(e, n) {
    if (this.capabilities = { ...ht, ...n ?? {} }, this.capabilities.panelDrag)
      throw new q([{
        kind: "capability-reserved",
        message: "[@wippy-fe/layout] capabilities.panelDrag is reserved for a future release. Set it to false or omit it."
      }]);
    if (this.capabilities.tabs)
      throw new q([{
        kind: "capability-reserved",
        message: "[@wippy-fe/layout] capabilities.tabs is reserved for a future release. Set it to false or omit it."
      }]);
    if (Xe(e), this.decl = Ce(e), this.decl.modals) {
      for (const [a, i] of Object.entries(this.decl.modals))
        Te(a, i), this.modalRegistry.set(a, i);
      this.decl.modals = {};
    }
    this.emitter = ft();
  }
  // ────────────────────────────────────────────────────────────────
  // Full-declaration accessors
  // ────────────────────────────────────────────────────────────────
  /**
   * Returns a deep clone of the current declaration. Safe to mutate
   * by the caller (won't affect manager state).
   */
  getLayout() {
    return Ce(this.decl);
  }
  /** Approved metadata for declared modal templates, including closed modals. */
  getRegisteredModals() {
    return [...this.modalRegistry].map(([e, n]) => ({ id: e, ...n.title ? { title: n.title } : {} }));
  }
  /**
   * Replace the full declaration atomically. Validates + clones +
   * emits `change` once.
   */
  setLayout(e) {
    Xe(e), this.decl = Ce(e), this.emitChange();
  }
  /**
   * Active breakpoint name. Updated by the renderer via setActiveBreakpoint.
   */
  get activeBreakpoint() {
    return this._activeBreakpoint;
  }
  /**
   * Set by the renderer when the container width crosses a threshold.
   * Emits `breakpoint` if the name changed.
   */
  setActiveBreakpoint(e, n) {
    this._activeBreakpoint !== e && (this._activeBreakpoint = e, this.emitter.emit("breakpoint", { name: e, width: n }));
  }
  // ────────────────────────────────────────────────────────────────
  // Panel mutations (affect all breakpoint layouts that reference the id)
  // ────────────────────────────────────────────────────────────────
  /**
   * Add a panel to the layout. Inserts into the `default` breakpoint at
   * the specified target. Other breakpoint layouts are untouched — if
   * a breakpoint should include the new panel, the consumer should
   * subsequently edit that breakpoint layout via setLayout.
   */
  addPanel(e, n, a) {
    if (this.decl.panels[e])
      throw new Error(`[@wippy-fe/layout] panel "${e}" already exists`);
    const i = {
      panel: e,
      size: a.size ?? "1fr"
    };
    this.decl.panels[e] = n, it(this.decl.layouts.default, i, a), this.emitChange();
  }
  /**
   * Remove a panel from every breakpoint layout + from the panels map.
   */
  removePanel(e) {
    if (this.decl.panels[e]) {
      for (const n of Object.values(this.decl.layouts))
        n && nt(n, e);
      delete this.decl.panels[e], this.emitChange();
    }
  }
  /**
   * Patch a panel's PanelDef (component / props / title / icon).
   * Replaces fields listed in the patch; other fields preserved.
   */
  updatePanel(e, n) {
    const a = this.decl.panels[e];
    if (!a)
      throw new Error(`[@wippy-fe/layout] panel "${e}" not found`);
    this.decl.panels[e] = { ...a, ...n }, this.emitChange();
  }
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
  resizePanel(e, n) {
    if (!this.decl.panels[e])
      throw new q([{
        kind: "unknown-panel-id",
        message: `[@wippy-fe/layout] resizePanel: panel "${e}" does not exist`,
        panelId: e
      }]);
    const a = this.decl.layouts[this.getActiveLayoutName()];
    if (!a)
      return;
    const i = ue(a, e);
    if (!i)
      return;
    const o = i.parent.children[i.index];
    o.size = n, this.emitChange(), this.emitter.emit("drag", {
      panel: e,
      delta: 0,
      direction: i.parent.direction
    });
  }
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
  resizePanelPair(e, n, a, i) {
    if (!this.decl.panels[e])
      throw new q([{
        kind: "unknown-panel-id",
        message: `[@wippy-fe/layout] resizePanelPair: panel "${e}" does not exist`,
        panelId: e
      }]);
    if (!this.decl.panels[a])
      throw new q([{
        kind: "unknown-panel-id",
        message: `[@wippy-fe/layout] resizePanelPair: panel "${a}" does not exist`,
        panelId: a
      }]);
    const o = this.decl.layouts[this.getActiveLayoutName()];
    if (!o)
      return;
    const c = ue(o, e), g = ue(o, a);
    if (!c && !g)
      return;
    let r = !1, v = null;
    if (c) {
      const f = c.parent.children[c.index];
      f.size = `${Math.round(n)}px`, v = c.parent.direction, r = !0;
    }
    if (g) {
      const f = g.parent.children[g.index];
      f.size = `${Math.round(i)}px`, v = v ?? g.parent.direction, r = !0;
    }
    r && (this.emitChange(), v && this.emitter.emit("drag", {
      panel: e,
      delta: 0,
      direction: v
    }));
  }
  /**
   * Collapse a panel (sets `collapsed: true` on its slot in the active layout).
   * Throws if `id` is unknown; no-op if the panel's slot is not
   * `collapsible` or already in the desired state.
   */
  collapsePanel(e) {
    this.setCollapsed(e, !0, "collapsePanel");
  }
  /**
   * Expand a collapsed panel. Same error contract as `collapsePanel`.
   */
  expandPanel(e) {
    this.setCollapsed(e, !1, "expandPanel");
  }
  setCollapsed(e, n, a) {
    if (!this.decl.panels[e])
      throw new q([{
        kind: "unknown-panel-id",
        message: `[@wippy-fe/layout] ${a}: panel "${e}" does not exist`,
        panelId: e
      }]);
    const i = this.decl.layouts[this.getActiveLayoutName()];
    if (!i)
      return;
    const o = ue(i, e);
    if (!o)
      return;
    const c = o.parent.children[o.index];
    c.collapsible && c.collapsed !== n && (c.collapsed = n, this.emitChange());
  }
  /**
   * Move a panel to a new position within the active breakpoint layout.
   * Programmatic API — UI layer deferred to capabilities.panelDrag.
   *
   * Throws if `id` is unknown; no-op if the panel isn't in the active
   * breakpoint's tree.
   */
  movePanel(e, n) {
    if (!this.decl.panels[e])
      throw new q([{
        kind: "unknown-panel-id",
        message: `[@wippy-fe/layout] movePanel: panel "${e}" does not exist`,
        panelId: e
      }]);
    const a = this.decl.layouts[this.getActiveLayoutName()];
    a && (Et(a, e, n), this.emitChange());
  }
  // ────────────────────────────────────────────────────────────────
  // Floating panels
  // ────────────────────────────────────────────────────────────────
  addFloating(e, n) {
    if (!this.capabilities.floating)
      throw new Error("[@wippy-fe/layout] capabilities.floating is disabled");
    if (this.decl.floating?.[e])
      throw new q([{
        kind: "duplicate-floating-id",
        message: `[@wippy-fe/layout] addFloating: floating panel "${e}" already exists; call updateFloating to patch it or removeFloating first`
      }]);
    this.decl.floating = this.decl.floating ?? {}, this.decl.floating[e] = n, this.emitChange();
  }
  removeFloating(e) {
    this.decl.floating?.[e] && (delete this.decl.floating[e], this.emitChange());
  }
  updateFloating(e, n) {
    const a = this.decl.floating?.[e];
    if (!a)
      throw new Error(`[@wippy-fe/layout] floating panel "${e}" not found`);
    this.decl.floating = this.decl.floating ?? {}, this.decl.floating[e] = { ...a, ...n }, this.emitChange();
  }
  // ────────────────────────────────────────────────────────────────
  // Drawer-mode panels
  // ────────────────────────────────────────────────────────────────
  /**
   * Open a panel's drawer overlay. Only meaningful when the panel's
   * active layout slot has `display: 'drawer-*'` — for inline slots,
   * the open state is set but has no visible effect (the renderer
   * ignores `drawerOpen` on inline slots).
   *
   * No-op if the panel id doesn't exist or if the drawer is already open.
   */
  openDrawer(e) {
    this.setDrawerOpen(e, !0, "openDrawer");
  }
  /**
   * Close a panel's drawer overlay. Same contract as `openDrawer`.
   */
  closeDrawer(e) {
    this.setDrawerOpen(e, !1, "closeDrawer");
  }
  /**
   * Flip a panel's drawer open state.
   */
  toggleDrawer(e) {
    const n = this.decl.panels[e];
    if (!n)
      throw new q([{
        kind: "unknown-panel-id",
        message: `[@wippy-fe/layout] toggleDrawer: panel "${e}" does not exist`,
        panelId: e
      }]);
    this.setDrawerOpen(e, !n.drawerOpen, "toggleDrawer");
  }
  setDrawerOpen(e, n, a) {
    const i = this.decl.panels[e];
    if (!i)
      throw new q([{
        kind: "unknown-panel-id",
        message: `[@wippy-fe/layout] ${a}: panel "${e}" does not exist`,
        panelId: e
      }]);
    i.drawerOpen !== n && (this.decl.panels[e] = { ...i, drawerOpen: n }, this.emitChange());
  }
  // ────────────────────────────────────────────────────────────────
  // Modals
  // ────────────────────────────────────────────────────────────────
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
  openModal(e, n) {
    if (!this.capabilities.modals)
      throw new Error("[@wippy-fe/layout] capabilities.modals is disabled");
    if (this.decl.modals?.[e])
      throw new q([{
        kind: "duplicate-modal-id",
        message: `[@wippy-fe/layout] openModal: modal "${e}" already open; close it first or use a different id`
      }]);
    n && Te(e, n);
    const a = n ?? this.modalRegistry.get(e);
    if (!a)
      throw new q([{
        kind: "unknown-modal-id",
        message: `[@wippy-fe/layout] openModal: no modal registered under "${e}". Pass a def or pre-register via the initial declaration's "modals" block / registerModal(id, def).`
      }]);
    n && this.modalRegistry.set(e, n), this.decl.modals = this.decl.modals ?? {}, this.decl.modals[e] = a, this.emitChange();
  }
  /**
   * Pre-register a modal template. After this, `openModal(id)` (no def)
   * will use the registered shape. Re-registering an id replaces the
   * previous template; existing open modals are NOT affected (they
   * continue rendering with the def they were opened with).
   */
  registerModal(e, n) {
    Te(e, n), this.modalRegistry.set(e, n);
  }
  closeModal(e) {
    this.decl.modals?.[e] && (delete this.decl.modals[e], this.emitChange());
  }
  // ────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────
  on(e, n) {
    return this.emitter.on(e, n);
  }
  /**
   * Fire a `change` event without mutating state. For host layers that
   * maintain their own side-state (e.g. live panel routes, sessionIds)
   * on top of the declaration and want `change` subscribers to re-emit
   * the snapshot after a side-state write. Microtask-coalesced like
   * every other mutation — safe to call in rapid bursts.
   */
  touch() {
    this.emitChange();
  }
  emitChangeQueued = !1;
  emitChange() {
    this.emitChangeQueued || (this.emitChangeQueued = !0, queueMicrotask(() => {
      this.emitChangeQueued = !1, this.emitter.emit("change", this.getLayout());
    }));
  }
  // ────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────
  getActiveLayoutName() {
    return this.decl.layouts[this._activeBreakpoint] ? this._activeBreakpoint : "default";
  }
  /**
   * Iterate over every slot in the active layout (for rendering/debug).
   */
  forEachActiveSlot(e) {
    const n = this.decl.layouts[this.getActiveLayoutName()];
    n && ie(n, (a, i) => {
      const o = ue(n, a.panel);
      o && e(a, o.parent);
    });
  }
}
const It = ["aria-hidden", "data-wippy-panel", "data-wippy-drawer"], At = {
  key: 0,
  class: "wippy-layout-drawer__missing"
}, Tt = "320px", Ct = "320px", Bt = /* @__PURE__ */ se({
  __name: "LayoutDrawerAnchor",
  props: {
    slotDef: {},
    manager: {}
  },
  setup(t) {
    const e = t, n = x(() => e.manager.getLayout().panels[e.slotDef.panel]), a = x(() => !!n.value?.drawerOpen), i = Me(je, null), o = Y(null);
    re(
      () => [o.value, e.slotDef.panel],
      ([r, v], f, d) => {
        !i || !r || (i[v] = r, d(() => {
          i[v] === r && (i[v] = null);
        }));
      },
      { immediate: !0, flush: "post" }
    ), le(() => {
      if (!i)
        return;
      const r = e.slotDef.panel;
      i[r] === o.value && (i[r] = null);
    });
    const c = x(() => {
      const r = e.slotDef.display ?? "inline", v = e.slotDef.drawerSize?.width ?? Tt, f = e.slotDef.drawerSize?.height ?? Ct, d = {};
      return r === "drawer-left" || r === "drawer-right" ? (d.width = v, d.maxWidth = "100%", d.top = "0", d.bottom = "0", d[r === "drawer-left" ? "left" : "right"] = "0") : r === "drawer-bottom" && (d.height = f, d.maxHeight = "100%", d.left = "0", d.right = "0", d.bottom = "0"), d;
    }), g = x(() => e.slotDef.display ?? "inline");
    return (r, v) => (z(), P("div", {
      ref_key: "anchorEl",
      ref: o,
      class: me(["wippy-layout-drawer", [
        `wippy-layout-drawer--${g.value}`,
        a.value && "wippy-layout-drawer--open"
      ]]),
      style: de(c.value),
      "aria-hidden": !a.value,
      "data-wippy-panel": t.slotDef.panel,
      "data-wippy-drawer": g.value,
      role: "dialog"
    }, [
      n.value ? ne("", !0) : (z(), P("div", At, ' Missing panel: "' + be(t.slotDef.panel) + '" ', 1))
    ], 14, It));
  }
}), fe = (t, e) => {
  const n = t.__vccOpts || t;
  for (const [a, i] of e)
    n[a] = i;
  return n;
}, Nt = /* @__PURE__ */ fe(Bt, [["__scopeId", "data-v-af748d99"]]);
function Ye(t, e) {
  re(t, (n, a, i) => {
    const o = e();
    o?.(n), i(() => o?.(null));
  }, { immediate: !0, flush: "post" });
}
const De = "__wippyLayoutPriorPE";
let ye = null, $e = null;
function Rt() {
  if (ye)
    return ye;
  const t = document.createElement("style");
  return t.setAttribute("data-wippy-layout-cursor", ""), document.head.appendChild(t), ye = t, t;
}
function Ot(t) {
  const e = Rt();
  e.textContent = `* { cursor: ${t} !important; }`;
}
function Ft() {
  ye && (ye.textContent = "");
}
function rt() {
  const t = [];
  function e(n) {
    for (const a of Array.from(n.querySelectorAll("iframe")))
      t.push(a);
    for (const a of Array.from(n.querySelectorAll("*"))) {
      const i = a.shadowRoot;
      i && e(i);
    }
  }
  return e(document), t;
}
function jt() {
  for (const t of rt()) {
    const e = t;
    e[De] === void 0 && (e[De] = e.style.pointerEvents), e.style.pointerEvents = "none";
  }
}
function Yt() {
  for (const t of rt()) {
    const e = t, n = e[De];
    n !== void 0 && (e.style.pointerEvents = n, delete e[De]);
  }
}
function Ne(t) {
  $e && $e.endFn(), jt(), Ot(t.cursor);
  let e = !1;
  const n = (c) => {
    if (!e) {
      e = !0;
      try {
        t.captureTarget.setPointerCapture(t.pointerId);
      } catch {
      }
    }
    t.onMove(c);
  };
  let a = !1;
  function i() {
    if (!a) {
      if (a = !0, $e = null, document.removeEventListener("pointermove", n), document.removeEventListener("pointerup", o), document.removeEventListener("pointercancel", o), window.removeEventListener("blur", o), Yt(), Ft(), e)
        try {
          t.captureTarget.releasePointerCapture(t.pointerId);
        } catch {
        }
      t.onEnd();
    }
  }
  function o() {
    i();
  }
  return document.addEventListener("pointermove", n), document.addEventListener("pointerup", o), document.addEventListener("pointercancel", o), window.addEventListener("blur", o), $e = { endFn: i }, i;
}
const Ae = /* @__PURE__ */ se({
  __name: "PanelSlotContext",
  props: {
    panelId: {},
    tree: {},
    manager: {},
    presented: { type: Boolean }
  },
  setup(t) {
    const e = t, n = x(() => {
      let a = null;
      return ie(e.tree, (i) => {
        i.panel === e.panelId && (a = i);
      }), a ?? { panel: e.panelId, size: "1fr" };
    });
    return Ke(Ge, {
      slot: n,
      presented: x(() => e.presented ?? !0),
      manager: e.manager
    }), (a, i) => lt(a.$slots, "default");
  }
}), Ht = ["data-wippy-floating", "role", "aria-label"], Vt = { class: "wippy-layout-floating__title" }, Wt = { class: "wippy-layout-floating__content" }, Be = 40, Xt = /* @__PURE__ */ se({
  __name: "LayoutFloating",
  props: {
    id: {},
    def: {},
    manager: {},
    stackIndex: {},
    attentionElement: { type: Function }
  },
  setup(t) {
    const e = t, n = Y(null);
    Ye(n, () => e.attentionElement);
    const a = Y(!1), i = Y(e.def.position.x), o = Y(e.def.position.y), c = Y(e.def.size.width), g = Y(e.def.size.height);
    function r(p, l, k, W) {
      const j = window.innerWidth - Be, A = window.innerHeight - Be, N = -(k - Be);
      return {
        x: Math.max(N, Math.min(j, p)),
        y: Math.max(0, Math.min(A, l))
      };
    }
    function v(p, l) {
      const k = e.def.minSize?.width ?? 160, W = e.def.minSize?.height ?? 100, j = e.def.maxSize?.width ?? window.innerWidth, A = e.def.maxSize?.height ?? window.innerHeight;
      return {
        width: Math.max(k, Math.min(j, p)),
        height: Math.max(W, Math.min(A, l))
      };
    }
    function f(p) {
      switch (p) {
        case "move":
          return "grabbing";
        case "n":
        case "s":
          return "ns-resize";
        case "e":
        case "w":
          return "ew-resize";
        case "ne":
        case "sw":
          return "nesw-resize";
        case "nw":
        case "se":
          return "nwse-resize";
      }
    }
    function d(p, l) {
      if (p.button !== 0)
        return;
      const k = p.currentTarget;
      p.preventDefault(), p.stopPropagation();
      const W = i.value, j = o.value, A = c.value, N = g.value, y = p.clientX, b = p.clientY;
      a.value = !0, Ne({
        cursor: f(l),
        captureTarget: k,
        pointerId: p.pointerId,
        onMove: (_) => {
          const u = _.clientX - y, S = _.clientY - b;
          let R = W, E = j, T = A, O = N;
          if (l === "move")
            R = W + u, E = j + S;
          else {
            (l === "e" || l === "ne" || l === "se") && (T = A + u), (l === "w" || l === "nw" || l === "sw") && (T = A - u, R = W + u), (l === "s" || l === "se" || l === "sw") && (O = N + S), (l === "n" || l === "ne" || l === "nw") && (O = N - S, E = j + S);
            const U = v(T, O);
            (l === "w" || l === "nw" || l === "sw") && (R = W + A - U.width), (l === "n" || l === "ne" || l === "nw") && (E = j + N - U.height), T = U.width, O = U.height;
          }
          const G = r(R, E, T);
          i.value = G.x, o.value = G.y, c.value = T, g.value = O;
        },
        onEnd: () => {
          a.value = !1, e.manager.updateFloating(e.id, {
            position: { x: i.value, y: o.value },
            size: { width: c.value, height: g.value }
          });
        }
      });
    }
    function w() {
      e.manager.removeFloating(e.id);
    }
    function L() {
      e.def.chrome !== !1 && e.manager.updateFloating(e.id, {
        zIndex: (e.def.zIndex ?? 1e3) + e.stackIndex + 1
      });
    }
    function D(p) {
      return typeof p == "number" ? `${p}px` : p;
    }
    const C = x(() => e.def.chrome !== !1), K = x(() => {
      const p = e.def.anchor;
      if (!p || C.value)
        return null;
      const l = {};
      return p.top !== void 0 && (l.top = D(p.top)), p.right !== void 0 && (l.right = D(p.right)), p.bottom !== void 0 && (l.bottom = D(p.bottom)), p.left !== void 0 && (l.left = D(p.left)), p.panel && (l["--wippy-anchor-name"] = Ze(p.panel), l["--wippy-anchor-area"] = p.area ?? "right center"), Object.keys(l).length > 0 ? l : null;
    }), B = x(() => !!e.def.anchor?.panel && !C.value), I = x(() => {
      const p = {
        zIndex: String((e.def.zIndex ?? 1e3) + e.stackIndex)
      }, l = K.value;
      if (!l)
        return p.width = `${c.value}px`, p.height = `${g.value}px`, p.left = `${i.value}px`, p.top = `${o.value}px`, p;
      const k = l.left !== void 0 && l.right !== void 0, W = l.top !== void 0 && l.bottom !== void 0;
      k || (p.width = `${c.value}px`), W || (p.height = `${g.value}px`);
      const j = { ...l };
      l.left === void 0 && l.right === void 0 && (j.left = `${i.value}px`), l.top === void 0 && l.bottom === void 0 && (j.top = `${o.value}px`);
      let A = "";
      if (l.top === "50%" && l.bottom === void 0 && (A = "translateY(-50%)"), l.left === "50%" && l.right === void 0 && (A = `${A ? `${A} ` : ""}translateX(-50%)`), !B.value)
        return A && (p.transform = A), { ...p, ...j };
      p["--wippy-anchor-name"] = l["--wippy-anchor-name"], p["--wippy-anchor-area"] = l["--wippy-anchor-area"];
      for (const N of ["top", "right", "bottom", "left"])
        j[N] !== void 0 && (p[`--wippy-anchor-${N}`] = j[N]);
      return A && (p["--wippy-anchor-transform"] = A), p;
    }), Q = x(() => e.def.title ?? e.id), H = x(() => e.def.dismissable !== !1);
    return re(
      () => [e.def.position.x, e.def.position.y, e.def.size.width, e.def.size.height],
      ([p, l, k, W]) => {
        a.value || (i.value = p, o.value = l, c.value = k, g.value = W);
      }
    ), (p, l) => (z(), P("div", {
      ref_key: "root",
      ref: n,
      class: me(["wippy-layout-floating", [a.value && "wippy-layout-floating--dragging", !C.value && "wippy-layout-floating--bare", B.value && "wippy-layout-floating--panel-anchored"]]),
      "data-wippy-floating": t.id,
      style: de(I.value),
      role: C.value ? "dialog" : void 0,
      "aria-label": C.value ? Q.value : void 0,
      tabindex: "-1",
      onMousedown: L
    }, [
      C.value ? (z(), P("div", {
        key: 0,
        class: "wippy-layout-floating__header",
        onPointerdown: l[0] || (l[0] = (k) => d(k, "move"))
      }, [
        X("span", Vt, be(Q.value), 1),
        H.value ? (z(), P("button", {
          key: 0,
          class: "wippy-layout-floating__close",
          type: "button",
          "aria-label": "Close",
          onClick: qe(w, ["stop"])
        }, " × ")) : ne("", !0)
      ], 32)) : ne("", !0),
      X("div", Wt, [
        ve(Ae, {
          "panel-id": t.id,
          tree: { direction: "vertical", children: [] },
          manager: t.manager
        }, {
          default: Le(() => [
            (z(), ee(we(t.def.component), Re(Oe(t.def.props ?? {})), null, 16))
          ]),
          _: 1
        }, 8, ["panel-id", "manager"])
      ]),
      C.value ? (z(), P(pe, { key: 1 }, [
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--n",
          onPointerdown: l[1] || (l[1] = (k) => d(k, "n"))
        }, null, 32),
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--s",
          onPointerdown: l[2] || (l[2] = (k) => d(k, "s"))
        }, null, 32),
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--e",
          onPointerdown: l[3] || (l[3] = (k) => d(k, "e"))
        }, null, 32),
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--w",
          onPointerdown: l[4] || (l[4] = (k) => d(k, "w"))
        }, null, 32),
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--ne",
          onPointerdown: l[5] || (l[5] = (k) => d(k, "ne"))
        }, null, 32),
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--nw",
          onPointerdown: l[6] || (l[6] = (k) => d(k, "nw"))
        }, null, 32),
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--se",
          onPointerdown: l[7] || (l[7] = (k) => d(k, "se"))
        }, null, 32),
        X("div", {
          class: "wippy-layout-floating__grip wippy-layout-floating__grip--sw",
          onPointerdown: l[8] || (l[8] = (k) => d(k, "sw"))
        }, null, 32)
      ], 64)) : ne("", !0)
    ], 46, Ht));
  }
}), Ut = /* @__PURE__ */ fe(Xt, [["__scopeId", "data-v-32bf50b5"]]), ce = [];
function Kt(t) {
  ce.push(t);
}
function Ue(t) {
  const e = ce.indexOf(t);
  e >= 0 && ce.splice(e, 1);
}
function qt() {
  if (ce.length === 0)
    return -1;
  let t = ce[0];
  for (let e = 1; e < ce.length; e++)
    ce[e] > t && (t = ce[e]);
  return t;
}
const Gt = ["aria-label"], Qt = {
  key: 0,
  class: "wippy-layout-modal__header"
}, Zt = { class: "wippy-layout-modal__title" }, Jt = { class: "wippy-layout-modal__content" }, en = /* @__PURE__ */ se({
  __name: "LayoutModal",
  props: {
    id: {},
    def: {},
    manager: {},
    stackIndex: {},
    attentionElement: { type: Function }
  },
  setup(t) {
    const e = t, n = Y(null);
    Ye(n, () => e.attentionElement);
    const a = x(() => e.def.dismissable !== !1), i = Qe(e.manager), o = x(
      () => tt(e.def.size, i.value)
    ), c = x(() => ({
      zIndex: String(2e3 + e.stackIndex)
    }));
    function g() {
      a.value && e.manager.closeModal(e.id);
    }
    function r() {
      g();
    }
    function v(w) {
      w.key === "Escape" && (e.stackIndex < qt() || (w.stopPropagation(), g()));
    }
    let f = null;
    function d(w) {
      f !== w && (f !== null && Ue(f), Kt(w), f = w);
    }
    return re(() => e.stackIndex, d, { immediate: !1 }), Fe(() => {
      d(e.stackIndex), window.addEventListener("keydown", v);
    }), le(() => {
      f !== null && (Ue(f), f = null), window.removeEventListener("keydown", v);
    }), (w, L) => (z(), P("div", {
      class: "wippy-layout-modal-backdrop",
      style: de(c.value),
      onClick: qe(r, ["self"])
    }, [
      X("div", {
        ref_key: "attentionRoot",
        ref: n,
        class: "wippy-layout-modal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": t.def.title ?? t.id,
        style: de(o.value),
        tabindex: "-1"
      }, [
        t.def.title ? (z(), P("header", Qt, [
          X("span", Zt, be(t.def.title), 1),
          a.value ? (z(), P("button", {
            key: 0,
            class: "wippy-layout-modal__close",
            type: "button",
            "aria-label": "Close",
            onClick: g
          }, " × ")) : ne("", !0)
        ])) : ne("", !0),
        X("div", Jt, [
          ve(Ae, {
            "panel-id": t.id,
            tree: { direction: "vertical", children: [] },
            manager: t.manager
          }, {
            default: Le(() => [
              (z(), ee(we(t.def.component), Re(Oe(t.def.props ?? {})), null, 16))
            ]),
            _: 1
          }, 8, ["panel-id", "manager"])
        ])
      ], 12, Gt)
    ], 4));
  }
}), tn = /* @__PURE__ */ fe(en, [["__scopeId", "data-v-08cbf743"]]), nn = ["aria-label", "data-stack-index"], an = {
  key: 0,
  class: "wippy-layout-modal-native__header"
}, on = { class: "wippy-layout-modal-native__title" }, rn = { class: "wippy-layout-modal-native__content" }, ln = /* @__PURE__ */ se({
  __name: "LayoutModalNative",
  props: {
    id: {},
    def: {},
    manager: {},
    stackIndex: {},
    attentionElement: { type: Function }
  },
  setup(t) {
    const e = t, n = Y(null);
    Ye(n, () => e.attentionElement);
    const a = x(() => e.def.dismissable !== !1), i = Qe(e.manager), o = x(
      () => tt(e.def.size, i.value)
    );
    function c() {
      const w = n.value;
      if (w) {
        if (typeof w.showModal != "function") {
          e.manager.closeModal(e.id);
          return;
        }
        w.open || w.showModal();
      }
    }
    function g(w) {
      a.value || w.preventDefault();
    }
    let r = !1;
    function v() {
      r || e.manager.closeModal(e.id);
    }
    function f(w) {
      a.value && w.target === n.value && n.value?.close("backdrop-click");
    }
    function d() {
      a.value && n.value?.close("close-button");
    }
    return Fe(() => {
      c();
    }), le(() => {
      const w = n.value;
      w && w.open && (r = !0, w.close("manager-close"));
    }), (w, L) => (z(), P("dialog", {
      ref_key: "dialogEl",
      ref: n,
      class: "wippy-layout-modal-native",
      "aria-label": t.def.title ?? t.id,
      style: de(o.value),
      "data-stack-index": t.stackIndex,
      onCancel: g,
      onClose: v,
      onClick: f
    }, [
      t.def.title ? (z(), P("header", an, [
        X("span", on, be(t.def.title), 1),
        a.value ? (z(), P("button", {
          key: 0,
          class: "wippy-layout-modal-native__close",
          type: "button",
          "aria-label": "Close",
          onClick: d
        }, " × ")) : ne("", !0)
      ])) : ne("", !0),
      X("div", rn, [
        ve(Ae, {
          "panel-id": t.id,
          tree: { direction: "vertical", children: [] },
          manager: t.manager
        }, {
          default: Le(() => [
            (z(), ee(we(t.def.component), Re(Oe(t.def.props ?? {})), null, 16))
          ]),
          _: 1
        }, 8, ["panel-id", "manager"])
      ])
    ], 44, nn));
  }
}), sn = /* @__PURE__ */ fe(ln, [["__scopeId", "data-v-c0d44333"]]), un = ["aria-label", "data-wippy-panel"], cn = {
  key: 0,
  class: "wippy-layout-slot__missing"
}, dn = /* @__PURE__ */ se({
  __name: "LayoutPanelSlot",
  props: {
    slotDef: {},
    direction: {},
    manager: {}
  },
  setup(t) {
    const e = t, n = x(() => e.manager.getLayout().panels[e.slotDef.panel]), a = Me(je, null), i = Y(null);
    re(
      () => [i.value, e.slotDef.panel],
      ([v, f], d, w) => {
        !a || !v || (a[f] = v, w(() => {
          a[f] === v && (a[f] = null);
        }));
      },
      { immediate: !0, flush: "post" }
    ), le(() => {
      if (!a)
        return;
      const v = e.slotDef.panel;
      a[v] === i.value && (a[v] = null);
    });
    const o = x(() => e.slotDef.collapsed ? e.slotDef.collapseSize ?? "0px" : e.slotDef.size ?? "1fr"), c = x(() => ({
      anchorName: Ze(e.slotDef.panel)
    })), g = x(() => {
      const v = o.value, f = _e(v), d = {};
      return !f || f.unit === "auto" ? d.flex = "0 0 auto" : f.unit === "fr" ? d.flex = `${f.value || 1} 1 0` : e.slotDef.fixed ? d.flex = `0 0 ${v}` : d.flex = `0 1 ${v}`, e.slotDef.minSize && !e.slotDef.collapsed && (d[e.direction === "horizontal" ? "minWidth" : "minHeight"] = e.slotDef.minSize), e.slotDef.maxSize && (d[e.direction === "horizontal" ? "maxWidth" : "maxHeight"] = e.slotDef.maxSize), d;
    }), r = x(() => n.value?.title ?? "");
    return (v, f) => (z(), P("div", {
      ref_key: "anchorEl",
      ref: i,
      class: me(["wippy-layout-slot", [
        t.slotDef.collapsed && "wippy-layout-slot--collapsed",
        t.slotDef.fixed && "wippy-layout-slot--fixed",
        t.slotDef.borderBefore && "wippy-layout-slot--border-before",
        `wippy-layout-slot--${t.direction}`
      ]]),
      style: de([g.value, c.value]),
      "aria-label": r.value || t.slotDef.panel,
      "data-wippy-panel": t.slotDef.panel
    }, [
      n.value ? ne("", !0) : (z(), P("div", cn, ' Missing panel: "' + be(t.slotDef.panel) + '" ', 1))
    ], 14, un));
  }
}), fn = /* @__PURE__ */ fe(dn, [["__scopeId", "data-v-c3900a34"]]), pn = ["data-direction", "data-before-panel", "data-after-panel", "aria-orientation", "tabindex", "aria-disabled", "aria-valuenow", "aria-valuemin", "aria-valuemax"], mn = /* @__PURE__ */ se({
  __name: "LayoutSplitter",
  props: {
    direction: {},
    before: {},
    after: {},
    beforeEl: {},
    afterEl: {},
    paint: {},
    manager: {}
  },
  setup(t) {
    const e = t, n = Y(null), a = Y(!1), i = Y(!1), o = Y(0);
    function c() {
      o.value++;
    }
    let g = null, r = null, v = 0, f = 0, d = 1, w = null, L = null, D = 0, C = 0, K = 0, B = Number.POSITIVE_INFINITY, I = 0, Q = Number.POSITIVE_INFINITY;
    function H(u, S) {
      return xt(u);
    }
    function p(u) {
      return !!u && typeof u.panel == "string";
    }
    function l(u) {
      return p(u) ? u.panel : void 0;
    }
    function k() {
      return p(e.before) && !e.before.fixed && !e.before.collapsed ? { slot: e.before, sign: 1 } : p(e.after) && !e.after.fixed && !e.after.collapsed ? { slot: e.after, sign: -1 } : null;
    }
    function W(u) {
      if (u.button !== 0 || !n.value)
        return;
      const S = p(e.before) && !e.before.fixed && !e.before.collapsed, R = p(e.after) && !e.after.fixed && !e.after.collapsed;
      if (S && R && e.beforeEl && e.afterEl) {
        j(u, e.before, e.after);
        return;
      }
      const E = k();
      if (!E)
        return;
      const T = E.sign === 1 ? e.beforeEl : e.afterEl;
      if (!T)
        return;
      u.preventDefault(), r = E.slot, g = E.slot.panel, d = E.sign;
      const O = T.getBoundingClientRect();
      v = e.direction === "horizontal" ? O.width : O.height, f = e.direction === "horizontal" ? u.clientX : u.clientY, a.value = !0, Ne({
        cursor: e.direction === "horizontal" ? "col-resize" : "row-resize",
        captureTarget: n.value,
        pointerId: u.pointerId,
        onMove: (G) => {
          if (!g || !r)
            return;
          const Z = (e.direction === "horizontal" ? G.clientX : G.clientY) - f;
          let F = Math.max(0, v + Z * d);
          const J = H(r.minSize);
          J !== null && (F = Math.max(F, J));
          const te = H(r.maxSize);
          te !== null && (F = Math.min(F, te)), e.manager.resizePanel(g, `${Math.round(F)}px`), c();
        },
        onEnd: () => {
          a.value = !1, g = null, r = null;
        }
      });
    }
    function j(u, S, R) {
      if (!n.value || !e.beforeEl || !e.afterEl)
        return;
      u.preventDefault();
      const E = e.direction === "horizontal", T = e.beforeEl.getBoundingClientRect(), O = e.afterEl.getBoundingClientRect();
      w = S.panel, L = R.panel, D = E ? T.width : T.height, C = E ? O.width : O.height;
      const G = H(S.minSize, e.beforeEl), U = H(S.maxSize, e.beforeEl), Z = H(R.minSize, e.afterEl), F = H(R.maxSize, e.afterEl);
      K = G ?? 0, B = U ?? Number.POSITIVE_INFINITY, I = Z ?? 0, Q = F ?? Number.POSITIVE_INFINITY, f = E ? u.clientX : u.clientY, a.value = !0, i.value = !1;
      const J = D + C, te = _e(S.size)?.unit === "fr", s = _e(R.size)?.unit === "fr";
      Ne({
        cursor: E ? "col-resize" : "row-resize",
        captureTarget: n.value,
        pointerId: u.pointerId,
        onMove: (h) => {
          if (!w || !L)
            return;
          const M = (E ? h.clientX : h.clientY) - f;
          let V = D + M, $ = C - M, ae = !1;
          V < K ? (V = K, $ = J - V, ae = !0) : V > B && (V = B, $ = J - V, ae = !0), $ < I ? ($ = I, V = J - $, ae = !0) : $ > Q && ($ = Q, V = J - $, ae = !0), i.value = ae;
          const xe = Math.round(V), he = Math.round($);
          te && !s ? e.manager.resizePanel(L, `${he}px`) : s && !te ? e.manager.resizePanel(w, `${xe}px`) : e.manager.resizePanelPair(w, xe, L, he), c();
        },
        onEnd: () => {
          a.value = !1, i.value = !1, w = null, L = null;
        }
      });
    }
    function A() {
      const u = p(e.before) ? e.before : p(e.after) ? e.after : null;
      u?.collapsible && (u.collapsed ? e.manager.expandPanel(u.panel) : e.manager.collapsePanel(u.panel), c());
    }
    const N = x(() => !!k()), y = x(() => {
      o.value;
      const u = k();
      if (!u)
        return null;
      const S = u.sign === 1 ? e.beforeEl : e.afterEl;
      if (!S)
        return null;
      const R = S.getBoundingClientRect(), E = e.direction === "horizontal" ? R.width : R.height, T = H(u.slot.minSize), O = H(u.slot.maxSize);
      return {
        now: Math.round(E),
        min: T !== null ? Math.round(T) : void 0,
        max: O !== null ? Math.round(O) : void 0
      };
    });
    function b(u) {
      const S = k();
      if (!S)
        return;
      const R = e.direction === "horizontal";
      let E = 0;
      R ? u.key === "ArrowLeft" ? E = -1 : u.key === "ArrowRight" && (E = 1) : u.key === "ArrowUp" ? E = -1 : u.key === "ArrowDown" && (E = 1);
      const T = u.key === "Home" || u.key === "End";
      if (E === 0 && !T)
        return;
      u.preventDefault(), u.stopPropagation();
      const O = S.slot, G = S.sign === 1 ? e.beforeEl : e.afterEl;
      if (!G)
        return;
      const U = G.getBoundingClientRect(), Z = R ? U.width : U.height;
      let F = Z;
      if (u.key === "Home") {
        if (O.collapsible) {
          e.manager.collapsePanel(O.panel), c();
          return;
        }
        F = 0;
      } else if (u.key === "End")
        F = Number.MAX_SAFE_INTEGER;
      else {
        const s = u.shiftKey ? 32 : 8;
        F = Z + E * s * S.sign;
      }
      const J = H(O.minSize);
      J !== null && (F = Math.max(F, J));
      const te = H(O.maxSize);
      te !== null && (F = Math.min(F, te)), F = Math.max(0, Math.round(F)), e.manager.resizePanel(O.panel, `${F}px`), c();
    }
    function _() {
      c();
    }
    return (u, S) => (z(), P("div", {
      ref_key: "root",
      ref: n,
      class: me(["wippy-layout-splitter", [
        `wippy-layout-splitter--${t.direction}`,
        a.value && "wippy-layout-splitter--dragging",
        i.value && "wippy-layout-splitter--clamped",
        !N.value && "wippy-layout-splitter--locked",
        `wippy-layout-splitter--paint-${t.paint ?? "default"}`
      ]]),
      "data-direction": t.direction,
      "data-before-panel": l(t.before),
      "data-after-panel": l(t.after),
      role: "separator",
      "aria-orientation": t.direction === "horizontal" ? "vertical" : "horizontal",
      tabindex: N.value ? 0 : -1,
      "aria-disabled": N.value ? void 0 : !0,
      "aria-valuenow": y.value?.now,
      "aria-valuemin": y.value?.min,
      "aria-valuemax": y.value?.max,
      onPointerdown: W,
      onDblclick: A,
      onKeydown: b,
      onFocus: _
    }, [...S[0] || (S[0] = [
      X("span", {
        class: "wippy-layout-splitter__handle",
        "aria-hidden": "true"
      }, [
        X("svg", {
          width: "11",
          height: "11",
          viewBox: "0 0 24 24",
          focusable: "false"
        }, [
          X("path", {
            fill: "none",
            stroke: "currentColor",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": "2",
            d: "M7 8l-4 4l4 4M17 8l4 4l-4 4"
          })
        ])
      ], -1)
    ])], 42, pn));
  }
}), hn = /* @__PURE__ */ fe(mn, [["__scopeId", "data-v-72f8e7ce"]]), gn = /* @__PURE__ */ se({
  name: "LayoutTree",
  __name: "LayoutTree",
  props: {
    tree: {},
    manager: {},
    nested: { type: Boolean }
  },
  setup(t) {
    const e = t, n = x(() => {
      const f = e.tree.size;
      if (!e.nested || !f)
        return;
      const d = _e(f);
      if (d)
        return d.unit === "auto" ? { flex: "0 0 auto" } : d.unit === "fr" ? { flex: `${d.value || 1} 1 0` } : { flex: `0 0 ${f}` };
    }), a = x(() => e.manager.capabilities.separatorDrag), i = x(() => e.tree.children.filter((f) => !(oe(f) && Ee(f)))), o = Se([]);
    function c(f, d) {
      const w = d && typeof d == "object" && "$el" in d ? d.$el : d;
      o[f] = w ?? null;
    }
    function g(f) {
      return i.value[f] ?? null;
    }
    function r(f) {
      return f && oe(f) ? f.dividerBefore ?? "default" : "default";
    }
    function v(f, d) {
      return oe(f) ? `slot:${f.panel}` : `tree:${d}:${f.direction}:${f.children.length}`;
    }
    return (f, d) => {
      const w = st("LayoutTree", !0);
      return z(), P("div", {
        class: me(["wippy-layout-tree", [`wippy-layout-tree--${t.tree.direction}`]]),
        style: de(n.value)
      }, [
        (z(!0), P(pe, null, ge(i.value, (L, D) => (z(), P(pe, {
          key: v(L, D)
        }, [
          He(oe)(L) ? (z(), ee(fn, {
            key: 1,
            ref_for: !0,
            ref: (C) => c(D, C),
            "slot-def": L,
            direction: t.tree.direction,
            manager: t.manager
          }, null, 8, ["slot-def", "direction", "manager"])) : (z(), ee(w, {
            key: 0,
            ref_for: !0,
            ref: (C) => c(D, C),
            tree: L,
            manager: t.manager,
            nested: ""
          }, null, 8, ["tree", "manager"])),
          a.value && D < i.value.length - 1 && He(vt)(g(D), g(D + 1)) ? (z(), ee(hn, {
            key: 2,
            direction: t.tree.direction,
            before: g(D),
            after: g(D + 1),
            "before-el": o[D] ?? null,
            "after-el": o[D + 1] ?? null,
            paint: r(g(D + 1)),
            manager: t.manager
          }, null, 8, ["direction", "before", "after", "before-el", "after-el", "paint", "manager"])) : ne("", !0)
        ], 64))), 128))
      ], 6);
    };
  }
}), yn = /* @__PURE__ */ fe(gn, [["__scopeId", "data-v-27c8643f"]]), vn = ["data-breakpoint"], wn = {
  class: "wippy-layout-panel-host",
  "aria-hidden": "false"
}, bn = ["data-wippy-panel-mount", "data-wippy-panel-active", "data-wippy-panel-collapsed", "inert"], xn = /* @__PURE__ */ se({
  __name: "LayoutManagerView",
  props: {
    manager: {}
  },
  setup(t) {
    const e = t, n = typeof window > "u" || typeof window.HTMLDialogElement < "u";
    function a(s) {
      return s === !1 || !n ? tn : sn;
    }
    const i = Y(null), o = Pe(e.manager.getLayout()), c = Y("default"), g = x(() => {
      const s = o.value.layouts[c.value];
      return s || (c.value !== "default" ? St(o.value) : o.value.layouts.default);
    }), r = x(() => {
      const s = /* @__PURE__ */ new Set();
      return ie(g.value, (h) => {
        s.add(h.panel);
      }), s;
    }), v = x(() => {
      const s = {};
      function h(m) {
        for (const M of m.children)
          "panel" in M ? s[M.panel] = {
            borderBefore: M.borderBefore === !0,
            direction: m.direction
          } : h(M);
      }
      return h(g.value), s;
    }), f = x(() => Object.keys(o.value.panels)), d = x(() => {
      const s = [];
      return ie(g.value, (h) => {
        Ee(h) && s.push(h);
      }), s;
    }), w = x(() => {
      for (const s of d.value)
        if (o.value.panels[s.panel]?.drawerOpen)
          return !0;
      return !1;
    }), L = x(() => {
      const s = /* @__PURE__ */ new Set();
      for (const h of d.value)
        o.value.panels[h.panel]?.drawerOpen && s.add(h.panel);
      return s;
    }), D = x(() => {
      const s = /* @__PURE__ */ new Set();
      return ie(g.value, (h) => {
        (!Ee(h) || L.value.has(h.panel)) && s.add(h.panel);
      }), s;
    });
    function C(s) {
      return r.value.has(s) && !D.value.has(s);
    }
    function K() {
      for (const s of d.value)
        o.value.panels[s.panel]?.drawerOpen && e.manager.closeDrawer(s.panel);
    }
    const B = Se({});
    Ke(je, B);
    const I = Se({});
    function Q(s) {
      if (!r.value.has(s))
        return !1;
      const h = I[s];
      return !!h && h.measured && !h.visible;
    }
    function H(s) {
      return Q(s) || C(s);
    }
    const p = Y(null), l = /* @__PURE__ */ new WeakMap();
    function k(s) {
      const h = B[s], m = i.value;
      if (!h || !m)
        return { left: 0, top: 0, width: 0, height: 0, visible: !1, measured: !1 };
      const M = h.getBoundingClientRect(), V = m.getBoundingClientRect();
      return {
        left: M.left - V.left,
        top: M.top - V.top,
        width: M.width,
        height: M.height,
        // Zero-sized means collapsed; see `collapsedToNothing`. A closed drawer's
        // anchor keeps its real size, so it is hidden by `closedDrawer` instead.
        visible: M.width > 0 && M.height > 0,
        measured: !0
      };
    }
    function W(s) {
      I[s] = k(s);
    }
    function j() {
      for (const s of Object.keys(B))
        W(s);
    }
    re(
      () => Object.entries(B).map(([s, h]) => `${s}:${h ? "1" : "0"}`).join(","),
      () => {
        const s = p.value;
        if (s)
          for (const [h, m] of Object.entries(B))
            m ? (l.get(m) !== h && (l.set(m, h), s.observe(m)), W(h)) : I[h] = { left: 0, top: 0, width: 0, height: 0, visible: !1, measured: !1 };
      },
      { flush: "post" }
    );
    const A = x(() => Object.entries(o.value.floating ?? {})), N = x(() => Object.entries(o.value.modals ?? {}));
    let y = null, b = null, _ = null, u = 0, S = 0, R = !1;
    function E(s) {
      const h = $t(s, o.value);
      h !== c.value && (c.value = h, e.manager.setActiveBreakpoint(h, s)), O(s);
    }
    function T(s) {
      S = s, !u && (u = requestAnimationFrame(() => {
        u = 0, E(S);
      }));
    }
    function O(s) {
      if (R)
        return;
      const { layouts: h, breakpoints: m } = o.value, M = m?.sm ?? 640;
      s < M && !h.sm && (R = !0, console.warn(
        `[@wippy-fe/layout] Container width (${Math.round(s)}px) is below the "sm" breakpoint threshold (${M}px) but no layouts.sm is declared. Falling back to deriveMobileLayout (single-slot). Declare a layouts.sm entry to take control of the narrow-viewport rendering.`
      ));
    }
    function G() {
      j();
    }
    const U = Se({});
    let Z;
    function F(s, h) {
      U[s] = h && h.nodeType === 1 ? h : null;
    }
    function J(s) {
      const h = U[`panel:${s}`], m = h?.getRootNode()?.activeElement;
      m instanceof HTMLElement && h?.contains(m) && m.blur();
    }
    re(L, (s, h) => {
      for (const m of h)
        C(m) && J(m);
    });
    function te() {
      if (!i.value)
        return;
      const s = /* @__PURE__ */ new Map();
      ie(g.value, ($) => s.set($.panel, $));
      const h = Object.entries(o.value.panels).map(([$, ae]) => ({
        id: $,
        element: U[`panel:${$}`],
        title: ae.title || void 0,
        active: D.value.has($),
        collapsed: s.get($)?.collapsed === !0,
        drawer: !!(s.get($) && Ee(s.get($))),
        floating: !1,
        modal: !1,
        placeholder: !U[`panel:${$}`]
      }));
      for (const $ of ["floating", "modals"])
        for (const [ae, xe] of Object.entries(o.value[$] ?? {})) {
          const he = U[`${$}:${ae}`];
          h.push({ id: ae, element: he, title: xe.title || void 0, active: !0, collapsed: !1, drawer: !1, floating: $ === "floating", modal: $ === "modals", placeholder: !he });
        }
      for (const $ of e.manager.getRegisteredModals())
        o.value.modals?.[$.id] || h.push({ id: $.id, title: $.title, active: !1, collapsed: !1, drawer: !1, floating: !1, modal: !0, placeholder: !0 });
      const m = { panels: h, breakpoint: c.value };
      if (Z) {
        Z.update(m);
        return;
      }
      const V = i.value.ownerDocument.defaultView?.__WIPPY_APP_API__?.attention;
      V?.enabled && V.registerLayoutProvider && (Z = V.registerLayoutProvider({ ...m, root: i.value }));
    }
    return re([o, c, g, () => Object.entries(U)], te, { flush: "post" }), Fe(() => {
      te(), typeof ResizeObserver < "u" && (p.value = new ResizeObserver((s) => {
        for (const h of s) {
          const m = l.get(h.target);
          m && W(m);
        }
      })), window.addEventListener("resize", G), y = e.manager.on("change", (s) => {
        o.value = s, queueMicrotask(j);
      }), b = e.manager.on("breakpoint", ({ name: s }) => {
        c.value !== s && (c.value = s);
      }), e.manager.activeBreakpoint !== c.value && (c.value = e.manager.activeBreakpoint), i.value && typeof ResizeObserver < "u" && (_ = new ResizeObserver((s) => {
        const h = s[0];
        h && T(h.contentRect.width);
      }), _.observe(i.value), E(i.value.getBoundingClientRect().width));
    }), le(() => {
      Z?.dispose(), Z = void 0, y?.(), b?.(), _?.disconnect(), p.value?.disconnect(), window.removeEventListener("resize", G), u && cancelAnimationFrame(u);
    }), (s, h) => (z(), P("div", {
      ref_key: "root",
      ref: i,
      class: "wippy-layout-manager-view",
      "data-breakpoint": c.value
    }, [
      ve(yn, {
        tree: g.value,
        manager: t.manager
      }, null, 8, ["tree", "manager"]),
      X("div", wn, [
        (z(!0), P(pe, null, ge(f.value, (m) => (z(), P("div", {
          key: m,
          ref_for: !0,
          ref: (M) => F(`panel:${m}`, M),
          class: me(["wippy-layout-panel-mount", [
            v.value[m]?.borderBefore && "wippy-layout-panel-mount--border-before",
            v.value[m] && `wippy-layout-panel-mount--${v.value[m].direction}`,
            L.value.has(m) && "wippy-layout-panel-mount--drawer-open"
          ]]),
          "data-wippy-panel-mount": m,
          "data-wippy-panel-active": r.value.has(m) ? "true" : "false",
          "data-wippy-panel-collapsed": Q(m) ? "true" : void 0,
          inert: H(m) ? !0 : void 0,
          style: de(r.value.has(m) ? {
            display: "flex",
            left: `${I[m]?.left ?? 0}px`,
            top: `${I[m]?.top ?? 0}px`,
            width: `${I[m]?.width ?? 0}px`,
            height: `${I[m]?.height ?? 0}px`,
            // Nothing to paint, so hide it rather than leave its content
            // focusable. Same treatment as the inactive branch below; see
            // `collapsedToNothing`. A descendant can set its own `visibility`
            // and `pointer-events`, and this mount sits over other panels,
            // so `clip-path` and `inert` cover the whole subtree. Hidden
            // content still counts as scrollable overflow, so the mount also
            // bounds it instead of keeping `overflow: visible`.
            visibility: H(m) ? "hidden" : void 0,
            pointerEvents: H(m) ? "none" : void 0,
            clipPath: H(m) ? "inset(100%)" : void 0,
            overflow: H(m) ? "clip" : void 0,
            // Only the open drawer is promoted (over its anchor at 900).
            // Inline mounts stay `auto`: `position: absolute` + a numeric
            // z-index makes a stacking context, trapping the panel's own
            // popovers inside its rect.
            zIndex: L.value.has(m) ? "901" : void 0
          } : {
            display: "flex",
            visibility: "hidden",
            pointerEvents: "none",
            left: "-9999px",
            top: "0",
            width: "0",
            height: "0"
          })
        }, [
          ve(Ae, {
            "panel-id": m,
            tree: g.value,
            manager: t.manager,
            presented: D.value.has(m)
          }, {
            default: Le(() => [
              (z(), ee(we(o.value.panels[m].component), ut({ ref_for: !0 }, o.value.panels[m].props ?? {}, { class: "wippy-layout-slot__content" }), null, 16))
            ]),
            _: 2
          }, 1032, ["panel-id", "tree", "manager", "presented"])
        ], 14, bn))), 128))
      ]),
      (z(!0), P(pe, null, ge(d.value, (m) => (z(), ee(Nt, {
        key: `drawer:${m.panel}`,
        "slot-def": m,
        manager: t.manager
      }, null, 8, ["slot-def", "manager"]))), 128)),
      w.value ? (z(), P("div", {
        key: 0,
        class: "wippy-layout-drawer-backdrop",
        role: "presentation",
        onClick: K
      })) : ne("", !0),
      (z(), ee(Ve, { to: "body" }, [
        (z(!0), P(pe, null, ge(A.value, ([m, M], V) => (z(), ee(Ut, {
          id: m,
          key: `floating:${m}`,
          "attention-element": ($) => F(`floating:${m}`, $),
          def: M,
          manager: t.manager,
          "stack-index": V
        }, null, 8, ["id", "attention-element", "def", "manager", "stack-index"]))), 128))
      ])),
      (z(), ee(Ve, { to: "body" }, [
        (z(!0), P(pe, null, ge(N.value, ([m, M], V) => (z(), ee(we(a(M.useNativeDialog)), {
          id: m,
          key: `modal:${m}`,
          "attention-element": ($) => F(`modals:${m}`, $),
          def: M,
          manager: t.manager,
          "stack-index": V
        }, null, 8, ["id", "attention-element", "def", "manager", "stack-index"]))), 128))
      ]))
    ], 8, vn));
  }
}), Mn = /* @__PURE__ */ fe(xn, [["__scopeId", "data-v-6b407cbf"]]);
function Pn(t) {
  const e = Math.max(1, Math.floor(t.buffers ?? 2)), n = t.evict ?? "round-robin", a = Y(
    Array.from({ length: e }).fill(null)
  ), i = Y(0);
  let o = 0;
  const c = x(() => a.value[i.value] ?? null);
  function g() {
    let y = -1, b = 0;
    for (let _ = 0; _ < a.value.length; _++) {
      const u = a.value[_];
      u?.ready && u.lastActiveAt >= b && (b = u.lastActiveAt, y = _);
    }
    return y;
  }
  const r = t.readyTimeoutMs ?? 8e3, v = t.onReadyTimeout ?? "reveal", f = Number.isFinite(r) && r > 0, d = /* @__PURE__ */ new Map();
  function w(y) {
    const b = d.get(y);
    b !== void 0 && (clearTimeout(b), d.delete(y));
  }
  function L(y) {
    f && (w(y), d.set(y, setTimeout(() => {
      d.delete(y);
      const b = a.value[y];
      if (!(!b || b.ready || b.error)) {
        try {
          t.onReadyTimeoutFired?.(b);
        } catch {
        }
        v === "fail" ? N(y, { error: new Error(`[swap-buffer] content "${b.key}" did not report ready within ${r}ms`) }) : N(y, { ready: !0 });
      }
    }, r)));
  }
  const D = t.loaderDelayMs ?? 250, C = t.loaderMinMs ?? 400, K = Y(!1);
  let B, I, Q = 0;
  function H() {
    B !== void 0 && (clearTimeout(B), B = void 0), I !== void 0 && (clearTimeout(I), I = void 0);
  }
  const p = x(() => {
    const y = c.value;
    return y !== null && !y.ready && !y.error;
  }), l = re(p, (y) => {
    if (y) {
      if (I !== void 0 && (clearTimeout(I), I = void 0), K.value || B !== void 0)
        return;
      B = setTimeout(() => {
        B = void 0, K.value = !0, Q = Date.now();
      }, D);
      return;
    }
    if (B !== void 0 && (clearTimeout(B), B = void 0), !K.value)
      return;
    const b = Math.max(0, C - (Date.now() - Q));
    if (b === 0) {
      K.value = !1;
      return;
    }
    I !== void 0 && clearTimeout(I), I = setTimeout(() => {
      I = void 0, K.value = !1;
    }, b);
  }, { immediate: !0 });
  function k() {
    for (const y of d.values())
      clearTimeout(y);
    d.clear(), H(), l();
  }
  ct() && dt(k);
  function W() {
    if (n === "lru") {
      const y = g();
      let b = -1, _ = Number.POSITIVE_INFINITY;
      for (let u = 0; u < a.value.length; u++) {
        if (u === i.value || u === y)
          continue;
        const S = a.value[u]?.lastActiveAt ?? 0;
        S < _ && (_ = S, b = u);
      }
      return b === -1 ? i.value : b;
    }
    return (i.value + 1) % a.value.length;
  }
  function j(y) {
    const b = t.keyOf(y), _ = a.value.findIndex((E) => E !== null && E.key === b);
    if (_ !== -1) {
      const T = {
        ...a.value[_],
        entry: y,
        // `error` is deliberately carried over. Reuse fires on any
        // re-push of the same key — including a sub-route change within
        // the same page — and clearing here would remount the failed
        // content and refetch a known-bad endpoint on every one of them.
        // Recovering from a failure is an explicit act: call `clearError`.
        lastActiveAt: ++o
      };
      return a.value[_] = T, i.value = _, !T.ready && !T.error && !d.has(_) && L(_), { index: _, key: b };
    }
    const u = W(), S = a.value[u];
    S && t.onEvict && t.onEvict(S), w(u);
    const R = {
      index: u,
      key: b,
      entry: y,
      ready: !1,
      error: null,
      lastActiveAt: ++o
    };
    return a.value[u] = R, i.value = u, L(u), { index: u, key: b };
  }
  function A(y, b) {
    return b === void 0 || a.value[y]?.key === b;
  }
  function N(y, b) {
    const _ = a.value[y];
    _ && (a.value[y] = { ..._, ...b });
  }
  return {
    slots: a,
    topIndex: i,
    active: c,
    showLoader: K,
    push: j,
    markReady: (y, b) => {
      A(y, b) && (w(y), N(y, { ready: !0 }));
    },
    markFailed: (y, b, _) => {
      A(y, _) && (w(y), N(y, { error: b }));
    },
    clearError: (y) => {
      N(y, { error: null });
      const b = a.value[y];
      b && !b.ready && L(y);
    },
    dispose: k
  };
}
export {
  mt as DEFAULT_BREAKPOINTS,
  ht as DEFAULT_CAPABILITIES,
  pt as LAYOUT_MANAGER_KEY,
  Ge as LAYOUT_SLOT_KEY,
  Nt as LayoutDrawerAnchor,
  Ut as LayoutFloating,
  Dn as LayoutManager,
  Mn as LayoutManagerView,
  tn as LayoutModal,
  sn as LayoutModalNative,
  fn as LayoutPanelSlot,
  hn as LayoutSplitter,
  yn as LayoutTree,
  q as LayoutValidationError,
  Xe as assertValidLayout,
  Ce as cloneLayout,
  St as deriveMobileLayout,
  ue as findSlotParent,
  it as insertAtPosition,
  Ee as isDrawerSlot,
  et as isInlineSlot,
  oe as isPanelSlot,
  Je as isPanelTree,
  Et as moveNode,
  Ze as panelAnchorName,
  xt as parsePixelSize,
  _e as parseSize,
  $t as pickBreakpoint,
  nt as removeNode,
  Ie as useLayout,
  Qe as useLayoutBreakpoint,
  _n as useLayoutDeclaration,
  Sn as useLayoutFloating,
  $n as useLayoutPanel,
  En as useLayoutSlot,
  Pn as useSwapBuffer,
  kt as validateLayout,
  ie as walkTree
};
//# sourceMappingURL=index.js.map
