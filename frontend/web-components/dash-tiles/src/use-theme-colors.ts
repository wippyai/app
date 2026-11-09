import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { Ref } from 'vue'
import type { ChartColors } from './lib/chart.ts'

/**
 * Colours that a canvas needs as text, because Chart.js cannot read a CSS variable.
 *
 * The tile template holds three probe elements whose CSS colour is a theme token (see styles.css,
 * `.dash-probe--*`). The browser resolves the token, so the value is right whatever form the theme
 * writes it in. The composable reads the resolved colour and reads it again when the theme can have
 * changed: the operating system scheme, attributes on the page root or the host element, and changes
 * to the stylesheets in the tile's shadow root. It never writes to the DOM, so it cannot loop.
 */
export function useThemeColors(root: Ref<HTMLElement | null>) {
  const colors = shallowRef<ChartColors | null>(null)
  let observer: MutationObserver | null = null
  let media: MediaQueryList | null = null
  let frame = 0

  function resolved(selector: string): string {
    const probe = root.value?.querySelector(selector)
    return probe ? getComputedStyle(probe).color : ''
  }

  function read() {
    frame = 0
    const next: ChartColors = {
      text: resolved('.dash-probe--text'),
      muted: resolved('.dash-probe--muted'),
      grid: resolved('.dash-probe--grid'),
    }
    if (!next.text || !next.muted || !next.grid)
      return
    const prev = colors.value
    if (!prev || prev.text !== next.text || prev.muted !== next.muted || prev.grid !== next.grid)
      colors.value = next
  }

  function schedule() {
    if (frame === 0)
      frame = requestAnimationFrame(read)
  }

  onMounted(() => {
    read()
    media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', schedule)
    observer = new MutationObserver(schedule)
    const node = root.value?.getRootNode()
    if (node)
      observer.observe(node, { attributes: true, childList: true, characterData: true, subtree: true })
    if (node instanceof ShadowRoot)
      observer.observe(node.host, { attributes: true })
    observer.observe(document.documentElement, { attributes: true })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    media?.removeEventListener('change', schedule)
    if (frame !== 0)
      cancelAnimationFrame(frame)
  })

  return colors
}
