import type { HostApi } from '../types'
import type { Router } from 'vue-router'
import { createAppRouter as createAppRouterFactory } from '@wippy-fe/router'

type OnSubscription = (
  pattern: string,
  callback: (event: { path?: string, message?: unknown }) => void,
) => void

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
  // Former standalone demo pages now live as tabs on /components.
  {
    path: '/iframe-demo',
    redirect: { name: 'components', query: { tab: 'iframe' } },
  },
  {
    path: '/nested-nav/:part(.*)*',
    redirect: { name: 'components', query: { tab: 'nested' } },
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
export function createAppRouter(host: HostApi, on: OnSubscription | null, initialPath: string): Router {
  return createAppRouterFactory(routes, {
    host: host as never,
    on: on as never,
    initialPath,
  })
}
