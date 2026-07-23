import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as bellows from 'bellowsjs'
import { makeContext } from '../../_helpers/executionContext'
import { __setTheoryForTest } from '@/services/audio/bellowsTheory'
import { resetNodeState } from '../../../helpers/testNode'
import node from '@/registry/timing/progression/node'

const def = node.definition
const run = node.executor

beforeEach(() => __setTheoryForTest(bellows as unknown as typeof import('bellowsjs')))
beforeEach(resetNodeState) // stateful node — drain per-node state between cases
afterEach(() => __setTheoryForTest(null))

// Derive the expected degree plan straight from real bellows for a given node+seed, matching
// the executor's rng label (`${nodeId}:${seed}`). Never hand-guess degrees.
function expectedDegrees(nodeId: string, bars: number, cadence: boolean, seed: number) {
  return bellows.buildProgression(bellows.rng(`${nodeId}:${seed}`), bars, { cadence })
}

// Drive one frame; a rising clock edge requires the previous frame to be low.
function frame(nodeId: string, inputs: Record<string, unknown>, controls: Record<string, unknown> = {}) {
  return run(makeContext(inputs, controls, { nodeId }))
}

// Advance one clock edge (release low afterward so the next high is a fresh edge).
function advance(nodeId: string, controls: Record<string, unknown> = {}) {
  const out = frame(nodeId, { clock: true }, controls)
  frame(nodeId, { clock: false }, controls) // release
  return out
}

describe('progression definition', () => {
  it('is a clock-driven timing node with the harmonic outputs', () => {
    expect(def.id).toBe('progression')
    expect(def.name).toBe('Progression')
    expect(def.category).toBe('timing')
    expect(def.version).toBe('1.0.0')
    expect(def.icon).toBe('music')
    expect(def.inputs.map((p) => p.id)).toEqual(['clock', 'reset'])
    expect(def.outputs.map((p) => p.id)).toEqual(['notes', 'root', 'bass', 'roman', 'degree', 'trigger'])
    // Voicing travels as an array on a 'data' port.
    expect(def.outputs.find((p) => p.id === 'notes')?.type).toBe('data')
  })
})

describe('progression executor', () => {
  it('starts on the tonic and emits a voice-led triad', () => {
    const degs = expectedDegrees('p', 4, true, 0)
    const out = frame('p', { clock: false }, { root: 'C', scaleName: 'major', seed: 0 })
    expect(out.get('degree')).toBe(degs[0]) // 0 — tonic
    expect(out.get('roman')).toBe('I')
    const notes = out.get('notes') as number[]
    expect(Array.isArray(notes)).toBe(true)
    expect(notes.length).toBeGreaterThan(0)
    expect(out.get('bass')).toBe(notes[0])
    // No clock edge on this frame → trigger low.
    expect(out.get('trigger')).toBe(0)
  })

  it('advances one degree per clock edge and wraps at the end of the plan', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 0 }
    const degs = expectedDegrees('adv', 4, true, 0) // [0,5,4,0]
    // Initial resolve (no clock) sits on bar 0.
    expect(frame('adv', { clock: false }, controls).get('degree')).toBe(degs[0])
    // Each edge steps to the next bar; the 4th edge wraps back to bar 0.
    const seen: number[] = []
    for (let i = 0; i < degs.length; i++) seen.push(advance('adv', controls).get('degree') as number)
    expect(seen).toEqual([degs[1], degs[2], degs[3], degs[0]])
  })

  it('pulses trigger only on the clock rising edge and holds the chord between edges', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 0 }
    frame('hold', { clock: false }, controls)
    const rise = frame('hold', { clock: true }, controls)
    expect(rise.get('trigger')).toBe(1)
    const held = frame('hold', { clock: true }, controls) // still high → no new edge
    expect(held.get('trigger')).toBe(0)
    expect(held.get('degree')).toBe(rise.get('degree')) // unchanged between edges
    expect(held.get('notes')).toEqual(rise.get('notes'))
  })

  it('emits a non-empty MIDI voicing within the voice window and 0..127', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 0, voiceLow: 48, voiceHigh: 84 }
    frame('bound', { clock: false }, controls)
    for (let i = 0; i < 4; i++) {
      const notes = advance('bound', controls).get('notes') as number[]
      expect(notes.length).toBeGreaterThan(0)
      for (const n of notes) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(48)
        expect(n).toBeLessThanOrEqual(84)
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(127)
      }
    }
  })

  it('reset returns to the tonic and wins over a coincident clock edge', () => {
    const controls = { root: 'C', scaleName: 'major', seed: 0 }
    const degs = expectedDegrees('rst', 4, true, 0)
    frame('rst', { clock: false }, controls)
    advance('rst', controls) // bar 1
    advance('rst', controls) // bar 2
    // Reset AND clock on the same frame → reset wins, back to bar 0.
    const out = frame('rst', { clock: true, reset: true }, controls)
    expect(out.get('degree')).toBe(degs[0])
    expect(out.get('roman')).toBe('I')
  })

  it('is deterministic — the degree plan matches real bellows for a node+seed', () => {
    const controls = { root: 'A', scaleName: 'minor', seed: 3 }
    const degs = expectedDegrees('det', 4, true, 3)
    const seen: number[] = [frame('det', { clock: false }, controls).get('degree') as number]
    for (let i = 0; i < degs.length - 1; i++) seen.push(advance('det', controls).get('degree') as number)
    expect(seen).toEqual(degs) // [0,1,4,0] for node 'det' / seed 3
  })

  it('holds a safe passthrough while theory is still loading (no NaN/undefined)', () => {
    __setTheoryForTest(null)
    const out = frame('load', { clock: true }, { root: 'C', scaleName: 'major', seed: 0 })
    expect(out.get('notes')).toEqual([]) // no chord resolved yet
    expect(out.get('degree')).toBe(0)
    expect(Number.isFinite(out.get('root'))).toBe(true)
    expect(out.get('trigger')).toBe(1) // still pulses on the clock
  })

  it('handles an inverted voice window (voiceLow > voiceHigh) without silently dying', () => {
    // The control ranges overlap, so a user can set low > high; bellows.voiceLead throws
    // ("no voicing fits the range") in that case, which would stop all output. The node
    // orders them before calling, so it must still emit a valid voicing.
    const controls = { root: 'C', scaleName: 'major', seed: 0, voiceLow: 72, voiceHigh: 60 }
    let out!: ReturnType<typeof frame>
    expect(() => { out = frame('inv', { clock: true }, controls) }).not.toThrow()
    const voicing = out.get('notes') as number[]
    expect(Array.isArray(voicing)).toBe(true)
    expect(voicing.length).toBeGreaterThan(0)
    for (const n of voicing) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(127)
    }
  })
})
