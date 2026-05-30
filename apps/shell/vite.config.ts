import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'

// vite build always sets NODE_ENV=production; vite dev/preview sets development.
const isProd = process.env.NODE_ENV === 'production'

const mfeHomeUrl = isProd
  ? '/mfe-home/assets/remoteEntry.js'
  : 'http://localhost:3001/assets/remoteEntry.js'

const mfeCompanionUrl = isProd
  ? '/mfe-companion/assets/remoteEntry.js'
  : 'http://localhost:3002/assets/remoteEntry.js'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'shell',
      remotes: {
        mfe_home: mfeHomeUrl,
        mfe_companion: mfeCompanionUrl,
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.3.1' },
        'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
        // The router must be a singleton so remotes mount their <Routes>
        // inside the shell's <BrowserRouter>. Without this each remote would
        // bundle its own copy and lose access to the shell's router context.
        'react-router-dom': { singleton: true, requiredVersion: '^7.15.1' },
        // Auth must be a singleton so the shell and remotes share ONE auth
        // context — remotes read the session the shell established.
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
