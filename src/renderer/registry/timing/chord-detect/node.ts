import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getTheory, getScale } from '@/services/audio/bellowsTheory'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SCALE_NAMES = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic minor', 'melodic minor']

const definition: NodeDefinition = {
  id: 'chord-detect',
  name: 'Chord Detect',
  version: '1.0.0',
  category: 'timing',
  description: 'Names the chord in a set of notes (C, Dm7, F#m7b5…) and its Roman numeral in a key (bellowsjs theory)',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'notes', type: 'array', label: 'Notes' }],
  outputs: [
    { id: 'chord', type: 'string', label: 'Chord' },
    { id: 'roman', type: 'string', label: 'Roman Numeral' },
    { id: 'root', type: 'string', label: 'Root' },
    { id: 'found', type: 'boolean', label: 'Recognized' },
  ],
  controls: [
    { id: 'key', type: 'select', label: 'Key', default: 'C', props: { options: ROOTS } },
    { id: 'scaleName', type: 'select', label: 'Scale', default: 'major', props: { options: SCALE_NAMES } },
    { id: 'flats', type: 'toggle', label: 'Spell with Flats', default: false },
  ],
  info: {
    overview:
      'Listens to a set of notes (MIDI numbers, e.g. the held keys of a MIDI keyboard or a Chord node’s output) and names the chord: C, Am, G7, Dm7, F#m7b5, Csus4 and so on, with inversions and slash bass. It also gives the chord’s Roman numeral in the key you choose (ii7, V, IVmaj7…), handy for teaching, visuals that react to harmony, or routing logic by chord.',
    tips: [
      'The lowest note counts as the bass, so an inversion reads as e.g. C/E.',
      'Wire the Chord output into a Monitor or Text node to display what is being played.',
    ],
    pairsWith: ['midi-input', 'chord', 'progression', 'monitor'],
  },
  tags: ['chord', 'detect', 'harmony', 'theory', 'roman numeral', 'analysis', 'bellows'],
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const raw = ctx.inputs.get('notes')
  const notes = Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b) : []
  const out = new Map<string, unknown>([['chord', ''], ['roman', ''], ['root', ''], ['found', false]])
  const theory = getTheory()
  if (!theory || notes.length < 2) return out
  const pcs: number[] = []
  for (const n of notes) {
    const pc = ((Math.round(n) % 12) + 12) % 12
    if (!pcs.includes(pc)) pcs.push(pc)
  }
  const name = theory.detectChord(pcs, ctx.bool('flats', false))
  if (!name) return out
  out.set('chord', name)
  out.set('found', true)
  try {
    const parsed = theory.parseChord(name.split('/')[0])
    out.set('root', theory.pitchClassName(parsed.root, ctx.bool('flats', false)))
    const scale = getScale(theory, ctx.str('key', 'C'), ctx.str('scaleName', 'major'))
    out.set('roman', theory.chordToRoman(parsed, scale))
  } catch { /* a name the parser does not take back: leave roman empty */ }
  return out
}

export default defineNode({ definition, executor })
