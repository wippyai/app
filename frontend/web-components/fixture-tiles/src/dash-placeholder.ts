import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import DashPlaceholder from './app/dash-placeholder.vue'
import type { PlaceholderEvents, PlaceholderProps } from './placeholder-props.ts'
import { placeholderPropsSchema } from './placeholder-props.ts'
import stylesText from './styles.css?inline'

/**
 * Test tile of the browser tests (the module no longer ships it): shows its id and a text input, and reports
 * `ready` at once unless `options.silent` is true. It reads no data.
 */
class DashPlaceholderElement extends WippyVueElement<PlaceholderProps, PlaceholderEvents> {
  static get wippyConfig(): WippyElementConfig<PlaceholderProps> {
    return {
      propsSchema: placeholderPropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: DashPlaceholder,
    }
  }
}

export async function webComponent() {
  return DashPlaceholderElement
}

define(import.meta.url, DashPlaceholderElement)
