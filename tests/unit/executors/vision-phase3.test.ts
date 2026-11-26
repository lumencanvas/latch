import { describe, it, expect, vi } from 'vitest'

const { isModelLoaded } = vi.hoisted(() => ({ isModelLoaded: vi.fn(() => false) }))
vi.mock('@/services/ai/AIInference', () => ({
  aiInference: { isModelLoaded, getModelInfo: () => undefined, getDefaultModel: () => 'Xenova/slimsam-77-uniform', segment: vi.fn() },
}))

import { easedBoxes, setCached } from '@/registry/ai/shared'
import segmentSpec, { segmentAnythingExecutor } from '@/registry/ai/segment-anything/node'
import { modelNeeds } from '@/services/ai/modelNeeds'

/** AI models plan, Phase 3: eased detection boxes and the Segment Anything node. */
describe('eased detection boxes', () => {
  const box = (label: string, x: number) => ({ label, score: 1, box: { xmin: x, ymin: 0, xmax: x + 10, ymax: 10 } })
  it('glide from the previous box with the same label, then land on the new one', () => {
    setCached('ease:prevBoxes', [box('cat', 0)])
    setCached('ease:detAt', 1000)
    const mid = easedBoxes('ease', [box('cat', 100)], 1075)[0]
    expect(mid.box.xmin).toBeGreaterThan(0)
    expect(mid.box.xmin).toBeLessThan(100)
    expect(easedBoxes('ease', [box('cat', 100)], 1200)[0].box.xmin).toBe(100)
    // A new label has nothing to glide from.
    expect(easedBoxes('ease', [box('dog', 50)], 1075)[0].box.xmin).toBe(50)
  })
})

describe('Segment Anything node', () => {
  it('offers the catalog model and outputs a cut-out and a mask', () => {
    const d = segmentSpec.definition
    expect(d.outputs.map((o) => o.id)).toEqual(expect.arrayContaining(['cutout', 'mask', 'score']))
    expect(segmentSpec.models).toEqual([{ task: 'mask-generation' }])
  })
  it('asks for its model instead of downloading on the first frame', () => {
    const canvas = document.createElement('canvas')
    const out = segmentAnythingExecutor({
      nodeId: 'seg-1', inputs: new Map<string, unknown>([['source', canvas]]), controls: new Map(), frameCount: 0, deltaTime: 1 / 60,
    } as never) as Map<string, unknown>
    expect(out.get('error')).toMatch(/Model not loaded/)
    expect(modelNeeds.get('seg-1')?.task).toBe('mask-generation')
  })
})
