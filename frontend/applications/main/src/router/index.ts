import type { HostApi, ProxyApiInstance } from '../types'
import type { Router } from 'vue-router'
import { createAppRouter as createAppRouterFactory } from '@wippy-fe/router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/home.vue'),
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('../pages/users.vue'),
  },
  {
    path: '/components',
    name: 'components',
    component: () => import('../pages/components.vue'),
  },
  {
    path: '/research',
    name: 'research',
    component: () => import('../pages/research.vue'),
  },
  {
    path: '/iframe-demo',
    name: 'iframe-demo',
    component: () => import('../pages/iframe-demo.vue'),
  },
  {
    path: '/nested-nav/:part(.*)*',
    name: 'nested-nav',
    component: () => import('../pages/nested-nav.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/',
  },
]

/**
 * Create the subapp router using @wippy-fe/router's canonical factory.
 * The factory encapsulates:
 *   - createMemoryHistory (srcdoc-compatible)
 *   - afterEach → host.onRouteChanged
 *   - @history subscription → parent → child URL mirroring
 */
export function createAppRouter(host: HostApi, on: ProxyApiInstance['on'] | null, initialPath: string): Router {
  return createAppRouterFactory(routes, {
    host: host as never,
    on: on as never,
    initialPath,
  })
}
