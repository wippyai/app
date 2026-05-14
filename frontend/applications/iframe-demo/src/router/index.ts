import type { HostApi } from '../types'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'

type OnSubscription = (
  pattern: string,
  callback: (event: { path?: string; message?: unknown }) => void,
) => void

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
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/',
  },
]

export function createAppRouter(host: HostApi, on: OnSubscription | null, initialPath: string): Router {
  const history = createMemoryHistory()
  history.replace(initialPath)
  const router = createRouter({ history, routes })

  router.afterEach((to) => {
    host.onRouteChanged(to.fullPath)
  })

  if (on) {
    on('@history', ({ path }) => {
      if (!path) return
      const normalized = path.startsWith('/') ? path : '/' + path
      if (router.currentRoute.value.fullPath !== normalized) {
        router.push(normalized)
      }
    })
  }

  return router
}
