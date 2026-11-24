import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import {
  configureVoice,
  queueNote,
  setPolyGate,
  routeChannel,
  getVoice,
} from '@/registry/audio/bellows-instrument/bellowsManager'
import { resolveVoiceConfig, buildVoiceControls } from '@/registry/audio/bellows-instrument/engineParams'

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
  // Like bellows-instrument: heard only through its Audio out (see bellowsManager routeChannel).
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: buildVoiceControls('additive'),
  info: {
    overview:
      'The polyphonic counterpart to the Bellows Instrument: it takes a Notes array (a chord) and plays every note at once on one bellowsjs voice, so harmony from a Chord or Progression node actually sounds as a chord. Pick a preset or a manual engine, just like Bellows Instrument. Trigger fires the whole chord as a one-shot; Gate sustains it until Gate goes low. Wire Chord.notes or Progression.notes into Notes and a clock into Trigger (or a held Gate).',
    tips: [
      'Feed Chord or Progression’s Notes output straight in — no arpeggiator needed to hear a chord.',
      'Trigger plays the chord as a one-shot; hold Gate high to sustain it.',
      'Pick a polyphonic engine (additive, va, fm, modal…) so all voices ring together.',
    ],
    pairsWith: ['chord', 'progression', 'metronome', 'bellows-instrument', 'scale-quantize'],
  },
  tags: ['poly', 'chord', 'polyphony', 'bellows', 'harmony', 'voice'],
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function readNotes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    .map((n) => Math.max(0, Math.min(127, Math.round(n))))
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  const cfg = resolveVoiceConfig(ctx.controls)
  configureVoice(ctx.nodeId, { ...cfg, send: 0 }) // wired: sound only down the wire

  const notes = readNotes(ctx.inputs.get('notes'))
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp01(velRaw > 1 ? velRaw / 127 : velRaw)

  // Trigger fires the whole chord as one-shots (boot-safe — queued while booting, then replayed).
  if (ctx.trig('trigger')) {
    for (const n of notes) queueNote(ctx.nodeId, n, vel)
  }

  // Gate is LEVEL-based (self-heals through the boot window): manager holds the chord's ids.
  setPolyGate(ctx.nodeId, ctx.level('gate'), notes, vel)

  const audio = routeChannel(ctx.nodeId, getVoice(ctx.nodeId)?.instrument ?? null, wired)
  return new Map<string, unknown>([['audio', audio]])
}

export default defineNode({ definition, executor })
