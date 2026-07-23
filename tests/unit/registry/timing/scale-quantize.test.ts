import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as bellows from 'bellowsjs'
import { makeContext } from '../../_helpers/executionContext'
import { __setTheoryForTest } from '@/services/audio/bellowsTheory'
import node from '@/registry/timing/scale-quantize/node'

const def = node.definition
const run = node.executor

// bellows theory is pure JS (no worklet) — inject the REAL module so quantize is exercised
// for real, not mocked.
beforeEach(() => __setTheoryForTest(bellows as unknown as typeof import('bellowsjs')))
afterEach(() => __setTheoryForTest(null))

describe('scale-quantize definition', () => {
  it('is a timing node: note+trigger in, quantized note/degree/inScale out', () => {
    expect(def.id).toBe('scale-quantize')
    expect(def.category).toBe('timing')
    expect(def.inputs.map((p) => p.id)).toEqual(['note', 'trigger'])
    expect(def.outputs.map((p) => p.id)).toEqual(['note', 'trigger', 'degree', 'inScale'])
  })

  it('scale option values are exact bellows SCALES keys (new Scale throws otherwise)', () => {
    const scaleCtrl = def.controls.find((c) => c.id === 'scaleName')
    const opts = scaleCtrl?.props?.options as string[]
    for (const name of opts) {
      expect(bellows.SCALES[name], `"${name}" is not a real bellows scale`).toBeTruthy()
    }
    expect(opts).toContain('harmonic minor')
    expect(opts).toContain('major pentatonic')
  })
})

describe('scale-quantize executor', () => {
  it('snaps an out-of-key note down to the nearest scale tone (C major)', () => {
    const out = run(makeContext({ note: 61 }, { root: 'C', scaleName: 'major', transpose: 0 }, { nodeId: 'q1' }))
    expect(out.get('note')).toBe(60) // C#4 → C4 (tie resolves down)
    expect(out.get('inScale')).toBe(false)
    expect(out.get('degree')).toBe(0)
  })

  it('passes an in-key note through and reports its degree', () => {
    const out = run(makeContext({ note: 67 }, { root: 'C', scaleName: 'major' }, { nodeId: 'q2' }))
    expect(out.get('note')).toBe(67) // G4, degree 4
    expect(out.get('inScale')).toBe(true)
    expect(out.get('degree')).toBe(4)
  })

  it('applies transpose after quantizing, clamped to 0..127', () => {
    const out = run(makeContext({ note: 66 }, { root: 'C', scaleName: 'major', transpose: 12 }, { nodeId: 'q3' }))
    expect(out.get('note')).toBe(77) // 66 → 65 (F) → +12 = 77
    const hi = run(makeContext({ note: 120 }, { root: 'C', scaleName: 'chromatic', transpose: 24 }, { nodeId: 'q4' }))
    expect(hi.get('note')).toBe(127) // clamped
  })

  it('falls back to major on an unknown scale name instead of throwing', () => {
    expect(() =>
      run(makeContext({ note: 61 }, { root: 'C', scaleName: 'not-a-scale' }, { nodeId: 'q5' })),
    ).not.toThrow()
  })

  it('passes the trigger edge through as a one-frame pulse', () => {
    const first = run(makeContext({ note: 60, trigger: true }, {}, { nodeId: 'q6' }))
    expect(first.get('trigger')).toBe(1) // rising edge → pulse
    const second = run(makeContext({ note: 60, trigger: true }, {}, { nodeId: 'q6' }))
    expect(second.get('trigger')).toBe(0) // held high, no new edge
  })

  it('passes the note through un-quantized while the theory module is still loading', () => {
    __setTheoryForTest(null)
    const out = run(makeContext({ note: 61 }, { root: 'C', scaleName: 'major', transpose: 2 }, { nodeId: 'q7' }))
    expect(out.get('note')).toBe(63) // 61 + 2, no quantize
    expect(out.get('degree')).toBe(-1)
    expect(out.get('inScale')).toBe(false)
  })
})
