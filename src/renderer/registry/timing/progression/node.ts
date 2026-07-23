import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { getTheory, getScale } from '@/services/audio/bellowsTheory'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// buildProgression + diatonicTriads assume a 7-degree DIATONIC scale (one triad per degree),
// so only the seven-note modes are offered — a pentatonic/blues scale would misalign the
// degree→triad map. Names are the EXACT bellows `SCALES` keys (getScale still guards them).
const SCALE_NAMES = [
  'major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  'harmonic minor', 'melodic minor',
]

const definition: NodeDefinition = {
  id: 'progression',
  name: 'Progression',
  version: '1.0.0',
  category: 'timing',
  description: 'Clock-driven, voice-led diatonic chord progression (bellowsjs)',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'clock', type: 'trigger', label: 'Advance' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'notes', type: 'data', label: 'Voicing' },
    { id: 'root', type: 'number', label: 'Root' },
    { id: 'bass', type: 'number', label: 'Bass' },
    { id: 'roman', type: 'string', label: 'Roman' },
    { id: 'degree', type: 'number', label: 'Degree' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  controls: [
    { id: 'root', type: 'select', label: 'Root', default: 'C', props: { options: ROOTS } },
    { id: 'scaleName', type: 'select', label: 'Scale', default: 'major', props: { options: SCALE_NAMES } },
    { id: 'bars', type: 'number', label: 'Bars', default: 4, props: { min: 2, max: 16, step: 1 } },
    { id: 'cadence', type: 'boolean', label: 'Cadence', default: true },
    { id: 'octave', type: 'number', label: 'Octave', default: 4, props: { min: 2, max: 6, step: 1 } },
    { id: 'voiceLow', type: 'number', label: 'Voice Low', default: 48, props: { min: 36, max: 72, step: 1 } },
    { id: 'voiceHigh', type: 'number', label: 'Voice High', default: 84, props: { min: 60, max: 96, step: 1 } },
    { id: 'seed', type: 'number', label: 'Seed', default: 0, props: { min: 0, max: 9999, step: 1 } },
  ],
  info: {
    overview:
      'Generates a full harmonic progression and walks it one bar per clock trigger, emitting a smoothly voice-led chord each step. The bellowsjs planner builds a diatonic degree sequence (starting and, with Cadence on, ending on the tonic) for the chosen key; each bar is realized as a triad and voice-led from the previous chord so voices move by the smallest interval. Wire a metronome or bar clock into Advance, then Voicing into the Bellows Instrument (or fan Root/Bass into a synth). Everything is deterministic per Seed, so a flow replays note-for-note.',
    tips: [
      'Clock Advance from a bar-length metronome pulse; each edge moves to the next chord.',
      'Voicing is a polyphonic MIDI array — feed it straight into a poly synth or the Bellows Instrument; Bass gives you the lowest voice for a separate bassline.',
      'Reset returns to the tonic (bar 0) without regenerating; change Seed to compose a new progression.',
    ],
    pairsWith: ['metronome', 'step-sequencer', 'bellows-instrument', 'scale-quantize', 'arpeggiator'],
  },
  tags: ['progression', 'chords', 'harmony', 'voice-leading', 'generative', 'theory', 'roman'],
}

interface ProgressionState {
  degrees: number[]
  barIndex: number
  resolvedIndex: number
  prevVoicing: number[]
  voicing: number[]
  rootMidi: number
  bass: number
  roman: string
  degree: number
  sig: string
}

// bellows theory/seq objects are pure JS (no external resource) — the store needs no dispose.
const progressionState = defineNodeState<ProgressionState>({ label: 'bellows-progression' })

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const root = (ctx.controls.get('root') as string) ?? 'C'
  const scaleName = (ctx.controls.get('scaleName') as string) ?? 'major'
  const bars = clamp(Math.round(ctx.num('bars', 4)), 2, 16)
  const cadence = (ctx.controls.get('cadence') as boolean) ?? true
  const octave = clamp(Math.round(ctx.num('octave', 4)), 2, 6)
  const voiceLow = clamp(Math.round(ctx.num('voiceLow', 48)), 36, 72)
  const voiceHigh = clamp(Math.round(ctx.num('voiceHigh', 84)), 60, 96)
  const seed = Math.round(ctx.num('seed', 0))

  const clockEdge = ctx.trig('clock')
  const resetEdge = ctx.trig('reset')

  const state = progressionState.getOrCreate(ctx.nodeId, () => ({
    degrees: [], barIndex: 0, resolvedIndex: -1, prevVoicing: [],
    voicing: [], rootMidi: 60, bass: 60, roman: '', degree: 0, sig: '',
  }))

  const outputs = new Map<string, unknown>()
  const theory = getTheory()

  if (!theory) {
    // Theory module still loading — hold the last resolved chord, still pulse on the clock.
    outputs.set('notes', state.voicing)
    outputs.set('root', state.rootMidi)
    outputs.set('bass', state.bass)
    outputs.set('roman', state.roman)
    outputs.set('degree', state.degree)
    outputs.set('trigger', clockEdge ? 1 : 0)
    return outputs
  }

  // Regenerate the degree plan only when a defining control changes (or on first run).
  const sig = `${root}|${scaleName}|${bars}|${cadence}|${seed}`
  if (state.sig !== sig) {
    state.degrees = theory.buildProgression(theory.rng(`${ctx.nodeId}:${seed}`), bars, { cadence })
    state.barIndex = 0
    state.resolvedIndex = -1
    state.prevVoicing = []
    state.sig = sig
  }

  const scale = getScale(theory, root, scaleName)

  if (resetEdge) {
    // Reset wins over a coincident clock edge — return to the tonic (bar 0).
    state.barIndex = 0
    state.resolvedIndex = -1
    state.prevVoicing = []
  } else if (clockEdge && state.degrees.length > 0) {
    state.barIndex = (state.barIndex + 1) % state.degrees.length
  }

  // Resolve (re-voice) only when the bar actually changed — not every frame.
  if (state.degrees.length > 0 && state.barIndex !== state.resolvedIndex) {
    const triads = theory.diatonicTriads(scale)
    const degree = state.degrees[state.barIndex]
    // Guard: a non-7-degree scale would overrun triads — index modulo its length.
    const cand = triads[degree % triads.length]
    // The control ranges overlap (voiceLow 36–72, voiceHigh 60–96), so a user can set
    // low > high — bellows.voiceLead THROWS ("no voicing fits the range") in that case,
    // which would silently stop all output. Order them before the call.
    const lo = Math.min(voiceLow, voiceHigh)
    const hi = Math.max(voiceLow, voiceHigh)
    const voicing = theory
      .voiceLead(state.prevVoicing, [cand.midi(octave)], { low: lo, high: hi })
      .map((n) => clamp(Math.round(n), 0, 127))
    state.prevVoicing = voicing
    state.voicing = voicing
    state.roman = theory.chordToRoman(cand, scale)
    state.rootMidi = clamp(cand.root + (octave + 1) * 12, 0, 127)
    state.bass = voicing.length > 0 ? voicing[0] : state.rootMidi
    state.degree = degree
    state.resolvedIndex = state.barIndex
  }

  outputs.set('notes', state.voicing)
  outputs.set('root', state.rootMidi)
  outputs.set('bass', state.bass)
  outputs.set('roman', state.roman)
  outputs.set('degree', state.degree)
  outputs.set('trigger', clockEdge ? 1 : 0)
  return outputs
}

export default defineNode({ definition, executor })
