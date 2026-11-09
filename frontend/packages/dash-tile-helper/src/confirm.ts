import { defineComponent, h, nextTick, ref, watch } from 'vue'
import type { PropType } from 'vue'
import type { ConfirmRequest } from './types.ts'

/**
 * Styles of the confirmation. They sit inside the component, so they land in the tile's shadow root
 * with no wiring by the tile author. Theme tokens only.
 */
const CONFIRM_CSS = `
.dash-confirm {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--p-content-background) 70%, transparent);
}
.dash-confirm__dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 100%;
  padding: 1rem;
  box-sizing: border-box;
  color: var(--p-text-color);
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
}
.dash-confirm__title { margin: 0; font-size: 1rem; font-weight: 600; }
.dash-confirm__text { margin: 0; color: var(--p-text-muted-color); font-size: 0.875rem; }
.dash-confirm__buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
.dash-confirm__button {
  padding: 0.375rem 0.875rem;
  font: inherit;
  cursor: pointer;
  color: var(--p-text-color);
  background: transparent;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
}
.dash-confirm__button--primary {
  color: var(--p-primary-contrast-color);
  background: var(--p-primary-color);
  border-color: var(--p-primary-color);
}
.dash-confirm__button:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }
`

let counter = 0

/**
 * A small accessible confirmation (role alertdialog) that covers the tile. Put it in the tile
 * template when the tile has actions: `<TileConfirm :request="confirmRequest" @answer="answerConfirm" />`.
 * Focus starts on Cancel, Escape cancels, and Tab stays between the two buttons.
 */
export const TileConfirm = defineComponent({
  name: 'TileConfirm',
  props: {
    request: { type: Object as PropType<ConfirmRequest | null>, default: null },
    title: { type: String, default: 'Please confirm' },
  },
  emits: { answer: (_confirmed: boolean) => true },
  setup(props, { emit }) {
    const id = `dash-confirm-${++counter}`
    const cancel = ref<HTMLButtonElement | null>(null)
    const accept = ref<HTMLButtonElement | null>(null)

    watch(
      () => props.request,
      async (request) => {
        if (!request)
          return
        await nextTick()
        cancel.value?.focus()
      },
      { immediate: true, flush: 'post' },
    )

    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        emit('answer', false)
        return
      }
      if (event.key !== 'Tab')
        return
      // Keep focus inside the dialog: with two buttons, Tab and Shift+Tab swap them.
      const root = (event.currentTarget as HTMLElement).getRootNode() as Document | ShadowRoot
      const active = root.activeElement
      if (event.shiftKey && active === cancel.value) {
        event.preventDefault()
        accept.value?.focus()
      }
      else if (!event.shiftKey && active === accept.value) {
        event.preventDefault()
        cancel.value?.focus()
      }
    }

    return () => {
      const request = props.request
      if (!request)
        return null
      return h('div', { class: 'dash-confirm', onKeydown }, [
        h('style', CONFIRM_CSS),
        h('div', {
          'class': 'dash-confirm__dialog',
          'role': 'alertdialog',
          'aria-modal': 'true',
          'aria-labelledby': `${id}-title`,
          'aria-describedby': `${id}-text`,
        }, [
          h('h2', { class: 'dash-confirm__title', id: `${id}-title` }, props.title),
          h('p', { class: 'dash-confirm__text', id: `${id}-text` }, `Run the action "${request.action}"?`),
          h('div', { class: 'dash-confirm__buttons' }, [
            h('button', { ref: cancel, type: 'button', class: 'dash-confirm__button', onClick: () => emit('answer', false) }, 'Cancel'),
            h('button', { ref: accept, type: 'button', class: 'dash-confirm__button dash-confirm__button--primary', onClick: () => emit('answer', true) }, 'Confirm'),
          ]),
        ]),
      ])
    }
  },
})
