import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // Excel/PDF export pulls in ~2MB of libraries (exceljs, jsPDF + an embedded Cyrillic
        // font) that are already code-split via dynamic import() — exclude them from the
        // mandatory install precache so most users never download this, only whoever exports.
        globIgnores: ['**/exportExcel-*.js', '**/exportPdf-*.js', '**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
      },
      manifest: {
        name: 'Хронограф',
        short_name: 'Хронограф',
        description: 'Task and time tracker',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
