import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import type { NamedRng } from 'bellowsjs'
import { defineNodeState } from '@/engine/nodeState'
import { getTheory, getScale } from '@/services/audio/bellowsTheory'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Option values are the EXACT bellows `SCALES` keys (same curated 14-scale list as
// scale-quantize) — `new Scale(root, name)` throws on an unknown name, so getScale guards it.
const SCALE_NAMES = [
  'major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  'harmonic minor', 'melodic minor', 'blues',
  'major pentatonic', 'minor pentatonic', 'whole tone', 'chromatic',
]

const definition: NodeDefinition = {
  id: 'melody-walk',
  name: 'Melody Walk',
  version: '1.0.0',
  category: 'timing',
  description: 'Clock-driven random walk over scale degrees — a tonal, stepwise melody generator (bellowsjs)',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'clock', type: 'trigger', label: 'Clock' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'degree', type: 'number', label: 'Degree' },
  ],
  controls: [
    { id: 'root', type: 'select', label: 'Root', default: 'C', props: { options: ROOTS } },
    { id: 'scaleName', type: 'select', label: 'Scale', default: 'major', props: { options: SCALE_NAMES } },
    { id: 'octaveRange', type: 'number', label: 'Octave Range', default: 2, props: { min: 1, max: 3, step: 1 } },
    { id: 'leapChance', type: 'number', label: 'Leap Chance', default: 0.25, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'repeatPenalty', type: 'number', label: 'Repeat Penalty', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'gravity', type: 'number', label: 'Gravity', default: 0.3, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'velocity', type: 'number', label: 'Velocity', default: 100, props: { min: 0, max: 127, step: 1 } },
    { id: 'seed', type: 'number', label: 'Seed', default: 0, props: { min: 0, max: 9999, step: 1 } },
  ],
  info: {
    overview:
      'Generates a melody by taking one stepwise step per clock trigger — a random walk that stays in key and favours small moves, so the line sounds musical rather than jittery. Unlike a plain Random node, motion is tonal and gravitational: Gravity pulls the walk toward the chord tones (root/3rd/5th) so phrases keep resolving home, while Leap Chance lets it occasionally jump. Wire a metronome or step-sequencer into Clock, then Note/Trigger/Velocity into the Bellows Instrument or any synth. The walk is deterministic per Seed, so a flow replays the same melody every time.',
    tips: [
      'Clock it from a metronome; each edge takes one step of the walk.',
      'Raise Gravity for melodies that keep resolving to chord tones; lower it for wandering lines.',
      'Leap Chance adds occasional jumps; Repeat Penalty discourages sitting on one note.',
      'Reset restarts the exact same walk (per Seed) — great for looped phrases.',
    ],
    pairsWith: ['metronome', 'step-sequencer', 'scale-quantize', 'bellows-instrument', 'synth'],
  },
  tags: ['melody', 'walk', 'random walk', 'generative', 'sequencer', 'note', 'stream', 'tonal', 'markov'],
}

interface MelodyWalkState {
  matrix: number[][]
  rng: NamedRng | null
  states: number[]
  gravitySet: Set<number>
  pos: number
  note: number
  degree: number
  sig: string
}

// matrix / rng / states are pure JS (no external resources) — dispose is a plain drop.
const walkState = defineNodeState<MelodyWalkState>({ label: 'bellows-melodywalk' })

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const root = (ctx.controls.get('root') as string) ?? 'C'
  const scaleName = (ctx.controls.get('scaleName') as string) ?? 'major'
  const octaveRange = clamp(Math.round((ctx.controls.get('octaveRange') as number) ?? 2), 1, 3)
  const leapChance = (ctx.controls.get('leapChance') as number) ?? 0.25
  const repeatPenalty = (ctx.controls.get('repeatPenalty') as number) ?? 0.5
  const gravity = (ctx.controls.get('gravity') as number) ?? 0.3
  const velCtrl = clamp((ctx.controls.get('velocity') as number) ?? 100, 0, 127)
  const seed = (ctx.controls.get('seed') as number) ?? 0

  const clockEdge = ctx.trig('clock')
  const resetEdge = ctx.trig('reset')

  const state = walkState.getOrCreate(ctx.nodeId, () => ({
    matrix: [], rng: null, states: [], gravitySet: new Set<number>(), pos: 0, note: 60, degree: 0, sig: '',
  }))

  const outputs = new Map<string, unknown>()
  const theory = getTheory()

  if (!theory) {
    // Theory module still loading — hold a stable note and still pulse on the clock.
    outputs.set('note', state.note)
    outputs.set('trigger', clockEdge ? 1 : 0)
    outputs.set('velocity', velCtrl)
    outputs.set('degree', state.degree)
    return outputs
  }

  const scale = getScale(theory, root, scaleName) // guards unknown name → falls back to major
  const N = scale.length * octaveRange
  const states = state.states.length === N ? state.states : [...Array(N).keys()]

  // Rebuild the transition matrix + rng whenever any generative parameter changes (or on first
  // run). The rng is seeded per-node so the walk is deterministic and replays identically.
  const sig = `${root}|${scaleName}|${octaveRange}|${leapChance}|${repeatPenalty}|${seed}`
  const rebuild = () => {
    state.rng = theory.rng(`${ctx.nodeId}:${seed}`)
    state.matrix = theory.buildStepwiseMatrix(states, state.rng, { leapChance, repeatPenalty })
    state.gravitySet = new Set(states.filter((i) => [0, 2, 4].includes(i % scale.length)))
    state.states = states
    state.pos = 0
    state.note = clamp(scale.degreeToMidi(0, 4), 0, 127)
    state.degree = 0
  }
  if (state.sig !== sig) {
    rebuild()
    state.sig = sig
  }

  // Reset wins over a coincident clock edge: recreate the rng with the SAME label (identical
  // draws) and rebuild the matrix, then restart at position 0 for a deterministic replay.
  if (resetEdge) {
    rebuild()
  } else if (clockEdge && state.rng) {
    const gravityGain = 1 + gravity * 3
    const next = theory.weightedWalk(state.matrix, state.pos, state.rng, state.gravitySet, gravityGain)
    state.pos = clamp(next, 0, N - 1)
    state.degree = state.pos % scale.length
    state.note = clamp(scale.degreeToMidi(state.pos, 4), 0, 127)
  }

  outputs.set('note', state.note)
  outputs.set('trigger', clockEdge ? 1 : 0)
  outputs.set('velocity', velCtrl)
  outputs.set('degree', state.degree)
  return outputs
}

export default defineNode({ definition, executor })
