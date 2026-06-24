/**
 * runLiveDetection tests — the shared loop behind object-detection-live (Tier A)
 * and object-detection-yolo (Tier B). Exercised through both wrappers with the
 * detect backend mocked. (In happy-dom, canvas.getContext('2d') is null, so the
 * overlay-draw block is skipped and no renderer/WebGL is touched.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// happy-dom has no ImageData; convertToImageData uses `instanceof ImageData`.
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

// happy-dom's <canvas> has no getContext; return null so the overlay-draw block
// (which would otherwise touch the WebGL renderer) is skipped.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
}

const detections = [
  { label: 'cat', score: 0.7, box: { xmin: 1, ymin: 2, xmax: 3, ymax: 4 } },
  { label: 'dog', score: 0.95, box: { xmin: 5, ymin: 6, xmax: 7, ymax: 8 } },
]
// vi.mock is hoisted above const declarations, so create the spies via vi.hoisted.
const { detectYolo, detectObjects } = vi.hoisted(() => ({
  detectYolo: vi.fn(),
  detectObjects: vi.fn(),
}))

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: { detectYolo, detectObjects },
}))

import { objectDetectionYoloExecutor, objectDetectionLiveExecutor } from '@/engine/executors/ai'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

function ctx(nodeId: string, controls: Record<string, unknown>, frameCount: number): ExecutionContext {
  return {
    nodeId,
    inputs: new Map<string, unknown>([['source', new ImageData(4, 4)]]),
    controls: new Map<string, unknown>(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount,
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('runLiveDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    detectYolo.mockResolvedValue(detections)
    detectObjects.mockResolvedValue(detections)
  })

  it('throttles by interval, caches results, and reports topLabel (YOLO)', async () => {
    // Frame 0: kicks off detection; reports loading until it resolves.
    const r0 = objectDetectionYoloExecutor(ctx('y1', { interval: 100, modelUrl: 'm' }, 0))
    expect(detectYolo).toHaveBeenCalledTimes(1)
    expect(r0.get('loading')).toBe(true)

    await flush() // let the async detect resolve + cache

    // Frame 1: within the interval → no new detection, serves cached results.
    const r1 = objectDetectionYoloExecutor(ctx('y1', { interval: 100, modelUrl: 'm' }, 1))
    expect(detectYolo).toHaveBeenCalledTimes(1) // throttled, not re-run
    expect(r1.get('count')).toBe(2)
    expect(r1.get('detections')).toEqual(detections)
    expect(r1.get('topLabel')).toBe('dog') // highest score
    expect(r1.get('loading')).toBe(false)
  })

  it('re-runs after the interval elapses', async () => {
    objectDetectionYoloExecutor(ctx('y2', { interval: 5, modelUrl: 'm' }, 0))
    await flush()
    objectDetectionYoloExecutor(ctx('y2', { interval: 5, modelUrl: 'm' }, 2)) // 2 < 5: skip
    expect(detectYolo).toHaveBeenCalledTimes(1)
    objectDetectionYoloExecutor(ctx('y2', { interval: 5, modelUrl: 'm' }, 10)) // 10-0 >= 5: run
    expect(detectYolo).toHaveBeenCalledTimes(2)
  })

  it('drives the same loop for the Tier A (transformers) node', async () => {
    objectDetectionLiveExecutor(ctx('l1', { interval: 100 }, 0))
    expect(detectObjects).toHaveBeenCalledTimes(1)
    await flush()
    const r1 = objectDetectionLiveExecutor(ctx('l1', { interval: 100 }, 1))
    expect(detectObjects).toHaveBeenCalledTimes(1)
    expect(r1.get('count')).toBe(2)
    expect(r1.get('topLabel')).toBe('dog')
  })
})
