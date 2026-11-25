import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { routeSinger, configureSinger, performLine, stopLine, readSinger, type MelodyFit } from './singerManager'
import {
  MOUTH_OUTPUTS,
  LINE_OUTPUTS,
  NOTE_LENGTH_OPTIONS,
  voiceControls,
  mixControls,
  resolveSingerConfig,
  writeVoiceOutputs,
  parseMelody,
  IMPROV_SCALES,
} from './voiceNodeShared'

const DEFAULT_VOICE = 'pop-female'

const definition: NodeDefinition = {
  id: 'bellows-singer',
  name: 'Bellows Singer',
  version: '1.0.0',
  category: 'audio',
  description: 'Sings lyrics on a melody with a physical model of a human voice, in 31 English accents (bellows-voice)',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'lyrics', type: 'string', label: 'Lyrics' },
    { id: 'notes', type: 'data', label: 'Melody' },
    { id: 'trigger', type: 'trigger', label: 'Sing' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
  ],
  // Like every bellows voice, heard only through its Audio out (see bellowsManager routeChannel).
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }, ...LINE_OUTPUTS, ...MOUTH_OUTPUTS],
  controls: [
    ...voiceControls(DEFAULT_VOICE),
    { id: 'lyrics', type: 'text', label: 'Lyrics', default: 'twinkle twinkle little star', props: { placeholder: 'twin-kle twin-kle lit-tle star' } },
    { id: 'notes', type: 'text', label: 'Melody', default: 'C4 C4 G4 G4 A4 A4 G4:2', props: { placeholder: 'C4 E4 G4:2 - A4 (":2" = 2 beats, "-" = rest)' } },
    {
      id: 'melodyMode', type: 'select', label: 'Melody', default: 'loop',
      props: { options: [
        { value: 'loop', label: 'Loop it to fit the words' },
        { value: 'fixed', label: 'As written (extra words are dropped)' },
        { value: 'improvise', label: 'Make up a melody for any words' },
      ] },
      description: 'Loop repeats the melody when there are more words than notes; Make Up writes a new tune for whatever text arrives.',
    },
    { id: 'improvKey', type: 'select', label: 'Key', default: 'C', when: { melodyMode: 'improvise' }, props: { options: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] } },
    { id: 'improvScale', type: 'select', label: 'Scale', default: 'major', when: { melodyMode: 'improvise' }, props: { options: Object.keys(IMPROV_SCALES) } },
    { id: 'improvOctave', type: 'number', label: 'Octave', default: 4, when: { melodyMode: 'improvise' }, props: { min: 2, max: 6, step: 1 } },
    { id: 'noteLength', type: 'select', label: 'Note Length', default: 1, props: { options: NOTE_LENGTH_OPTIONS } },
    { id: 'bpm', type: 'number', label: 'Tempo (BPM)', default: 100, props: { min: 20, max: 400, step: 1 } },
    ...mixControls(),
  ],
  info: {
    overview:
      'An articulatory singing voice: lyrics move a model of the jaw, tongue, lips and soft palate, and air from the lungs flows through that shape — so it actually sings the words, on your melody, in any of 31 English accents. Pick a starter voice (soprano, tenor, pop, rock…), type lyrics and a melody (or wire them in), and pulse Sing. Each note’s vowel lands on its beat. The mouth outputs report what the voice is doing as you hear it — wire Jaw or Lip Opening into a shader or a 3D face to lip-sync visuals.',
    tips: [
      'One note per syllable: split words with hyphens (“twin-kle”), hold a vowel across notes with “~”, and end a phrase with punctuation or a rest.',
      'More words than notes? Melody “Loop” repeats the tune until every word is sung; “Make up a melody” ignores the Melody and writes one for whatever text comes in (great with Speech to Text or an LLM).',
      'Melody accepts note names or MIDI numbers: “C4 E4 G4:2 - A4” (“:2” = two beats, “-” = rest), or an array from a sequencer / Melody Walk.',
      'Write IPA between slashes for exact pronunciation: /ˈhɛ.loʊ/.',
      'Sing again while a line is still going and the new line starts when the current one ends; Stop cuts it off.',
      'Done fires when the line finishes — chain it into the next node’s trigger for call-and-response.',
      'Up to 8 voices can report mouth outputs at once; switch Mouth Outputs off on voices you only need to hear.',
    ],
    pairsWith: ['bellows-speak', 'melody-walk', 'progression', 'shader', 'metronome'],
  },
  tags: ['bellows', 'voice', 'sing', 'singing', 'vocal', 'lyrics', 'accent', 'lip-sync', 'articulator'],
}

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const cfg = resolveSingerConfig(ctx.controls, DEFAULT_VOICE)
  const wired = !!ctx.connectedOutputs?.has('audio')
  cfg.send = 0 // sound only down the wire (the shared reverb bus returns into master)
  configureSinger(ctx.nodeId, cfg)

  if (ctx.trig('stop')) stopLine(ctx.nodeId, cfg)
  if (ctx.trig('trigger')) {
    const lyrics = ctx.str('lyrics', '').trim()
    const rawNotes = ctx.inputs.get('notes') ?? ctx.controls.get('notes')
    const notes = parseMelody(rawNotes, ctx.num('noteLength', 1), ctx.num('bpm', 100))
    const mode = ctx.str('melodyMode', 'loop') as MelodyFit['mode']
    const keyIdx = Math.max(0, KEYS.indexOf(ctx.str('improvKey', 'C')))
    const fit: MelodyFit = {
      mode: mode === 'fixed' || mode === 'improvise' ? mode : 'loop',
      root: (Math.round(ctx.num('improvOctave', 4)) + 1) * 12 + keyIdx,
      scale: ctx.str('improvScale', 'major'),
      bpm: ctx.num('bpm', 100),
      beat: ctx.num('noteLength', 1),
    }
    if (lyrics && (notes.length > 0 || fit.mode === 'improvise')) performLine(ctx.nodeId, { kind: 'sing', lyrics, notes, fit })
  }

  const out = new Map<string, unknown>()
  writeVoiceOutputs(out, readSinger(ctx.nodeId))
  out.set('audio', routeSinger(ctx.nodeId, wired))
  return out
}

export default defineNode({ definition, executor })
