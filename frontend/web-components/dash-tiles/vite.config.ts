import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { wippyComponentPlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue({
      template: {
        // <wippy-markdown> and <wippy-chartjs> are custom elements from hub modules.
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
      entry: {
        'dash-text': resolve(__dirname, 'src/dash-text.ts'),
        'dash-kpi': resolve(__dirname, 'src/dash-kpi.ts'),
        'dash-select': resolve(__dirname, 'src/dash-select.ts'),
        'dash-chart': resolve(__dirname, 'src/dash-chart.ts'),
        'dash-table': resolve(__dirname, 'src/dash-table.ts'),
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
        // PrimeVue (used by dash-select) comes from the Host import map as well.
        /^primevue(\/.*)?$/,
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
