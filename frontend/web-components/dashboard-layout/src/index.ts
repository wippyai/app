import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'
import type { ComponentProps } from './types.ts'
import type { Events } from './constants.ts'
import DashboardBoard from './app/dashboard-board.vue'
import stylesText from './styles.css?inline'
// The layout package ships its own stylesheet. The board adds it to its shadow root, not to the document.
import layoutCss from '../vendor/layout/style.css?inline'
import pkg from '../package.json'

class DashboardLayoutElement extends WippyVueElement<ComponentProps, Events> {
  static get wippyConfig(): WippyElementConfig<ComponentProps> {
    return {
      propsSchema: pkg.wippy.props as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl', 'primeVueCssUrl', 'iframeCssUrl'] as const,
      inlineCss: layoutCss + stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: DashboardBoard,
      plugins: [PrimeVuePlugin],
    }
  }
}

export async function webComponent() {
  return DashboardLayoutElement
}

define(import.meta.url, DashboardLayoutElement)
