import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'
import type { PlaceholderEvents } from './constants.ts'
import type { PlaceholderProps } from './placeholder-props.ts'
import { placeholderPropsSchema } from './placeholder-props.ts'
import Placeholder from './app/dash-placeholder.vue'
import stylesText from './styles.css?inline'

/** Test tile: shows its id and a text input, and reports `ready` at once unless `options.silent` is true. */
class DashPlaceholderElement extends WippyVueElement<PlaceholderProps, PlaceholderEvents> {
  static get wippyConfig(): WippyElementConfig<PlaceholderProps> {
    return {
      propsSchema: placeholderPropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl', 'primeVueCssUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: Placeholder,
      plugins: [PrimeVuePlugin],
    }
  }
}

export async function webComponent() {
  return DashPlaceholderElement
}

define(import.meta.url, DashPlaceholderElement)
