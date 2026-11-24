/**
 * AI trigger dedupe + vision conversion gating.
 *
 * `hasTriggerValue` is a LEVEL test: a held trigger (toggle, Constant 1, a persisting
 * transcript string) re-ran inference every time the previous op finished — a continuous
 * LLM / vision loop. `triggerFired` fires on the rising edge or a VALUE change while high,
 * and queues a fire that lands mid-op. Vision nodes also used to convert (GPU readback) their
 * image input every frame before checking the interval; that now happens only on frames that
 * start an op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const h = vi.hoisted(() => ({
  loaded: true,
  estimateDepth: vi.fn(async () => ({ width: 0, height: 0, channels: 1, data: new Uint8Array(0) })),
  generateText: vi.fn(async (_p: string) => 'GEN'),
  classifyImage: vi.fn(async () => [{ label: 'cat', score: 0.9 }]),
}))

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: {
    isModelLoaded: () => h.loaded,
    getModelInfo: () => ({ progress: 1 }),
    getDefaultModel: () => 'default',
    generateText: h.generateText,
    classifyImage: h.classifyImage,
    estimateDepth: h.estimateDepth,
  },
}))

import { textGenerationExecutor, imageClassificationExecutor } from '@/engine/executors/ai'
import * as aiShared from '@/registry/ai/shared'
import { depthEstimationExecutor } from '@/registry/ai/depth-estimation/node'

const flush = () => new Promise((r) => setTimeout(r, 0))

function ctx(nodeId: string, inputs: Record<string, unknown>, frameCount = 0, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount,
  }
}

describe('triggerFired', () => {
  it('fires once for a held numeric trigger, again after release', () => {
    const f = (v: unknown) => aiShared.triggerFired('tf-num', v)
    expect(f(1)).toBe(true)
    expect(f(1)).toBe(false)
    expect(f(1)).toBe(false)
    expect(f(0)).toBe(false)
    expect(f(1)).toBe(true)
  })

  it('a new string (or timestamp) while high is a new request; the same one is not', () => {
    const f = (v: unknown) => aiShared.triggerFired('tf-str', v)
    expect(f('hello')).toBe(true)
    expect(f('hello')).toBe(false)
    expect(f('world')).toBe(true)
    expect(f('')).toBe(false)
  })

  it('queues a fire that lands while an op is in flight, releasing it once idle', () => {
    const id = 'tf-queue'
    expect(aiShared.triggerFired(id, 0)).toBe(false)
    aiShared.pendingOperations.set(id, Promise.resolve())
    expect(aiShared.triggerFired(id, 1)).toBe(false) // busy → queued, not lost
    expect(aiShared.triggerFired(id, 1)).toBe(false)
    aiShared.pendingOperations.delete(id)
    expect(aiShared.triggerFired(id, 1)).toBe(true) // released on the first idle frame
    expect(aiShared.triggerFired(id, 1)).toBe(false)
  })
})

describe('text-generation with a held trigger', () => {
  beforeEach(() => {
    h.generateText.mockClear()
  })

  it('generates ONCE, not in a loop, while the trigger stays high', async () => {
    for (let i = 0; i < 5; i++) {
      textGenerationExecutor(ctx('tg-held', { trigger: true, prompt: 'hi' }))
      await flush() // let each op resolve so the old level-test would re-run
    }
    expect(h.generateText).toHaveBeenCalledTimes(1)
  })

  it('a changed string trigger (new transcript) generates again', async () => {
    textGenerationExecutor(ctx('tg-str', { trigger: 'first' }))
    await flush()
    textGenerationExecutor(ctx('tg-str', { trigger: 'first' }))
    await flush()
    textGenerationExecutor(ctx('tg-str', { trigger: 'second' }))
    await flush()
    expect(h.generateText).toHaveBeenCalledTimes(2)
  })
})

describe('image-classification conversion gating', () => {
  beforeEach(() => {
    h.classifyImage.mockClear()
  })

  it('converts (reads back) the image only on frames that start an inference', async () => {
    // A canvas source whose readback is observable: convertToImageData → getContext('2d').getImageData.
    const canvas = document.createElement('canvas')
    const getImageData = vi.fn(() => new ImageData(2, 2))
    vi.spyOn(canvas, 'getContext').mockReturnValue({ getImageData } as unknown as RenderingContext)
    imageClassificationExecutor(ctx('ic-gate', { image: canvas }, 1, { interval: 60 })) // first run
    await flush()
    expect(getImageData).toHaveBeenCalledTimes(1)
    for (let f = 2; f < 30; f++) {
      imageClassificationExecutor(ctx('ic-gate', { image: canvas }, f, { interval: 60 })) // inside interval
    }
    // No per-frame readback inside the interval (the old code converted every frame).
    expect(getImageData).toHaveBeenCalledTimes(1)
    expect(h.classifyImage).toHaveBeenCalledTimes(1)
    imageClassificationExecutor(ctx('ic-gate', { image: canvas }, 61, { interval: 60 })) // interval elapsed
    expect(getImageData).toHaveBeenCalledTimes(2)
  })
})

describe('trigger edge state survives early returns / model-not-loaded', () => {
  it('depth-estimation advances the trigger edge even when the source is unsupported', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Trigger pressed while the source is unsupported (early-return path)…
    depthEstimationExecutor(ctx('de-edge', { source: 42, trigger: 1 }, 1))
    // …so the edge was already consumed: the held trigger is NOT a fresh rising edge now.
    expect(aiShared.triggerFired('de-edge', 1)).toBe(false)
    vi.restoreAllMocks()
  })

  it('a trigger that fires before the model is loaded is re-queued, then runs once it loads', async () => {
    h.classifyImage.mockClear()
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue({ getImageData: () => new ImageData(2, 2) } as unknown as RenderingContext)
    const id = 'ic-requeue'
    const controls = { interval: 100000 }
    h.loaded = true
    imageClassificationExecutor(ctx(id, { image: canvas, trigger: 0 }, 1, controls)) // first (interval) run
    await flush()
    h.classifyImage.mockClear()
    h.loaded = false
    imageClassificationExecutor(ctx(id, { image: canvas, trigger: 1 }, 2, controls)) // press — model not loaded
    imageClassificationExecutor(ctx(id, { image: canvas, trigger: 0 }, 3, controls)) // released
    expect(h.classifyImage).not.toHaveBeenCalled()
    h.loaded = true
    imageClassificationExecutor(ctx(id, { image: canvas, trigger: 0 }, 4, controls)) // model ready
    await flush()
    expect(h.classifyImage).toHaveBeenCalledTimes(1) // the press was not lost
    imageClassificationExecutor(ctx(id, { image: canvas, trigger: 0 }, 5, controls))
    await flush()
    expect(h.classifyImage).toHaveBeenCalledTimes(1) // and fires only once
    vi.restoreAllMocks()
  })
})
