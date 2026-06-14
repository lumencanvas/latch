import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the cross-origin isolation headers (COOP/COEP) that enable
 * SharedArrayBuffer -> multi-threaded WASM for transformers.js / ONNX Runtime.
 * These are easy to drop accidentally during a config refactor; this test fails
 * loudly if they go missing. It does NOT assert runtime `crossOriginIsolated`
 * (that requires a real server + browser — verified manually via the dev-only
 * console log in src/renderer/main.ts).
 */

const root = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('cross-origin isolation headers', () => {
  it('netlify.toml sets COOP=same-origin and COEP=credentialless', () => {
    const toml = read('netlify.toml')
    expect(toml).toMatch(/Cross-Origin-Opener-Policy\s*=\s*"same-origin"/)
    expect(toml).toMatch(/Cross-Origin-Embedder-Policy\s*=\s*"credentialless"/)
  })

  it('vite.config.ts sets the same headers for dev server and preview', () => {
    const cfg = read('vite.config.ts')
    // COOP appears for both `server` and `preview`.
    const coop = cfg.match(/'Cross-Origin-Opener-Policy':\s*'same-origin'/g) ?? []
    const coep = cfg.match(/'Cross-Origin-Embedder-Policy':\s*'credentialless'/g) ?? []
    expect(coop.length).toBeGreaterThanOrEqual(2)
    expect(coep.length).toBeGreaterThanOrEqual(2)
  })
})
