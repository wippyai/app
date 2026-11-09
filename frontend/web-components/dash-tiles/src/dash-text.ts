import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@example/dash-tile-helper'
import DashText from './app/dash-text.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-dash-tile.ts'

/** Entry of the `dash-text` tag: a text from data, rendered as Markdown. */
class DashTextElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: DashText,
    }
  }
}

export async function webComponent() {
  return DashTextElement
}

define(import.meta.url, DashTextElement)
