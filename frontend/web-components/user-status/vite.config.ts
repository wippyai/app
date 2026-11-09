import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { wippyComponentPlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), wippyComponentPlugin()],
  resolve: {
    // The helper is linked from ../../packages. Keep one copy of vue.
    dedupe: ['vue'],
  },
  build: {
    target: 'esnext',
    lib: {
      // One entry file per tag. The entry file owns its define(import.meta.url, ...).
      entry: {
        'user-status': resolve(__dirname, 'src/user-status.ts'),
      },
      name: 'UserStatus',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      // vue and the Host packages come from the Host import map.
      external: ['vue', 'pinia', '@iconify/vue', '@wippy-fe/proxy'],
      preserveEntrySignatures: false,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
    sourcemap: true,
  },
})
