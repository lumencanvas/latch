import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The packaged CSP allows only the exact jsdelivr paths LATCH loads code from. If the
// onnxruntime-web pin in ai.worker.ts moves without the CSP, AI nodes silently break in
// the desktop build — keep them in lockstep.
describe('Electron CSP stays in sync with CDN code loaders', () => {
  const root = resolve(__dirname, '../../..')
  const protocol = readFileSync(resolve(root, 'src/main/protocol.ts'), 'utf8')

  it('allows the onnxruntime-web build the AI worker points at', () => {
    const worker = readFileSync(resolve(root, 'src/renderer/services/ai/ai.worker.ts'), 'utf8')
    const m = worker.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^/'"]+\//)
    expect(m).not.toBeNull()
    expect(protocol).toContain(m![0])
  })

  it('allows the MediaPipe wasm path and not all of jsdelivr', () => {
    expect(protocol).toContain('https://cdn.jsdelivr.net/npm/@mediapipe/')
    expect(protocol).not.toMatch(/https:\/\/cdn\.jsdelivr\.net[ "]/)
  })
})
