import { addCollection } from '@iconify/vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { addIcons, api, config, host, on } from '@wippy-fe/proxy'
import { createWippyPersist, preloadWippyState } from '@wippy-fe/pinia-persist'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'

import App from './app/app.vue'
import { AXIOS_INSTANCE, HOST_API } from './constants'
import { createAppRouter } from './router'
import '@wippy-fe/theme/theme-config.css'
import './styles.css'
import './tailwind.css'

export async function createMainApp() {
  const routePath = config.context?.route
  const initialPath = routePath
    ? (routePath.startsWith('/') ? routePath : '/' + routePath)
    : '/'

  // Register both deprecated `theming.global.icons` (single set under prefix "custom")
  // and canonical `theming.global.iconSets` (prefix→icons map). The helper iterates correctly.
  addIcons(addCollection)

  const app = createApp(App)

  const preloaded = await preloadWippyState()
  const pinia = createPinia()
  pinia.use(createWippyPersist(preloaded))
  app.use(pinia)
  app.use(VueQueryPlugin)
  app.use(PrimeVuePlugin)

  app.provide(HOST_API, host)
  app.provide(AXIOS_INSTANCE, api)
  // The live page list is created in app.vue, which provides it to the pages.

  const router = createAppRouter(host, on, initialPath)
  app.use(router)

  return app
}

export async function mountApp(elementId: string = '#app') {
  const app = await createMainApp()
  // The fragment stream must finish installing the mount root first.
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) => {
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    })
  }
  app.mount(elementId)
  return app
}

mountApp()
