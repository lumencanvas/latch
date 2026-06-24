/**
 * OpenCV Executor Tests
 *
 * Real-invocation tests (cv runtime + Three renderer mocked) that lock the two
 * things most likely to regress and hurt:
 *  1. the median-blur kernel floor (ksize must be > 1, else medianBlur throws),
 *  2. the cv.Mat cleanup discipline — every transient Mat deleted each frame,
 *     and the persistent optical-flow `prevGray` Mat freed on dispose (the WASM
 *     heap-leak class CLAUDE.md warns about).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Fake cv runtime -------------------------------------------------------
// A Mat is just an object with a `delete` spy; constructors/ops are spies so we
// can assert call args and that every Mat is freed.
function makeMat(rows = 0, cols = 0) {
  return {
    delete: vi.fn(),
    isDeleted: () => false,
    rows,
    cols,
    channels: () => 1,
    data32F: new Float32Array(0),
  }
}

const cv = {
  COLOR_RGBA2GRAY: 7,
  BORDER_DEFAULT: 4,
  Mat: vi.fn(() => makeMat()),
  Size: vi.fn(function (this: Record<string, number>, w: number, h: number) {
    this.width = w
    this.height = h
  }),
  matFromImageData: vi.fn((img: { width: number; height: number }) => makeMat(img.height, img.width)),
  // Copy source dims onto the destination so size-dependent logic is exercised.
  cvtColor: vi.fn((src: { rows: number; cols: number }, dst: { rows: number; cols: number }) => {
    dst.rows = src.rows
    dst.cols = src.cols
  }),
  calcOpticalFlowFarneback: vi.fn(),
  medianBlur: vi.fn(),
  GaussianBlur: vi.fn(),
  imshow: vi.fn(),
}

vi.mock('@/services/visual/OpenCVService', () => ({
  openCVService: {
    isReady: () => true,
    isLoading: () => false,
    load: () => Promise.resolve(),
    getCV: () => cv,
  },
}))

// The Three renderer is irrelevant to the logic under test — stub it.
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
  disposeAllOpenCVNodes,
  oddKernel,
} from '@/engine/executors/opencv'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// happy-dom has no ImageData; the executor's `source instanceof ImageData`
// branch needs the global to exist. A minimal stand-in is enough — the cv
// runtime that reads it is mocked.
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
  })

  it('grayscale converts RGBA->GRAY and frees both transient Mats', () => {
    cvGrayscaleExecutor(ctx('g1', { interval: 1 }))

    expect(cv.cvtColor).toHaveBeenCalledTimes(1)
    expect(cv.cvtColor.mock.calls[0][2]).toBe(cv.COLOR_RGBA2GRAY)

    const src = cv.matFromImageData.mock.results[0].value
    const dst = cv.Mat.mock.results[0].value
    expect(src.delete).toHaveBeenCalledTimes(1)
    expect(dst.delete).toHaveBeenCalledTimes(1)
  })

  it('floors the median-blur kernel at 3 (medianBlur asserts ksize > 1)', () => {
    cvBlurExecutor(ctx('b1', { mode: 'median', kernel: 1, interval: 1 }))
    expect(cv.medianBlur).toHaveBeenCalledTimes(1)
    expect(cv.medianBlur.mock.calls[0][2]).toBe(3)
  })

  it('allows a 1px Gaussian kernel (valid) without forcing the floor', () => {
    cvBlurExecutor(ctx('b2', { mode: 'gaussian', kernel: 1, interval: 1 }))
    expect(cv.GaussianBlur).toHaveBeenCalledTimes(1)
    expect(cv.medianBlur).not.toHaveBeenCalled()
    // Size built with the 1px odd kernel
    expect(cv.Size).toHaveBeenCalledWith(1, 1)
  })

  it('throttles by frame interval (no re-run before the interval elapses)', () => {
    cvGrayscaleExecutor(ctx('t1', { interval: 5 }, 0)) // first frame: runs
    cvGrayscaleExecutor(ctx('t1', { interval: 5 }, 1)) // 1 < 5: skipped
    expect(cv.cvtColor).toHaveBeenCalledTimes(1)
    cvGrayscaleExecutor(ctx('t1', { interval: 5 }, 6)) // 6 - 0 >= 5: runs
    expect(cv.cvtColor).toHaveBeenCalledTimes(2)
  })

  it('retains the optical-flow prevGray Mat across frames and frees it on dispose', () => {
    cvOpticalFlowExecutor(ctx('of1', { interval: 1 }, 0)) // first frame: seeds prevGray

    const src = cv.matFromImageData.mock.results[0].value
    const gray = cv.Mat.mock.results[0].value
    // src is freed in the finally; gray is retained as prevGray (NOT freed yet).
    expect(src.delete).toHaveBeenCalledTimes(1)
    expect(gray.delete).not.toHaveBeenCalled()

    disposeAllOpenCVNodes()
    // The persistent WASM-heap Mat must be freed on teardown.
    expect(gray.delete).toHaveBeenCalledTimes(1)
  })

  it('reseeds optical-flow prevGray on a source-resolution change (no Farneback throw)', () => {
    cvOpticalFlowExecutor(ctx('of2', { interval: 1 }, 0, new ImageData(8, 8))) // seed 8x8
    const gray1 = cv.Mat.mock.results[0].value
    expect(gray1.delete).not.toHaveBeenCalled()

    // Different-sized frame: Farneback would throw on mismatched sizes, so the
    // node must reseed (free the old prevGray) and skip flow this frame.
    cvOpticalFlowExecutor(ctx('of2', { interval: 1 }, 1, new ImageData(4, 4)))
    expect(cv.calcOpticalFlowFarneback).not.toHaveBeenCalled()
    expect(gray1.delete).toHaveBeenCalledTimes(1)
  })
})
