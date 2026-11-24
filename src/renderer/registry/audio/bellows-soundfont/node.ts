import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import {
  configureSoundfont,
  sfTrigger,
  sfGate,
  sfRoute,
  sfStatus,
  fontPresets,
  fontLoading,
  type SoundfontConfig,
} from './soundfontManager'

const definition: NodeDefinition = {
  id: 'bellows-soundfont',
  name: 'Bellows SoundFont',
  version: '1.0.0',
  category: 'audio',
  description: 'Plays any SoundFont (.sf2) instrument: pianos, orchestras, General MIDI sets, drum kits',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'notes', type: 'array', label: 'Notes (chord)' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
    { id: 'preset', type: 'number', label: 'Preset #' },
    { id: 'url', type: 'string', label: 'SoundFont URL' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'presetName', type: 'string', label: 'Preset Name' },
    { id: 'presets', type: 'array', label: 'All Presets' },
    { id: 'presetCount', type: 'number', label: 'Preset Count' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'font', type: 'asset-picker', label: 'SoundFont (.sf2)', default: null, props: { assetType: 'all' } },
    { id: 'url', type: 'text', label: 'or URL', default: '', props: { placeholder: 'https://…/font.sf2' } },
    { id: 'preset', type: 'number', label: 'Preset #', default: 0, description: 'Which instrument in the font, in bank / program order. The Preset Name output shows what you picked.', props: { min: 0, max: 1023, step: 1 } },
    { id: 'attack', type: 'number', label: 'Attack (s)', default: 0.002, props: { min: 0, max: 10, step: 0.001 } },
    { id: 'release', type: 'number', label: 'Release (s)', default: 0.25, props: { min: 0, max: 10, step: 0.01 } },
    { id: 'sendLevel', type: 'number', label: 'Reverb Send', default: 0, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'gain', type: 'number', label: 'Level', default: 0.8, props: { min: 0, max: 2, step: 0.01 } },
    { id: 'pan', type: 'number', label: 'Pan (L ← → R)', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ],
  info: {
    overview:
      'Turns any SoundFont 2 file into a playable instrument. SoundFonts are free sample libraries (pianos, strings, guitars, full General MIDI sets, drum kits) in one .sf2 file. Upload one in the asset picker (or paste a URL), choose a Preset # (the Preset Name output tells you which instrument that is), and play it from Note + Trigger, hold notes with Gate, or send a whole chord to Notes. It plays straight to your speakers; wire Audio to take it through effects.',
    tips: [
      'Free, high-quality General MIDI fonts include GeneralUser GS and MuseScore General; in a GM font, Preset # 0 is the piano and the drum kits sit in bank 128 at the end of the list.',
      'Wire a Counter or Slider into Preset # to flip through instruments live; the All Presets output lists every name.',
      'A Chord or Progression node into Notes plus a Trigger plays the whole chord at once.',
      'Big fonts take a moment to load the first time; the Loading output is high meanwhile.',
    ],
    pairsWith: ['keyboard', 'midi-input', 'sequencer', 'progression', 'arpeggiator', 'bellows-reverb'],
  },
  tags: ['bellows', 'soundfont', 'sf2', 'sampler', 'instrument', 'general midi', 'gm', 'piano', 'audio'],
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  const asset = ctx.controls.get('font')
  const url = ctx.str('url', '').trim()
  const source = url || (typeof asset === 'string' ? asset : '')
  const cfg: SoundfontConfig = {
    source,
    preset: ctx.num('preset', 0),
    gain: Math.max(0, Math.min(2, ctx.num('gain', 0.8))),
    pan: Math.max(-1, Math.min(1, ctx.num('pan', 0))),
    send: wired ? 0 : clamp01(ctx.num('sendLevel', 0)),
    attack: Math.max(0, Math.min(10, ctx.num('attack', 0.002))),
    release: Math.max(0, Math.min(10, ctx.num('release', 0.25))),
  }
  configureSoundfont(ctx.nodeId, cfg)

  const chord = ctx.inputs.get('notes')
  const notes = Array.isArray(chord) && chord.length > 0
    ? chord.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 127)
    : [Math.max(0, Math.min(127, Math.round(ctx.num('note', 60))))]
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp01(velRaw > 1 ? velRaw / 127 : velRaw)
  if (ctx.trig('trigger')) sfTrigger(ctx.nodeId, notes, vel)
  sfGate(ctx.nodeId, ctx.level('gate'), notes, vel)

  const presets = source ? fontPresets(source) : []
  const st = sfStatus(ctx.nodeId)
  return new Map<string, unknown>([
    ['audio', sfRoute(ctx.nodeId, wired)],
    ['presetName', st.presetName],
    ['presets', presets.map((p, i) => `${i}: ${p.name} (${p.bank}:${p.program})`)],
    ['presetCount', presets.length],
    ['loading', source ? fontLoading(source) : false],
    ['error', st.error ?? ''],
  ])
}

export default defineNode({ definition, executor })
