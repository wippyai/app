import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'
import { createWippyPersist } from '@wippy-fe/pinia-persist'
import type { ComponentProps } from './types.ts'
import type { Events } from './constants.ts'
import App from './app/counter-persist.vue'
import stylesText from './styles.css?inline'
import pkg from '../package.json'

class CounterPersistElement extends WippyVueElement<ComponentProps, Events> {
  static get wippyConfig(): WippyElementConfig<ComponentProps> {
    return {
      propsSchema: pkg.wippy.props as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl', 'primeVueCssUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: App,
      plugins: [PrimeVuePlugin],
      piniaPlugins: [createWippyPersist()],
    }
  }
}

export async function webComponent() {
  return CounterPersistElement
}

define(import.meta.url, CounterPersistElement)
