import { describe, it, expect } from 'vitest'
import type { ExecutionEngine } from '@/engine/ExecutionEngine'
import {
  runFlow,
  pureStaticFlow,
  timeDrivenFlow,
  lfoFlow,
  diamondFlow,
  mixedFlow,
  type FlowDef,
} from './flowHarness'

/**
 * Phase 2 safety net: change-driven (dirty) execution must produce byte-for-byte
 * the same per-frame outputs as full execution, and must idle static subgraphs.
 */

const FRAMES = 6
const dirty = (e: ExecutionEngine) => e.setExecutionMode('dirty')

const FLOWS: Array<[string, () => FlowDef]> = [
  ['pure-static', pureStaticFlow],
  ['time-driven', timeDrivenFlow],
  ['lfo', lfoFlow],
  ['diamond', diamondFlow],
  ['mixed (continuous source -> pure chain)', mixedFlow],
]

describe('dirty mode is equivalent to full mode', () => {
  for (const [name, factory] of FLOWS) {
    it(`identical per-frame outputs: ${name}`, async () => {
      const full = await runFlow(factory(), { frames: FRAMES, idPrefix: 'f_' })
      const drt = await runFlow(factory(), { frames: FRAMES, idPrefix: 'd_', configure: dirty })
      expect(drt).toEqual(full)
    })
  }
})

describe('dirty mode skips idle nodes (but never falsely idles)', () => {
  it('full mode executes every node every frame (baseline contrast)', async () => {
    const counts: number[] = []
    await runFlow(pureStaticFlow(), { frames: 3, executedPerFrame: counts })
    expect(counts).toEqual([4, 4, 4])
  })

  it('a fully static pure graph runs once, then idles at 0/frame', async () => {
    const counts: number[] = []
    await runFlow(pureStaticFlow(), { frames: 4, configure: dirty, executedPerFrame: counts })
    expect(counts[0]).toBe(4)
    expect(counts.slice(1)).toEqual([0, 0, 0])
  })

  it('diamond idles after the first frame', async () => {
    const counts: number[] = []
    await runFlow(diamondFlow(), { frames: 3, configure: dirty, executedPerFrame: counts })
    expect(counts[0]).toBe(5)
    expect(counts.slice(1)).toEqual([0, 0])
  })

  it('a time-driven graph keeps executing every frame (no false idle)', async () => {
    const counts: number[] = []
    await runFlow(timeDrivenFlow(), { frames: 3, configure: dirty, executedPerFrame: counts })
    // Time (non-pure) runs every frame; its change drives map-range + clamp.
    expect(counts).toEqual([3, 3, 3])
  })
})
