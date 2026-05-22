import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'

// vite build always sets NODE_ENV=production; vite dev/preview sets development.
const mfeHomeUrl =
  process.env.NODE_ENV === 'production'
    ? '/mfe-home/assets/remoteEntry.js'
    : 'http://localhost:3001/assets/remoteEntry.js'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'shell',
      remotes: {
        mfe_home: mfeHomeUrl,
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.3.1' },
        'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
        // Auth must be a singleton so the shell and mfe-home share ONE auth
        // context — mfe-home reads the session the shell established.
        // oidc-client-ts / react-oidc-context back the auth context, so they
        // are shared too; without this they would each get a separate
        // instance and the contexts would not match.
        '@40kauspex/auth': { singleton: true },
        'oidc-client-ts': { singleton: true },
        'react-oidc-context': { singleton: true },
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
