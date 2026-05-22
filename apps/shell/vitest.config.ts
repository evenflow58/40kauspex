import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Standalone config for tests. The production vite.config.ts pulls in the
// Module Federation plugin, whose `mfe_home/App` remote is only resolvable
// from a built remote — not in a unit-test run.
//
// Vite's static import-analysis resolves imports BEFORE vi.mock() takes effect,
// so `mfe_home/App` is aliased to a local stub here. Tests can still override
// the rendered output with vi.mock('mfe_home/App', ...).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'mfe_home/App': fileURLToPath(
        new URL('./src/test/mfe-home-stub.tsx', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
