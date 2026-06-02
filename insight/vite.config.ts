import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react'
          }
          if (
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/victory-vendor') ||
            id.includes('node_modules/d3-') ||
            id.includes('node_modules/@reduxjs') ||
            id.includes('node_modules/react-redux') ||
            id.includes('node_modules/immer') ||
            id.includes('node_modules/reselect') ||
            id.includes('node_modules/decimal.js-light') ||
            id.includes('node_modules/es-toolkit') ||
            id.includes('node_modules/eventemitter3') ||
            id.includes('node_modules/tiny-invariant') ||
            id.includes('node_modules/use-sync-external-store')
          ) {
            return 'vendor-recharts'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide'
          }
          if (id.includes('node_modules/@base-ui')) {
            return 'vendor-ui'
          }
        },
      },
    },
  },
})

export default config
