import { createAppRouter } from '@wippy-fe/router'
import { loadByTagName } from '@wippy-fe/proxy'
import { toSubPath } from './subPath'
import './styles.css'

const TAG = 'dashboard-layout'

interface PageProps {
  'page-url': string
  layout: unknown
  tiles: unknown
  params: unknown
}

function showUnavailable(root: HTMLElement): void {
  const msg = document.createElement('div')
  msg.className = 'dashboard-page__unavailable'
  msg.textContent = 'This page is not available.'
  root.replaceChildren(msg)
}

async function fetchProps(pageId: string): Promise<PageProps | null> {
  const api = await window.$W.api()
  const res = await api.get(`/api/v1/dashboards/pages/${encodeURIComponent(pageId)}/props`, {
    // 403 and 404 are expected answers, not exceptions.
    validateStatus: () => true,
  })
  return res.status === 200 && res.data ? (res.data as PageProps) : null
}

async function main(): Promise<void> {
  const root = document.getElementById('app')
  if (!root)
    return

  const config = await window.$W.config()
  // Host 1.0.68 passes the view.page entry id (wippy.dashboards.pages:<page id>) as resourceId,
  // not the entry's meta.resource_id, so keep only the part after the namespace.
  const resourceId = config.context?.resourceId ? String(config.context.resourceId) : ''
  const pageId = resourceId.slice(resourceId.lastIndexOf(':') + 1)
  const initialRoute = config.context?.route

  const props = pageId ? await fetchProps(pageId) : null
  if (!props) {
    showUnavailable(root)
    return
  }

  await loadByTagName(TAG)

  const el = document.createElement(TAG)
  el.setAttribute('sub-path', toSubPath(initialRoute))
  el.setAttribute('page-url', props['page-url'])
  el.setAttribute('layout', JSON.stringify(props.layout))
  el.setAttribute('tiles', JSON.stringify(props.tiles))
  el.setAttribute('params', JSON.stringify(props.params))

  const host = document.createElement('div')
  host.className = 'dashboard-page__host'
  host.append(el)
  root.replaceChildren(host)

  // Follow Host navigation (including browser back and forward). Only the
  // attribute changes: the element and its props stay.
  const router = createAppRouter(
    [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
    { initialPath: initialRoute || '/' },
  )
  router.afterEach((to) => {
    const next = toSubPath(to.path)
    if (el.getAttribute('sub-path') !== next)
      el.setAttribute('sub-path', next)
  })
  await router.replace(initialRoute || '/')
}

main()
