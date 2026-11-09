import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@example/dash-tile-helper'
import DashChart from './app/dash-chart.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-dash-tile.ts'

/** Entry of the `dash-chart` tag: a chart through <wippy-chartjs>. */
class DashChartElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: DashChart,
    }
  }
}

export async function webComponent() {
  return DashChartElement
}

define(import.meta.url, DashChartElement)
