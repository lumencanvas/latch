import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

// Styles
import './assets/styles/base.css'
import './assets/styles/components.css'

// Create Vue app
const app = createApp(App)

// Plugins
app.use(createPinia())
app.use(router)

// Mount
app.mount('#app')

// Dev-only visibility into cross-origin isolation (gates multi-threaded WASM for
// transformers.js / ONNX Runtime). If false in the browser, the COOP/COEP
// headers aren't reaching the page — check the deploy host (GitHub Pages can't
// set them; Netlify can) or the dev-server config.
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    `[LATCH] crossOriginIsolated=${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'unknown'} ` +
      `(SharedArrayBuffer ${typeof SharedArrayBuffer !== 'undefined' ? 'available' : 'unavailable'})`,
  )
}
