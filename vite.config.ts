import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/colisflow/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ColisFlow — Gestion de colis',
        short_name: 'ColisFlow',
        description:
          'Scannez, organisez et exportez vos colis par distributeur. Fonctionne hors ligne.',
        lang: 'fr',
        dir: 'ltr',
        start_url: '/colisflow/',
        scope: '/colisflow/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#060a12',
        theme_color: '#060a12',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, host: true },
  // `.trycloudflare.com` lets the built app be demoed from a phone over HTTPS
  // (quick tunnel), which is required for PWA install, offline and camera.
  preview: { port: 4173, host: true, allowedHosts: ['.trycloudflare.com'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
