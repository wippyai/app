import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'
import type { ComponentProps } from './types.ts'
import type { Events } from './constants.ts'
import ModelGallery from './app/model-gallery.vue'
import stylesText from './styles.css?inline'
import pkg from '../package.json'

class ModelGalleryElement extends WippyVueElement<ComponentProps, Events> {
  static get wippyConfig(): WippyElementConfig<ComponentProps> {
    return {
      propsSchema: pkg.wippy.props as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl', 'primeVueCssUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: ModelGallery,
      plugins: [PrimeVuePlugin],
    }
  }
}

export async function webComponent() {
  return ModelGalleryElement
}

define(import.meta.url, ModelGalleryElement)
