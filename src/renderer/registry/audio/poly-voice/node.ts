import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { acquireVoice, getVoice, setVoiceEngine, queueNote } from '@/registry/audio/bellows-instrument/bellowsManager'

// Same bellowsjs synth engines as bellows-instrument.
const ENGINES = [
  'va', 'fm', 'additive', 'wavetable', 'pluck', 'string', 'tube', 'modal',
  'westcoast', 'formant', 'granular', 'harmonic', 'noise',
  'kick', 'snare', 'hat', 'clap', 'tom',
] as const

const definition: NodeDefinition = {
  id: 'poly-voice',
  name: 'Poly Voice',
  version: '1.0.0',
  category: 'audio',
  description: 'Plays a chord — a MIDI-note array — as simultaneous bellowsjs voices',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'notes', type: 'data', label: 'Notes' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  // Like bellows-instrument, the shared kernel routes to master — no wireable audio out.
  outputs: [],
  controls: [
    { id: 'engine', type: 'select', label: 'Engine', default: 'additive', props: { options: [...ENGINES] } },
    { id: 'gain', type: 'number', label: 'Gain', default: 0.8, props: { min: 0, max: 2, step: 0.01 } },
    { id: 'pan', type: 'number', label: 'Pan', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ],
  info: {
    overview:
      'The polyphonic counterpart to the Bellows Instrument: it takes a Notes array (a chord) and plays every note at once on one bellowsjs voice, so harmony from a Chord or Progression node actually sounds as a chord. Trigger fires the whole chord as a one-shot; Gate sustains it until Gate goes low. Wire Chord.notes or Progression.notes into Notes and a clock into Trigger (or a held Gate).',
    tips: [
      'Feed Chord or Progression’s Notes output straight in — no arpeggiator needed to hear a chord.',
      'Trigger plays the chord as a one-shot; hold Gate high to sustain it.',
      'Pick a polyphonic engine (additive, va, fm, modal…) so all voices ring together.',
    ],
    pairsWith: ['chord', 'progression', 'metronome', 'bellows-instrument', 'scale-quantize'],
  },
  tags: ['poly', 'chord', 'polyphony', 'bellows', 'harmony', 'voice'],
}

interface PolyState {
  heldIds: number[]
  prevGain: number
  prevPan: number
}

// Held-note ids per node; bellows voices are pure kernel channels released by the shared
// manager's gc (allOff) when the node is removed, so the store itself needs no dispose.
const polyState = defineNodeState<PolyState>({ label: 'bellows-poly' })

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function readNotes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    .map((n) => Math.max(0, Math.min(127, Math.round(n))))
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const engine = (ctx.controls.get('engine') as string) ?? 'additive'
  acquireVoice(ctx.nodeId, engine)
  setVoiceEngine(ctx.nodeId, engine)

  const notes = readNotes(ctx.inputs.get('notes'))
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp01(velRaw > 1 ? velRaw / 127 : velRaw)

  // Trigger: fire the whole chord as one-shots (boot-safe — queued if the kernel is
  // still booting, then replayed). Latched every frame so a hit during boot isn't lost.
  if (ctx.trig('trigger')) {
    for (const n of notes) queueNote(ctx.nodeId, n, vel)
  }

  const gateHigh = ctx.level('gate')
  const state = polyState.getOrCreate(ctx.nodeId, () => ({ heldIds: [], prevGain: NaN, prevPan: NaN }))
  const rec = getVoice(ctx.nodeId)

  if (rec?.instrument) {
    const inst = rec.instrument

    const gain = (ctx.controls.get('gain') as number) ?? 0.8
    const pan = (ctx.controls.get('pan') as number) ?? 0
    if (gain !== state.prevGain) { inst.gain(gain); state.prevGain = gain }
    if (pan !== state.prevPan) { inst.pan(pan); state.prevPan = pan }

    // Gate: LEVEL-based (self-heals through the boot window). Sustain the chord captured
    // when the gate rose; release every held voice when it drops.
    if (gateHigh && state.heldIds.length === 0 && notes.length > 0) {
      state.heldIds = notes.map((n) => inst.on(n, vel))
    } else if (!gateHigh && state.heldIds.length > 0) {
      for (const id of state.heldIds) inst.off(id)
      state.heldIds = []
    }
  }

  return new Map()
}

export default defineNode({ definition, executor })
