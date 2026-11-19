import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@wippy/dashboards-tile-helper'
import FxOnload from './app/fx-onload.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-fixture-tile.ts'

/** Entry of the `fx-onload` tag (a fixture of the dashboards browser tests). */
class FxOnloadElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: FxOnload,
    }
  }
}

export async function webComponent() {
  return FxOnloadElement
}

define(import.meta.url, FxOnloadElement)
