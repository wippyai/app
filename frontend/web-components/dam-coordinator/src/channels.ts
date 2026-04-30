/**
 * Bus channel constants — single source of truth for the Event-DAM
 * demo. Other DAM web components inline-duplicate these (cross-WC
 * source imports complicate Vite externals); keep them in sync by
 * eyeball.
 */

export const CHANNELS = {
  /** Header nav button → main panel route swap. */
  NAV: 'app:nav',
  /** Flap link → side panel route swap (or drawer in narrow mode). */
  DETAIL: 'app:detail',
  /** Header hamburger → toggle drawer in narrow mode. */
  TOGGLE_DRAWER: 'app:toggle-drawer',
  /** Toolbar / flap → expand a collapsed panel. */
  EXPAND: 'app:expand',
  /** Toolbar → collapse a panel. */
  COLLAPSE: 'app:collapse',
  /** Toolbar Upload button → swap main panel to modal-host page. */
  OPEN_MODAL: 'app:open-modal',
  /** Modal body Done/Cancel → restore prior main panel. */
  CLOSE_MODAL: 'app:close-modal',
  /** Gallery card click → right panel/drawer to detail page. */
  ASSET_CLICKED: 'app:asset-clicked',
  /** Toolbar density slider → main panel props patch. */
  DENSITY: 'app:density',
} as const
