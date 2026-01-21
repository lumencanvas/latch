/**
 * Tests for HTTP Executor
 *
 * Tests HTTP request execution with timeout support, caching, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the connections store before importing the module
vi.mock('@/stores/connections', () => ({
  useConnectionsStore: vi.fn(() => ({
    getAdapter: vi.fn(() => null),
    connect: vi.fn(),
  })),
}))

// Import after mocking
import { httpExecutor, disposeHttpNode, disposeAllHttpNodes, gcHttpState } from '@/engine/executors/http'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// Helper to create mock execution context
function createMockContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    nodeId: 'test-http-node',
    nodeType: 'http-request',
    inputs: new Map(),
    controls: new Map(),
    totalTime: 0,
    deltaTime: 16,
    frame: 0,
    ...overrides,
  }
}

describe('HTTP Executor', () => {
  beforeEach(() => {
    disposeAllHttpNodes()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should return cached values when not triggered', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
          ['timeout', 30000],
        ]),
        inputs: new Map([
          ['trigger', false],
        ]),
      })

      const outputs = await httpExecutor(ctx)

      expect(outputs.get('response')).toBeNull()
      expect(outputs.get('status')).toBe(0)
      expect(outputs.get('loading')).toBe(false)
    })

    it('should require trigger to execute request', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      // Mock fetch - should be called
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ data: 'test' }),
      })
      global.fetch = mockFetch

      const outputs = await httpExecutor(ctx)

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Timeout Support', () => {
    it('should use default timeout of 30000ms when not specified', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      let capturedSignal: AbortSignal | undefined
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedSignal = options?.signal
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
        })
      })

      await httpExecutor(ctx)

      expect(capturedSignal).toBeDefined()
    })

    it('should use custom timeout from controls', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
          ['timeout', 5000],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      // Create a slow request that we can abort
      let abortController: AbortController | undefined
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        abortController = new AbortController()
        // Return a promise that won't resolve immediately
        return new Promise((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
          // Never resolves naturally - only through abort
        })
      })

      const promise = httpExecutor(ctx)

      // Advance time to trigger timeout
      await vi.advanceTimersByTimeAsync(5000)

      const outputs = await promise

      expect(outputs.get('error')).toContain('timeout')
      expect(outputs.get('status')).toBe(0)
    })

    it('should return timeout error message with duration', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
          ['timeout', 1000],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      })

      const promise = httpExecutor(ctx)
      await vi.advanceTimersByTimeAsync(1000)
      const outputs = await promise

      expect(outputs.get('error')).toBe('Request timeout after 1000ms')
    })

    it('should clear timeout on successful response', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
          ['timeout', 30000],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true }),
      })

      const outputs = await httpExecutor(ctx)

      expect(outputs.get('error')).toBeNull()
      expect(outputs.get('status')).toBe(200)
      expect(outputs.get('response')).toEqual({ success: true })
    })

    it('should clear timeout on error response', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
          ['timeout', 30000],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const outputs = await httpExecutor(ctx)

      expect(outputs.get('error')).toBe('Network error')
      expect(outputs.get('status')).toBe(0)
    })
  })

  describe('HTTP Methods and Body', () => {
    it('should send POST request with body', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'POST'],
        ]),
        inputs: new Map([
          ['trigger', true],
          ['body', { name: 'test', value: 123 }],
        ]),
      })

      let capturedBody: string | undefined
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedBody = options?.body
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ id: 1 }),
        })
      })

      await httpExecutor(ctx)

      expect(capturedBody).toBe('{"name":"test","value":123}')
    })

    it('should not send body with GET request', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
          ['body', { ignored: true }],
        ]),
      })

      let capturedBody: string | undefined
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedBody = options?.body
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
        })
      })

      await httpExecutor(ctx)

      expect(capturedBody).toBeUndefined()
    })
  })

  describe('Response Handling', () => {
    it('should parse JSON response', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ key: 'value', count: 42 }),
      })

      const outputs = await httpExecutor(ctx)

      expect(outputs.get('response')).toEqual({ key: 'value', count: 42 })
    })

    it('should handle text response', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/text'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('Hello, World!'),
      })

      const outputs = await httpExecutor(ctx)

      expect(outputs.get('response')).toBe('Hello, World!')
    })

    it('should handle HTTP error status', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/notfound'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: 'Not found' }),
      })

      const outputs = await httpExecutor(ctx)

      expect(outputs.get('status')).toBe(404)
      expect(outputs.get('error')).toBe('HTTP 404')
    })
  })

  describe('Caching', () => {
    it('should cache response between non-triggered calls', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ cached: 'value' }),
      })

      // First call with trigger
      await httpExecutor(ctx)

      // Second call without trigger - should return cached value
      ctx.inputs.set('trigger', false)
      const outputs = await httpExecutor(ctx)

      expect(outputs.get('response')).toEqual({ cached: 'value' })
      expect(outputs.get('status')).toBe(200)
    })

    it('should clear cache when node is disposed', async () => {
      const nodeId = 'test-cache-node'
      const ctx = createMockContext({
        nodeId,
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'test' }),
      })

      await httpExecutor(ctx)

      // Dispose node
      disposeHttpNode(nodeId)

      // Get cached value - should be default
      ctx.inputs.set('trigger', false)
      const outputs = await httpExecutor(ctx)

      expect(outputs.get('response')).toBeNull()
      expect(outputs.get('status')).toBe(0)
    })
  })

  describe('Garbage Collection', () => {
    it('should clean up orphaned node state', async () => {
      const nodeId1 = 'node-1'
      const nodeId2 = 'node-2'

      // Create state for two nodes
      const ctx1 = createMockContext({ nodeId: nodeId1 })
      const ctx2 = createMockContext({ nodeId: nodeId2 })

      ctx1.controls.set('url', 'https://api.example.com/1')
      ctx1.controls.set('method', 'GET')
      ctx1.inputs.set('trigger', true)

      ctx2.controls.set('url', 'https://api.example.com/2')
      ctx2.controls.set('method', 'GET')
      ctx2.inputs.set('trigger', true)

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'test' }),
      })

      await httpExecutor(ctx1)
      await httpExecutor(ctx2)

      // GC with only node-1 as valid
      gcHttpState(new Set([nodeId1]))

      // node-1 should still have cached data
      ctx1.inputs.set('trigger', false)
      const outputs1 = await httpExecutor(ctx1)
      expect(outputs1.get('status')).toBe(200)

      // node-2 should have lost its cache
      ctx2.inputs.set('trigger', false)
      const outputs2 = await httpExecutor(ctx2)
      expect(outputs2.get('status')).toBe(0)
    })

    it('should clear all state on disposeAllHttpNodes', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', 'https://api.example.com/data'],
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'test' }),
      })

      await httpExecutor(ctx)

      disposeAllHttpNodes()

      ctx.inputs.set('trigger', false)
      const outputs = await httpExecutor(ctx)

      expect(outputs.get('response')).toBeNull()
      expect(outputs.get('status')).toBe(0)
    })
  })

  describe('No Connection Mode', () => {
    it('should return error when no connection and non-HTTP URL', async () => {
      const ctx = createMockContext({
        controls: new Map([
          ['url', '/api/data'], // Relative URL, no connection
          ['method', 'GET'],
        ]),
        inputs: new Map([
          ['trigger', true],
        ]),
      })

      const outputs = await httpExecutor(ctx)

      expect(outputs.get('error')).toBe('No connection selected')
      expect(outputs.get('status')).toBe(0)
    })
  })
})
