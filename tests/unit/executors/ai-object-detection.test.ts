import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const h = vi.hoisted(() => ({
  loaded: true,
  detectObjects: vi.fn(async () => [{ label: 'cat', score: 0.9, box: {} }]),
}))

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: {
    isModelLoaded: () => h.loaded,
    getModelInfo: () => ({ progress: 0 }),
    getDefaultModel: () => 'default',
    detectObjects: h.detectObjects,
  },
}))

import { objectDetectionExecutor } from '@/engine/executors/ai'

function ctx(nodeId: string, inputs: Record<string, unknown>): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount: 0,
  }
}

beforeEach(() => {
  h.loaded = true
  h.detectObjects.mockClear()
})

describe('objectDetectionExecutor (runModelInference migration)', () => {
  it('reports model-not-loaded (over any image error) with empty results', () => {
    h.loaded = false
    const out = objectDetectionExecutor(ctx('od-nl', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe('Model not loaded. Open AI Model Manager to load.')
    expect(out.get('objects')).toEqual([])
    expect(out.get('count')).toBe(0)
    expect(h.detectObjects).not.toHaveBeenCalled()
  })

  it('reports an unsupported image input when loaded, without running', () => {
    const out = objectDetectionExecutor(ctx('od-bad', { image: { bad: true } })) as Map<string, unknown>
    expect(out.get('error')).toBe('Unsupported image input type. Use Webcam Snapshot or Texture to Data node.')
    expect(h.detectObjects).not.toHaveBeenCalled()
  })
})
