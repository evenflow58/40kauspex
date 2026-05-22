import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Standalone config for tests — the production vite.config.ts pulls in the
// Module Federation plugin, which is not needed (and interferes) when running
// component unit tests under jsdom.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
