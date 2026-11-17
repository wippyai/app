import { createApp } from 'vue'
import App from './app/app.vue'
import { AXIOS_INSTANCE, HOST_API } from './constants'
import './styles.css'
import './tailwind.css'

export async function createMainApp() {
  const hostApi = await window.$W.host()
  const axios = await window.$W.api()

  const app = createApp(App)

  app.provide(HOST_API, hostApi)
  app.provide(AXIOS_INSTANCE, axios)

  return app
}

export async function mountApp(elementId: string = '#app') {
  const app = await createMainApp()
  app.mount(elementId)
  return app
}

mountApp()
