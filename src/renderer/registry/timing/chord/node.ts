import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getTheory } from '@/services/audio/bellowsTheory'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Option values are EXACT bellows `CHORD_TYPES` keys — `chord(root, type)` builds an
// undefined interval set (and throws downstream) on an unknown key, so these match verbatim.
const CHORD_KINDS = [
  'maj', 'min', 'maj7', 'm7', '7', 'dim', 'aug', 'sus2', 'sus4',
  '6', 'm6', 'add9', 'm7b5', 'mMaj7', 'maj9', 'm9', '9',
]

const definition: NodeDefinition = {
  id: 'chord',
  name: 'Chord',
  version: '1.0.0',
  category: 'timing',
  description: 'Harmony source — emits a chord as a MIDI note array (bellowsjs theory)',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'root', type: 'number', label: 'Root' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [
    { id: 'notes', type: 'data', label: 'Notes' },
    { id: 'root', type: 'number', label: 'Root' },
    { id: 'bass', type: 'number', label: 'Bass' },
    { id: 'name', type: 'string', label: 'Symbol' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  controls: [
    { id: 'rootPc', type: 'select', label: 'Root', default: 'C', props: { options: ROOTS } },
    { id: 'type', type: 'select', label: 'Type', default: 'maj', props: { options: CHORD_KINDS } },
    { id: 'octave', type: 'number', label: 'Octave', default: 4, props: { min: 1, max: 7, step: 1 } },
    { id: 'inversion', type: 'number', label: 'Inversion', default: 0, props: { min: -3, max: 3, step: 1 } },
  ],
  info: {
    overview:
      'A harmony source: pick a root and chord quality and it emits the chord as a MIDI note ARRAY (plus its root, bass note, and symbol like "Cmaj7"). Stateless — it recomputes every frame and passes any incoming trigger edge straight through, so it changes WHICH notes, never WHEN. Because Notes is an array, wire it into an Arpeggiator (or a poly voice) rather than straight into a mono instrument, which plays a single note per trigger. Feed a MIDI number into Root to transpose the chord live from a sequencer or LFO.',
    tips: [
      'Notes is an ARRAY — route it into an Arpeggiator to play the chord one note at a time.',
      'Inversion rotates the voicing up (+) or down (−) without changing the chord.',
      'Connect a MIDI number to Root to drive chord changes from a sequencer or random source.',
    ],
    pairsWith: ['arpeggiator', 'scale-quantize', 'step-sequencer', 'bellows-instrument', 'random'],
  },
  tags: ['chord', 'harmony', 'theory', 'notes', 'generative', 'midi', 'voicing'],
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// Building a chord + inverting allocates arrays; memoize by the full voicing key so a
// per-frame executor doesn't rebuild the same chord ~60×/sec. Bounded by (roots × types ×
// octaves × inversions).
const chordCache = new Map<string, { notes: number[]; name: string; bass: number }>()

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const rootPcCtrl = (ctx.controls.get('rootPc') as string) ?? 'C'
  const type = (ctx.controls.get('type') as string) ?? 'maj'
  const octave = clamp(Math.round((ctx.controls.get('octave') as number) ?? 4), 1, 7)
  const inversion = clamp(Math.round((ctx.controls.get('inversion') as number) ?? 0), -3, 3)
  const trig = ctx.trig('trigger')

  const outputs = new Map<string, unknown>()
  const theory = getTheory()

  if (!theory) {
    // Theory module still loading — emit a safe, valid empty chord and pass the trigger.
    outputs.set('notes', [])
    outputs.set('root', 60)
    outputs.set('bass', 60)
    outputs.set('name', '')
    outputs.set('trigger', trig ? 1 : 0)
    return outputs
  }

  // Root: a connected MIDI number overrides the control's pitch class.
  const rootInput = ctx.inputs.get('root')
  const rootPcNum =
    typeof rootInput === 'number' && Number.isFinite(rootInput)
      ? theory.pitchClass(Math.round(rootInput))
      : theory.parsePitchClass(rootPcCtrl)

  // Guard unknown chord types (chord() throws downstream) — fall back to a major triad.
  const safeType = theory.CHORD_TYPES[type] ? type : 'maj'

  const key = `${rootPcNum}|${safeType}|${octave}|${inversion}`
  let built = chordCache.get(key)
  if (!built) {
    const chord = theory.chord(rootPcNum, safeType)
    let notes = chord.midi(octave)
    if (inversion !== 0) notes = theory.invert(notes, inversion)
    notes = notes.map((n) => clamp(Math.round(n), 0, 127)).sort((a, b) => a - b)
    built = { notes, name: theory.chordName(chord), bass: notes.length > 0 ? notes[0] : 0 }
    chordCache.set(key, built)
  }

  // Root output = the chord's root pitch as a MIDI note at the chosen octave (clamped).
  const rootMidi = clamp(rootPcNum + (octave + 1) * 12, 0, 127)

  outputs.set('notes', built.notes)
  outputs.set('root', rootMidi)
  outputs.set('bass', built.bass)
  outputs.set('name', built.name)
  outputs.set('trigger', trig ? 1 : 0)
  return outputs
}

export default defineNode({ definition, executor, pure: false })
