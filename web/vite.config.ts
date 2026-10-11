import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Auf GitHub Pages liegt die App unter /<Repo-Name>/, lokal unter /.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // Alte App-Versionen aus dem Cache räumen, damit nichts Veraltetes liegen bleibt.
      workbox: {
        cleanupOutdatedCaches: true,
        // Vorab nur, was der erste Bildschirm braucht. Trends (Diagramme) lädt die App kurz nach dem Start ohnehin,
        // Schriften und das große Icon holt der Browser bei Bedarf; alles landet dann im Laufzeit-Cache unten.
        // Seltene Schrift-Teile (z.B. kyrillisch) lädt der Browser über unicode-range nur, wenn ein Zeichen daraus gebraucht wird.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,vietnamese,latin-ext}-wght-normal-*.woff2', '**/Trends-*.js', 'icon-512.png'],
        runtimeCaching: [
          {
            // Dateinamen enthalten einen Hash: einmal geladen, ändern sie sich nie.
            urlPattern: ({ url }) => url.pathname.includes('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'assets', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
        ],
      },
      manifest: {
        name: 'Training',
        short_name: 'Training',
        description: 'Persönliches Garmin-Dashboard und Trainingsplan',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0c0a1f',
        theme_color: '#0c0a1f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
