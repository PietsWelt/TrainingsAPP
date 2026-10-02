import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Auf GitHub Pages liegt die App unter /<Repo-Name>/, lokal unter /.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { chunkSizeWarningLimit: 800 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Training',
        short_name: 'Training',
        description: 'Persönliches Garmin-Dashboard und Trainingsplan',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#111110',
        theme_color: '#111110',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
