import { describe, it, expect, beforeAll } from 'vitest'
import museNode from '@/registry/connectivity/muse-eeg/node'
import printerNode from '@/registry/connectivity/thermal-printer/node'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// The printer composes its (empty) print source before the Web-Bluetooth check, which touches
// `ImageBitmap` (a browser global absent in the vitest env). Stub it so the `instanceof` check
// is a plain false rather than a ReferenceError; with no image/text the source is null anyway.
beforeAll(() => {
  if (!('ImageBitmap' in globalThis)) {
    (globalThis as unknown as { ImageBitmap: unknown }).ImageBitmap = class ImageBitmap {}
  }
})

function ctx(nodeId: string, controls: Record<string, unknown> = {}, inputs: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount: 0,
  }
}

/**
 * Web Bluetooth is Chromium-only. Both device executors feature-detect up front and report
 * status 'unsupported' with guidance (instead of failing deep in the adapter) — pinned here so
 * the two duplicated copies can't diverge. The vitest env has no `navigator.bluetooth`.
 */
describe('device nodes report "unsupported" without Web Bluetooth', () => {
  it('muse-eeg emits status "unsupported" and never constructs an adapter', async () => {
    expect('bluetooth' in navigator).toBe(false)
    const out = (await museNode.executor!(ctx('muse-unsup', { deviceId: 'x' }))) as Map<string, unknown>
    expect(out.get('_status')).toBe('unsupported')
    expect(out.get('_error')).toMatch(/Chrome\/Edge|desktop app/i)
  })

  it('thermal-printer emits status "unsupported" and stays not-ready', async () => {
    expect('bluetooth' in navigator).toBe(false)
    const out = (await printerNode.executor!(ctx('printer-unsup', { deviceId: 'x' }))) as Map<string, unknown>
    expect(out.get('status')).toBe('unsupported')
    expect(out.get('connected')).toBe(false)
    expect(out.get('ready')).toBe(false)
  })
})
