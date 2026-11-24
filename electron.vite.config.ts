import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  // electron-vite 5 externalizes package.json `dependencies` by default
  // (build.externalizeDeps). Main/preload only import `electron`, node builtins and
  // the devDependency @electron-toolkit/utils (bundled), so the packaged app ships
  // no node_modules at all (see forge.config.ts `ignore`).
  main: {
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    // Sandboxed preloads must be a single CommonJS file that only requires 'electron'.
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    optimizeDeps: { exclude: ['bellows-voice'] }, // see vite.config.ts
    root: resolve(__dirname, 'src/renderer'),
    publicDir: resolve(__dirname, 'public'),
    plugins: [vue()],
    // Same cross-origin isolation as vite.config.ts / netlify.toml (and the app://
    // protocol in production) so `electron-vite dev` matches the packaged app.
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
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
    build: {
      outDir: resolve(__dirname, 'dist-electron/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
})
