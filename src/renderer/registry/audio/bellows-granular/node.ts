import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import {
  configureGranular,
  granularTrigger,
  granularGate,
  granularRoute,
  granularError,
  granularSourceState,
} from './granularManager'

/** bellowsjs `granular` engine params (listEngines(); drift-checked in bellows-granular tests). */
export const GRANULAR_PARAMS = [
  { name: 'grainSize', label: 'Grain Size (ms)', min: 10, max: 500, default: 80, step: 1 },
  { name: 'density', label: 'Density (grains/s)', min: 0.5, max: 400, default: 20, step: 0.1 },
  { name: 'position', label: 'Position (0 → 1 through the file)', min: 0, max: 1, default: 0.25, step: 0.001 },
  { name: 'spray', label: 'Spray (position scatter)', min: 0, max: 1, default: 0.05, step: 0.001 },
  { name: 'pitch', label: 'Pitch (× speed)', min: 0.25, max: 4, default: 1, step: 0.01 },
  { name: 'pitchJitter', label: 'Pitch Jitter (semitones)', min: 0, max: 12, default: 0, step: 0.01 },
  { name: 'spread', label: 'Stereo Spread', min: 0, max: 1, default: 0.5, step: 0.01 },
  { name: 'reverse', label: 'Reverse Grains', min: 0, max: 1, default: 0, step: 0.01 },
  { name: 'baseNote', label: 'Root Note (plays the file at its own pitch)', min: 24, max: 96, default: 69, step: 1 },
  { name: 'level', label: 'Grain Level', min: 0, max: 1, default: 0.9, step: 0.01 },
] as const

/** Params that can be wired (same id as the control). */
const MOD_PARAMS = ['position', 'grainSize', 'density', 'pitch', 'spray']

const definition: NodeDefinition = {
  id: 'bellows-granular',
  name: 'Bellows Granular',
  version: '1.0.0',
  category: 'audio',
  description: 'Granular synthesis from any audio file: freeze, stretch, scatter and re-pitch a sound into clouds of tiny grains',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'notes', type: 'array', label: 'Notes (chord)' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
    { id: 'url', type: 'string', label: 'Audio URL' },
    ...MOD_PARAMS.map((p) => ({ id: p, type: 'number' as const, label: GRANULAR_PARAMS.find((x) => x.name === p)!.label.split(' (')[0] })),
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'seconds', type: 'number', label: 'File Length (s)' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'file', type: 'asset-picker', label: 'Audio File', default: null, props: { assetType: 'audio' } },
    { id: 'url', type: 'text', label: 'or URL', default: '', props: { placeholder: 'https://…/sound.wav' } },
    ...GRANULAR_PARAMS.map((p) => ({
      id: p.name, type: 'number' as const, label: p.label, default: p.default, props: { min: p.min, max: p.max, step: p.step },
    })),
    { id: 'length', type: 'number', label: 'Trigger Note Length (s)', default: 1, props: { min: 0.05, max: 30, step: 0.01 } },
    { id: 'sendLevel', type: 'number', label: 'Reverb Send', default: 0, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'gain', type: 'number', label: 'Level', default: 0.8, props: { min: 0, max: 2, step: 0.01 } },
    { id: 'pan', type: 'number', label: 'Pan (L ← → R)', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ],
  info: {
    overview:
      'Granular synthesis plays a sound as thousands of tiny overlapping grains read from anywhere in an audio file. Hold a note (Gate) and the file becomes an instrument: Position chooses where in the file the grains come from (sweep it to scrub or stretch time, hold it still to freeze a moment), Grain Size and Density set the texture from smooth pads to stuttering clouds, Spray scatters the read position, and Pitch or the played note re-pitches it without changing speed.',
    tips: [
      'Wire a slow LFO into Position to drift through the file; a Slider gives you a hand-held scrub.',
      'Large grains with high density sound smooth; tiny grains with low density sound like rain.',
      'Root Note is the key that plays the file at its own pitch (69 = A4); other keys transpose it.',
      'Files longer than a minute are trimmed to their first 60 seconds.',
    ],
    pairsWith: ['lfo', 'keyboard', 'midi-input', 'bellows-reverb', 'bellows-filter', 'audio-output'],
  },
  tags: ['bellows', 'granular', 'grains', 'sampler', 'texture', 'ambient', 'freeze', 'time stretch', 'audio'],
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  const asset = ctx.controls.get('file')
  const source = ctx.str('url', '').trim() || (typeof asset === 'string' ? asset : '')
  const params: Record<string, number> = {}
  for (const p of GRANULAR_PARAMS) params[p.name] = Math.min(p.max, Math.max(p.min, ctx.num(p.name, p.default)))
  params.baseNote = Math.round(params.baseNote)
  configureGranular(ctx.nodeId, {
    source,
    params,
    gain: Math.max(0, Math.min(2, ctx.num('gain', 0.8))),
    pan: Math.max(-1, Math.min(1, ctx.num('pan', 0))),
    send: wired ? 0 : clamp01(ctx.num('sendLevel', 0)),
  })

  const chord = ctx.inputs.get('notes')
  const notes = Array.isArray(chord) && chord.length > 0
    ? chord.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 127)
    : [Math.max(0, Math.min(127, Math.round(ctx.num('note', params.baseNote))))]
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp01(velRaw > 1 ? velRaw / 127 : velRaw)
  if (ctx.trig('trigger')) granularTrigger(ctx.nodeId, notes, vel, Math.max(0.05, ctx.num('length', 1)))
  granularGate(ctx.nodeId, ctx.level('gate'), notes, vel)

  const st = source ? granularSourceState(source) : { loading: false, seconds: 0, error: null }
  return new Map<string, unknown>([
    ['audio', granularRoute(ctx.nodeId, wired)],
    ['seconds', st.seconds],
    ['loading', st.loading],
    ['error', granularError(ctx.nodeId) ?? st.error ?? ''],
  ])
}

export default defineNode({ definition, executor })
