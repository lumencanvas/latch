import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// Control the model singleton so we can exercise loaded/unloaded + success/throw
// without a real worker. `vi.hoisted` lets the mock factory close over mutable state.
const h = vi.hoisted(() => ({
  loaded: true,
  progress: 0,
  generateText: vi.fn(async (_prompt: string) => 'GENERATED'),
}))

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: {
    isModelLoaded: () => h.loaded,
    getModelInfo: () => ({ progress: h.progress }),
    getDefaultModel: () => 'default',
    generateText: h.generateText,
  },
}))

import { textGenerationExecutor } from '@/engine/executors/ai'

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
const run = (...a: Parameters<typeof ctx>) => textGenerationExecutor(ctx(...a)) as Map<string, unknown>

describe('textGenerationExecutor (runModelInference migration)', () => {
  beforeEach(() => {
    h.loaded = true
    h.progress = 0
    h.generateText.mockReset()
    h.generateText.mockResolvedValue('GENERATED')
  })

  it('surfaces a model-not-loaded error on the error output without running', () => {
    h.loaded = false
    const out = run('tg-notloaded', { trigger: true, prompt: 'hi' })
    expect(out.get('error')).toBe('Model not loaded. Open AI Model Manager to load.')
    expect(out.get('loading')).toBe(false)
    expect(h.generateText).not.toHaveBeenCalled()
  })

  it('idles (loading=false, no error) when not triggered', () => {
    const out = run('tg-idle', {})
    expect(out.get('loading')).toBe(false)
    expect(out.get('error')).toBe('')
    expect(h.generateText).not.toHaveBeenCalled()
  })

  it('runs on trigger, serves the result, and pulses done for one frame', async () => {
    run('tg-ok', { trigger: true, prompt: 'hello' })
    expect(h.generateText).toHaveBeenCalledWith('hello', { maxLength: 50, temperature: 0.7 }, undefined)

    await flush()
    const out = run('tg-ok', {})
    expect(out.get('text')).toBe('GENERATED')
    expect(out.get('done')).toBe(true)
    expect(out.get('loading')).toBe(false)
    expect(out.get('error')).toBe('')

    const next = run('tg-ok', {})
    expect(next.get('done')).toBe(false) // rising edge, fires once
  })

  it('surfaces a thrown inference error on the error output (previously swallowed)', async () => {
    h.generateText.mockRejectedValueOnce(new Error('boom'))
    run('tg-err', { trigger: true, prompt: 'hello' })
    await flush()
    const out = run('tg-err', {})
    expect(out.get('error')).toBe('boom')
    expect(out.get('loading')).toBe(false)
  })

  it('clears text on an explicit empty-prompt trigger and does not run', () => {
    const out = run('tg-empty', { trigger: true, prompt: '' }, { prompt: '' })
    expect(out.get('text')).toBe('')
    expect(h.generateText).not.toHaveBeenCalled()
  })
})
