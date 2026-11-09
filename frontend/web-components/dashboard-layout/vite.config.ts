import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { wippyComponentPlugin } from '@wippy-fe/vite-plugin'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/**
 * The vendored layout package starts with `import './style.css'`. Vite would write that CSS to a
 * file next to the bundle, but the board must add it to its shadow root. This plugin turns the
 * side-effect import into an empty module, and src/index.ts imports the same file with `?inline`.
 */
function layoutCssToShadowRoot(): Plugin {
  const empty = '\0dashboard-layout:empty-css'
  return {
    name: 'dashboard-layout:layout-css-to-shadow-root',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './style.css' && importer?.replace(/\\/g, '/').includes('/vendor/layout/index.js'))
        return empty
      return null
    },
    load(id) {
      return id === empty ? 'export default ""' : null
    },
  }
}

export default defineConfig({
  plugins: [
    layoutCssToShadowRoot(),
    vue(),
    wippyComponentPlugin(),
  ],
  build: {
    target: 'esnext',
    lib: {
      // Two tags in one bundle. Each entry file owns its own define(import.meta.url, ...).
      entry: {
        'index': resolve(__dirname, 'src/index.ts'),
        'dash-placeholder': resolve(__dirname, 'src/placeholder.ts'),
      },
      name: 'DashboardLayout',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      // vue and the Host packages come from the Host import map. nanoevents and
      // @wippy-fe/layout (vendored) are bundled: the layout package is not in the import map.
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
