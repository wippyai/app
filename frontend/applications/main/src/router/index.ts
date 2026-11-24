import type { HostApi, OnTopic } from '../types'
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
    path: '/attention-tracer',
    name: 'attention-tracer',
    component: () => import('../pages/attention-tracer.vue'),
  },
  // Any other path may belong to a page from the registry (for example a
  // dashboard at /reports/llm-usage): it opens inside this app, under the
  // sidebar. A path that no listed page owns redirects to Home.
  {
    path: '/:pathMatch(.*)*',
    name: 'hosted-page',
    component: () => import('../pages/hosted-page.vue'),
  },
]

/**
 * Create the subapp router using @wippy-fe/router's canonical factory.
 * The factory encapsulates:
 *   - createMemoryHistory (srcdoc-compatible)
 *   - afterEach → host.onRouteChanged
 *   - @history subscription → parent → child URL mirroring
 */
export function createAppRouter(host: HostApi, on: OnTopic | null, initialPath: string): Router {
  return createAppRouterFactory(routes, {
    host: host as never,
    on: on as never,
    initialPath,
  })
}
