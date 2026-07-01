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
  extractFeatures: vi.fn(async () => [0.1, 0.2, 0.3]),
  visionAction: vi.fn(async () => 'move left'),
}))

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: {
    isModelLoaded: () => h.loaded,
    getModelInfo: () => ({ progress: 0 }),
    getDefaultModel: () => 'default',
    classifyImage: h.classifyImage,
    analyzeSentiment: h.analyzeSentiment,
    captionImage: h.captionImage,
    extractFeatures: h.extractFeatures,
    visionAction: h.visionAction,
  },
}))

import {
  imageClassificationExecutor,
  sentimentAnalysisExecutor,
  imageCaptioningExecutor,
  featureExtractionExecutor,
  vlaExecutor,
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
  h.captionImage.mockResolvedValue('a caption')
  h.analyzeSentiment.mockClear()
  h.analyzeSentiment.mockResolvedValue([
    { label: 'POSITIVE', score: 0.8 },
    { label: 'NEGATIVE', score: 0.2 },
  ])
  h.extractFeatures.mockClear()
  h.extractFeatures.mockResolvedValue([0.1, 0.2, 0.3])
  h.visionAction.mockClear()
  h.visionAction.mockResolvedValue('move left')
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

// Empty/invalid input (empty text, or a bad/absent image) must CLEAR the domain outputs to
// zero once the model is loaded — the pre-migration originals did this UNCONDITIONALLY (not
// gated on a trigger). Regression guard for the step-A migration that dropped it on
// sentiment / feature-extraction / text2text / image-captioning / vla. Each test seeds a
// cached result via a successful run, then asserts empty/invalid input zeroes — WITHOUT a
// trigger (the common, previously-broken case), and confirms a trigger doesn't change it.
describe('empty/invalid input clears domain outputs (unconditional, no trigger needed)', () => {
  it('sentiment: empty text zeroes label/score/positive/negative — with or without trigger', async () => {
    // Seed a cached POSITIVE result.
    sentimentAnalysisExecutor(ctx('sa-clr', { text: 'great' }))
    await flush()
    const seeded = sentimentAnalysisExecutor(ctx('sa-clr', { text: 'great' })) as Map<string, unknown>
    expect(seeded.get('sentiment')).toBe('POSITIVE')

    // Blank text, NO trigger → cleared (the regression case: previously served stale).
    const cleared = sentimentAnalysisExecutor(ctx('sa-clr', { text: '   ' })) as Map<string, unknown>
    expect(cleared.get('sentiment')).toBe('')
    expect(cleared.get('score')).toBe(0)
    expect(cleared.get('positive')).toBe(0)
    expect(cleared.get('negative')).toBe(0)

    // A trigger doesn't change it — empty is empty.
    const clearedTrig = sentimentAnalysisExecutor(ctx('sa-clr', { text: '', trigger: 1 })) as Map<string, unknown>
    expect(clearedTrig.get('sentiment')).toBe('')
    expect(clearedTrig.get('score')).toBe(0)

    // Non-empty text still serves the cached analysis (proves the clear is empty-gated, not blanket).
    const held = sentimentAnalysisExecutor(ctx('sa-clr', { text: 'great' })) as Map<string, unknown>
    expect(held.get('sentiment')).toBe('POSITIVE')
  })

  it('feature-extraction: empty text zeroes embedding/dimensions — with or without trigger', async () => {
    // Seed a cached embedding.
    featureExtractionExecutor(ctx('fe-clr', { text: 'hello' }))
    await flush()
    const seeded = featureExtractionExecutor(ctx('fe-clr', { text: 'hello' })) as Map<string, unknown>
    expect(seeded.get('embedding')).toEqual([0.1, 0.2, 0.3])
    expect(seeded.get('dimensions')).toBe(3)

    // Blank text, NO trigger → cleared (regression case).
    const cleared = featureExtractionExecutor(ctx('fe-clr', { text: '   ' })) as Map<string, unknown>
    expect(cleared.get('embedding')).toEqual([])
    expect(cleared.get('dimensions')).toBe(0)

    // Non-empty text still serves the cached embedding.
    const held = featureExtractionExecutor(ctx('fe-clr', { text: 'hello' })) as Map<string, unknown>
    expect(held.get('embedding')).toEqual([0.1, 0.2, 0.3])
  })

  it('image-captioning: both unsupported AND absent image clear the stale caption', async () => {
    // Seed a cached caption via a valid ImageData (round-trips as-is through convertToImageData).
    const img = new ImageData(2, 2)
    imageCaptioningExecutor(ctx('cap-clr', { image: img }))
    await flush()
    const seeded = imageCaptioningExecutor(ctx('cap-clr', { image: img })) as Map<string, unknown>
    expect(seeded.get('caption')).toBe('a caption')
    await flush()

    // Unsupported image present → caption cleared + error flagged.
    const bad = imageCaptioningExecutor(ctx('cap-clr', { image: { bad: true } })) as Map<string, unknown>
    expect(bad.get('caption')).toBe('')
    expect(bad.get('error')).toBe(BAD_IMAGE)

    // Absent image (disconnected input) → caption cleared, NO error (the case the first fix missed).
    const absent = imageCaptioningExecutor(ctx('cap-clr', {})) as Map<string, unknown>
    expect(absent.get('caption')).toBe('')
    expect(absent.get('error')).toBe('')
  })

  it('vla: bad/absent image clears the stale action (would otherwise drive a policy off a dead frame)', async () => {
    // Seed a cached action via a valid ImageData.
    const img = new ImageData(2, 2)
    vlaExecutor(ctx('vla-clr', { image: img, instruction: 'go' }))
    await flush()
    const seeded = vlaExecutor(ctx('vla-clr', { image: img, instruction: 'go' })) as Map<string, unknown>
    expect(seeded.get('action')).toBe('move left')
    await flush()

    // Unsupported image present → action cleared + error flagged.
    const bad = vlaExecutor(ctx('vla-clr', { image: { bad: true } })) as Map<string, unknown>
    expect(bad.get('action')).toBe('')
    expect(bad.get('error')).toBe('Unsupported image input. Use Webcam Snapshot or Texture to Data.')

    // Absent image → action cleared, NO error.
    const absent = vlaExecutor(ctx('vla-clr', {})) as Map<string, unknown>
    expect(absent.get('action')).toBe('')
    expect(absent.get('error')).toBe('')
  })
})
