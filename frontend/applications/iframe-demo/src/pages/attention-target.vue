<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const ATTENTION_BRIDGE_TAG = 'wippy-attention-bridge-fixture'

class AttentionBridgeFixture extends HTMLElement {
  static observedAttributes = ['side']

  get side(): 'left' | 'right' {
    return this.getAttribute('side') === 'right' ? 'right' : 'left'
  }

  set side(value: 'left' | 'right') {
    this.setAttribute('side', value)
  }

  connectedCallback() {
    this.renderFixture()
  }

  attributeChangedCallback() {
    if (this.isConnected)
      this.renderFixture()
  }

  private renderFixture() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.replaceChildren()

    const style = document.createElement('style')
    style.textContent = `
      :host { display: block; inline-size: 100%; block-size: 100%; min-block-size: 12rem; }
      .bridge { display: block; inline-size: 100%; block-size: 100%; }
      w-artifact { display: block; inline-size: 100%; block-size: 100%; }
    `

    const shell = document.createElement('div')
    shell.className = 'bridge'
    shell.dataset.testid = `attention-bridge-shadow-${this.side}`
    shell.dataset.attentionFixtureId = `web-component-shadow-${this.side}`

    const artifact = document.createElement('w-artifact')
    artifact.id = this.side === 'right' ? 'app.views:iframe-demo-themed' : 'app.views:iframe-demo'
    artifact.setAttribute('type', 'page')
    artifact.setAttribute('sub-path', `/attention-leaf/${this.side}`)
    artifact.dataset.testid = `attention-nested-artifact-${this.side}`
    artifact.dataset.attentionFixtureId = `nested-artifact-${this.side}`
    shell.append(artifact)
    root.append(style, shell)
  }
}

if (!customElements.get(ATTENTION_BRIDGE_TAG))
  customElements.define(ATTENTION_BRIDGE_TAG, AttentionBridgeFixture)

const route = useRoute()
const side = computed<'left' | 'right'>(() => route.params.side === 'right' ? 'right' : 'left')
</script>

<template>
  <section
    data-testid="attention-target-root"
    :data-attention-fixture-side="side"
    class="attention-target"
  >
    <component
      :is="ATTENTION_BRIDGE_TAG"
      :side="side"
      :data-testid="`attention-bridge-${side}`"
      :data-attention-fixture-id="`web-component-${side}`"
    />
  </section>
</template>

<style scoped>
.attention-target {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  min-block-size: 12rem;
  overflow: hidden;
  background: var(--p-surface-0);
}
</style>
