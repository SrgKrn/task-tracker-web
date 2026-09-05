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
      includeAssets: ['apple-touch-icon.png', 'favicon.svg', 'favicon-32.png', 'favicon-48.png'],
      workbox: {
        // Excel/PDF export pulls in ~2MB of libraries (exceljs, jsPDF + an embedded Cyrillic
        // font) that are already code-split via dynamic import() — exclude them from the
        // mandatory install precache so most users never download this, only whoever exports.
        globIgnores: ['**/exportExcel-*.js', '**/exportPdf-*.js', '**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
      },
      manifest: {
        name: 'Semternity',
        short_name: 'Semternity',
        description: 'Трекер задач и времени',
        theme_color: '#0d0d0f',
        background_color: '#0d0d0f',
        display: 'standalone',
        start_url: '/',
        lang: 'ru',
        // пути абсолютные: относительные резолвятся от адреса манифеста и ломаются,
        // если приложение когда-нибудь переедет в подкаталог
        icons: [
          { src: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // отдельный файл со знаком, ужатым до 72% кадра: Android режет иконку
          // по своей маске, и у полнокадрового знака срезало края
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
