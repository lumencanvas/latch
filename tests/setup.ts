/**
 * Vitest setup file
 * Mocks browser APIs that don't exist in happy-dom
 */

// Mock Web Worker
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  constructor(_url: string | URL) {
    // Workers in test environment are no-ops
  }

  postMessage(_message: unknown): void {
    // No-op in tests
  }

  terminate(): void {
    // No-op in tests
  }

  addEventListener(_type: string, _listener: EventListener): void {
    // No-op in tests
  }

  removeEventListener(_type: string, _listener: EventListener): void {
    // No-op in tests
  }
}

// Only set if not already defined
if (typeof Worker === 'undefined') {
  (globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker
}

// Mock HTMLCanvasElement.getContext — happy-dom does not implement it (the method
// is undefined and throws when called). The engine's still-hand-wired gcVisualState
// and the canvas-backed visual seeding paths call getContext('2d'); without this they
// crash in headless tests. Returns a no-op 2D context (any method access yields a
// no-op fn; getImageData/createImageData return a correctly-shaped buffer); WebGL
// contexts stay null so guarded WebGL branches take their fallback. No existing test
// reaches a real getContext call (it currently throws), so this only unblocks new
// headless coverage and cannot change current behavior.
if (
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.getContext !== 'function'
) {
  const imageData = (w: number, h: number) => {
    const width = Math.max(0, Math.floor(w) || 0)
    const height = Math.max(0, Math.floor(h) || 0)
    return { data: new Uint8ClampedArray(width * height * 4), width, height }
  }
  const context2d = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'getImageData') return (_x: number, _y: number, w: number, h: number) => imageData(w, h)
        if (prop === 'createImageData') return (w: number, h: number) => imageData(w, h)
        if (prop === 'measureText') return () => ({ width: 0 })
        // Any other 2D-context member is read as a no-op function (covers drawImage,
        // save/restore/scale, fillRect, putImageData, etc.). Property writes
        // (e.g. ctx.fillStyle = ...) fall through to the Proxy's default set trap.
        return () => {}
      },
    },
  )
  ;(HTMLCanvasElement.prototype as unknown as {
    getContext: (contextId: string) => unknown
  }).getContext = function (contextId: string) {
    return contextId === '2d' ? context2d : null
  }
}

// Mock matchMedia if not present
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
