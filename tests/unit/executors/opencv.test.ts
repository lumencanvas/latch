/**
 * OpenCV Executor Tests
 *
 * opencv.js now runs in a Web Worker; the executors are thin fire-and-cache
 * shells around `openCVService.process()`. These tests mock that worker facade
 * and lock the executor-side contract that's most likely to regress:
 *  1. control → op/params mapping (esp. the median-blur kernel floor: ksize must
 *     be > 1 or medianBlur throws worker-side),
 *  2. the frame-interval throttle,
 *  3. deferred caching — the last worker result's scalar outputs are re-served
 *     each frame,
 *  4. the MOG2-unavailable `_error` passthrough,
 *  5. dispose wiring — teardown frees the worker's per-node Mats.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Worker facade spies (hoisted so the vi.mock factory can close over them).
const { processMock, disposeMock, disposeAllMock, facade } = vi.hoisted(() => ({
  processMock: vi.fn(),
  disposeMock: vi.fn(),
  disposeAllMock: vi.fn(),
  facade: { ready: true },
}))

vi.mock('@/services/visual/OpenCVService', () => ({
  openCVService: {
    isReady: () => facade.ready,
    isLoading: () => false,
    getLoadError: () => null,
    load: () => Promise.resolve(),
    process: processMock,
    dispose: disposeMock,
    disposeAll: disposeAllMock,
  },
}))

// The Three renderer is irrelevant to the logic under test — stub it so the
// executor module's import resolves.
vi.mock('@/engine/executors/visual', () => ({
  getThreeShaderRenderer: () => ({
    createTexture: () => ({ dispose: vi.fn() }),
    updateTexture: vi.fn(),
    renderToCanvas: vi.fn(),
  }),
  getShaderRenderer: () => ({}),
}))

import {
  cvGrayscaleExecutor,
  cvBlurExecutor,
  cvOpticalFlowExecutor,
  cvBackgroundSubtractionExecutor,
  disposeOpenCVNode,
  disposeAllOpenCVNodes,
  gcOpenCVState,
  oddKernel,
} from '@/engine/executors/opencv'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// happy-dom has no ImageData; the executor's `source instanceof ImageData`
// branch needs the global to exist. A minimal stand-in is enough.
class FakeImageData {
  width: number
  height: number
  data: Uint8ClampedArray
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
    this.data = new Uint8ClampedArray(w * h * 4)
  }
}
(globalThis as unknown as { ImageData: unknown }).ImageData = FakeImageData

// Flush microtasks + the macrotask queue so an awaited worker result settles.
const flush = () => new Promise((r) => setTimeout(r, 0))

function ctx(
  nodeId: string,
  controls: Record<string, unknown>,
  frameCount = 0,
  source: unknown = new ImageData(2, 2)
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map<string, unknown>([['source', source]]),
    controls: new Map<string, unknown>(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount,
  }
}

describe('oddKernel', () => {
  it('rounds up to the next odd integer', () => {
    expect(oddKernel(4, 1)).toBe(5)
    expect(oddKernel(5, 1)).toBe(5)
  })
  it('honors the minimum floor', () => {
    expect(oddKernel(1, 3)).toBe(3)
    expect(oddKernel(2, 3)).toBe(3)
    expect(oddKernel(0, 1)).toBe(1)
  })
})

describe('OpenCV executors', () => {
  beforeEach(() => {
    disposeAllOpenCVNodes()
    vi.clearAllMocks()
    facade.ready = true
    processMock.mockResolvedValue({ imageData: undefined, extra: {} })
  })

  it('serves a loading passthrough (no worker op) until opencv.js is ready', () => {
    facade.ready = false
    const out = cvGrayscaleExecutor(ctx('l1', { interval: 1 }))
    expect(out.get('loading')).toBe(true)
    expect(processMock).not.toHaveBeenCalled()
  })

  it('posts the grayscale op to the worker when due', () => {
    cvGrayscaleExecutor(ctx('g1', { interval: 1 }))
    expect(processMock).toHaveBeenCalledTimes(1)
    expect(processMock).toHaveBeenCalledWith('g1', 'grayscale', {}, expect.anything())
  })

  it('floors the median-blur kernel at 3 (medianBlur asserts ksize > 1)', () => {
    cvBlurExecutor(ctx('b1', { mode: 'median', kernel: 1, interval: 1 }))
    expect(processMock).toHaveBeenCalledWith(
      'b1',
      'blur',
      expect.objectContaining({ mode: 'median', kernel: 3 }),
      expect.anything()
    )
  })

  it('allows a 1px Gaussian kernel (valid) without forcing the floor', () => {
    cvBlurExecutor(ctx('b2', { mode: 'gaussian', kernel: 1, interval: 1 }))
    expect(processMock).toHaveBeenCalledWith(
      'b2',
      'blur',
      expect.objectContaining({ mode: 'gaussian', kernel: 1 }),
      expect.anything()
    )
  })

  it('throttles by frame interval (no re-run before the interval elapses)', async () => {
    cvGrayscaleExecutor(ctx('t1', { interval: 5 }, 0)) // first frame: runs
    await flush()
    cvGrayscaleExecutor(ctx('t1', { interval: 5 }, 1)) // 1 < 5: skipped
    await flush()
    expect(processMock).toHaveBeenCalledTimes(1)
    cvGrayscaleExecutor(ctx('t1', { interval: 5 }, 6)) // 6 - 0 >= 5: runs
    await flush()
    expect(processMock).toHaveBeenCalledTimes(2)
  })

  it('does not post a new op while one is already pending', () => {
    // process never resolves here → the node stays pending.
    processMock.mockReturnValue(new Promise(() => {}))
    cvGrayscaleExecutor(ctx('p1', { interval: 1 }, 0))
    cvGrayscaleExecutor(ctx('p1', { interval: 1 }, 10))
    expect(processMock).toHaveBeenCalledTimes(1)
  })

  it('caches and re-serves the worker result scalar outputs each frame', async () => {
    processMock.mockResolvedValue({ imageData: undefined, extra: { motion: 0.42 } })
    cvOpticalFlowExecutor(ctx('of1', { interval: 1 }, 0)) // kicks the worker op
    await flush()
    // Same frame again → not due → serves the cached motion from the result.
    const out = cvOpticalFlowExecutor(ctx('of1', { interval: 1 }, 0))
    expect(out.get('motion')).toBe(0.42)
    expect(processMock).toHaveBeenCalledWith('of1', 'optical-flow', expect.anything(), expect.anything())
  })

  it('passes the MOG2 _error through from the worker result', async () => {
    processMock.mockResolvedValue({
      imageData: undefined,
      extra: { foreground: 0, _error: 'Background subtraction (MOG2) is unavailable in this OpenCV build.' },
    })
    cvBackgroundSubtractionExecutor(ctx('bg1', { interval: 1 }, 0))
    await flush()
    const out = cvBackgroundSubtractionExecutor(ctx('bg1', { interval: 1 }, 0))
    expect(out.get('_error')).toMatch(/unavailable/i)
    expect(out.get('loading')).toBe(false)
  })

  it('frees the worker-side Mats for a removed node (gc) and on teardown', () => {
    cvOpticalFlowExecutor(ctx('d1', { interval: 1 }))
    gcOpenCVState(new Set()) // d1 no longer in graph
    expect(disposeMock).toHaveBeenCalledWith('d1')

    cvBackgroundSubtractionExecutor(ctx('d2', { interval: 1 }))
    disposeAllOpenCVNodes()
    expect(disposeAllMock).toHaveBeenCalled()
  })

  it('drops a worker result that lands after the node was disposed', async () => {
    let resolveProcess: (v: unknown) => void = () => {}
    processMock.mockReturnValue(new Promise((res) => { resolveProcess = res }))
    cvOpticalFlowExecutor(ctx('z1', { interval: 1 }, 0)) // kicks the op, now pending
    disposeOpenCVNode('z1') // node torn down before the result lands
    resolveProcess({ imageData: undefined, extra: { motion: 99 } })
    await flush()
    // The stale result must not resurrect state: a fresh frame serves the default.
    const out = cvOpticalFlowExecutor(ctx('z1', { interval: 1 }, 0))
    expect(out.get('motion')).toBe(0)
  })
})
