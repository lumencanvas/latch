import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { configureSinger, performLine, stopLine, readSinger, routeSinger } from '../bellows-singer/singerManager'
import { MOUTH_OUTPUTS, voiceControls, mixControls, resolveSingerConfig, writeVoiceOutputs } from '../bellows-singer/voiceNodeShared'

/** bellows-voice BEAT_PRESETS (data; transcribed so the registry needs no bellows-voice import). */
export const BEAT_PATTERNS: { id: string; name: string; bpm: number; swing: number; text: string }[] = [
  { id: 'boots-and-cats', name: 'Boots and cats', bpm: 96, swing: 0, text: 'B . t . | Pf . t . | B . t . | Pf . t .' },
  { id: 'four-on-the-floor', name: 'Four on the floor', bpm: 122, swing: 0, text: 'B . t . | B . tss . | B . t . | B . tss .' },
  { id: 'breakbeat', name: 'Breakbeat', bpm: 94, swing: 0.18, text: 'B . t . | Pf . t B | . B t . | Pf . t t' },
  { id: 'rimshot-shuffle', name: 'Rimshot shuffle', bpm: 88, swing: 0.4, text: 'B . t K | . t B . | t . K t | . B K t' },
  { id: 'inward-snare', name: 'Inward snare', bpm: 100, swing: 0, text: 'B . t . | ^K . t . | B B t . | ^K . t .' },
  { id: 'clicks-and-pops', name: 'Clicks and pops', bpm: 90, swing: 0.25, text: 'B . ! . | P! . ! . | B ! . ! | P! . ! !' },
  { id: 'hum-bass', name: 'Hum bass', bpm: 92, swing: 0.1, text: 'B m . m:43 | Pf . m:45 . | B m:40 . m | Pf . t kch' },
  { id: 'psh-groove', name: 'Psh groove', bpm: 98, swing: 0.12, text: 'B . ch . | Psh . ch B | . B ch . | Psh . ch tss' },
]

const DEFAULT_VOICE = 'beatboxer'

const definition: NodeDefinition = {
  id: 'bellows-beatbox',
  name: 'Bellows Beatbox',
  version: '1.0.0',
  category: 'audio',
  description: 'A human beatboxer from a physical model of the mouth: kicks, snares, hats, clicks and hummed bass from a step pattern',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'trigger', type: 'trigger', label: 'Play' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
    { id: 'pattern', type: 'string', label: 'Pattern' },
    { id: 'bpm', type: 'number', label: 'BPM' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'busy', type: 'boolean', label: 'Playing' },
    { id: 'done', type: 'trigger', label: 'Done' },
    ...MOUTH_OUTPUTS,
  ],
  controls: [
    {
      id: 'preset', type: 'select', label: 'Pattern', default: 'boots-and-cats',
      props: { options: [...BEAT_PATTERNS.map((p) => ({ value: p.id, label: p.name })), { value: '', label: 'Custom (type it below)' }] },
    },
    {
      id: 'pattern', type: 'text', label: 'Custom Pattern', default: 'B . t . | Pf . t .', when: { preset: '' },
      description: 'One step per sixteenth. B kick, t hat, tss open hat, Pf snare, K rimshot, ^K inward snare, ! click, P! lip pop, kch crash, ch closed hat, Psh snare, m hum (m:43 hums MIDI 43), . rest, | bar, > accent.',
      props: { placeholder: 'B . t . | Pf . t .' },
    },
    { id: 'bpm', type: 'number', label: 'BPM (0 = pattern’s own)', default: 0, props: { min: 0, max: 220, step: 1 } },
    { id: 'swing', type: 'number', label: 'Swing', default: -1, description: '-1 uses the pattern’s own swing.', props: { min: -1, max: 0.75, step: 0.01 } },
    { id: 'repeat', type: 'number', label: 'Repeats per Play', default: 1, props: { min: 1, max: 16, step: 1 } },
    { id: 'loop', type: 'toggle', label: 'Loop', default: false, description: 'Start again each time the pattern finishes.' },
    { id: 'vel', type: 'number', label: 'Intensity', default: 0.8, props: { min: 0, max: 1, step: 0.01 } },
    ...voiceControls(DEFAULT_VOICE).filter((c) => c.id !== 'dictionary'),
    ...mixControls(),
  ],
  info: {
    overview:
      'Beatboxing from the same articulatory voice that sings: an ejective kick (the larynx rising like a piston behind closed lips), pulmonic hats and snares, an inward snare drawn in through the mouth, tongue clicks, lip pops and a hummed bass line. Pick one of eight grooves or type your own step pattern, and pulse Play. The mouth outputs show the lips and jaw making every sound.',
    tips: [
      'Turn on Loop for a continuous groove, or drive Play from a Metronome’s bar output to start it on the beat.',
      'In a custom pattern, m:43 hums MIDI note 43, so a bass line rides along with the drums.',
      'Any voice can beatbox; the beatboxer voice has a close microphone that hears the air of each kick.',
    ],
    pairsWith: ['metronome', 'bellows-reverb', 'bellows-dynamics', 'audio-output'],
  },
  tags: ['bellows', 'beatbox', 'drums', 'voice', 'vocal', 'percussion', 'rhythm'],
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  const cfg = resolveSingerConfig(ctx.controls, DEFAULT_VOICE)
  cfg.dictionary = false
  if (wired) cfg.send = 0
  configureSinger(ctx.nodeId, cfg)

  const presetId = ctx.str('preset', 'boots-and-cats')
  const preset = BEAT_PATTERNS.find((p) => p.id === presetId)
  const wiredPattern = ctx.inputs.get('pattern')
  const pattern = (typeof wiredPattern === 'string' && wiredPattern.trim()) || (preset ? preset.text : ctx.str('pattern', '').trim())
  const bpmSet = ctx.num('bpm', 0)
  const swingSet = ctx.num('swing', -1)
  const line = {
    kind: 'beat' as const,
    pattern,
    bpm: bpmSet > 0 ? Math.min(220, Math.max(30, bpmSet)) : preset?.bpm ?? 96,
    swing: swingSet >= 0 ? Math.min(0.75, swingSet) : preset?.swing ?? 0,
    repeat: Math.max(1, Math.min(16, Math.round(ctx.num('repeat', 1)))),
    vel: Math.max(0, Math.min(1, ctx.num('vel', 0.8))),
  }

  if (ctx.trig('stop')) stopLine(ctx.nodeId, cfg)
  const r = readSinger(ctx.nodeId)
  if (pattern && (ctx.trig('trigger') || (r.done && ctx.bool('loop', false)))) performLine(ctx.nodeId, line)

  const out = new Map<string, unknown>()
  writeVoiceOutputs(out, r)
  out.delete('ipa')
  out.set('audio', routeSinger(ctx.nodeId, wired))
  return out
}

export default defineNode({ definition, executor })
