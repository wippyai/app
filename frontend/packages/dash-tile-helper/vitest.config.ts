import { defineConfig } from 'vitest/config'

// The helper has no DOM dependency in its logic, so tests run in Node with fake timers.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
