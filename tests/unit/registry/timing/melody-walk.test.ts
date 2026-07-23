import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as bellows from 'bellowsjs'
import { makeContext } from '../../_helpers/executionContext'
import { __setTheoryForTest } from '@/services/audio/bellowsTheory'
import { resetNodeState } from '../../../helpers/testNode'
import node from '@/registry/timing/melody-walk/node'

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
function sequence(nodeId: string, n: number, controls: Record<string, unknown> = {}) {
  const notes: number[] = []
  for (let i = 0; i < n; i++) {
    const out = frame(nodeId, true, controls)
    notes.push(out.get('note') as number)
    frame(nodeId, false, controls) // release so the next high is a fresh edge
  }
  return notes
}

// Real bellows Scale to derive in-key membership (never guessed).
function inKey(root: string, name: string, note: number): boolean {
  const scale = new bellows.Scale(root, name)
  const rel = ((note - scale.rootPc) % 12 + 12) % 12
  return scale.intervals.includes(rel)
}

describe('melody-walk definition', () => {
  it('is a clock-driven timing node with a held note stream out', () => {
    expect(def.id).toBe('melody-walk')
    expect(def.category).toBe('timing')
    expect(def.icon).toBe('music')
    expect(def.platforms).toEqual(['web', 'electron'])
    expect(def.inputs.map((p) => p.id)).toEqual(['clock', 'reset'])
    expect(def.outputs.map((p) => p.id)).toEqual(['note', 'trigger', 'velocity', 'degree'])
    expect(def.controls.map((c) => c.id)).toEqual([
      'root', 'scaleName', 'octaveRange', 'leapChance', 'repeatPenalty', 'gravity', 'velocity', 'seed',
    ])
  })
})

describe('melody-walk executor', () => {
  it('emits only in-key notes on repeated clocks', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 3 }
    const notes = sequence('key1', 16, controls)
    for (const n of notes) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(127)
      expect(inKey('C', 'major', n)).toBe(true)
    }
  })

  it('emits only in-key notes for a transposed non-diatonic key', () => {
    const controls = { root: 'F#', scaleName: 'dorian', seed: 5 }
    const notes = sequence('key2', 12, controls)
    for (const n of notes) {
      expect(inKey('F#', 'dorian', n)).toBe(true)
    }
  })

  it('holds the note and only pulses trigger on the clock rising edge', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 1 }
    const rise = frame('hold1', true, controls)
    expect(rise.get('trigger')).toBe(1)
    const firstNote = rise.get('note')
    const held = frame('hold1', true, controls) // still high → no new edge
    expect(held.get('trigger')).toBe(0)
    expect(held.get('note')).toBe(firstNote) // unchanged between edges
  })

  it('degree reported is within the scale (0..length-1)', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 2 }
    for (let i = 0; i < 8; i++) {
      const out = frame('deg1', true, controls)
      const degree = out.get('degree') as number
      expect(degree).toBeGreaterThanOrEqual(0)
      expect(degree).toBeLessThanOrEqual(6) // major has 7 degrees
      frame('deg1', false, controls)
    }
  })

  it('is deterministic — reset reproduces the same sequence for a node+seed', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 7 }
    const first = sequence('det1', 8, controls)
    run(makeContext({ clock: false, reset: true }, controls, { nodeId: 'det1' })) // reset
    const second = sequence('det1', 8, controls)
    expect(second).toEqual(first)
  })

  it('reset wins over a coincident clock edge (restarts the walk)', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 4 }
    const before = sequence('rst1', 3, controls)
    // reset + clock on the same frame → reset wins, position returns to start
    run(makeContext({ clock: true, reset: true }, controls, { nodeId: 'rst1' }))
    frame('rst1', false, controls)
    const after = sequence('rst1', 3, controls)
    expect(after).toEqual(before)
  })

  it('clamps velocity output and passes it through', () => {
    const hi = frame('vel1', true, { seed: 0, velocity: 200 })
    expect(hi.get('velocity')).toBe(127)
    const lo = frame('vel2', true, { seed: 0, velocity: -50 })
    expect(lo.get('velocity')).toBe(0)
  })
})
