import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'
import { tilePropsSchema } from '@example/dash-tile-helper'
import DashSelect from './app/dash-select.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-dash-tile.ts'

/**
 * Entry of the `dash-select` tag: a dropdown for a page parameter. It uses the PrimeVue Select of the
 * Host. PrimeVuePlugin keeps the overlay inside this shadow root and promotes it to the top layer.
 */
class DashSelectElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl', 'primeVueCssUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: DashSelect,
      plugins: [PrimeVuePlugin],
    }
  }
}

export async function webComponent() {
  return DashSelectElement
}

define(import.meta.url, DashSelectElement)
