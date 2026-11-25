import { markRaw } from 'vue'
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { configureVoice, queueNote, setMonoGate, routeChannel, getVoice } from '../bellows-instrument/bellowsManager'
import type { VoiceConfig } from '../bellows-instrument/engineParams'
import SynthNode from './SynthNode.vue'

/**
 * The simple, friendly synth: one Instrument menu and a few knobs, played by bellows underneath.
 * "Shaped" sounds are built on a bellows engine and follow the envelope and filter knobs; the rest
 * are bellows presets (real modelled instruments) where only Volume applies. For the full engine
 * surface use Bellows Instrument.
 */
export interface SynthSound { value: string; label: string; preset?: string; knobs: string[] }

const ADSR = ['volume', 'attack', 'decay', 'sustain', 'release']

export const SYNTH_SOUNDS: SynthSound[] = [
  { value: 'sine', label: 'Sine', knobs: ADSR },
  { value: 'moog', label: 'Moog Bass', knobs: [...ADSR, 'cutoff', 'resonance', 'filterEnv'] },
  { value: 'pad', label: 'Warm Pad', knobs: [...ADSR, 'cutoff', 'detune'] },
  { value: 'pluck', label: 'Pluck', knobs: ['volume', 'brightness', 'damping'] },
  { value: 'piano', label: 'Electric Piano', preset: 'dx-epiano', knobs: ['volume'] },
  { value: 'organ', label: 'Organ', preset: 'drawbar-organ', knobs: ['volume'] },
  { value: 'guitar', label: 'Nylon Guitar', preset: 'nylon-guitar', knobs: ['volume'] },
  { value: 'harp', label: 'Harp', preset: 'harp', knobs: ['volume'] },
  { value: 'strings', label: 'Cello', preset: 'cello', knobs: ['volume'] },
  { value: 'flute', label: 'Flute', preset: 'concert-flute', knobs: ['volume'] },
  { value: 'brass', label: 'Brass', preset: 'brass-section', knobs: ['volume'] },
  { value: 'marimba', label: 'Marimba', preset: 'marimba', knobs: ['volume'] },
  { value: 'kalimba', label: 'Kalimba', preset: 'kalimba', knobs: ['volume'] },
  { value: 'bell', label: 'FM Bell', preset: 'fm-bell-lead', knobs: ['volume'] },
  { value: 'choir', label: 'Choir', preset: 'choir-aah', knobs: ['volume'] },
  { value: 'lead', label: 'Analog Lead', preset: 'analog-lead', knobs: ['volume'] },
  { value: 'acid', label: 'Acid Bass', preset: 'acid-bass', knobs: ['volume'] },
  { value: 'motion', label: 'Motion Pad', preset: 'motion-pad', knobs: ['volume'] },
]

const SOUND_BY_VALUE = new Map(SYNTH_SOUNDS.map((s) => [s.value, s]))

const definition: NodeDefinition = {
  id: 'synth',
  component: markRaw(SynthNode),
  name: 'Synth',
  version: '2.0.0',
  category: 'audio',
  description: 'Easy synthesizer: pick an instrument and play it with notes (bellows engine)',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    {
      id: 'instrument', type: 'select', label: 'Instrument', default: 'sine',
      props: { options: SYNTH_SOUNDS.map((s) => ({ value: s.value, label: s.label })) },
    },
    { id: 'volume', type: 'number', label: 'Volume', default: -6, props: { min: -60, max: 6, step: 1 } },
    { id: 'attack', type: 'number', label: 'Attack', default: 0.01, props: { min: 0.001, max: 4, step: 0.001 } },
    { id: 'decay', type: 'number', label: 'Decay', default: 0.2, props: { min: 0.001, max: 4, step: 0.001 } },
    { id: 'sustain', type: 'number', label: 'Sustain', default: 0.7, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'release', type: 'number', label: 'Release', default: 0.4, props: { min: 0.001, max: 8, step: 0.001 } },
    { id: 'cutoff', type: 'number', label: 'Cutoff', default: 2000, props: { min: 20, max: 20000, step: 1 } },
    { id: 'resonance', type: 'number', label: 'Resonance', default: 1, props: { min: 0.1, max: 30, step: 0.1 } },
    { id: 'filterEnv', type: 'number', label: 'Filter Env', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'brightness', type: 'number', label: 'Brightness', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'damping', type: 'number', label: 'Damping', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'detune', type: 'number', label: 'Detune', default: 10, props: { min: 0, max: 50, step: 1 } },
  ],
  info: {
    overview:
      'The easy synthesizer. Pick an instrument and play it from a Keyboard, MIDI, a sequencer or any note source: Gate holds a note while high, Trigger plays a short one. Sine, Moog Bass, Warm Pad and Pluck follow the envelope and filter knobs; the rest (electric piano, organ, guitar, harp, cello, flute, brass, mallets, bell, choir, leads) are modelled bellows instruments that sound right as they are. Wire Audio to an Audio Output to hear it. For every engine and parameter, use Bellows Instrument.',
    tips: [
      'Changing notes while the gate stays high glides the voice to the new note, so legato playing never leaves a note hanging.',
      'Moog Bass: lower Cutoff and raise Resonance and Filter Env for acid squelch.',
      'Add Bellows Reverb between Synth and Audio Output for space.',
    ],
    pairsWith: ['keyboard', 'midi-input', 'step-sequencer', 'audio-output', 'bellows-reverb', 'bellows-instrument'],
  },
  tags: ['synth', 'instrument', 'keyboard', 'bellows', 'piano', 'bass', 'pad'],
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** Control map → bellows voice config. Pure (tested). */
export function synthVoiceConfig(controls: Map<string, unknown>): VoiceConfig {
  const n = (id: string, d: number) => {
    const v = controls.get(id)
    return typeof v === 'number' && Number.isFinite(v) ? v : d
  }
  const sound = SOUND_BY_VALUE.get(String(controls.get('instrument') ?? 'sine')) ?? SYNTH_SOUNDS[0]
  // -6 dB (the old default) lands near bellows' usual 0.8 level.
  const gain = clamp(1.6 * Math.pow(10, n('volume', -6) / 20), 0, 2)
  const base = { insertFx: null, fxParams: {}, send: 0, gain, pan: 0 }
  if (sound.preset) return { ...base, preset: sound.preset, engine: 'va', params: {} }

  const env = {
    attack: clamp(n('attack', 0.01), 0.001, 10),
    decay: clamp(n('decay', 0.2), 0.001, 10),
    sustain: clamp(n('sustain', 0.7), 0, 1),
    release: clamp(n('release', 0.4), 0.001, 10),
  }
  const cutoff = clamp(n('cutoff', 2000), 20, 20000)
  // The old knob was a filter Q (0.1–30); bellows wants 0–1.
  const resonance = clamp(n('resonance', 1) / 12, 0, 0.95)
  switch (sound.value) {
    case 'moog':
      return { ...base, preset: '', engine: 'va', params: {
        shape: 0, detune: 4, sub: 0.35, filterType: 0, cutoff: Math.min(cutoff, 8000), resonance,
        envAmount: n('filterEnv', 0.5) * 4, fAttack: 0.002, fDecay: Math.max(0.05, env.decay), fSustain: 0.2, fRelease: env.release,
        ...env, velFilter: 1,
      } }
    case 'pad':
      return { ...base, preset: '', engine: 'va', params: {
        shape: 0, detune: clamp(n('detune', 10) * 2, 0, 100), sub: 0.15, filterType: 1, cutoff, resonance: 0.1,
        envAmount: 0.6, fAttack: Math.max(0.2, env.attack), fDecay: 1, fSustain: 0.6, fRelease: env.release,
        drift: 0.4, ...env,
      } }
    case 'pluck':
      return { ...base, preset: '', engine: 'pluck', params: {
        damp: clamp(1 - n('brightness', 0.5), 0, 1), pickPos: 0.22, exciteType: 0,
        decay: clamp(0.4 + (1 - n('damping', 0.5)) * 5, 0.05, 20), level: 0.9,
      } }
    default: // sine
      return { ...base, preset: '', engine: 'va', params: {
        shape: 3, detune: 0, sub: 0, filterType: 1, cutoff: 16000, resonance: 0, envAmount: 0, ...env, velLevel: 0.6,
      } }
  }
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  configureVoice(ctx.nodeId, synthVoiceConfig(ctx.controls))

  const note = ctx.num('note', 60)
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp(velRaw > 1 ? velRaw / 127 : velRaw, 0, 1)

  if (ctx.trig('trigger')) queueNote(ctx.nodeId, note, vel)
  // Level-based gate in the shared manager: holds exactly one note id, follows note changes while
  // held, and always releases the note it is actually holding.
  setMonoGate(ctx.nodeId, ctx.level('gate'), note, vel)

  const audio = routeChannel(ctx.nodeId, getVoice(ctx.nodeId)?.instrument ?? null, wired)
  return new Map<string, unknown>([['audio', audio]])
}

export default defineNode({ definition, executor })
