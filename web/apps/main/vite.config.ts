import { resolve } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,  // never inline assets as data URIs — QWebEngine can choke on them
  },
  server: { port: 5173 },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../../shared'),
    },
  },
})
