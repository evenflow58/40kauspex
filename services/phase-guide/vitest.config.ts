import { defineConfig } from 'vitest/config'

/**
 * The phase-guide service is a Node.js Lambda — no DOM, no React. A plain
 * `node` test environment keeps it fast and free of front-end test deps.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
