import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { wippyComponentPlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue({
      template: {
        // <wippy-markdown> is a custom element from the hub module wippy-swiss/markdown.
        compilerOptions: { isCustomElement: tag => tag.startsWith('wippy-') },
      },
    }),
    wippyComponentPlugin(),
  ],
  resolve: {
    // The helper is linked from ../../packages. Keep one copy of vue.
    dedupe: ['vue'],
  },
  build: {
    target: 'esnext',
    lib: {
      // One entry file per tag. Each entry file owns its own define(import.meta.url, ...).
      // Stage C4 adds dash-kpi, dash-select, dash-chart and dash-table here.
      entry: {
        'dash-text': resolve(__dirname, 'src/dash-text.ts'),
      },
      name: 'DashTiles',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      // vue and the Host packages come from the Host import map.
      external: [
        'vue',
        'pinia',
        '@iconify/vue',
        '@wippy-fe/proxy',
      ],
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
