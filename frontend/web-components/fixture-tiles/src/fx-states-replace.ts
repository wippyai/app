import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@wippy/dashboards-tile-helper'
import FxStates from './app/fx-states.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-fixture-tile.ts'

/** Entry of the `fx-states-replace` tag (the same tile as fx-states; its claim says computing: replace) (a fixture of the dashboards browser tests). */
class FxStatesReplaceElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: FxStates,
    }
  }
}

export async function webComponent() {
  return FxStatesReplaceElement
}

define(import.meta.url, FxStatesReplaceElement)
