import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

// vite build always sets NODE_ENV=production; vite dev/preview sets development.
const mfeHomeUrl =
  process.env.NODE_ENV === 'production'
    ? '/mfe-home/assets/remoteEntry.js'
    : 'http://localhost:3001/assets/remoteEntry.js'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        mfe_home: mfeHomeUrl,
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.3.1' },
        'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
})
