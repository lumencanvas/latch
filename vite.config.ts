import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@engine': resolve(__dirname, 'src/engine'),
      '@nodes': resolve(__dirname, 'src/nodes'),
      '@platform': resolve(__dirname, 'src/platform'),
      '@storage': resolve(__dirname, 'src/storage'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  // Cross-origin isolation in dev + preview so SharedArrayBuffer (multi-threaded
  // WASM for transformers.js / ONNX Runtime) is available locally, matching the
  // netlify.toml production headers. "credentialless" keeps cross-origin model /
  // WASM fetches working without requiring CORP on those responses.
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  build: {
    outDir: 'dist/web',
  },
})
