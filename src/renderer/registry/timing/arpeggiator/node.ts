import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import type { Arpeggiator, ArpMode, NamedRng } from 'bellowsjs'
import { defineNodeState } from '@/engine/nodeState'
import { getTheory, getScale } from '@/services/audio/bellowsTheory'

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SCALE_NAMES = [
  'major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  'harmonic minor', 'melodic minor', 'blues',
  'major pentatonic', 'minor pentatonic', 'whole tone', 'chromatic',
]
const MODES: ArpMode[] = ['up', 'down', 'updown', 'downup', 'random', 'order']

const definition: NodeDefinition = {
  id: 'arpeggiator',
  name: 'Arpeggiator',
  version: '1.0.0',
  category: 'timing',
  description: 'Clock-driven arpeggiator — emits a note stream over a chord/scale (bellowsjs)',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'clock', type: 'trigger', label: 'Clock' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
    { id: 'notes', type: 'data', label: 'Notes' },
  ],
  outputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'notes', type: 'data', label: 'Pool' },
  ],
  controls: [
    { id: 'mode', type: 'select', label: 'Mode', default: 'up', props: { options: MODES } },
    { id: 'octaves', type: 'number', label: 'Octaves', default: 1, props: { min: 1, max: 4, step: 1 } },
    { id: 'velocity', type: 'number', label: 'Velocity', default: 100, props: { min: 0, max: 127, step: 1 } },
    { id: 'root', type: 'select', label: 'Root', default: 'C', props: { options: ROOTS } },
    { id: 'scaleName', type: 'select', label: 'Scale', default: 'major', props: { options: SCALE_NAMES } },
    { id: 'seed', type: 'number', label: 'Seed', default: 0, props: { min: 0, max: 9999, step: 1 } },
  ],
  info: {
    overview:
      'Advances through a note pool on every clock trigger and emits one note at a time — the classic arpeggiator note stream. Wire a metronome or step-sequencer into Clock, then Note/Trigger/Velocity into the Bellows Instrument or any synth. Feed a chord array into Notes to arpeggiate it; leave it unconnected to arpeggiate the root triad of the chosen key. Random mode is deterministic per Seed, so a flow replays identically.',
    tips: [
      'Clock it from a metronome beat; up/down/updown/random set the pattern shape.',
      'Wire a Chord node into Notes to arpeggiate real harmony; otherwise it uses the root triad.',
      'Reset returns to the start of the cycle (and re-seeds random mode) for tight loops.',
    ],
    pairsWith: ['metronome', 'step-sequencer', 'chord', 'bellows-instrument', 'synth'],
  },
  tags: ['arpeggiator', 'arp', 'sequencer', 'generative', 'note', 'stream', 'melody'],
}

interface ArpState {
  arp: Arpeggiator | null
  rng: NamedRng | null
  poolKey: string
  mode: string
  octaves: number
  seed: number
  note: number
  pool: number[]
}

// Arpeggiator + rng are pure JS objects (no external resources) — dispose is a plain drop.
const arpState = defineNodeState<ArpState>({ label: 'bellows-arp' })

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const mode = (ctx.controls.get('mode') as string) ?? 'up'
  const octaves = clamp(Math.round((ctx.controls.get('octaves') as number) ?? 1), 1, 4)
  const velCtrl = clamp((ctx.controls.get('velocity') as number) ?? 100, 0, 127)
  const root = (ctx.controls.get('root') as string) ?? 'C'
  const scaleName = (ctx.controls.get('scaleName') as string) ?? 'major'
  const seed = (ctx.controls.get('seed') as number) ?? 0

  const clockEdge = ctx.trig('clock')
  const resetEdge = ctx.trig('reset')
  const notesInput = ctx.inputs.get('notes')

  const state = arpState.getOrCreate(ctx.nodeId, () => ({
    arp: null, rng: null, poolKey: '', mode: '', octaves: 0, seed: NaN, note: 60, pool: [],
  }))

  const outputs = new Map<string, unknown>()
  const theory = getTheory()

  if (!theory) {
    // Theory module still loading — hold a stable note and still pulse on the clock.
    outputs.set('note', state.note)
    outputs.set('trigger', clockEdge ? 1 : 0)
    outputs.set('velocity', velCtrl)
    outputs.set('notes', state.pool)
    return outputs
  }

  // Resolve the note pool: an explicit MIDI array input, else the root triad of the key.
  let pool: number[]
  if (Array.isArray(notesInput) && notesInput.length > 0) {
    pool = (notesInput as unknown[])
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      .map((n) => Math.round(n))
  } else {
    const scale = getScale(theory, root, scaleName)
    pool = [0, 2, 4].map((d) => scale.degreeToMidi(d, 4))
  }
  const poolKey = pool.join(',')

  // (Re)build the Arpeggiator when mode/octaves change; setNotes keeps position on a live
  // pool change (per the bellows contract) so a chord swap doesn't restart the pattern.
  if (!state.arp || state.mode !== mode || state.octaves !== octaves) {
    state.arp = new theory.Arpeggiator({ mode: mode as ArpMode, octaves })
    state.arp.setNotes(pool)
    state.poolKey = poolKey
    state.mode = mode
    state.octaves = octaves
  } else if (state.poolKey !== poolKey) {
    state.arp.setNotes(pool)
    state.poolKey = poolKey
  }
  state.pool = pool

  // Seeded rng for deterministic 'random' mode; re-create when the seed changes.
  if (!state.rng || state.seed !== seed) {
    state.rng = theory.rng(`${ctx.nodeId}:${seed}`)
    state.seed = seed
  }

  // Reset wins over a coincident clock edge (matches step-sequencer); re-seed so a random
  // pattern reproduces from the top.
  if (resetEdge) {
    state.arp.reset()
    state.rng = theory.rng(`${ctx.nodeId}:${seed}`)
  } else if (clockEdge && pool.length > 0) {
    state.note = state.arp.next(mode === 'random' ? state.rng : undefined)
  }

  outputs.set('note', state.note)
  outputs.set('trigger', clockEdge ? 1 : 0)
  outputs.set('velocity', velCtrl)
  outputs.set('notes', pool)
  return outputs
}

export default defineNode({ definition, executor })
