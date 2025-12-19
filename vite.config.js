import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // PWA (Progressive Web App) サポート
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 【重要】本番環境でのデプロイ先サブディレクトリを指定
  // 例: アプリケーションが example.com/camera/ にデプロイされる場合
  base: '/camera/',

  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate', // 更新があったら即座に反映
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Simple Camera',
        short_name: 'Camera',
        description: 'Simple Camera App with Zoom and Recording',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone', // アドレスバーを消す設定
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Androidのアイコン形状適応用
          }
        ]
      }
    })
  ],

  // 製品版では、コンソール出力とデバッグ出力をしない
  esbuild: {
    drop: ((mode === 'production') ? ['console', 'debugger'] : [])
  },
}));