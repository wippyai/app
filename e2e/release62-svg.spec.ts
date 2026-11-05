import type { Frame, Locator, Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { capturedWireMessages, findVisible, installAttentionWireTap, openPersistedSession, sessionMessages, startDeterministicAttentionChat, waitForAgentText } from './helpers/attention'
import { loginAsAdmin } from './helpers/login'
import { useLocalReleaseAssets } from './helpers/release62'

test.skip(process.env.RELEASE62_LOCAL_ASSETS !== '1' && process.env.RELEASE62_PUBLISHED !== '1', 'Requires the release smoke fixture and Host URL')

const localHost = process.env.RELEASE62_HOST_URL || 'http://localhost:5175'
const cell = `${process.env.WIPPY_LAYOUT}-${process.env.WIPPY_ENGINE}`
const screenshotDir = resolve(process.cwd(), '.local/screenshots/2026-10-08-[completed]-release62-svg')
const svgTags = {
  svg: ['viewBox', 'preserveAspectRatio', 'width', 'height', 'role', 'aria-label'],
  defs: [],
  linearGradient: ['id', 'x1', 'x2', 'y1', 'y2'],
  stop: ['offset', 'stop-color'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'fill'],
  text: ['x', 'y', 'fill', 'font-size', 'font-family', 'font-weight'],
}
const svgSource = `<svg viewBox="0 0 560 210" preserveAspectRatio="xMidYMid meet" width="100%" height="210" role="img" aria-label="Release 62 SVG chart" onload="window.__release62Unsafe=1">
<defs><linearGradient id="release62Blue" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#2563eb"></stop><stop offset="1" stop-color="#38bdf8"></stop></linearGradient></defs>
<rect x="0" y="0" width="560" height="210" rx="12" fill="#f1f5f9"></rect>
<text x="24" y="34" fill="#0f172a" font-size="20" font-family="Arial" font-weight="600">SVG rendering smoke</text>
<text x="24" y="73" fill="#334155" font-size="16" font-family="Arial">Shared config</text><rect x="160" y="52" width="350" height="28" rx="5" fill="url(#release62Blue)"></rect>
<text x="24" y="118" fill="#334155" font-size="16" font-family="Arial">Child scope</text><rect x="160" y="97" width="280" height="28" rx="5" fill="#0ea5e9"></rect>
<text x="24" y="163" fill="#334155" font-size="16" font-family="Arial">Chat scope</text><rect x="160" y="142" width="210" height="28" rx="5" fill="#14b8a6" onclick="window.__release62Unsafe=2"></rect>
<a href="javascript:window.__release62Unsafe=3">Unsafe link</a><script>window.__release62Unsafe=4</script>
</svg>`

function failuresFor(page: Page) {
  const failures: string[] = []
  const navigationCancellations: string[] = []
  let navigating = false
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || message.text().startsWith('Attention: Dont use config.auth'))
      failures.push(message.text())
  })
  page.on('requestfailed', request => {
    const error = request.failure()?.errorText
    const failure = `${error} ${new URL(request.url()).pathname}`
    if (navigating && error === 'net::ERR_ABORTED')
      navigationCancellations.push(failure)
    else
      failures.push(failure)
  })
  page.on('response', response => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })
  return {
    failures,
    navigationCancellations,
    async navigate(action: () => Promise<unknown>) {
      navigating = true
      try {
        await action()
        await page.waitForLoadState('networkidle')
      }
      finally {
        navigating = false
      }
    },
  }
}

async function configure(page: Page) {
  await useLocalReleaseAssets(page)
  await page.route('**/api/public/facade/config', async route => {
    const response = await route.fetch()
    const config = await response.json()
    await route.fulfill({ response, json: {
      ...config,
      allowAdditionalTags: svgTags,
      allowSelectModel: true,
      hostConfig: { ...config.hostConfig, allowAdditionalTags: svgTags },
    } })
  })
  await loginAsAdmin(page)
  await childFrame(page)
}

async function childFrame(page: Page): Promise<Frame> {
  let child: Frame | undefined
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      const ownsPage = await frame.evaluate(() => (window as any).__WIPPY_APP_CONFIG__?.selfPageId === 'app.views:main'
        && Boolean((window as any).__WIPPY_APP_API__)).catch(() => false)
      const visible = frame.name().startsWith('wf:')
        ? await page.locator(`web-fragment[fragment-id="${frame.name().slice(3)}"]`).isVisible()
        : await frame.frameElement().then(element => element.isVisible()).catch(() => false)
      if (ownsPage && visible) {
        child = frame
        return true
      }
    }
    return false
  }, { timeout: 30_000 }).toBe(true)
  return child!
}

async function pushChildTags(child: Frame, tags: Record<string, string[]>) {
  await child.evaluate(({ tags, fragmentId }) => {
    window.postMessage(JSON.stringify({
      $schema: '/schemas/wippy-context-2.1.json', type: '@gen2-chat', action: 'set-config', fragmentId, allowAdditionalTags: tags,
    }), '*')
  }, { tags, fragmentId: process.env.WIPPY_ENGINE === 'fragment' ? child.name().slice(3) : undefined })
  await expect.poll(() => child.evaluate(() => Boolean((window as any).__WIPPY_APP_CONFIG__?.allowAdditionalTags?.svg))).toBe(Boolean(tags.svg))
}

async function verifySvg(svg: Locator) {
  await expect(svg).toBeVisible()
  await expect(svg).toHaveAttribute('viewBox', '0 0 560 210')
  await expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
  await expect(svg.locator('linearGradient')).toHaveAttribute('id', 'release62Blue')
  await expect(svg.locator('rect')).toHaveCount(4)
  await expect(svg.locator('script, [onload], [onclick], [href^="javascript:"]')).toHaveCount(0)
  await expect(svg).not.toHaveAttribute('onload')
  const bounds = await svg.boundingBox()
  expect(bounds!.width).toBeGreaterThan(200)
  expect(bounds!.height).toBeGreaterThan(100)
  expect(await svg.evaluate(() => (window as any).__release62Unsafe)).toBeUndefined()
}

async function capture(target: Locator, name: string) {
  await mkdir(screenshotDir, { recursive: true })
  await target.scrollIntoViewIfNeeded()
  const path = resolve(screenshotDir, `${cell}-${name}.png`)
  const bounds = await target.boundingBox()
  if (bounds && bounds.height > 500) {
    const heading = target.getByRole('heading').first()
    await heading.scrollIntoViewIfNeeded()
    const titleBounds = await heading.boundingBox()
    const viewport = await target.page().evaluate(() => ({ width: innerWidth, height: innerHeight }))
    const x = Math.max(0, bounds.x)
    const y = Math.max(0, titleBounds!.y - 12)
    await target.page().screenshot({ path, animations: 'disabled', clip: {
      x, y, width: Math.min(bounds.width, viewport.width - x), height: Math.min(380, viewport.height - y),
    } })
  }
  else {
    await target.screenshot({ path, animations: 'disabled' })
  }
  return path
}

test('release 62 SVG: persisted chat and child chat WC render and react to config', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const signals = failuresFor(page)
  await installAttentionWireTap(page)
  await configure(page)
  const composer = await startDeterministicAttentionChat(page, 'app.attention_compat:agent_a')
  const marker = `Release 62 SVG ${cell} ${Date.now()}`
  const message = `## ${marker}\n\n${svgSource}`
  await composer.fill(message)
  await composer.press('Enter')
  const reply = await waitForAgentText(page, marker)
  await expect(reply).toContainText('Compatibility reply complete.')
  const chatSvg = reply.locator('svg[aria-label="Release 62 SVG chart"]')
  await verifySvg(chatSvg)
  await testInfo.attach('chat-svg', { path: await capture(reply, 'chat'), contentType: 'image/png' })

  let sessionId = ''
  await expect.poll(async () => {
    const sent = (await capturedWireMessages(page)).find(command => command.type === 'session_message' && command.data.text === message)
    if (sent?.type === 'session_message')
      sessionId = sent.session_id
    return Boolean(sessionId)
  }).toBe(true)
  expect((await sessionMessages(page, sessionId)).some(item => item.type !== 'user' && item.data.includes(svgSource))).toBe(true)
  await signals.navigate(() => page.reload())
  await openPersistedSession(page, sessionId)
  const restored = await waitForAgentText(page, marker)
  await verifySvg(restored.locator('svg[aria-label="Release 62 SVG chart"]'))

  const currentChild = await childFrame(page)
  await currentChild.evaluate(async ({ hostUrl, sessionId }) => {
    await import(`${hostUrl}/@wippy-fe/chat.js`)
    await customElements.whenDefined('wippy-chat')
    const fixture = document.createElement('section')
    fixture.setAttribute('data-testid', 'release62-svg-child-chat')
    const heading = document.createElement('h2')
    heading.textContent = 'Child chat WC SVG smoke'
    fixture.appendChild(heading)
    const chat = document.createElement('wippy-chat')
    chat.setAttribute('session-id', sessionId)
    chat.setAttribute('show-selector', 'false')
    chat.style.cssText = 'display:block;height:700px'
    fixture.appendChild(chat)
    document.body.prepend(fixture)
  }, { hostUrl: localHost, sessionId })
  const childChat = await findVisible(page, root => root.getByTestId('release62-svg-child-chat'), 'child chat SVG fixture')
  const childSvg = childChat.locator('.chat-message--agent-message svg[aria-label="Release 62 SVG chart"]')
  await verifySvg(childSvg)
  await pushChildTags(currentChild, {})
  await expect(childSvg).toHaveCount(0)
  await pushChildTags(currentChild, svgTags)
  await verifySvg(childSvg)
  await testInfo.attach('child-chat-svg', { path: await capture(childChat.locator('.chat-message--agent-message').filter({ hasText: marker }), 'child-chat-wc'), contentType: 'image/png' })
  expect(signals.failures).toEqual([])
  await testInfo.attach('svg-proof', { body: JSON.stringify({ cell, sessionId, persisted: true, unsafeContentRemoved: true, childConfigRemovalAndRestore: true, navigationCancellations: signals.navigationCancellations }), contentType: 'application/json' })
})

test('release 62 SVG: installed markdown component renders SVG in child and chat', async ({ page }, testInfo) => {
  test.skip(true, 'The installed wippy-markdown SVG fix is released from its separate repository')
  test.setTimeout(60_000)
  const signals = failuresFor(page)
  await configure(page)
  const child = await childFrame(page)
  const tags = await child.evaluate(async content => {
    const api = await (window as any).getWippyApi()
    await api.loadByTagName('wippy-markdown')
    const fixture = document.createElement('section')
    fixture.setAttribute('data-testid', 'release62-svg-child-markdown')
    const markdown = document.createElement('wippy-markdown')
    markdown.setAttribute('content', `## Child markdown SVG smoke\n\n${content}`)
    fixture.appendChild(markdown)
    document.body.prepend(fixture)
    return { requestedTagDefined: Boolean(customElements.get('w-markdown')), installedTagDefined: Boolean(customElements.get('wippy-markdown')) }
  }, svgSource)
  const fixture = await findVisible(page, root => root.getByTestId('release62-svg-child-markdown'), 'installed child markdown fixture')
  await expect(fixture.getByRole('heading', { name: 'Child markdown SVG smoke', exact: true })).toBeVisible()
  await pushChildTags(child, {})
  await pushChildTags(child, svgTags)
  const renderedSvg = fixture.locator('article svg[aria-label="Release 62 SVG chart"]')
  const result = { cell, ...tags, svgCount: await renderedSvg.count(), rawSvgEscaped: (await fixture.locator('article').innerText()).includes('<svg') }
  await testInfo.attach('child-markdown-svg', { path: await capture(fixture, 'child-markdown'), contentType: 'image/png' })
  const composer = await startDeterministicAttentionChat(page, 'app.attention_compat:agent_a')
  const marker = `Markdown widget SVG ${cell} ${Date.now()}`
  const content = `## Chat markdown SVG smoke\n\n${svgSource}`
  const encoded = content.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '&#10;')
  await composer.fill(`## ${marker}\n\n<wippy-markdown content="${encoded}"></wippy-markdown>`)
  await composer.press('Enter')
  const reply = await waitForAgentText(page, marker)
  await expect(reply).toContainText('Compatibility reply complete.')
  const chatMarkdown = reply.locator('wippy-markdown')
  await expect(chatMarkdown.getByRole('heading', { name: 'Chat markdown SVG smoke', exact: true })).toBeVisible()
  const chatSvg = chatMarkdown.locator('article svg[aria-label="Release 62 SVG chart"]')
  Object.assign(result, { chatSvgCount: await chatSvg.count(), chatRawSvgEscaped: (await chatMarkdown.locator('article').innerText()).includes('<svg') })
  await testInfo.attach('chat-markdown-svg', { path: await capture(reply, 'chat-markdown'), contentType: 'image/png' })
  await testInfo.attach('markdown-proof', { body: JSON.stringify(result), contentType: 'application/json' })
  console.log('RELEASE62_MARKDOWN_SVG_PROOF', JSON.stringify(result))
  expect(signals.failures).toEqual([])
  await expect.soft(renderedSvg, 'The installed child markdown component must render SVG rather than escaped source').toHaveCount(1)
  await expect.soft(chatSvg, 'The markdown widget embedded in chat must render SVG rather than escaped source').toHaveCount(1)
  if (await renderedSvg.count())
    await verifySvg(renderedSvg)
  if (await chatSvg.count())
    await verifySvg(chatSvg)
})
