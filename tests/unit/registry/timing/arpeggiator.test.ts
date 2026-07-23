import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as bellows from 'bellowsjs'
import { makeContext } from '../../_helpers/executionContext'
import { __setTheoryForTest } from '@/services/audio/bellowsTheory'
import { resetNodeState } from '../../../helpers/testNode'
import node from '@/registry/timing/arpeggiator/node'

const def = node.definition
const run = node.executor

beforeEach(() => __setTheoryForTest(bellows as unknown as typeof import('bellowsjs')))
beforeEach(resetNodeState) // stateful node — drain per-node state between cases
afterEach(() => __setTheoryForTest(null))

// Drive one frame; a rising clock edge requires the previous frame to be low.
function frame(nodeId: string, clock: boolean, controls: Record<string, unknown> = {}, inputs: Record<string, unknown> = {}) {
  return run(makeContext({ clock, ...inputs }, controls, { nodeId }))
}

// Advance N clock edges (low frame between highs) and collect the note on each rising frame.
function sequence(nodeId: string, n: number, controls: Record<string, unknown> = {}, inputs: Record<string, unknown> = {}) {
  const notes: number[] = []
  for (let i = 0; i < n; i++) {
    const out = frame(nodeId, true, controls, inputs)
    notes.push(out.get('note') as number)
    frame(nodeId, false, controls, inputs) // release so the next high is a fresh edge
  }
  return notes
}

describe('arpeggiator definition', () => {
  it('is a clock-driven timing node with a held note stream out', () => {
    expect(def.id).toBe('arpeggiator')
    expect(def.category).toBe('timing')
    expect(def.inputs.map((p) => p.id)).toEqual(['clock', 'reset', 'notes'])
    expect(def.outputs.map((p) => p.id)).toEqual(['note', 'trigger', 'velocity', 'notes'])
  })
})

describe('arpeggiator executor', () => {
  it('arpeggiates the root triad of the key upward by default', () => {
    expect(sequence('up1', 4, { mode: 'up', root: 'C', scaleName: 'major' })).toEqual([60, 64, 67, 60])
  })

  it('honors mode (down) and octave span', () => {
    expect(sequence('dn1', 3, { mode: 'down' })).toEqual([67, 64, 60])
    expect(sequence('oc1', 6, { mode: 'up', octaves: 2 })).toEqual([60, 64, 67, 72, 76, 79])
  })

  it('arpeggiates an explicit note-array input instead of the default triad', () => {
    const notes = sequence('inp1', 3, { mode: 'up' }, { notes: [48, 52, 55] })
    expect(notes).toEqual([48, 52, 55])
    // The pool is echoed on the output for chaining.
    const out = frame('inp1', false, { mode: 'up' }, { notes: [48, 52, 55] })
    expect(out.get('notes')).toEqual([48, 52, 55])
  })

  it('holds the note and only pulses trigger on the clock rising edge', () => {
    const rise = frame('hold1', true, { mode: 'up' })
    expect(rise.get('trigger')).toBe(1)
    expect(rise.get('note')).toBe(60)
    const held = frame('hold1', true, { mode: 'up' }) // still high → no new edge
    expect(held.get('trigger')).toBe(0)
    expect(held.get('note')).toBe(60) // unchanged between edges
  })

  it('reset returns to the start of the cycle', () => {
    frame('rst1', true, { mode: 'up' }) // 60
    frame('rst1', false, { mode: 'up' })
    frame('rst1', true, { mode: 'up' }) // 64
    frame('rst1', false, { mode: 'up' })
    run(makeContext({ clock: false, reset: true }, { mode: 'up' }, { nodeId: 'rst1' })) // reset
    const after = frame('rst1', true, { mode: 'up' })
    expect(after.get('note')).toBe(60) // back to the top
  })

  it('random mode is deterministic — reset reproduces the same sequence for a node+seed', () => {
    const first = sequence('rnd1', 6, { mode: 'random', seed: 7 })
    run(makeContext({ clock: false, reset: true }, { mode: 'random', seed: 7 }, { nodeId: 'rnd1' }))
    const second = sequence('rnd1', 6, { mode: 'random', seed: 7 })
    expect(second).toEqual(first)
  })

  it('clamps velocity output and passes it through', () => {
    const out = frame('vel1', true, { mode: 'up', velocity: 200 })
    expect(out.get('velocity')).toBe(127)
  })
})
