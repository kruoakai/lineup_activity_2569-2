import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ',
        short_name: 'เข้าแถว',
        description: 'เช็กชื่อเข้าแถวบุคลากร',
        lang: 'th',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f6f9',
        theme_color: '#1d4e89',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/manuals\/.+\.(pdf|html|json)$/],
        // ห้าม cache ข้อมูล API — ต้องใช้เวลาและสถานะจากเซิร์ฟเวอร์เสมอ
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
