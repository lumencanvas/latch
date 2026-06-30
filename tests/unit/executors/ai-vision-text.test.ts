import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// Drive the model singleton so we can exercise loaded/unloaded + success/throw without
// a real worker. Image executors are tested on their model-gate and input-error paths
// (a valid ImageData round-trip isn't reliable under happy-dom); the array-result →
// multi-output mapping is proven via sentiment, which takes plain text.
const h = vi.hoisted(() => ({
  loaded: true,
  classifyImage: vi.fn(async () => [{ label: 'cat', score: 0.9 }]),
  analyzeSentiment: vi.fn(async () => [
    { label: 'POSITIVE', score: 0.8 },
    { label: 'NEGATIVE', score: 0.2 },
  ]),
  captionImage: vi.fn(async () => 'a caption'),
}))

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: {
    isModelLoaded: () => h.loaded,
    getModelInfo: () => ({ progress: 0 }),
    getDefaultModel: () => 'default',
    classifyImage: h.classifyImage,
    analyzeSentiment: h.analyzeSentiment,
    captionImage: h.captionImage,
  },
}))

import {
  imageClassificationExecutor,
  sentimentAnalysisExecutor,
  imageCaptioningExecutor,
} from '@/engine/executors/ai'

const flush = () => new Promise((r) => setTimeout(r, 0))

function ctx(
  nodeId: string,
  inputs: Record<string, unknown>,
  controls: Record<string, unknown> = {},
): ExecutionContext {
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

const NOT_LOADED = 'Model not loaded. Open AI Model Manager to load.'
const BAD_IMAGE = 'Unsupported image input type. Use Webcam Snapshot or Texture to Data node.'

beforeEach(() => {
  h.loaded = true
  h.classifyImage.mockClear()
  h.captionImage.mockClear()
  h.analyzeSentiment.mockClear()
  h.analyzeSentiment.mockResolvedValue([
    { label: 'POSITIVE', score: 0.8 },
    { label: 'NEGATIVE', score: 0.2 },
  ])
})

describe('imageClassificationExecutor (runModelInference migration)', () => {
  it('reports model-not-loaded (over any image error) without running', () => {
    h.loaded = false
    const out = imageClassificationExecutor(ctx('ic-nl', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe(NOT_LOADED)
    expect(out.get('labels')).toEqual([])
    expect(out.get('loading')).toBe(false)
    expect(h.classifyImage).not.toHaveBeenCalled()
  })

  it('reports an unsupported image input when loaded, without running', () => {
    const out = imageClassificationExecutor(ctx('ic-bad', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe(BAD_IMAGE)
    expect(h.classifyImage).not.toHaveBeenCalled()
  })
})

describe('imageCaptioningExecutor (runModelInference migration)', () => {
  it('reports model-not-loaded without running', () => {
    h.loaded = false
    const out = imageCaptioningExecutor(ctx('cap-nl', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe(NOT_LOADED)
    expect(out.get('caption')).toBe('')
    expect(h.captionImage).not.toHaveBeenCalled()
  })

  it('reports an unsupported image input when loaded', () => {
    const out = imageCaptioningExecutor(ctx('cap-bad', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe(BAD_IMAGE)
    expect(h.captionImage).not.toHaveBeenCalled()
  })
})

describe('sentimentAnalysisExecutor (runModelInference migration)', () => {
  it('reports model-not-loaded with cleared outputs', () => {
    h.loaded = false
    const out = sentimentAnalysisExecutor(ctx('sa-nl', { text: 'hi' })) as Map<string, unknown>
    expect(out.get('error')).toBe(NOT_LOADED)
    expect(out.get('sentiment')).toBe('')
    expect(h.analyzeSentiment).not.toHaveBeenCalled()
  })

  it('runs on changed text, maps top label/score + positive/negative, pulses done', async () => {
    sentimentAnalysisExecutor(ctx('sa-ok', { text: 'great' }))
    expect(h.analyzeSentiment).toHaveBeenCalledWith('great', undefined)

    await flush()
    const out = sentimentAnalysisExecutor(ctx('sa-ok', { text: 'great' })) as Map<string, unknown>
    expect(out.get('sentiment')).toBe('POSITIVE')
    expect(out.get('score')).toBe(0.8)
    expect(out.get('positive')).toBe(0.8)
    expect(out.get('negative')).toBe(0.2)
    expect(out.get('done')).toBe(true)
    expect(out.get('error')).toBe('')
  })

  it('surfaces a thrown inference error on the error output', async () => {
    h.analyzeSentiment.mockRejectedValueOnce(new Error('senti-boom'))
    sentimentAnalysisExecutor(ctx('sa-err', { text: 'x' }))
    await flush()
    const out = sentimentAnalysisExecutor(ctx('sa-err', { text: 'x' })) as Map<string, unknown>
    expect(out.get('error')).toBe('senti-boom')
  })
})
