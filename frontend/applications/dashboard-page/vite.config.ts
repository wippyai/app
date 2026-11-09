import { resolve } from 'node:path'
import { wippyPagePlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [wippyPagePlugin()],
  base: '',
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      input: { app: resolve(__dirname, 'app.html') },
      external: ['vue', 'vue-router', '@wippy-fe/proxy', 'axios'],
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
})
