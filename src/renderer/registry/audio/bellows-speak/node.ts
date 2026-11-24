import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import {
  configureSinger,
  performLine,
  stopLine,
  readSinger,
} from '@/registry/audio/bellows-singer/singerManager'
import {
  MOUTH_OUTPUTS,
  LINE_OUTPUTS,
  voiceControls,
  mixControls,
  resolveSingerConfig,
  writeVoiceOutputs,
} from '@/registry/audio/bellows-singer/voiceNodeShared'

const DEFAULT_VOICE = 'narrator-female'
const BREATH_OPTIONS = [
  { value: 'between', label: 'Between phrases' },
  { value: 'all', label: 'Before every phrase' },
  { value: 'none', label: 'Never' },
]
const BREATHS = new Set(BREATH_OPTIONS.map((o) => o.value))

const definition: NodeDefinition = {
  id: 'bellows-speak',
  name: 'Bellows Speak',
  version: '1.0.0',
  category: 'audio',
  description: 'Speaks text in 31 English accents with a physical model of a human voice — fully offline, no TTS service (bellows-voice)',
  icon: 'message-square',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'trigger', type: 'trigger', label: 'Speak' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
  ],
  outputs: [...LINE_OUTPUTS, ...MOUTH_OUTPUTS],
  controls: [
    ...voiceControls(DEFAULT_VOICE),
    { id: 'text', type: 'text', label: 'Text', default: 'Hello from LATCH. Shall we make something?', props: { placeholder: 'Type something to say…' } },
    { id: 'rate', type: 'number', label: 'Speed', default: 1, props: { min: 0.5, max: 2, step: 0.05 } },
    { id: 'pitch', type: 'number', label: 'Pitch (Hz, 0 = voice default)', default: 0, props: { min: 0, max: 400, step: 1 } },
    { id: 'breath', type: 'select', label: 'Breaths', default: 'between', props: { options: BREATH_OPTIONS } },
    ...mixControls(),
  ],
  info: {
    overview:
      'Text-to-speech from a physical model of a voice — no cloud service, no samples, no network after load. The text is read in the chosen accent (General American, Scottish, Nigerian, Indian, Australian… 31 in all), with that accent’s vowels, rhythm and melody: statements fall, questions rise. Pulse Speak to say the Text (typed or wired from a string). The mouth outputs track the jaw, lips and tongue as you hear them, so a face, shader or particle system can lip-sync to the speech.',
    tips: [
      'Wire an LLM, a text node or a speech-recognition transcript into Text, and a trigger into Speak.',
      'End with “?” for a rising question; commas and full stops make phrases (and breaths).',
      'Numbers, times and money are read as words (“$5.50”, “10:30”).',
      'Speed scales the accent’s own speaking rate; Pitch overrides the voice’s natural speaking pitch.',
      'Done fires when it finishes speaking — use it to advance a script or open a mic.',
    ],
    pairsWith: ['bellows-singer', 'text-generation', 'speech-recognition', 'shader'],
  },
  tags: ['bellows', 'voice', 'speech', 'speak', 'tts', 'text-to-speech', 'accent', 'lip-sync', 'articulator'],
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const cfg = resolveSingerConfig(ctx.controls, DEFAULT_VOICE)
  configureSinger(ctx.nodeId, cfg)

  if (ctx.trig('stop')) stopLine(ctx.nodeId, cfg)
  if (ctx.trig('trigger')) {
    const text = ctx.str('text', '').trim()
    if (text) {
      const rate = Math.min(2, Math.max(0.5, ctx.num('rate', 1)))
      const pitch = ctx.num('pitch', 0)
      const breathRaw = ctx.str('breath', 'between')
      const breath = (BREATHS.has(breathRaw) ? breathRaw : 'between') as 'between' | 'all' | 'none'
      performLine(ctx.nodeId, {
        kind: 'speak',
        text,
        rate,
        hz: pitch > 0 ? Math.min(400, Math.max(40, pitch)) : undefined,
        breath,
      })
    }
  }

  const out = new Map<string, unknown>()
  writeVoiceOutputs(out, readSinger(ctx.nodeId))
  return out
}

export default defineNode({ definition, executor })
