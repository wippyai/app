import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { wippyComponentPlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), wippyComponentPlugin()],
  resolve: {
    // The tile helper is an npm workspace in .wippy/npm (make tile-helper). Keep one copy of vue.
    dedupe: ['vue'],
  },
  build: {
    target: 'esnext',
    lib: {
      // One entry file per tag. Each entry file owns its own define(import.meta.url, ...).
      entry: {
        'fx-states': resolve(__dirname, 'src/fx-states.ts'),
        'fx-size': resolve(__dirname, 'src/fx-size.ts'),
        'fx-onload': resolve(__dirname, 'src/fx-onload.ts'),
        'fx-api': resolve(__dirname, 'src/fx-api.ts'),
      },
      name: 'FixtureTiles',
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
