import { WippyVueElement, define } from '@wippy-fe/webcomponent-vue'
import type { WippyElementConfig, WippyPropsSchema } from '@wippy-fe/webcomponent-vue'
import { tilePropsSchema } from '@wippy/dashboards-tile-helper'
import UserStatus from './app/user-status.vue'
import stylesText from './styles.css?inline'
import type { TileEvents } from './use-dash-tile.ts'

/** Entry of the `user-status` tag: every user with name, status and groups. */
class UserStatusElement extends WippyVueElement<Record<string, unknown>, TileEvents> {
  static get wippyConfig(): WippyElementConfig<Record<string, unknown>> {
    return {
      propsSchema: tilePropsSchema as WippyPropsSchema,
      hostCssKeys: ['themeConfigUrl'] as const,
      inlineCss: stylesText,
    }
  }

  static get vueConfig() {
    return {
      rootComponent: UserStatus,
    }
  }
}

export async function webComponent() {
  return UserStatusElement
}

define(import.meta.url, UserStatusElement)
