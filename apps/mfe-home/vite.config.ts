import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'mfe_home',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.3.1' },
        'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
        // Match the shell's shared modules exactly so this remote consumes
        // the host's single router and auth context instead of bundling its
        // own. The router singleton lets this remote use the shell's
        // <BrowserRouter> for navigation.
        'react-router-dom': { singleton: true, requiredVersion: '^7.15.1' },
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
  preview: {
    port: 3001,
    cors: true,
  },
  server: {
    port: 3001,
    cors: true,
  },
})
