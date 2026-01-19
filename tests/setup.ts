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
  ;(globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker
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
