import type { HostApi } from '../types'
import type { Router } from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'

type OnSubscription = (
  pattern: string,
  callback: (event: { path?: string, message?: unknown }) => void,
) => void

const routes = [
  { path: '/', name: 'home', component: () => import('../pages/history.vue') },
  { path: '/display-settings', name: 'display-settings', component: () => import('../pages/display-settings.vue') },
  { path: '/upload-log', name: 'upload-log', component: () => import('../pages/upload-log.vue') },
  { path: '/asset/:id', name: 'asset', component: () => import('../pages/asset-detail.vue'), props: true },
  { path: '/:pathMatch(.*)*', name: 'not-found', redirect: '/' },
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
      const normalized = path.startsWith('/') ? path : `/${path}`
      if (router.currentRoute.value.fullPath !== normalized) {
        router.push(normalized)
      }
    })
  }

  return router
}
