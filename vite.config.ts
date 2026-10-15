import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
        // шрифты дизайн-системы (src/fonts.ts) — в предзагрузку, чтобы без сети не было подмены
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/exportExcel-*.js', '**/exportPdf-*.js', '**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        // пуш-уведомления и нажатие на них — свой обработчик поверх сгенерированного воркера
        importScripts: ['/push-handler.js'],
      },
      manifest: {
        name: 'Semternity',
        short_name: 'Semternity',
        description: 'Трекер задач и времени',
        // фон тёмной темы дизайн-системы (--bg): заставка Android при запуске
        theme_color: '#F7F6F2',
        background_color: '#F7F6F2',
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
