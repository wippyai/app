import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@wippy/dashboards-tile-helper'
import FxApi from './app/fx-api.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-fixture-tile.ts'

/** Entry of the `fx-api` tag (a fixture of the dashboards browser tests). */
class FxApiElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: FxApi,
    }
  }
}

export async function webComponent() {
  return FxApiElement
}

define(import.meta.url, FxApiElement)
