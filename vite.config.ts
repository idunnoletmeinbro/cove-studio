import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.png','apple-touch-icon.png','logo.png'],
    manifest: {
      name: 'Cove Studio', short_name: 'Cove Studio', description: 'Coconut Cove Creations ideas, mood boards, sketches & palettes for avatar creation',
      theme_color: '#8e5fd0', background_color: '#fbf7ff', display: 'standalone', share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } }, id: 'cove-studio', start_url: './', scope: './',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], runtimeCaching: [{ urlPattern: /fonts\.(googleapis|gstatic)\.com/, handler: 'CacheFirst', options: { cacheName: 'fonts' } }] }
  })]
})
