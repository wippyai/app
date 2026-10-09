import type { Frame, Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { findVisible } from './helpers/attention'
import { loginAsAdmin } from './helpers/login'
import { useLocalReleaseAssets } from './helpers/release62'

test.skip(process.env.RELEASE62_LOCAL_ASSETS !== '1' && process.env.RELEASE62_PUBLISHED !== '1', 'Requires the release smoke fixture and Host URL')

const localHost = process.env.RELEASE62_HOST_URL || 'http://localhost:5175'
const svgTags = { svg: ['viewBox', 'preserveAspectRatio'], path: ['d', 'fill'] }

function collectFailures(page: Page) {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  if (process.env.RELEASE62_PUBLISHED === '1') {
    const missingCdn = 'No deployed CDN assets were requested'
    failures.push(missingCdn)
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.hostname !== 'web-host.wippy.ai') return
      const missingIndex = failures.indexOf(missingCdn)
      if (missingIndex >= 0) failures.splice(missingIndex, 1)
      if (!url.pathname.startsWith('/webcomponents-1.0.62/'))
        failures.push(`Unexpected CDN version: ${url.pathname}`)
    })
  }
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('Attention: Dont use config.auth'))
      failures.push(message.text())
  })
  page.on('response', async (response) => {
    if (response.status() < 400) return
    const url = new URL(response.url())
    failures.push(`${response.status()} ${url.pathname}`)
    if (url.pathname === '/api/v1/sessions/messages') {
      const body = await response.json().catch(() => ({}))
      console.log('release62 failed message read', { sessionId: url.searchParams.get('session_id'), error: body.error, message: body.message })
    }
  })
  return failures
}

async function childFrame(page: Page): Promise<Frame> {
  let child: Frame | undefined
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      const ownsPage = await frame.evaluate(() => (window as any).__WIPPY_APP_CONFIG__?.selfPageId === 'app.views:main'
        && Boolean((window as any).__WIPPY_APP_API__)).catch(() => false)
      const visible = process.env.WIPPY_ENGINE === 'fragment' && frame.name().startsWith('wf:')
        ? await page.locator(`web-fragment[fragment-id="${frame.name().slice(3)}"]`).isVisible()
        : frame === page.mainFrame() || await frame.frameElement().then(element => element.isVisible()).catch(() => false)
      if (ownsPage && visible) {
        child = frame
        return true
      }
    }
    return false
  }, { timeout: 30_000 }).toBe(true)
  return child!
}

async function findMain(page: Page, locate: (root: Frame | Locator) => Locator, description: string) {
  const frame = await childFrame(page)
  const root = process.env.WIPPY_ENGINE === 'fragment'
    ? page.locator(`web-fragment[fragment-id="${frame.name().slice(3)}"]`)
    : frame
  const target = locate(root)
  await expect(target, description).toBeVisible({ timeout: 20_000 })
  return target
}

async function assertThemedEmbeds(page: Page) {
  for (const id of ['app.views:iframe-demo', 'app.views:iframe-demo-themed']) {
    const artifact = await findMain(page, root => root.locator(`w-artifact[id="${id}"]`), `nested themed page ${id}`)
    const nativeIframe = artifact.locator('iframe:not([name^="wf:"])')
    const frameHandle = await nativeIframe.count() ? await nativeIframe.elementHandle() : null
    const themeRoot = frameHandle ? await frameHandle.contentFrame() : artifact
    if (!themeRoot) throw new Error(`Missing nested page frame: ${id}`)
    await expect(themeRoot.getByRole('heading', { name: 'Theme Colors Chart', exact: true })).toBeVisible()
    await frameHandle?.dispose()
  }
}

test('release 62: shared child policy, instance overrides, config updates and SVG', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000)
  const failures = collectFailures(page)
  await useLocalReleaseAssets(page)
  const actual = await request.get('/api/public/facade/config')
  expect(actual.ok()).toBe(true)
  const facade = await actual.json()
  expect(facade).toMatchObject({ allowSelectModel: false, hideSessionSelector: true, allowAdditionalTags: {} })
  for (const key of ['allowSelectModel', 'hideSessionSelector', 'allowAdditionalTags'])
    expect(facade.hostConfig).not.toHaveProperty(key)
  // Explicit host overrides prove the boundary while retaining a real facade boot.
  await page.route('**/api/public/facade/config', async (route) => {
    const response = await route.fetch()
    const config = await response.json()
    await route.fulfill({ response, json: { ...config, allowSelectModel: true, hideSessionSelector: false, allowAdditionalTags: svgTags, hostConfig: { ...config.hostConfig, allowSelectModel: false, hideSessionSelector: true, allowAdditionalTags: { 'host-only-tag': ['value'] } } } })
  })
  await loginAsAdmin(page)
  await page.goto('/home')
  const child = await childFrame(page)
  const initial = await child.evaluate(() => {
    const config = (window as any).__WIPPY_APP_CONFIG__
    return { hostConfigPresent: 'hostConfig' in config, allowSelectModel: config.allowSelectModel, hideSessionSelector: config.hideSessionSelector, tags: Object.keys(config.allowAdditionalTags ?? {}), hasAuth: Boolean((window as any).__WIPPY_APP_API__.config.auth?.token) }
  })
  expect(initial).toMatchObject({ hostConfigPresent: false, allowSelectModel: true, hideSessionSelector: false, hasAuth: true })
  expect(initial.tags).toContain('svg')
  expect(initial.tags).not.toContain('host-only-tag')

  await expect.poll(() => page.evaluate(() => Boolean((window as any).__WIPPY_APP_API__?.on))).toBe(true)
  const configNotifications = await page.evaluate(async (tagName) => {
    const api = (window as any).__WIPPY_APP_API__
    customElements.define(tagName, class extends HTMLElement {
      static observedAttributes = ['data-allowed']
    })
    const updates: Array<{ rawAttributes: string[], apiAttributes: string[] }> = []
    const unsubscribe = api.on('@config', () => {
      updates.push({
        rawAttributes: (window as any).__WIPPY_APP_CONFIG__?.allowAdditionalTags?.[tagName] ?? [],
        apiAttributes: api.config.allowAdditionalTags?.[tagName] ?? [],
      })
    })
    const flushMicrotasks = () => new Promise<void>(resolve => queueMicrotask(resolve))
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      const baseline = updates.length
      await api.loadByTagName(tagName)
      await flushMicrotasks()
      const firstLoad = updates.slice(baseline)
      const html = api.sanitize(`<${tagName} data-allowed="yes" data-denied="no"></${tagName}>`)
      const afterFirstLoad = updates.length
      await api.loadByTagName(tagName)
      await flushMicrotasks()
      return {
        firstLoad,
        secondLoad: updates.slice(afterFirstLoad),
        html,
      }
    }
    finally {
      unsubscribe()
    }
  }, 'release62-config-notification')
  expect(configNotifications.firstLoad).toEqual([{ rawAttributes: ['data-allowed'], apiAttributes: ['data-allowed'] }])
  expect(configNotifications.secondLoad).toEqual([])
  expect(configNotifications.html).toContain('data-allowed="yes"')
  expect(configNotifications.html).not.toContain('data-denied')

  let chatSocketReady = false
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    try {
      const message = JSON.parse(typeof payload === 'string' ? payload : payload.toString())
      if (message.topic === 'welcome') chatSocketReady = true
    }
    catch { /* Binary heartbeat frames do not carry a welcome. */ }
  }))
  await child.evaluate(async (hostUrl) => {
    await import(`${hostUrl}/@wippy-fe/chat.js`)
    await customElements.whenDefined('wippy-chat')
    const api = await (window as any).getWippyApi()
    const agents = await api.api.get('/api/v1/agents/list')
    const agent = agents.data.agents.find((item: any) => item.name === 'app.attention_compat:agent_a')
    if (!agent?.start_token) throw new Error('Local deterministic agent is missing')
    ;(window as any).__release62StartToken = agent.start_token
    const container = document.createElement('section')
    container.setAttribute('data-testid', 'release62-fixture')
    for (const id of ['release62-inherited', 'release62-explicit']) {
      const chat = document.createElement('wippy-chat')
      chat.setAttribute('data-testid', id)
      chat.style.cssText = 'display:block;height:480px;margin-bottom:24px'
      if (id === 'release62-explicit') {
        chat.setAttribute('show-selector', 'false')
        chat.setAttribute('allow-select-model', 'false')
      }
      container.appendChild(chat)
    }
    document.body.prepend(container)
  }, localHost)
  await expect.poll(() => chatSocketReady, { message: 'isolated chat socket ready' }).toBe(true)
  await child.evaluate(() => {
    for (const chat of document.querySelectorAll('[data-testid^="release62-"] wippy-chat'))
      chat.setAttribute('start-token', (window as any).__release62StartToken)
    delete (window as any).__release62StartToken
  })
  const inherited = await findVisible(page, root => root.getByTestId('release62-inherited'), 'inherited chat WC')
  const explicit = await findVisible(page, root => root.getByTestId('release62-explicit'), 'explicit chat WC')
  await expect(inherited.locator('.chat-container--with-selector')).toHaveCount(1)
  await expect(explicit.locator('.chat-container--with-selector')).toHaveCount(0)
  const inheritedModel = inherited.locator('.chat-meta-list__model')
  const explicitModel = explicit.locator('.chat-meta-list__model')
  const rendered = process.env.WIPPY_ENGINE === 'fragment' ? page : child
  await expect(inheritedModel).toBeVisible()
  await expect(explicitModel).toBeVisible()
  await inheritedModel.click()
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(1)
  await inheritedModel.click()
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(0)
  await explicitModel.click()
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(0)
  await inheritedModel.click()
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(1)

  // Config broadcasts address the child window in both engines.
  await child.evaluate(({ tags, fragmentId }) => {
    window.postMessage(JSON.stringify({ $schema: '/schemas/wippy-context-2.1.json', type: '@gen2-chat', action: 'set-config', fragmentId, allowSelectModel: false, hideSessionSelector: true, allowAdditionalTags: tags }), '*')
  }, { tags: svgTags, fragmentId: process.env.WIPPY_ENGINE === 'fragment' ? child.name().slice(3) : undefined })
  await expect.poll(() => child.evaluate(() => (window as any).__WIPPY_APP_CONFIG__.hideSessionSelector)).toBe(true)
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(0)
  await expect(inherited.locator('.chat-container--with-selector')).toHaveCount(0)
  await inheritedModel.click()
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(0)
  await child.evaluate(() => {
    document.querySelector('[data-testid="release62-explicit"]')!.setAttribute('show-selector', 'true')
    document.querySelector('[data-testid="release62-explicit"]')!.setAttribute('allow-select-model', 'true')
  })
  await expect(explicit.locator('.chat-container--with-selector')).toHaveCount(1)
  await explicitModel.click()
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(1)
  await explicitModel.click()
  await child.evaluate(() => {
    document.querySelector('[data-testid="release62-explicit"]')!.removeAttribute('allow-select-model')
  })
  await explicitModel.click()
  await expect(rendered.locator('.model-menu:visible')).toHaveCount(0)

  const sanitized = await child.evaluate(async () => {
    const api = await (window as any).getWippyApi()
    const html = api.sanitize('<svg viewBox="0 0 20 20" preserveAspectRatio="xMidYMid meet" onload="alert(1)"><script>alert(1)</script><path d="M0 0h20v20z" fill="red" onclick="alert(1)"></path></svg>')
    const fixture = document.createElement('div')
    fixture.setAttribute('data-testid', 'release62-svg')
    fixture.innerHTML = html
    document.body.prepend(fixture)
    await api.loadByTagName('example-mermaid')
    const widget = api.sanitize('<example-mermaid definition="graph LR; A-->B" data-denied="x"></example-mermaid>')
    const widgetFixture = document.createElement('div')
    widgetFixture.setAttribute('data-testid', 'release62-widget')
    widgetFixture.innerHTML = widget
    document.body.prepend(widgetFixture)
    return { html, widget, definition: widgetFixture.querySelector('example-mermaid')?.getAttribute('definition') }
  })
  expect(sanitized.html).toContain('viewBox="0 0 20 20"')
  expect(sanitized.html).not.toMatch(/script|onload|onclick/)
  expect(sanitized.definition).toBe('graph LR; A-->B')
  expect(sanitized.widget).not.toContain('data-denied')
  const svg = await findVisible(page, root => root.getByTestId('release62-svg').locator('svg'), 'rendered SVG')
  await expect(svg).toHaveAttribute('viewBox', '0 0 20 20')
  const bounds = await svg.boundingBox()
  expect(bounds!.width).toBeGreaterThan(0)
  expect(bounds!.height).toBeGreaterThan(0)
  const diagram = await findVisible(page, root => root.getByTestId('release62-widget').locator('svg'), 'loaded and rendered mermaid WC')
  await expect(diagram).toContainText('A')
  await expect(diagram).toContainText('B')
  expect(failures).toEqual([])
  testInfo.annotations.push({ type: 'release-cell', description: `${process.env.WIPPY_LAYOUT}/${process.env.WIPPY_ENGINE}` })
})

test('release 62: consumer pages, component tabs and every example WC render', async ({ page }) => {
  test.setTimeout(120_000)
  const failures = collectFailures(page)
  await useLocalReleaseAssets(page)
  await page.addInitScript(() => {
    if (window.top === window && location.pathname === '/' && !localStorage.getItem('@wippy_token_info'))
      localStorage.setItem('@wippy_token_info', '{invalid')
  })
  await loginAsAdmin(page)
  await page.goto('/home/users')
  const users = await findMain(page, root => root.getByRole('heading', { name: 'Users', exact: true }), 'Users page')
  await expect(users).toBeVisible()
  const row = await findMain(page, root => root.locator('.p-datatable-tbody tr').first(), 'API-loaded user row')
  await expect(row).toBeVisible()

  await page.goto('/home/components')
  const reaction = await findMain(page, root => root.locator('example-reaction-bar').getByRole('button').first(), 'reaction WC')
  await reaction.click()
  await expect(reaction).toHaveAttribute('aria-pressed', 'true')
  for (const key of ['a', 'b']) {
    const counter = await findMain(page, root => root.locator(`example-counter-persist[persist-key="${key}"]`).getByRole('button', { name: 'Reset' }), `counter WC ${key}`)
    await expect(counter).toBeVisible()
  }
  const log = await findMain(page, root => root.locator('example-websocket-log').getByRole('log', { name: 'WebSocket messages' }), 'WebSocket log WC')
  await expect(log).toBeVisible()
  const chart = await findMain(page, root => root.locator('example-chart-circle canvas'), 'chart WC')
  await expect(chart).toHaveAttribute('aria-label', /Frontend Framework Usage: Vue 40/)
  const mermaid = await findMain(page, root => root.locator('example-mermaid[definition] svg'), 'Mermaid definition WC')
  await expect(mermaid).toContainText('Facade')
  const childrenMermaid = await findMain(page, root => root.locator('example-mermaid:not([definition]) svg'), 'Mermaid children WC')
  await expect(childrenMermaid).toContainText('Register tag')
  const markdown = await findMain(page, root => root.locator('example-markdown').getByRole('heading', { name: 'Web Components', exact: true }), 'markdown WC')
  await expect(markdown).toBeVisible()
  const gallery = await findMain(page, root => root.locator('example-model-gallery').getByRole('list', { name: 'Available models' }), 'API-loaded model gallery WC')
  await expect(gallery).toBeVisible()

  const iframeTab = await findMain(page, root => root.getByRole('tab', { name: 'Iframe Theming', exact: true }), 'iframe tab')
  await iframeTab.click()
  await assertThemedEmbeds(page)
  const chatTab = await findMain(page, root => root.getByRole('tab', { name: 'Chat', exact: true }), 'chat tab')
  await chatTab.click()
  const selector = await findMain(page, root => root.locator('wippy-session-selector').getByRole('combobox', { name: 'Select a session' }), 'standalone session selector WC')
  await expect(selector).toBeVisible()
  const chat = await findMain(page, root => root.locator('wippy-chat .empty-state'), 'chat WC empty state')
  await expect(chat).toBeVisible()

  await page.goto('/home/research')
  const research = await findMain(page, root => root.getByRole('textbox', { name: 'Research query' }), 'Research page')
  await expect(research).toBeVisible()
  await page.goto('/home/iframe-demo')
  await expect(await findMain(page, root => root.getByRole('heading', { name: 'Iframe Demo — Theme Override', exact: true }), 'iframe demo route')).toBeVisible()
  await assertThemedEmbeds(page)
  await page.goto('/home')
  const keeper = await findVisible(page, root => root.getByRole('button', { name: 'Keeper', exact: true }), 'Keeper navigation')
  await keeper.click()
  await expect(page).toHaveURL(/\/c\/keeper:main/)
  await expect(await findVisible(page, root => root.getByText('Registry', { exact: true }).first(), 'Keeper registry UI')).toBeVisible()
  expect(failures).toEqual([])
})
