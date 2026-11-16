import { defineConfig } from 'vitest/config'

// The package uses Vue reactivity only, no DOM, so tests run in Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
