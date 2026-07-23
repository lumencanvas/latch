import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getTheory, getScale } from '@/services/audio/bellowsTheory'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Option values are the EXACT bellows `SCALES` keys — `new Scale(root, name)` throws on an
// unknown name, so these must match verbatim (curated subset of the 34 bellows scales).
const SCALE_NAMES = [
  'major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  'harmonic minor', 'melodic minor', 'blues',
  'major pentatonic', 'minor pentatonic', 'whole tone', 'chromatic',
]

const definition: NodeDefinition = {
  id: 'scale-quantize',
  name: 'Scale Quantize',
  version: '1.0.0',
  category: 'timing',
  description: 'Snap a MIDI note to the nearest tone of a musical scale (bellowsjs theory)',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
    { id: 'degree', type: 'number', label: 'Degree' },
    { id: 'inScale', type: 'boolean', label: 'In Scale' },
  ],
  controls: [
    { id: 'root', type: 'select', label: 'Root', default: 'C', props: { options: ROOTS } },
    { id: 'scaleName', type: 'select', label: 'Scale', default: 'major', props: { options: SCALE_NAMES } },
    { id: 'transpose', type: 'number', label: 'Transpose', default: 0, props: { min: -24, max: 24, step: 1 } },
  ],
  info: {
    overview:
      'Forces incoming MIDI notes into a musical key. Pick a root and scale; every note fed in is snapped to the nearest scale tone (ties resolve down), transposed, and clamped to the 0–127 MIDI range. It only changes WHICH note plays, never WHEN — the trigger passes straight through, so wire a random/LFO/sequencer into Note and a clock into Trigger, then out to any synth or the Bellows Instrument.',
    tips: [
      'Feed a Random or LFO node into Note to get melodic, always-in-key results.',
      'The Trigger input is passed through unchanged — drive it from a metronome or step sequencer.',
      'Degree reports the scale-degree index of the output; In Scale is true when the raw input already fit the key.',
    ],
    pairsWith: ['random', 'lfo', 'metronome', 'step-sequencer', 'bellows-instrument', 'synth'],
  },
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const rawNote = Math.round(ctx.num('note', 60))
  const transpose = (ctx.controls.get('transpose') as number) ?? 0
  const root = (ctx.controls.get('root') as string) ?? 'C'
  const name = (ctx.controls.get('scaleName') as string) ?? 'major'
  // Pass the incoming trigger edge through as a one-frame pulse (changes note, not timing).
  const trig = ctx.trig('trigger')

  const theory = getTheory()
  let outNote: number
  let degree = -1
  let inScale = false

  if (theory) {
    const scale = getScale(theory, root, name) // guards unknown name → falls back to major
    const quantized = scale.quantize(rawNote)
    inScale = scale.contains(rawNote)
    // Degree = index of the output's pitch-class offset within the scale's intervals.
    const rel = ((theory.pitchClass(quantized) - scale.rootPc) % 12 + 12) % 12
    degree = scale.intervals.indexOf(rel)
    outNote = clamp(quantized + transpose, 0, 127)
  } else {
    // Theory module still loading — pass the note through (un-quantized but valid).
    outNote = clamp(rawNote + transpose, 0, 127)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('note', outNote)
  outputs.set('trigger', trig ? 1 : 0)
  outputs.set('degree', degree)
  outputs.set('inScale', inScale)
  return outputs
}

export default defineNode({ definition, executor, pure: false })
