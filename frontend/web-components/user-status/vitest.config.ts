import { defineConfig } from 'vitest/config'

// Unit tests cover the pure modules in src/lib only, so they run in Node without a DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
