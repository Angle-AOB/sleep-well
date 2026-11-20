import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/sleep-well/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/sleep-well/',
        name: '睡眠行为训练器',
        short_name: '睡眠训练',
        description: '以行为练习改善睡眠习惯。',
        lang: 'zh-CN',
        start_url: '/sleep-well/',
        scope: '/sleep-well/',
        display: 'standalone',
        background_color: '#f5f7f3',
        theme_color: '#f5f7f3',
        icons: [
          { src: 'pwa.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}']
      }
    })
  ]
})
