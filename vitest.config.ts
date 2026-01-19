import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main/**', 'src/**/*.d.ts'],
    },
  },
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
})
