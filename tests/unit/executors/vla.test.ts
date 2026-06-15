import { describe, it, expect } from 'vitest'
import { vlaExecutor } from '@/engine/executors/ai'
import { vlaNode } from '@/registry/ai/vla'
import { AI_MODELS } from '@/services/ai/AIInference'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

/**
 * Vision-Language-Action node (VLM-as-policy via SmolVLM): image + instruction →
 * action text. The model-run path is browser-validated; here we pin the node
 * shape, the catalog entry, and the executor's not-loaded guard.
 */
function ctx(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
): ExecutionContext {
  return {
    nodeId: 'v',
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount: 1,
  }
}

describe('vlaNode definition', () => {
  it('takes image + instruction + trigger and outputs action/loading/done', () => {
    expect(vlaNode.inputs.map((i) => i.id)).toEqual(expect.arrayContaining(['image', 'instruction', 'trigger']))
    expect(vlaNode.outputs.map((o) => o.id)).toEqual(expect.arrayContaining(['action', 'loading', 'done']))
  })

  it('offers SmolVLM models with the 256M default', () => {
    const model = vlaNode.controls.find((c) => c.id === 'model')
    const options = (model?.props as { options: Array<{ value: string }> }).options
    expect(options.length).toBeGreaterThanOrEqual(2)
    expect(model?.default).toBe('HuggingFaceTB/SmolVLM-256M-Instruct')
    expect(options.every((o) => /SmolVLM/.test(o.value))).toBe(true)
  })
})

describe('vision-language catalog entry', () => {
  it('registers a SmolVLM model under the image-text-to-text task', () => {
    const m = AI_MODELS.find((x) => x.task === 'image-text-to-text')
    expect(m).toBeTruthy()
    expect(m?.defaultModel).toContain('SmolVLM')
    expect(m?.defaultLicense).toBe('apache-2.0')
    expect(m?.alternateModels.length).toBeGreaterThanOrEqual(1)
  })
})

describe('vlaExecutor', () => {
  it('reports an error and stays idle when the model is not loaded', () => {
    const out = vlaExecutor(ctx({ instruction: 'go' }, { model: 'HuggingFaceTB/SmolVLM-256M-Instruct' })) as Map<
      string,
      unknown
    >
    expect(out.get('loading')).toBe(false)
    expect(out.get('done')).toBe(false)
    expect(out.get('action')).toBe('')
    expect(out.get('_error')).toMatch(/not loaded/i)
  })
})
