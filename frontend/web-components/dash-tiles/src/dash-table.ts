import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@example/dash-tile-helper'
import DashTable from './app/dash-table.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-dash-tile.ts'

/** Entry of the `dash-table` tag: a table. */
class DashTableElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: DashTable,
    }
  }
}

export async function webComponent() {
  return DashTableElement
}

define(import.meta.url, DashTableElement)
