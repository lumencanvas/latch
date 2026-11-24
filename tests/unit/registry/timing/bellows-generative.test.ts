import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import * as bellows from 'bellowsjs'
import { makeContext } from '../../_helpers/executionContext'
import { __setTheoryForTest } from '@/services/audio/bellowsTheory'
import { resetNodeState } from '../../../helpers/testNode'
import chordDetect from '@/registry/timing/chord-detect/node'
import cellular from '@/registry/timing/cellular-rhythm/node'
import lsys, { parseRules, parseMapping } from '@/registry/timing/lsystem-melody/node'
import tuningNode from '@/registry/audio/bellows-tuning/node'
import { __setKernelForTest, __resetBellowsForTest, registerKernelClient } from '@/registry/audio/bellows-instrument/bellowsManager'
import { collectedLifecycles } from '@/engine/nodeState'

beforeAll(() => __setTheoryForTest(bellows as never))
beforeEach(() => resetNodeState())

const run = (node: { executor: (c: never) => unknown }, inputs: Record<string, unknown>, controls: Record<string, unknown>, id = 'n') =>
  node.executor(makeContext(inputs, controls, { nodeId: id }) as never) as Map<string, unknown>

describe('chord-detect', () => {
  it('names triads, sevenths and inversions, with a Roman numeral in the key', () => {
    expect(run(chordDetect, { notes: [60, 64, 67] }, {}).get('chord')).toBe('C')
    const dm7 = run(chordDetect, { notes: [62, 65, 69, 72] }, { key: 'C', scaleName: 'major' })
    expect(dm7.get('chord')).toBe('Dm7')
    expect(dm7.get('roman')).toBe('ii7')
    expect(dm7.get('root')).toBe('D')
    expect(run(chordDetect, { notes: [64, 67, 72] }, {}).get('chord')).toMatch(/^C/)
  })

  it('reports nothing for fewer than two notes or an unknown cluster', () => {
    expect(run(chordDetect, { notes: [60] }, {}).get('found')).toBe(false)
    expect(run(chordDetect, {}, {}).get('chord')).toBe('')
  })
})

describe('cellular-rhythm', () => {
  it('plays a row per bar, then evolves by its rule (one live cell, rule 90)', () => {
    const ctl = { rule: 90, width: 8, start: 'single' }
    const hits: number[] = []
    const gens: number[] = []
    for (let i = 0; i < 16; i++) {
      run(cellular, { clock: false }, ctl)
      const o = run(cellular, { clock: true }, ctl)
      hits.push(o.get('trigger') as number)
      gens.push(o.get('generation') as number)
    }
    // generation 0: only the middle cell (index 4) is on
    expect(hits.slice(0, 8)).toEqual([0, 0, 0, 0, 1, 0, 0, 0])
    // rule 90 from one cell: its two neighbours next
    expect(hits.slice(8, 16)).toEqual([0, 0, 0, 1, 0, 1, 0, 0])
    expect(gens[7]).toBe(0)
    expect(gens[8]).toBe(1)
  })

  it('a wired Rule input overrides the control and reset restarts', () => {
    run(cellular, { clock: true, rule: 30 }, { rule: 90, width: 8 })
    const o = run(cellular, { clock: false, reset: true }, { rule: 90, width: 8 })
    expect(o.get('step')).toBe(0)
    expect(o.get('generation')).toBe(0)
  })
})

describe('lsystem-melody', () => {
  it('parses rules and mappings', () => {
    expect(parseRules('A=AB, B=CA, C=B-')).toEqual({ A: 'AB', B: 'CA', C: 'B-' })
    expect(parseMapping('A=0, B=2, -=rest, junk')).toEqual({ A: 0, B: 2, '-': null })
  })

  it('grows the string and plays one mapped symbol per clock, in key, with gate off on rests', () => {
    const ctl = { axiom: 'A', rules: 'A=AB, B=A-', generations: 3, mapping: 'A=0, B=2, -=rest', root: 'C', scaleName: 'major', octave: 4 }
    const first = run(lsys, { clock: false }, ctl)
    expect(first.get('sequence')).toBe(bellows.lsystem('A', { A: 'AB', B: 'A-' }, 3))
    const seq: unknown[] = []
    for (let i = 0; i < 6; i++) {
      run(lsys, { clock: false }, ctl)
      const o = run(lsys, { clock: true }, ctl)
      seq.push(o.get('gate') ? o.get('note') : 'rest')
    }
    // grown: A B A - A B A A - ... → C4=60, E4=64, rest
    const grown = bellows.lsystem('A', { A: 'AB', B: 'A-' }, 3)
    const expected = [...grown].slice(0, 6).map((c) => (c === 'A' ? 60 : c === 'B' ? 64 : 'rest'))
    expect(seq).toEqual(expected)
  })
})

describe('bellows-tuning', () => {
  it('builds the tuning, applies it to the live kernel, converts notes, and restores 12-TET on removal', () => {
    __resetBellowsForTest()
    const kernel = { tuning: bellows.Tuning.default12, dispose: () => {} }
    __setKernelForTest(kernel)
    const o = run(tuningNode, { note: 70 }, { mode: 'edo', edo: 19 }, 't')
    expect(o.get('name')).toBe('19-EDO')
    expect(o.get('hz')).toBeCloseTo(440 * Math.pow(2, 1 / 19), 6)
    expect(kernel.tuning).not.toBe(bellows.Tuning.default12)
    const ji = run(tuningNode, { note: 64 }, { mode: 'ji', root: 'C' }, 't')
    expect(ji.get('cents')).toBeCloseTo(-13.69, 1) // a pure 5/4 third is ~13.7 cents flat of 12-TET
    // the Tuning node is deleted while other bellows nodes keep the kernel alive
    registerKernelClient('test-keepalive', () => 1)
    for (const l of collectedLifecycles()) l.gc(new Set())
    expect(kernel.tuning).toBe(bellows.Tuning.default12)
    registerKernelClient('test-keepalive', () => 0)
  })

  it('reports a Scala parse error instead of throwing', () => {
    const o = run(tuningNode, {}, { mode: 'scala', scl: '' }, 's')
    expect(o.get('error')).toMatch(/Paste a .scl/)
  })
})
