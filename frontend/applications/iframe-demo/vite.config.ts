import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { wippyPagePlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'

// Runtime suppression via `installVueWarnSuppressor` (src/app.ts) instead
// of build-time `isCustomElement` — only runtime sees dynamic autoload tags.
export default defineConfig({
  plugins: [
    vue(),
    wippyPagePlugin(),
  ],
  base: '',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      input: { app: resolve(__dirname, 'app.html') },
      external: [
        'vue',
        'vue-router',
        '@iconify/vue',
        '@wippy-fe/proxy',
        'axios',
      ],
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
})
