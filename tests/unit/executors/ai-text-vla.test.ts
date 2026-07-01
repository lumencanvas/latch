import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const h = vi.hoisted(() => ({
  loaded: true,
  modelState: undefined as string | undefined,
  extractFeatures: vi.fn(async () => [0.1, 0.2, 0.3]),
  text2text: vi.fn(async () => 'SUMMARY'),
  visionAction: vi.fn(async () => 'ACTION'),
}))

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: {
    isModelLoaded: () => h.loaded,
    getModelInfo: () => ({ progress: 0, state: h.modelState }),
    getDefaultModel: () => 'default',
    extractFeatures: h.extractFeatures,
    text2text: h.text2text,
    visionAction: h.visionAction,
  },
}))

import {
  featureExtractionExecutor,
  textTransformationExecutor,
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

beforeEach(() => {
  h.loaded = true
  h.modelState = undefined
  h.extractFeatures.mockClear()
  h.text2text.mockClear()
  h.visionAction.mockClear()
})

describe('featureExtractionExecutor (runModelInference migration)', () => {
  it('not-loaded → error + empty embedding', () => {
    h.loaded = false
    const out = featureExtractionExecutor(ctx('fe-nl', { text: 'hi' })) as Map<string, unknown>
    expect(out.get('error')).toBe(NOT_LOADED)
    expect(out.get('embedding')).toEqual([])
    expect(out.get('dimensions')).toBe(0)
  })

  it('runs on text, maps embedding + dimensions, pulses done', async () => {
    featureExtractionExecutor(ctx('fe-ok', { text: 'hi' }))
    expect(h.extractFeatures).toHaveBeenCalledWith('hi', undefined)
    await flush()
    const out = featureExtractionExecutor(ctx('fe-ok', { text: 'hi' })) as Map<string, unknown>
    expect(out.get('embedding')).toEqual([0.1, 0.2, 0.3])
    expect(out.get('dimensions')).toBe(3)
    expect(out.get('done')).toBe(true)
  })
})

describe('textTransformationExecutor (runModelInference migration)', () => {
  it('not-loaded → error', () => {
    h.loaded = false
    const out = textTransformationExecutor(ctx('t2-nl', { trigger: true }, { text: 'hi' })) as Map<string, unknown>
    expect(out.get('error')).toBe(NOT_LOADED)
    expect(h.text2text).not.toHaveBeenCalled()
  })

  it('transforms on trigger with the task prefix, pulses done', async () => {
    textTransformationExecutor(ctx('t2-ok', { trigger: true }, { text: 'hello', task: 'summarize' }))
    expect(h.text2text).toHaveBeenCalledWith('summarize: hello', { maxLength: 100 }, undefined)
    await flush()
    const out = textTransformationExecutor(ctx('t2-ok', {}, { text: 'hello' })) as Map<string, unknown>
    expect(out.get('result')).toBe('SUMMARY')
    expect(out.get('done')).toBe(true)
  })

  it('empty text clears the result unconditionally — with or without trigger (regression)', async () => {
    // Seed a cached SUMMARY.
    textTransformationExecutor(ctx('t2-clr', { trigger: true }, { text: 'hello', task: 'summarize' }))
    await flush()
    const seeded = textTransformationExecutor(ctx('t2-clr', {}, { text: 'hello' })) as Map<string, unknown>
    expect(seeded.get('result')).toBe('SUMMARY')

    // Empty text, NO trigger → cleared (previously served the stale SUMMARY).
    const cleared = textTransformationExecutor(ctx('t2-clr', {}, { text: '' })) as Map<string, unknown>
    expect(cleared.get('result')).toBe('')

    // A trigger doesn't change it — empty is empty.
    const clearedTrig = textTransformationExecutor(ctx('t2-clr', { trigger: true }, { text: '   ' })) as Map<string, unknown>
    expect(clearedTrig.get('result')).toBe('')

    // Non-empty text still serves the cached result.
    const held = textTransformationExecutor(ctx('t2-clr', {}, { text: 'hello' })) as Map<string, unknown>
    expect(held.get('result')).toBe('SUMMARY')
  })
})

describe('vlaExecutor (runModelInference migration)', () => {
  it('not-loaded (not downloading) → task-specific error, no spinner', () => {
    h.loaded = false
    h.modelState = undefined
    const out = vlaExecutor(ctx('vla-nl', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe('Model not loaded. Open AI Model Manager → Vision-Language (VLA) → Load.')
    expect(out.get('loading')).toBe(false)
  })

  it('downloading model → spinner, no error (transient, not a failure)', () => {
    h.loaded = false
    h.modelState = 'loading'
    const out = vlaExecutor(ctx('vla-dl', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('loading')).toBe(true)
    expect(out.get('error')).toBe('')
  })

  it('unsupported image when loaded → input error', () => {
    const out = vlaExecutor(ctx('vla-bad', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe('Unsupported image input. Use Webcam Snapshot or Texture to Data.')
    expect(h.visionAction).not.toHaveBeenCalled()
  })
})
