import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

type AttentionEngine = 'iframe' | 'fragment'
type AttentionLayout = 'compat' | 'managed'

function requiredOption<T extends string>(name: string, allowed: readonly T[]): T {
  const value = process.env[name]
  if (!value || !allowed.includes(value as T))
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  return value as T
}

const layout = requiredOption<AttentionLayout>('WIPPY_LAYOUT', ['compat', 'managed'])
const engine = requiredOption<AttentionEngine>('WIPPY_ENGINE', ['iframe', 'fragment'])

async function findVisibleTestId(page: Page, testId: string): Promise<Locator> {
  return findVisibleSelector(page, `[data-testid="${testId}"]`, testId)
}

async function findVisibleSelector(page: Page, selector: string, description: string): Promise<Locator> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const candidates = [page.locator(selector), ...page.frames().map(frame => frame.locator(selector))]
    for (const candidate of candidates) {
      try {
        if (await candidate.count() === 1 && await candidate.isVisible())
          return candidate
      }
      catch {
        // A page transition may detach a candidate between discovery and use.
      }
    }
    await page.waitForTimeout(100)
  }
  const diagnostics = await Promise.all([page, ...page.frames()].map(async (root) => {
    const candidate = root.locator(selector)
    const count = await candidate.count().catch(() => -1)
    const visible = count > 0
      ? await candidate.first().isVisible().catch(() => false)
      : false
    return {
      count,
      root: root.url(),
      visible,
    }
  }))
  throw new Error(`Visible fixture target not found: ${description}; ${JSON.stringify(diagnostics)}`)
}

async function physicalIdentity(target: Locator): Promise<string[]> {
  return target.evaluate((leaf) => {
    const identity: string[] = []
    const seen = new Set<Node>()
    let current: Node | null = leaf

    while (current && !seen.has(current)) {
      seen.add(current)
      if (current.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
        identity.push('#shadow-root')
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as Element
        const attributes: Array<[string, string | null]> = [
          ['testid', element.getAttribute('data-testid')],
          ['fixture', element.getAttribute('data-attention-fixture-id')],
          ['id', element.getAttribute('id')],
          ['fragment', element.getAttribute('fragment-id')],
          ['mount', element.getAttribute('data-wippy-mount-id')],
        ]
        const suffix = attributes.flatMap(([name, value]) => value ? [`[${name}=${value}]`] : [])
        identity.push(`${element.localName}${suffix.join('')}`)
      }

      if (current.parentNode) {
        current = current.parentNode
        continue
      }

      const shadowHost: Element | null = current.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? (current as ShadowRoot).host
        : null
      if (shadowHost) {
        current = shadowHost
        continue
      }

      const ownerDocument: Document | null = current.nodeType === Node.DOCUMENT_NODE
        ? current as Document
        : current.ownerDocument
      const frameElement: Element | null = ownerDocument?.defaultView?.frameElement ?? null
      if (frameElement) {
        current = frameElement
        continue
      }

      current = null
    }

    return identity
  })
}

async function numericAttribute(locator: Locator, name: string): Promise<number> {
  return Number(await locator.getAttribute(name) ?? 0)
}

async function bootTracer(page: Page) {
  await loginAsAdmin(page)
  await page.goto('/home/attention-tracer')

  if (layout === 'managed') {
    await expect(page.locator('.managed-layout-shell')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.wippy-host-app')).toHaveCount(0)
  }
  else {
    await expect(page.locator('.wippy-host-app')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.managed-layout-shell')).toHaveCount(0)
  }

  return {
    leftChild: await findVisibleTestId(page, 'attention-child-left'),
    rightChild: await findVisibleTestId(page, 'attention-child-right'),
    leftBridge: await findVisibleTestId(page, 'attention-bridge-left'),
    rightBridge: await findVisibleTestId(page, 'attention-bridge-right'),
    leftNestedArtifact: await findVisibleSelector(
      page,
      'w-artifact[data-testid="attention-nested-artifact-left"]',
      'left nested w-artifact host',
    ),
    rightNestedArtifact: await findVisibleSelector(
      page,
      'w-artifact[data-testid="attention-nested-artifact-right"]',
      'right nested w-artifact host',
    ),
    leftTarget: await findVisibleTestId(page, 'attention-target-left'),
    rightTarget: await findVisibleTestId(page, 'attention-target-right'),
    leftSafeText: await findVisibleTestId(page, 'attention-safe-text-left'),
    rightSafeText: await findVisibleTestId(page, 'attention-safe-text-right'),
  }
}

test.describe(`Attention tracer: ${layout}/${engine}`, () => {
  test('keeps nested navigation in sync through tab clicks, browser history and reload', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/home/nested-nav')
    const findNested = async (selector: string) => {
      const owner = await findVisibleSelector(page, 'w-artifact[nav-owner]', 'nested navigation owner')
      if (engine === 'fragment')
        return owner.locator(selector)
      const handle = await owner.locator('iframe').elementHandle()
      const frame = await handle?.contentFrame()
      await handle?.dispose()
      if (!frame)
        throw new Error('Nested navigation owner has no execution frame')
      return frame.locator(selector)
    }
    await expect(await findNested('h2:has-text("Theme Colors Chart")')).toBeVisible()
    await (await findNested('a[href$="/counter"]')).click()
    await expect(page).toHaveURL(/\/home\/nested-nav\/counter$/)
    await expect(await findNested('h2:has-text("Counter with Persistence")')).toBeVisible()
    await (await findNested('a[href$="/mermaid"]')).click()
    await expect(page).toHaveURL(/\/home\/nested-nav\/mermaid$/)
    await expect(await findNested('h2:has-text("Mermaid Diagram")')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/home\/nested-nav\/counter$/)
    await expect(await findNested('h2:has-text("Counter with Persistence")')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/home\/nested-nav$/)
    await expect(await findNested('h2:has-text("Theme Colors Chart")')).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/\/home\/nested-nav\/counter$/)
    await expect(await findNested('h2:has-text("Counter with Persistence")')).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/\/home\/nested-nav\/counter$/)
    await expect(await findNested('h2:has-text("Counter with Persistence")')).toBeVisible()
  })

  test('loads the complete nested fixture through real package routes', async ({ page }) => {
    const {
      leftBridge,
      rightBridge,
      leftNestedArtifact,
      rightNestedArtifact,
      leftSafeText,
      rightSafeText,
    } = await bootTracer(page)

    await expect(leftBridge).toHaveAttribute('data-attention-fixture-id', 'web-component-left')
    await expect(rightBridge).toHaveAttribute('data-attention-fixture-id', 'web-component-right')
    await expect(leftNestedArtifact).toHaveAttribute('sub-path', '/attention-leaf/left')
    await expect(rightNestedArtifact).toHaveAttribute('sub-path', '/attention-leaf/right')
    await expect(leftSafeText).toHaveText('Safe text for the left nested target')
    await expect(rightSafeText).toHaveText('Safe text for the right nested target')
  })

  test('keeps both deep identities on one exact sibling boundary', async ({ page }) => {
    const { leftChild, rightChild, leftTarget, rightTarget, leftSafeText, rightSafeText } = await bootTracer(page)

    const leftBox = await leftChild.boundingBox()
    const rightBox = await rightChild.boundingBox()
    expect(leftBox).not.toBeNull()
    expect(rightBox).not.toBeNull()
    expect(Math.abs((leftBox!.x + leftBox!.width) - rightBox!.x)).toBeLessThanOrEqual(1)

    const leftTargetBox = await leftTarget.boundingBox()
    const rightTargetBox = await rightTarget.boundingBox()
    expect(leftTargetBox).not.toBeNull()
    expect(rightTargetBox).not.toBeNull()
    expect(Math.abs((leftTargetBox!.x + leftTargetBox!.width) - rightTargetBox!.x)).toBeLessThanOrEqual(2)

    const leftIdentity = await physicalIdentity(leftSafeText)
    const rightIdentity = await physicalIdentity(rightSafeText)

    expect(leftIdentity.join(' > ')).toContain('span[testid=attention-safe-text-left][fixture=safe-text-left]')
    expect(leftIdentity.join(' > ')).toContain('button[testid=attention-target-left][fixture=interactive-leaf-left]')
    expect(leftIdentity.join(' > ')).toContain('wippy-attention-bridge-fixture[testid=attention-bridge-left][fixture=web-component-left]')
    expect(leftIdentity.join(' > ')).toContain('w-artifact[testid=attention-nested-artifact-left][fixture=nested-artifact-left][id=app.views:iframe-demo]')
    expect(leftIdentity.join(' > ')).toContain('w-artifact[id=app.views:iframe-demo]')
    expect(leftIdentity.filter(segment => segment === '#shadow-root').length).toBeGreaterThanOrEqual(2)
    expect(rightIdentity.join(' > ')).toContain('span[testid=attention-safe-text-right][fixture=safe-text-right]')
    expect(rightIdentity.join(' > ')).toContain('button[testid=attention-target-right][fixture=interactive-leaf-right]')
    expect(rightIdentity.join(' > ')).toContain('wippy-attention-bridge-fixture[testid=attention-bridge-right][fixture=web-component-right]')
    expect(rightIdentity.join(' > ')).toContain('w-artifact[testid=attention-nested-artifact-right][fixture=nested-artifact-right][id=app.views:iframe-demo-themed]')
    expect(rightIdentity.join(' > ')).toContain('w-artifact[id=app.views:iframe-demo-themed]')
    expect(rightIdentity.filter(segment => segment === '#shadow-root').length).toBeGreaterThanOrEqual(2)

    const expectedBoundary = engine === 'fragment' ? 'web-fragment' : 'iframe'
    expect(leftIdentity.filter(segment => segment.startsWith(expectedBoundary)).length).toBeGreaterThanOrEqual(2)
    expect(rightIdentity.filter(segment => segment.startsWith(expectedBoundary)).length).toBeGreaterThanOrEqual(2)
  })

  test('delivers trusted pointer, focus, and keyboard input to both edge targets', async ({ page }) => {
    const { leftChild, rightChild, leftTarget, rightTarget } = await bootTracer(page)

    await page.mouse.move(0, 0)
    await leftTarget.hover()
    await expect(leftTarget).toHaveAttribute('data-last-pointer-trusted', 'true')
    await expect(leftTarget).toHaveAttribute('data-last-pointer-type', 'mouse')

    const leftChildBox = await leftChild.boundingBox()
    const rightChildBox = await rightChild.boundingBox()
    expect(leftChildBox).not.toBeNull()
    expect(rightChildBox).not.toBeNull()
    const boundaryX = (leftChildBox!.x + leftChildBox!.width + rightChildBox!.x) / 2
    const sharedTop = Math.max(leftChildBox!.y, rightChildBox!.y)
    const sharedBottom = Math.min(
      leftChildBox!.y + leftChildBox!.height,
      rightChildBox!.y + rightChildBox!.height,
    )
    const targetY = sharedTop + (sharedBottom - sharedTop) / 2

    const leftMoves = await numericAttribute(leftTarget, 'data-pointer-move-count')
    await page.mouse.move(boundaryX - 6, targetY)
    await expect.poll(() => numericAttribute(leftTarget, 'data-pointer-move-count')).toBeGreaterThan(leftMoves)

    const rightMoves = await numericAttribute(rightTarget, 'data-pointer-move-count')
    await page.mouse.move(boundaryX + 6, targetY)
    await expect.poll(() => numericAttribute(rightTarget, 'data-pointer-move-count')).toBeGreaterThan(rightMoves)
    await expect(rightTarget).toHaveAttribute('data-last-pointer-trusted', 'true')

    await rightTarget.click()
    await expect(rightTarget).toHaveAttribute('data-pointer-down-count', /[1-9]\d*/)
    await rightTarget.focus()
    await expect(rightTarget).toHaveAttribute('data-focus-trusted', 'true')
    await page.keyboard.press('KeyA')
    await expect(rightTarget).toHaveAttribute('data-key-trusted', 'true')
    await expect(rightTarget).toHaveAttribute('data-last-key', 'KeyA')
  })

  test('delivers a trusted touch pointer to the deeply nested target', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'requires the dedicated Chromium touch project')
    const { leftTarget } = await bootTracer(page)
    const targetBox = await leftTarget.boundingBox()
    expect(targetBox).not.toBeNull()
    const before = await numericAttribute(leftTarget, 'data-pointer-down-count')

    await page.touchscreen.tap(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
    )

    await expect.poll(() => numericAttribute(leftTarget, 'data-pointer-down-count')).toBeGreaterThan(before)
    await expect(leftTarget).toHaveAttribute('data-last-pointer-trusted', 'true')
    await expect(leftTarget).toHaveAttribute('data-last-pointer-type', 'touch')
  })
})
