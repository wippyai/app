import { addCollection } from '@iconify/vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createWippyPersist, preloadWippyState } from '@wippy-fe/pinia-persist'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { PrimeVuePlugin } from '@wippy-fe/theme/primevue-plugin'

import App from './app/app.vue'
import { AXIOS_INSTANCE, HOST_API, WIPPY_INSTANCE } from './constants'
import { createAppRouter } from './router'
import '@wippy-fe/theme/theme-config.css'
import './styles.css'
import './tailwind.css'

export async function createMainApp() {
  const config = await window.$W.config()
  const hostApi = await window.$W.host()
  const axios = await window.$W.api()
  const instance = await window.$W.instance()

  const routePath = config.context?.route
  const initialPath = routePath
    ? (routePath.startsWith('/') ? routePath : '/' + routePath)
    : '/'

  if (config.theming.global?.icons) {
    addCollection({
      prefix: 'custom',
      icons: config.theming.global.icons,
    })
  }
  for (const [prefix, icons] of Object.entries(config.theming.global?.iconSets ?? {})) {
    addCollection({ prefix, icons })
  }

  const app = createApp(App)

  const preloaded = await preloadWippyState()
  const pinia = createPinia()
  pinia.use(createWippyPersist(preloaded))
  app.use(pinia)
  app.use(VueQueryPlugin)
  app.use(PrimeVuePlugin)

  app.provide(HOST_API, hostApi)
  app.provide(AXIOS_INSTANCE, axios)
  app.provide(WIPPY_INSTANCE, instance)

  const router = createAppRouter(hostApi, instance.on, initialPath)
  app.use(router)

  return app
}

export async function mountApp(elementId: string = '#app') {
  const app = await createMainApp()
  app.mount(elementId)
  return app
}

mountApp()
