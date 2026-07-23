import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as bellows from 'bellowsjs'
import { makeContext } from '../../_helpers/executionContext'
import { __setTheoryForTest } from '@/services/audio/bellowsTheory'
import node from '@/registry/timing/chord/node'

const def = node.definition
const run = node.executor

beforeEach(() => __setTheoryForTest(bellows as unknown as typeof import('bellowsjs')))
afterEach(() => __setTheoryForTest(null))

// One frame with the given controls/inputs. Unique nodeId keeps trigger edge-state isolated.
function frame(nodeId: string, controls: Record<string, unknown> = {}, inputs: Record<string, unknown> = {}) {
  return run(makeContext(inputs, controls, { nodeId }))
}

describe('chord definition', () => {
  it('is a stateless timing harmony source with a note-array out', () => {
    expect(def.id).toBe('chord')
    expect(def.category).toBe('timing')
    expect(def.icon).toBe('music')
    expect(def.inputs.map((p) => p.id)).toEqual(['root', 'trigger'])
    expect(def.outputs.map((p) => p.id)).toEqual(['notes', 'root', 'bass', 'name', 'trigger'])
    // Notes travels on a 'data' port (it is an array).
    expect(def.outputs.find((p) => p.id === 'notes')?.type).toBe('data')
  })
})

describe('chord executor', () => {
  it('emits the C major triad by default with root/bass/symbol', () => {
    const out = frame('c1', { rootPc: 'C', type: 'maj', octave: 4, inversion: 0 })
    expect(out.get('notes')).toEqual([60, 64, 67])
    expect(out.get('root')).toBe(60)
    expect(out.get('bass')).toBe(60)
    expect(out.get('name')).toBe('C')
  })

  it('honors chord type and octave (G7)', () => {
    const out = frame('g7', { rootPc: 'G', type: '7', octave: 4 })
    expect(out.get('notes')).toEqual([67, 71, 74, 77])
    expect(out.get('root')).toBe(67)
    expect(out.get('bass')).toBe(67)
    expect(out.get('name')).toBe('G7')
  })

  it('applies inversion up and down, keeping the array ascending', () => {
    expect(frame('inv1', { rootPc: 'C', type: 'maj', inversion: 1 }).get('notes')).toEqual([64, 67, 72])
    const dn = frame('inv2', { rootPc: 'C', type: 'maj', inversion: -1 })
    expect(dn.get('notes')).toEqual([55, 60, 64])
    expect(dn.get('bass')).toBe(55)
  })

  it('a connected numeric root input overrides the control pitch class', () => {
    // MIDI 62 → pitch class D; type min → D minor triad.
    const out = frame('rin1', { rootPc: 'C', type: 'min' }, { root: 62 })
    expect(out.get('notes')).toEqual([62, 65, 69])
    expect(out.get('name')).toBe('Dm')
  })

  it('guards an unknown chord type by falling back to a major triad', () => {
    const out = frame('bad1', { rootPc: 'C', type: 'nonsense' })
    expect(out.get('notes')).toEqual([60, 64, 67])
    expect(out.get('name')).toBe('C')
  })

  it('keeps every emitted note within the 0..127 MIDI range', () => {
    const out = frame('clamp1', { rootPc: 'B', type: 'maj9', octave: 7, inversion: 3 })
    const notes = out.get('notes') as number[]
    expect(notes.length).toBeGreaterThan(0)
    for (const n of notes) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(127)
    }
  })

  it('passes an incoming trigger edge through as a one-frame pulse', () => {
    const rise = run(makeContext({ trigger: true }, { rootPc: 'C', type: 'maj' }, { nodeId: 'trg1' }))
    expect(rise.get('trigger')).toBe(1)
    const held = run(makeContext({ trigger: true }, { rootPc: 'C', type: 'maj' }, { nodeId: 'trg1' }))
    expect(held.get('trigger')).toBe(0) // still high → no new rising edge
  })

  it('emits a safe empty chord while theory is still loading', () => {
    __setTheoryForTest(null)
    const out = run(makeContext({ trigger: true }, { rootPc: 'C', type: 'maj' }, { nodeId: 'load1' }))
    expect(out.get('notes')).toEqual([])
    expect(out.get('root')).toBe(60)
    expect(out.get('bass')).toBe(60)
    expect(out.get('name')).toBe('')
    expect(out.get('trigger')).toBe(1) // trigger still passes through
  })
})
