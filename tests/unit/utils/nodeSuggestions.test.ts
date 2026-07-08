import { describe, it, expect, vi } from 'vitest'
import { suggestNodesForPort } from '@/utils/nodeSuggestions'
import { areTypesCompatible } from '@/utils/connections'
import type { NodeDefinition } from '@/stores/nodes'

// Minimal definition stubs — the helper only reads id / inputs / outputs, each
// port { id, type }.
const def = (
  id: string,
  inputs: Array<{ id: string; type: string }>,
  outputs: Array<{ id: string; type: string }>,
): NodeDefinition => ({ id, inputs, outputs } as unknown as NodeDefinition)

const DEFS = [
  def('reverb', [{ id: 'in', type: 'audio' }], [{ id: 'out', type: 'audio' }]),
  def('gain', [{ id: 'sig', type: 'audio' }, { id: 'amt', type: 'number' }], [{ id: 'out', type: 'audio' }]),
  def('add', [{ id: 'a', type: 'number' }, { id: 'b', type: 'number' }], [{ id: 'sum', type: 'number' }]),
  def('label', [{ id: 'text', type: 'string' }], []),
  def('sink', [{ id: 'anything', type: 'any' }], []),
  // Two audio inputs — proves we wire the FIRST compatible port, not the last.
  def('mix', [{ id: 'a', type: 'audio' }, { id: 'b', type: 'audio' }], [{ id: 'out', type: 'audio' }]),
]

describe('suggestNodesForPort', () => {
  it('from an audio OUTPUT, suggests nodes with an audio-compatible INPUT', () => {
    const s = suggestNodesForPort({ type: 'audio', direction: 'source' }, DEFS, areTypesCompatible)
    const ids = s.map(x => x.nodeType)
    // reverb.in, gain.sig, mix.a (audio) accept audio; sink.anything (any) accepts audio.
    expect(ids).toEqual(['reverb', 'gain', 'sink', 'mix'])
    // add (number in) and label (string in) reject audio.
    expect(ids).not.toContain('add')
    expect(ids).not.toContain('label')
  })

  it('returns the first compatible port on each candidate as the wire target', () => {
    const s = suggestNodesForPort({ type: 'audio', direction: 'source' }, DEFS, areTypesCompatible)
    // gain's first compatible input is `sig` (audio), not `amt` (number).
    expect(s.find(x => x.nodeType === 'gain')!.port).toEqual({ id: 'sig', type: 'audio' })
    // mix has two audio inputs — we take the first (`a`), not the last (`b`).
    expect(s.find(x => x.nodeType === 'mix')!.port).toEqual({ id: 'a', type: 'audio' })
  })

  it('from a number INPUT, suggests nodes with a number-compatible OUTPUT', () => {
    const s = suggestNodesForPort({ type: 'number', direction: 'target' }, DEFS, areTypesCompatible)
    // add.sum (number) → number: yes. reverb/gain outputs are audio → no.
    expect(s.map(x => x.nodeType)).toEqual(['add'])
    expect(s[0].port).toEqual({ id: 'sum', type: 'number' })
  })

  it('respects compatibility DIRECTION (number→string ok, string→number not)', () => {
    // From a number OUTPUT: number coerces to string, so `add` (number inputs) AND
    // `label` (string input) are both valid targets.
    const fromNumOut = suggestNodesForPort({ type: 'number', direction: 'source' }, DEFS, areTypesCompatible)
    expect(fromNumOut.map(x => x.nodeType)).toEqual(expect.arrayContaining(['add', 'label']))
    // From a string OUTPUT: string does NOT coerce to number, so `add` (number
    // inputs) must drop out, while `label` (string input) stays. If the helper
    // swapped the compatibility args this asymmetry would collapse.
    const fromStrOut = suggestNodesForPort({ type: 'string', direction: 'source' }, DEFS, areTypesCompatible)
    expect(fromStrOut.map(x => x.nodeType)).toContain('label')
    expect(fromStrOut.map(x => x.nodeType)).not.toContain('add')
  })

  it('uses the injected compatibility fn', () => {
    const never = vi.fn(() => false)
    const s = suggestNodesForPort({ type: 'audio', direction: 'source' }, DEFS, never)
    expect(s).toEqual([])
    expect(never).toHaveBeenCalled()
  })
})
