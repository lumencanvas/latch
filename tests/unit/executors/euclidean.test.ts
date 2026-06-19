import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { euclideanExecutor, bjorklund } from '@/engine/executors/euclidean'

function createContext(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  nodeId = 'euclid-test'
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

// Gaps between consecutive pulses (circular). A Euclidean rhythm is maximally
// even: all gaps differ by at most 1.
function gaps(pattern: number[]): number[] {
  const idx = pattern.flatMap((v, i) => (v === 1 ? [i] : []))
  const n = pattern.length
  return idx.map((p, k) => ((idx[(k + 1) % idx.length] - p + n) % n) || n)
}

describe('bjorklund', () => {
  it('produces canonical patterns', () => {
    expect(bjorklund(8, 3)).toEqual([1, 0, 0, 1, 0, 0, 1, 0]) // tresillo
    expect(bjorklund(8, 5)).toEqual([1, 0, 1, 1, 0, 1, 1, 0]) // cinquillo
    expect(bjorklund(4, 2)).toEqual([1, 0, 1, 0])
  })

  it('has exactly `pulses` onsets and is maximally even', () => {
    for (const steps of [5, 8, 12, 16, 7, 13]) {
      for (let pulses = 0; pulses <= steps; pulses++) {
        const p = bjorklund(steps, pulses)
        expect(p).toHaveLength(steps)
        expect(sum(p)).toBe(pulses)
        if (pulses > 1 && pulses < steps) {
          const g = gaps(p)
          expect(Math.max(...g) - Math.min(...g)).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('handles the degenerate ends', () => {
    expect(bjorklund(8, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(bjorklund(4, 4)).toEqual([1, 1, 1, 1])
    expect(bjorklund(0, 3)).toEqual([])
  })
})

describe('euclideanExecutor', () => {
  const run = (inputs: Record<string, unknown>, controls: Record<string, unknown> = {}) =>
    euclideanExecutor(createContext(inputs, controls)) as Map<string, unknown>

  it('reports the gate/value for the current step of E(3,8)', () => {
    const ctrls = { steps: 8, pulses: 3, rotation: 0 }
    // pattern x..x..x.  → pulses at steps 0,3,6
    expect(run({ step: 0 }, ctrls).get('gate')).toBe(true)
    expect(run({ step: 1 }, ctrls).get('gate')).toBe(false)
    expect(run({ step: 3 }, ctrls).get('value')).toBe(1)
    expect(run({ step: 6 }, ctrls).get('value')).toBe(1)
    expect(run({ step: 7 }, ctrls).get('value')).toBe(0)
  })

  it('wraps the step index (and handles negatives)', () => {
    const ctrls = { steps: 8, pulses: 3 }
    expect(run({ step: 8 }, ctrls).get('gate')).toBe(run({ step: 0 }, ctrls).get('gate'))
    expect(run({ step: -1 }, ctrls).get('gate')).toBe(run({ step: 7 }, ctrls).get('gate'))
  })

  it('rotation shifts where the pattern starts without changing pulse count', () => {
    const base = run({ step: 0 }, { steps: 8, pulses: 3, rotation: 0 }).get('pattern') as number[]
    const rot = run({ step: 0 }, { steps: 8, pulses: 3, rotation: 1 }).get('pattern') as number[]
    expect(sum(rot)).toBe(sum(base))
    expect(rot).not.toEqual(base)
    // rotation by 1: position i mirrors base[i-1]
    expect(rot[1]).toBe(base[0])
  })

  it('outputs the full pattern array and pulse count', () => {
    const out = run({ step: 0 }, { steps: 8, pulses: 3 })
    expect(out.get('pattern')).toEqual([1, 0, 0, 1, 0, 0, 1, 0])
    expect(out.get('pulses')).toBe(3)
  })

  it('clamps controls (pulses > steps, huge steps)', () => {
    const out = run({ step: 0 }, { steps: 4, pulses: 99 })
    expect((out.get('pattern') as number[])).toHaveLength(4)
    expect(out.get('pulses')).toBe(4) // clamped to steps
  })
})
