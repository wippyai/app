import type { Router } from 'vue-router'
import type { HostApi, ProxyApiInstance } from '../types'
import { createMemoryHistory, createRouter } from 'vue-router'

// Reuse the proxy's exact `on()` typing instead of redeclaring a looser
// alias — gives correct `@history` callback inference and tracks upstream
// signature changes automatically.
type ProxyOn = ProxyApiInstance['on']

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/chart.vue'),
  },
  {
    path: '/chart',
    name: 'chart',
    component: () => import('../pages/chart.vue'),
  },
  {
    path: '/counter',
    name: 'counter',
    component: () => import('../pages/counter.vue'),
  },
  {
    path: '/mermaid',
    name: 'mermaid',
    component: () => import('../pages/mermaid.vue'),
  },
  {
    path: '/bridge',
    name: 'bridge',
    component: () => import('../pages/bridge.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/',
  },
]

export function createAppRouter(host: HostApi, on: ProxyOn | null, initialPath: string): Router {
  const history = createMemoryHistory()
  history.replace(initialPath)
  const router = createRouter({ history, routes })

  router.afterEach((to) => {
    host.onRouteChanged(to.fullPath)
  })

  if (on) {
    on('@history', ({ path }) => {
      if (!path)
        return
      const normalized = path.startsWith('/') ? path : `/${path}`
      if (router.currentRoute.value.fullPath !== normalized)
        router.push(normalized)
    })
  }

  return router
}
