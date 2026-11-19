import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@wippy/dashboards-tile-helper'
import FxSize from './app/fx-size.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-fixture-tile.ts'

/** Entry of the `fx-size` tag (a fixture of the dashboards browser tests). */
class FxSizeElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: FxSize,
    }
  }
}

export async function webComponent() {
  return FxSizeElement
}

define(import.meta.url, FxSizeElement)
